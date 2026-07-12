// Agent setup mode slice (T5) — the share card's step-label scrubber.
//
// A share card's `sanitized_steps` are the ONLY workflow content that ever
// reaches the public /a/[slug] route (or the /api/og PNG variant), so every
// label is scrubbed of anything that identifies a real person or endpoint
// (email addresses, phone numbers, URLs) BEFORE it's shown in the preview
// (never-lies: the preview IS what gets published, so scrubbing has to
// happen before the operator ever sees it) and again, defensively, on the
// server at publish time — pure, no I/O, directly unit-testable.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]+/gi;
// 2026-07-11 opus review: URL_RE only fires on a scheme/www prefix, so a
// bare business domain typed without either ("acme-plumbing.com") sailed
// through untouched. This is a SEPARATE pass (not folded into URL_RE) run
// AFTER it, over a curated common-TLD allowlist — narrow on purpose so it
// never eats ordinary prose with a period ("v2.0", "Node.js" — "js"/"0"
// aren't in the list) while still catching the domains people actually type.
const BARE_DOMAIN_RE =
  /\b[a-zA-Z0-9][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9-]*)*\.(?:com|net|org|io|co|app|dev|ai|biz|info|us|ca|uk|me|xyz|shop|store)(?:\/\S*)?\b/gi;
// A run of 7+ digits (optionally grouped with spaces/dashes/dots/parens) —
// generous enough to catch phone numbers in any common formatting, INCLUDING
// 7-digit local numbers with no area code, without needing locale-aware
// parsing.
const PHONE_RE = /(?:\+?\d[\d\-.\s()]{6,}\d)/g;

const MAX_LABEL_LENGTH = 120;

/** Strip emails/phones/URLs (scheme-prefixed AND bare domains) from a single
 *  step label, replacing each with a neutral placeholder. Never throws; a
 *  non-string/empty input returns "". */
export function scrubStepLabel(input: string | null | undefined): string {
  if (typeof input !== "string") return "";
  let out = input
    .replace(EMAIL_RE, "[email]")
    .replace(URL_RE, "[link]")
    .replace(BARE_DOMAIN_RE, "[link]")
    .replace(PHONE_RE, "[phone]")
    .trim();
  if (out.length > MAX_LABEL_LENGTH) {
    out = `${out.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`;
  }
  return out;
}

/** Scrub + cap a list of step labels for the share card's animated
 *  pipeline — drops empty labels after scrubbing, caps the count so the
 *  public diagram never grows unbounded. Pure; never throws. */
export function scrubStepLabels(
  labels: (string | null | undefined)[],
  maxSteps = 8,
): string[] {
  const out: string[] = [];
  for (const label of labels) {
    const scrubbed = scrubStepLabel(label);
    if (!scrubbed) continue;
    out.push(scrubbed);
    if (out.length >= maxSteps) break;
  }
  return out;
}
