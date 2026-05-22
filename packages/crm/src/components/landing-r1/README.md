# SeldonFrame landing framework — Phase R.1

World-class auto-generated landing pages for every workspace SeldonFrame builds.
Conversion-first, mobile-first, archetype-switched. Each section is a slot-filler:
the LLM emits JSON, the component renders.

**Phase R.1 status:**

| Section            | Status                                  | Variants ready                |
|--------------------|-----------------------------------------|-------------------------------|
| `hero.tsx`         | ✅ split-screen-50-50 done               | bold-urgency                  |
| `services-grid.tsx`| ✅ asymmetric layout, CSS-var theming    | all 7 (via tokens)            |
| `testimonials.tsx` | ✅ rotating ticker, 6s auto-advance      | all 7 (via tokens)            |
| `faq.tsx`          | ✅ wraps shadcn `@/components/ui/accordion` (Base UI) | all 7          |
| `footer.tsx`       | ✅ 4-col responsive, big phone, badges   | all 7                         |

Phase R.1.2 follow-up (not in this drop): tighten the other two hero variants
(`left-aligned-asymmetric` for editorial-warm / clinical-trust / soft-residential /
brutalist, `cinematic-aura` for cinematic-aspirational / technical-restrained).
Stubs are in `hero.tsx` so the prop interface is locked.

Phase R.2 follow-up: service-area map, trust bar, gallery, sticky mobile bar
**component** (currently inlined in the preview), emergency strip **component**.

---

## Important: accordion implementation

This project's `@/components/ui/accordion` wraps **@base-ui/react** (not @radix-ui).
The key API differences from the Radix version:

- No `type="single"` or `collapsible` props. Single-open is the default (`multiple=false`).
- `defaultValue` takes a **string[]** (array), not a single string.
- `AccordionItem value` works the same.

`faq.tsx` already accounts for this.

---

## File map

```
landing-r1/
├── archetypes.ts                 ← mirrors packages/crm/src/lib/workspace/aesthetic-archetypes.ts
├── preview.tsx                   ← drop-in composition used by the preview route
├── _shared/
│   ├── motion.tsx                ← Reveal, StaggerGroup/Item, CountUp (Framer Motion scroll-triggered)
│   ├── trust-badge.tsx           ← TrustBadge with optional logoSvg slot
│   ├── stars.tsx                 ← Lucide-based star row
│   ├── phone.ts                  ← telHref() / smsHref() — no libphonenumber
│   └── types.ts                  ← barrel re-export of all prop types
├── sections/
│   ├── hero.tsx
│   ├── services-grid.tsx
│   ├── testimonials.tsx
│   ├── faq.tsx
│   └── footer.tsx
└── fixtures/
    └── bold-urgency-stockton.ts  ← sample LLM payload, fully typed
```

The preview route lives at:
`packages/crm/src/app/(public)/landing-preview/[archetype]/page.tsx`

Open `/landing-preview/bold-urgency` to see the rendered bold-urgency landing.

---

## Slot-filler contract

Every section accepts an `archetype: AestheticArchetypeId` plus a typed
content prop bundle. The component does **two** things with the archetype:

1. **Theming** — `archetypeStyle(id)` emits CSS variables (`--primary`,
   `--secondary`, `--bg`, `--text`, `--border`, `--surface`, `--surface-deep`,
   `--font-headline`, `--font-body`, `--font-mono`, `--motion-scale`) inline on
   the section root. All section CSS reads from these vars; nothing is
   hard-coded.
2. **Layout** — Hero branches on `archetype.heroVariant`. Other sections share
   a single layout because the variance is absorbed by tokens (fonts, density,
   color).

---

## Dependencies (in `packages/crm/package.json`)

| Package                | Why                                                       |
|------------------------|-----------------------------------------------------------|
| `next` (App Router)    | Image, Link, font loading via `next/font/google`          |
| `tailwindcss@4`        | Utilities for layout outside the per-section styled-jsx   |
| `framer-motion@^12`    | **Scroll-triggered only** — Reveal, StaggerGroup, CountUp |
| `lucide-react`         | Icons (Phone, Calendar, ArrowRight, ChevronDown, Star…)   |
| `@base-ui/react`       | Underlies `@/components/ui/accordion` (NOT @radix-ui)     |
| `clsx` / `cn`          | Class merging in `_shared/trust-badge.tsx`                |

---

## Phase isolation

This directory (`landing-r1/`) is intentionally isolated from
`packages/crm/src/components/landing/sections/` — the existing landing
renderer and block-codegen reference those files. We keep both until Phase R.2
when we reconcile them after visual sign-off.

Do NOT touch `packages/crm/src/lib/workspace/aesthetic-archetypes.ts` — this
`archetypes.ts` is a separate copy maintained by Claude Design. Reconcile in
Phase R.1.2.
