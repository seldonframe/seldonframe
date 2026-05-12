# Hero Templates — Implementation Plan (v1.43.0)

Goal: extract the strongest visual patterns from the 19 reference prompts
into a **template registry** the LLM picks from per workspace. Stays
thin-harness + fat-skill + antifragile: each template = 1 React component
+ 1 SKILL.md, smarter Claude → better picks from the same library, adding
a new template is a 2-file PR.

## Catalog of references (19 prompts shared)

Categorized by theme + use-case fit:

| # | Name | Theme | Best for | Distinct signature |
|---|---|---|---|---|
| 1 | Aeon (space-travel) | dark | aerospace/aspirational/luxe | 2 sections, liquid-glass + Barlow |
| 2 | Velorah | dark | creative studios, editorial brands | Instrument Serif italic on emphasis |
| 3 | Velorix | dark | B2B security/platform SaaS | Inter + pill nav + hamburger |
| 4 | Wanderful | dark | travel/experience brands | GSAP mouse parallax video |
| 5 | Lyra (prosthetics) | **light** | physical products, e-commerce | Bottom-left hero, narrow column |
| 6 | SkyElite | dark | premium service (jets/concierge) | Overlapping two-line headline |
| 7 | Aura (email SaaS) | dark | premium B2B with dashboard | Shiny gradient + macOS bar + inbox mockup |
| 8 | Prisma | dark + cream | creative studios + film/photo | Scroll-linked char reveal, warm palette |
| 9 | Asme (basic) | dark | minimal newsletter/SaaS | Liquid-glass + email input |
| 10 | Asme (extended) | dark | multi-section minimal SaaS | Philosophy + Services pages |
| 11 | Michael Smith | dark | personal portfolios | HLS + loading screen + bento grid |
| 12 | Securify | pure black | data security, dev tools | Giant staggered "protect / your / data" |
| 13 | Cinematic Streaming | dark | media/entertainment | Bottom blur overlay, no gradient |
| 14 | Viktor Oddy | **light** | coaches, agencies, freelance | PP Mondwest serif, marquee, light cinematic |
| 15 | CodeNest | dark | edu/learning platforms | HLS + liquid-glass card + green accent |
| 16 | Bloom (AI floral) | dark | AI creative tools | Split panel, grayscale-only |
| 17 | Nexora | **light** | B2B SaaS founders | Custom dashboard mockup (banking-style) |
| 18 | Transform Data | **light** | AI data tools | Multi-font, AI search input mock |
| 19 | Stellar.ai | **white** | AI workspace platforms | Cycling tabs with video overlays |

## What we already have

- `hero-cinematic-aura` (v1.41.0) — covers the "dark aspirational + Pexels video"
  slot. Closest to Aeon/Aura/Velorah family.

## What's missing (the gaps to fill in v1.43.0)

1. **Light cinematic for agencies/coaches** — every "agency" or "coach"
   workspace currently gets dark. The user's reference set is ~30% light
   (Lyra, Viktor Oddy, Nexora, Transform Data, Stellar.ai) and that's
   where the X Growth Lab + Signal-to-Leads style workspaces actually
   belong.
2. **B2B SaaS with dashboard mockup** — Nexora/Aura style. Currently no
   way to render a custom in-page product preview.
3. **Big-typography statement** — Securify-style for dev tools and
   technical-positioned brands. Different visual genre from cinematic.

## Phase 1 (this PR, v1.43.0) — 5 templates

I'll build 5 templates that close the biggest gaps and cover the most
business shapes:

### 1. `viktor-light` — LIGHT editorial agency
- Source: Viktor Oddy reference
- White bg, PP Mondwest-style serif accents on key words
- Hero: centered narrow column, kicker → headline with serif emphasis → 3
  description paragraphs → primary + secondary pill CTAs
- For: agencies, creative coaches, freelancers, indie founders. The
  default for `technical-restrained` archetypes when the workspace isn't
  a dashboard-product.
