// Event-agent "Send test" — the PURE test-message composer.
//
// An operator wants to fire a REAL review-request / speed-to-lead message to
// their OWN number on demand, without waiting for a booking/lead to actually
// happen. This module owns ONLY the WORDS for that on-demand test: it wraps the
// same pure skills the live event-agent path uses (composeReviewRequest /
// composeSpeedToLead — lib/agents/skills) and prefixes a clear "[TEST] " marker
// so the recipient (the operator) instantly knows it's a drill, not a customer
// message that leaked.
//
// It is the tested seam the `sendTestEventAgentAction` thin wrapper composes
// through, so the marker + the review-link guard are unit-tested with zero I/O.
//
// PURE — no I/O, no "use server", no DB, no clock, never throws. The ONLY
// failure it surfaces is the structural one the operator must fix first: a
// review test with no review link is worthless (there's nothing to leave a
// review at), so it returns `{ ok:false, error }` and the action turns that into
// a clear "set the review link first" message. Everything else degrades
// gracefully (missing name / business → generic-but-valid copy), exactly like
// the live skills.

import { composeReviewRequest } from "@/lib/agents/skills/review-requester";
import { composeSpeedToLead } from "@/lib/agents/skills/speed-to-lead";
import type { EventAgentSkill } from "./run-event-agent";

/** The clear marker every test message is prefixed with, so the operator who
 *  receives it knows it's a drill (and never mistakes it for a real send that
 *  escaped to a customer). Exported so the test can assert it verbatim. */
export const TEST_MESSAGE_PREFIX = "[TEST] ";

/** The inputs to compose a single test message — the same fields the live
 *  `EventAgentMatch` carries, resolved by the action from the template +
 *  deployment. `reviewUrl` is consulted ONLY for the review-requester skill. */
export type ComposeTestEventAgentArgs = {
  skill: EventAgentSkill;
  channel: "sms" | "email";
  businessName?: string | null;
  contactName?: string | null;
  /** Review-requester only: the effective (deployment-wins) Google review link.
   *  Required for a review test — absent/blank → `{ ok:false }`. */
  reviewUrl?: string | null;
  /** Speed-to-lead only: the one-line "what they asked about" summary. */
  leadSummary?: string | null;
};

export type ComposeTestEventAgentResult =
  | { ok: true; subject?: string; body: string }
  | { ok: false; error: "review_link_required" | "unknown_skill" };

/** Trim a possibly-null/blank string to a usable value, or null. */
function clean(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

/**
 * Compose the test message for `skill` + context, prefixing the body with
 * `TEST_MESSAGE_PREFIX`. Mirrors the live orchestrator's compose step:
 *   • review-requester REQUIRES a review link (else `{ ok:false,
 *     error:"review_link_required" }` — the action surfaces "set the review link
 *     first"); the composed body always contains the link;
 *   • speed-to-lead never needs a link;
 *   • any unknown skill → `{ ok:false, error:"unknown_skill" }` (defensive; the
 *     action only ever passes the two known skills).
 *
 * The "[TEST] " marker is added to the BODY only (not the email subject) so the
 * recipient sees it inline regardless of channel. Pure; never throws.
 */
export function composeTestEventAgentMessage(
  args: ComposeTestEventAgentArgs,
): ComposeTestEventAgentResult {
  const businessName = clean(args.businessName);
  const contactName = clean(args.contactName);

  if (args.skill === "review-requester") {
    const reviewUrl = clean(args.reviewUrl);
    if (!reviewUrl) {
      // No link → the ask is worthless. The operator must set the review link
      // first; the action turns this into a clear, actionable error.
      return { ok: false, error: "review_link_required" };
    }
    const composed = composeReviewRequest({
      contactName,
      businessName,
      reviewUrl,
      channel: args.channel,
    });
    return {
      ok: true,
      ...(composed.subject !== undefined ? { subject: composed.subject } : {}),
      body: `${TEST_MESSAGE_PREFIX}${composed.body}`,
    };
  }

  if (args.skill === "speed-to-lead") {
    const composed = composeSpeedToLead({
      contactName,
      businessName,
      channel: args.channel,
      leadSummary: clean(args.leadSummary),
    });
    return {
      ok: true,
      ...(composed.subject !== undefined ? { subject: composed.subject } : {}),
      body: `${TEST_MESSAGE_PREFIX}${composed.body}`,
    };
  }

  return { ok: false, error: "unknown_skill" };
}
