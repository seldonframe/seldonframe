// Voice Round-1 — MISSED-CALL TEXT-BACK core.
//
// THE HIGHEST-ROI LEAD-LEAK PLUG. When a call to the workspace's voice number
// is NOT successfully handled by the OpenAI Realtime receptionist — it's
// missed / abandoned (no-answer, busy, failed, canceled, or the OpenAI accept
// fails so the SIP leg never engages the agent) — we automatically fire a
// speed-to-lead SMS back to the caller so the lead never reaches a competitor.
//
// ── How "missed" is detected (the signal) ──────────────────────────────────
// The OpenAI Realtime topology routes the inbound call leg straight to OpenAI's
// SIP endpoint (Twilio Elastic SIP Trunk → sip:<proj>@sip.api.openai.com). The
// realtime.call.incoming webhook (api/v1/voice/openai/webhook) accepts the call
// and holds the control WS — but Twilio is NOT hitting a TwiML voice URL in this
// flow, so the OUTCOME of the call (did anyone/anything pick up?) is surfaced
// ONLY by Twilio's call-STATUS callback. We consume that callback here:
//   - missed terminal status (no-answer / busy / failed / canceled) → the agent
//     never engaged → TEXT BACK the caller.
//   - "completed" → the call connected and the realtime agent answered; the
//     ENGAGED-call post-call SMS (runVoiceCall.onPostCallSms) already fired, so
//     we do NOT also send a missed-call text → no double-SMS. The two are
//     mutually exclusive by construction (a call is either completed OR missed).
//
// ── A2P posture ────────────────────────────────────────────────────────────
// The caller initiated the call, so the text-back is consumer-initiated
// (A2P-compliant). The SMS is sent with the workspace's own Twilio creds from
// config (organizations.integrations.twilio) via the shared sendSmsFromApi path
// — keys are NEVER hardcoded.
//
// ── Idempotency ────────────────────────────────────────────────────────────
// Twilio can deliver the same status callback more than once. We never want to
// double-text one caller for one call. Before sending we probe `alreadyTexted`
// (the route implements it as a smsMessages lookup for an outbound row tagged
// with this org + CallSid + source "missed-call-text-back"); the send itself
// writes that tag, so a re-delivery is a no-op.
//
// ── Testability ────────────────────────────────────────────────────────────
// All side effects (number→org resolution, config load, idempotency probe, SMS
// send) are injected as `deps` so the decision logic is unit-tested with no DB
// and no Twilio (see missed-call-textback.spec.ts). The route wires the real
// deps. This mirrors the DI convention used across the voice stack.

/**
 * Twilio CallStatus values that count as "missed" — the call reached the
 * workspace's number but was never successfully handled by the agent. We
 * deliberately EXCLUDE "completed" (the agent answered; the engaged-call
 * post-call SMS covers it) and all pre-terminal states (ringing/in-progress).
 *
 * Twilio documents "canceled" (one L); we also accept "cancelled" defensively.
 * https://www.twilio.com/docs/voice/api/call-resource#call-status-values
 */
export const MISSED_CALL_STATUSES = new Set([
  "no-answer",
  "busy",
  "failed",
  "canceled",
  "cancelled",
]);

/** True when a Twilio CallStatus means the call was missed/abandoned. */
export function isMissedCallStatus(status: string): boolean {
  return MISSED_CALL_STATUSES.has(status.trim().toLowerCase());
}

/**
 * Build the speed-to-lead SMS body. An operator-supplied `template` wins (with
 * {business} / {link} placeholders filled); a blank/absent template falls back
 * to the default copy so we never send an empty SMS. Kept short to avoid
 * carrier segmentation.
 */
export function buildMissedCallSmsBody(params: {
  businessName: string;
  bookUrl: string;
  template?: string | null;
}): string {
  const business = params.businessName.trim() || "us";
  const link = params.bookUrl.trim();
  const tpl = params.template?.trim();
  if (tpl) {
    return tpl.replaceAll("{business}", business).replaceAll("{link}", link);
  }
  return (
    `Hi, sorry we missed your call! This is ${business} — how can we help? ` +
    `Reply here or book at ${link}`
  );
}

/** The default missed-call copy template surfaced in the operator editor.
 *  Persisted as blueprint.missedCallTextBack.message when the operator hasn't
 *  customised it; uses the same {business}/{link} placeholders the builder fills. */
export const DEFAULT_MISSED_CALL_MESSAGE =
  "Hi, sorry we missed your call! This is {business} — how can we help? " +
  "Reply here or book at {link}";

/** Per-workspace config the route loads once the dialed number resolves to an
 *  org. `null` means "no Twilio number / not configured" → safe no-op. */
