# Multi-Page Site Generator — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the multi-page R1 sites *convert and look premium* — an intake form in the hero, a Google map section, a real dark theme (a new dark archetype **plus** an operator light/dark toggle that actually renders), and a no-horizontal-scroll guarantee — all additive on top of the Phase-1 foundation.

**Architecture:** Phase 1 added the page tree + `SiteShell` (which already threads `theme.mode`) + the per-service template with `data-slot="intake"`/`data-slot="map"` mount points. Phase 2 (a) fixes the latent dark-mode **cascade bug** by making `SiteShell` the *sole* owner of the archetype CSS-var palette (every section already lives inside it; `service-page.tsx` already proves the pattern), (b) adds one new **dark archetype** + a `defaultThemeMode` and injects the operator-chosen `theme.mode` server-side in `runR1LandingStep`, (c) extracts a reusable `LeadFormCard` and mounts it in the hero + the service intake slot, and (d) adds a keyless `MapSection` mounted on the home + service pages. No DB migration; the only new payload keys are `R1HeroSection.leadFormInHero?` and a new archetype id.

**Tech Stack:** Next.js 16 App Router (Server Components for routes, `"use client"` for sections/shell per the existing styled-jsx idiom), React 19, TypeScript, Drizzle ORM (Postgres/Neon, read-only here), `node:test` + `tsx` for unit tests (pure functions only — no jsdom, no module mocking), styled-jsx (global mode), archetype CSS-var theming via `archetypeStyle()` + `SiteShell`.

---

## Key Decisions (read first — these shape every task; raise objections before execution)

1. **Dark mode = "shell is the sole palette owner" (Mechanism C).** Today 10 landing-r1 components each set `style={archetypeStyle(arch.id)}` on their own root, which re-declares the *light* CSS vars closer to the content than `SiteShell`'s dark override — so `mode="dark"` is shadowed and never renders. **Fix: remove that inline style from the section/chrome roots (keep `data-archetype` for targeting) and let them inherit the vars from the one `SiteShell` ancestor.** `service-page.tsx` (Phase 1) already does exactly this and renders correctly, so the pattern is proven. Rejected alternatives: prop-drilling a `mode` into all 10 components (`archetypeStyle(archetype, mode)`), or a React context — both keep the redundant per-section application and touch more call sites. The one cost of Mechanism C: any render path that shows these sections **outside** a `SiteShell` would render unstyled; the only such path today is the dev-only `landing-r1/preview.tsx`, which Task 1 wraps in a `SiteShell`. (All three production routes already wrap in `SiteShell`.)

2. **A dark *archetype* and a dark *mode* are different things, and both ship.** The new `midnight-craft` archetype has a natively-dark palette (for businesses classified into it). The `theme.mode` toggle flips *any* archetype to dark via `SiteShell`'s existing `DARK_OVERRIDES` (which keep the brand `--primary`/`--secondary`). With Mechanism C they compose for free — **no change to `archetypeStyle`'s signature is needed.**

3. **`theme.mode` is injected server-side, deterministically — never by the LLM.** The generator (`generateR1Payload`) does not and will not emit `theme`. `runR1LandingStep` sets `payload.theme = { mode: resolveThemeMode(operatorChoice, archetype) }` *after* generation and *before* `saveLandingPayload`. Default ("auto") derives from the archetype's new `defaultThemeMode`.

4. **The map uses the keyless embed** `https://www.google.com/maps?q=<encoded>&output=embed` (no API key, no new env/infra). `MapSection` renders **nothing** when no address is present (`payload.footer.address` is optional and absent on many workspaces — graceful degradation, not an error). Trade-off: the keyless URL is undocumented and can occasionally show a consent interstitial; if that becomes a problem, a later phase can swap in the keyed Embed API behind the same `mapEmbedUrl` builder. No `R1FooterSection`/schema change is needed.

5. **Intake-in-hero reuses the existing copy.** No new lead-form payload — `R1HeroSection` gets a single `leadFormInHero?: boolean`; the form's content still comes from the existing `payload.leadForm` (`R1LeadFormSection`). The form renders only in the two two-column hero variants (`HeroSplit`, `HeroLeftAsymmetric`); the full-bleed `HeroCinematic` is out of scope for P2 (no natural right column).

---

## Spec ↔ Code Reconciliation (deltas from the design spec's P2 prose)

- The spec says "add `leadFormInHero` to the home hero." Implemented as a **boolean** flag on `R1HeroSection`; the form data stays in the existing top-level `payload.leadForm` (DRY — one copy source for the home bottom form, the hero form, and the service-page form).
- The spec says "the shell flips the CSS-var palette" for dark mode. True at the shell, but Phase 1 left the sections shadowing it — **Key Decision 1 is the missing piece that makes the spec's promise real.** This is the single most important task; everything visual in dark mode depends on it.
- The spec lists a dark archetype "like greenwood's green." Implemented as `midnight-craft` (near-black bg, emerald accent). The exact palette hexes in Task 2 are a starting point Max can tune.
- The spec's "no horizontal scroll" hardening is Phase 1's `overflow-x: clip` shell root + a Task 12 audit of the two new overflow risks (the map `<iframe>` and the hero form column at 375px).

---

## File Structure

