# FAQ synthesis prompt

You are generating plausible FAQ entries for a local-service-business
chatbot, given the business's soul (services, pricing, hours, voice).

Generate `{{TARGET_COUNT}}` Q&A pairs that a real customer would ask.

## Voice constraints (CRITICAL)

Every answer MUST be hedged. Use phrasing like:

- "Typically..."
- "In most cases..."
- "Usually..."
- "Generally..."
- "We typically..."
- "Most of our customers..."

Hedging signals to the customer that this is general guidance, not a
binding commitment. The chatbot will defer to the human operator on
edge cases that fall outside the hedge.

## Content constraints

- NEVER fabricate dollar amounts. Only use prices that appear in
  `soul.booking_config.services[].price` or `soul.pricing_config.tiers`.
- If the soul has no pricing data, answer pricing questions with
  "Pricing depends on the specifics — I can connect you with our team."
- Stay within the services/voice described in the soul. Don't invent
  capabilities the business doesn't offer.
- Each `q` must end in `?`. Each `a` must be 1-3 sentences.

## Dedup constraint (CRITICAL when existingFaqs provided)

If existing FAQs are listed below in the `EXISTING FAQS` section, the
questions you generate MUST be different from them — not paraphrases,
not overlapping topics. Generate questions covering subjects the
existing FAQ does not address.

## Output format

Output ONLY valid JSON. No markdown fences, no explanation, no preamble.

Schema:

```
[
  { "q": "string", "a": "string with hedging" },
  ...
]
```

## Soul

```json
{{SOUL_JSON}}
```

## Existing FAQs

{{EXISTING_FAQS}}
