// /api/cron/voice-rent — the monthly SF-managed (Tier 0) number rent sweep
// (spec 2026-07-01-voice-deploy-metered-billing, Task 7).
//
// Once a month (vercel.json: "0 6 1 * *" — the 1st, 06:00 UTC) this:
//   1. Lists every ACTIVE sf_managed deployment (listSfManagedDeploymentsForRent).
//   2. Runs the PURE planMonthlyRent (rent-planner.ts) to split them into
//      `charge` (attempt this month's rent) and `release` (30+ days
//      delinquent — give the number back instead).
//   3. For `charge`: debitNumberRent (idempotent on rent:<deploymentId>:<monthKey>
//      — see rent-planner.ts's header comment for why there's no separate
//      "already provisioned this month" skip list). Paid OR duplicate (already
//      charged) → if the deployment carried a delinquency marker, clear it +
//      reactivate the subaccount (a rent-caused suspension self-heals the
//      moment rent clears, without waiting for a top-up). Insufficient →
//      suspend the subaccount + stamp the marker (only if unset — never resets
//      an existing marker's clock).
//   4. For `release`: R2 (no session in a cron, so cancelDeploymentAction can't
//      be called) — mirrors its sf_managed release branch at the store level:
//      resolve the org's persisted subaccount creds, best-effort releaseNumber,
//      then patch the deployment to the SAME end-state cancelDeploymentAction
//      produces (`status: 'canceled', phoneNumber: null, phoneNumberSid: null`).
//
// Idempotent + safe to re-run at any point in the month: a repeat charge
// no-ops via the ledger; a repeat release finds status already 'canceled'
// (not 'active') and is filtered out by listSfManagedDeploymentsForRent on
// its NEXT run before this cron even sees it again.
//
// Per-deployment try/catch — one failure must never abort the sweep.
//
// Auth: copied VERBATIM from /api/cron/automations (Bearer <CRON_SECRET> OR
// x-cron-secret header; open when CRON_SECRET is unset).

import { NextResponse } from "next/server";
import { rentMonthKey, numberRentMicros, voiceManagedEnabled } from "@/lib/telephony/voice-metering";
import { planMonthlyRent } from "@/lib/telephony/rent-planner";
import { listSfManagedDeploymentsForRent, getDeployment, updateDeployment } from "@/lib/deployments/store";
import { debitNumberRent, resolveWalletStripeMode } from "@/lib/build/wallet-store";
import {
  suspendBuilderSubaccount,
  reactivateBuilderSubaccount,
  ensureBuilderSubaccount,
  buildSfManagedDeps,
} from "@/lib/telephony/sf-managed";
import { createTwilioTelephonyClient } from "@/lib/telephony/twilio-client";
import { setDelinquentSince, clearDelinquentSince } from "@/lib/telephony/delinquency";

export const runtime = "nodejs";

// Verbatim copy of automations/route.ts:7-14 per the brief.
function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${configuredSecret}`) {
    return true;
  }

  const cronHeader = request.headers.get("x-cron-secret");
  return cronHeader === configuredSecret;
}

/**
 * R2: release a deployment's number at the STORE level (no session available
 * in a cron, so cancelDeploymentAction — which is cookie/session-authed via
 * getOrgId — cannot be called here). Mirrors its sf_managed branch
 * (src/lib/deployments/actions.ts ~756-812) exactly: resolve the org's
 * ALREADY-PERSISTED subaccount creds via ensureBuilderSubaccount's zero-Twilio-
 * call fast path, best-effort releaseNumber, then patch the deployment to the
 * SAME end-state the action produces. Best-effort: any Twilio failure (already
 * released / creds gone / network) is logged and swallowed — the deployment is
 * canceled in OUR db regardless, exactly like the action's own comment on why
 * phoneNumber/phoneNumberSid are ALWAYS freed on cancel (the partial unique
 * index on phone_number would otherwise permanently lock the number from
 * reuse).
 */
async function releaseSfManagedDeployment(deploymentId: string, orgId: string): Promise<void> {
  const existing = await getDeployment(deploymentId);
  if (existing?.phoneNumberSid) {
    try {
      const subaccount = await ensureBuilderSubaccount(orgId, buildSfManagedDeps());
      if (subaccount.ok) {
        const client = createTwilioTelephonyClient({
          accountSid: subaccount.subaccountSid,
          authToken: subaccount.authToken,
        });
        await client.releaseNumber({ phoneNumberSid: existing.phoneNumberSid });
      } else {
        console.warn("[cron.voice-rent] skipping release — subaccount unresolved", {
          deploymentId,
          error: subaccount.error,
        });
      }
    } catch (err) {
      console.warn("[cron.voice-rent] release failed (continuing)", {
        deploymentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await updateDeployment({
    id: deploymentId,
    patch: { status: "canceled", phoneNumber: null, phoneNumberSid: null },
  });
}

async function run() {
  const startedAt = Date.now();
  const env = process.env;

  if (!voiceManagedEnabled(env)) {
    return { skipped: true, reason: "voice_managed_disabled" };
  }

  const now = new Date();
  const monthKey = rentMonthKey(now);
  const amountMicros = numberRentMicros(env);
  // Task 10, Controller-assigned B (activation blocker): drain the SAME
  // wallet a top-up actually credits (key-derived — mirrors the credit path)
  // instead of always draining the default "test" wallet.
  const stripeMode = resolveWalletStripeMode(env);

  const deployments = await listSfManagedDeploymentsForRent();
  const plan = planMonthlyRent({ monthKey, deployments, now });
  // listSfManagedDeploymentsForRent already carries each deployment's
  // delinquentSince marker — reuse it instead of re-querying per charge item.
  const delinquentSinceById = new Map(deployments.map((d) => [d.deploymentId, d.delinquentSince]));

  let charged = 0;
  let suspended = 0;
  let reactivated = 0;
  let released = 0;
  const errors: Array<{ deploymentId: string; orgId: string; stage: "charge" | "release"; error: string }> = [];

  for (const item of plan.charge) {
    try {
      const wasDelinquent = Boolean(delinquentSinceById.get(item.deploymentId));

      const result = await debitNumberRent({
        orgId: item.orgId,
        deploymentId: item.deploymentId,
        monthKey,
        amountMicros,
        stripeMode,
      });

      if (result.ok) {
        charged += 1;
        if (wasDelinquent) {
          await clearDelinquentSince(item.deploymentId);
          await reactivateBuilderSubaccount(item.orgId, buildSfManagedDeps());
          reactivated += 1;
        }
      } else {
        // insufficient — suspend + stamp (only if unset, so a repeat
        // shortfall never resets the 30-day release clock).
        await suspendBuilderSubaccount(item.orgId, buildSfManagedDeps());
        suspended += 1;
        if (!wasDelinquent) {
          await setDelinquentSince(item.deploymentId, now);
        }
      }
    } catch (err) {
      errors.push({
        deploymentId: item.deploymentId,
        orgId: item.orgId,
        stage: "charge",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const item of plan.release) {
    try {
      await releaseSfManagedDeployment(item.deploymentId, item.orgId);
      released += 1;
    } catch (err) {
      errors.push({
        deploymentId: item.deploymentId,
        orgId: item.orgId,
        stage: "release",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    ok: true,
    tickMs: Date.now() - startedAt,
    monthKey,
    scanned: deployments.length,
    charged,
    suspended,
    reactivated,
    released,
    errors,
  };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await run());
}
