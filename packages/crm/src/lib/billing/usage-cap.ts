// Per-sub-account usage meter (2026-07-08) — Task 3: caps + notify.
//
// Spec: docs/superpowers/specs/2026-07-08-subaccount-usage-meter-design.md (D4, D5).
//
// D4 — caps live in `organizations.settings.usageCap` (jsonb, NO migration):
//   { monthlyEstCostCentsCap, mode: "notify"|"pause", lastNotifiedPeriod?, holdingReply? }
// Edited by the AGENCY from the client card. Org-scoped: only the agency owner
// of the sub-account's parentAgencyId may set it — the SAME owner lookup
// resolveRuntimeAiClient's agency-key-inheritance seam uses
// (lib/ai/client.ts::resolveAgencyKeyOrgId / getPartnerAgencyOwner), reused
// here rather than duplicated.
//
// D5 — breach behavior: "notify" (default) emails the agency operator once
// per period (lastNotifiedPeriod guard); "pause" (Task 4, flagged) additionally
// stops inherited-key sub-accounts from making LLM calls. This module owns the
// pure breach/notify-idempotency predicate; Task 4 wires it into the runtime.

import { db } from "@/db";
import { organizations, partnerAgencies } from "@/db/schema";
import { eq } from "drizzle-orm";

export type UsageCapMode = "notify" | "pause";

export type UsageCap = {
  monthlyEstCostCentsCap: number;
  mode: UsageCapMode;
  /** The last period-key ("YYYY-MM", UTC) a breach notification was sent for.
   *  null = never notified. Guards the once-per-period email. */
  lastNotifiedPeriod: string | null;
  /** Operator-configurable holding reply for the pause path (Task 4). null =
   *  use the default copy. */
  holdingReply: string | null;
};

const VALID_MODES: UsageCapMode[] = ["notify", "pause"];

/** Tolerant parse of `organizations.settings.usageCap`. Absent, malformed, or
 *  any field of the wrong shape → null (spec default: unset = no cap). Never
 *  throws — a corrupted settings blob degrades to "no cap" rather than
 *  breaking the client card or the runtime cap check. */
export function parseUsageCap(settings: unknown): UsageCap | null {
  if (!settings || typeof settings !== "object") return null;
  const raw = (settings as Record<string, unknown>).usageCap;
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;
  const monthlyEstCostCentsCap = obj.monthlyEstCostCentsCap;
  if (typeof monthlyEstCostCentsCap !== "number" || !Number.isFinite(monthlyEstCostCentsCap) || monthlyEstCostCentsCap < 0) {
    return null;
  }

  const modeRaw = obj.mode;
  const mode: UsageCapMode = modeRaw === "pause" ? "pause" : modeRaw === "notify" || modeRaw === undefined ? "notify" : (null as never);
  if (!VALID_MODES.includes(mode)) return null;

  const lastNotifiedPeriod = typeof obj.lastNotifiedPeriod === "string" ? obj.lastNotifiedPeriod : null;
  const holdingReply = typeof obj.holdingReply === "string" ? obj.holdingReply : null;

  return { monthlyEstCostCentsCap, mode, lastNotifiedPeriod, holdingReply };
}

/** "YYYY-MM" (UTC) — the period key used for once-per-period notify
 *  idempotency. Independent of currentPeriodStartUtc's Date boundary (this is
 *  a comparable string, cheap to store in jsonb + compare). */
