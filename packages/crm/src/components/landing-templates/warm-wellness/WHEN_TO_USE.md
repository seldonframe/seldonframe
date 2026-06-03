# Template 2 — Warm Wellness

**When to use (for the archetype classifier):** friendly, **solo-practitioner /
personal-brand** wellness where the relationship is the product — **prenatal &
postnatal fitness, women's health, pilates & yoga studios, health coaching,
nutrition, lactation/doula**. Reach for it when the soul is one named person, the
voice is warm and first-person, and there's a promo/offer (e.g. "first class free").

**Emotional register:** bright, airy, human, feminine. Dusty-rose, soft rounded
forms, lifestyle photography, a "Hi, I'm …" about block, a promo pill in the nav.
Feels like a trusted friend who's also an expert.

## Files (identical package shape to all 5)
`WarmWellness.tsx` (entry) · `types.ts` · `theme.ts` (+ `sfPromo`, `sfFirstName`) ·
`css.ts` · `Styles.tsx` · `icons.tsx` · `ui.tsx` (client) · `interactive.tsx`
(`Nav`, `Faq`, client) · `sections.tsx` (`Hero, TrustStrip, Services, About,
Stats, Testimonials, CtaBand, Footer, MobileBar`) · `fixture.ts`.

```tsx
import WarmWellness from "./WarmWellness";
import { georgiaHart, exampleCTAs } from "./fixture";
export default () => <WarmWellness data={georgiaHart} ctas={exampleCTAs} />;
```

## Shared invariants (byte-identical across all 5)
Entry signature `({ data, ctas, theme })` · `types.ts` · the `--sf-*` variable
names + `sfThemeVars()` output shape · `SmartImage → ThemedPlaceholder` fallback ·
global `<style jsx>` · `"use client"` only on `Nav`/`Faq`/`SmartImage`.

## Template-specific niceties
Promo pill derived from `trust_signals` (matches free/off/%/trial/first — hides
otherwise) · split airy hero with floating rating badge · varied rounded cards
(first spans wide) · "Hi, I'm {firstName}" about (first word of `business_name`) ·
rounded rose CTA card. Container queries on `.sf2-root`. Bottom-right kept clear.
