// Generator regression net — the PROMPT SET + locked expectations.
//
// WHAT THIS IS
// A fixed corpus of operator sentences run through the generator's PURE
// DETERMINISTIC path — `assembleAgentBundle(heuristicIntent(sentence))`, no LLM
// key, no clock, no I/O — together with the SANE-agent expectation each one must
// keep producing. The spec (generator-prompts.spec.ts) grades every case; a
// failure means a change under src/lib/agents/generate/** silently re-shaped a
// generated agent (wrong trigger kind, wrong/lost tool binding, wrong channel,
// or the wrong skill template) — the exact class of breakage (misclassification,
// false judge warnings) we want caught BEFORE a human sees it.
//
// WHY DETERMINISTIC
// The heuristic+assemble path ALWAYS runs (it's the fail-soft fallback when no
// classifier is injected), so it is reproducible in CI/locally with zero secrets.
// The LLM author can only do BETTER than this baseline, never worse — so locking
// the heuristic's output as the floor is a true regression net.
//
// HOW THE EXPECTATIONS WERE SET (calibration, not aspiration)
// Each `expect` below was CALIBRATED by actually running the deterministic path
// and recording what it emits TODAY, then locking that as the baseline. Where the
// heuristic is provably weaker than an LLM author would be, the case is annotated
// `KNOWN GAP:` and its expectation asserts the (weaker) reality — so the net stays
// green and honest, and the gap is documented rather than hidden. Do NOT "fix" a
// known-gap expectation to the aspirational answer; that would make the net red
// against working code. Tighten it only when the heuristic itself improves.
//
// PURE — this file is data + types only. No imports that touch I/O.

import type { AgentTrigger } from "@/lib/agents/triggers/agent-trigger";

/** A connector binding id as the grader compares it: the catalog/connector `id`
 *  (e.g. "postiz", "googledrive", "slack") — NOT the human label and NOT the
 *  Composio toolkit display name. For the sheets/drive tool the bound id is
 *  "googledrive" (Sheets actions live under the Drive toolkit — see
 *  tool-catalog.ts), so that is what `toolIdsInclude` must name. */
export type ToolId = string;

/** The SANE-agent assertion for one sentence. Every field except `triggerKind`
 *  is optional so a case asserts only what's load-bearing for it. */
export type GeneratorExpectation = {
  /** REQUIRED. The resolved `blueprint.trigger.kind` the bundle must have. */
  triggerKind: AgentTrigger["kind"];
  /** If set, `blueprint.trigger.event` must equal this (only meaningful for an
   *  `event` trigger — the slug the agent subscribes to, e.g. "lead.created"). */
  triggerEvent?: string;
  /** If set, the resolved `blueprint.trigger.channel` must be one of these. */
  channelOneOf?: AgentTrigger["channel"][];
  /** If set, EVERY id here must appear among the bound connector ids
   *  (blueprint.connectors[].id). Extra connectors are allowed — this is a
   *  subset (⊇) check, so a case only pins the tools it cares about. */
  toolIdsInclude?: ToolId[];
  /** If set, NONE of these connector ids may appear (negative tool assertion —
   *  e.g. a receptionist must not have bound Postiz). */
  toolIdsExclude?: ToolId[];
  /** If set, the assembled skill prose (blueprint.customSkillMd) must NOT contain
   *  any of these signature phrases — the guard against the WRONG skill template
   *  being used. Each starter's prose opens with a self-identifying line:
   *    review-requester → "You are the review-requester"
   *    receptionist     → "You are the phone receptionist"
   *    speed-to-lead    → "You are the speed-to-lead responder"
   *    social-poster    → "You are an automated agent"   (outbound-task base)
   *  Asserting the ABSENCE of the wrong signature is robust: it survives prose
   *  edits and never false-positives on a folded promptHint (which can echo a
   *  word like "review" without being the review-requester template). */
  skillNot?: string[];
};

/** A single regression case: the operator's sentence + what a sane generated
 *  agent must look like, plus an optional `note` documenting a known gap or the
 *  reason the case exists. */
export type GeneratorCase = {
  sentence: string;
  expect: GeneratorExpectation;
  note?: string;
};

/** Signature opening phrases of each skill's prose — exported so the spec and any
 *  future case can reference them by name instead of re-typing the literal. */
export const SKILL_SIGNATURE = {
  reviewRequester: "You are the review-requester",
  receptionist: "You are the phone receptionist",
  speedToLead: "You are the speed-to-lead responder",
  socialPoster: "You are an automated agent",
} as const;