export function periodKeyUtc(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export type UsageCapEvaluation = {
  /** true when est. cost this period is STRICTLY OVER the cap (exactly at
   *  cap is not a breach — the cap is a ceiling, not a target). */
  breached: boolean;
  /** true when breached AND no notification has been sent for this period
   *  yet (lastNotifiedPeriod !== periodKey). False when not breached, or
   *  already notified this period, or no cap is set. */
  shouldNotify: boolean;
};

/** Pure breach + once-per-period notify-idempotency predicate. `cap: null`
 *  (unset) never breaches. */
export function evaluateUsageCap(params: {
  cap: UsageCap | null;
  estCostCents: number;
  periodKey: string;
}): UsageCapEvaluation {
  if (!params.cap) return { breached: false, shouldNotify: false };

  const breached = params.estCostCents > params.cap.monthlyEstCostCentsCap;
  if (!breached) return { breached: false, shouldNotify: false };

  const alreadyNotified = params.cap.lastNotifiedPeriod === params.periodKey;
  return { breached: true, shouldNotify: !alreadyNotified };
}

// ─── authz: only the agency owner may set a sub-account's cap ────────────

/** Injectable dependency — mirrors AgencyKeyOrgDeps in lib/ai/client.ts.
 *  Production default reads partner_agencies directly (same table, same
 *  columns the key-inheritance seam reads). */
export type PartnerAgencyOwnerLookup = (
  agencyId: string,
) => Promise<{ ownerUserId: string | null; ownerWorkspaceId: string | null } | null>;

async function defaultGetPartnerAgencyOwner(
  agencyId: string,
): Promise<{ ownerUserId: string | null; ownerWorkspaceId: string | null } | null> {
  const [row] = await db
    .select({ ownerUserId: partnerAgencies.ownerUserId, ownerWorkspaceId: partnerAgencies.ownerWorkspaceId })
    .from(partnerAgencies)
    .where(eq(partnerAgencies.id, agencyId))
    .limit(1);
  return row ?? null;
}

/** Authorize a cap-setter call: is `callerUserId` the OWNER of `agencyId`?
 *  Fail-CLOSED — any error in the lookup, agency-not-found, or a caller who
 *  isn't the owner all reject (returns false). Mirrors resolveAgencyKeyOrgId's
 *  ownerUserId-first resolution, but this is an authz gate (not a key
 *  resolution) so it deliberately does NOT fall through to
 *  ownerWorkspaceId-only agencies for a userId caller — those are managed via
 *  an admin-token session, a separate authz path this function doesn't cover. */
export async function authorizeUsageCapSetter(params: {
  callerUserId: string;
  agencyId: string;
  getPartnerAgencyOwner?: PartnerAgencyOwnerLookup;
}): Promise<boolean> {
  const lookup = params.getPartnerAgencyOwner ?? defaultGetPartnerAgencyOwner;
  try {
    const agency = await lookup(params.agencyId);
    if (!agency) return false;
    return agency.ownerUserId === params.callerUserId;
  } catch {
    return false;
  }
}

/** Read + parse the cap for a single org (the client sub-account). Returns
 *  null on any failure (org not found, corrupted settings) — fail-soft. */
export async function loadUsageCapForOrg(orgId: string): Promise<UsageCap | null> {
  try {
    const [row] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    return parseUsageCap(row?.settings);
  } catch {
    return null;
  }
}

// ─── org-scoped authz (the shape the Studio server actions actually use) ──
//
// The Studio's builder-org session resolves via getOrgId() (the operator's
// OWN org), not a bare userId — mirrored by resolveBuilderAgency(builderOrgId)
// in lib/deployments/store.ts (deploy-to-client flow's existing agency
// lookup). authorizeUsageCapSetter above is the userId-based PRIMITIVE
// (pure, unit-tested, mirrors resolveAgencyKeyOrgId's ownerUserId path);
// this wrapper adapts it to the org-based caller shape every other Studio
// action uses, so setSubAccountUsageCapAction can reuse the SAME
// resolveBuilderAgency the deploy flow already calls (never duplicated).

/** Injectable deps for authorizeUsageCapSetterForOrg — DI'd in unit tests. */
export type UsageCapOrgAuthzDeps = {
  /** Resolve the CALLER's own agency (their builder org → the agency they
   *  own). Mirrors lib/deployments/store.ts::resolveBuilderAgency. */
  resolveBuilderAgency: (builderOrgId: string) => Promise<string | null>;
  /** Resolve the TARGET client org's parentAgencyId, to confirm it's really
   *  a sub-account of the caller's agency (not just any org). */
  getOrgParentAgencyId: (orgId: string) => Promise<string | null>;
};

/** Authorize a cap-setter call from a builder-org session (the shape every
 *  Studio server action uses): the caller's OWN agency (resolved from their
 *  builderOrgId) must match the TARGET client org's parentAgencyId. Fail-
 *  CLOSED on any error or mismatch. */
export async function authorizeUsageCapSetterForOrg(params: {
  callerOrgId: string;
  targetOrgId: string;
  deps: UsageCapOrgAuthzDeps;
}): Promise<boolean> {
  try {
    const [callerAgencyId, targetParentAgencyId] = await Promise.all([
      params.deps.resolveBuilderAgency(params.callerOrgId),
      params.deps.getOrgParentAgencyId(params.targetOrgId),
    ]);
    if (!callerAgencyId || !targetParentAgencyId) return false;
    return callerAgencyId === targetParentAgencyId;
  } catch {
    return false;
  }
}

// ─── the daily cron sweep (D5 — "notify fires without anyone visiting the
// dashboard") ───────────────────────────────────────────────────────────

/** One org with a cap set, as the cron's org-enumeration query returns it —
 *  the minimal shape checkUsageCapBreaches needs per candidate. */
export type CapCandidateOrg = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  parentAgencyId: string | null;
  settings: unknown;
};

