import type { Archetype } from "./types";

// Missed-Call-Text-Back archetype. Fires on call.missed — when a
// caller hits the agency-managed Twilio number and the call goes
// unanswered (no-answer, busy, or failed). Texts the caller within
// seconds with a vertical-aware acknowledgment + qualifying prompt,
// waits a follow-up window, and logs a not-yet-replied activity if
// the caller hasn't texted back.
//
// Why this archetype is the most-requested GHL entry offer (per
// May 2026 agency Reddit research):
//   - Speed-to-text-back under 60 seconds catches the caller before
//     they dial the competitor. Lost-lead recovery is the highest-
//     ROI single action a local-service business can ship.
//   - The "qualifying SMS reply" doubles as lead capture for callers
//     who would otherwise leave a voicemail nobody listens to.
//   - Agencies sell this for $500-$1,500/month/client as a focused
//     offer (smaller than full GHL setup). Most agencies bundle the
//     SMS sequence + the operator notification + a 30-day analytics
//     review.
//
// Architectural notes:
//   - The TEXT-BACK COPY is a $soul_copy placeholder — synthesis
//     fills it from the vertical-templates skill pack at
//     packages/crm/src/lib/agents/skills/missed-call/. HVAC gets
//     emergency-aware language; dental gets insurance-pre-qual; etc.
//     The archetype harness stays vertical-agnostic; vertical
//     intelligence lives in the skill pack the LLM reads.
//   - Anonymous callers (no fromNumber, caller-ID blocked) cannot
//     receive the text-back. The runtime should noop via the existing
//     SMS provider's E.164 validation; documented in known-limitations
//     so users don't think the archetype "skipped" a call.
//   - Voicemail-left calls send CallStatus="completed" with a
//     RecordingUrl, NOT one of the missed statuses. They do NOT
//     fire call.missed. Surfacing voicemail-as-CRM-record is a
//     separate feature (transcribe + emit voicemail.left); out of
//     scope for v1.

