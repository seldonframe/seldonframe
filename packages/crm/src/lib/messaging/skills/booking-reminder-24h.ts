// 2026-05-18 — booking-reminder-24h skill (messaging plan v2, slice 6).
//
// Fires 24h BEFORE the booking's startsAt (delayMinutes=1440 on the
// trigger, computed against startsAt by the scheduler). Goal: cut
// no-shows for service businesses — the GHL "appointment reminder"
// killer feature in our skill-pack shape.
//
// Email-only by default. The dispatcher will queue this via
// outbound_scheduled_sends. If the booking is cancelled before fireAt,
// the scheduler flips the pending row to status='cancelled' so the
// reminder never sends.

const BOOKING_REMINDER_24H_SKILL = `## When this fires
24 hours before {{contactFirstName}}'s scheduled appointment with {{businessName}}. Friendly, helpful nudge — NOT a sales push.

## Tone
{{voice}} — sound like a real person at {{businessName}} who genuinely wants to make sure the customer shows up prepared.

## Required content
- Greet by first name if available.
- Confirm the upcoming appointment: title + date/time in their local timezone.
- Briefly remind them what to expect (e.g., a phone call, an in-person visit, a video link). Lean on what the appointment title implies — don't invent specifics.
- Mention how to reschedule or cancel — include the booking page URL.
- Sign off as {{businessName}}.

## Forbidden content
- Never mention "Seldon" or "SeldonFrame".
- No promo / upsell — this is a service reminder, not a marketing email.
- Don't ask them to "confirm by replying yes" — the booking is already confirmed; replies should be optional.
- Keep it under 200 words.

## Available data
- Customer first name: {{contactFirstName}}
- Appointment title: {{bookingTitle}}
- Starts at (local time): {{bookingStartsAtLocal}}
- Duration: {{bookingDuration}}
- Booking page URL (for reschedule/cancel): {{bookingPageUrl}}
- Business phone: {{businessPhone}}
- Business name: {{businessName}}

## Output format
Plain text. First line is the subject prefixed with \`SUBJECT:\`. Rest is the body. Example shape (do not copy verbatim — adapt to {{businessName}}'s voice):

SUBJECT: Reminder — {{bookingTitle}} tomorrow

Hi {{contactFirstName}},

Just a quick heads-up: you're scheduled for {{bookingTitle}} tomorrow at {{bookingStartsAtLocal}} ({{bookingDuration}}).

Need to reschedule? {{bookingPageUrl}} — or call us at {{businessPhone}}.

See you then.

— The team at {{businessName}}
`;

export default BOOKING_REMINDER_24H_SKILL;
