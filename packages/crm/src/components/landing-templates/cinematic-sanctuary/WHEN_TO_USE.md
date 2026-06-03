# Template 3 — Cinematic Sanctuary

**When to use (for the archetype classifier):** premium, calm, **experience-led**
wellness where atmosphere sells — **day spas, holistic wellness, osteopathy,
acupuncture, float/sauna studios, retreats, meditation**. Reach for it when the
soul is unhurried and sensory, photography is cinematic, and price-per-ritual is
high. Includes a **Gallery** section well-suited to a beautiful physical space.

**Emotional register:** minimal, luxurious, slow. Letter-spaced serif (Marcellus),
large cinematic imagery, lots of negative space, numbered treatment vignettes, a
single large pull-quote, restrained micro-motion. The page should feel like exhaling.

## Files (identical package shape to all 5)
`CinematicSanctuary.tsx` (entry) · `types.ts` · `theme.ts` · `css.ts` ·
`Styles.tsx` · `icons.tsx` · `ui.tsx` (client) · `interactive.tsx` (`Nav`, `Faq`,
client) · `sections.tsx` (`Hero, TrustStrip, Intro, Services, About, Gallery,
Testimonials, CtaBand, Footer, MobileBar`) · `fixture.ts`.

```tsx
import CinematicSanctuary from "./CinematicSanctuary";
import { stillwaterSanctuary, exampleCTAs } from "./fixture";
export default () => <CinematicSanctuary data={stillwaterSanctuary} ctas={exampleCTAs} />;
```

## Shared invariants (byte-identical across all 5)
Entry signature `({ data, ctas, theme })` · `types.ts` · the `--sf-*` variable
names + `sfThemeVars()` output shape · `SmartImage → ThemedPlaceholder` fallback ·
global `<style jsx>` · `"use client"` only on `Nav`/`Faq`/`SmartImage`.

## Template-specific notes
Adds a **Gallery** (`role: "gallery"` photos; first tile spans 2×2, the rest fall
back to themed placeholders). Cinematic hero with copy lower-left (asymmetric,
never centered). Numbered alternating vignettes. Single large testimonial quote.
**Micro-motion** is gated on `@media (prefers-reduced-motion: no-preference)` so
print/reduced-motion show the end state. Ships a dark "Noir" palette in the
preview to demonstrate the same skeleton re-skinning to dark via `--sf-*`.
Container queries on `.sf3-root`. Bottom-right kept clear for the chat bubble.
