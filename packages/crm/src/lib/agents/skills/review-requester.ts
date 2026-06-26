// Unified Agent Model — P1, Task T3: the review-requester skill.
//
// A PURE message composer (no I/O, never throws, no "use server"). It turns a
// contact/business/reviewUrl into the copy for a warm, on-brand ask for a Google
// review — the canonical `event` trigger payload (e.g. fired after
// "booking.completed"). The trigger→channel layer owns delivery; this owns ONLY
// the words. Safe to call from a Server Component, action, route handler,
// runtime, or test.
//
// Contract (pinned by tests/unit/agents/skills/review-requester.spec.ts):
//   • the reviewUrl is ALWAYS in the body — the ask is worthless without it;
//   • the SMS variant is one tight line + the link, kept short (≤ 320 chars,
//     two segments) so it actually sends;
//   • the email variant returns a subject + a slightly longer friendly body;
//   • greet by contactName when present, else a generic-but-valid greeting
//     (never "Hi null"/"Hi undefined").

/** Trim a possibly-null/blank string to a usable value, or null. Keeps "null"
 *  and "undefined" out of customer-facing copy when a field is missing. */
function clean(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

export function composeReviewRequest(args: {
  contactName?: string | null;
  businessName?: string | null;
  reviewUrl: string;
  channel: "sms" | "email";
}): { subject?: string; body: string } {
  const name = clean(args.contactName);
  const business = clean(args.businessName);
  const url = clean(args.reviewUrl) ?? "";
  // "from the team at Acme" / "from our team" — a sign-off that reads fine with
  // or without a business name.
  const fromTeam = business ? `the team at ${business}` : "our team";

  if (args.channel === "sms") {
    // One tight line + the link. Greet by first name when we have it.
    const hi = name ? `Hi ${name}! ` : "Hi! ";
    const lead = business
      ? `Thanks for choosing ${business}.`
      : "Thanks so much.";
    const ask = "If we did a good job, a quick Google review would mean the world";
    const body = `${hi}${lead} ${ask}: ${url}`.trim();
    return { body };
  }

  // Email: subject + a slightly longer, friendly body.
  const subject = business
    ? `How did we do, ${name ?? "there"}? A quick favor for ${business}`
    : `How did we do? A quick favor`;

  const greeting = name ? `Hi ${name},` : "Hi there,";
  const body = [
    greeting,
    "",
    business
      ? `Thank you for choosing ${business} — it was a pleasure working with you.`
      : "Thank you so much — it was a pleasure working with you.",
    "",
    "If you have a moment, we'd be incredibly grateful if you left us a quick Google review. It takes about 30 seconds and genuinely helps a small business like ours grow:",
    "",
    url,
    "",
    "Thank you so much,",
    fromTeam,
  ].join("\n");

  return { subject, body };
}
