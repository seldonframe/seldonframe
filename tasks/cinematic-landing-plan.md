# Cinematic Landing — Implementation Plan

Goal: ship the Aura-style cinematic landing as a SeldonFrame fat skill, with
Pexels-sourced video backgrounds, defaulted on for agency + coach archetypes.
Antifragile to model upgrades: design system lives in markdown/CSS, no LLM
calls at render time.

## Architecture decision

Existing blocks are **per-section** (hero, about, services, faq, cta).
"cinematic-landing" is therefore a *design system + new hero variant + Pexels
asset layer*, not a monolithic page block. We express it as:

- One **fat skill** at `blocks/cinematic-landing/SKILL.md` — design tokens,
  liquid-glass spec, motion choreography, Pexels query strategy, prompt
  guidance for copy. This is the marketplace-listable thing.
- New **runtime code** under `components/landing/cinematic/` (shared primitives)
  and a new hero variant `cinematic-aura`.
- New **asset module** at `lib/assets/pexels.ts` (one call per workspace
  creation, persisted into `landing_pages.sections[hero].heroVideo`).

Phase 2 will extend the design system to the other section blocks (about,
services, etc.); Phase 1 ships the hero — the highest-impact visual change.

## Phase 1 — scope (this PR)

### Files to create

1. `packages/crm/src/lib/assets/pexels.ts`
   - `searchPexelsVideo(query, { orientation?, size? }): Promise<PexelsVideoResult | null>`
   - Reads `process.env.PEXELS_API_KEY` (already in Vercel env)
   - Returns `{ videoUrl, posterUrl, photographer, photographerUrl, sourceUrl }`
   - Graceful fallback: returns `null` on missing key, rate limit, or no result
   - Picks the closest match: HD MP4 file (prefer `quality === 'hd'`, fallback
     to `'sd'`), 1080p or below, ≤30s duration

2. `packages/crm/src/components/landing/cinematic/styles.css`
   - `.liquid-glass` + `.liquid-glass-strong` (the exact spec from Aura)
   - `@keyframes shiny` for the gradient headline
   - `@keyframes fade-rise` / `fade-rise-delay-*` (already pattern in repo)
   - Font import: Instrument Serif (display) + Inter (body, already available)

3. `packages/crm/src/components/landing/cinematic/fading-video.tsx`
   - rAF-driven crossfade `<video>` per Aura spec
   - `FADE_MS=500`, `FADE_OUT_LEAD=0.55s`
   - Manual loop via `ended` event (no CSS transitions)
   - Cancels previous rAF on each new fade so animations don't compete

4. `packages/crm/src/components/landing/cinematic/blur-text.tsx`
   - Word-by-word blur-in with IntersectionObserver
   - Uses framer-motion (already in deps? — verify, if not add)

5. `packages/crm/src/components/landing/sections/hero-cinematic-aura.tsx`
   - The new hero variant. Props extend `HeroSectionContent`:
     - `heroVideo` (already exists in type) → background loop
     - `videoAttribution?: { photographer, sourceUrl }` (new — Pexels credit)
     - `shinyWord?: string` (optional — the word that gets the gradient shiny
       treatment in the headline, e.g., "Pipeline")
   - Structure: fixed video bg → glass navbar → centered headline (shiny on
     one word) → subhead → liquid-glass-strong primary CTA + ghost secondary
     → optional proof tile row (reuse existing ProofTile, restyled for dark)
   - Mobile-responsive (Aura spec is desktop-first; we add `md:` breakpoints
     for stacking)
   - Dark by default (matches Aura); ignores workspace light-theme tokens for
     this variant since the cinematic look IS dark

### Files to modify

