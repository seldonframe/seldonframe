---
name: cinematic-landing
version: 1.0.0
description: Dark cinematic landing system — looping Pexels MP4 background + liquid-glass UI + Instrument Serif italic typography + Framer Motion choreography. Auto-applied to agency + cinematic-aspirational (coaching, medspa, wellness, luxury) archetypes during create_full_workspace. The marketplace-forkable "fat skill" that captures the entire Aura / Velorah / Aethera / Asme aesthetic family.
surface: landing-aesthetic
applies_to:
  - hero
  # Phase 2 will extend to: about, services, testimonials, pricing, cta
phase: 1
archetypes:
  - cinematic-aspirational
  - technical-restrained
fat_skill: true
---

# Cinematic Landing — design system + composition rules

This is a **fat skill**: the markdown is most of the value. The runtime code
under `components/landing/cinematic/` is a few hundred lines of CSS + four
small React primitives. Everything that makes a cinematic landing *feel*
cinematic — the design tokens, the motion timings, the copy patterns, the
Pexels query strategy — lives here. Smarter Claude models produce better
landings from the same spec without any code change.

The skill auto-applies to two archetypes during `create_full_workspace`:

- **cinematic-aspirational** — coaching, medspa, wellness, fitness, salons,
  premium lifestyle, anywhere the customer buys the dream before the service
- **technical-restrained** — marketing/dev agencies, consultancies,
  technical SaaS, fractional executives, anywhere the buyer is sophisticated
  and the work itself signals quality

For other archetypes the hero falls back to the previous variant
(`left-aligned-asymmetric`, `split-screen-50-50`, `cinematic-fullbleed`,
`founder-portrait`). A craft-roofer doesn't need a cinematic video hero;
their proof is the work itself.

## The four pillars

A page is "cinematic" when **all four** are present. Each is independent —
adding three of four feels off; adding all four feels like Aura.

### 1. Looping MP4 background (full-bleed)

- Sourced from Pexels via `searchPexelsVideo()` in `lib/assets/pexels.ts`
- One call per workspace creation, URL persisted into the hero JSONB
  (the rendered page hits Pexels' CDN directly forever after — no live
  API calls at render time)
- HD MP4 ≤1080p, ≤30s duration, landscape orientation
- Wrapped in the `FadingVideo` component (rAF-driven 500ms crossfade at
  start + 0.55s lead-out before end → seamless manual loop, no CSS jank)
- A subtle bottom-up gradient overlay (`from-black/30 via-black/10 to-black/55`)
  for headline legibility — Aura ran no overlay but our copy is longer and
  the safety margin is worth it
- Bottom-right `Video by NAME on Pexels` attribution pill (required by
  Pexels licence; rendered in `text-white/60` so it doesn't fight the
  composition)

### 2. Liquid-glass chrome

Two variants of the same glass treatment, defined in
`components/landing/cinematic/styles.css`:

- `.cin-liquid-glass` — subtle (4px blur) for badges, secondary CTA pills,
  chip tags, card surfaces
- `.cin-liquid-glass-strong` — heavy (50px blur) for the primary CTA only

The glass effect comes from a `::before` pseudo-element with a vertical
white-fade gradient masked to a 1.4px border. Pure CSS, zero JS.

### 3. Instrument Serif italic typography

The headline (and only the headline) renders in Instrument Serif. Italic
treatment on the shiny word (see below) is what gives the cinematic genre
its signature look. Body copy stays in the page's archetype-default body
font (typically Geist) for legibility.

### 4. Framer Motion entrance choreography

Layered staggered entrances:

1. Badge: 0ms, `fade up y:10 → 0`, duration 0.5s
2. Headline: 100ms, word-by-word blur-in via `BlurText` (3-step keyframe
   blur 10→5→0, opacity 0→0.5→1, y 50→-5→0, per-word stagger 100ms)
3. Subhead: 500ms, `fade up y:16 → 0`, duration 0.6s
4. Proof tile: 600ms
5. CTAs: 700ms

Past the entrance, the only running animation is the shiny-word gradient
shimmer (6s linear infinite, pure CSS).

## Headline copy rules (cinematic-aware)

The hero block's universal Hormozi rules still apply (quantification,
specificity, no throat-clearing). On top of those:

- **Pick one shiny word.** The gradient-shiny treatment works best on
  exactly one word per headline. Two words feels noisy; zero words feels
  like a missed opportunity. Pick the **outcome noun** — what the visitor
  actually wants to walk away with.