// ─── the prompt set (14 cases) ───────────────────────────────────────────────
//
// Coverage map (by emitted skill / trigger.kind):
//   social-poster (schedule) ......... cases 1, 9, 12, 13
//   review-requester (event book) .... case 2
//   speed-to-lead (event missed_call)  case 3
//   speed-to-lead (event lead) ....... cases 4, 6, 10, 14
//   receptionist (inbound voice) ..... cases 5, 11
//   receptionist (inbound chat) ...... case 8   (KNOWN GAP)
//
// Tool bindings exercised: postiz (vetted), googledrive (sheets/drive, composio),
// slack (composio), googlecalendar (composio), and the no-tool case.

export const GENERATOR_CASES: GeneratorCase[] = [
  // 1 — the original misfire. A POST verb + a social network must win over the
  //     stray "reviews" mention → a SCHEDULED Postiz poster, NOT review-requester.
  {
    sentence: "Post a weekly Instagram highlight of our 5-star reviews",
    expect: {
      triggerKind: "schedule",
      channelOneOf: ["digest"],
      toolIdsInclude: ["postiz"],
      // must NOT be cloned from the review-requester template (the bug we hit)
      skillNot: [SKILL_SIGNATURE.reviewRequester],
    },
    note: "Regression anchor: the exact sentence that used to clone review-requester because /review/ matched '5-star reviews'.",
  },

  // 2 — ask-for-review after a job → review-requester, fires on booking.completed,
  //     channel SMS (the operator said "Text"). It also binds googlecalendar
  //     (the word "appointment" is a calendar keyword) — allowed; we don't pin
  //     tools here, only that it's the review skill on the booking event over SMS.
  {
    sentence: "Text customers for a Google review after their appointment",
    expect: {
      triggerKind: "event",
      triggerEvent: "booking.completed",
      channelOneOf: ["sms"],
      // not a social poster, not a receptionist
      skillNot: [SKILL_SIGNATURE.socialPoster, SKILL_SIGNATURE.receptionist],
    },
    note: "Channel must follow 'Text' → sms (not the email branch). 'appointment' also binds googlecalendar — intentionally not pinned.",
  },

  // 3 — missed-call → book the job. The heuristic now has a missed_call branch
  //     (MISSED_CALL_RE, matched BEFORE LEAD_RE): "missed call" → speed-to-lead
  //     skill on the missed_call EVENT, which agentNeedsNumber maps to "needs a
  //     dedicated number" (forward-in + text-back). Pins event/missed_call so the
  //     floor matches what the Opus author already emits.
  {
    sentence: "Answer missed calls for my HVAC company and book the job",
    expect: {
      triggerKind: "event",
      triggerEvent: "missed_call",
      channelOneOf: ["sms"],
      skillNot: [SKILL_SIGNATURE.socialPoster, SKILL_SIGNATURE.reviewRequester],
    },
    note: "Missed-call text-back: MISSED_CALL_RE fires before LEAD_RE, so 'missed call' → trigger event 'missed_call' (needs a dedicated number per INBOUND_ISH_EVENTS), keeping the speed-to-lead text-back skill.",
  },

  // 4 — speed-to-lead, the canonical inbound-lead follow-up. event lead.created.
  {
    sentence: "Reply to new leads within 5 minutes",
    expect: {
      triggerKind: "event",
      triggerEvent: "lead.created",
      channelOneOf: ["sms"],
      toolIdsExclude: ["postiz"],
      skillNot: [SKILL_SIGNATURE.socialPoster, SKILL_SIGNATURE.reviewRequester],
    },
  },

  // 5 — receptionist, inbound VOICE (answer + qualify on the phone).
  {
    sentence: "Answer my phone and qualify callers",
    expect: {
      triggerKind: "inbound",
      channelOneOf: ["voice"],
      toolIdsExclude: ["postiz"],
      skillNot: [SKILL_SIGNATURE.socialPoster, SKILL_SIGNATURE.reviewRequester],
    },
  },

  // 6 — log leads to a Google Sheet → speed-to-lead (the "new lead" intent) PLUS
  //     the sheets/drive tool. The bound id is "googledrive" (Sheets actions are
  //     exposed under the Drive toolkit — tool-catalog.ts), NOT "googlesheets".
  {
    sentence: "Log every new lead to a Google Sheet",
    expect: {
      triggerKind: "event",
      triggerEvent: "lead.created",
      toolIdsInclude: ["googledrive"],
    },
    note: "Pins the sheets/drive binding id = 'googledrive' (the real Composio slug), guarding the documented googlesheets→googledrive divergence.",
  },

  // 7 — combined event + tool: a new lead pings Slack → speed-to-lead + slack.
  {
    sentence: "Notify my Slack when a new lead comes in",
    expect: {
      triggerKind: "event",
      triggerEvent: "lead.created",
      toolIdsInclude: ["slack"],
      skillNot: [SKILL_SIGNATURE.socialPoster, SKILL_SIGNATURE.reviewRequester],
    },
    note: "Event-skill AND a third-party tool bind together (lead.created + composio:slack).",
  },

  // 8 — KNOWN GAP: "after each booking" emailer. An LLM author would make this an
  //     EVENT agent (booking.completed, channel email). The heuristic has no
  //     thank-you/post-booking-email branch and no cadence/lead/review keyword
  //     here, so it falls to the safe DEFAULT: receptionist, inbound CHAT. We
  //     assert that reality (and that it stays NOT a social poster).
  {
    sentence: "Send a thank-you email after each booking",
    expect: {
      triggerKind: "inbound",
      channelOneOf: ["chat"],
      skillNot: [SKILL_SIGNATURE.socialPoster],
    },
    note: "KNOWN GAP: should be an event(booking.completed)+email agent; the heuristic has no post-booking-email rule, so it lands on the safe inbound-chat default. Documents the floor, not the ideal.",
  },

  // 9 — social-poster to a different network on a weekly cadence → schedule+postiz.
  {
    sentence: "Post our latest blog to LinkedIn every Tuesday",
    expect: {
      triggerKind: "schedule",
      channelOneOf: ["digest"],
      toolIdsInclude: ["postiz"],
      skillNot: [SKILL_SIGNATURE.reviewRequester],
    },
  },

  // 10 — contact-form follow-up → speed-to-lead (the "contact form" lead phrasing).
  {
    sentence: "Follow up with new inquiries from our contact form",
    expect: {
      triggerKind: "event",
      triggerEvent: "lead.created",
      skillNot: [SKILL_SIGNATURE.socialPoster, SKILL_SIGNATURE.reviewRequester],
    },
  },

  // 11 — plain "receptionist" phrasing → inbound voice (the always-on front desk).
  {
    sentence: "Be the receptionist for my dental clinic",
    expect: {
      triggerKind: "inbound",
      channelOneOf: ["voice"],
      toolIdsExclude: ["postiz"],
      skillNot: [SKILL_SIGNATURE.socialPoster, SKILL_SIGNATURE.reviewRequester],
    },
  },

  // 12 — a BARE cadence (no social network) still implies a scheduled recap.
  //      "daily" → cron 0 9 * * * ; classified social-poster (the outbound task
  //      base). No tool keyword here, so no connector — fine.
  {
    sentence: "Send a daily recap of yesterday's bookings to my team",
    expect: {
      triggerKind: "schedule",
      channelOneOf: ["digest"],
      skillNot: [SKILL_SIGNATURE.reviewRequester, SKILL_SIGNATURE.receptionist],
    },
    note: "Standalone cadence ('daily') with no social network still routes to the scheduled outbound-task agent.",
  },

  // 13 — mixed intent where the POST-verb+network must win: "ask ... for a review
  //      AND post ... to Facebook" → social-poster (priority #1), NOT review-
  //      requester, even though it literally says "ask ... for a review".
  {
    sentence: "Ask happy customers for a review and post the best ones to Facebook",
    expect: {
      triggerKind: "schedule",
      channelOneOf: ["digest"],
      toolIdsInclude: ["postiz"],
      skillNot: [SKILL_SIGNATURE.reviewRequester],
    },
    note: "Priority test: a post-verb + social network outranks the ask-for-review phrasing in the same sentence.",
  },

  // 14 — EMAIL channel on an event skill: "email new leads" → speed-to-lead, but
  //      the explicit 'email' word must flip the channel to email (not the sms
  //      default). Guards the EMAIL_RE channel hint for event skills.
  {
    sentence: "Email new leads right away to introduce our services",
    expect: {
      triggerKind: "event",
      triggerEvent: "lead.created",
      channelOneOf: ["email"],
      skillNot: [SKILL_SIGNATURE.socialPoster, SKILL_SIGNATURE.reviewRequester],
    },
    note: "Channel-hint guard: 'Email' routes the event skill to channel=email instead of the sms default.",
  },
];
