"use server";

// Tier-2 voice-deploy metered billing (spec 2026-07-01 §5, Task 9) — the
// buyer/builder-facing "Connect your OpenAI voice project" wizard action.
//
// This is the ONLY caller that wires Task 8's `setOrgOpenAiVoice` setter (it
// shipped uncalled). The org pastes 3 things off their own OpenAI dashboard
// (Settings→General's `project_id`, a freshly-registered webhook's `whsec_`,
// and an API key) — we validate the shapes, persist them encrypted, then
// best-effort point the org's OWN BYO-Twilio trunk at their OpenAI project's
// SIP endpoint so inbound calls on their existing number route there too.
//
// Org-scoped like `activateDeploymentAction` / `provisionDeploymentNumberAction`
// (src/lib/deployments/actions.ts) — `getOrgId()` + `assertWritable()` — NOT
// deployment-scoped like the buyer wizard's `loadOwnedDeployment` actions,
// because this writes `organizations.integrations.openaiVoice`, an org-level
// setting independent of any one deployment (per openai-voice-store.ts).
//
// Trunk-pointing is BEST-EFFORT and must never fail the whole connect: the
// design doc is explicit that Tier 2 "requires BYO Twilio" to be USEFUL
// (inbound calls need a number+trunk to reach the OpenAI SIP endpoint), but
// the credential-storage half of Tier 2 (this action's main job) is valid
// and worth saving even for an org that hasn't connected Twilio yet, or whose
// Twilio call happens to fail — they can retry the trunk step later without
// re-entering their OpenAI credentials. Mirrors the "fail-soft, never crash
// the caller" stance every Twilio-touching function in sf-managed.ts takes.
//
// "use server" contract: this file exports ONLY the one async action
// (checked by scripts/check-use-server.sh). Pure validation lives inline
// (trivial enough not to warrant a separate pure-helpers module — three
// prefix/non-empty checks, no branching logic worth isolating for its own
// unit test).

import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { setOrgOpenAiVoice } from "@/lib/telephony/openai-voice-store";
import { resolveBuilderTelephony } from "@/lib/telephony/config";
import { ensureTrunkForCreds } from "@/lib/telephony/sf-managed";
import { createTwilioTelephonyClient } from "@/lib/telephony/twilio-client";

export type ConnectOpenAiVoiceInput = {
  projectId: string;
  apiKey: string;
  webhookSecret: string;
};

export type ConnectOpenAiVoiceResult =
  | {
      ok: true;
      webhookUrl: string;
      /** 'ok' = a trunk now points at this org's OpenAI project; 'skipped' =
       *  no BYO Twilio connected yet (nothing to point); 'failed' = BYO
       *  Twilio IS connected but the Twilio call errored — the credentials
       *  above are still saved; the org can retry later. Never blocks `ok`. */
      trunk: "ok" | "skipped" | "failed";
    }
  | { ok: false; error: "unauthorized" | "invalid_input" };

/** projectId must look like an OpenAI project id ("proj_..."). Trimmed first
 *  so incidental whitespace from a copy-paste never trips validation. */
function isValidProjectId(value: string): boolean {
  return value.startsWith("proj_") && value.length > "proj_".length;
}

/** webhookSecret must look like a Standard Webhooks secret ("whsec_..."). */
function isValidWebhookSecret(value: string): boolean {
  return value.startsWith("whsec_") && value.length > "whsec_".length;
}

/**
 * Persist the org's Tier-2 OpenAI voice credentials + best-effort point
 * their BYO-Twilio trunk at that project's SIP endpoint. Org-scoped
 * (`getOrgId()`); every field is trimmed before validation so a pasted value
 * with leading/trailing whitespace (common when copying out of a dashboard)
 * isn't rejected. A trunk failure never fails this action — see the
 * file-header comment.
 */
export async function connectOpenAiVoiceAction(
  input: ConnectOpenAiVoiceInput,
): Promise<ConnectOpenAiVoiceResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const projectId = (input?.projectId ?? "").trim();
  const apiKey = (input?.apiKey ?? "").trim();
  const webhookSecret = (input?.webhookSecret ?? "").trim();

  if (!isValidProjectId(projectId) || !apiKey || !isValidWebhookSecret(webhookSecret)) {
    return { ok: false, error: "invalid_input" };
  }

  await setOrgOpenAiVoice(orgId, { projectId, apiKey, webhookSecret });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.seldonframe.com";
  const webhookUrl = `${appUrl}/api/v1/voice/openai/webhook/${orgId}`;

  // Best-effort trunk pointing — see file-header comment for why this never
  // fails the action. Only attempted when the org has BYO Twilio connected
  // (resolveBuilderTelephony); Tier 2 has no SF-managed trunk to fall back to.
  const telephony = await resolveBuilderTelephony(orgId);
  if (!telephony.ok) {
    return { ok: true, webhookUrl, trunk: "skipped" };
  }

  const originationSipUri = `sip:${projectId}@sip.api.openai.com;transport=tls`;
  const result = await ensureTrunkForCreds(
    { creds: { accountSid: telephony.accountSid, authToken: telephony.authToken }, originationSipUri },
    { subClientFor: (creds) => createTwilioTelephonyClient(creds) },
  );

  return { ok: true, webhookUrl, trunk: result.ok ? "ok" : "failed" };
}
