---
name: hero
version: 1.0.0
description: Above-the-fold hero with quantified value claim, primary CTA, and supporting visual.
surface: landing-section
section_type: hero
props:
  eyebrow:
    type: string
    required: false
    description: 2-5 word kicker above the headline. Often a category or proof. Optional.
  headline:
    type: string
    min: 4
    description: The single most important sentence on the page. Must contain quantification (number, %, ★, "free", "guaranteed", "same-day", "today", "instantly", proximity word). Prompt-guidance length 4-12 words.
  subhead:
    type: string
    min: 8
    description: One sentence. Specifies who the business is + what it does + supporting proof. Must mention the business name OR the city/neighborhood. Prompt-guidance length 8-30 words.
  cta_primary:
    type: object
    properties:
      label:
        type: string
        min: 2
        max: 40
        description: 2-4 words, action-oriented. e.g. "Book a Cut", "Get a Quote", "Schedule Service".
      href:
        type: enum
        enum: ["/book", "/intake"]
        description: MUST be exactly "/book" or "/intake". No external URLs.
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
        description: Must be "/book", "/intake", or a tel:... link. (Refinement enforced by validator at runtime since the union is irregular.)
  background_image_query:
    type: string
    min: 2
    description: Free-text Unsplash search query that matches the business's vertical. e.g. "barbershop interior warm light", "hvac technician outdoor unit", "law office consultation". Prompt-guidance length 2-5 words.
  background_video_query:
    type: string
    required: false
    min: 2
    description: 'v1.41.0 — Free-text Pexels video search query for the cinematic-aura variant (agency / coaching archetypes). Pick footage that matches the operator''s niche, not their literal vertical: an X-growth coach wants "phone scrolling social media" not "coach", a creative agency wants "abstract design motion" not "agency office". Prompt-guidance length 2-5 words. Ignored when variant != cinematic-aura.'
  shiny_word:
    type: string
    required: false
    min: 2
    max: 30
    description: 'v1.41.0 — One emphatic word from `headline` that gets the gradient-shiny italic treatment in the cinematic-aura variant. Pick the outcome word, the metric, the proper noun ("Pipeline", "Empire", "Future", "Booked", "Sold"). Case-insensitive first-match. Ignored when variant != cinematic-aura.'
  variant:
    type: enum
    required: false
    enum: ["split-image-right", "full-bleed", "founder-portrait", "cinematic-aura"]
    description: 'LEGACY layout variant. Prefer `template` for new workspaces — that uses the v1.43.0 hero template registry which produces production-quality designs. Variant kept as a fallback for the legacy static-HTML render path.'
  template:
    type: enum
    required: false
    enum:
      - cinematic-aura
      - viktor-light
      - velorah-editorial
      - nexora-light
      - securify-bold
      - stellar-tabs-white
    description: 'v1.44.0 — Hero template id. PICK ONE OF THESE FOR EVERY HERO unless the workspace is a tradesman / emergency-service business. The template controls the entire visual look of the hero — picking the right template matters more than perfect copy. See "Template catalog" below for what each one does + when to use it.'
validators:
  - rule: headline_quantified
    severity: error
    description: 'Headline must contain at least one of: a digit, %, ★, "free", "guaranteed", "same-day", "today", "instantly", "no-obligation", or a proximity phrase ("just off", "in [neighborhood]").'
  - rule: business_name_or_locality_in_subhead
    severity: error
    description: Subhead must contain the business name or the city/neighborhood. The hero must feel personal, not generic.
  - rule: cta_routes_internal
    severity: error
    description: cta_primary.href must equal "/book" or "/intake". cta_secondary.href must equal "/book", "/intake", or start with "tel:".
  - rule: no_throat_clearing
    severity: error
    description: Headline must NOT start with "Welcome to", "Your trusted", "Professional ... services", "Premier", "The leading".
  - rule: no_seldonframe_strings
    severity: error
    description: NEVER include "SeldonFrame", "AI-native", "Business OS", "Replace 5 Tools", or any other internal marketing language.
---

# Hero Block — generation prompt

You are generating the hero section of a small-business landing page. The
hero is the single most important surface on the site — visitors decide in
~3 seconds whether to scroll or bounce. Your job is to write copy that earns
the scroll.

## The mental model — Hormozi Value Equation

For every hero, mentally rank what you write against:

> Value = (Dream Outcome × Perceived Likelihood) / (Time × Effort)

A great headline maximizes the numerator (concrete outcome + visible proof)
and minimizes the denominator (fast + easy to act). Examples below show how.

## Voice rules (non-negotiable)

