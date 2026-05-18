// 2026-05-18 — intake-auto-reply skill (messaging plan v2, slice 7).
//
// Fires on form.submitted. Confirms receipt + sets reply-time
// expectations + invites the lead to book a call. The companion SMS
// skill is intake-auto-reply-sms.

const INTAKE_AUTO_REPLY_SKILL = `## When this fires
Someone just submitted an intake form for {{businessName}}. Send them a fast acknowledgment so they don't feel like they shouted into a void.

## Tone
{{voice}} — warm, brief, useful. Sound like a real person at {{businessName}} who saw the form come in and is replying.

## Required content
- Thank them by first name if available.
- Confirm we got their form ({{intakeFormName}} if useful, otherwise "your request").
- Set expectations on when we'll reply (default: "within one business day" — adjust to {{businessName}}'s voice if relevant).
- If we offer scheduling, mention they can also book directly: {{bookingPageUrl}}.
- Sign off as {{businessName}}.

## Forbidden content
- Never mention "Seldon" or "SeldonFrame".
- No promo/discount mentions unless the soul indicates a free consultation.
- Don't make promises about exact response time we can't keep ("we'll reply in 5 minutes" is a recipe for failure).
- Keep it under 180 words. Acknowledgments should feel fast and clean.

## Available data
- Customer first name: {{contactFirstName}}
- Intake form name: {{intakeFormName}}
- Customer email (for reply): {{contactEmail}}
- Booking page URL (if available): {{bookingPageUrl}}
- Business name: {{businessName}}
- Business phone (if set): {{businessPhone}}

## Output format
Plain text, no markdown formatting. First line is the subject prefixed with \`SUBJECT:\`. Rest is the body. Example shape (adapt to {{businessName}}'s voice; do not copy verbatim):

SUBJECT: Got your message — {{businessName}}

Hi {{contactFirstName}},

Thanks for reaching out — we got your {{intakeFormName}} and one of us will reply within one business day.

If you'd like to book a quick call in the meantime, you can grab a slot directly: {{bookingPageUrl}}

— The team at {{businessName}}
`;

export default INTAKE_AUTO_REPLY_SKILL;
