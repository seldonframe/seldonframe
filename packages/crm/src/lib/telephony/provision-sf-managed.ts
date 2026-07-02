// packages/crm/src/lib/telephony/provision-sf-managed.ts
//
// SF-managed (Tier-0) number provisioning — spec 2026-07-01-voice-deploy-
// metered-billing §3, Task 6. Orchestrates the whole rent-before-buy pipeline
// for a deployment that wants a SeldonFrame-owned phone number instead of BYO
// Twilio:
//
//   (0) not_configured guard  — SF_VOICE_MANAGED off, or no master Twilio
//       creds → bail with ZERO side effects.
//   (1) RENT FIRST            — debitNumberRent for this UTC month. Refused →
//       buy NOTHING (zero Twilio calls). This is the ironclad money rule: a
//       failed provision must cost the builder nothing extra, and a
//       duplicate-ok (already charged this month) must never re-charge.
//   (2) ensureBuilderSubaccount — the builder's Twilio SUBACCOUNT (Task 5).
//   (3) ensureSubaccountTrunk   — that subaccount's Elastic SIP Trunk (Task 5).
//   (4) the EXISTING provisionVoiceNumber state machine (Phase 0/1), run on a
//       client built from the SUBACCOUNT's own creds + that subaccount's
//       trunkSid, persisting numberOrigin: "sf_managed" (the origin value is
//       threaded through provisionVoiceNumber as a parameter that defaults to
//       "provisioned" — every existing BYO caller is byte-for-byte untouched).
//
// A Twilio-side failure at (2) or (3) returns `twilio_error` and the rent row
// STAYS — the month is already paid, and a later retry re-runs debitNumberRent
// which comes back duplicate-ok (idempotent on `rent:<deploymentId>:<monthKey>`)
// and proceeds without a second charge.
//
// CONCURRENCY: this function is the serialized call site for SF-managed
// provisioning — it runs once per deployment (the deploy flow calls it
// directly, never in parallel for the same deployment), which naturally
// single-flights ensureBuilderSubaccount for a given builder org.
//
// All I/O is behind DI (ProvisionSfManagedDeps) so the orchestration is unit
// tested with fakes (tests/unit/telephony/provision-sf-managed.spec.ts) — zero
// network, zero DB. buildDefaultProvisionSfManagedDeps() wires the real
// wallet store + sf-managed.ts + provisionVoiceNumber for production callers.

import type { Deployment } from "@/db/schema/deployments";
import {
  numberRentMicros,
  rentMonthKey,
  voiceManagedEnabled,
} from "./voice-metering";
import {
  buildSfManagedDeps,
  ensureBuilderSubaccount as ensureBuilderSubaccountReal,
  ensureSubaccountTrunk as ensureSubaccountTrunkReal,
  resolveMasterTwilio,
} from "./sf-managed";
import { createTwilioTelephonyClient } from "./twilio-client";
import { provisionVoiceNumber, type ProvisionError } from "./provision-voice-number";
import {
  debitNumberRent as debitNumberRentReal,
  resolveWalletStripeMode,
} from "@/lib/build/wallet-store";
import { getDeployment, updateDeployment } from "@/lib/deployments/store";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProvisionSfManagedError =
  | "not_configured"
  | "insufficient_balance"
  | "twilio_error"
  // Task 10, Controller-assigned A (T6 review): the state machine's search
  // returning zero candidates for the requested area code is a DISTINCT,
  // actionable failure (try a different area code) from a generic Twilio API
  // error — collapsing it to "twilio_error" hid that distinction from every
  // caller (runDeploy's Tier-0 fallback included).
  | "no_numbers_available";

export type ProvisionSfManagedResult =
  | { ok: true; phoneNumber: string }
  | { ok: false; error: ProvisionSfManagedError };

export type ProvisionSfManagedInput = {
  deployment: Deployment;
  areaCode: string;
};

/** The seam a fake for the state machine call in unit tests implements — the
 *  same shape provisionVoiceNumber's own call signature narrows to for THIS
 *  caller (client + trunkSid + the deployment fields + numberOrigin). */