| File | New / Modified | Responsibility |
| --- | --- | --- |
| `packages/crm/src/components/landing-r1/sections/hero.tsx` | **Modified** | Remove root `archetypeStyle` (Mechanism C); accept `leadFormInHero`, `orgSlug`, `leadForm`; render `<LeadFormCard>` in the right column of `HeroSplit` + `HeroLeftAsymmetric`. |
| `packages/crm/src/components/landing-r1/sections/services-grid.tsx` | **Modified** | Remove root `archetypeStyle` (Mechanism C). |
| `packages/crm/src/components/landing-r1/sections/testimonials.tsx` | **Modified** | Remove root `archetypeStyle` (Mechanism C). |
| `packages/crm/src/components/landing-r1/sections/faq.tsx` | **Modified** | Remove root `archetypeStyle` (Mechanism C). |
| `packages/crm/src/components/landing-r1/sections/footer.tsx` | **Modified** | Remove root `archetypeStyle` (Mechanism C). |
| `packages/crm/src/components/landing-r1/sections/lead-form.tsx` | **Modified** | Remove root `archetypeStyle`; **extract `LeadFormCard`** (the inner card, no `<section>` wrapper) and re-export; `LeadFormSection` delegates to it. |
| `packages/crm/src/components/landing-r1/chrome/navbar.tsx` | **Modified** | Remove root `archetypeStyle` (Mechanism C). |
| `packages/crm/src/components/landing-r1/chrome/emergency-strip.tsx` | **Modified** | Remove root `archetypeStyle` (Mechanism C). |
| `packages/crm/src/components/landing-r1/chrome/sticky-mobile-bar.tsx` | **Modified** | Remove root `archetypeStyle` **but keep** the `--sf-sticky-cols` inline var. |
| `packages/crm/src/components/landing-r1/preview.tsx` | **Modified** | Wrap rendered sections in `<SiteShell>` so they still get the palette after Mechanism C. |
| `packages/crm/src/components/landing-r1/sections/service-page.tsx` | **Modified** | Mount `<LeadFormCard>` in `data-slot="intake"`; mount `<MapSection>` in `data-slot="map"`; new props `orgSlug`, `businessName`, `leadForm?`, `address?`; scope `.btn` → `.sf-service .btn` + `var(--radius)`. |
| `packages/crm/src/components/landing-r1/sections/map.tsx` | **New** | `"use client"`. `MapSection` — lazy keyless Google Maps `<iframe>`, archetype-themed, renders null on blank address. |
| `packages/crm/src/lib/landing/map-embed.ts` | **New** | Pure `mapEmbedUrl(address) → string | null` + `joinFooterAddress(addr)`. DB-free, unit-tested. |
| `packages/crm/src/lib/landing/theme-mode.ts` | **New** | Pure `resolveThemeMode(choice, archetype) → "light" | "dark"`. DB-free, unit-tested. |
| `packages/crm/src/lib/landing/r1-payload-prompt.ts` | **Modified** | Add `R1HeroSection.leadFormInHero?: boolean`. (Type-only.) |
| `packages/crm/src/lib/workspace/aesthetic-archetypes.ts` | **Modified** | Add `defaultThemeMode` to the `AestheticArchetype` interface (all 7 existing → `"light"`); add the `midnight-craft` entry; add a `classifyArchetype` branch; extend the `AestheticArchetypeId` union. |
| `packages/crm/src/components/landing-r1/archetypes.ts` | **Modified** | Add `midnight-craft` to the union, `ARCHETYPE_IDS`, and the `ARCHETYPES` record. |
| `packages/crm/src/lib/workspace/detect-vertical.ts` | **Modified** | Add `midnight-craft` to `ARCHETYPE_LABELS` (exhaustive Record — compile error if missing). |
| `packages/crm/src/lib/workspace/booking-intake-fields.ts` | **Modified** | Add `midnight-craft` to `FIELDS_BY_ARCHETYPE` (exhaustive Record). |
| `packages/crm/src/lib/landing/r1-landing-step.ts` | **Modified** | Accept `themeMode?`; inject `payload.theme = { mode: resolveThemeMode(...) }` before save. |
| `packages/crm/src/lib/web-onboarding/run-create-from-url.ts` | **Modified** | Thread `themeMode` from `RunInput.body` into `runR1LandingStep`. |
| `packages/crm/src/lib/web-onboarding/run-create-from-paste.ts` | **Modified** | Same threading. |
| `packages/crm/src/app/api/.../create-from-url/route.ts` (+ paste route) | **Modified** | Read `mode`/`theme_mode` query param → `RunInput.body.themeMode`. |
| `packages/crm/src/app/(dashboard)/clients/new/clients-new-form.tsx` | **Modified** | `themeMode` state (mirror `landingTemplate`); append `?mode=` to the SSE URL. |
| `packages/crm/src/app/(dashboard)/clients/new/build-animation/idle-scene.tsx` | **Modified** | A 3-way Auto/Light/Dark chip next to the existing Design chip. |
| `packages/crm/src/app/(public)/w/[slug]/page.tsx` | **Modified** | Pass `leadFormInHero`/`orgSlug`/`leadForm` to `<Hero>`; insert `<MapSection>` before `<Footer>`. |
| `packages/crm/src/app/(public)/w/[slug]/services/[service]/page.tsx` | **Modified** | Pass `orgSlug`/`businessName`/`leadForm`/`address` to `<ServicePageTemplate>`. |
| `packages/crm/src/app/(public)/s/[orgSlug]/[...slug]/page.tsx` | **Modified** | Same home + service wiring on the subdomain branches. |
| `packages/crm/tests/unit/landing/map-embed.spec.ts` | **New** | Unit tests for `mapEmbedUrl` + `joinFooterAddress`. |
| `packages/crm/tests/unit/landing/theme-mode.spec.ts` | **New** | Unit tests for `resolveThemeMode`. |
| `packages/crm/tests/unit/landing/midnight-craft-archetype.spec.ts` | **New** | Unit test: `archetypeStyle("midnight-craft")` emits the dark palette; `defaultThemeMode` is `"dark"`. |

**Decomposition notes (DRY / YAGNI):**
- All new *logic* is pure and lives in two tiny DB-free modules (`map-embed.ts`, `theme-mode.ts`) so it is testable under `node:test` + `tsx` with zero mocking. Components stay markup-only (verified by build + manual smoke, per the repo idiom).
- Mechanism C is mostly **deletions** — the lowest-risk way to make dark mode real.
- No DB migration, no loader change, no `archetypeStyle` signature change.

---

## Build gate (run before every commit that touches `packages/crm`)

```bash
cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit 2>&1 | grep -v '^\.next/' | grep 'error TS' || echo "no source TS errors"
```
- `check-use-server.sh` must exit 0 (catches the `"use server"` non-async-export rule that `tsc` misses and that breaks the Vercel prod build).
- `tsc` errors under `.next/types/validator.ts` are **pre-existing stale build artifacts** — filter them out with `grep -v '^\.next/'`. Only *source* errors count.
- Run a single unit spec via `cd packages/crm && npx tsx --test tests/unit/landing/<file>.spec.ts`.
- Task 12 runs the full `next build`.

---

## GROUP A — Dark mode foundation

## Task 1: Make `SiteShell` the sole palette owner (Mechanism C)