export const missedCallTextBackArchetype: Archetype = {
  id: "missed-call-text-back",
  name: "Missed-Call Text Back",
  description:
    "When a caller hits your business number unanswered, send them an SMS within seconds asking what they need — and capture the lead before they dial the next contractor.",
  detailedDescription:
    "Fires on call.missed (Twilio CallStatus ∈ no-answer | busy | failed). Texts the caller within seconds (default 30s) with vertical-aware copy: 'Sorry we missed your call! What can we help you with?' Waits a follow-up window (default 4hr), logs a still-pending activity if the caller hasn't replied. Pair with the website-chatbot agent that runs the conversation — when the caller texts back, the existing inbound-SMS pipeline routes them to the chatbot for full qualification + booking. No additional configuration needed beyond installing this archetype and connecting Twilio.",
  requiresInstalled: ["crm", "sms"],
  knownLimitations: [
    {
      summary: "Anonymous callers (caller-ID blocked) cannot be texted back.",
      detail:
        "Twilio surfaces an empty or 'unknown' From when caller-ID is blocked. The archetype skips the SMS step in this case (the SMS provider's E.164 validation rejects the empty number). The call still logs to the activity timeline; the operator can manually follow up if voicemail was left. Calls from spoofed numbers (rare) will text-back the spoofed number — an edge case we accept rather than gate every call on a caller-ID verification API.",
    },
    {
      summary: "Voicemail-left calls do NOT fire call.missed.",
      detail:
        "When a caller leaves a voicemail, Twilio sends CallStatus='completed' with a RecordingUrl — not one of the missed statuses. The voicemail recording flows through Twilio's recording pipeline separately. Surfacing voicemail-as-CRM-activity (transcribe + emit voicemail.left) is a separate archetype (Q4 2026). If you want one text-back regardless of voicemail vs no-pickup, configure your Twilio voice URL to disable voicemail.",
    },
    {
      summary: "No conditional suppression on already-texted-back callers.",
      detail:
        "If the same caller dials twice within the follow-up window, both calls fire the archetype and both send a text-back. The runtime's `loop-guard` (loop-guard.ts) catches genuine infinite loops but not legitimate same-day duplicates. Workaround: tighten $delaySeconds to >300 (5 min) so the follow-up activity logs before the second call can fire. Conditional state-aware suppression lands when the branch step type supports external-state checks (V1.1).",
    },
    {
      summary: "A2P 10DLC compliance is the agency's responsibility.",
      detail:
        "Outbound SMS to US numbers requires A2P 10DLC registration via the agency's BYOK Twilio account. The archetype assumes the Twilio number connected to the workspace is already A2P-approved. If it isn't, Twilio rejects the outbound SMS at delivery time and the activity logs an 'sms.failed' event with the rejection reason. Pre-flight check is on the roadmap (Q4 2026 — partner-agency onboarding wizard surfaces A2P status).",
    },
  ],
  placeholders: {
    $delaySeconds: {
      kind: "user_input",
      description:
        "Seconds after call.missed before the SMS fires. Default 30 — fast enough that the caller hasn't dialed the next contractor, slow enough that a returned-call within 30 seconds doesn't get an awkward text-back during the call. Lower for verticals where speed matters most (HVAC emergencies — try 15); higher for verticals where the caller usually isn't urgent (real estate — try 120).",
      example: "30",
    },
    $followupDelaySeconds: {
      kind: "user_input",
      description:
        "Seconds after the text-back before the still-pending activity is logged. Default 14400 (4 hours) — long enough that most engaged callers have replied, short enough that the operator sees the unconverted lead in their same-day pipeline review. Fires unconditionally; the runtime doesn't yet detect whether the caller replied (V1.1 will).",
      example: "14400",
    },
    $textBackBody: {
      kind: "soul_copy",
      description:
        "SMS body sent to the caller within $delaySeconds of the missed call. Warm but immediate. Names the business. Asks what the caller needs in a vertical-aware way (HVAC: emergency vs routine; dental: insurance pre-qual; salon: which stylist or service; etc.). Under 200 chars to avoid carrier segmentation. The vertical-aware framing comes from the missed-call skill pack at packages/crm/src/lib/agents/skills/missed-call/vertical-templates.md — synthesis reads that pack to fill this placeholder.",
      soulFields: ["businessName", "tone", "vertical", "services"],
      example:
        "Hey, this is {{businessName}} — sorry we missed your call! Is this an emergency (no AC, no heat, leak) or a scheduled service? Quick reply and we'll get you sorted.",
    },
  },
  specTemplate: {
    name: "Missed-Call Text Back",
    description:
      "When a call goes unanswered (no-answer / busy / failed), text the caller within seconds asking what they need. Capture the lead before they dial the next contractor.",
    trigger: {
      type: "event",
      event: "call.missed",
    },
    variables: {
      // Caller's phone (E.164) — direct from trigger payload.
      callerPhone: "trigger.fromNumber",
      // Caller's CRM contact id — null if this is the first time we've
      // seen this number. The send_sms step accepts contact_id: null
      // for unknown callers; the inbound-SMS path back creates the
      // contact when they reply.
      callerContactId: "trigger.contactId",
      // Twilio CallSid — for cross-referencing the activity log to
      // the original call event.
      callSid: "trigger.callSid",
      // The status that triggered this archetype (no-answer / busy /
      // failed). Logged in the activity for post-hoc analysis.
      missedStatus: "trigger.status",
    },
    steps: [
      {
        id: "wait_before_text_back",
        type: "wait",
        seconds: "$delaySeconds",
        next: "send_text_back",
      },
      {
        id: "send_text_back",
        type: "mcp_tool_call",
        tool: "send_sms",
        args: {
          to: "{{callerPhone}}",
          body: "$textBackBody",
          contact_id: "{{callerContactId}}",
        },
        next: "wait_followup_window",
      },
      {
        id: "wait_followup_window",
        type: "wait",
        seconds: "$followupDelaySeconds",
        next: "log_missed_call_complete",
      },
      {
        id: "log_missed_call_complete",
        type: "mcp_tool_call",
        tool: "create_activity",
        args: {
          contact_id: "{{callerContactId}}",
          type: "missed_call",
          subject: "Missed-Call Text Back agent sequence complete",
          body: "Caller {{callerPhone}} missed our call (CallStatus={{missedStatus}}, CallSid={{callSid}}). Sent text-back SMS within $delaySeconds. Window of $followupDelaySeconds elapsed without us tracking a reply event. The caller may have replied — check the inbound SMS log for {{callerPhone}} to verify.",
          metadata: {
            source: "missed-call-text-back",
            stage: "complete",
            callSid: "{{callSid}}",
            missedStatus: "{{missedStatus}}",
          },
        },
        next: null,
      },
    ],
  },
};