export type MissedCallVoiceConfig = {
  /** blueprint.missedCallTextBack.enabled (default ON). */
  enabled: boolean;
  /** blueprint.missedCallTextBack.message — operator copy, or null for default. */
  message: string | null;
  /** soul business name for the SMS body. */
  businessName: string;
  /** workspace slug → the {link} booking URL on its subdomain. */
  orgSlug: string;
  /** base domain for the booking URL (e.g. "app.seldonframe.com"). */
  baseDomain: string;
  /** blueprint.postCallMetaPitch — the agency's own workspace links to the
   *  brand booking URL (seldonstudio.com/book) instead of the subdomain. */
  metaPitch: boolean;
};

/** Injected side-effects. The route supplies DB- and Twilio-backed impls. */
export type MissedCallTextBackDeps = {
  /** Map the dialed E.164 number to an orgId, or null if unrecognised. */
  resolveOrgIdByNumber: (toNumber: string) => Promise<string | null>;
  /** Load this org's missed-call config, or null when no Twilio number is set. */
  loadVoiceConfig: (orgId: string) => Promise<MissedCallVoiceConfig | null>;
  /** Has an outbound missed-call SMS for this org+CallSid already been sent? */
  alreadyTexted: (orgId: string, callSid: string) => Promise<boolean>;
  /** Send the SMS (writes the dedup-tagged smsMessages row). */
  sendSms: (args: { orgId: string; toNumber: string; body: string; callSid: string }) => Promise<void>;
};

/** The Twilio status-callback fields the core needs. */
export type MissedCallEvent = {
  callSid: string;
  callStatus: string;
  /** Caller's number (Twilio `From`). "" / "anonymous" → can't text back. */
  fromNumber: string;
  /** The dialed workspace number (Twilio `To`). */
  toNumber: string;
};

/** Discriminated outcome — the route logs `reason` and always 200s. */
export type MissedCallTextBackResult =
  | { action: "sent"; orgId: string; toNumber: string }
  | {
      action: "skipped";
      reason:
        | "missing_call_sid"
        | "no_caller_number"
        | "not_missed"
        | "no_workspace"
        | "no_config"
        | "disabled"
        | "already_texted";
    }
  | { action: "error"; reason: string };

/** True for a caller number we cannot text back (anonymous / blank / no digits). */
function isUntextableCaller(raw: string): boolean {
  const v = raw.trim();
  if (!v) return true;
  if (/anonymous/i.test(v)) return true;
  // Needs at least a few digits to be a real E.164 we can send to.
  return !/\d{3,}/.test(v);
}

/**
 * Decide-and-send. Pure decision logic over injected deps; NEVER throws (the
 * Twilio status callback must always 200 so Twilio doesn't retry-storm). Order
 * of checks is cheap→expensive: validate the payload (no DB) before resolving
 * the workspace, and only load config once a workspace matched.
 */
export async function runMissedCallTextBack(
  event: MissedCallEvent,
  deps: MissedCallTextBackDeps,
): Promise<MissedCallTextBackResult> {
  try {
    // 1. Only terminal MISSED statuses fire. completed/ringing/in-progress → skip.
    if (!isMissedCallStatus(event.callStatus)) {
      return { action: "skipped", reason: "not_missed" };
    }

    // 2. Need a CallSid to dedup. Without it we could double-text on re-delivery.
    const callSid = event.callSid.trim();
    if (!callSid) {
      return { action: "skipped", reason: "missing_call_sid" };
    }

    // 3. Need a real caller number to text back. Anonymous callers no-op.
    if (isUntextableCaller(event.fromNumber)) {
      return { action: "skipped", reason: "no_caller_number" };
    }

    // 4. Resolve the workspace from the dialed number. Unknown → no-op (and we
    //    deliberately do NOT load config for an unmatched number).
    const orgId = await deps.resolveOrgIdByNumber(event.toNumber);
    if (!orgId) {
      return { action: "skipped", reason: "no_workspace" };
    }

    // 5. Load the workspace's missed-call config. null → no Twilio number set.
    const config = await deps.loadVoiceConfig(orgId);
    if (!config) {
      return { action: "skipped", reason: "no_config" };
    }

    // 6. Operator toggle. Default ON; explicit false → no-op.
    if (!config.enabled) {
      return { action: "skipped", reason: "disabled" };
    }

    // 7. Idempotency — already texted this caller for this call? no-op.
    if (await deps.alreadyTexted(orgId, callSid)) {
      return { action: "skipped", reason: "already_texted" };
    }

    // 8. Compose + send. The meta-pitch workspace links to the brand booking
    //    URL; clients link to their own subdomain /book.
    const bookUrl = config.metaPitch
      ? "https://seldonstudio.com/book"
      : `https://${config.orgSlug}.${config.baseDomain}/book`;
    const body = buildMissedCallSmsBody({
      businessName: config.businessName,
      bookUrl,
      template: config.message,
    });

    await deps.sendSms({ orgId, toNumber: event.fromNumber, body, callSid });
    return { action: "sent", orgId, toNumber: event.fromNumber };
  } catch (err) {
    // Best-effort: a send/db failure must never bubble out (the route must 200).
    return { action: "error", reason: err instanceof Error ? err.message : String(err) };
  }
}
