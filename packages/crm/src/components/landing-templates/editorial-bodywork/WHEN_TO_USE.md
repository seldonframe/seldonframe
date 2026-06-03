# Template 4 — Editorial Bodywork

**When to use (for the archetype classifier):** warm, tactile, **touch-based**
services where the booking is per-treatment and price/duration matter —
**massage therapy, bodywork, sports & deep-tissue recovery, reflexology,
craniosacral, facial/skin bars**. Reach for it when the soul has several priced
`offerings` and the brand is grounded and sensory rather than clinical.

**Emotional register:** warm, tactile, grounded, conversion-clear. Split-screen
hero with an italic-accent headline ("Find *your* quiet"), warm-brown palette,
serif with expressive italics (Spectral), numbered priced treatment rows each
with their own Book button.

## Files (identical package shape to all 5)
`EditorialBodywork.tsx` (entry) · `types.ts` · `theme.ts` (+ `sfAccent`) ·
`css.ts` · `Styles.tsx` · `icons.tsx` · `ui.tsx` (client) · `interactive.tsx`
(`Nav`, `Faq`, client) · `sections.tsx` (`Hero, TrustStrip, Services, About,
Stats, Testimonials, CtaBand, Footer, MobileBar`) · `fixture.ts`.

```tsx
import EditorialBodywork from "./EditorialBodywork";
import { palmerBodywork, exampleCTAs } from "./fixture";
export default () => <EditorialBodywork data={palmerBodywork} ctas={exampleCTAs} />;
```

## Shared invariants (byte-identical across all 5)
Entry signature `({ data, ctas, theme })` · `types.ts` · the `--sf-*` variable
names + `sfThemeVars()` output shape · `SmartImage → ThemedPlaceholder` fallback ·
global `<style jsx>` · `"use client"` only on `Nav`/`Faq`/`SmartImage`.

## Template-specific notes
Split-screen hero takes **two `role: "hero"` photos** (left has the copy overlay,
right is a detail). `sfAccent()` italicises the back half of the `tagline` for the
editorial accent (works for any copy; degrades to plain for single words). Numbered
treatment rows lead with price + duration + a per-row **Book** for a conversion-clear
menu. Ships a dark "Espresso" palette in the preview. Container queries on
`.sf4-root`. Bottom-right kept clear for the chat bubble.
