// 2026-05-18 — booking-confirmation-sms skill (messaging plan v2, slice 3).
//
// SMS sibling of booking-confirmation (email). Same intent, much
// tighter budget: 160 chars per segment, and we want to fit in ONE
// segment whenever possible (multi-segment SMS costs more per send +
// looks like spam to carriers).
//
// The dispatcher auto-appends " Reply STOP to unsubscribe." at send
// time (compliance — see lib/messaging/dispatch.ts). The skill prose
// MUST account for that footer in the length budget — instructs the
// LLM to leave room.

const BOOKING_CONFIRMATION_SMS_SKILL = `## When this fires
A customer just booked an appointment with {{businessName}}. Send them a tight, friendly text confirmation immediately.

## Tone
{{voice}} — sound like a real person texting from {{businessName}}, not a marketing blast.

## Required content
- Confirm the appointment: title + date/time in their local timezone.
- Include the booking page URL for reschedule.
- Sign off with the business name (no "— The team at..." in SMS, just "— {{businessName}}").

## Forbidden content
- Never mention "Seldon" or "SeldonFrame".
- No promo/discount mentions unless in booking metadata.
- No emoji unless the {{voice}} explicitly calls for them.
- Don't ask the customer to reply to confirm — already confirmed.

## Hard length cap
Output MUST be under 200 characters TOTAL. The system auto-appends " Reply STOP to unsubscribe." (about 27 chars) so leaving room for the footer is mandatory. Going over the cap means the message gets rejected and re-composed; budget tightly.

## Available data
- Customer first name: {{contactFirstName}}
- Appointment title: {{bookingTitle}}
- Starts at (local time): {{bookingStartsAtLocal}}
- Booking page URL (for reschedule/cancel): {{bookingPageUrl}}
- Business name: {{businessName}}

## Output format
Plain text only. No SUBJECT: line, no markdown, no quotes around the message. Just the SMS body.

Example shape (don't copy verbatim, adapt to {{businessName}}'s voice):

Hi {{contactFirstName}}, you're booked for {{bookingTitle}} on {{bookingStartsAtLocal}}. Reschedule: {{bookingPageUrl}} — {{businessName}}
`;

export default BOOKING_CONFIRMATION_SMS_SKILL;
