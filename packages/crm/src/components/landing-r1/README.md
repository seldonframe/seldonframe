# SeldonFrame landing framework — Phase R.1.2

World-class auto-generated landing pages for every workspace SeldonFrame builds.
Conversion-first, mobile-first, archetype-switched. Each section is a slot-filler:
the LLM emits JSON, the component renders.

**Status:** all 7 archetypes resolved across all 5 sections. ✅ Ready for port.

| Section            | Status              | All 7 archetypes? |
|--------------------|---------------------|-------------------|
| `hero.tsx`         | ✅ 3 variants done   | yes               |
| `services-grid.tsx`| ✅ dense + calm      | yes               |
| `testimonials.tsx` | ✅ pacing derived    | yes               |
| `faq.tsx`          | ✅ shadcn accordion  | yes               |
| `footer.tsx`       | ✅ branch-via-data   | yes               |

Phase R.1 sign-off applied:
- `TrustBadge.logoSvg` is now `ReactNode` (shadcn-style icon-prop pattern).
- Hero proportions held — no centered, no equal split, no 3-card grids.
- Asymmetric services for dense archetypes; 2×2 calm for low-density ones.
- CountUp eased ease-out-cubic / 1400ms throughout.

---

## Archetype branches I added in R.1.2

The brief flagged three likely candidates to break across archetypes. Here's
how each is handled — all branches are data- or registry-driven, not per-id
switch statements buried in the components.

### 1. Hero variant (`hero.tsx`)
Branches on `archetype.heroVariant` — three variants in one file:

| `heroVariant`              | Archetypes                                                                  | What renders                                                                                                                       |
|----------------------------|-----------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| `split-screen-50-50`       | `bold-urgency`                                                              | True 50/50 grid on desktop. Photo on the right with on-call badge + tech caption.                                                  |
| `left-aligned-asymmetric`  | `editorial-warm`, `clinical-trust`, `soft-residential`, `brutalist`         | Text column max 720px, photo block offset 64px down on the right. **Brutalist** swaps the photo for a flat color block (no shadow). |
| `cinematic-aura`           | `cinematic-aspirational`, `technical-restrained`                            | Full-bleed photo behind a glass-pill chrome. Headline gets `is-cinematic` (italic serif) only for cinematic-aspirational.          |

Brutalist explicitly avoids drop shadows, gradients, and rounded blocks — the
photo slot becomes a hard color counterweight with a giant "01" numeral.

Cinematic-aura's background is a static `next/image` in this drop. Per the
brief: production swaps in a muted looping `<video playsInline muted loop>` —
see `packages/crm/src/components/landing/cinematic/` in your repo for the
v1.41 spec to lift.

### 2. Services-grid density (`services-grid.tsx`)
Branches on `archetype.dials.visualDensity` via the `data-layout` attribute:

| `visualDensity` | Archetypes                                                            | Layout                                                                                          |
|-----------------|-----------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| ≤ 4 (calm)      | `editorial-warm` (4), `cinematic-aspirational` (3), `soft-residential` (4) | 2×2 even grid on desktop, 28px gap, roomier card padding (28px) and 16:10 placeholder aspect.   |
| ≥ 5 (dense)     | `bold-urgency` (6), `clinical-trust` (5), `technical-restrained` (7), `brutalist` (6) | Asymmetric: 1 large (spans 2 rows) + 1 wide (spans 2 cols) + 2 standard cells.                  |

Both layouts share the same `<ServiceCard>` markup — only the grid template
and card padding differ. 5–8 services in dense layout fall through as
standard cells; in calm layout they form a 2×N grid.

### 3. Testimonials pacing (`testimonials.tsx`)
When the caller doesn't pass `intervalMs`, the component derives it from
`archetype.motionPreset`:

