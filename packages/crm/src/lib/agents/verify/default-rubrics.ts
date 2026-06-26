// Agent Loop — L2 Verify (maker ≠ checker) — Task T2: per-skill DEFAULT rubrics.
//
// agent-verify.ts is the pure verify ENGINE; this module is the per-skill
// POLICY layer on top of it. Given a skill name (the outbound agent skills
// "review-requester" / "speed-to-lead") and what's known about the send
// (the review URL, the contact's name), it returns the VerifyRubric the CHECKER
// should gate that skill's output with — or `null` when the skill has no default
// rubric (an unknown skill is not gated by a default; the caller decides what to
// do — typically "no rubric → no deterministic gate").
//
// It is PURE: no I/O, no clock, no env, no "use server". It only assembles a
// plain rubric object. The CONTEXT-DERIVED checks (the review link, the contact
// name) are added ONLY when their value is known: an unknown review URL must NOT
// add a `must_include` for a URL we don't have — that would be an unsatisfiable
// check that fails every message. The "no URL at all → skip the whole ask"
// decision belongs to the L3/gate layer (run-event-agent already skips a review
// ask with no link); here we simply don't add the check. The two ALWAYS-ON
// checks — max_length 320 (keep an SMS-length ask short) and must_not_include
// "{" (no leftover "{placeholder}" leaked into the copy) — are added for every
// supported skill.
//
// Safe from a Server Component, action, route handler, runtime, or test.

import type { VerifyCheck, VerifyRubric } from "./agent-verify";

/** Max characters for an SMS-channel ask (one tight SMS-ish segment — two
 *  segments of headroom). The default when no channel is given. */
const MAX_SMS_LENGTH = 320;

/** Max characters for an EMAIL-channel body. Email is a long-form, multi-
 *  paragraph message (greeting + thanks + ask + link + sign-off), so the SMS
 *  cap would (wrongly) block every legitimate email. This is a generous sanity
 *  ceiling — it catches a runaway/garbage body without flagging a normal email. */
const MAX_EMAIL_LENGTH = 5000;

/** Pick the length cap for the channel. Absent/"sms" → the tight SMS cap (the
 *  back-compat default callers without a channel still get); "email" → the
 *  long-form email cap. */
function maxLengthForChannel(channel?: "sms" | "email" | null): number {
  return channel === "email" ? MAX_EMAIL_LENGTH : MAX_SMS_LENGTH;
}

/** The always-on "no leftover template placeholder leaked" guard. A literal "{"
 *  in the output means a `{firstName}`-style token never got filled. */
const NO_PLACEHOLDER: VerifyCheck = {
  kind: "must_not_include",
  value: "{",
  label: "unfilled placeholder",
};

/**
 * The default VERIFY RUBRIC for a given outbound agent skill, given what's known
 * about the send. Returns `null` for an unknown skill (no default gate).
 *
 * - `"review-requester"` — enforce the review LINK and the contact NAME ONLY
 *   when those values are known (an unknown URL/name adds no check, rather than
 *   an unsatisfiable one), plus the always-on max_length + no-placeholder.
 * - `"speed-to-lead"` — a non-empty reply (min_length 1) plus the always-on
 *   max_length + no-placeholder. (No link/name to enforce.)
 *
 * The `max_length` cap is CHANNEL-AWARE: `ctx.channel === "email"` uses the
 * long-form email ceiling (an email body is multi-paragraph and would always
 * blow an SMS cap); absent or `"sms"` uses the tight SMS cap (the back-compat
 * default — callers that pass no channel get 320, exactly as before).
 *
 * `ctx.contactName` may be a single word; in that case the name's
 * `must_include_any` values collapse to one (deduped) — that's fine.
 */
export function defaultRubricForSkill(
  skill: string,
  ctx?: {
    reviewUrl?: string | null;
    contactName?: string | null;
    channel?: "sms" | "email" | null;
  },
): VerifyRubric | null {
  const maxLength = maxLengthForChannel(ctx?.channel);
  switch (skill) {
    case "review-requester": {
      const checks: VerifyCheck[] = [];

      // Only enforce the review link when we actually have one. An unknown URL
      // must NOT become an unsatisfiable must_include — the "no URL → skip the
      // ask entirely" decision is the gate's job, not this check's.
      if (ctx?.reviewUrl) {
        checks.push({ kind: "must_include", value: ctx.reviewUrl, label: "review link" });
      }

      // Only enforce the contact name when we have one. Accept either the full
      // name or just the first token (a greeting may use either). Dedupe so a
      // single-word name doesn't list the same value twice.
      if (ctx?.contactName) {
        const first = ctx.contactName.split(" ")[0];
        const values = Array.from(new Set([ctx.contactName, first]));
        checks.push({ kind: "must_include_any", values, label: "contact name" });
      }

      checks.push({ kind: "max_length", max: maxLength });
      checks.push(NO_PLACEHOLDER);
      return { checks };
    }

    case "speed-to-lead": {
      return {
        checks: [
          { kind: "min_length", min: 1 },
          { kind: "max_length", max: maxLength },
          NO_PLACEHOLDER,
        ],
      };
    }

    default:
      // An unknown skill has no default rubric — the caller decides (typically
      // "no rubric → no deterministic gate").
      return null;
  }
}
