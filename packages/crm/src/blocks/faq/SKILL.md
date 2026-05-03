---
name: faq
version: 1.0.0
description: Frequently-asked-questions section addressing the actual concerns that block visitors from booking — pricing, scheduling, what to expect, scope, refunds.
section_type: faq
props:
  headline:
    type: string
    required: true
    min_words: 2
    max_words: 8
    description: Section heading. Specific to the business when possible ("Common Questions Before Your First Cut", "What Homeowners Ask Most"). Avoid generic "Frequently asked questions".
  items:
    type: array
    required: true
    min_items: 4
    max_items: 8
    description: 4-8 question/answer pairs. Each must address a real friction point a visitor has BEFORE booking — not a sales pitch.
    item_schema:
      question:
        type: string
        min_words: 3
        max_words: 15
        description: Phrased as the visitor would actually ask it ("What does a haircut cost?" not "What is your pricing structure?"). First-person ("Do I need..." or "Can I...") is good.
      answer:
        type: string
        min_words: 15
        max_words: 80
        description: 1-3 sentences. Direct answer first, then context. End with a soft next-step when natural ("Just call ahead.", "Mention this when you book.").
validators:
  - rule: questions_are_visitor_phrasings
    severity: warn
    description: Questions must read like a customer would type them, not like a marketing site. Strong tells of bad phrasing - "What is your approach to ...", "How do you ensure ...", "What sets us apart".
  - rule: answers_address_friction
    severity: warn
    description: Each answer must address a real friction (price, time, parking, prep, refund, what-to-bring, age-restrictions, language, accessibility). NOT a sales pitch ("We are committed to excellence").
  - rule: no_coaching_leak
    severity: error
    description: NEVER include the placeholder coaching FAQ phrasings - "How long is a typical engagement", "What's your approach", "What are your qualifications". These are the JSON-template defaults the v1 pipeline leaked into non-coaching workspaces.
  - rule: headline_specific
    severity: warn
    description: Headline should NOT be exactly "Frequently asked questions", "FAQ", "FAQs", "Common questions". Restate as something specific to the business or audience.
---

# FAQ Block — generation prompt

You are generating the FAQ section. The job is not "show generic Q&A" —
it is to remove the specific objections in the visitor's head right before
they bounce.

## The mental model

A visitor's last 5 thoughts before booking are usually:

1. "What's it going to cost me?"
2. "How long does this take / when can I get in?"
3. "What if I'm not sure what I need?"
4. "What if I change my mind / don't show up / want a refund?"
5. "Where exactly is this / how does it work?"

A great FAQ answers 4-6 of those *for this specific business*. A bad FAQ
puffs about company values.

## Voice rules

1. **Question phrasing matches how a customer types.** "What does a cut
   cost?" or "Do I need to book ahead?" — not "What is your pricing
   structure?" or "Is appointment scheduling required?".
2. **Answer the friction, not the sales pitch.** If the question is "what's
   it cost", answer with a number range, not "we offer competitive pricing".
3. **Lead with the direct answer.** First sentence resolves the question.
   Subsequent sentences add context.
4. **Specificity earns trust.** "Cuts run $35-65, beards $25, combos $65" is
   trust-building. "Pricing varies by service" is not.
5. **Skip the throat-clearing.** No "Great question!", no "We're glad you
   asked", no "Our commitment to ...".

## What FAQ items belong (by archetype)

**Local service trade** (HVAC, plumbing, electrical, landscaping):
- "How fast can you come out?" / response time + emergency policy
- "Is the diagnostic free?" / pricing transparency
- "Do you stand behind your work?" / warranty / guarantee
- "What areas do you serve?" / service radius
- "What if I'm not satisfied?" / refund / re-do policy

**Personal care** (barbershop, salon, spa, dental):
- "What does it cost?" / price ranges
- "Do you take walk-ins?" / scheduling policy
- "What if I'm late?" / late / no-show policy
- "How do I know what to ask for?" / for first-timers
- "Where do I park?" / location specifics