| `motionPreset` | Archetypes                                       | Interval |
|----------------|--------------------------------------------------|----------|
| `editorial`    | `editorial-warm`, `cinematic-aspirational`       | **8000ms** — slower, more time to read |
| `balanced`     | `bold-urgency`, `soft-residential`, `brutalist`  | 6000ms   |
| `subtle`       | `clinical-trust`, `technical-restrained`         | 6000ms   |

`intervalMs` prop still wins when passed — every fixture can override.

### 4. Footer emergency hours (data-driven, no JSX branch)
The brief flagged this as needing a branch. My take: the data already does it.
`weeklyHours[i].emergency: true` lights up the green "24/7 emergency" line
(used by `bold-urgency` and optionally `soft-residential`). All other fixtures
omit that line entirely — no JSX-level branch needed.

### 5. CTA framing (fixture-level)
Per the registry's `voice.leanInto` / `voice.avoid`, each fixture uses CTA
labels that match the archetype voice. Quick reference:

| Archetype                  | Primary CTA                  | Secondary CTA                  |
|----------------------------|------------------------------|--------------------------------|
| `bold-urgency`             | `Call now — (xxx) xxx-xxxx`  | `Book online`                  |
| `editorial-warm`           | `Schedule a consultation`    | `View our work`                |
| `clinical-trust`           | `Schedule a consultation`    | `Request an appointment`       |
| `cinematic-aspirational`   | `Reserve your visit`         | `Book your consultation`       |
| `technical-restrained`     | `View case studies`          | `Book a consult`               |
| `soft-residential`         | `Book a clean`               | `Get a free quote`             |
| `brutalist`                | `Selected work`              | `Inquire`                      |

Components never see "Call now" hard-coded — the strings come from the LLM
payload, which the registry's voice profile already constrains.

---

## File map

```
landing-r1/
├── archetypes.ts                 ← mirrors packages/crm/src/lib/workspace/aesthetic-archetypes.ts
├── _shared/
│   ├── motion.tsx                ← Reveal, StaggerGroup/Item, CountUp (Framer Motion scroll-triggered)
│   ├── trust-badge.tsx           ← TrustBadge with optional logoSvg slot
│   ├── stars.tsx                 ← Lucide-based star row
│   ├── phone.ts                  ← telHref() / smsHref() — no libphonenumber
│   └── types.ts                  ← barrel re-export of prop types
├── sections/
│   ├── hero.tsx
│   ├── services-grid.tsx
│   ├── testimonials.tsx
│   ├── faq.tsx
│   └── footer.tsx
├── fixtures/
│   ├── bold-urgency-stockton.ts              ← HVAC
│   ├── editorial-warm-hudson-valley.ts        ← Heritage roofer
│   ├── clinical-trust-foothill-dental.ts      ← Dental practice
│   ├── cinematic-aspirational-solace.ts       ← Medspa
│   ├── technical-restrained-northwind.ts      ← B2B consultancy
│   ├── soft-residential-verdant.ts            ← Residential lawn care
│   └── brutalist-field-studio.ts              ← Design studio
├── preview.tsx              ← drop-in App Router composition (stockton fixture)
└── README.md                ← you are here
```

Drop the `sections/`, `_shared/`, and `archetypes.ts` files into
`packages/crm/src/components/landing-r1/`. Adjust the `@/components/ui/accordion`
import path in `faq.tsx` if your `tsconfig.paths` differs.

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

## Dependencies (already in `packages/crm/package.json`)

| Package                | Why                                                       |
|------------------------|-----------------------------------------------------------|
| `next` (App Router)    | Image, Link, font loading via `next/font/google`          |
| `tailwindcss@4`        | Utilities for layout outside the per-section styled-jsx   |
| `framer-motion@^12`    | **Scroll-triggered only** — Reveal, StaggerGroup, CountUp |
| `lucide-react`         | Icons (Phone, Calendar, ArrowRight, ChevronDown, Star…)   |
| `@radix-ui/react-accordion` | Underlies `@/components/ui/accordion`                 |
| `clsx` / `cn`          | Class merging in `_shared/trust-badge.tsx`                |

