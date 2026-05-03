---
name: cta
version: 1.0.0
description: Mid-page call-to-action — a focused conversion moment between sections. Singular outcome, low friction, urgency without pressure.
surface: landing-section
section_type: mid-cta
props:
  headline:
    type: string
    min: 4
    description: One-line value claim that re-states why to act now. Quantification + urgency. Not a generic "Get started today". Prompt-guidance length 4-12 words.
  subhead:
    type: string
    required: false
    description: Optional one sentence reinforcing the headline with proof or risk-reversal. Prompt-guidance max 25 words.
  cta_primary:
    type: object
    properties:
      label:
        type: string
        min: 2
        max: 40
        description: 2-4 words, action-oriented. Match the operator's primary action ("Book a Cut", "Get a Free Estimate", "Start Coaching").
      href:
        type: enum
        enum: ["/book", "/intake"]
        description: MUST be exactly "/book" or "/intake".
  cta_secondary:
    type: object
    required: false
    properties:
      label:
        type: string
        min: 2
        max: 40
      href:
        type: string
        description: Must be "/book", "/intake", or a tel:... link. (Refinement enforced by validator at runtime.)
validators:
  - rule: headline_quantified_or_urgent
    severity: warn
    description: Headline should contain at least one of - a number, %, ★, "today", "same-day", "free", "guaranteed", "risk-free", "this week", or a specific deadline word.
  - rule: cta_routes_internal
    severity: error
    description: cta_primary.href must be /book or /intake.
  - rule: not_a_hero_clone
    severity: warn
    description: Headline should NOT be identical or near-identical to the hero headline. The mid-cta is a SECOND chance to convert; if it's the same line, it adds no value.
  - rule: no_throat_clearing
    severity: error
    description: Headline must NOT start with "Welcome", "Your trusted", "Premier", "The leading", "We are committed".
---

# CTA Block — generation prompt

You are generating the mid-page call-to-action. The visitor has scrolled
past the hero and through the services. They're considering. The CTA's
job is to give them one more reason to click NOW.

## The mental model

A great mid-CTA acknowledges what the visitor just learned. The hero
introduced you. The services and FAQ explained the offer. The CTA closes:

> "OK you've seen what we do, here's what to do next, and here's why
> doing it now matters."

Bad CTAs are throat-clearing ("Get started today!"). Good CTAs are a
*specific reason* the next step is worth taking.

## Voice rules

1. **Re-state the value, don't repeat the hero.** Hero says "Same-Day AC
   Repair, 4.7★ from 950+ Phoenix Homes." CTA might say "90 Minutes from
   Call to Cool Air. Guaranteed." — same business, different angle.
2. **Urgency without pressure.** "Same-day appointments often available"
   is honest urgency. "ACT NOW BEFORE PRICES GO UP!!" is sleazy.
3. **Specific button labels.** "Book a Consultation" is good. "Schedule
   Discovery Call" is good. "Click Here" / "Get Started" / "Learn More"
   are bad — they don't say what happens.
4. **Match the operator's primary action.** If they take bookings, primary
   is "/book". If they're consultative (legal, coaching), primary might
   be "/intake" with /book as secondary.

## Worked examples

### Mobile dog grooming

```json
{
  "headline": "Same-Day Grooming, Often Available This Week.",
  "subhead": "Most weekday mornings open in Brooklyn — pick a slot, we'll be in your driveway.",
  "cta_primary": { "label": "Book a Grooming", "href": "/book" },
  "cta_secondary": { "label": "Tell Us About Your Dog", "href": "/intake" }
}
```

### HVAC (urgency-driven)

```json
{
  "headline": "90 Minutes from Call to Cool Air. Guaranteed.",
  "subhead": "Inside the Phoenix Valley, weekday emergencies get a 90-minute response or the diagnostic is on us.",
  "cta_primary": { "label": "Get Service Today", "href": "/book" },
  "cta_secondary": { "label": "Free Estimate", "href": "/intake" }
}
```

### Legal (low-pressure, consultative)

```json
{
  "headline": "Free 30-Minute Consultation, In Person or by Phone.",
  "subhead": "We'll listen, give you our honest read on your options, and tell you whether we're the right fit. No obligation.",
  "cta_primary": { "label": "Book a Consultation", "href": "/book" },
  "cta_secondary": { "label": "Tell Us Your Situation", "href": "/intake" }
}
```

### Coaching (outcome-led)

```json
{
  "headline": "Land the Next Role in 90 Days — or It's Free.",
  "subhead": "Strategy, prep, and weekly accountability. Money-back guarantee if you don't have a signed offer in 90 days.",
  "cta_primary": { "label": "Book Discovery Call", "href": "/book" },
  "cta_secondary": { "label": "Take the Fit Quiz", "href": "/intake" }
}
```

## Output format

Return ONLY a single JSON object matching the props schema.

If the operator's input has no quantifiable claim (no review count, no
guarantee, no response time), use specificity instead — neighborhood,
years in business, a "what we don't do" promise. Honesty beats fake
urgency.