type RunStateMachineArgs = {
  client: ReturnType<typeof createTwilioTelephonyClient>;
  trunkSid: string;
  deploymentId: string;
  areaCode: string;
  numberOrigin: string;
};

export type ProvisionSfManagedDeps = {
  env: Record<string, string | undefined>;
  now: () => Date;
  debitNumberRent: (args: {
    orgId: string;
    deploymentId: string;
    monthKey: string;
    amountMicros: number;
  }) => Promise<
    | { ok: true; balanceMicros: number; applied: boolean; duplicate: boolean }
    | { ok: false; reason: "insufficient" | "invalid" }
  >;
  ensureBuilderSubaccount: (
    orgId: string,
  ) => Promise<
    | { ok: true; subaccountSid: string; authToken: string }
    | { ok: false; error: "not_configured" | "twilio_error" }
  >;
  ensureSubaccountTrunk: (subCreds: {
    subaccountSid: string;
    authToken: string;
  }) => Promise<{ ok: true; trunkSid: string } | { ok: false; error: "not_configured" | "twilio_error" }>;
  runStateMachine: (args: RunStateMachineArgs) => Promise<ProvisionSfManagedResult>;
};

// ─── Orchestration ────────────────────────────────────────────────────────────

/**
 * Provision an SF-managed (Tier-0) number for a deployment. Rent-before-buy:
 * charges this month's number rent FIRST, and only on success proceeds to
 * ensure the builder's Twilio subaccount + trunk, then runs the existing
 * provisionVoiceNumber state machine against them.
 *
 * Money-safety invariants (see the money-rule tests):
 *   - `insufficient_balance` ⇒ ZERO Twilio-side calls (nothing bought).
 *   - A duplicate-ok rent debit (already charged this UTC month) proceeds
 *     through the rest of the pipeline exactly once more — it does NOT
 *     re-charge (the wallet store's own idempotency on
 *     `rent:<deploymentId>:<monthKey>` is what returns duplicate-ok; this
 *     orchestrator always calls debitNumberRent and trusts that result).
 *   - A Twilio-side failure (subaccount/trunk) returns `twilio_error` and the
 *     already-paid rent row is left alone — a retry's debitNumberRent call
 *     comes back duplicate-ok and resumes without a second charge.
 */
export async function provisionSfManagedNumber(
  input: ProvisionSfManagedInput,
  deps: ProvisionSfManagedDeps,
): Promise<ProvisionSfManagedResult> {
  // (0) not_configured guard — zero side effects.
  if (!voiceManagedEnabled(deps.env) || !resolveMasterTwilio(deps.env)) {
    return { ok: false, error: "not_configured" };
  }

  const { deployment, areaCode } = input;
  const orgId = deployment.builderOrgId;

  // (1) RENT FIRST. Refused ⇒ buy nothing.
  const monthKey = rentMonthKey(deps.now());
  const rent = await deps.debitNumberRent({
    orgId,
    deploymentId: deployment.id,
    monthKey,
    amountMicros: numberRentMicros(deps.env),
  });
  if (!rent.ok) {
    return { ok: false, error: "insufficient_balance" };
  }
  // rent.ok — either freshly applied or a duplicate-ok (already charged this
  // month). Either way the month is paid; proceed.

  // (2) The builder's Twilio subaccount.
  const subaccount = await deps.ensureBuilderSubaccount(orgId);
  if (!subaccount.ok) {
    // Rent stays charged — the month is paid. A later retry's debitNumberRent
    // comes back duplicate-ok and resumes here without a second charge.
    return { ok: false, error: "twilio_error" };
  }

  // (3) That subaccount's Elastic SIP Trunk.
  const trunk = await deps.ensureSubaccountTrunk({
    subaccountSid: subaccount.subaccountSid,
    authToken: subaccount.authToken,
  });
  if (!trunk.ok) {
    // Same rationale as (2) — rent stays; retry resumes as duplicate-ok.
    return { ok: false, error: "twilio_error" };
  }

  // (4) The existing state machine, on a client built from the SUBACCOUNT's
  // own creds + that subaccount's trunk, persisting numberOrigin: sf_managed.
  const client = createTwilioTelephonyClient({
    accountSid: subaccount.subaccountSid,
    authToken: subaccount.authToken,
  });

  return deps.runStateMachine({
    client,
    trunkSid: trunk.trunkSid,
    deploymentId: deployment.id,
    areaCode,
    numberOrigin: "sf_managed",
  });
}

