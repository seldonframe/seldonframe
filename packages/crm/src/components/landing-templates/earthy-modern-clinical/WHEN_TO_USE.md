# Template 5 — Earthy Modern Clinical

**When to use (for the archetype classifier):** the conversion workhorse for
practitioner-led, body-care verticals where trust + clear pricing close the
booking — **chiropractic, physiotherapy, sports recovery & rehab, wellness
clinics**. Reach for it whenever the soul has priced `offerings`, real
testimonials, and a "get out of pain / feel your best" promise; it is the safest
default when a health business doesn't clearly fit templates 1–4.

**Emotional register:** modern, credible, warm, confident — earthy clay + cream,
bold geometric sans headlines, photography of hands-on care. Reads as a real
clinic, not a spa or a SaaS page.

---

## Files (this is the per-template package; all 5 share this shape)

| File | Role |
|---|---|
| `EarthyModernClinical.tsx` | **Entry** — `default ({ data, ctas, theme }) => JSX` |
| `types.ts` | `Soul`, `CTAs`, `SfTheme`, `TemplateProps` (shared contract) |
| `theme.ts` | `SF5_DEFAULT_THEME`, `sfThemeVars()`, data helpers (`sfMoney/sfDur/sfPhoto`) |
| `css.ts` | `SF5_CSS` — the stylesheet string (single source of truth) |
| `Styles.tsx` | emits `<style jsx global>{SF5_CSS}</style>` |
| `icons.tsx` | inline-SVG icon set (no icon libraries) |
| `ui.tsx` | `SmartImage` + `ThemedPlaceholder` (`"use client"` — onError fallback) |
| `interactive.tsx` | `Nav`, `Faq` (`"use client"` — the only stateful sections) |
| `sections.tsx` | `Hero, TrustStrip, Services, About, Stats, Testimonials, CtaBand, Footer, MobileBar` (server) |
| `fixture.ts` | realistic chiropractic soul for instant preview |

```tsx
import EarthyModernClinical from "./EarthyModernClinical";
import { austinFamilyChiropractic, exampleCTAs } from "./fixture";

export default function Page() {
  return <EarthyModernClinical data={austinFamilyChiropractic} ctas={exampleCTAs} />;
  // theme is optional — omit for the tasteful default, or pass per-business --sf-* values.
}
```

## Section order (every template, data-driven; absent data hides gracefully)
Sticky nav → split hero → trust strip → varied-size services → about panel →
stats → testimonials → FAQ accordion → CTA band → footer → sticky mobile bar.

## Guarantees honored
- **Props-only content** — nothing about the business is hardcoded.
- **Theme-only color/type** — every value resolves from `--sf-*`; tints via
  `color-mix(in oklab, …)`. Swap the vars → the whole page re-skins.
- **Graceful imagery** — `SmartImage` renders a real `<img>` and falls back to a
  themed `ThemedPlaceholder` when a photo is missing or fails to load.
- **House rules** — no Inter, asymmetric (never centered) hero, no 3-equal-card
  grid, deep warm near-black (not `#000`), muted accents, SSR-safe (`"use
  client"` only on `Nav`/`Faq`/`SmartImage`), responsive, reduced-motion aware.
- **Bottom-right left clear** for the platform's injected AI chat bubble.

## Responsiveness note
Layout reflow is driven by **container queries** on `.sf5-root` (not viewport
media queries), so the template adapts to whatever width it's mounted in —
full-page, split-pane, or the preview's device toggle — while remaining
mobile-first. Standard viewport media queries can be substituted 1:1 if the
pipeline prefers them.
