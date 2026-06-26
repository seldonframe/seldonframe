// Unified Agent Model — P1, Task T3: the speed-to-lead skill.
//
// A PURE message composer (no I/O, never throws, no "use server"). It produces
// the instant "we got your inquiry, we'll be in touch" acknowledgement a
// business fires the moment a lead lands — the canonical `event` trigger payload
// for "lead.created". Speed-to-lead is the whole point: a lead that hears back
// in seconds never reaches a competitor. The trigger→channel layer owns
// delivery; this owns ONLY the words. Safe from a Server Component, action,
// route handler, runtime, or test.
//
// Contract (pinned by tests/unit/agents/skills/speed-to-lead.spec.ts):
//   • the body acknowledges receipt AND names a next step ("we'll be in touch
//     shortly");
//   • the businessName is used for the sign-off (it's who the lead hears from);
//   • SMS is one short, subject-less line; email returns a subject + body;
//   • every field is optional and degrades gracefully — no "null"/"undefined"
//     ever leaks into customer-facing copy.

/** Trim a possibly-null/blank string to a usable value, or null. Keeps "null"
 *  and "undefined" out of customer-facing copy when a field is missing. */
function clean(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

export function composeSpeedToLead(args: {
  contactName?: string | null;
  businessName?: string | null;
  channel: "sms" | "email";
  leadSummary?: string | null;
}): { subject?: string; body: string } {
  const name = clean(args.contactName);
  const business = clean(args.businessName);
  const summary = clean(args.leadSummary);
  const signOff = business ? `the team at ${business}` : "our team";
  // Reference what they reached out about when we have it ("about your leaking
  // water heater"); otherwise a neutral "your inquiry".
  const re = summary ? `about ${summary}` : "with us";

  if (args.channel === "sms") {
    const hi = name ? `Hi ${name}! ` : "Hi! ";
    const ack = business
      ? `Thanks for reaching out to ${business} ${re}.`
      : `Thanks for reaching out ${re}.`;
    const next = "We got your message and will be in touch shortly.";
    const body = `${hi}${ack} ${next}`.trim();
    return { body };
  }

  // Email: subject + friendly body.
  const subject = business
    ? `Thanks for reaching out to ${business}`
    : "Thanks for reaching out";

  const greeting = name ? `Hi ${name},` : "Hi there,";
  const body = [
    greeting,
    "",
    business
      ? `Thank you for reaching out to ${business} ${re} — we've received your message.`
      : `Thank you for reaching out ${re} — we've received your message.`,
    "",
    "One of our team will be in touch with you shortly. In the meantime, if anything is urgent, just reply to this message and we'll prioritize it.",
    "",
    "Talk soon,",
    signOff,
  ].join("\n");

  return { subject, body };
}