- Pexels video: optional, behind a low-opacity overlay (Viktor's reference
  doesn't use one but our Pexels integration makes it free)

### 2. `velorah-editorial` — DARK editorial luxe
- Source: Velorah + Wanderful + Prisma
- Deep navy / black bg, Instrument Serif italic emphasis on outcome word
- Hero: centered, "Where X Y the Z" pattern with italic accents on emphasis
  words (different from cinematic-aura's gradient-shiny — softer, more
  editorial)
- For: luxe services, premium coaches, creative studios. Default for
  `cinematic-aspirational` when the workspace wants more editorial than
  the existing cinematic-aura.

### 3. `nexora-light` — LIGHT B2B SaaS + dashboard
- Source: Nexora + Stellar.ai
- White bg, Instrument Serif italic on emphasized word in headline,
  custom-coded dashboard mockup below CTA
- Hero: centered headline + subhead + book-a-demo CTA + dashboard preview
- Dashboard preview is parameterized by `dashboardKind` (banking-style /
  analytics-style / messaging-style — picked by Opus from business signals)
- For: B2B SaaS founders, productivity tools. The default when the
  workspace is software-shaped.

### 4. `securify-bold` — PURE BLACK + giant staggered typography
- Source: Securify + Bloom (typography), Asme (minimal nav)
- Pure black bg, 14vw text size, words staggered absolute-positioned
  ("protect / your / data" style)
- Hero: 3 staggered headline words + corner stat blocks + diagonal dividers
- For: dev tools, data security, hard-tech SaaS. The aggressive-modern
  alternative to nexora-light.

### 5. `stellar-tabs-white` — WHITE + cycling tab demo
- Source: Stellar.ai
- White bg, Inter, gradient text on second headline line, cycling 4-tab
  switcher under hero copy that swaps in different product-demo overlays
  over a video
- Hero: review badge + headline (line 2 has gradient) + subhead + CTA +
  rounded video container with overlays that auto-rotate
- For: AI tools, workspace platforms, multi-feature SaaS. Strongest when
  the workspace has 4+ distinct services to showcase.

These 5 + existing `cinematic-aura` give us 6 templates spanning the
full theme × use-case matrix.

## Architecture

### File layout

```
packages/crm/src/components/landing/hero-templates/
  ├── viktor-light/
  │   └── HeroViktorLight.tsx
  ├── velorah-editorial/
  │   └── HeroVelorahEditorial.tsx
  ├── nexora-light/
  │   ├── HeroNexoraLight.tsx
  │   └── DashboardMock.tsx       # the custom-coded preview
  ├── securify-bold/
  │   └── HeroSecurifyBold.tsx
  ├── stellar-tabs-white/
  │   ├── HeroStellarTabsWhite.tsx
  │   └── TabOverlay.tsx          # cycling overlay component
  ├── shared/
  │   ├── pexels-bg.tsx           # reusable Pexels-video background
  │   ├── liquid-glass.css        # already exists at landing/cinematic/
  │   └── motion-presets.ts       # framer-motion variants shared across
  └── registry.ts                  # name → component map
```

### Registry mechanism

`registry.ts` exports:

```ts
export const HERO_TEMPLATES = {
  "cinematic-aura": HeroCinematicAura,       // existing (v1.41.0)
  "viktor-light": HeroViktorLight,
  "velorah-editorial": HeroVelorahEditorial,
  "nexora-light": HeroNexoraLight,
  "securify-bold": HeroSecurifyBold,
  "stellar-tabs-white": HeroStellarTabsWhite,
} as const;

export type HeroTemplateId = keyof typeof HERO_TEMPLATES;
```

### Hero block updates

- `types.ts`: add `template?: HeroTemplateId` to `HeroSectionContent`.
  When set, `hero.tsx` dispatches to `HERO_TEMPLATES[template]`. When
  absent, falls back to the v1.40.0 variant system (split-screen-50-50,
  etc.) — strictly additive, no regression.
- `hero.tsx`: top-of-function check: `if (props.template && HERO_TEMPLATES[props.template]) return <HERO_TEMPLATES[props.template] {...props} />;`

### LLM picker

Each template gets a short SKILL.md fragment with:
- `id` (matches registry key)
- `when_to_use` (1-2 lines)
- `vibe` keywords for matching
- `consumes` (which `HeroSectionContent` fields it actually uses)

The hero block's `enhanceSection("hero")` parallel call (already exists
from v1.42.0) gets a compressed catalog appended to its section
instructions — ~20 lines total:

```
TEMPLATE CATALOG (set `template` to one of these IDs):

- cinematic-aura: dark + Pexels video + Instrument Serif + shiny word.
  For: luxe coaching, medspa, wellness, fitness, lifestyle.
- velorah-editorial: dark + serif italic emphasis (no shiny word).
  For: creative studios, premium services, editorial brands.
- viktor-light: white + serif accents + centered narrow column.
  For: light agencies, coaches, freelance creatives, indie founders.
- nexora-light: white + dashboard mockup + italic emphasis word.
  For: B2B SaaS founders, productivity tools, analytics platforms.
- securify-bold: pure black + giant staggered typography + stat blocks.
  For: dev tools, security, data/AI infra, hard-tech SaaS.
- stellar-tabs-white: white + cycling tabs over video + gradient line.
  For: AI workspace platforms, multi-feature SaaS, productivity suites.

Pick based on archetype + business signals. When unsure between two
fits, prefer the lighter one (light > dark) for B2B/agency, the darker
one (dark > light) for lifestyle/luxe.
```