export type UsageCapSweepDeps = {
  /** Every org with settings.usageCap set (any mode) — the cron's candidate
   *  list. Filtering to "cap actually set" happens at the SQL layer (jsonb key
   *  existence) so this never has to page through every org on the platform. */
  listOrgsWithCapSet: () => Promise<CapCandidateOrg[]>;
  /** This period's estimated cost for one org (agent_conversations rollup,
   *  scoped to just that org — reuses the same query shape as
   *  getAgencyUsageRollup but for a single org id, not a whole book). */
  getEstCostCentsForOrg: (orgId: string, periodStart: Date) => Promise<number>;
  /** Resolve the agency owner's notification email. Null → skip (can't
   *  notify without an address; logged, never throws). */
  resolveAgencyOwnerEmail: (agencyId: string) => Promise<string | null>;
  /** Resolve the agency's display name for the alert copy. */
  resolveAgencyName: (agencyId: string) => Promise<string | null>;
  sendAlert: (params: {
    agencyName: string;
    clientName: string;
    clientOrgSlug: string;
    estCostCents: number;
    capCents: number;
    mode: "notify" | "pause";
    toEmail: string;
  }) => Promise<void>;
  /** Persist the updated lastNotifiedPeriod back onto the org's settings. */
  markNotified: (orgId: string, settings: Record<string, unknown>, periodKey: string) => Promise<void>;
  now: () => Date;
};

export type UsageCapSweepResult = {
  scanned: number;
  breached: number;
  notified: number;
  skipped: Array<{ orgId: string; reason: string }>;
};

/** The daily cron body: scan every org with a cap set, evaluate breach for
 *  THIS period, and send the once-per-period alert. dryRun skips
 *  sendAlert/markNotified (still computes + reports what WOULD happen) —
 *  mirrors gc-seldonchat-blobs's ?dryRun=1 shape. Never throws: a failure
 *  evaluating one org is recorded in `skipped` and the sweep continues with
 *  the rest (one bad row must never abort the whole cron). */
export async function checkUsageCapBreaches(
  deps: UsageCapSweepDeps,
  options: { dryRun?: boolean } = {},
): Promise<UsageCapSweepResult> {
  const now = deps.now();
  const periodKey = periodKeyUtc(now);
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

  const candidates = await deps.listOrgsWithCapSet();
  const skipped: Array<{ orgId: string; reason: string }> = [];
  let breachedCount = 0;
  let notifiedCount = 0;

  for (const org of candidates) {
    try {
      const cap = parseUsageCap(org.settings);
      if (!cap) {
        skipped.push({ orgId: org.orgId, reason: "no_cap_parsed" });
        continue;
      }
      if (!org.parentAgencyId) {
        skipped.push({ orgId: org.orgId, reason: "no_parent_agency" });
        continue;
      }

      const estCostCents = await deps.getEstCostCentsForOrg(org.orgId, periodStart);
      const evaluation = evaluateUsageCap({ cap, estCostCents, periodKey });
      if (!evaluation.breached) continue;
      breachedCount += 1;
      if (!evaluation.shouldNotify) continue;

      const [toEmail, agencyName] = await Promise.all([
        deps.resolveAgencyOwnerEmail(org.parentAgencyId),
        deps.resolveAgencyName(org.parentAgencyId),
      ]);
      if (!toEmail) {
        skipped.push({ orgId: org.orgId, reason: "no_owner_email" });
        continue;
      }

      if (options.dryRun) {
        notifiedCount += 1;
        continue;
      }

      await deps.sendAlert({
        agencyName: agencyName ?? "Your agency",
        clientName: org.orgName,
        clientOrgSlug: org.orgSlug,
        estCostCents,
        capCents: cap.monthlyEstCostCentsCap,
        mode: cap.mode,
        toEmail,
      });

      const settingsObj = (org.settings && typeof org.settings === "object" ? org.settings : {}) as Record<string, unknown>;
      await deps.markNotified(
        org.orgId,
        { ...settingsObj, usageCap: { ...cap, lastNotifiedPeriod: periodKey } },
        periodKey,
      );
      notifiedCount += 1;
    } catch (err) {
      skipped.push({ orgId: org.orgId, reason: err instanceof Error ? err.message : "unknown_error" });
    }
  }

  return { scanned: candidates.length, breached: breachedCount, notified: notifiedCount, skipped };
}