6. `packages/crm/src/components/landing/sections/hero.tsx`
   - Add `if (variant === 'cinematic-aura') return <HeroCinematicAura {...props} />;`
     branch at the top (after `useState(imageFailed)` since the new variant
     doesn't need it, this can be earlier).

7. `packages/crm/src/components/landing/sections/types.ts`
   - Extend hero variant union: `| 'cinematic-aura'`
   - Add optional `videoAttribution?: { photographer: string; sourceUrl: string }`
   - Add optional `shinyWord?: string`

8. `packages/crm/src/lib/workspace/create-full.ts`
   - In `enhanceLandingForWorkspace`, after archetype classification, if
     archetype is `agency` or `coaching`:
     - Call `searchPexelsVideo(input.hero_video_query ?? defaultQuery(archetype))`
     - Pass the resolved URL into the hero section JSON as `heroVideo`
     - Set `hero.variant = 'cinematic-aura'`
     - Set `hero.videoAttribution` from Pexels response
     - Add `cinematic` aesthetic hint to the Opus prompt so it picks shiny
       words and tight headlines

9. `packages/crm/src/lib/workspace/aesthetic-archetypes.ts`
   - Add `defaultHeroVariant: 'cinematic-aura'` to the agency + coaching
     archetype config (if not already, otherwise this is the routing logic).
   - May need a new field — read the file to confirm shape.

10. `packages/crm/src/blocks/hero/SKILL.md`
    - Add `cinematic-aura` to the layout variant enum
    - Add a line in the prompt: "For agency, coaching, and luxury archetypes,
      prefer `cinematic-aura` if a hero video is available. Include a
      `shinyWord` — one emphatic word from the headline that will render as
      gradient text (e.g., 'Pipeline', 'Empire', 'Future')."

### Files to create — fat skill

11. `packages/crm/src/blocks/cinematic-landing/SKILL.md`
    - YAML frontmatter: name, description, category="aesthetic", appliesTo=[hero] (Phase 1)
    - Body: full design system spec from Aura — colors, fonts, liquid-glass
      CSS, motion choreography, Pexels query strategy, niche-aware copy rules
    - This is the **fat skill** — marketplace-listable, forkable, future-proof.

## Pexels query strategy (in SKILL.md + create-full.ts)

`defaultQuery(archetype, services)`:
- agency / agency-creative: `"abstract design motion"` or `"team office collaboration cinematic"`
- coaching: `"focused work laptop window light"` or niche-specific (`"x growth coach"` → `"social media phone scrolling"`)
- We expose this as an override in the SKILL.md prompt so Opus can pick
  niche-specific queries (e.g., the Signal-to-Leads coach → `"twitter x social media phone"`).

## Verification

- [ ] Build passes (`pnpm typecheck` + `pnpm build`)
- [ ] Manual test: regenerate the `signal-to-leads` workspace, visit the
      hosted page, confirm:
  - Video background loops with smooth crossfade
  - Liquid-glass navbar + CTAs render with the glass border effect
  - Instrument Serif italic on the shiny word
  - Mobile renders without horizontal scroll
  - Lighthouse perf score stays ≥80 (the video is the heaviest asset)
- [ ] Pexels attribution renders bottom-right with the photographer link
- [ ] Confirm `PEXELS_API_KEY` is set in BOTH preview and production Vercel
      envs (only confirmed for one so far)
- [ ] No regression on the other 3 hero variants (smoke a non-agency niche)

## Phase 2 — deferred (next PR)

Extend the cinematic design system across the rest of the landing:

- `about-cinematic` (liquid-glass card stack)
- `services-cinematic` (Aura "Capabilities" grid — liquid-glass cards with
  icon top-left, tag pills top-right, title + body bottom)
- `testimonials-cinematic` (Aura figure cards)
- `pricing-cinematic` (giant watermark headline + glass tier cards)
- `final-cta-cinematic` (liquid-glass full-bleed radial glow CTA)

## Phase 3 — deferred (later)

- Marketplace listing for `cinematic-landing` as a forkable theme
- Light-mode variant for builders who want the cinematic structure but on
  white
- Per-niche query libraries (curated Pexels lookups for the top 20 verticals)

## Open questions for review

1. Phase 1 only (hero variant), or attempt Phase 2 sections in the same PR?
   Recommendation: **Phase 1 only**. Hero is 80% of the visible win and the
   rest can ship incrementally without breaking what's live.
2. Is `framer-motion` already in deps? If not, we need to add it — but it's
   well-tested and small. Confirm before adding.
3. Should we add a `landing_pages.assets` JSONB column for caching Pexels
   resolutions, or rely on the resolved URL persisting inside the hero
   section JSONB? Recommendation: **store inline in hero section** — one
   less migration, video URL is part of the hero's design intent anyway.

## Antifragility check

- Skill is ~90% markdown (design tokens, motion spec, copy guidance) — Opus 5
  produces better landings from the same spec on day one.
- Pexels API is stable and free; if it shuts down, swap to Coverr or
  Mixkit by changing one module.
- The new code is additive — existing 4 hero variants untouched. Easy to
  roll back if the cinematic look misfires for any archetype.