No `libphonenumber-js`, no other heavyweight deps. Lighthouse 95+ on mobile
is realistic with this stack.

---

## Motion budget

Per the brief: CSS for hover / transition / keyframes, Framer Motion **only**
for scroll-triggered behaviour. Specifically Framer is used for:

- **`Reveal`** — fade + lift on view (every major content block).
- **`StaggerGroup` / `StaggerItem`** — services cards stagger in.
- **`CountUp`** — review count / rating tick on view; reused by stats strip.

Everything else (button hover, link underlines, CTA pulse halo, sticky bar
slide-in, accordion height) is pure CSS or driven by Radix.

`prefers-reduced-motion: reduce` is respected via `useReducedMotion()` —
Reveal/Stagger/CountUp short-circuit to render the final state immediately,
and the CSS pulse animations are disabled in `@media` queries.

---

## Sticky CTAs

Two surfaces, NOT inside any section component (so they persist across the
whole landing page):

1. **Mobile bar** (Call / Text / Book) — visible at viewports < 768px.
2. **Desktop sticky widget** — only for archetypes with
   `desktopStickyCTA: true` (currently `bold-urgency`). Fades in after the
   user scrolls past the hero (~360px); dismissable.

Lift the markup from `Bold Urgency Landing.html` `.mobile-bar` and
`.desk-sticky` selectors and put them in your public landing layout.
We'll componentize this in Phase R.2.

---

## Universal bans (enforced by hand and by the LLM voice profile)

- **`Inter` font** — never. Use the archetype's `headline` / `body`.
- **Centered hero** — never. All heroes are asymmetric or split.
- **3-equal-card horizontal grids** — never. Vary card sizes / counts.
- **Pure black `#000000`** — never. Use the archetype's `secondary`.
- **Pure-saturated accents** — all hues sit below ~70% saturation.
- **AI purple / lila / cyan-blue** — no SaaS gradient palettes.

Each archetype carries its own `bannedHere` list on top of these — see
`ARCHETYPES["bold-urgency"].bannedHere` for the example.

---

## Preview URLs

Visit `/landing-preview/<archetype-id>` for any of the 7 archetypes:

- `/landing-preview/bold-urgency`
- `/landing-preview/editorial-warm`
- `/landing-preview/clinical-trust`
- `/landing-preview/cinematic-aspirational`
- `/landing-preview/technical-restrained`
- `/landing-preview/soft-residential`
- `/landing-preview/brutalist`

---

## R.1.2 — known gaps + what's next

Phase R.1 sign-off questions all answered in code. A few things deliberately
deferred:

1. **Cinematic-aura background video** — currently `next/image`. Production
   should swap to muted looping `<video>` per the v1.41 spec at
   `packages/crm/src/components/landing/cinematic/`. The DOM slot is ready —
   just replace the `<Image>` inside `.hero-cinematic-bg`.
2. **Static preview HTMLs** — `Bold Urgency Landing.html` only. The other 6
   archetypes render correctly via the .tsx files; the `/landing-preview` route
   is the live preview surface.
3. **5–8 service tiles in dense layout** — the asymmetric grid currently
   slots extra cards as standard cells past the first large + first wide. The
   four fixtures with `visualDensity ≥ 5` all happen to ship 4 services, so
   this is untested. Verify when the LLM lands a 5-tile fixture.
4. **Stress-test reduced motion** — `useReducedMotion()` is wired everywhere
   I author motion. The shadcn Accordion still animates height (Radix
   default). If your accessibility audit wants accordion height frozen too,
   we'd need a per-archetype prop on `<Faq>` to switch to instant-state
   transitions.

When you're ready for Phase R.2 (service-area map, gallery, sticky mobile bar
as its own component, emergency strip as its own component), the contract is
already locked — none of those require touching the slot-filler types in this
drop.
