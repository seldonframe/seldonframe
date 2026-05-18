// 2026-05-18 — Deterministic template fallback for compose.
//
// When the workspace doesn't have an Anthropic key configured (or the
// LLM call fails for any reason), we still need confirmation emails +
// SMS to go out. Without this fallback, the dispatcher logs
// "compose_failed:no_llm_available" and the customer never hears back
// — silent failure at the WORST possible moment (right after a booking).
//
// Trade-off vs LLM compose: these messages are generic. They don't
// adapt to the operator's voice or business personality. But they're
// REAL deliverable messages with the customer's name + booking time +
// business name slotted in. Once the operator wires their Anthropic
// key on /settings/integrations/llm, every subsequent compose flips
// to the personality-aware LLM path automatically. This is purely a
// safety net.
//
// Per-skill templates: a few high-value skills (booking-confirmation,
// booking-cancellation, intake-auto-reply, booking-reminder-24h) get
// hand-written templates. Everything else gets a generic "we received
// your request, we'll be in touch" shape.

export type TemplateInput = {
  skillId: string;
  channel: "email" | "sms";
  vars: Record<string, string>;
};

export type TemplateResult = {
  subject: string | null;
  body: string;
};

function pick(vars: Record<string, string>, key: string, fallback = ""): string {
  const v = vars[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : fallback;
}

export function renderTemplateMessage(input: TemplateInput): TemplateResult {
  const vars = input.vars;
  const firstName = pick(vars, "contactFirstName") || pick(vars, "contactName") || "there";
  const business = pick(vars, "businessName") || "the team";
  const bookingTitle = pick(vars, "bookingTitle") || "your appointment";
  const startsAt = pick(vars, "bookingStartsAtLocal") || "your scheduled time";
  const businessPhone = pick(vars, "businessPhone");
  // 2026-05-18 — prefer the per-booking signed manage URL (lets the
  // customer cancel + pick a new time without re-doing the booking).
  // Falls back to the generic booking page URL only when manageUrl
  // wasn't provided (e.g. intake events have no bookingId).
  const manageUrl = pick(vars, "bookingManageUrl") || pick(vars, "bookingPageUrl");

  const trailerEmail = businessPhone
    ? `\n\nQuestions? Call us at ${businessPhone}.`
    : "";
  const trailerReschedule = manageUrl
    ? `\n\nNeed to reschedule or cancel? ${manageUrl}`
    : "";

  if (input.channel === "sms") {
    return { subject: null, body: renderSmsBody(input.skillId, firstName, business, bookingTitle, startsAt, businessPhone) };
  }

  // Email — per-skill body.
  switch (input.skillId) {
    case "booking-confirmation":
      return {
        subject: `Booking confirmed — ${bookingTitle}`,
        body:
          `Hi ${firstName},\n\n` +
          `Your appointment for ${bookingTitle} is confirmed for ${startsAt}.\n\n` +
          `We'll see you then.` +
          trailerReschedule +
          trailerEmail +
          `\n\n— The team at ${business}`,
      };
    case "booking-cancellation": {
      // Cancellation copy uses bookingPageUrl (NEW booking) rather
      // than the manage URL — the cancelled booking's manage page
      // would just confirm "cancelled" with no useful action.
      const newBookingUrl = pick(vars, "bookingPageUrl");
      return {
        subject: `Booking cancelled — ${bookingTitle}`,
        body:
          `Hi ${firstName},\n\n` +
          `Your booking for ${bookingTitle} on ${startsAt} has been cancelled.\n\n` +
          (newBookingUrl
            ? `If you'd like to reschedule, you can pick a new time here: ${newBookingUrl}\n\n`
            : ``) +
          trailerEmail +
          `\n\n— The team at ${business}`,
      };
    }
    case "booking-reminder-24h":
      return {
        subject: `Reminder — ${bookingTitle} tomorrow`,
        body:
          `Hi ${firstName},\n\n` +
          `Just a quick reminder — you're scheduled for ${bookingTitle} tomorrow at ${startsAt}.` +
          trailerReschedule +
          trailerEmail +
          `\n\n— The team at ${business}`,
      };
    case "intake-auto-reply":
      return {
        subject: `Thanks — we got your message`,
        body:
          `Hi ${firstName},\n\n` +
          `Thanks for reaching out to ${business}. We've received your information and someone will be in touch shortly.` +
          trailerEmail +
          `\n\n— The team at ${business}`,
      };
    default:
      // Generic fallback for any skill we haven't hand-templated.
      return {
        subject: `${business} — confirmation`,
        body:
          `Hi ${firstName},\n\n` +
          `We've received your request. Someone will be in touch shortly.` +
          trailerEmail +
          `\n\n— The team at ${business}`,
      };
  }
}

function renderSmsBody(
  skillId: string,
  firstName: string,
  business: string,
  bookingTitle: string,
  startsAt: string,
  businessPhone: string,
): string {
  // Char-budget aware — keep under 290 so the dispatcher's STOP footer
  // append (~27 chars) lands under 2 SMS segments. Each branch below
  // is checked locally; the dispatcher truncates if we somehow go over.
  switch (skillId) {
    case "booking-confirmation-sms":
    case "booking-confirmation":
      return `${business}: Hi ${firstName}, your ${bookingTitle} is confirmed for ${startsAt}.${businessPhone ? ` Questions? Call ${businessPhone}.` : ""}`;
    case "intake-auto-reply-sms":
    case "intake-auto-reply":
      return `${business}: Hi ${firstName}, thanks for reaching out. We'll be in touch shortly.${businessPhone ? ` Or call ${businessPhone}.` : ""}`;
    default:
      return `${business}: Hi ${firstName}, we received your request and will be in touch shortly.`;
  }
}