Remove the per-section `style={archetypeStyle(arch.id)}` so the shell's `theme.mode` actually cascades. Pure deletions + one preview fix. **No behavior change in light mode** (the shell sets the identical light vars that the sections were redundantly re-setting).

**Files (modify):** `hero.tsx`, `services-grid.tsx`, `testimonials.tsx`, `faq.tsx`, `footer.tsx`, `lead-form.tsx`, `chrome/navbar.tsx`, `chrome/emergency-strip.tsx`, `chrome/sticky-mobile-bar.tsx`, `preview.tsx` (all under `packages/crm/src/components/landing-r1/`).

- [ ] **Step 1: Inventory the exact call sites.**

Run: `cd packages/crm && grep -rn "archetypeStyle(" src/components/landing-r1/`
Expected ~10 hits. `sections/service-page.tsx` should show **only** `data-archetype` (no `archetypeStyle` — it was already fixed in P1). Confirm the list matches the 9 files to edit (hero, services-grid, testimonials, faq, footer, lead-form, navbar, emergency-strip, sticky-mobile-bar).

- [ ] **Step 2: For each of the 9 components, remove the `archetypeStyle` from the root element's `style`, keep `data-archetype`.**

The pattern on each root is some variant of:
```tsx
<div data-archetype={arch.id} style={archetypeStyle(arch.id)} className="...">
```
Change to:
```tsx
<div data-archetype={arch.id} className="...">
```
Then remove the now-unused `archetypeStyle` import from that file **iff it has no other use** (grep the file first; e.g. `archetypes` may still export `ARCHETYPES`/`ARCHETYPES_WITHOUT_NAVBAR` that the file uses — keep those).

**Special cases:**
- `chrome/sticky-mobile-bar.tsx`: the root spreads BOTH `archetypeStyle(arch.id)` AND a `--sf-sticky-cols` var. Remove only the `archetypeStyle` spread; **keep** `style={{ ["--sf-sticky-cols" as never]: ... }}` (or however it sets that var). Verify the sticky var still applies.
- `sections/lead-form.tsx`: this file is also refactored in Task 5. For Task 1 just remove the root `archetypeStyle`; Task 5 does the `LeadFormCard` extraction.

- [ ] **Step 3: Fix the only out-of-shell render path — `preview.tsx`.**

`preview.tsx` renders sections directly with no `SiteShell`, so after Step 2 it would render unstyled. Wrap its rendered sections:
```tsx
import { SiteShell } from "./shell/site-shell";
// ...
return (
  <SiteShell archetype={archetype} mode="light">
    {/* existing <Hero/> <ServicesGrid/> <Testimonials/> <Faq/> <Footer/> ... */}
  </SiteShell>
);
```
(Use the archetype the preview already selects. Keep `mode="light"` — preview is a light dev surface.)

- [ ] **Step 4: Confirm no other out-of-shell usage.**

Run: `cd packages/crm && grep -rn "<Hero\b\|<ServicesGrid\b\|<Testimonials\b\|<Faq\b\|<Footer\b\|<Navbar\b" src/app src/components | grep -v site-shell`
For each render site, confirm it is inside a `<SiteShell>` (the three public routes are; `preview.tsx` now is). If any other un-shelled site exists, wrap it in `SiteShell`. Report anything found.

- [ ] **Step 5: Build gate.**

Run the build gate (top of plan). `check-use-server` exits 0; **0 source TS errors**.

- [ ] **Step 6: Commit.**

```bash
git add packages/crm/src/components/landing-r1
git commit -m "refactor(landing): SiteShell is the sole archetype-palette owner (fixes dark-mode cascade)"
```

---

## Task 2: Add the `midnight-craft` dark archetype + `defaultThemeMode`

A natively-dark archetype (near-black bg, emerald accent) and a per-archetype default theme mode. Type-safe: the exhaustive `Record<AestheticArchetypeId, …>` registries force you to fill every spot.

**Files:** modify `lib/workspace/aesthetic-archetypes.ts`, `components/landing-r1/archetypes.ts`, `lib/workspace/detect-vertical.ts`, `lib/workspace/booking-intake-fields.ts`. Test: `tests/unit/landing/midnight-craft-archetype.spec.ts`.

- [ ] **Step 1: Write the failing test.**

Create `packages/crm/tests/unit/landing/midnight-craft-archetype.spec.ts`:
```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { ARCHETYPES, archetypeStyle } from "../../../src/components/landing-r1/archetypes";
import { AESTHETIC_ARCHETYPES } from "../../../src/lib/workspace/aesthetic-archetypes";

describe("midnight-craft archetype", () => {
  test("is registered in both archetype registries", () => {
    assert.ok(ARCHETYPES["midnight-craft"], "missing from landing-r1 ARCHETYPES");
    assert.ok(
      AESTHETIC_ARCHETYPES.find((a) => a.id === "midnight-craft"),
      "missing from aesthetic-archetypes",
    );
  });

  test("archetypeStyle emits a dark background + light text + a green primary", () => {
    const style = archetypeStyle("midnight-craft") as Record<string, string>;
    // near-black background, near-white text (exact hexes per Step 3).
    assert.equal(style["--bg"], "#0d100e");
    assert.equal(style["--text"], "#f2f5f3");
    assert.equal(style["--primary"], "#34d399");
  });

  test("its defaultThemeMode is dark; every other archetype defaults to light", () => {
    for (const a of AESTHETIC_ARCHETYPES) {
      assert.ok(a.defaultThemeMode === "light" || a.defaultThemeMode === "dark");
      if (a.id === "midnight-craft") assert.equal(a.defaultThemeMode, "dark");
      else assert.equal(a.defaultThemeMode, "light");
    }
  });
});
```
> If the canonical export name isn't `AESTHETIC_ARCHETYPES`, grep `aesthetic-archetypes.ts` for the exported array/record of archetypes and use the real name (adjust the import + the `.find`/iteration accordingly). Report the real name.

- [ ] **Step 2: Run it — expect FAIL** (`midnight-craft` not a valid id / not in the registries).

Run: `cd packages/crm && npx tsx --test tests/unit/landing/midnight-craft-archetype.spec.ts`

- [ ] **Step 3: Add `defaultThemeMode` to the interface + extend the union + add the entry — `lib/workspace/aesthetic-archetypes.ts`.**

