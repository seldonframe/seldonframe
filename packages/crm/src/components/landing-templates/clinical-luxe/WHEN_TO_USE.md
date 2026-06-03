# Template 1 — Clinical Luxe

**When to use (for the archetype classifier):** premium, expertise-forward medical
aesthetics where trust and refinement close the booking — **dermatology, med-spa,
cosmetic & premium dental, plastic surgery, aesthetic clinics**. Reach for it when
the soul reads upscale (board certifications, "patient-centered", financing) and
photography is clinical/editorial. Services often carry duration but **no price**
(consult-based) — the layout handles price-absent gracefully.

**Emotional register:** refined, reassuring, editorial-medical. Full-bleed clinic
photography, gold-on-charcoal, high-contrast serif display (Cormorant), generous
whitespace, treatments as elegant alternating rows.

## Files (identical package shape to all 5)
`ClinicalLuxe.tsx` (entry) · `types.ts` · `theme.ts` · `css.ts` · `Styles.tsx` ·
`icons.tsx` · `ui.tsx` (`SmartImage`/`ThemedPlaceholder`, client) ·
`interactive.tsx` (`Nav`, `Faq`, client) · `sections.tsx` (`Hero, TrustStrip,
Services, About, Stats, Testimonials, CtaBand, Footer, MobileBar`) · `fixture.ts`.

```tsx
import ClinicalLuxe from "./ClinicalLuxe";
import { lumenDermatology, exampleCTAs } from "./fixture";
export default () => <ClinicalLuxe data={lumenDermatology} ctas={exampleCTAs} />;
```

## Shared invariants (byte-identical across all 5)
Entry signature `({ data, ctas, theme })` · `types.ts` (`Soul/CTAs/SfTheme/
TemplateProps`) · the `--sf-*` variable names + `sfThemeVars()` output shape ·
`SmartImage → ThemedPlaceholder` fallback · global `<style jsx>` · `"use client"`
only on `Nav`/`Faq`/`SmartImage`.

## Template-specific composition
Full-bleed hero (left-anchored, never centered) · centered credential trust strip ·
numbered alternating treatment rows · split About · charcoal stats band · serif
testimonials · FAQ accordion · full-bleed CTA · charcoal footer · sticky mobile bar.
Container queries on `.sf1-root` drive reflow. Bottom-right kept clear for the chat bubble.