**Professional services** (legal, accounting, consulting):
- "Is the first consultation free?" / intake policy
- "How are you different from other [vertical] firms?" / positioning
- "What are your fees?" / pricing structure (hourly / fixed / contingency)
- "How long until you can take my case / file?" / responsiveness
- "Do I need to bring anything to the consultation?" / prep

**Coaching / education**:
- "Who is this for?" / target audience
- "What does a typical engagement look like?" / cadence + length
- "How much does it cost?" / pricing tiers
- "What kind of results do clients see?" / outcomes
- "What if it's not a fit?" / refund policy

## Worked examples

### Barbershop

```json
{
  "headline": "Common Questions Before Your First Cut",
  "items": [
    {
      "question": "What does a cut cost?",
      "answer": "Men's cuts run $45, beard trims $25, combo $65. Kids cuts $35. Cash and card both fine. We don't surprise you at the chair."
    },
    {
      "question": "Do you take walk-ins?",
      "answer": "Walk-ins are welcome Tuesday through Saturday — but Saturdays book up fast. Booking ahead means no wait."
    },
    {
      "question": "What if I don't know what cut I want?",
      "answer": "Bring a reference photo, or sit down and we'll talk through it. Most first-time clients leave with the cut their barber recommended after seeing how their hair actually grows."
    },
    {
      "question": "Where do I park?",
      "answer": "Street parking on Notre-Dame and Peel — usually free after 6pm and on Sundays. There's a paid lot one block south on William."
    },
    {
      "question": "What's your no-show policy?",
      "answer": "First no-show is on us. After that, we'll ask for a $15 deposit on future bookings. Cancel anytime up to 2 hours ahead, no charge."
    }
  ]
}
```

### HVAC

```json
{
  "headline": "What Phoenix Homeowners Ask Most",
  "items": [
    {
      "question": "How fast can you come out for an emergency?",
      "answer": "Inside the Phoenix Valley, we guarantee 90-minute response on weekday emergencies. If we don't show in 90 minutes, the diagnostic is free."
    },
    {
      "question": "Is the diagnostic free?",
      "answer": "Free with any repair. $89 standalone. We tell you the cost before we start any work — no surprises on the invoice."
    },
    {
      "question": "Do you offer financing on installs?",
      "answer": "Yes. 0% APR for 18 months on full system installations through our finance partner. We can run pre-approval over the phone in under 5 minutes."
    },
    {
      "question": "What's your warranty?",
      "answer": "Two-year labor warranty on every install, plus the manufacturer's parts warranty (typically 10 years on compressors). All written into the contract."
    },
    {
      "question": "What areas do you serve?",
      "answer": "Phoenix, Scottsdale, Tempe, Mesa, and Chandler. Outside that we can usually still help — call us and we'll be honest about whether it makes sense."
    }
  ]
}
```

### Legal

```json
{
  "headline": "Before You Call Us",
  "items": [
    {
      "question": "Is the first consultation free?",
      "answer": "First 30 minutes are free, in person or by phone. We use that time to understand your situation and tell you whether we're the right fit — no obligation either way."
    },
    {
      "question": "How are your fees structured?",
      "answer": "Family law matters use fixed-fee retainers when the scope is predictable, hourly billing when it isn't. We always quote in writing before any work begins."
    },
    {
      "question": "How long does a divorce take?",
      "answer": "Uncontested divorces typically resolve in 4-6 months in BC. Contested matters depend on the complexity — we'll give you a realistic timeline at the consultation."
    },
    {
      "question": "What should I bring to the consultation?",
      "answer": "Any documents related to your situation: marriage certificate, prior court orders, financial statements. If you don't have them yet, come anyway — we can guide you on what to gather."
    },
    {
      "question": "Do you take cases outside Vancouver?",
      "answer": "We practice across the Lower Mainland and can appear remotely in most BC courts. For matters outside the province, we'll refer you to trusted counsel."
    }
  ]
}
```

## Output format

Return ONLY a single JSON object matching the props schema. No prose, no
markdown fences.

If the input doesn't give you enough specifics to answer real frictions
(no pricing, no service radius, no scheduling info), generate questions
based on the vertical's standard frictions and write answers that say
"call us for X" rather than inventing details. Honesty beats fake
specificity — operators can edit later, but invented numbers cause
trust crises on day one.