(a) Add to the `AestheticArchetype` interface: `defaultThemeMode: "light" | "dark";`
(b) Extend `AestheticArchetypeId`: add `| "midnight-craft"`.
(c) Add `defaultThemeMode: "light"` to **all 7 existing** entries (the compiler will flag any you miss once the field is required).
(d) Add the new entry (reuse an existing archetype's `fonts` to avoid adding a webfont — copy `bold-urgency`'s `fonts`):
```ts
"midnight-craft": {
  id: "midnight-craft",
  label: "Midnight craft — near-black, emerald accent",
  fits: "Premium trades, design-build remodelers, and studios that want a bold dark site.",
  palette: {
    primary: "#34d399",      // emerald accent (greenwood-style)
    secondary: "#10b981",    // deeper emerald
    background: "#0d100e",   // near-black, faint green
    text: "#f2f5f3",         // near-white (never pure white)
    border: "#1e2a23",       // dark green-tinted border
  },
  fonts: { /* copy bold-urgency.fonts verbatim */ },
  dials: { designVariance: 7, motionIntensity: 6, visualDensity: 5 },
  heroVariant: "left-aligned-asymmetric",
  defaultTemplate: "",
  desktopStickyCTA: false,
  bannedHere: ["light/cream backgrounds", "warm tones", "pure black #000000", "Inter font", "3-equal-card grids"],
  motionPreset: "balanced",
  voice: { /* copy the shape of another entry's voice; tone: confident/crafted */
    tone: "confident, crafted, understated", pace: "measured",
    leanInto: ["craftsmanship", "materials", "portfolio"],
    avoid: ["hype", "discount language"],
  },
  fallbackImageQueries: ["dark modern kitchen remodel", "moody craftsman interior", "architectural detail low light"],
  defaultThemeMode: "dark",
},
```
> Match the **exact** field set the real interface requires (the research listed: `id,label,fits,palette,fonts,dials,heroVariant,defaultTemplate,desktopStickyCTA,bannedHere,motionPreset,voice,fallbackImageQueries` + the new `defaultThemeMode`). Fill any field this snippet omits by copying the shape from an existing entry. `tsc` is the gate.

- [ ] **Step 4: Add the entry to the landing-r1 registry — `components/landing-r1/archetypes.ts`.**

(a) Add `| "midnight-craft"` to that file's `AestheticArchetypeId` union and to the `ARCHETYPE_IDS` array.
(b) Add a `"midnight-craft"` entry to `ARCHETYPES` matching this file's **local** `Archetype` shape (the research noted it's slimmer — no `defaultTemplate`; narrower `motionPreset`). Use the same `palette`/`fonts`/`motionPreset: "balanced"` as Step 3. Keep `palette.primary/secondary/background/text/border` identical so `archetypeStyle("midnight-craft")` emits the hexes the test asserts.
(c) If this file has an `ARCHETYPES_WITHOUT_NAVBAR` list, do **not** add `midnight-craft` (it should have a navbar).

- [ ] **Step 5: Fill the exhaustive Records (compiler-enforced).**

