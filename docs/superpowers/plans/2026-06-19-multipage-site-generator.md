# Multi-Page Site Generator — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing R1 single-page landing framework into a multi-page foundation — add an optional page tree (`servicePages[]` + `nav` + `theme.mode`) to the R1 payload, a `/w/[slug]/services/[service]` route, a shared Navbar/Footer shell (with a Services dropdown) used by both the home and service pages, a one-template per-service page, and links from the home services grid out to each service page — all additive so existing single-page payloads render byte-for-byte unchanged.

**Architecture:** The R1 landing payload (`landing_pages.blueprint_json.payload`, slug `r1`) stays the single source of truth; Phase 1 adds three **optional** top-level keys (`servicePages`, `nav`, `theme`) so the loader (`loadLandingPayload`) needs no change (it already returns `bjson["payload"]` verbatim). A pure, fully-unit-tested module (`r1-site-tree.ts`) defines the new types, a `validateSiteTree` validator, a `findServicePage` lookup, and a `serviceSlug` slugifier — none of which touch the DB, so they run under the repo's `node:test` + `tsx` runner with zero mocking. A new `"use client"` shared shell (`components/landing-r1/shell/site-shell.tsx`) wraps page content with `archetypeStyle()` + `theme.mode` CSS vars and an `overflow-x: clip` root; the existing `Navbar` is extended in-place with a **Services dropdown** (additive prop, default-empty so current callers are unchanged). Both the home page (`/w/[slug]`) and the new service page (`/w/[slug]/services/[service]`) render through `SiteShell`. The service page is a server component that loads the payload, finds the `ServicePage` by slug, `notFound()`s on miss, and renders a pure-CSS-var per-service template. Subdomain routing needs **no `proxy.ts` change** — its existing catch-all already rewrites `{slug}.app.../services/{x}` → `/s/{slug}/services/{x}`; we extend only the `/s/[orgSlug]/[...slug]` page to dispatch `services/{x}` to the same template.

**Tech Stack:** Next.js 16 App Router (Server Components for routes, `"use client"` for the shell/sections per the existing styled-jsx pattern), React 19, TypeScript, Drizzle ORM (Postgres/Neon) — read-only here, `node:test` + `tsx` for unit tests (no vitest, no module mocking — pure functions only), styled-jsx (global mode, matching every `landing-r1` component), archetype CSS-var theming via `archetypeStyle()`.

---

## Spec ↔ Code Reconciliation (read before starting)

The design spec (`docs/superpowers/specs/2026-06-19-multipage-site-generator-design.md`) sketches the data model as `services: ServicePage[]` at the top level alongside a `home: {...}` object and a top-level `theme`. **The real current payload does not match that sketch**, and Phase 1 deliberately deviates to stay additive and low-risk:

1. **`services` is already taken.** In `r1-payload-prompt.ts`, `R1LandingPayload.services` is an `R1ServicesSection` (the home services *grid*), **not** an array of pages. Renaming it would break the home renderer, `rewriteR1Hrefs`, `r1-payload-to-template`, and every fixture. → Phase 1 adds the service-page collection under a **new** key **`servicePages?: ServicePage[]`**. The home grid keeps its `services` field unchanged.
2. **There is no top-level `home` object.** The current payload is flat: `hero`, `services`, `testimonials`, `faq`, `footer`, `emergency?`, `sticky?`, `leadForm?`. Phase 1 does **not** introduce a `home` wrapper (that would be a breaking migration for zero Phase-1 benefit). The flat shape stays; we only *add* `servicePages?`, `nav?`, `theme?`.
3. **There is no top-level `theme`.** Archetype lives per-section (`hero.archetype`, etc.); public pages are currently force-light at the route. Phase 1 adds an **optional** top-level `theme?: { mode?: "light" | "dark" }`. Phase 1 only *threads* it through the shell (defaulting to light, preserving today's behavior). The dark archetype + operator toggle are **P2**, not here.

Net: all new keys are optional; absent them, the home page renders exactly as today. The single rename (`services` ⇒ `servicePages` for the page collection) is the only deviation from the spec's prose, and it is the safe choice.

---

## File Structure

| File | New / Modified | Responsibility |
| --- | --- | --- |
| `packages/crm/src/lib/landing/r1-site-tree.ts` | **New** | Pure, DB-free module. Defines `ServicePage`, `ServicePageBody`, `R1NavConfig`, `R1ThemeConfig`, and the `R1SiteTree` mixin types. Exports `serviceSlug(name)` (slugifier), `validateSiteTree(payload)` (returns `{ valid, errors }`, never throws), `getServicePages(payload)` (safe accessor → `ServicePage[]`), and `findServicePage(payload, slug)` (→ `ServicePage \| null`). Everything is unit-tested. |
| `packages/crm/src/lib/landing/r1-payload-prompt.ts` | **Modified** | Add the optional `servicePages?`, `nav?`, and `theme?` keys (and re-export `ServicePage` etc. from `r1-site-tree.ts`) onto `R1LandingPayload`. Pure type addition — no prompt-builder change (P4 fills the tree). |
| `packages/crm/tests/unit/landing/r1-site-tree.spec.ts` | **New** | node:test unit tests for `serviceSlug`, `validateSiteTree`, `getServicePages`, `findServicePage` — plus an inline 3-service fixture payload. |
| `packages/crm/tests/unit/landing/r1-site-tree-fixture.ts` | **New** | Exported reusable fixture: a complete `R1LandingPayload` with 3 `servicePages` + a `nav` + `theme.mode`. Imported by the spec (and available to later phases). Not a test file (no `.spec`), so the runner ignores it as an entry point but `tsx` still type-checks it via the import. |
| `packages/crm/src/components/landing-r1/chrome/navbar.tsx` | **Modified** | Add an optional `servicePages?: { slug: string; name: string }[]` prop and a `homeHref?: string` prop. When `servicePages` is non-empty, render a **Services dropdown** (CSS-only `:hover`/`:focus-within`, no JS) listing each service linking to `${homeHref}/services/${slug}`. Default-empty → current behavior unchanged. The wordmark + "Services" anchor honor `homeHref` (defaults to `"/"`). |
| `packages/crm/src/components/landing-r1/shell/site-shell.tsx` | **New** | `"use client"`. Shared layout wrapper. Applies `archetypeStyle(archetype)` + a `theme.mode` override (dark flips `--bg`/`--text`/`--surface*`) on a root `<div>` with `overflow-x: clip; min-height: 100dvh`. Renders `{children}`. Used by both the home page and the service page so the navbar/footer/content share one themed, no-horizontal-scroll root. |
| `packages/crm/src/app/(public)/w/[slug]/services/[service]/page.tsx` | **New** | Server component. Loads the payload via `loadLandingPayload(slug)`, resolves the org context, `findServicePage(payload, service)`, `notFound()` on miss. Rewrites hrefs (`rewriteR1Hrefs`), wraps in `<SiteShell>`, renders `<Navbar>` (with `servicePages` + `homeHref`) → `<ServicePageTemplate>` → `<Footer>` → chatbot embed. Exports `generateMetadata` + `generateStaticParams` returning `[]` (on-demand). |
| `packages/crm/src/components/landing-r1/sections/service-page.tsx` | **New** | `"use client"`. The single per-service template, archetype-themed via CSS vars (no hard-coded hex). Sections: hero (service name + `heroPhoto?` + a **CTA placeholder** `<div data-slot="intake">` where P2's intake form mounts) → description (`body[]` blocks) → testimonials (reuses the existing `Testimonials` component) → CTA → a **map placeholder** `<div data-slot="map">` (P2 mounts the real embed). |
| `packages/crm/src/components/landing-r1/sections/services-grid.tsx` | **Modified** | The `ServiceCard` "Learn more" link changes from the in-page anchor `#service-${slugify(name)}` to the per-service route. Add an optional `serviceBaseHref?: string` prop on `ServicesGridProps`; when set, cards link to `${serviceBaseHref}/${serviceSlug(name)}`, else fall back to today's `#service-…` anchor (so existing direct callers are unchanged). Reuse `serviceSlug` from `r1-site-tree.ts` (delete the local `slugify`’s use for the link only). |
| `packages/crm/src/app/(public)/w/[slug]/page.tsx` | **Modified** | Wrap the existing R1 render in `<SiteShell archetype theme>`, pass `servicePages` + `homeHref` to `<Navbar>`, and pass `serviceBaseHref` to `<ServicesGrid>`. Exact diff shown in Task 7. Behavior identical when `servicePages` absent. |
| `packages/crm/src/app/(public)/s/[orgSlug]/[...slug]/page.tsx` | **Modified** | (a) Apply the same `<SiteShell>` + Navbar/grid wiring to the existing R-framework **home** branch. (b) Add a new branch: when `slug[0] === "services"` and `slug[1]` is present and the workspace has an r1 payload, render the **service page** (same shell + template) so the subdomain `/services/{x}` rewrite resolves. Exact diff in Task 8. |

**Decomposition notes (DRY / YAGNI):**
- All new *logic* lives in one pure module (`r1-site-tree.ts`) so it is testable without a DB and reused by both routes, the grid, and later phases. The route files stay thin (load → find → render), mirroring the existing `/w/[slug]/page.tsx`.
- No DB migration and **no loader change**: the three new keys live inside the existing `landing_pages.blueprint_json.payload` jsonb, which `loadLandingPayload` returns verbatim.
- No `proxy.ts` change: the existing catch-all (`resolveWorkspaceRewritePath`, lines ~128–131) already maps `{slug}.app.../services/{x}` → `/s/{slug}/services/{x}`. We only teach the `/s/[orgSlug]/[...slug]` page to handle that path.
- The shell is a **component**, not a Next `layout.tsx`: the navbar needs per-payload props (`businessName`, `serviceAreas`, `servicePages`) and a `layout` cannot receive route data without re-loading the payload. A shared component is the minimal refactor and keeps both render paths (`/w` and `/s`) identical.
- Visual shells (`site-shell.tsx`, `service-page.tsx`, the navbar dropdown) follow the repo idiom: **pure helpers are unit-tested; the rendered markup is verified manually** (per-phase smoke walk). We do not add jsdom.

---

## Task 1: Create the pure site-tree module (types + slugifier)

The foundation every later task imports. Pure functions only — `node:test` runs them directly.

**Files:**
- Create: `packages/crm/src/lib/landing/r1-site-tree.ts`
- Test: `packages/crm/tests/unit/landing/r1-site-tree.spec.ts`

- [ ] **Step 1: Write the failing test for `serviceSlug`**

Create `packages/crm/tests/unit/landing/r1-site-tree.spec.ts`:

```ts
// Tests for the pure multi-page site-tree helpers (no DB, no mocks).
//
// Repo convention: node:test + tsx (see scripts/run-unit-tests.js). Unit
// tests live at tests/unit/**/*.spec.ts and run via `pnpm test:unit` or a
// single file via `npx tsx --test tests/unit/landing/r1-site-tree.spec.ts`.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  serviceSlug,
  validateSiteTree,
  getServicePages,
  findServicePage,
} from "../../../src/lib/landing/r1-site-tree";

describe("serviceSlug", () => {
  test("lowercases, hyphenates, and trims punctuation", () => {
    assert.equal(serviceSlug("Kitchen Remodeling"), "kitchen-remodeling");
    assert.equal(serviceSlug("  Roofing & Siding!  "), "roofing-siding");
    assert.equal(serviceSlug("Bath/Shower Conversions"), "bath-shower-conversions");
    assert.equal(serviceSlug("Decks   and   Patios"), "decks-and-patios");
  });

  test("collapses non-alphanumerics and strips leading/trailing hyphens", () => {
    assert.equal(serviceSlug("---ADU Additions---"), "adu-additions");
    assert.equal(serviceSlug("A/C & Heating"), "a-c-heating");
  });

  test("returns empty string for empty / non-string input", () => {
    assert.equal(serviceSlug(""), "");
    assert.equal(serviceSlug("   "), "");
    // @ts-expect-error — defensive: callers may pass junk from jsonb.
    assert.equal(serviceSlug(undefined), "");
    // @ts-expect-error — defensive.
    assert.equal(serviceSlug(42), "");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && npx tsx --test tests/unit/landing/r1-site-tree.spec.ts`
Expected: FAIL — `Cannot find module '../../../src/lib/landing/r1-site-tree'` (module does not exist yet).

- [ ] **Step 3: Write the module with `serviceSlug` (minimal — only what Step 1 needs)**

Create `packages/crm/src/lib/landing/r1-site-tree.ts`:

```ts
// packages/crm/src/lib/landing/r1-site-tree.ts
//
// Pure, DB-free helpers + types for the multi-page R1 site tree.
//
// Phase 1 adds three OPTIONAL top-level keys to the R1 landing payload:
//   • servicePages?: ServicePage[]   — one page per service (15–20 in P4)
//   • nav?: R1NavConfig              — shared navbar config
//   • theme?: R1ThemeConfig          — { mode?: "light" | "dark" }
//
// All are optional so existing single-page payloads render unchanged. This
// module owns the slugifier, a non-throwing validator, and the safe accessors
// the routes use. Nothing here imports the DB — it runs under node:test + tsx
// with zero mocking.

/** One free-text content block in a service page body. Future block kinds
 *  (process, benefits, list) are added in P3; Phase 1 ships "paragraph". */
export type ServicePageBody =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string };

/** A single auto-populated service detail page. */
export type ServicePage = {
  /** URL segment, e.g. "kitchen-remodeling". Unique within servicePages. */
  slug: string;
  /** Display name, e.g. "Kitchen Remodeling". */
  name: string;
  /** Optional hero photo for the service page. */
  heroPhoto?: { src: string; alt: string };
  /** One-line summary shown in the hero / meta description. */
  summary: string;
  /** Description + process/benefits content blocks (rendered in order). */
  body: ServicePageBody[];
  /** Mini-gallery (service-tagged subset). Phase 1 carries the data; the
   *  gallery render is P3. Optional, defaults to []. */
  gallery?: { src: string; alt: string; caption?: string }[];
  /** Service-tagged or general testimonials reused by the template. */
  testimonials?: {
    id: string;
    quote: string;
    name: string;
    city?: string;
    rating?: number;
    service?: string;
  }[];
  /** Primary CTA label for this service, e.g. "Get a free estimate". */
  ctaLabel: string;
};

/** Shared navbar configuration (Services dropdown is derived from
 *  servicePages; these are the non-service links + CTA). */
export type R1NavConfig = {
  /** Extra top-level links beyond the Services dropdown. */
  items?: { label: string; href: string }[];
  /** Primary CTA shown at the right of the navbar (optional override). */
  cta?: { label: string; href: string };
};

/** Top-level theme config. Phase 1 only consumes `mode`. */
export type R1ThemeConfig = {
  mode?: "light" | "dark";
};

/**
 * Slugify a service name into a URL segment.
 * Lowercase, non-alphanumerics → single hyphen, no leading/trailing hyphens.
 * Returns "" for empty / non-string input (callers guard against "").
 */
export function serviceSlug(name: string): string {
  if (typeof name !== "string") return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crm && npx tsx --test tests/unit/landing/r1-site-tree.spec.ts`
Expected: PASS — the 3 `serviceSlug` tests pass. (`validateSiteTree`/`getServicePages`/`findServicePage` are imported but not yet exercised; the import resolves because the named exports are added in Task 2. **Until Task 2 adds them, the import line fails** — so run only after Step 3 of Task 2 if executing strictly. To keep this task self-contained, the imports in Step 1 reference symbols added in Task 2; if you execute task-by-task, temporarily comment the three unused imports, or run Tasks 1+2 together. Recommended: implement Task 1 Step 3 **and** Task 2 Step 3 before first running, since they share one file.)

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/landing/r1-site-tree.ts packages/crm/tests/unit/landing/r1-site-tree.spec.ts
git commit -m "feat(landing): add r1-site-tree module with serviceSlug"
```

---

## Task 2: Add the validator + safe accessors to the site-tree module

`validateSiteTree`, `getServicePages`, `findServicePage` — all pure, all non-throwing on garbage jsonb.

**Files:**
- Modify: `packages/crm/src/lib/landing/r1-site-tree.ts`
- Modify: `packages/crm/tests/unit/landing/r1-site-tree.spec.ts`
- Create: `packages/crm/tests/unit/landing/r1-site-tree-fixture.ts`

- [ ] **Step 1: Create the reusable fixture**

Create `packages/crm/tests/unit/landing/r1-site-tree-fixture.ts`:

```ts
// Reusable multi-page fixture: a complete R1LandingPayload with 3 servicePages,
// a nav config, and theme.mode. Imported by r1-site-tree.spec.ts (and available
// to later phases). NOT a *.spec file — the runner ignores it as an entry
// point, but tsx still type-checks it through the importing spec.

import type { R1LandingPayload } from "../../../src/lib/landing/r1-payload-prompt";

export const multiPagePayload: R1LandingPayload = {
  hero: {
    archetype: "editorial-warm",
    businessName: "Greenwood Remodeling Group",
    tagline: "Craftsman remodels, built to last",
    subhead:
      "Family-owned remodelers serving the Hudson Valley since 1998 — kitchens, baths, additions, and whole-home renovations done by hand.",
    primaryCTA: { label: "Get a free estimate", href: "/book" },
    trustBadges: [{ label: "Family-owned since 1998" }],
  },
  services: {
    archetype: "editorial-warm",
    eyebrow: "Our craft",
    heading: "What we build",
    services: [
      { id: "s1", name: "Kitchen Remodeling", description: "Custom kitchens, designed and built by hand." },
      { id: "s2", name: "Bath Remodeling", description: "Spa-quality baths with lasting materials." },
      { id: "s3", name: "Home Additions", description: "Seamless additions that match your home." },
    ],
    cta: { label: "Call (845) 555-0177", href: "tel:+18455550177" },
  },
  testimonials: {
    archetype: "editorial-warm",
    eyebrow: "What clients say",
    heading: "Trusted across the valley",
    testimonials: [
      { id: "t1", quote: "They rebuilt our kitchen and it's flawless.", name: "Diane M.", city: "Beacon", rating: 5, service: "Kitchen Remodeling" },
    ],
  },
  faq: {
    archetype: "editorial-warm",
    heading: "Frequently asked questions",
    items: [
      { id: "f1", question: "Do you offer free estimates?", answer: "Yes — every project starts with one." },
    ],
  },
  footer: {
    archetype: "editorial-warm",
    businessName: "Greenwood Remodeling Group",
    phone: "(845) 555-0177",
    serviceAreas: ["Beacon", "Newburgh", "Poughkeepsie"],
  },
  theme: { mode: "light" },
  nav: {
    items: [{ label: "Gallery", href: "/gallery" }],
    cta: { label: "Get a free estimate", href: "/book" },
  },
  servicePages: [
    {
      slug: "kitchen-remodeling",
      name: "Kitchen Remodeling",
      heroPhoto: { src: "https://images.example.com/kitchen.jpg", alt: "Finished custom kitchen" },
      summary: "Custom kitchens designed and built by hand for the way you cook and gather.",
      body: [
        { kind: "heading", text: "Designed around your daily life" },
        { kind: "paragraph", text: "We start with how you actually use your kitchen, then design cabinetry, counters, and flow to match." },
        { kind: "paragraph", text: "Every install is done by our own crew — no subs, no surprises." },
      ],
      gallery: [{ src: "https://images.example.com/kitchen-1.jpg", alt: "Kitchen detail" }],
      testimonials: [
        { id: "t1", quote: "They rebuilt our kitchen and it's flawless.", name: "Diane M.", city: "Beacon", rating: 5, service: "Kitchen Remodeling" },
      ],
      ctaLabel: "Get a free kitchen estimate",
    },
    {
      slug: "bath-remodeling",
      name: "Bath Remodeling",
      summary: "Spa-quality bathrooms built with materials that last a lifetime.",
      body: [
        { kind: "paragraph", text: "From walk-in showers to full gut renovations, we handle the whole project end to end." },
      ],
      ctaLabel: "Get a free bath estimate",
    },
    {
      slug: "home-additions",
      name: "Home Additions",
      summary: "Seamless additions that look like they were always part of your home.",
      body: [
        { kind: "paragraph", text: "We match rooflines, siding, and trim so your addition blends in perfectly." },
      ],
      ctaLabel: "Plan your addition",
    },
  ],
};
```

- [ ] **Step 2: Add the failing tests for the validator + accessors**

Append to `packages/crm/tests/unit/landing/r1-site-tree.spec.ts` (after the `serviceSlug` describe block, before EOF):

```ts
import { multiPagePayload } from "./r1-site-tree-fixture";

describe("getServicePages", () => {
  test("returns the servicePages array when present", () => {
    const pages = getServicePages(multiPagePayload);
    assert.equal(pages.length, 3);
    assert.equal(pages[0].slug, "kitchen-remodeling");
  });

  test("returns [] when servicePages is absent (legacy single-page payload)", () => {
    const legacy = { ...multiPagePayload };
    delete (legacy as { servicePages?: unknown }).servicePages;
    assert.deepEqual(getServicePages(legacy), []);
  });

  test("returns [] for malformed servicePages (not an array)", () => {
    const bad = { ...multiPagePayload, servicePages: "nope" as unknown } as typeof multiPagePayload;
    assert.deepEqual(getServicePages(bad), []);
  });
});

describe("findServicePage", () => {
  test("finds a page by exact slug", () => {
    const page = findServicePage(multiPagePayload, "bath-remodeling");
    assert.ok(page);
    assert.equal(page!.name, "Bath Remodeling");
  });

  test("returns null for an unknown slug", () => {
    assert.equal(findServicePage(multiPagePayload, "pool-installation"), null);
  });

  test("returns null when servicePages is absent", () => {
    const legacy = { ...multiPagePayload };
    delete (legacy as { servicePages?: unknown }).servicePages;
    assert.equal(findServicePage(legacy, "kitchen-remodeling"), null);
  });

  test("ignores entries with a missing/blank slug", () => {
    const bad = {
      ...multiPagePayload,
      servicePages: [
        { slug: "", name: "Blank", summary: "", body: [], ctaLabel: "x" },
        { slug: "decks", name: "Decks", summary: "", body: [], ctaLabel: "x" },
      ],
    } as typeof multiPagePayload;
    assert.equal(findServicePage(bad, ""), null);
    assert.equal(findServicePage(bad, "decks")!.name, "Decks");
  });
});

describe("validateSiteTree", () => {
  test("a legacy single-page payload (no servicePages) is valid", () => {
    const legacy = { ...multiPagePayload };
    delete (legacy as { servicePages?: unknown }).servicePages;
    delete (legacy as { nav?: unknown }).nav;
    delete (legacy as { theme?: unknown }).theme;
    const res = validateSiteTree(legacy);
    assert.equal(res.valid, true);
    assert.deepEqual(res.errors, []);
  });

  test("the multi-page fixture is valid", () => {
    const res = validateSiteTree(multiPagePayload);
    assert.equal(res.valid, true, JSON.stringify(res.errors));
    assert.deepEqual(res.errors, []);
  });

  test("flags a service page missing required string fields", () => {
    const bad = {
      ...multiPagePayload,
      servicePages: [
        { slug: "ok", name: "Ok", summary: "fine", body: [], ctaLabel: "Go" },
        { slug: "", name: "", summary: "", body: [], ctaLabel: "" } as ServicePageLike,
      ],
    } as typeof multiPagePayload;
    const res = validateSiteTree(bad);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("slug")));
    assert.ok(res.errors.some((e) => e.includes("name")));
  });

  test("flags duplicate service slugs", () => {
    const bad = {
      ...multiPagePayload,
      servicePages: [
        { slug: "dup", name: "One", summary: "a", body: [], ctaLabel: "x" },
        { slug: "dup", name: "Two", summary: "b", body: [], ctaLabel: "y" },
      ],
    } as typeof multiPagePayload;
    const res = validateSiteTree(bad);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.toLowerCase().includes("duplicate")));
  });

  test("flags an invalid theme.mode", () => {
    const bad = { ...multiPagePayload, theme: { mode: "neon" as unknown } } as typeof multiPagePayload;
    const res = validateSiteTree(bad);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("theme.mode")));
  });

  test("returns invalid (not a throw) for non-object input", () => {
    for (const junk of [undefined, null, 7, "nope", []]) {
      assert.doesNotThrow(() => validateSiteTree(junk));
      assert.equal(validateSiteTree(junk).valid, false);
    }
  });
});