// ─── mapProvisionErrorToSfManagedError (PURE) ────────────────────────────────

/**
 * Task 10, Controller-assigned A (T6 review) — the state-machine → SF-managed
 * error mapping, extracted to a pure function so the collapse behavior is
 * unit-testable without a live DB/Twilio client (runStateMachine's closure
 * below bakes in the real store, which a unit test can't easily fake at that
 * exact call site).
 *
 * `no_numbers_available` (the area-code search returned zero candidates) now
 * passes through AS-IS — it's a distinct, actionable failure ("try a
 * different area code"), not a generic Twilio API error. Every OTHER
 * provisionVoiceNumber failure (deployment_not_found / provisioning_
 * unavailable / attach_failed) still collapses to `twilio_error`, unchanged:
 * from the SF-managed caller's perspective those all mean "couldn't finish
 * acquiring the number" and none of them are actionable the way an empty
 * search result is.
 */
export function mapProvisionErrorToSfManagedError(error: ProvisionError): ProvisionSfManagedError {
  if (error === "no_numbers_available") return "no_numbers_available";
  return "twilio_error";
}

// ─── Real-deps builder (production wiring) ───────────────────────────────────

/**
 * Wires the real wallet store, sf-managed.ts, and provisionVoiceNumber for
 * production callers (the deploy flow). `env` defaults to process.env; pass
 * an override only in tests that want to exercise this builder directly
 * (unit tests otherwise construct ProvisionSfManagedDeps by hand — see
 * provision-sf-managed.spec.ts).
 *
 * stripeMode (Task 10, Controller-assigned B — the activation blocker):
 * resolveWalletStripeMode(env) is the SAME key-derived resolver the top-up
 * credit path uses, so this month's rent debits the wallet a top-up actually
 * funded instead of always draining the default "test" wallet while a live
 * top-up credits "live".
 */
export function buildDefaultProvisionSfManagedDeps(
  env: Record<string, string | undefined> = process.env,
): ProvisionSfManagedDeps {
  const sfManagedDeps = buildSfManagedDeps(env);
  const appBaseUrl = env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
  const stripeMode = resolveWalletStripeMode(env);

  return {
    env,
    now: () => new Date(),
    debitNumberRent: (args) => debitNumberRentReal({ ...args, stripeMode }),
    ensureBuilderSubaccount: (orgId) => ensureBuilderSubaccountReal(orgId, sfManagedDeps),
    ensureSubaccountTrunk: (subCreds) => ensureSubaccountTrunkReal(subCreds, sfManagedDeps),
    runStateMachine: async ({ client, trunkSid, deploymentId, areaCode, numberOrigin }) => {
      const result = await provisionVoiceNumber(
        {
          client,
          loadDeployment: (id) => getDeployment(id),
          updateDeployment: async (id, patch) => {
            const res = await updateDeployment({ id, patch });
            return res.ok ? res.deployment : null;
          },
          friendlyName: (d) => d.clientName,
          smsUrl: `${appBaseUrl}/api/webhooks/twilio/sms`,
        },
        { deploymentId, areaCode, trunkSid, numberOrigin },
      );
      if (result.ok) return result;
      // provisionVoiceNumber's own error taxonomy (deployment_not_found /
      // no_numbers_available / provisioning_unavailable / attach_failed) is
      // richer than ProvisionSfManagedResult's; mapProvisionErrorToSfManagedError
      // (above) now passes no_numbers_available through and collapses every
      // other reason to twilio_error. The detailed reason is still logged so
      // it isn't lost for debugging either way.
      console.warn("[provision-sf-managed] state_machine_failed", {
        deploymentId,
        error: result.error,
      });
      return { ok: false, error: mapProvisionErrorToSfManagedError(result.error) };
    },
  };
}