- **Lean italic-friendly.** Instrument Serif italic is gorgeous on nouns
  and verbs; awkward on numbers and acronyms. "Pipeline" reads beautifully
  italicized; "401k" doesn't. If the proof IS a number, put it in the
  kicker or subhead, not the headline word that gets the shiny treatment.
- **Two-line headlines work best.** The Aura reference uses "Your email."
  + "Revitalized." Two lines of ~3 words each beats one line of 6 words in
  the cinematic genre. Both lines render via `BlurText` as a single string;
  the layout flex-wraps naturally.

## Pexels query patterns (per archetype)

The Pexels API returns its best match for a 2-5 word query. Match the
operator's outcome, not their literal vertical.

### cinematic-aspirational (coach, medspa, wellness, lifestyle)

| Niche                  | Query                              |
| ---------------------- | ---------------------------------- |
| Fitness coach          | sunset beach running               |
| X / social growth coach| phone scrolling social media       |
| Executive / career coach| city skyline office window         |
| Medspa / dermatology   | spa water reflection slow          |
| Yoga studio            | yoga sunrise studio                |
| Wellness / holistic    | candle flame slow motion           |
| Luxury salon           | hair flowing slow motion           |

### technical-restrained (agency, consultancy, B2B)

| Niche                  | Query                              |
| ---------------------- | ---------------------------------- |
| Design / creative agency| abstract design motion graphics    |
| Dev agency / engineering| code on screen close up            |
| Marketing agency       | macbook typing close up            |
| Brand studio           | neon city night drive              |
| Strategy consultancy   | team meeting office cinematic      |
| Fractional exec        | executive office window light      |

The LLM may also pick its own query if it has better niche insight than
this table. The orchestrator hands a hint via the prompt; the LLM's
`heroVideo_query` overrides it when provided.

## Soft-fail strategy

Every external dependency in the cinematic stack soft-fails:

- **No `PEXELS_API_KEY`** → no video → hero renders branded gradient empty
  state (deep navy radial + giant ghost word) which still looks intentional
- **Pexels rate-limit / 5xx** → same fallback
- **Pexels returns 0 results** → same fallback
- **Video URL 404s on the user's browser** → `<video>` element shows the
  poster image + subtle gradient; nothing breaks
- **Missing `shinyWord`** → headline renders fully white (still beautiful)

The cinematic landing is **strictly additive** to the existing four hero
variants — never replacing them, only opting in when archetype + Pexels
both cooperate.

## What this skill is NOT (yet)

Phase 1 ships the hero. Phase 2 will extend the cinematic system to:

- **about** — liquid-glass card stack with founder photo + body
- **services** — Aura "Capabilities" grid (liquid-glass cards, icon top-left,
  tag pills top-right, title + body bottom, min-height 360px)
- **testimonials** — figure cards with quote + author + company uppercased
- **pricing** — giant watermark headline + glass tier cards with white
  border + Pro tier highlighted
- **cta** — final liquid-glass full-bleed radial-glow CTA

Phase 3:

- Marketplace listing — fork this skill, customize the palette + queries
- Light-mode variant (cinematic structure on white for builders who want
  the choreography without the dark canvas)
- Per-niche curated query libraries (top 20 verticals with hand-picked
  Pexels IDs, no live search needed)

## Verification checklist (operator side)

When this skill applies, the rendered page should:

- [ ] Show a looping video background that crossfades smoothly between
      loop cycles (no hard cut at the seam)
- [ ] Display the Pexels photographer credit in the bottom-right
- [ ] Render the headline in Instrument Serif italic with one word
      animated in the cyan→navy gradient shimmer
- [ ] Have a white pill primary CTA with a chevron that shifts on hover
- [ ] Have liquid-glass secondary CTA + badge + risk-reversal chips
- [ ] Render correctly on mobile (no horizontal scroll, headline word-wraps,
      video still plays — iOS Safari requires `playsInline + muted`, both set)
- [ ] Keep Lighthouse perf ≥80 (video is the heaviest asset; we cap at
      1080p HD MP4 ≤30s precisely to stay under budget)

## Antifragility note

This skill is **~90% markdown** (this doc + the orchestrator prompt + the
SKILL.md schema). The ~10% of code is:

- One 200-line Pexels client (`lib/assets/pexels.ts`)
- One 100-line FadingVideo component
- One 60-line BlurText component
- One 30-line AppleButton component
- One 200-line hero-cinematic-aura.tsx
- ~150 lines of CSS

When Opus 5 ships, it produces better headlines, better shiny-word picks,
better Pexels queries from this same spec — zero code change required.
The harness stays thin; the skill stays fat; the look gets better with
every model upgrade.
