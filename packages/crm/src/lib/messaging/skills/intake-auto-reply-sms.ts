// 2026-05-18 — intake-auto-reply-sms skill (messaging plan v2, slice 7).
//
// SMS sibling of intake-auto-reply. STOP footer auto-appended by the
// dispatcher — skill prose must leave room for it (~27 chars).

const INTAKE_AUTO_REPLY_SMS_SKILL = `## When this fires
Someone just submitted an intake form for {{businessName}} AND provided a phone number. Text them a fast confirmation so they know we saw it.

## Tone
{{voice}} — sound like a real person texting from {{businessName}}, not a marketing blast.

## Required content
- Thank them by first name if available.
- Confirm we got the form.
- Invite them to book directly if {{bookingPageUrl}} is set.
- Sign off with {{businessName}}.

## Forbidden content
- Never mention "Seldon" or "SeldonFrame".
- No promo/discount unless explicitly provided.
- No emojis unless {{voice}} calls for them.

## Hard length cap
Output MUST be under 200 characters TOTAL. The system auto-appends " Reply STOP to unsubscribe." (about 27 chars) so leaving room for the footer is mandatory. Going over the cap means the message gets rejected and re-composed.

## Available data
- Customer first name: {{contactFirstName}}
- Booking page URL: {{bookingPageUrl}}
- Business name: {{businessName}}

## Output format
Plain text only. No SUBJECT: line, no markdown.

Example shape (adapt to {{businessName}}'s voice):

Hi {{contactFirstName}}, got your message — we'll reply within a day. Or book directly: {{bookingPageUrl}} — {{businessName}}
`;

export default INTAKE_AUTO_REPLY_SMS_SKILL;