1. **Lead with quantification.** "Same-Day AC Repair, 4.8★ from 2,300+ Dallas
   Homeowners" beats "Phoenix's Most Trusted HVAC Team" every time. Numbers,
   timeframes, star ratings, risk-reversal words. If you can't quantify
   anything else, mention proximity ("Just off Notre-Dame", "In Griffintown
   since 2019").
2. **Be specific to THIS business, not the vertical.** "Barbershop services"
   is a generic. "Three Cuts. Real Care. Just Off Notre-Dame." is for Iron &
   Oak in particular.
3. **Skip throat-clearing.** Never start with "Welcome to", "Your trusted",
   "Professional X services", "Premier", "The leading". These are filler.
4. **Match the operator's actual voice.** A barbershop is conversational.
   A law firm is precise. A medspa is sensory. Read the input carefully.
5. **CTAs are verbs.** "Book a Cut", "Get a Quote", "Schedule Service" —
   not "Learn More", "Click Here", "Get Started".

## Worked examples

### Barbershop (local, conversational)

Input: Iron & Oak Barbershop, Griffintown Montreal, services: men's haircuts,
beard trims, kids cuts, since 2019.

```json
{
  "eyebrow": "Griffintown's Barbershop",
  "headline": "Three Cuts. Real Care. Just Off Notre-Dame.",
  "subhead": "Iron & Oak — your neighborhood barbershop in Griffintown since 2019. Walk-ins welcome Tuesday to Saturday.",
  "cta_primary": { "label": "Book a Cut", "href": "/book" },
  "cta_secondary": { "label": "Call Us", "href": "tel:5145551234" },
  "background_image_query": "barbershop interior warm light",
  "variant": "full-bleed"
}
```

### HVAC (trade, urgency-driven)

Input: Desert Cool, Phoenix AZ, services: AC repair, heating install, duct
cleaning. Reviews: 950, rating 4.7. Same-day service.

```json
{
  "eyebrow": "Phoenix HVAC, Trusted for 18 Years",
  "headline": "Same-Day AC Repair, 4.7★ from 950+ Phoenix Homeowners.",
  "subhead": "Desert Cool — emergency service in 90 minutes or it's free. Licensed, bonded, and insured across the Valley.",
  "cta_primary": { "label": "Get Service Today", "href": "/book" },
  "cta_secondary": { "label": "Free Estimate", "href": "/intake" },
  "background_image_query": "hvac technician residential unit phoenix",
  "variant": "full-bleed"
}
```

### Legal (professional, calm authority)

Input: Pemberton Family Law, Vancouver BC, services: divorce, custody,
mediation, estate planning. 20 years' experience.

```json
{
  "eyebrow": "Vancouver Family Law",
  "headline": "Twenty Years Helping Vancouver Families Through Hard Decisions.",
  "subhead": "Pemberton Family Law — clear advice, no pressure consultations, fixed-fee retainers when possible.",
  "cta_primary": { "label": "Book a Consultation", "href": "/book" },
  "cta_secondary": { "label": "Tell Us Your Situation", "href": "/intake" },
  "background_image_query": "law office consultation warm",
  "variant": "split-image-right"
}
```

### Coaching (personal, outcome-driven)

Input: Marian Reyes Career Coaching, remote, services: career transitions,
executive coaching. 12 years' practice.

```json
{
  "eyebrow": "Career Coaching, 12 Years",
  "headline": "Land the Next Role in 90 Days — or Your Money Back.",
  "subhead": "Marian Reyes — strategy, prep, and accountability for senior professionals navigating career change.",
  "cta_primary": { "label": "Book Discovery Call", "href": "/book" },
  "cta_secondary": { "label": "Take the Fit Quiz", "href": "/intake" },
  "background_image_query": "professional coaching conversation",
  "variant": "founder-portrait"
}
```

## v1.54 — Archetype-driven template selection (read this FIRST)

The workspace has been classified into one of 7 aesthetic archetypes
at server-side workspace creation. The classified id is available in
`context.aesthetic_archetype`. **Use this table verbatim** to pick the
`template` field — the server enforces it anyway, so deviating costs
you a round-trip without changing the rendered output.

| `context.aesthetic_archetype` | `template` field |
|--------------------------------|------------------|
| `"bold-urgency"`               | `""` (omit) — tradesmen use the legacy split-screen variant; no template fits the bold-urgency vibe yet |
| `"clinical-trust"`             | `"nexora-light"` |
| `"cinematic-aspirational"`     | `"cinematic-aura"` |
| `"editorial-warm"`             | `"viktor-light"` |
| `"technical-restrained"`       | `"viktor-light"` (or `"stellar-tabs-white"` when the workspace is clearly a SaaS product, or `"securify-bold"` for dev-tools) |
| `"soft-residential"`           | `"viktor-light"` |
| `"brutalist"`                  | `"securify-bold"` |

When `context.aesthetic_archetype` is `null` (pre-v1.54 workspaces),
fall back to the older archetype heuristics in the catalog below.
Picking the archetype-correct template means your `headline` /
`subhead` copy ends up matching the visual treatment (urgent and
imperative for bold-urgency, editorial and warm for editorial-warm,
cinematic and aspirational for cinematic-aspirational).

---

## Template catalog — pick ONE for the `template` field (v1.44.0)

The template controls the FULL visual treatment of the hero. Picking the
right template matters more than perfect copy. Match the archetype FIRST,
then the niche signal SECOND.

- **cinematic-aura** — DARK + looping Pexels video + Instrument Serif
  italic + cyan-gradient shimmery word. For: luxe coaching, medspa,
  wellness, fitness, premium salons, lifestyle. Sensory + aspirational.
- **velorah-editorial** — DARK + looping Pexels video + deep-navy wash
  + serif italic emphasis (softer than cinematic-aura, no gradient).
  For: luxe service businesses, premium coaches, creative studios that
  want cinematic motion without SaaS-shiny treatment.
- **viktor-light** — WHITE + Instrument Serif italic accents + narrow
  centered column + NO video. For: solo coaches, indie founders,
  freelance creatives, boutique agencies. Light editorial restraint.
- **nexora-light** — WHITE + Instrument Serif italic emphasis + custom
  CRM+booking dashboard mockup embedded below CTA. NO background video.
  For: B2B SaaS founders, productivity tools, agencies that run client
  back-office. The dashboard mockup IS the visual.
- **securify-bold** — PURE BLACK + looping Pexels video + HUGE staggered
  typography (3 chunks at corners-and-center) + stat blocks in corners.
  For: dev tools, data security, AI infra, hard-tech SaaS. Confidence +
  scale + no warmth.
- **stellar-tabs-white** — WHITE + dark-to-gray gradient on headline
  line 2 + 4-tab cycling product preview (Intake/Schedule/Convert/
  Deliver). NO background video. For: AI workspace platforms,
  multi-feature SaaS, productivity suites.

### Archetype → template guidance

- cinematic-aspirational (medspa/wellness/lifestyle/coaching) → **cinematic-aura** (default)
  OR velorah-editorial when the brand wants editorial > sensory
- technical-restrained (B2B/agency/consultancy) → **viktor-light** (default for
  coach/agency) OR nexora-light (if the workspace IS a SaaS product) OR
  stellar-tabs-white (if multi-feature AI tool) OR securify-bold (if dev tools)
- editorial-warm (craft / family-owned) → **viktor-light**
- clinical-trust (legal/dental/medical) → **nexora-light**
- soft-residential (cleaning/landscape) → **viktor-light**
- bold-urgency (HVAC/plumbing/locksmith) → **omit template** — tradesmen
  fall back to the legacy split-image-right variant
- brutalist (creative studios) → **securify-bold**

### Required field combinations per template

| Template | Requires `background_video_query` | Uses `shiny_word` |
| --- | --- | --- |
| cinematic-aura | yes | yes (cyan gradient shimmer) |
| velorah-editorial | yes | yes (serif italic muted) |
| viktor-light | no | yes (serif italic muted) |
| nexora-light | no | yes (serif italic muted) |
| securify-bold | yes | no (3-chunk auto-split) |
| stellar-tabs-white | no | yes (split point for gradient line 2) |

When you pick a template that requires `background_video_query`, ALWAYS
include one — pick motion-rich, niche-matched footage that conveys the
operator's outcome, not a literal vertical photo. Examples:
- fitness coach → "sunset beach running"
- X-growth coach for indie devs → "code on screen close up" or
  "phone scrolling social media"
- medspa → "spa water reflection slow"
- creative agency → "abstract design motion graphics"
- dev tools → "data center server racks" or "terminal cursor blinking"

**Tie-break rule:** when unsure between two templates, pick LIGHTER for
B2B/agency/coach workspaces and DARKER for lifestyle/luxe.

## Output format

Return ONLY a single JSON object matching the props schema in the
frontmatter. No prose, no markdown fences, no explanation. The persistence
endpoint runs `JSON.parse` on your output directly.

If the input lacks information needed to satisfy `headline_quantified`
(no review count, no city, no risk-reversal claim, nothing concrete), pick
the most specific concrete element you DO have (the founder's tenure, the
neighborhood, the years in business) and use that as the proof. Never
invent numbers.
