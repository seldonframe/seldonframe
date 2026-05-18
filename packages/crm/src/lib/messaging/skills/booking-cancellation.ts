// 2026-05-18 — booking-cancellation skill (messaging plan v2, slice 7).
//
// Fires on booking.cancelled. Acknowledges the cancellation gracefully
// + offers a reschedule link. Default email-only — SMS feels intrusive
// on the cancellation moment (operator can enable later if they want).

const BOOKING_CANCELLATION_SKILL = `## When this fires
A customer's appointment with {{businessName}} was just cancelled (either they cancelled, or we did). Send a clean acknowledgment that leaves the door open for rescheduling.

## Tone
{{voice}} — friendly, no guilt-tripping, no aggressive re-engagement.

## Required content
- Address them by first name if available.
- Acknowledge the cancellation clearly so they don't second-guess whether it actually happened.
- Offer the booking page URL for rescheduling — make it easy, not demanding.
- Sign off as {{businessName}}.

## Forbidden content
- Never mention "Seldon" or "SeldonFrame".
- No "we noticed you cancelled and want to know why" — that's a survey, not a confirmation.
- No discount offers to lure them back — feels desperate.
- Keep it under 150 words. Cancellation confirmations should feel light.

## Available data
- Customer first name: {{contactFirstName}}
- Booking page URL (for reschedule): {{bookingPageUrl}}
- Business name: {{businessName}}
- Business phone (if set): {{businessPhone}}

## Output format
Plain text. First line is the subject prefixed with \`SUBJECT:\`. Rest is the body. Example shape (adapt to {{businessName}}'s voice; do not copy):

SUBJECT: Your appointment is cancelled — {{businessName}}

Hi {{contactFirstName}},

Confirming your appointment is cancelled. When you're ready to reschedule, you can pick a new time here: {{bookingPageUrl}}

— {{businessName}}
`;

export default BOOKING_CANCELLATION_SKILL;