LLM returns `template: "viktor-light"` (or whichever) in its hero JSON
payload, and the renderer dispatches.

### Archetype defaults

Update `aesthetic-archetypes.ts` so each archetype suggests a default
template (LLM can override, but absent picks fall through to the default):

```
editorial-warm        → viktor-light
bold-urgency          → split-screen-50-50 (existing — keep)
clinical-trust        → nexora-light
cinematic-aspirational→ cinematic-aura (existing) OR velorah-editorial
technical-restrained  → viktor-light (default) OR nexora-light (if SaaS) OR securify-bold (if dev-tools)
soft-residential      → viktor-light
brutalist             → securify-bold
```

The LLM picker in `enhanceSection("hero")` ultimately decides — but the
archetype provides the prior.

## What this PR does NOT do (deferred)

- The remaining 14 templates from the catalog. Add as builders ask.
- Multi-section cinematic system (Phase 2 from cinematic-landing-plan).
  This PR is hero-only — every workspace will still have light/cream
  services/about/etc. sections from v1.40.x. Acceptable for now since
  some new templates ARE light, so the "dark hero + light rest" mismatch
  only hits cinematic-aura + velorah-editorial.
- Mouse parallax (Wanderful), HLS streaming (Michael Smith / CodeNest),
  loading screens (Michael Smith). These are template-specific
  flourishes; we'll add when those templates land.

## Verification

- [ ] `pnpm typecheck` + `pnpm build` green
- [ ] Visit a fresh `coach` workspace → confirm picker chose viktor-light
      or velorah-editorial, renders correctly
- [ ] Visit a fresh `agency` workspace → confirm nexora-light or viktor-light
- [ ] Visit a fresh `medspa` workspace → confirm cinematic-aura still wins
- [ ] Pexels video still resolves and renders inside any template that
      includes a background video
- [ ] Mobile: all 5 new templates render without horizontal scroll
- [ ] Existing v1.40.x hero variants (split-screen-50-50, etc.) still
      work for non-cinematic archetypes (HVAC, roofing)

## Antifragility self-check

- 5 new templates = 5 new fat skills + 5 new components. Zero harness
  code change beyond the registry dispatch.
- Adding template #6 in a future PR = 2 new files, zero existing code
  change.
- Smarter Claude → better template picks from the same catalog.
- Same Opus 4.7, same Pexels integration, same parallel-enhance flow —
  this PR is strictly additive on top of v1.42.0.

## Estimated scope

- ~1500-2500 lines of TSX (5 templates, average ~300 lines each)
- ~600 lines of SKILL.md fragments + registry
- ~100 lines of changes to existing files (hero.tsx dispatch, types.ts,
  aesthetic-archetypes.ts, enhanceSection prompt update)
- Total: ~2-3k lines new, ~100 lines modified. Big PR but mechanical
  (each template is independent).

## Open questions for review

1. **5 templates or fewer for v1.43.0?** I'd start with 5 to cover the
   archetype matrix in one shot. Counter-argument: ship 3 first
   (viktor-light, velorah-editorial, nexora-light) to de-risk, add
   securify-bold + stellar-tabs-white in v1.44.0. Recommendation: ship
   all 5; they're independent + I can roll back any one if it misfires.

2. **Dashboard mockup variants for nexora-light?** Nexora's reference
   shows a banking-style mockup. Real coaches/agencies won't have
   transactions to display. Two options: (a) parameterize by
   `dashboardKind` (analytics / messaging / banking — Opus picks) or
   (b) hardcode a generic "CRM/booking" mockup that mirrors what every
   SeldonFrame workspace actually has. Recommendation: (b) — the
   mockup should preview the operator's REAL workspace, not a fake
   bank UI. Less impressive visually but more honest.

3. **Pexels for light templates?** The reference set's light templates
   (Viktor Oddy, Nexora, Stellar.ai) mostly DON'T use background video.
   But our Pexels integration is free. Option: every template optionally
   shows a Pexels video at low opacity (~30%) behind a white overlay.
   Recommendation: leave video OUT of light templates by default — the
   light editorial look reads better without it. Operators can request
   "make it cinematic" later and we re-route to the dark family.
