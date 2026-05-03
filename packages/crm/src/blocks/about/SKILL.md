---
name: about
version: 1.0.0
description: About-the-business section — who they are, why they started, what makes them specific. Trust-building, not corporate.
surface: landing-section
section_type: about
props:
  headline:
    type: string
    min: 2
    description: Section heading. Conversational. NOT "About us" / "Our story" / "Who we are" — those are placeholders. Prompt-guidance length 2-8 words.
  body:
    type: string
    min: 30
    description: 2-4 sentences. First-person OR third-person — match the operator's voice. Should mention the founder/team, the city, and at least one specific detail (years, certification, what they DON'T do, why they started). Prompt-guidance length 30-90 words.
  owner_name:
    type: string
    required: false
    description: Optional. The owner / founder name to surface in the section's byline.
  owner_title:
    type: string
    required: false
    description: Optional. The owner's role ("Owner & Lead Groomer", "Founder", "Head of Strategy").
  photo_query:
    type: string
    required: false
    description: Optional Unsplash query for the about-section photo. e.g. "barber portrait apron", "small business owner shop". Skip if no good photo fits. Prompt-guidance length 2-5 words.
validators:
  - rule: headline_not_generic
    severity: error
    description: Headline must NOT be exactly "About us", "About", "Our story", "Who we are", "Meet the team". Restate as something specific.
  - rule: body_specificity
    severity: warn
    description: Body must contain at least one of - a number (years, projects, customers), a city/neighborhood name, a credential (certified, licensed), or a "what we don't do" statement. Generic bodies ("We pride ourselves on quality") fail this check.
  - rule: no_corporate_phrases
    severity: error
    description: Body must NOT contain "We pride ourselves", "industry-leading", "best-in-class", "state-of-the-art", "world-class", "cutting-edge", "synergy", "ecosystem".
---

# About Block — generation prompt

You are generating the about section. This is where the visitor decides
whether you're a real human business worth their trust, or a generic
template they should bounce from.

## The mental model

Visitors skim about sections looking for ONE thing: *evidence this is a real
business with a specific person behind it*. Generic copy ("We provide
quality services since X") signals "this could be anyone." Specific copy
("I left a corporate job in 2017 to start grooming dogs out of my own
driveway, then bought the van two years later") signals trust.

## Voice rules

1. **Specificity beats polish.** Concrete numbers, years, neighborhoods,
   what you DON'T do. "Just dog grooming, no boarding, no daycare" tells
   me you focus.
2. **Person, not company.** Even when the business is a company, surface
   the human behind it. "Marc has been cutting hair in Griffintown for
   nine years" beats "Iron & Oak is a barbershop committed to quality."
3. **Match the operator's actual voice.** A barbershop is conversational
   ("we"), a law firm is precise ("Pemberton Family Law"), a coach is
   personal ("I").
4. **Headline is conversational.** "How we got started", "Why we're
   different", "What you should know" — not "About us".
5. **No filler phrases.** No "We pride ourselves", "industry-leading",
   "passionate about excellence". These are noise that erodes trust.

## Worked examples

### Mobile dog grooming (the Pawsh & Polish niche)

```json
{
  "headline": "How We Got Started",
  "body": "Pawsh & Polish started in 2017 when Lara left a corporate grooming chain to do something better — one dog at a time, no kennels, no waiting rooms. The van came in 2019 after enough Brooklyn customers asked her to come to their door. She's still the only groomer in the van. Same dog, same person, every visit.",
  "owner_name": "Lara Mendez",
  "owner_title": "Owner & Certified Master Groomer",
  "photo_query": "groomer with dog van interior"
}
```

### HVAC

```json
{
  "headline": "Why Phoenix Calls Us First",
  "body": "Desert Cool is family-owned, two-truck, third-generation. Mike's grandfather started fixing swamp coolers in 1968. Today we run two trucks across the Valley — Mike on residential, his son Tom on commercial. We don't subcontract. We don't pad invoices. We answer the phone ourselves before 9pm, every day.",
  "owner_name": "Mike Reyna",
  "owner_title": "Owner & Master Technician",
  "photo_query": "hvac technician portrait truck"
}
```

### Legal

```json
{
  "headline": "What Twenty Years Taught Us",
  "body": "Pemberton Family Law has practiced exclusively in family law since 2004 — divorce, custody, mediation, estates. We don't take car accidents, we don't take criminal. We do one thing because it's the only way to do it well. Most matters resolve outside court; when they don't, we're prepared.",
  "owner_name": "Sarah Pemberton",
  "owner_title": "Founder & Senior Counsel",
  "photo_query": "lawyer office portrait Vancouver"
}
```

### Coaching

```json
{
  "headline": "Why I Started Coaching",
  "body": "I spent twelve years in tech leadership, then watched too many friends drift through bad-fit careers because they didn't have anyone to think it through with. So I built a coaching practice for senior professionals navigating change. Strategy, prep, accountability — for one person at a time. No group programs, no funnels.",
  "owner_name": "Marian Reyes",
  "owner_title": "Career Coach",
  "photo_query": "coach professional portrait warm"
}
```

## Output format

Return ONLY a single JSON object matching the props schema. No prose, no
markdown fences. The persistence endpoint runs `JSON.parse` directly.

If the operator gave you minimal context (no founder name, no founding
year), don't invent. Use what they provided + the city/services to write
a true-but-concrete body. "Operating in Brooklyn since 2017" is better
than "Founded in 2017 by John Smith" if you don't actually know there's
a John Smith.