// Local structural alias used only to construct deliberately-broken fixtures
// above without fighting the exact ServicePage type.
type ServicePageLike = {
  slug: string;
  name: string;
  summary: string;
  body: unknown[];
  ctaLabel: string;
};
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/crm && npx tsx --test tests/unit/landing/r1-site-tree.spec.ts`
Expected: FAIL — `validateSiteTree`, `getServicePages`, `findServicePage` are `undefined` / not exported (the new describe blocks throw `TypeError: ... is not a function`). Note: this also requires `theme`/`nav`/`servicePages` to exist on `R1LandingPayload` — added in Task 3. **If executing strictly task-by-task, do Task 3 Step 3 (the type addition) before running this**, since the fixture's `theme`/`nav`/`servicePages` keys won't type-check until then. Recommended ordering: write Task 2 + Task 3 source, then run both specs.

- [ ] **Step 4: Implement the validator + accessors**

Append to `packages/crm/src/lib/landing/r1-site-tree.ts`:

```ts
// ── Safe accessors ───────────────────────────────────────────────────────────

/** Structural shape we read from the (untyped-at-runtime) payload jsonb. */
type WithSiteTree = {
  servicePages?: unknown;
  nav?: unknown;
  theme?: unknown;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Return the servicePages array, or [] when absent/malformed.
 * Entries are NOT validated here — use validateSiteTree for that. This is the
 * tolerant read path the routes use; findServicePage layers the slug guard.
 */
export function getServicePages(payload: unknown): ServicePage[] {
  if (!isObject(payload)) return [];
  const sp = (payload as WithSiteTree).servicePages;
  return Array.isArray(sp) ? (sp as ServicePage[]) : [];
}

/**
 * Find a service page by slug. Returns null when servicePages is absent, the
 * slug is blank, or no entry matches. Entries with a missing/blank slug are
 * skipped so a half-populated payload can't shadow a real match with "".
 */
export function findServicePage(payload: unknown, slug: string): ServicePage | null {
  if (!isNonEmptyString(slug)) return null;
  const target = slug.trim();
  for (const page of getServicePages(payload)) {
    if (isObject(page) && isNonEmptyString(page.slug) && page.slug === target) {
      return page;
    }
  }
  return null;
}

// ── Validator ────────────────────────────────────────────────────────────────

export type SiteTreeValidation = { valid: boolean; errors: string[] };

const REQUIRED_SERVICE_STRINGS: (keyof ServicePage)[] = [
  "slug",
  "name",
  "summary",
  "ctaLabel",
];

/**
 * Validate the OPTIONAL multi-page additions on an R1 payload. Never throws.
 * A legacy single-page payload (no servicePages/nav/theme) is VALID — the new
 * keys are optional. When present, each is checked structurally:
 *   • servicePages: array; each entry has non-empty slug/name/summary/ctaLabel
 *     and a `body` array; slugs are unique.
 *   • theme.mode: when present, must be "light" | "dark".
 *   • nav: when present, must be an object (items/cta are optional).
 */
export function validateSiteTree(payload: unknown): SiteTreeValidation {
  const errors: string[] = [];

  if (!isObject(payload)) {
    return { valid: false, errors: ["payload is not an object"] };
  }

  const tree = payload as WithSiteTree;

  // theme.mode
  if (tree.theme !== undefined) {
    if (!isObject(tree.theme)) {
      errors.push("theme must be an object");
    } else if (
      tree.theme.mode !== undefined &&
      tree.theme.mode !== "light" &&
      tree.theme.mode !== "dark"
    ) {
      errors.push('theme.mode must be "light" or "dark"');
    }
  }

  // nav
  if (tree.nav !== undefined && !isObject(tree.nav)) {
    errors.push("nav must be an object");
  }

  // servicePages
  if (tree.servicePages !== undefined) {
    if (!Array.isArray(tree.servicePages)) {
      errors.push("servicePages must be an array");
    } else {
      const seen = new Set<string>();
      tree.servicePages.forEach((raw, i) => {
        if (!isObject(raw)) {
          errors.push(`servicePages[${i}] is not an object`);
          return;
        }
        for (const key of REQUIRED_SERVICE_STRINGS) {
          if (!isNonEmptyString(raw[key])) {
            errors.push(`servicePages[${i}].${String(key)} must be a non-empty string`);
          }
        }
        if (!Array.isArray(raw.body)) {
          errors.push(`servicePages[${i}].body must be an array`);
        }
        if (isNonEmptyString(raw.slug)) {
          if (seen.has(raw.slug)) {
            errors.push(`servicePages: duplicate slug "${raw.slug}"`);
          }
          seen.add(raw.slug);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/crm && npx tsx --test tests/unit/landing/r1-site-tree.spec.ts`
Expected: PASS — all `serviceSlug`, `getServicePages`, `findServicePage`, `validateSiteTree` tests pass. (Requires Task 3's type addition to be in place for the fixture to compile.)

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/lib/landing/r1-site-tree.ts packages/crm/tests/unit/landing/r1-site-tree.spec.ts packages/crm/tests/unit/landing/r1-site-tree-fixture.ts
git commit -m "feat(landing): site-tree validator + findServicePage + 3-service fixture"
```

---

## Task 3: Add the optional `servicePages` / `nav` / `theme` keys to `R1LandingPayload`

Pure type addition so the fixture and routes can reference the new keys. Type-only → the "test" is `tsc`.

**Files:**
- Modify: `packages/crm/src/lib/landing/r1-payload-prompt.ts`

- [ ] **Step 1: Add the import + extend the payload type**

In `packages/crm/src/lib/landing/r1-payload-prompt.ts`, add the import near the top (after the existing `import type { ExtractedBusinessFacts } ...` line, ~line 16):

```ts
import type {
  ServicePage,
  R1NavConfig,
  R1ThemeConfig,
} from "./r1-site-tree";
```

Then replace the `R1LandingPayload` type (currently ~lines 167–178):

```ts
/** Full R1 landing payload — union of all section prop shapes. */
export type R1LandingPayload = {
  hero: R1HeroSection;
  services: R1ServicesSection;
  testimonials: R1TestimonialsSection;
  faq: R1FaqSection;
  footer: R1FooterSection;
  emergency?: R1EmergencySection;
  sticky?: R1StickySection;
  /** Speed-to-Lead bottom section (optional). */
  leadForm?: R1LeadFormSection;
};
```

with:

```ts
/** Full R1 landing payload — union of all section prop shapes.
 *
 * Phase-1 multi-page additions are all OPTIONAL so existing single-page
 * payloads render unchanged:
 *   • servicePages — one ServicePage per service (the /w/[slug]/services/[x]
 *     route renders these). NOTE: distinct from `services` above, which is the
 *     home services GRID (R1ServicesSection). See the plan's Spec↔Code section.
 *   • nav          — shared navbar config (extra links + CTA override).
 *   • theme        — { mode?: "light" | "dark" }; threaded through SiteShell.
 */
export type R1LandingPayload = {
  hero: R1HeroSection;
  services: R1ServicesSection;
  testimonials: R1TestimonialsSection;
  faq: R1FaqSection;
  footer: R1FooterSection;
  emergency?: R1EmergencySection;
  sticky?: R1StickySection;
  /** Speed-to-Lead bottom section (optional). */
  leadForm?: R1LeadFormSection;
  /** Multi-page: per-service detail pages (Phase 1+). Optional. */
  servicePages?: ServicePage[];
  /** Multi-page: shared navbar config. Optional. */
  nav?: R1NavConfig;
  /** Multi-page: site theme (light/dark mode). Optional. */
  theme?: R1ThemeConfig;
};

// Re-export the site-tree types so existing importers of this module can reach
// them without a second import path.
export type { ServicePage, R1NavConfig, R1ThemeConfig } from "./r1-site-tree";
```

- [ ] **Step 2: Run the type check to verify the new keys compile and the site-tree spec passes**

Run: `cd packages/crm && npx tsc --noEmit 2>&1 | head -30`
Expected: no new errors referencing `r1-payload-prompt.ts`, `r1-site-tree.ts`, or `r1-site-tree-fixture.ts`. (Pre-existing unrelated errors elsewhere, if any, are out of scope — confirm none are in the files this plan touches.)

Run: `cd packages/crm && npx tsx --test tests/unit/landing/r1-site-tree.spec.ts`
Expected: PASS — the full suite from Tasks 1–2 now compiles (fixture's `theme`/`nav`/`servicePages` keys resolve) and passes.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/landing/r1-payload-prompt.ts
git commit -m "feat(landing): add optional servicePages/nav/theme to R1LandingPayload"
```

---

## Task 4: Add a Services dropdown to the Navbar (additive)

Extend the existing `Navbar` in-place with an optional `servicePages` prop + `homeHref`. CSS-only dropdown (no JS). Default-empty → current callers unchanged. The pure link-builder is unit-tested; the markup is verified manually.

**Files:**
- Modify: `packages/crm/src/components/landing-r1/chrome/navbar.tsx`
- Test: `packages/crm/tests/unit/landing/navbar-service-links.spec.ts`

- [ ] **Step 1: Write the failing test for the pure link-builder**

Create `packages/crm/tests/unit/landing/navbar-service-links.spec.ts`:

```ts
// Unit test for the Navbar's pure service-link builder. The visual dropdown is
// verified manually (per the repo idiom); only the href math is tested here.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildServiceNavLinks } from "../../../src/components/landing-r1/chrome/navbar";

describe("buildServiceNavLinks", () => {
  test("builds /<homeHref>/services/<slug> for each page", () => {
    const links = buildServiceNavLinks("/w/greenwood", [
      { slug: "kitchen-remodeling", name: "Kitchen Remodeling" },
      { slug: "bath-remodeling", name: "Bath Remodeling" },
    ]);
    assert.deepEqual(links, [
      { label: "Kitchen Remodeling", href: "/w/greenwood/services/kitchen-remodeling" },
      { label: "Bath Remodeling", href: "/w/greenwood/services/bath-remodeling" },
    ]);
  });

  test("normalizes a trailing slash on homeHref", () => {
    const links = buildServiceNavLinks("/w/greenwood/", [
      { slug: "decks", name: "Decks" },
    ]);
    assert.equal(links[0].href, "/w/greenwood/services/decks");
  });

  test("treats '/' homeHref as root", () => {
    const links = buildServiceNavLinks("/", [{ slug: "decks", name: "Decks" }]);
    assert.equal(links[0].href, "/services/decks");
  });

  test("skips entries with a blank slug or name", () => {
    const links = buildServiceNavLinks("/w/x", [
      { slug: "", name: "Blank" },
      { slug: "ok", name: "" },
      { slug: "good", name: "Good" },
    ]);
    assert.deepEqual(links, [{ label: "Good", href: "/w/x/services/good" }]);
  });

  test("returns [] for an empty / missing list", () => {
    assert.deepEqual(buildServiceNavLinks("/w/x", []), []);
    // @ts-expect-error — defensive against jsonb junk.
    assert.deepEqual(buildServiceNavLinks("/w/x", undefined), []);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && npx tsx --test tests/unit/landing/navbar-service-links.spec.ts`
Expected: FAIL — `buildServiceNavLinks` is not exported from `navbar.tsx`.

- [ ] **Step 3: Implement the link-builder + dropdown in `navbar.tsx`**

In `packages/crm/src/components/landing-r1/chrome/navbar.tsx`:

(a) Add the pure builder **above** the component (after the `DEFAULT_SECTIONS` const, ~line 33):

```ts
/** A service entry the navbar dropdown links to. */
export type NavServiceLink = { slug: string; name: string };

/**
 * Pure: build the Services-dropdown links for a workspace. Each becomes
 * `${homeHref}/services/${slug}` with homeHref's trailing slash normalized.
 * Skips entries with a blank slug or name. Exported for unit testing.
 */
export function buildServiceNavLinks(
  homeHref: string,
  pages: NavServiceLink[] | undefined,
): { label: string; href: string }[] {
  if (!Array.isArray(pages)) return [];
  const base = homeHref === "/" ? "" : homeHref.replace(/\/+$/, "");
  return pages
    .filter((p) => typeof p?.slug === "string" && p.slug.trim() && typeof p?.name === "string" && p.name.trim())
    .map((p) => ({ label: p.name, href: `${base}/services/${p.slug}` }));
}
```

(b) Extend `NavbarProps` (the existing type, ~lines 35–44) — add two optional fields:

```ts
export type NavbarProps = {
  archetype: AestheticArchetypeId;
  businessName: string;
  /** Verbatim phone string — e.g. "(760) 893-9152". The tel: href is derived. */
  phone: string;
  /** City · City · City tagline shown under the wordmark on desktop. */
  serviceAreas?: string[];
  /** Anchor links — defaults to Services / Reviews / FAQ / Contact. */
  sections?: { label: string; href: string }[];
  /** Multi-page: when non-empty, render a Services dropdown linking to each
   *  service detail page. Empty/omitted → no dropdown (current behavior). */
  servicePages?: NavServiceLink[];
  /** Base href for the workspace home + service links. Default "/". On /w it
   *  is "/w/<slug>"; on the subdomain it stays "/". */
  homeHref?: string;
};
```

(c) Update the component signature + body. Replace the destructure (~line 46) and the `<nav className="sf-navbar-links">` block (~lines 80–87):

Replace:
```ts
export function Navbar({
  archetype,
  businessName,
  phone,
  serviceAreas,
  sections = DEFAULT_SECTIONS,
}: NavbarProps) {
  if (ARCHETYPES_WITHOUT_NAVBAR.includes(archetype)) return null;

  const arch = ARCHETYPES[archetype];
```
with:
```ts
export function Navbar({
  archetype,
  businessName,
  phone,
  serviceAreas,
  sections = DEFAULT_SECTIONS,
  servicePages,
  homeHref = "/",
}: NavbarProps) {
  if (ARCHETYPES_WITHOUT_NAVBAR.includes(archetype)) return null;

  const arch = ARCHETYPES[archetype];
  const serviceLinks = buildServiceNavLinks(homeHref, servicePages);
```

Replace the wordmark `href="/"` (~line 70) with `href={homeHref}` so the logo returns to the workspace home (not the app root) on the `/w` path.

Replace the center nav block:
```ts
        {/* Center: section anchors — hidden on mobile */}
        <nav className="sf-navbar-links" aria-label="Page sections">
          {sections.map((s) => (
            <a key={s.href} className="sf-navbar-link" href={s.href}>
              {s.label}
            </a>
          ))}
        </nav>
```
with:
```ts
        {/* Center: Services dropdown (when multi-page) + section anchors —
            hidden on mobile. */}
        <nav className="sf-navbar-links" aria-label="Page sections">
          {serviceLinks.length > 0 && (
            <div className="sf-navbar-dropdown">
              <button type="button" className="sf-navbar-link sf-navbar-dropdown-trigger" aria-haspopup="true">
                Services
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <div className="sf-navbar-menu" role="menu">
                {serviceLinks.map((l) => (
                  <a key={l.href} className="sf-navbar-menu-item" href={l.href} role="menuitem">
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
          )}
          {sections.map((s) => (
            <a key={s.href} className="sf-navbar-link" href={s.href}>
              {s.label}
            </a>
          ))}
        </nav>
```

(d) Add the dropdown CSS inside the existing `<style jsx global>` block, immediately after the `.sf-navbar-link:hover { ... }` rule (~line 208). The menu is positioned `absolute` and width-bounded so it never causes horizontal scroll:

```css
        /* ── Services dropdown (CSS-only; opens on hover + keyboard focus) ── */
        .sf-navbar-dropdown {
          position: relative;
          display: inline-flex;
        }
        .sf-navbar-dropdown-trigger {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: none;
          border: none;
          cursor: pointer;
          font: inherit;
        }
        .sf-navbar-dropdown-trigger svg { transition: transform 140ms ease; }
        .sf-navbar-dropdown:hover .sf-navbar-dropdown-trigger svg,
        .sf-navbar-dropdown:focus-within .sf-navbar-dropdown-trigger svg {
          transform: rotate(180deg);
        }
        .sf-navbar-menu {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          min-width: 220px;
          max-width: min(320px, calc(100vw - 32px));
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 10px 30px color-mix(in oklab, var(--text) 14%, transparent);
          padding: 6px;
          display: grid;
          gap: 2px;
          opacity: 0;
          visibility: hidden;
          transform: translateY(-4px);
          transition: opacity 140ms ease, transform 140ms ease, visibility 140ms;
          z-index: 60;
        }
        .sf-navbar-dropdown:hover .sf-navbar-menu,
        .sf-navbar-dropdown:focus-within .sf-navbar-menu {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
        }
        .sf-navbar-menu-item {
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 13.5px;
          font-weight: 500;
          color: color-mix(in oklab, var(--text) 80%, transparent);
          text-decoration: none;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sf-navbar-menu-item:hover {
          background: color-mix(in oklab, var(--text) 6%, transparent);
          color: var(--text);
        }
        @media (prefers-reduced-motion: reduce) {
          .sf-navbar-menu,
          .sf-navbar-dropdown-trigger svg { transition: none; }
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crm && npx tsx --test tests/unit/landing/navbar-service-links.spec.ts`
Expected: PASS — all 5 `buildServiceNavLinks` tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/components/landing-r1/chrome/navbar.tsx packages/crm/tests/unit/landing/navbar-service-links.spec.ts
git commit -m "feat(landing): Navbar Services dropdown + homeHref (additive)"
```

---

## Task 5: Create the shared `SiteShell` + the per-service page template

The shell themes + clips the root; the template renders one service. Both are `"use client"` styled-jsx components. A pure theme-override helper is unit-tested; the markup is manual.

**Files:**
- Create: `packages/crm/src/components/landing-r1/shell/site-shell.tsx`
- Create: `packages/crm/src/components/landing-r1/sections/service-page.tsx`
- Test: `packages/crm/tests/unit/landing/site-shell-theme.spec.ts`

- [ ] **Step 1: Write the failing test for the pure theme-override helper**

Create `packages/crm/tests/unit/landing/site-shell-theme.spec.ts`:

```ts
// Unit test for SiteShell's pure CSS-var resolver. The wrapper markup is
// verified manually; only the light/dark token math is tested here.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveShellStyle } from "../../../src/components/landing-r1/shell/site-shell";

describe("resolveShellStyle", () => {
  test("light mode (default) returns the archetype palette unchanged + clip", () => {
    const style = resolveShellStyle("editorial-warm", "light") as Record<string, string>;
    // archetypeStyle base var present, no dark override.
    assert.equal(style["--bg"], "#f8f4ec"); // editorial-warm background
    assert.equal(style["overflowX"], "clip");
    assert.equal(style["minHeight"], "100dvh");
  });

  test("light mode is the default when mode is omitted", () => {
    const a = resolveShellStyle("editorial-warm") as Record<string, string>;
    const b = resolveShellStyle("editorial-warm", "light") as Record<string, string>;
    assert.equal(a["--bg"], b["--bg"]);
  });

  test("dark mode overrides bg/text to a near-black palette", () => {
    const style = resolveShellStyle("editorial-warm", "dark") as Record<string, string>;
    assert.notEqual(style["--bg"], "#f8f4ec");
    // near-black background, light text.
    assert.equal(style["--bg"], "#0d0d0f");
    assert.equal(style["--text"], "#f4f4f5");
    // accent (--primary) stays the archetype's so brand color survives.
    assert.equal(style["--primary"], "#9c2b1d");
    assert.equal(style["overflowX"], "clip");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && npx tsx --test tests/unit/landing/site-shell-theme.spec.ts`
Expected: FAIL — module `site-shell` not found / `resolveShellStyle` not exported.

- [ ] **Step 3: Implement `SiteShell`**

Create `packages/crm/src/components/landing-r1/shell/site-shell.tsx`:

```tsx
// landing-r1/shell/site-shell.tsx
//
// Shared layout shell for every public R1 page (home + service detail). Applies
// the archetype CSS-var palette via archetypeStyle(), an optional dark-mode
// override, and an overflow-x: clip root so NOTHING can introduce horizontal
// scroll on mobile (the spec's no-horizontal-scroll guard). Renders its
// children; the page composes <Navbar> + content + <Footer> inside it.
//
// "use client" because archetypeStyle() returns inline CSSProperties and we
// keep parity with the other landing-r1 components (all client). No JS state.

"use client";

import type { CSSProperties, ReactNode } from "react";
import { archetypeStyle, type AestheticArchetypeId } from "../archetypes";

export type ShellMode = "light" | "dark";

/**
 * Dark-mode token overrides. We keep the archetype's --primary (brand accent)
 * and --secondary, but flip surfaces/text to a near-black, high-contrast set.
 * Phase 1 only consumes this when theme.mode === "dark"; the dedicated dark
 * ARCHETYPE + operator toggle are P2.
 */
const DARK_OVERRIDES: Record<string, string> = {
  "--bg": "#0d0d0f",
  "--text": "#f4f4f5",
  "--border": "#26262b",
  "--surface": "color-mix(in oklab, #0d0d0f 86%, #f4f4f5 14%)",
  "--surface-deep": "color-mix(in oklab, #0d0d0f 78%, #f4f4f5 22%)",
};

/**
 * Pure: resolve the inline style for the shell root. Starts from the archetype
 * palette, applies dark overrides when mode === "dark", and always adds the
 * no-horizontal-scroll guard + full-height. Exported for unit testing.
 */
export function resolveShellStyle(
  archetype: AestheticArchetypeId,
  mode: ShellMode = "light",
): CSSProperties {
  const base = archetypeStyle(archetype) as Record<string, string>;
  const merged: Record<string, string> =
    mode === "dark" ? { ...base, ...DARK_OVERRIDES } : { ...base };
  merged["overflowX"] = "clip";
  merged["minHeight"] = "100dvh";
  return merged as CSSProperties;
}

export type SiteShellProps = {
  archetype: AestheticArchetypeId;
  mode?: ShellMode;
  children: ReactNode;
};

export function SiteShell({ archetype, mode = "light", children }: SiteShellProps) {
  return (
    <div data-archetype={archetype} data-mode={mode} style={resolveShellStyle(archetype, mode)}>
      {children}
      {/* Belt-and-suspenders: also clip at the html/body level so a child that
          escapes the flow can't add a scrollbar. Scoped global is fine here —
          the shell renders once per page. */}
      <style jsx global>{`
        html, body { overflow-x: clip; }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 4: Run the theme test to verify it passes**

Run: `cd packages/crm && npx tsx --test tests/unit/landing/site-shell-theme.spec.ts`
Expected: PASS — all 4 `resolveShellStyle` tests pass.

- [ ] **Step 5: Implement the per-service template (`service-page.tsx`)**

Create `packages/crm/src/components/landing-r1/sections/service-page.tsx`:

```tsx
// landing-r1/sections/service-page.tsx
//
// The single per-service detail template, populated from one ServicePage.
// Archetype-themed via CSS vars only (no hard-coded hex). Layout:
//   hero (name + heroPhoto? + CTA placeholder where P2's intake form mounts)
//   → description (body[] blocks)
//   → testimonials (reuses the existing <Testimonials> component)
//   → CTA band
//   → map placeholder (P2 mounts the real Google Maps embed)
//
// The two P2 mount points are <div data-slot="intake"> and <div data-slot="map">
// — Phase 2 replaces their inner content; Phase 1 ships labeled placeholders so
// the page is complete and walkable now.

"use client";

import { Phone } from "lucide-react";
import { ARCHETYPES, archetypeStyle, type AestheticArchetypeId } from "../archetypes";
import { telHref } from "../_shared/phone";
import { Testimonials } from "./testimonials";
import type { ServicePage } from "@/lib/landing/r1-site-tree";

export type ServicePageTemplateProps = {
  archetype: AestheticArchetypeId;
  service: ServicePage;
  /** Verbatim phone for the CTA tel: link. */
  phone: string;
  /** Where the CTA buttons point (workspace-scoped, e.g. the booking URL). */
  ctaHref: string;
};

export function ServicePageTemplate({
  archetype,
  service,
  phone,
  ctaHref,
}: ServicePageTemplateProps) {
  const arch = ARCHETYPES[archetype];
  const hasTestimonials = Array.isArray(service.testimonials) && service.testimonials.length > 0;

  return (
    <main
      data-archetype={arch.id}
      style={archetypeStyle(arch.id)}
      className="sf-service"
    >
      {/* ── Hero ── */}
      <section className="sf-service-hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Service</span>
            <h1>{service.name}</h1>
            {service.summary && <p className="summary">{service.summary}</p>}
            <div className="hero-cta">
              <a className="btn btn-primary" href={ctaHref}>
                {service.ctaLabel}
              </a>
              <a className="btn btn-ghost" href={telHref(phone)}>
                <Phone size={18} strokeWidth={2.4} aria-hidden />
                {phone}
              </a>
            </div>
            {/* P2 mount point: the intake form renders here on the service hero. */}
            <div data-slot="intake" className="slot slot-intake" aria-label="Lead form mounts here in Phase 2" />
          </div>
          <div className="hero-media">
            {service.heroPhoto ? (
              <img src={service.heroPhoto.src} alt={service.heroPhoto.alt} loading="eager" />
            ) : (
              <div className="hero-media-ph" aria-hidden />
            )}
          </div>
        </div>
      </section>

      {/* ── Description (body blocks) ── */}
      {Array.isArray(service.body) && service.body.length > 0 && (
        <section className="sf-service-body">
          <div className="container body-col">
            {service.body.map((block, i) =>
              block.kind === "heading" ? (
                <h2 key={i}>{block.text}</h2>
              ) : (
                <p key={i}>{block.text}</p>
              ),
            )}
          </div>
        </section>
      )}

      {/* ── Testimonials (reuse existing component) ── */}
      {hasTestimonials && (
        <Testimonials
          archetype={archetype}
          heading={`What clients say about our ${service.name.toLowerCase()}`}
          testimonials={service.testimonials!}
        />
      )}

      {/* ── CTA band ── */}
      <section className="sf-service-cta">
        <div className="container cta-band">
          <div className="cta-text">
            <b>Ready to get started?</b>
            <span>Tell us about your project and we'll be in touch fast.</span>
          </div>
          <a className="btn btn-primary btn-xl" href={ctaHref}>
            {service.ctaLabel}
          </a>
        </div>
      </section>

      {/* P2 mount point: the Google Maps embed renders here. */}
      <section className="sf-service-map">
        <div className="container">
          <div data-slot="map" className="slot slot-map" aria-label="Map mounts here in Phase 2" />
        </div>
      </section>

      <ServicePageStyles />
    </main>
  );
}

function ServicePageStyles() {
  return (
    // global: styled-jsx scope is per-function (see faq.tsx rationale), so a
    // dedicated *Styles helper must use global mode.
    <style jsx global>{`
      .sf-service {
        background: var(--bg);
        color: var(--text);
        font-family: var(--font-body);
      }
      .container {
        max-width: 1200px; margin: 0 auto;
        padding-left: 20px; padding-right: 20px;
      }
      @media (min-width: 768px) { .container { padding-left: 32px; padding-right: 32px; } }
      @media (min-width: 1024px) { .container { padding-left: 48px; padding-right: 48px; } }

      /* Hero */
      .sf-service-hero { padding: 48px 0; }
      @media (min-width: 768px) { .sf-service-hero { padding: 72px 0; } }
      .hero-grid { display: grid; grid-template-columns: 1fr; gap: 32px; align-items: center; }
      @media (min-width: 900px) { .hero-grid { grid-template-columns: 1.1fr 1fr; gap: 48px; } }
      .eyebrow {
        font-size: 11.5px; font-weight: 600; letter-spacing: 0.14em;
        text-transform: uppercase; color: var(--primary);
      }
      .hero-copy h1 {
        margin: 12px 0 0;
        font-family: var(--font-headline); font-weight: 800;
        font-size: clamp(34px, 5vw, 56px); letter-spacing: -0.022em;
        line-height: 1.02; text-wrap: balance;
      }
      .hero-copy .summary {
        margin: 16px 0 0; font-size: 17px; line-height: 1.55;
        color: color-mix(in oklab, var(--text) 72%, transparent); max-width: 520px;
      }
      .hero-cta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }

      .btn {
        display: inline-flex; align-items: center; gap: 8px;
        height: 46px; padding: 0 20px; border-radius: 8px;
        font-weight: 600; font-size: 15px; text-decoration: none;
        transition: background 140ms ease, box-shadow 160ms ease, transform 120ms ease;
      }
      .btn-xl { height: 52px; padding: 0 26px; font-size: 16px; }
      .btn-primary { background: var(--primary); color: var(--primary-ink, #fff); }
      .btn-primary:hover { background: color-mix(in oklab, var(--primary) 84%, #000); }
      .btn-primary:active { transform: translateY(1px); }
      .btn-ghost {
        background: transparent; color: var(--text);
        border: 1px solid var(--border);
      }
      .btn-ghost:hover { border-color: var(--primary); color: var(--primary); }

      .slot-intake {
        margin-top: 28px; min-height: 64px;
        border: 1px dashed color-mix(in oklab, var(--text) 24%, transparent);
        border-radius: 10px;
      }

      .hero-media img,
      .hero-media-ph {
        width: 100%; aspect-ratio: 4 / 3; object-fit: cover;
        border-radius: 14px; border: 1px solid var(--border); display: block;
      }
      .hero-media-ph {
        background: repeating-linear-gradient(
          135deg, var(--surface-deep) 0 12px,
          color-mix(in oklab, var(--surface-deep) 60%, var(--bg)) 12px 24px
        );
      }

      /* Body */
      .sf-service-body { padding: 8px 0 48px; }
      @media (min-width: 768px) { .sf-service-body { padding: 8px 0 72px; } }
      .body-col { max-width: 760px; }
      .body-col h2 {
        margin: 32px 0 12px; font-family: var(--font-headline);
        font-weight: 800; font-size: clamp(24px, 3vw, 32px);
        letter-spacing: -0.015em; line-height: 1.1;
      }
      .body-col h2:first-child { margin-top: 0; }
      .body-col p {
        margin: 0 0 16px; font-size: 16.5px; line-height: 1.65;
        color: color-mix(in oklab, var(--text) 82%, transparent);
      }

      /* CTA band */
      .sf-service-cta { padding: 0 0 48px; }
      @media (min-width: 768px) { .sf-service-cta { padding: 0 0 72px; } }
      .cta-band {
        background: var(--secondary); color: #fff;
        border-radius: 16px; padding: 28px;
        display: flex; flex-direction: column; gap: 18px; align-items: flex-start;
      }
      @media (min-width: 768px) {
        .cta-band { flex-direction: row; align-items: center; justify-content: space-between; }
      }
      .cta-text b {
        display: block; font-family: var(--font-headline); font-weight: 800;
        font-size: 22px; margin-bottom: 4px; letter-spacing: -0.015em;
      }
      .cta-text span { color: rgba(255,255,255,0.82); font-size: 15px; }

      /* Map */
      .sf-service-map { padding: 0 0 64px; }
      .slot-map {
        width: 100%; aspect-ratio: 16 / 7; min-height: 220px;
        border-radius: 14px; border: 1px dashed color-mix(in oklab, var(--text) 24%, transparent);
        background: var(--surface);
      }

      @media (prefers-reduced-motion: reduce) {
        .btn { transition: none; }
        .btn-primary:active { transform: none; }
      }
    `}</style>
  );
}
```

- [ ] **Step 6: Verify both new components type-check**

Run: `cd packages/crm && npx tsc --noEmit 2>&1 | grep -E "site-shell|service-page" || echo "no errors in new components"`
Expected: `no errors in new components`.

- [ ] **Step 7: Commit**

```bash
git add packages/crm/src/components/landing-r1/shell/site-shell.tsx packages/crm/src/components/landing-r1/sections/service-page.tsx packages/crm/tests/unit/landing/site-shell-theme.spec.ts
git commit -m "feat(landing): SiteShell (themed + overflow-x clip) + per-service template"
```

---

## Task 6: Link the home services grid out to per-service routes

The `ServiceCard` "Learn more" link goes from `#service-<slug>` to the real route when a `serviceBaseHref` is provided. Additive — direct callers without it keep today's anchor.

**Files:**
- Modify: `packages/crm/src/components/landing-r1/sections/services-grid.tsx`
- Test: `packages/crm/tests/unit/landing/services-grid-href.spec.ts`

- [ ] **Step 1: Write the failing test for the pure card-href builder**

Create `packages/crm/tests/unit/landing/services-grid-href.spec.ts`:

```ts
// Unit test for the services-grid card href builder. Markup is manual; only the
// link target logic (route vs. legacy anchor) is tested.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { serviceCardHref } from "../../../src/components/landing-r1/sections/services-grid";

describe("serviceCardHref", () => {
  test("links to the service route when a base href is provided", () => {
    assert.equal(
      serviceCardHref("Kitchen Remodeling", "/w/greenwood"),
      "/w/greenwood/services/kitchen-remodeling",
    );
  });

  test("normalizes a trailing slash on the base href", () => {
    assert.equal(
      serviceCardHref("Decks", "/w/greenwood/"),
      "/w/greenwood/services/decks",
    );
  });

  test("treats '/' base as root", () => {
    assert.equal(serviceCardHref("Decks", "/"), "/services/decks");
  });

  test("falls back to the legacy in-page anchor when no base href", () => {
    assert.equal(serviceCardHref("Kitchen Remodeling", undefined), "#service-kitchen-remodeling");
    assert.equal(serviceCardHref("Kitchen Remodeling", ""), "#service-kitchen-remodeling");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && npx tsx --test tests/unit/landing/services-grid-href.spec.ts`
Expected: FAIL — `serviceCardHref` is not exported from `services-grid.tsx`.

- [ ] **Step 3: Implement `serviceCardHref` + thread the prop**

In `packages/crm/src/components/landing-r1/sections/services-grid.tsx`:

(a) Add the import of `serviceSlug` (after the `import { telHref } ...` line, ~line 16):

```ts
import { serviceSlug } from "@/lib/landing/r1-site-tree";
```

(b) Add the pure builder near the bottom helpers (replace the existing local `slugify` function, ~lines 157–159, since the link path now uses `serviceSlug`; keep no other `slugify` callers — confirm via search before deleting). Insert:

```ts
/**
 * Pure: the "Learn more" target for a service card. With a workspace base href
 * (e.g. "/w/<slug>") it links to the service detail route; without one it keeps
 * the legacy in-page anchor so existing direct callers are unchanged. Exported
 * for unit testing.
 */
export function serviceCardHref(name: string, baseHref: string | undefined): string {
  const slug = serviceSlug(name);
  if (baseHref && baseHref.trim()) {
    const base = baseHref === "/" ? "" : baseHref.replace(/\/+$/, "");
    return `${base}/services/${slug}`;
  }
  return `#service-${slug}`;
}
```

(c) Add `serviceBaseHref` to `ServicesGridProps` (after the `services: Service[];` field, ~line 41):

```ts
  /** Multi-page: when set (e.g. "/w/<slug>"), each card's "Learn more" links to
   *  the per-service detail route. Omitted → legacy in-page #anchor. */
  serviceBaseHref?: string;
```

(d) Thread it through the component + card. Update the destructure (~line 51):

```ts
  const { archetype, eyebrow = "What we fix", heading, intro, services, cta, serviceBaseHref } = props;
```

Update the `.map` that renders cards (~lines 81–88) to pass the base href:

```ts
          {services.map((s, i) => (
            <StaggerItem
              key={s.id ?? s.name}
              className={layout === "dense" ? cardClassForIndex(i, services.length) : undefined}
            >
              <ServiceCard service={s} baseHref={serviceBaseHref} />
            </StaggerItem>
          ))}
```

Update `ServiceCard` (~lines 116–145) to accept + use `baseHref`:

```ts
function ServiceCard({ service, baseHref }: { service: Service; baseHref?: string }) {
  return (
    <article className="card">
      <div className="placeholder">
        {service.photo ? (
          <img
            className="ph-img"
            src={service.photo.src}
            alt={service.photo.alt}
            loading="lazy"
          />
        ) : null}
        <span className="icon-tile" aria-hidden>
          {service.icon ?? <DefaultGlyph />}
        </span>
        {!service.photo && (
          <span className="ph-label">photo · {service.name.toLowerCase()}</span>
        )}
      </div>
      <div className="body">
        <h3>{service.name}</h3>
        <p>{service.description}</p>
        <a className="more" href={serviceCardHref(service.name, baseHref)}>
          Learn more
          <ArrowRight size={14} strokeWidth={2.4} aria-hidden />
        </a>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crm && npx tsx --test tests/unit/landing/services-grid-href.spec.ts`
Expected: PASS — all 4 `serviceCardHref` tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/components/landing-r1/sections/services-grid.tsx packages/crm/tests/unit/landing/services-grid-href.spec.ts
git commit -m "feat(landing): services grid cards link to per-service routes"
```

---

## Task 7: Add the `/w/[slug]/services/[service]` route + wrap the home page in the shell

The new service route, and the minimal home-page refactor to share `SiteShell` + wire the navbar dropdown + grid links.

**Files:**
- Create: `packages/crm/src/app/(public)/w/[slug]/services/[service]/page.tsx`
- Modify: `packages/crm/src/app/(public)/w/[slug]/page.tsx`

- [ ] **Step 1: Create the service route (server component)**

Create `packages/crm/src/app/(public)/w/[slug]/services/[service]/page.tsx`:

```tsx
// packages/crm/src/app/(public)/w/[slug]/services/[service]/page.tsx
//
// Public per-service detail page at /w/[slug]/services/[service].
// Server component. Loads the workspace's r1 payload, finds the ServicePage by
// slug, notFound()s on miss, and renders the shared shell + navbar + per-service
// template + footer + chatbot embed. Indexable (no noindex).

import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { SiteShell } from "@/components/landing-r1/shell/site-shell";
import { Navbar } from "@/components/landing-r1/chrome/navbar";
import { Footer } from "@/components/landing-r1/sections/footer";
import { ServicePageTemplate } from "@/components/landing-r1/sections/service-page";
import { ChatbotEmbedScript } from "@/components/landing/chatbot-script";

import { loadLandingPayload } from "@/lib/landing/r1-save";
import { getWorkspaceTemplateContext } from "@/lib/landing/public-workspace";
import { rewriteR1Hrefs } from "@/lib/landing/r1-rewrite-hrefs";
import { findServicePage, getServicePages } from "@/lib/landing/r1-site-tree";
import { buildWorkspaceUrls } from "@/lib/billing/anonymous-workspace";
import { getPublicChatbotEmbed } from "@/lib/agents/public-embed";

type PageProps = {
  params: Promise<{ slug: string; service: string }>;
};

// On-demand: services are generated per workspace; do not prebuild any.
export function generateStaticParams(): { slug: string; service: string }[] {
  return [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, service } = await params;
  const data = await loadLandingPayload(slug);
  const page = data ? findServicePage(data.payload, service) : null;
  if (!data || !page) {
    return { title: "Page not found" };
  }
  const businessName = data.payload.footer.businessName;
  const title = `${page.name} — ${businessName}`;
  return {
    title,
    description: page.summary,
    openGraph: {
      title,
      description: page.summary,
      ...(page.heroPhoto ? { images: [{ url: page.heroPhoto.src }] } : {}),
      type: "website",
    },
    robots: { index: true, follow: true },
    alternates: { canonical: `/w/${slug}/services/${service}` },
  };
}

export default async function WorkspaceServicePage({ params }: PageProps) {
  const { slug, service } = await params;

  const ctx = await getWorkspaceTemplateContext(slug);
  if (!ctx) {
    notFound();
  }

  const data = await loadLandingPayload(slug);
  if (!data) {
    notFound();
  }

  const page = findServicePage(data.payload, service);
  if (!page) {
    notFound();
  }

  // Rewrite generic CTA hrefs ("/book", "/intake") to workspace-scoped URLs.
  const workspaceUrls = buildWorkspaceUrls(
    slug,
    process.env.WORKSPACE_BASE_DOMAIN ?? "app.seldonframe.com",
    ctx.orgId,
  );
  const payload = rewriteR1Hrefs(data.payload, {
    book: workspaceUrls.book,
    intake: workspaceUrls.intake,
    home: workspaceUrls.home,
  });

  const chatbotEmbed = await getPublicChatbotEmbed(ctx.orgId);
  const homeHref = `/w/${slug}`;
  const navServices = getServicePages(payload).map((p) => ({ slug: p.slug, name: p.name }));

  return (
    <SiteShell archetype={payload.hero.archetype} mode={payload.theme?.mode ?? "light"}>
      <Navbar
        archetype={payload.hero.archetype}
        businessName={payload.hero.businessName}
        phone={payload.footer.phone}
        serviceAreas={payload.footer.serviceAreas}
        servicePages={navServices}
        homeHref={homeHref}
      />
      <ServicePageTemplate
        archetype={payload.hero.archetype}
        service={page}
        phone={payload.footer.phone}
        ctaHref={workspaceUrls.book}
      />
      <Footer {...payload.footer} />
      {chatbotEmbed && <ChatbotEmbedScript embedUrl={chatbotEmbed.embedUrl} />}
    </SiteShell>
  );
}
```

- [ ] **Step 2: Refactor the home page to share `SiteShell` + wire the navbar/grid**

In `packages/crm/src/app/(public)/w/[slug]/page.tsx`:

(a) Add imports (in the existing import block, after the `Navbar` import line, ~line 25):

```ts
import { SiteShell } from "@/components/landing-r1/shell/site-shell";
import { getServicePages } from "@/lib/landing/r1-site-tree";
```

(b) Replace the final `return ( <> ... </> )` of `WorkspaceLandingPage` (the landing-r1 branch, currently ~lines 210–236) with a `SiteShell`-wrapped version that wires `servicePages`/`homeHref`/`serviceBaseHref`:

Replace:
```tsx
  return (
    <>
      {/* bisect 4/4: all three pieces wired. */}
      <Navbar
        archetype={payload.hero.archetype}
        businessName={payload.hero.businessName}
        phone={payload.footer.phone}
        serviceAreas={payload.footer.serviceAreas}
      />
      {payload.emergency && <EmergencyStrip {...payload.emergency} />}
      <Hero {...payload.hero} />
      <ServicesGrid {...payload.services} />
      <Testimonials {...payload.testimonials} />
      <Faq {...payload.faq} />
      {payload.leadForm?.enabled && (
        <LeadFormSection
          orgSlug={slug}
          businessName={payload.hero.businessName}
          archetype={payload.hero.archetype}
          leadForm={payload.leadForm}
        />
      )}
      <Footer {...payload.footer} />
      {payload.sticky && <StickyMobileBar {...payload.sticky} />}
      {chatbotEmbed && <ChatbotEmbedScript embedUrl={chatbotEmbed.embedUrl} />}
    </>
  );
```
with:
```tsx
  const homeHref = `/w/${slug}`;
  const navServices = getServicePages(payload).map((p) => ({ slug: p.slug, name: p.name }));
  // Only link cards out to detail pages when this workspace actually has them.
  const serviceBaseHref = navServices.length > 0 ? homeHref : undefined;

  return (
    <SiteShell archetype={payload.hero.archetype} mode={payload.theme?.mode ?? "light"}>
      <Navbar
        archetype={payload.hero.archetype}
        businessName={payload.hero.businessName}
        phone={payload.footer.phone}
        serviceAreas={payload.footer.serviceAreas}
        servicePages={navServices}
        homeHref={homeHref}
      />
      {payload.emergency && <EmergencyStrip {...payload.emergency} />}
      <Hero {...payload.hero} />
      <ServicesGrid {...payload.services} serviceBaseHref={serviceBaseHref} />
      <Testimonials {...payload.testimonials} />
      <Faq {...payload.faq} />
      {payload.leadForm?.enabled && (
        <LeadFormSection
          orgSlug={slug}
          businessName={payload.hero.businessName}
          archetype={payload.hero.archetype}
          leadForm={payload.leadForm}
        />
      )}
      <Footer {...payload.footer} />
      {payload.sticky && <StickyMobileBar {...payload.sticky} />}
      {chatbotEmbed && <ChatbotEmbedScript embedUrl={chatbotEmbed.embedUrl} />}
    </SiteShell>
  );
```

- [ ] **Step 3: Verify the server boundary + types are intact**

Run: `cd packages/crm && bash scripts/check-use-server.sh src`
Expected: exits 0 (no `"use server"` boundary violations — the new route is a server component importing client components, which is allowed; `SiteShell`/`ServicePageTemplate`/`Navbar`/`Footer` carry `"use client"`).

Run: `cd packages/crm && npx tsc --noEmit 2>&1 | grep -E "w/\[slug\]|services/\[service\]|site-shell|service-page" || echo "no errors in touched route/components"`
Expected: `no errors in touched route/components`.

- [ ] **Step 4: Commit**

```bash
git add "packages/crm/src/app/(public)/w/[slug]/services/[service]/page.tsx" "packages/crm/src/app/(public)/w/[slug]/page.tsx"
git commit -m "feat(landing): /w/[slug]/services/[service] route + share SiteShell on home"
```

---

## Task 8: Extend the subdomain proxy route to render home-in-shell + dispatch `services/[x]`

`{slug}.app.../` already rewrites to `/s/{slug}/home`; `{slug}.app.../services/{x}` already rewrites to `/s/{slug}/services/{x}` via the proxy catch-all. This task makes `/s/[orgSlug]/[...slug]` (a) use the shared shell on home and (b) handle the `services/{x}` path.

**Files:**
- Modify: `packages/crm/src/app/(public)/s/[orgSlug]/[...slug]/page.tsx`

- [ ] **Step 1: Add imports + the service-page branch + shell-wrap the home branch**

In `packages/crm/src/app/(public)/s/[orgSlug]/[...slug]/page.tsx`:

(a) Add imports (after the existing `import { Navbar } ...` line, ~line 32):

```ts
import { SiteShell } from "@/components/landing-r1/shell/site-shell";
import { ServicePageTemplate } from "@/components/landing-r1/sections/service-page";
import { findServicePage, getServicePages } from "@/lib/landing/r1-site-tree";
```

(b) In `PublicSPage`, **before** the existing `if (isHomePage(pageSlug))` block (~line 109), add a service-page branch. The proxy rewrites the subdomain `/services/{x}` to `/s/{orgSlug}/services/{x}`, so `slug = ["services", "<service>"]`:

```ts
  // Multi-page: subdomain /services/<service> → /s/<orgSlug>/services/<service>.
  // Render the shared shell + per-service template when the workspace has an r1
  // payload that contains the requested service. Falls through to the old
  // PageRenderer below only if there's no r1 payload at all.
  if (slug.length === 2 && slug[0] === "services") {
    const serviceSlugParam = slug[1];
    const r1Data = await loadLandingPayload(orgSlug);
    if (r1Data) {
      const ctx0Page = findServicePage(r1Data.payload, serviceSlugParam);
      if (!ctx0Page) {
        notFound();
      }
      const workspaceUrls = buildWorkspaceUrls(
        orgSlug,
        process.env.WORKSPACE_BASE_DOMAIN ?? "app.seldonframe.com",
        r1Data.orgId,
      );
      const payload = rewriteR1Hrefs(r1Data.payload, {
        book: workspaceUrls.book,
        intake: workspaceUrls.intake,
        home: workspaceUrls.home,
      });
      const r1ChatbotEmbed = await getPublicChatbotEmbed(r1Data.orgId);
      const navServices = getServicePages(payload).map((p) => ({ slug: p.slug, name: p.name }));
      // On the subdomain the workspace IS the root, so links stay relative to "/".
      return (
        <SiteShell archetype={payload.hero.archetype} mode={payload.theme?.mode ?? "light"}>
          <Navbar
            archetype={payload.hero.archetype}
            businessName={payload.hero.businessName}
            phone={payload.footer.phone}
            serviceAreas={payload.footer.serviceAreas}
            servicePages={navServices}
            homeHref="/"
          />
          <ServicePageTemplate
            archetype={payload.hero.archetype}
            service={ctx0Page}
            phone={payload.footer.phone}
            ctaHref={workspaceUrls.book}
          />
          <Footer {...payload.footer} />
          {r1ChatbotEmbed && <ChatbotEmbedScript embedUrl={r1ChatbotEmbed.embedUrl} />}
        </SiteShell>
      );
    }
  }
```

(c) Wrap the existing R-framework **home** branch in `SiteShell` and wire the navbar/grid. Replace the home-branch `return ( <> ... </> )` (currently ~lines 125–150) with:

```tsx
      const navServices = getServicePages(payload).map((p) => ({ slug: p.slug, name: p.name }));
      const serviceBaseHref = navServices.length > 0 ? "" : undefined; // "" + "/services/x" = "/services/x"
      return (
        <SiteShell archetype={payload.hero.archetype} mode={payload.theme?.mode ?? "light"}>
          <Navbar
            archetype={payload.hero.archetype}
            businessName={payload.hero.businessName}
            phone={payload.footer.phone}
            serviceAreas={payload.footer.serviceAreas}
            servicePages={navServices}
            homeHref="/"
          />
          {payload.emergency && <EmergencyStrip {...payload.emergency} />}
          <Hero {...payload.hero} />
          <ServicesGrid {...payload.services} serviceBaseHref={serviceBaseHref} />
          <Testimonials {...payload.testimonials} />
          <Faq {...payload.faq} />
          {payload.leadForm?.enabled && (
            <LeadFormSection
              orgSlug={orgSlug}
              businessName={payload.hero.businessName}
              archetype={payload.hero.archetype}
              leadForm={payload.leadForm}
            />
          )}
          <Footer {...payload.footer} />
          {payload.sticky && <StickyMobileBar {...payload.sticky} />}
          {r1ChatbotEmbed && <ChatbotEmbedScript embedUrl={r1ChatbotEmbed.embedUrl} />}
        </SiteShell>
      );
```

Note on `serviceBaseHref = ""`: `serviceCardHref(name, "")` returns the legacy `#service-…` anchor (empty string is falsy), which is **wrong** here. Use a sentinel that yields root-relative links instead. Change that line to:

```tsx
      const serviceBaseHref = navServices.length > 0 ? "/" : undefined;
```

`serviceCardHref(name, "/")` → `/services/<slug>` (root-relative on the subdomain). Confirmed by the Task 6 test `treats '/' base as root`.

- [ ] **Step 2: Verify boundary + types**

Run: `cd packages/crm && bash scripts/check-use-server.sh src`
Expected: exits 0.

Run: `cd packages/crm && npx tsc --noEmit 2>&1 | grep -E "s/\[orgSlug\]" || echo "no errors in subdomain route"`
Expected: `no errors in subdomain route`.

- [ ] **Step 3: Commit**

```bash
git add "packages/crm/src/app/(public)/s/[orgSlug]/[...slug]/page.tsx"
git commit -m "feat(landing): subdomain renders service pages + shares SiteShell on home"
```

---

## Task 9: Full build gate + final verification

Prove the whole slice compiles, the server/client boundaries hold, Next builds, and every new unit test passes.

**Files:** none (verification only).

- [ ] **Step 1: Run every new unit test together**

Run: `cd packages/crm && npx tsx --test tests/unit/landing/r1-site-tree.spec.ts tests/unit/landing/navbar-service-links.spec.ts tests/unit/landing/site-shell-theme.spec.ts tests/unit/landing/services-grid-href.spec.ts`
Expected: PASS — `pass` count equals the sum of all tests above, `fail 0`.

- [ ] **Step 2: Run the repo-wide unit suite (no regressions)**

Run: `cd packages/crm && pnpm test:unit 2>&1 | tail -15`
Expected: the existing suite still passes (including `r1-payload-to-template.spec.ts`, which imports `R1LandingPayload` — the additive keys don't break it), plus the 4 new files. `fail 0`.

- [ ] **Step 3: Run the full build gate**

Run: `cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit && npx next build`
Expected: all three succeed. `check-use-server.sh` exits 0; `tsc --noEmit` reports no errors in any file this plan touched; `next build` completes and lists the new route `/w/[slug]/services/[service]` (and the existing `/s/[orgSlug]/[...slug]`) in its route table.

- [ ] **Step 4: Manual smoke (seed → walk the tree)**

Seed a workspace whose r1 payload includes `servicePages` (use the `multiPagePayload` fixture's structure — set `blueprint_json -> 'payload' -> 'servicePages'`, `-> 'nav'`, `-> 'theme'` on a real `landing_pages` row via `mcp__neon__run_sql`, or via the dashboard once P4 wiring lands). Then in a browser:
  1. Visit `/w/<slug>` → the home renders inside the shell; the navbar shows a **Services** dropdown listing the 3 services; each services-grid card "Learn more" links to `/w/<slug>/services/<slug>`.
  2. Click into `/w/<slug>/services/kitchen-remodeling` → the per-service template renders (hero with the service name + photo + the dashed intake placeholder, the body blocks, the testimonials, the CTA band, the dashed map placeholder), themed by the archetype.
  3. Visit `/w/<slug>/services/does-not-exist` → Next 404 (`notFound()`).
  4. On the subdomain (`<slug>.app.seldonframe.com/` and `.../services/kitchen-remodeling`) → same two pages render.
  5. On a mobile viewport (375px) across all of the above → **no horizontal scroll** (the shell's `overflow-x: clip` + the dropdown's `max-width: min(320px, calc(100vw - 32px))`); the dropdown opens on tap/focus.
  6. Visit a **legacy** workspace whose payload has **no** `servicePages` → the home renders exactly as before (no Services dropdown, cards keep the in-page `#service-…` anchor), confirming the additive contract.

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "test(landing): verify multi-page Phase 1 build gate + smoke"
```

(If Steps 1–4 pass with no changes, skip this commit.)

---

## Self-Review (completed by plan author)

**Spec coverage (Phase 1 scope items 1–6):**
1. *Payload page-tree types (optional) + validator + 2–3-service fixture* → Tasks 1, 2, 3. The spec's `services: ServicePage[]` is implemented as `servicePages?` (rename documented in Spec↔Code) because `services` is the existing grid; `nav?` and `theme?: { mode? }` added; validator + fixture in Task 2.
2. *Service route `/w/[slug]/services/[service]` + subdomain mapping* → Task 7 (route) + Task 8 (subdomain). No `proxy.ts` change needed (existing catch-all forwards it — verified in `resolveWorkspaceRewritePath`).
3. *Shared Navbar/Footer shell themed by `archetypeStyle()` + `theme.mode`, used by home + service pages; minimal refactor with exact diffs* → Task 5 (`SiteShell` + extended `Navbar`), Task 7 (home diff), Task 8 (subdomain diff). Footer reused as-is.
4. *Per-service template: hero + CTA placeholder, description, testimonials reuse, CTA, map placeholder; CSS-var only* → Task 5 (`service-page.tsx`), with `data-slot="intake"` and `data-slot="map"` P2 mount points and zero hard-coded hex.
5. *Services grid cards link to `/w/[slug]/services/[service.slug]`* → Task 6.
6. *No-horizontal-scroll guard (`overflow-x: clip` at shell root)* → Task 5 (`resolveShellStyle` + `html,body` global) and verified in Task 9 Step 4.

**Placeholder scan:** No "TBD"/"similar to Task N"/"add error handling" — every code step contains complete, real code using the actual types read from the codebase (`R1LandingPayload`, `R1HeroSection`, `R1FooterSection`, `NavbarProps`, `ServicesGridProps`, `Testimonial`, `buildWorkspaceUrls`, `rewriteR1Hrefs`, `loadLandingPayload`, `getWorkspaceTemplateContext`, `getPublicChatbotEmbed`).

**Type consistency:** `serviceSlug`/`validateSiteTree`/`getServicePages`/`findServicePage` (Task 1–2) are the exact names imported in Tasks 6–8. `buildServiceNavLinks` (Task 4), `resolveShellStyle`/`SiteShell` (Task 5), `serviceCardHref` (Task 6), `ServicePageTemplate` (Task 5) match every call site. `ServicePage`'s fields (`slug,name,heroPhoto?,summary,body[],gallery?,testimonials?,ctaLabel`) match the spec and the template's reads. The `serviceBaseHref = "/"` sentinel on the subdomain (Task 8) is reconciled against `serviceCardHref`'s `"/"`-is-root behavior (Task 6 test).

**Note for the executor:** Tasks 1, 2, and 3 all edit the same file (`r1-site-tree.ts`) and its spec; because the spec imports symbols added across Tasks 1–2 and the fixture needs Task 3's type addition, **implement the source for Tasks 1–3 before the first `npx tsx --test` run** (each task's "expected FAIL" is described for the strict TDD record). After Task 3 Step 2, the full site-tree suite goes green.

---

## Roadmap: Phases 2–4 (high-level only — each gets its own code-complete plan)

### Phase 2 — Home + components (intake-in-hero, map, dark theme, toggle, no-scroll hardening)
- **Intake-in-hero:** add `leadFormInHero` to `R1HeroSection`; render the existing `LeadFormSection` (reusing `submitLeadFormAction`) in the hero's right column on desktop (sticky) and below the hero image on mobile. Mount the same form into the service template's `data-slot="intake"`.
- **`sections/map.tsx`:** new client component rendering a lazy Google Maps `<iframe>` from an address; a pure map-embed-URL builder (unit-tested). Mount into `data-slot="map"` on home, contact, and each service page.
- **Dark archetype + light/dark toggle:** add a greenwood-style dark archetype to `lib/workspace/aesthetic-archetypes.ts` + `components/landing-r1/archetypes.ts` (emitted via `archetypeStyle()`); add the operator light/dark toggle in `/clients/new`, persist `theme.mode` on the workspace, default-from-archetype with override. (Phase 1 already threads `theme.mode` through `SiteShell`, so this becomes data + one archetype.)
- **No-scroll hardening:** audit the new map iframe + intake hero columns at 375px; confirm the `overflow-x: clip` root holds.

### Phase 3 — Extra pages (Gallery, Service Areas, Contact, Blog)
- New payload collections (`gallery`, `serviceAreas`, `blog`, `contact`) — all optional, validated by extending `validateSiteTree`.
- New routes under `/w/[slug]/{gallery,service-areas,contact,blog,blog/[post]}` + the matching subdomain `/s/[orgSlug]/[...slug]` dispatch branches, all through `SiteShell`.
- New templates: gallery grid, service-areas index, contact (form + map + hours), blog index + post. Reuse `Footer`, `map.tsx`, and the intake form.
- Per-workspace `sitemap.xml` (low effort) listing home + all service/gallery/area/blog URLs.

### Phase 4 — Generation + wiring (URL → live multi-page site)
- Extend `r1-payload-generator.ts` (+ `r1-payload-prompt.ts`) to fill the whole tree from extracted facts: expand to a comprehensive 15–20-service list with per-service copy/body/CTA, plus gallery/service-areas/blog seeds; honor guardrails (verbatim real hours/address/phone/reviews; never fabricate reviews; on-archetype voice). Likely a few scoped LLM calls (home+services, then the lighter pages) to keep prompts focused.
- Run `validateSiteTree` on generator output (structural gate); unit-test the generator's structure (service count, required fields, no-fabricated-reviews invariant) via the existing DI/test conventions.
- Wire into `create-full.ts` / `/clients/new` so a URL or pasted description produces the full multi-page site end-to-end; add the operator theme-mode choice from P2 to the creation flow.
