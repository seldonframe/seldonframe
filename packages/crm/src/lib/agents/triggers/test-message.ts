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
// through, so the marker + the placeholder-link behavior are unit-tested with
// zero I/O.
//
// PURE — no I/O, no "use server", no DB, no clock, never throws. A template is
// a marketplace PRODUCT the builder publishes; the Google review link is a
// PER-BUYER, deploy-time customization (each client sets their own link when
// they deploy). So a builder testing/publishing a template is never blocked
// for lacking one — a review test with no real link composes with a clearly-
// fake `PLACEHOLDER_REVIEW_URL` instead, and the result flags
// `usedPlaceholder:true` so the caller can surface a non-blocking note.
// Everything else degrades gracefully (missing name / business →
// generic-but-valid copy), exactly like the live skills.

import { composeReviewRequest } from "@/lib/agents/skills/review-requester";
import { composeSpeedToLead } from "@/lib/agents/skills/speed-to-lead";
import type { EventAgentSkill } from "./run-event-agent";

/** The clear marker every test message is prefixed with, so the operator who
 *  receives it knows it's a drill (and never mistakes it for a real send that
 *  escaped to a customer). Exported so the test can assert it verbatim. */
export const TEST_MESSAGE_PREFIX = "[TEST] ";

/** A clearly-fake placeholder review link used to compose a review-requester
 *  test when no real link has been set yet. The real link is a per-buyer,
 *  deploy-time customization — a template builder never has (or needs) one. */
export const PLACEHOLDER_REVIEW_URL =
  "https://g.page/r/your-google-review-link";

/** The inputs to compose a single test message — the same fields the live
 *  `EventAgentMatch` carries, resolved by the action from the template +
 *  deployment. `reviewUrl` is consulted ONLY for the review-requester skill. */
export type ComposeTestEventAgentArgs = {
  skill: EventAgentSkill;
  channel: "sms" | "email";
  businessName?: string | null;
  contactName?: string | null;
  /** Review-requester only: the effective (deployment-wins) Google review link.
   *  Absent/blank → composes with `PLACEHOLDER_REVIEW_URL` instead (the real
   *  link is a per-buyer, deploy-time customization, not a builder concern). */
  reviewUrl?: string | null;
  /** Speed-to-lead only: the one-line "what they asked about" summary. */
  leadSummary?: string | null;
};

export type ComposeTestEventAgentResult =
  | { ok: true; subject?: string; body: string; usedPlaceholder?: boolean }
  | { ok: false; error: "unknown_skill" };

/** Trim a possibly-null/blank string to a usable value, or null. */
function clean(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

/**
 * Compose the test message for `skill` + context, prefixing the body with
 * `TEST_MESSAGE_PREFIX`. Mirrors the live orchestrator's compose step, with one
 * deliberate difference for the builder-facing test:
 *   • review-requester with a real reviewUrl → composes with it, same as live;
 *   • review-requester with NO reviewUrl → composes with
 *     `PLACEHOLDER_REVIEW_URL` instead of blocking, and flags
 *     `usedPlaceholder:true` (the real link is a per-buyer, deploy-time
 *     customization — a template builder testing/publishing never has one);
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
    const usedPlaceholder = !reviewUrl;
    const composed = composeReviewRequest({
      contactName,
      businessName,
      reviewUrl: reviewUrl ?? PLACEHOLDER_REVIEW_URL,
      channel: args.channel,
    });
    return {
      ok: true,
      ...(composed.subject !== undefined ? { subject: composed.subject } : {}),
      body: `${TEST_MESSAGE_PREFIX}${composed.body}`,
      ...(usedPlaceholder ? { usedPlaceholder: true } : {}),
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
