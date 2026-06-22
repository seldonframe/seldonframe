// packages/crm/src/lib/telephony/provision-voice-number.ts
//
// Idempotent state machine for provisioning a Twilio voice number into a
// builder's account and attaching it to their Elastic SIP Trunk (→ OpenAI).
//
// State is derived entirely from the `deployments` row:
//   NONE      → no phoneNumberSid: search → buy → persist sid → attach → active
//   PURCHASED → has phoneNumberSid but not active: skip buy → attach → active
//   DONE      → status === 'active' AND has phoneNumberSid: no-op
//
// All external calls (Twilio + DB) are behind DI so unit tests run with zero
// network or DB access.
//
// Error taxonomy (typed union):
//   deployment_not_found    — the deployment id doesn't exist
//   no_numbers_available    — search returned 0 candidates
//   provisioning_unavailable — Twilio buy declined (e.g. insufficient funds)
//   attach_failed           — trunk attach threw; sid is persisted → retry resumes
//
// Mirrors the DI + result-union pattern from lib/deployments/store.ts.

import type { TwilioTelephonyClient } from "./twilio-client";
import type { Deployment } from "@/db/schema/deployments";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProvisionError =
  | "deployment_not_found"
  | "no_numbers_available"
  | "provisioning_unavailable"
  | "attach_failed";

export type ProvisionVoiceNumberResult =
  | { ok: true; phoneNumber: string }
  | { ok: false; error: ProvisionError };

export type ProvisionVoiceNumberDeps = {
  client: TwilioTelephonyClient;
  loadDeployment: (id: string) => Promise<Deployment | null>;
  updateDeployment: (id: string, patch: Record<string, unknown>) => Promise<Deployment | null>;
  /** Optional override for the Twilio FriendlyName. Defaults to deployment clientName. */
  friendlyName?: (deployment: Deployment) => string;
  /** When set, the provisioned number's inbound SMS webhook is pointed here
   *  (after the trunk attach) so the number answers calls + texts, both routed
   *  to SeldonFrame. Absent → voice-only (unchanged behavior). Best-effort. */
  smsUrl?: string;
};

export type ProvisionVoiceNumberInput = {
  deploymentId: string;
  areaCode: string;
  trunkSid?: string; // if not provided, caller is expected to have set it on deps
};

// ─── State machine ────────────────────────────────────────────────────────────

/**
 * Provision a voice phone number for a deployment.
 *
 * The state machine is idempotent:
 *  - If the deployment is already active with a phoneNumberSid → no-op.
 *  - If the deployment has a phoneNumberSid but is not active → skip buy, resume at attach.
 *  - Otherwise → search → buy → persist sid → attach → mark active.
 *
 * The sid is persisted BEFORE the attach call so that a transient attach
 * failure leaves the row in the PURCHASED state and the next call resumes at
 * attach rather than buying a duplicate number.
 */
export async function provisionVoiceNumber(
  deps: ProvisionVoiceNumberDeps,
  input: ProvisionVoiceNumberInput & { trunkSid?: string },
): Promise<ProvisionVoiceNumberResult> {
  const deployment = await deps.loadDeployment(input.deploymentId);
  if (!deployment) {
    return { ok: false, error: "deployment_not_found" };
  }

  const friendlyName = deps.friendlyName
    ? deps.friendlyName(deployment)
    : deployment.clientName;

  // ── DONE state: already active with a sid ────────────────────────────────
  if (deployment.status === "active" && deployment.phoneNumberSid) {
    return { ok: true, phoneNumber: deployment.phoneNumber ?? "" };
  }

  let phoneNumber = deployment.phoneNumber ?? "";
  let phoneNumberSid = deployment.phoneNumberSid ?? "";

  // ── PURCHASED state: sid exists but not yet attached ─────────────────────
  const isPurchased = Boolean(phoneNumberSid);

  if (!isPurchased) {
    // ── NONE state: search + buy ──────────────────────────────────────────
    const candidates = await deps.client.searchLocalVoiceNumbers({
      areaCode: input.areaCode,
      limit: 5,
    });

    if (candidates.length === 0) {
      return { ok: false, error: "no_numbers_available" };
    }

    const candidate = candidates[0]!;

    let bought: { sid: string; phoneNumber: string };
    try {
      bought = await deps.client.buyNumber({
        phoneNumber: candidate,
        friendlyName,
      });
    } catch (err) {
      // Map buy errors to provisioning_unavailable (insufficient funds, etc.)
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("21452") || // insufficient funds
        msg.includes("21615") || // number unavailable
        msg.includes("21421")    // invalid phone number
      ) {
        return { ok: false, error: "provisioning_unavailable" };
      }
      return { ok: false, error: "provisioning_unavailable" };
    }

    phoneNumber = bought.phoneNumber;
    phoneNumberSid = bought.sid;

    // ─ Persist the sid BEFORE attach for durability ─────────────────────
    // If attach fails, the row is left in the PURCHASED state and a retry
    // can resume at attach without buying a second number.
    await deps.updateDeployment(deployment.id, {
      phoneNumber,
      phoneNumberSid,
      numberOrigin: "provisioned",
    });
  }

  // ── Attach to trunk ────────────────────────────────────────────────────
  const trunkSid =
    input.trunkSid ??
    // trunkSid is not on the deployment row — the caller must supply it.
    // (Pulled from resolveBuilderTelephony in the action layer.)
    undefined;

  if (!trunkSid) {
    // No trunk SID: leave in PURCHASED state so caller can supply one on retry.
    return { ok: false, error: "attach_failed" };
  }

  try {
    await deps.client.attachNumberToTrunk({ trunkSid, phoneNumberSid });
  } catch {
    // Attach failed — leave row with sid persisted (PURCHASED state) for retry.
    return { ok: false, error: "attach_failed" };
  }

  // ── Multi-surface number: point the inbound SMS webhook at SeldonFrame ────
  // Voice is now live (trunk attached); also wire SMS so the SAME number
  // answers texts → /api/webhooks/twilio/sms (which routes to the client org's
  // agent). Idempotent + STRICTLY BEST-EFFORT: a failure here must NOT block
  // voice provisioning (the deployment still goes active and answers calls).
  if (deps.smsUrl && deps.client.configureSmsUrl) {
    try {
      await deps.client.configureSmsUrl({ phoneNumberSid, smsUrl: deps.smsUrl });
    } catch (err) {
      console.error(
        `[provision-voice-number] sms_webhook_config_failed deploymentId=${deployment.id} sid=${phoneNumberSid} err=${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // ── Mark active ────────────────────────────────────────────────────────
  await deps.updateDeployment(deployment.id, { status: "active" });

  return { ok: true, phoneNumber };
}
