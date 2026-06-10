// packages/crm/src/lib/agents/voice/greeting.ts
//
// Friendly inbound-call greeting for missed-call-text-back.
//
// 2026-06-10 — When a workspace has the missed-call-text-back agent
// DEPLOYED, the Twilio voice webhook ANSWERS the call with a short branded
// message and fires the text-back immediately, instead of returning empty
// TwiML and depending on Twilio later classifying the call as
// no-answer/busy/failed.
//
// Why: the empty-TwiML + "wait for a missed CallStatus" path is
// non-deterministic for a directly-dialed number — Twilio sometimes
// reports the call differently, the run never fires, and the caller hears
// the carrier's "your call cannot be completed as dialed." Answering on the
// initial voice-URL hit is deterministic (the hit always happens) and lets
// us play a real message. The call then ends "completed", so the status
// callback does NOT double-emit (see the route's guard).
//
// These three helpers are pure so the behavior is unit-testable without a
// running webhook or DB.

/** True when the missed-call agent is live for the workspace (deployed and
 *  not paused). Mirrors the dispatcher's deployed-agent check. */
export function shouldGreetOnInbound(
  deployedAt: string | null | undefined,
  pausedAt: string | null | undefined,
): boolean {
  return Boolean(deployedAt) && !pausedAt;
}

/** Branded one-line greeting spoken to the caller before we text them.
 *  Falls back to a generic line when the workspace has no business name. */
export function buildVoiceGreeting(businessName: string | null | undefined): string {
  const name = (businessName ?? "").trim();
  const who = name.length > 0 ? name : "us";
  return `Thanks for calling ${who}! We just sent you a text with a link to book in seconds. Talk soon!`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** TwiML that speaks the greeting then hangs up. The call ends "completed",
 *  which is intentional — the route's status-callback path treats a
 *  greeted call as already-handled so it never double-fires the text. */
export function buildGreetingTwiml(greeting: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${escapeXml(greeting)}</Say><Hangup/></Response>`;
}