- `lib/workspace/detect-vertical.ts` → `ARCHETYPE_LABELS`: add `"midnight-craft": "Midnight craft"`.
- `lib/workspace/booking-intake-fields.ts` → `FIELDS_BY_ARCHETYPE`: add `"midnight-craft": <fields>` (reuse `brutalist`'s field list — creative/studio shops).
- Optional (not compiler-enforced): if `chrome/sticky-mobile-bar.tsx` has `ARCHETYPES_WITHOUT_STICKY`, consider adding `midnight-craft`. Leave it out unless obvious; note the choice.

- [ ] **Step 6: Add a classifier branch — `lib/workspace/aesthetic-archetypes.ts` `classifyArchetype`.**

Add a branch returning `"midnight-craft"` for businesses that signal a dark/premium aesthetic, e.g. matches on `/\b(luxury|high-end|premium|design[- ]build|bespoke|custom|studio|architect)\b/i` in the description **and** a trades/remodeling/creative vertical. Keep it conservative (don't steal volume from `editorial-warm`); place it before the generic fallback. The exact regex is your call — document it. (Operators can always override via the toggle, so precision matters less than not misfiring on every business.)

- [ ] **Step 7: Run the test — expect PASS** + build gate.

Run: `cd packages/crm && npx tsx --test tests/unit/landing/midnight-craft-archetype.spec.ts` then the build gate. 0 source TS errors (especially: every exhaustive Record is filled).

- [ ] **Step 8: Commit.**

```bash
git add packages/crm/src/lib/workspace packages/crm/src/components/landing-r1/archetypes.ts packages/crm/tests/unit/landing/midnight-craft-archetype.spec.ts
git commit -m "feat(landing): add midnight-craft dark archetype + defaultThemeMode"
```

---

## Task 3: `resolveThemeMode` + inject `theme.mode` in `runR1LandingStep`

Pure resolver (operator choice wins; else archetype default) + the deterministic server-side injection point.

**Files:** create `lib/landing/theme-mode.ts`; modify `lib/landing/r1-landing-step.ts`. Test: `tests/unit/landing/theme-mode.spec.ts`.

- [ ] **Step 1: Write the failing test.**

Create `packages/crm/tests/unit/landing/theme-mode.spec.ts`:
```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveThemeMode } from "../../../src/lib/landing/theme-mode";

describe("resolveThemeMode", () => {
  test("explicit operator choice wins over the archetype default", () => {
    assert.equal(resolveThemeMode("dark", "editorial-warm"), "dark");
    assert.equal(resolveThemeMode("light", "midnight-craft"), "light");
  });

  test('"auto" / undefined falls back to the archetype defaultThemeMode', () => {
    assert.equal(resolveThemeMode("auto", "midnight-craft"), "dark");
    assert.equal(resolveThemeMode("auto", "editorial-warm"), "light");
    assert.equal(resolveThemeMode(undefined, "midnight-craft"), "dark");
    assert.equal(resolveThemeMode(undefined, "editorial-warm"), "light");
  });

  test("unknown archetype id defaults to light (defensive)", () => {
    // @ts-expect-error — defensive against bad input.
    assert.equal(resolveThemeMode("auto", "does-not-exist"), "light");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (module missing).

- [ ] **Step 3: Implement `lib/landing/theme-mode.ts`.**

```ts
// Pure helper: resolve the final light/dark mode for a workspace's R1 site.
// Operator choice wins; "auto"/absent falls back to the archetype's
// defaultThemeMode. DB-free — runs under node:test + tsx.

import {
  AESTHETIC_ARCHETYPES,
  type AestheticArchetypeId,
} from "../workspace/aesthetic-archetypes";

export type ThemeModeChoice = "auto" | "light" | "dark";

export function resolveThemeMode(
  choice: ThemeModeChoice | undefined,
  archetype: AestheticArchetypeId,
): "light" | "dark" {
  if (choice === "light" || choice === "dark") return choice;
  const entry = AESTHETIC_ARCHETYPES.find((a) => a.id === archetype);
  return entry?.defaultThemeMode === "dark" ? "dark" : "light";
}
```
> Use the real exported name/shape from `aesthetic-archetypes.ts` (Task 2 confirmed it). If archetypes are a `Record` not an array, adapt the lookup (`AESTHETIC_ARCHETYPES[archetype]?.defaultThemeMode`).

- [ ] **Step 4: Run the test — expect PASS.**

- [ ] **Step 5: Inject in `lib/landing/r1-landing-step.ts`.**

(a) Add `themeMode?: ThemeModeChoice;` to the `runR1LandingStep` args type; import `resolveThemeMode`, `type ThemeModeChoice` from `./theme-mode`.
(b) After `const payload = await generateR1Payload(...)` and before `saveLandingPayload(...)`, insert:
```ts
payload.theme = { mode: resolveThemeMode(args.themeMode, archetype) };
```
(`archetype` is the local const already computed earlier in the function.)

- [ ] **Step 6: Build gate, then commit.**

```bash
git add packages/crm/src/lib/landing/theme-mode.ts packages/crm/src/lib/landing/r1-landing-step.ts packages/crm/tests/unit/landing/theme-mode.spec.ts
git commit -m "feat(landing): resolveThemeMode + inject theme.mode in runR1LandingStep"
```

---

## GROUP B — Operator toggle (thread the choice through creation)

## Task 4: Light/Dark toggle in `/clients/new` → query param → `runR1LandingStep`

Mirror the existing `landingTemplate` plumbing end-to-end. UI + wiring; verified by build + manual.

**Files:** modify `clients-new-form.tsx`, `build-animation/idle-scene.tsx`, the create-from-url + create-from-paste API routes, `run-create-from-url.ts`, `run-create-from-paste.ts`. (`r1-landing-step.ts` already accepts `themeMode` from Task 3.)

- [ ] **Step 1: State + chip in `clients-new-form.tsx`.**

Add, mirroring `landingTemplate` (research: state at ~line 194, query append at ~lines 227 & 303):
```ts
const [themeMode, setThemeMode] = useState<"auto" | "light" | "dark">("auto");
```
Pass `themeMode`/`onThemeModeChange={setThemeMode}` to `<IdleScene>`. In **both** stream starters (`startStream`, `startBizInfoStream`), append to the SSE query string next to the `template` append:
```ts
if (themeMode && themeMode !== "auto") qs.set("mode", themeMode);
```

- [ ] **Step 2: The chip UI in `idle-scene.tsx`.**

Add `themeMode` + `onThemeModeChange` to `IdleSceneProps`. In the footer toolbar row (next to `<DesignChip>`, ~line 419), add a small 3-way segmented control (Auto / Light / Dark) styled like the existing chip. Minimal, accessible (`<button type="button">` per option, `aria-pressed`). Match the existing chip's classNames/markup idiom — read `DesignChip` and copy its shape.

- [ ] **Step 3: Read the param in the API routes.**

In the create-from-url route (research: reads `template` at ~line 147) and the paste route, read the new param and thread it into `RunInput.body`:
```ts
const themeMode = searchParams.get("mode") ?? undefined; // "light" | "dark"
// ... body: { ..., landingTemplate: template, themeMode }
```

- [ ] **Step 4: Thread through the orchestrators.**

In `run-create-from-url.ts` (call at ~line 353) and `run-create-from-paste.ts` (~line 233): add `themeMode?: "light" | "dark"` to `RunInput.body`'s type and pass it into the existing `runR1LandingStep({ workspaceId, facts, byokKey, themeMode: body.themeMode })`.

- [ ] **Step 5: Build gate, then commit.**

```bash
git add packages/crm/src/app/\(dashboard\)/clients/new packages/crm/src/app/api packages/crm/src/lib/web-onboarding
git commit -m "feat(clients-new): operator light/dark toggle threads theme.mode into R1 build"
```
> Manual check is in Task 12 (create a workspace with Dark selected → confirm the saved payload has `theme.mode:"dark"`).

---

## GROUP C — Intake in the hero

## Task 5: Extract `LeadFormCard` from `LeadFormSection` (no behavior change)

Make the form reusable inside a hero column and the service intake slot, without the full-width section wrapper.

**Files:** modify `sections/lead-form.tsx`.

- [ ] **Step 1: Extract the inner card.**

In `lead-form.tsx`, split the component:
- `LeadFormCard` (new, exported, `"use client"`): everything **inside** the `<section>` — the `.sf-leadform-card`, all `useState`, the submit handler (calls `submitLeadFormAction`), the confirm state, and the card's styled-jsx. Its root is the card `<div>` (no `<section>`, no `data-archetype`, no `archetypeStyle`). Props: `{ orgSlug: string; businessName: string; leadForm: R1LeadFormSection }`.
- `LeadFormSection` (keep, exported): now a thin wrapper — the `<section id="lead-form">` shell (its padding/centering styles) rendering `<LeadFormCard {...props} />`. After Task 1 it no longer sets `archetypeStyle` on its root.

Keep all behavior identical (same fields, same action, same consent text). This is a pure refactor.

- [ ] **Step 2: Build gate.** 0 source TS errors; `check-use-server` still 0 (the action import is unchanged).

- [ ] **Step 3: Commit.**

```bash
git add packages/crm/src/components/landing-r1/sections/lead-form.tsx
git commit -m "refactor(landing): extract reusable LeadFormCard from LeadFormSection"
```
> Manual: home bottom lead form renders/posts identically (Task 12).

---

## Task 6: Render `LeadFormCard` in the hero (`leadFormInHero`)

**Files:** modify `lib/landing/r1-payload-prompt.ts` (type), `sections/hero.tsx`, `app/(public)/w/[slug]/page.tsx`, `app/(public)/s/[orgSlug]/[...slug]/page.tsx`.

- [ ] **Step 1: Add the payload flag (type-only).**

In `r1-payload-prompt.ts`, add to `R1HeroSection`:
```ts
  /** P2: when true (and payload.leadForm.enabled), the hero renders the intake
   *  form in its right column (desktop) / below the image (mobile). */
  leadFormInHero?: boolean;
```

- [ ] **Step 2: Accept the form inputs in `hero.tsx`.**

Add to `HeroProps`: `orgSlug?: string;` and `leadForm?: R1LeadFormSection;` (import the type). `leadFormInHero` already arrives via the spread of `R1HeroSection`. Compute once near the top of `Hero()`:
```ts
const showHeroForm = Boolean(leadFormInHero && leadForm?.enabled && orgSlug);
```

- [ ] **Step 3: Render the form in the two two-column variants.**

In `HeroSplit` (right column is the `hero-photo-wrap`, ~lines 379–391) and `HeroLeftAsymmetric` (second grid column, ~lines 183–272): when `showHeroForm`, render `<LeadFormCard orgSlug={orgSlug!} businessName={businessName} leadForm={leadForm!} />` in that right/second column **instead of** the photo (or above it). On mobile the column stacks below the hero text (the existing single-column grid) — that satisfies "mobile: form below." Add a wrapper class `hero-form-col` and, on desktop, make it sticky:
```css
@media (min-width: 1024px) { .hero-form-col { position: sticky; top: 88px; } }
```
`HeroCinematic` is out of scope — leave it unchanged (no form).
Import `LeadFormCard` from `./lead-form`.

- [ ] **Step 4: Pass the inputs from the home routes.**

In `w/[slug]/page.tsx` and the `/s` home branch, the `<Hero {...payload.hero} />` spread already carries `leadFormInHero`. Add `orgSlug={slug}` (or `orgSlug` on `/s`) and `leadForm={payload.leadForm}`:
```tsx
<Hero {...payload.hero} orgSlug={slug} leadForm={payload.leadForm} />
```

- [ ] **Step 5: Build gate, then commit.**

```bash
git add packages/crm/src/lib/landing/r1-payload-prompt.ts packages/crm/src/components/landing-r1/sections/hero.tsx "packages/crm/src/app/(public)/w/[slug]/page.tsx" "packages/crm/src/app/(public)/s/[orgSlug]/[...slug]/page.tsx"
git commit -m "feat(landing): optional intake form in the hero (leadFormInHero)"
```

---

## Task 7: Mount `LeadFormCard` in the service-page intake slot

**Files:** modify `sections/service-page.tsx`, `app/(public)/w/[slug]/services/[service]/page.tsx`, `app/(public)/s/[orgSlug]/[...slug]/page.tsx`.

- [ ] **Step 1: Extend `ServicePageTemplateProps`.**

Add: `orgSlug: string;`, `businessName: string;`, `leadForm?: R1LeadFormSection;` (import the type).

- [ ] **Step 2: Replace the intake placeholder.**

Replace the P1 placeholder:
```tsx
<div data-slot="intake" className="slot slot-intake" aria-hidden="true" />
```
with:
```tsx
{leadForm?.enabled && orgSlug ? (
  <div data-slot="intake" className="slot-intake-live">
    <LeadFormCard orgSlug={orgSlug} businessName={businessName} leadForm={leadForm} />
  </div>
) : null}
```
Import `LeadFormCard` from `./lead-form`. Drop the dashed `.slot-intake` placeholder CSS (or repurpose to `.slot-intake-live` with sensible spacing).

- [ ] **Step 3: Pass props from both service routes.**

In `w/[slug]/services/[service]/page.tsx` and the `/s` service branch, on `<ServicePageTemplate>` add: `orgSlug={slug}` (or the subdomain slug), `businessName={payload.hero.businessName}`, `leadForm={payload.leadForm}`. (Both routes already have `payload` in scope.)

- [ ] **Step 4: Build gate, then commit.**

```bash
git add packages/crm/src/components/landing-r1/sections/service-page.tsx "packages/crm/src/app/(public)/w/[slug]/services/[service]/page.tsx" "packages/crm/src/app/(public)/s/[orgSlug]/[...slug]/page.tsx"
git commit -m "feat(landing): mount intake form in the per-service hero slot"
```

---

## GROUP D — Map

## Task 8: Pure `mapEmbedUrl` + `joinFooterAddress`

**Files:** create `lib/landing/map-embed.ts`. Test: `tests/unit/landing/map-embed.spec.ts`.

- [ ] **Step 1: Write the failing test.**

Create `packages/crm/tests/unit/landing/map-embed.spec.ts`:
```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { mapEmbedUrl, joinFooterAddress } from "../../../src/lib/landing/map-embed";

describe("joinFooterAddress", () => {
  test("joins line1/city/state/zip into one string", () => {
    assert.equal(
      joinFooterAddress({ line1: "123 Main St", city: "Beacon", state: "NY", zip: "12508" }),
      "123 Main St, Beacon, NY 12508",
    );
  });
  test("tolerates missing parts", () => {
    assert.equal(joinFooterAddress({ line1: "123 Main St", city: "Beacon", state: "", zip: "" }), "123 Main St, Beacon");
    assert.equal(joinFooterAddress(undefined), "");
    assert.equal(joinFooterAddress(null), "");
  });
});

describe("mapEmbedUrl", () => {
  test("builds a keyless google maps embed url from an address", () => {
    assert.equal(
      mapEmbedUrl("123 Main St, Beacon, NY 12508"),
      "https://www.google.com/maps?q=123%20Main%20St%2C%20Beacon%2C%20NY%2012508&output=embed",
    );
  });
  test("returns null for blank / missing input", () => {
    assert.equal(mapEmbedUrl(""), null);
    assert.equal(mapEmbedUrl("   "), null);
    assert.equal(mapEmbedUrl(undefined), null);
    assert.equal(mapEmbedUrl(null), null);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (module missing).

- [ ] **Step 3: Implement `lib/landing/map-embed.ts`.**

```ts
// Pure, DB-free helpers for the map section. No API key: the keyless
// `?q=...&output=embed` form renders a Google Maps iframe without billing.
// Returns null on blank input so the component can render nothing.

export type FooterAddress = {
  line1?: string;
  city?: string;
  state?: string;
  zip?: string;
} | null | undefined;

/** Collapse a structured footer address into one line, skipping blanks. */
export function joinFooterAddress(addr: FooterAddress): string {
  if (!addr || typeof addr !== "object") return "";
  const head = [addr.line1, addr.city].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
  const tail = [addr.state, addr.zip].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  return [head, tail].filter(Boolean).join(", ");
}

/** Keyless Google Maps embed URL, or null when there's no usable address. */
export function mapEmbedUrl(address: string | null | undefined): string | null {
  const q = (address ?? "").trim();
  if (!q) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
}
```

- [ ] **Step 4: Run the test — expect PASS** + build gate, then commit.

```bash
git add packages/crm/src/lib/landing/map-embed.ts packages/crm/tests/unit/landing/map-embed.spec.ts
git commit -m "feat(landing): pure mapEmbedUrl + joinFooterAddress helpers"
```

---

## Task 9: `MapSection` component

**Files:** create `sections/map.tsx`.

- [ ] **Step 1: Implement `packages/crm/src/components/landing-r1/sections/map.tsx`.**

```tsx
// landing-r1/sections/map.tsx
//
// Lazy, keyless Google Maps embed. Archetype-themed via CSS vars (inherited
// from SiteShell). Renders NOTHING when there's no address — the map is a
// progressive enhancement, never a broken empty box.

"use client";

import type { AestheticArchetypeId } from "../archetypes";
import { mapEmbedUrl } from "@/lib/landing/map-embed";

export type MapSectionProps = {
  /** Pre-joined, one-line address (use joinFooterAddress at the call site). */
  address?: string | null;
  archetype: AestheticArchetypeId;
  /** Optional heading; omit for a bare map. */
  heading?: string;
};

export function MapSection({ address, heading }: MapSectionProps) {
  const src = mapEmbedUrl(address);
  if (!src) return null;
  return (
    <section className="sf-r1-map" data-slot="map">
      <div className="container">
        {heading ? <h2 className="sf-r1-map__heading">{heading}</h2> : null}
        <div className="sf-r1-map__frame">
          <iframe
            src={src}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Business location map"
            allowFullScreen
          />
        </div>
      </div>
      <MapStyles />
    </section>
  );
}

function MapStyles() {
  return (
    <style jsx global>{`
      .sf-r1-map { padding: 0 0 64px; background: var(--bg); color: var(--text); }
      .sf-r1-map .container {
        max-width: 1200px; margin: 0 auto;
        padding-left: 20px; padding-right: 20px;
      }
      @media (min-width: 768px) { .sf-r1-map .container { padding-left: 32px; padding-right: 32px; } }
      @media (min-width: 1024px) { .sf-r1-map .container { padding-left: 48px; padding-right: 48px; } }
      .sf-r1-map__heading {
        margin: 0 0 16px; font-family: var(--font-headline); font-weight: 800;
        font-size: clamp(22px, 3vw, 30px); letter-spacing: -0.015em;
      }
      .sf-r1-map__frame {
        width: 100%; aspect-ratio: 16 / 7; min-height: 220px;
        border-radius: 14px; overflow: hidden;
        border: 1px solid var(--border); background: var(--surface);
      }
      .sf-r1-map__frame iframe { width: 100%; height: 100%; border: 0; display: block; }
    `}</style>
  );
}
```
> `aspect-ratio` + `width: 100%` keeps the iframe inside the viewport (no horizontal scroll). The `data-slot="map"` is kept so the service template can swap its placeholder for `<MapSection>` cleanly.

- [ ] **Step 2: Build gate** (`grep -E "sections/map"` for new errors), then commit.

```bash
git add packages/crm/src/components/landing-r1/sections/map.tsx
git commit -m "feat(landing): MapSection (lazy keyless Google Maps embed)"
```

---

## Task 10: Mount the map on the home + service pages

**Files:** modify `sections/service-page.tsx`, `app/(public)/w/[slug]/page.tsx`, `app/(public)/w/[slug]/services/[service]/page.tsx`, `app/(public)/s/[orgSlug]/[...slug]/page.tsx`.

- [ ] **Step 1: Service template — replace the map placeholder.**

In `service-page.tsx`: add `address?: string | null;` to `ServicePageTemplateProps`. Replace the P1 map placeholder:
```tsx
<section className="sf-service-map">
  <div className="container">
    <div data-slot="map" className="slot slot-map" aria-hidden="true" />
  </div>
</section>
```
with:
```tsx
<MapSection address={address} archetype={archetype} />
```
Import `MapSection` from `./map`. Remove the now-dead `.sf-service-map`/`.slot-map` CSS from `ServicePageStyles`.

- [ ] **Step 2: Home routes — insert the map before the footer.**

In `w/[slug]/page.tsx` and the `/s` home branch, import `MapSection` + `joinFooterAddress` (from `@/lib/landing/map-embed`) and insert **between `<Faq>` and `<Footer>`**:
```tsx
<MapSection address={joinFooterAddress(payload.footer.address)} archetype={payload.hero.archetype} heading="Where we work" />
```
(It self-hides when there's no address.)

- [ ] **Step 3: Service routes — pass the address.**

In both service routes, on `<ServicePageTemplate>` add:
```tsx
address={joinFooterAddress(payload.footer.address)}
```
(Import `joinFooterAddress`.)

- [ ] **Step 4: Build gate, then commit.**

```bash
git add packages/crm/src/components/landing-r1/sections/service-page.tsx "packages/crm/src/app/(public)/w/[slug]/page.tsx" "packages/crm/src/app/(public)/w/[slug]/services/[service]/page.tsx" "packages/crm/src/app/(public)/s/[orgSlug]/[...slug]/page.tsx"
git commit -m "feat(landing): mount MapSection on home + service pages"
```

---

## GROUP E — Hardening + verification

## Task 11: Scope the service-page `.btn` (deferred P1 cleanup)

`service-page.tsx`'s `ServicePageStyles` declares a **global** `.btn` (hardcoded `8px` radius) that collides with `hero.tsx`'s `:global(.btn)` (`var(--radius,10px)`). Harmless in P1 (never co-rendered) but now both the hero form and the service page are in play. Scope it.

**Files:** modify `sections/service-page.tsx`.

- [ ] **Step 1:** In `ServicePageStyles`, prefix every `.btn*` selector with `.sf-service ` (e.g. `.sf-service .btn`, `.sf-service .btn-primary`, …) and change the hardcoded `border-radius: 8px` to `border-radius: var(--radius, 8px)`. The `.sf-service` wrapper already exists on the template root, so the buttons inside still match.

- [ ] **Step 2: Build gate, then commit.**

```bash
git add packages/crm/src/components/landing-r1/sections/service-page.tsx
git commit -m "fix(landing): scope service-page .btn to .sf-service + use --radius token"
```

---

## Task 12: Full build gate + no-scroll audit + manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Run every new unit spec together.**

```bash
cd packages/crm && npx tsx --test tests/unit/landing/theme-mode.spec.ts tests/unit/landing/map-embed.spec.ts tests/unit/landing/midnight-craft-archetype.spec.ts
```
Expected: `fail 0`.

- [ ] **Step 2: Repo-wide unit suite (no regressions).**

```bash
cd packages/crm && pnpm test:unit 2>&1 | tail -15
```
Expected: P1 landing specs still pass; the new specs pass; no new failures vs. the known baseline.

- [ ] **Step 3: Full build gate.**

```bash
cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit && npx next build
```
Expected: `check-use-server` exits 0; `tsc` reports **no source errors** (`.next/types/validator.ts` artifacts are pre-existing — regenerated by `next build`); `next build` completes and lists `/w/[slug]`, `/w/[slug]/services/[service]`, `/s/[orgSlug]/[...slug]`.

- [ ] **Step 4: Manual smoke (seed → walk, desktop + 375px mobile).**

Seed one workspace whose `landing_pages` r1 payload has `theme.mode:"dark"`, `hero.leadFormInHero:true`, `leadForm.enabled:true`, `footer.address:{line1,city,state,zip}`, and 3 `servicePages` (use the P1 `multiPagePayload` fixture shape via `mcp__neon__run_sql` `jsonb_set`). Then verify:
  1. `/w/<slug>` in **dark mode** → the *whole* page is dark (bg/text/surfaces), brand accent preserved — proving Mechanism C. The hero shows the intake form (right column desktop / below image mobile). A map renders before the footer.
  2. Submit the hero form → a lead is created + speed-to-lead SMS fires (same as the bottom form).
  3. `/w/<slug>/services/kitchen-remodeling` → dark; intake form in the hero slot; map renders.
  4. A workspace with **no** `footer.address` → **no** map section appears (graceful), page otherwise intact.
  5. A `midnight-craft` workspace (set `hero.archetype` + footer/etc. to `midnight-craft`) renders its native dark palette with `theme.mode` absent.
  6. A **legacy light** workspace (no `theme`, no `leadFormInHero`) renders exactly as before — **no visual regression from Mechanism C** (this is the key safety check).
  7. **375px** across all of the above → **no horizontal scroll** (map iframe is `width:100%`; hero form column wraps; shell `overflow-x:clip` holds).
  8. `/clients/new` with **Dark** selected → after build, the saved payload has `theme.mode:"dark"`.

- [ ] **Step 5: Final commit (only if Steps 1–4 required fixes).**

```bash
git add -A
git commit -m "test(landing): verify multi-page P2 build gate + dark/intake/map smoke"
```

---

## Self-Review (completed by plan author)

**Spec (P2 scope) coverage:**
1. *Intake-in-hero (desktop right column / mobile below), reusing LeadFormSection + submitLeadFormAction* → Tasks 5 (extract `LeadFormCard`), 6 (hero), 7 (service slot). Reuses the existing `payload.leadForm` + action.
2. *`map.tsx` (lazy Google Maps iframe from address) on home/contact/service; pure map-embed-URL builder unit-tested* → Tasks 8 (`mapEmbedUrl`/`joinFooterAddress` + tests), 9 (`MapSection`), 10 (home + service mounts). Contact page is P3 (no contact route yet).
3. *Dark archetype + light/dark toggle; default-from-archetype with override; shell flips the palette* → Tasks 1 (make the flip actually render — the missing P1 piece), 2 (`midnight-craft` + `defaultThemeMode`), 3 (`resolveThemeMode` + injection), 4 (operator toggle).
4. *No-horizontal-scroll hardening (audit map iframe + intake columns at 375px)* → `MapSection` `width:100%`/`aspect-ratio`; Task 12 Step 4.7 audit.

**Deferred P1 items folded in:** the dark-mode cross-section shadowing (Task 1) and the `.btn` global collision (Task 11). The `validateSiteTree` URL-clean-slug check stays deferred to **P4** (it gates generator output, which P4 builds).

**Placeholder scan:** new files (`map-embed.ts`, `theme-mode.ts`, `map.tsx`, the dark-archetype entry) have complete code; modifications give exact files + anchored change blocks (line numbers are approximate — the executor matches by content, as in P1).

**Type consistency:** `resolveThemeMode`/`ThemeModeChoice` (Task 3) match the toggle param (Task 4) and the injection (Task 3). `LeadFormCard` props `{orgSlug,businessName,leadForm}` (Task 5) match every call site (Tasks 6, 7). `mapEmbedUrl`/`joinFooterAddress` (Task 8) match `MapSection` (Task 9) and the mounts (Task 10). `leadFormInHero` (Task 6) is the only new payload key; `midnight-craft` is the only new archetype id (added to every exhaustive Record in Task 2).

**Risk note for the executor:** Task 1 is mostly deletions but is the highest-leverage change — verify the **light-mode-unchanged** smoke (Step 4.6) carefully, since a missed un-shelled render path would surface as an unstyled section. Run `grep` Steps 1 + 4 thoroughly.

---

## Roadmap: Phases 3–4 (unchanged from the P1 plan)

- **P3 — Extra pages:** Gallery, Service Areas, Contact (reuses `MapSection` + `LeadFormCard`), Blog (index + post); extend `validateSiteTree`; per-workspace `sitemap.xml`.
- **P4 — Generation + wiring:** extend `r1-payload-generator` to fill the full tree (15–20 services + gallery/areas/blog), set `leadFormInHero`/address coverage, run `validateSiteTree` on output (incl. the deferred **URL-clean-slug** check), and wire the end-to-end URL → live multi-page dark/light site.
