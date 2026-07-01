// Rent planner — the PURE decision for the monthly voice-number rent sweep
// (spec 2026-07-01-voice-deploy-metered-billing, Task 7). No DB, no Twilio, no
// wallet — this only decides WHO to charge and WHO to release this month
// given the current set of active sf_managed deployments.
//
// R1 (controller resolution, Task 7 brief): there is no `provisionMonthKey`
// field on a deployment — the brief's "skip the provision month" intent is
// instead satisfied by LEDGER IDEMPOTENCY. `provisionSfManagedNumber` already
// debits `rent:<deploymentId>:<provisionMonthKey>` via debitNumberRent at
// provision time (src/lib/build/wallet-store.ts:409-481). debitNumberRent is
// idempotent on that exact key — a repeat charge attempt for a month already
// paid returns `{ ok: true, applied: false, duplicate: true }`, which the
// cron treats identically to a fresh success (see task-6-report.md's
// WalletApplyResult note). So this planner does NOT need to know a
// deployment's provision month at all: it puts EVERY active sf_managed
// deployment into `charge` (except those it releases below), and relies on
// the ledger's own idempotency to make a same-month re-attempt (whether
// that's the provision month or any other) a harmless no-op rather than a
// double charge. This is the load-bearing assumption documented here so a
// future reader doesn't wonder why there's no skip-list.
//
// `release`: any deployment whose `delinquentSince` marker (set by this same
// cron on a prior run when rent went unpaid — see Task 6's delinquency.ts)
// is 30 OR MORE days before `now` is released instead of charged — it has had
// a full month's grace since going delinquent with no top-up, so it's time to
// give the number back. `charge` and `release` are mutually exclusive by
// construction: a deployment is in exactly one of the two lists (or neither,
// which cannot happen here since every input deployment lands in one or the
// other).

const RELEASE_GRACE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type RentPlannerDeploymentInput = {
  deploymentId: string;
  orgId: string;
  /** ISO timestamp of when this deployment first went unpaid, or null if it's
   *  current. A non-ISO / unparseable string is treated as "not delinquent"
   *  (charged, never released) — fail-soft on bad data rather than crashing
   *  the sweep or silently releasing a number that shouldn't be. */
  delinquentSince: string | null;
};

export type PlanMonthlyRentInput = {
  /** UTC "YYYY-MM" — see rentMonthKey() in voice-metering.ts. Not used for any
   *  branching here (idempotency lives in the ledger key the cron builds from
   *  it), but threaded through so the planner's input mirrors exactly what
   *  the cron has on hand and stays easy to log/trace against. */
  monthKey: string;
  deployments: RentPlannerDeploymentInput[];
  now: Date;
};

export type PlanMonthlyRentResult = {
  charge: Array<{ deploymentId: string; orgId: string }>;
  release: Array<{ deploymentId: string; orgId: string }>;
};

/** True iff `delinquentSince` parses as a valid ISO timestamp that is 30+
 *  days before `now`. Unparseable / null → false (never released on bad or
 *  absent data). */
function isReleaseDue(delinquentSince: string | null, now: Date): boolean {
  if (!delinquentSince) return false;
  const since = new Date(delinquentSince);
  if (Number.isNaN(since.getTime())) return false;
  return now.getTime() - since.getTime() >= RELEASE_GRACE_MS;
}

/**
 * Partition this month's active sf_managed deployments into `charge` (attempt
 * this month's rent debit) and `release` (30+ days delinquent — give the
 * number back instead of charging). Pure; never throws; preserves input
 * order within each list.
 */
export function planMonthlyRent(input: PlanMonthlyRentInput): PlanMonthlyRentResult {
  const charge: PlanMonthlyRentResult["charge"] = [];
  const release: PlanMonthlyRentResult["release"] = [];

  for (const dep of input.deployments) {
    const entry = { deploymentId: dep.deploymentId, orgId: dep.orgId };
    if (isReleaseDue(dep.delinquentSince, input.now)) {
      release.push(entry);
    } else {
      charge.push(entry);
    }
  }

  return { charge, release };
}
