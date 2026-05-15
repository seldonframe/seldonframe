# Soften rigid validators in the workspace-creation pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the `workspace_output_contract degraded` false alarms + icon-allowlist retry loop on every v2 workspace creation by (a) replacing the 60-entry hand-maintained `ICON_PATHS` map with lucide-react's ~1500-icon library + Sparkles fallback, (b) making the output-contract validator v2-mode-aware, and (c) deleting the now-dead allowlist machinery.

**Architecture:** Three surgical changes per the approved spec. The shared lucide-react `resolveIconComponent` (with concept-alias shortcuts preserved + full-library fallthrough) replaces both existing icon resolvers. The validator gets a single `isV2` mode flag (`sections.length > 0 && contentHtml is null/empty`) that gates the `landing_page_exists` check (v2 looks at sections) and skips the v1-only `cta_primary_href`/`cta_secondary_href` checks (v2 CTAs are renderer-controlled).

**Tech Stack:** Next.js 16.2, TypeScript, `lucide-react ^1.7.0` (already a dep), `react-dom/server` (for v1 SSR icon rendering), `node:test` + `tsx` (existing unit-test pattern at `packages/crm/tests/unit/`, run via `pnpm test:unit`).

**Source spec:** [`docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md`](../specs/2026-05-15-soften-rigid-validators-design.md) (commit `238f4e7b` on main).

---

## File map

**Create:**
- `packages/crm/src/lib/blueprint/renderers/icon-resolver.ts` — shared lucide-react resolver with concept aliases + full-library fallthrough; exports `resolveIconComponent` + `renderIconToSvgString`
- `packages/crm/tests/unit/icon-resolver.spec.ts` — unit tests
- `packages/crm/tests/unit/services-block-validator.spec.ts` — unit tests for the softened registry.ts validator
- `packages/crm/tests/unit/output-contract-validator-v2.spec.ts` — unit tests for the v2-aware validator

**Modify:**
- `packages/crm/src/lib/page-blocks/registry.ts` — drop `ICON_NAMES` allowlist, keep distinct + required
- `packages/crm/src/lib/workspace/output-contract-validator.ts` — refactor split (`loadValidatorInputs` + `runChecks`); add `isV2` mode + v2 branches
- `packages/crm/src/components/landing/sections/services-grid.tsx` — import from new resolver path
- `packages/crm/src/components/landing/sections/benefits.tsx` — import from new resolver path
- `packages/crm/src/lib/blueprint/renderers/general-service-v1.ts` — replace `renderLucideIcon` with `renderIconToSvgString`
- `packages/crm/src/blocks/services/SKILL.md` — drop allowlist instruction

**Delete:**
- `packages/crm/src/lib/blueprint/renderers/lucide-icons.ts` — 205 lines of hand-maintained ICON_PATHS + ICON_NAMES
- `packages/crm/src/components/landing/sections/icon-resolver.ts` — superseded by the new shared resolver

---

## Phase A — New shared icon resolver

### Task 1: Create the shared `icon-resolver.ts`

**Files:**
- Create: `packages/crm/src/lib/blueprint/renderers/icon-resolver.ts`

- [ ] **Step 1: Create the file with the shared resolver**

```typescript
// packages/crm/src/lib/blueprint/renderers/icon-resolver.ts
//
// 2026-05-15 — Shared lucide-react icon resolver for the workspace render
// path. Used by both the v2 React renderer (PageRenderer sections) and the
// v1 SSR renderer (general-service-v1.ts via renderIconToSvgString).
//
// Resolution order:
//   1. Concept aliases (Claude-friendly shortcuts: "storm" → CloudRainWind)
//   2. Direct lucide-react lookup (full ~1500-icon library)
//   3. Sparkles fallback
//
// Antifragility: as Claude gets better at picking lucide names directly, the
// alias table becomes less needed but doesn't hurt. As lucide ships new icons,
// they're automatically available without any change to this file.
//
// Spec: docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md

import {
  Award,
  BadgeCheck,
  CheckCircle2,
  CircleCheckBig,
  Clock,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  DollarSign,
  Droplets,
  Hammer,
  HardHat,
  Heart,
  Home,
  HousePlug,
  Leaf,
  MapPin,
  Phone,
  Rocket,
  Scissors,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  ThumbsUp,
  Truck,
  Wind,
  Wrench,
  Zap,
  icons as lucideIcons,
  type LucideIcon,
} from "lucide-react";

const FALLBACK_ICON: LucideIcon = Sparkles;

// Concept aliases preserved from v1.39.0 (the original
// components/landing/sections/icon-resolver.ts). These are Claude-friendly
// shortcuts: when Claude picks a vocabulary term ("storm", "drain",
// "emergency") rather than the exact lucide name, the alias maps it to a
// sensible icon. Without aliases, the lucide-react fallthrough would still
// catch most direct names (`shield_check` → ShieldCheck), but the aliases
// add semantic shortcuts the LLM tends to use.
const ALIASES: Record<string, LucideIcon> = {
  // Direct lucide names (lowercased + alphanumerics-only) — kept for
  // backward-compat; the lucide-react fallthrough below catches these too,
  // but keeping them here makes the alias resolution one lookup instead of
  // two for the common case.
  award: Award,
  badgecheck: BadgeCheck,
  checkcircle: CheckCircle2,
  circlecheckbig: CircleCheckBig,
  clock: Clock,
  cloudrain: CloudRain,
  cloudrainwind: CloudRainWind,
  cloudsnow: CloudSnow,
  dollarsign: DollarSign,
  droplets: Droplets,
  hammer: Hammer,
  hardhat: HardHat,
  heart: Heart,
  home: Home,
  houseplug: HousePlug,
  leaf: Leaf,
  mappin: MapPin,
  phone: Phone,
  rocket: Rocket,
  scissors: Scissors,
  shield: Shield,
  shieldcheck: ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  stethoscope: Stethoscope,
  thumbsup: ThumbsUp,
  truck: Truck,
  wind: Wind,
  wrench: Wrench,
  zap: Zap,
  // Generic concept aliases
  storm: CloudRainWind,
  rain: CloudRain,
  snow: CloudSnow,
  inspection: ShieldCheck,
  repair: Wrench,
  install: Hammer,
  installation: Hammer,
  emergency: Zap,
  warranty: BadgeCheck,
  estimate: DollarSign,
  quote: DollarSign,
  free: DollarSign,
  service: Wrench,
  cleaning: Sparkles,
  same: Clock,
  sameday: Clock,
  fast: Zap,
  trust: ShieldCheck,
  trusted: ShieldCheck,
  insured: Shield,
  licensed: BadgeCheck,
  bonded: Shield,
  family: Heart,
  familyowned: Heart,
  local: MapPin,
  experience: Award,
  experienced: Award,
  // Roofing
  shingle: Home,
  metal: Shield,
  gutter: Droplets,
  tarp: Shield,
  hail: CloudRainWind,
  roof: Home,
  // Plumbing
  drain: Droplets,
  leak: Droplets,
  heater: Zap,
  pipe: Wrench,
  water: Droplets,
  // HVAC
  cooling: Wind,
  ac: Wind,
  heating: Zap,
  furnace: Zap,
  ductwork: Home,
  duct: Home,
  thermostat: Home,
  hvac: Wind,
  // Treatments / spa / dental
  treatment: Leaf,
  facial: Sparkles,
  massage: Heart,
  laser: Zap,
  // Auto / fleet
  vehicle: Truck,
  van: Truck,
  fleet: Truck,
};

/** Normalize for the alias table: lowercase, strip non-alphanumerics. */
function normalizeForAlias(name: string): string {
  return name.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

/** Convert snake_case / kebab-case / "Some Words" to PascalCase for the
 *  lucide-react export-name lookup. E.g. "shield_check" → "ShieldCheck",
 *  "shield-check" → "ShieldCheck", "Shield Check" → "ShieldCheck". */
function toPascalCase(name: string): string {
  return name
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join("");
}

/**
 * Resolve an icon name to a lucide-react component.
 *
 * Resolution order:
 *   1. Concept aliases (e.g. "storm" → CloudRainWind)
 *   2. Direct lucide-react lookup with PascalCase normalization
 *   3. Sparkles fallback
 *
 * Returns the Sparkles component (never null) so callers can always render
 * an icon without null checks.
 */
export function resolveIconComponent(
  name: string | null | undefined
): LucideIcon {
  if (!name || !name.trim()) return FALLBACK_ICON;
  const trimmed = name.trim();

  // 1. Aliases (concept shortcuts).
  const aliasKey = normalizeForAlias(trimmed);
  if (ALIASES[aliasKey]) return ALIASES[aliasKey];

  // 2. Direct lucide-react lookup (full library).
  const pascal = toPascalCase(trimmed);
  const direct = (lucideIcons as Record<string, LucideIcon | undefined>)[
    pascal
  ];
  if (direct) return direct;

  // 3. Sparkles fallback.
  return FALLBACK_ICON;
}

/**
 * Render an icon name to an inline SVG string for SSR contexts.
 * Used by general-service-v1.ts to emit HTML directly.
 */
export function renderIconToSvgString(
  name: string | null | undefined,
  options: { size?: number; strokeWidth?: number } = {}
): string {
  // Defer the react-dom/server import so this module can be imported in
  // contexts where SSR isn't available (e.g. test setup). The function
  // itself is only used by SSR paths.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderToString } = require("react-dom/server") as typeof import("react-dom/server");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require("react") as typeof import("react");
  const Icon = resolveIconComponent(name);
  return renderToString(
    createElement(Icon, {
      size: options.size ?? 24,
      strokeWidth: options.strokeWidth ?? 2,
    })
  );
}
```

- [ ] **Step 2: Typecheck the new file**

Run from worktree root:
```bash
cd packages/crm && npx tsc --noEmit --skipLibCheck src/lib/blueprint/renderers/icon-resolver.ts
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/blueprint/renderers/icon-resolver.ts
git commit -m "feat(renderers): shared lucide icon resolver with full-library fallthrough

Replaces the 60-entry hand-maintained ICON_PATHS allowlist with a
resolver that tries (1) concept aliases, (2) full lucide-react
library (~1500 icons), (3) Sparkles fallback. Antifragile to better
Claude (picks more accurate names) and lucide releases (new icons
auto-available).

Refs: docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md"
```

---

### Task 2: Unit tests for `icon-resolver`

**Files:**
- Create: `packages/crm/tests/unit/icon-resolver.spec.ts`

- [ ] **Step 1: Create the test file**

```typescript
// packages/crm/tests/unit/icon-resolver.spec.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ShieldCheck,
  Sparkles,
  Wind,
  Wrench,
  CloudRainWind,
  Droplets,
} from "lucide-react";

import { resolveIconComponent } from "../../src/lib/blueprint/renderers/icon-resolver";

test("snake_case lucide name → lucide component (via fallthrough)", () => {
  // shield_check is NOT in the alias table; falls through to lucide-react.
  assert.equal(resolveIconComponent("shield_check"), ShieldCheck);
});

test("kebab-case lucide name → lucide component", () => {
  assert.equal(resolveIconComponent("shield-check"), ShieldCheck);
});

test("PascalCase lucide name → lucide component (operator-typed)", () => {
  assert.equal(resolveIconComponent("ShieldCheck"), ShieldCheck);
});

test("lowercase alias → mapped lucide component", () => {
  // "wind" appears in both the alias table (direct map) and lucide-react.
  // Either path returns the same Wind component.
  assert.equal(resolveIconComponent("wind"), Wind);
});

test("concept alias → mapped lucide component", () => {
  // "storm" is NOT a lucide icon name; only resolves via the alias table.
  assert.equal(resolveIconComponent("storm"), CloudRainWind);
  assert.equal(resolveIconComponent("drain"), Droplets);
  assert.equal(resolveIconComponent("repair"), Wrench);
});

test("unknown name → Sparkles fallback", () => {
  assert.equal(resolveIconComponent("wood_oven"), Sparkles);
  assert.equal(resolveIconComponent("this-is-not-a-real-icon"), Sparkles);
  assert.equal(resolveIconComponent("xyzabc"), Sparkles);
});

test("null / undefined / empty / whitespace → Sparkles fallback", () => {
  assert.equal(resolveIconComponent(null), Sparkles);
  assert.equal(resolveIconComponent(undefined), Sparkles);
  assert.equal(resolveIconComponent(""), Sparkles);
  assert.equal(resolveIconComponent("   "), Sparkles);
});

test("whitespace-padded names get trimmed", () => {
  assert.equal(resolveIconComponent("  shield_check  "), ShieldCheck);
});

test("previously-rejected-by-allowlist names now resolve", () => {
  // These were the icons logged on 2026-05-15 as failing the old allowlist.
  // All three should now resolve via lucide-react fallthrough.
  assert.notEqual(resolveIconComponent("shield_check"), Sparkles);
  assert.notEqual(resolveIconComponent("wind"), Sparkles);
  // "building_2" — lucide has a Building2 icon
  assert.notEqual(resolveIconComponent("building_2"), Sparkles);
});
```

- [ ] **Step 2: Run the tests**

```bash
pnpm test:unit 2>&1 | grep -E "icon-resolver|pass |fail " | head -20
```
Expected: 9 tests passing for icon-resolver.spec.ts.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/tests/unit/icon-resolver.spec.ts
git commit -m "test(renderers): unit tests for shared icon resolver

Covers: alias table, lucide-react fallthrough, casing variants
(snake/kebab/Pascal), Sparkles fallback for invalid input, and the
specific icons that failed the old allowlist on 2026-05-15
(shield_check, wind, building_2).

Refs: docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md"
```

---

## Phase B — Migrate v2 React callers + delete old resolver

### Task 3: Update v2 React imports to use the new shared resolver

**Files:**
- Modify: `packages/crm/src/components/landing/sections/services-grid.tsx`
- Modify: `packages/crm/src/components/landing/sections/benefits.tsx`

- [ ] **Step 1: Update `services-grid.tsx` import**

Find the line:
```typescript
import { resolveBlockIcon } from "./icon-resolver";
```

Replace with:
```typescript
import { resolveIconComponent } from "@/lib/blueprint/renderers/icon-resolver";
```

Then find any call site `resolveBlockIcon(service.icon)` and replace with `resolveIconComponent(service.icon)`. Behavior is identical (both return a lucide component with Sparkles fallback) — the new resolver just adds lucide-react fallthrough.

- [ ] **Step 2: Update `benefits.tsx` the same way**

Find the line:
```typescript
import { resolveBlockIcon } from "./icon-resolver";
```

Replace with:
```typescript
import { resolveIconComponent } from "@/lib/blueprint/renderers/icon-resolver";
```

Replace `resolveBlockIcon(...)` calls with `resolveIconComponent(...)`.

- [ ] **Step 3: Verify no remaining callers of `resolveBlockIcon`**

```bash
grep -rln "resolveBlockIcon\|from.*sections/icon-resolver" packages/crm/src
```
Expected: only the to-be-deleted `packages/crm/src/components/landing/sections/icon-resolver.ts` itself.

- [ ] **Step 4: Typecheck**

```bash
cd packages/crm && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "TS[0-9]+:" | grep -v "next/types/validator" | head -10
```
Expected: no errors (other than pre-existing `.next/types/validator` noise).

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/components/landing/sections/services-grid.tsx \
        packages/crm/src/components/landing/sections/benefits.tsx
git commit -m "refactor(landing): migrate v2 sections to shared icon-resolver

services-grid.tsx and benefits.tsx now import resolveIconComponent
from lib/blueprint/renderers/icon-resolver instead of the
components-side resolveBlockIcon. The new resolver preserves all
concept aliases and adds lucide-react full-library fallthrough.

Refs: docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md"
```

---

### Task 4: Delete the old `components/landing/sections/icon-resolver.ts`

**Files:**
- Delete: `packages/crm/src/components/landing/sections/icon-resolver.ts`

- [ ] **Step 1: Confirm no remaining callers**

```bash
grep -rln "from.*sections/icon-resolver\|resolveBlockIcon" packages/crm/src
```
Expected: no matches.

- [ ] **Step 2: Delete the file**

```bash
rm packages/crm/src/components/landing/sections/icon-resolver.ts
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/crm && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "TS[0-9]+:" | grep -v "next/types/validator" | head -10
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A packages/crm/src/components/landing/sections/
git commit -m "chore(landing): delete superseded components-side icon-resolver

Replaced by the shared resolver at lib/blueprint/renderers/icon-resolver.ts
(Task 3). The alias table was preserved verbatim.

Refs: docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md"
```

---

## Phase C — Drop the icon allowlist from the services-block validator

### Task 5: Soften the services-block icon validator

**Files:**
- Modify: `packages/crm/src/lib/page-blocks/registry.ts`

- [ ] **Step 1: Drop the `ICON_NAMES` import (line ~33)**

Find and remove:
```typescript
import { ICON_NAMES } from "@/lib/blueprint/renderers/lucide-icons";
```

- [ ] **Step 2: Replace the allowlist validator block (lines ~211-225)**

Find this validator object (the first entry in the `validators: [...]` array around line 211):

```typescript
    (p) => {
      // v1.5.1 — enforce the lucide allowlist. Pre-1.5.1 the LLM picked
      // names like "piano", "microphone", "wood_oven" that the renderer
      // didn't have, so all those cards rendered with the same fallback
      // icon (visible in the Coastline Music + Cinder & Salt tests).
      // Now we reject and return the full allowlist so the LLM can
      // self-correct on retry.
      const allowed = new Set<string>(ICON_NAMES);
      const offenders = p.items
        .filter((i) => !allowed.has(i.icon))
        .map((i) => `${i.title}: "${i.icon}"`);
      if (offenders.length === 0) return null;
      return `icon_in_allowlist: ${offenders.length} services use unknown icons (${offenders.join("; ")}). Pick from the lucide allowlist: ${ICON_NAMES.join(", ")}`;
    },
```

Replace with:

```typescript
    (p) => {
      // 2026-05-15 — soft validation. Accept any non-empty icon name. The
      // renderer (resolveIconComponent in <PageRenderer>) maps the name to
      // a lucide-react component (~1500 icons + concept aliases), falling
      // back to Sparkles for genuinely-invalid names. No more retry loop;
      // no allowlist to maintain. See spec
      // docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md.
      const blanks = p.items
        .filter((i) => !i.icon || i.icon.trim().length === 0)
        .map((i) => i.title);
      if (blanks.length === 0) return null;
      return `icon_required: ${blanks.length} services missing icons (${blanks.join("; ")})`;
    },
```

- [ ] **Step 3: Update the `distinct_icons` error message (line ~231)**

Find:
```typescript
      return icons.length === unique.size
        ? null
        : `distinct_icons: services items reuse icons (${icons.join(", ")}); each card must pick a different icon from the allowlist`;
```

Replace with:
```typescript
      return icons.length === unique.size
        ? null
        : `distinct_icons: services items reuse icons (${icons.join(", ")}); each card must pick a different icon`;
```

(The phrase "from the allowlist" is misleading once the allowlist is gone.)

- [ ] **Step 4: Verify no lingering ICON_NAMES references**

```bash
grep -n "ICON_NAMES\|icon_in_allowlist\|from the allowlist" packages/crm/src/lib/page-blocks/registry.ts
```
Expected: no matches.

- [ ] **Step 5: Typecheck**

```bash
cd packages/crm && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "page-blocks/registry|TS[0-9]+:" | grep -v "next/types/validator" | head -10
```
Expected: no errors specifically for `page-blocks/registry.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/lib/page-blocks/registry.ts
git commit -m "refactor(page-blocks): drop icon allowlist from services validator

The validator now only enforces non-empty + distinct icon names. The
ICON_NAMES allowlist (60 entries) is replaced by the new shared
resolver's lucide-react fallthrough (~1500 icons) + Sparkles fallback
at render time. No more LLM retry loop on icon_in_allowlist failures.

Refs: docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md"
```

---

### Task 6: Unit tests for the softened services-block validator

**Files:**
- Create: `packages/crm/tests/unit/services-block-validator.spec.ts`

- [ ] **Step 1: Determine the validator's call shape**

Read [packages/crm/src/lib/page-blocks/registry.ts](packages/crm/src/lib/page-blocks/registry.ts) to confirm:
- The validator array entries are functions `(props) => string | null`
- `props.items` has shape `{ icon: string; title: string; description: string; ... }`
- The block is exported in a way tests can import (the `servicesBlock` const, or via a registry lookup like `getBlock("services")`).

The exact import path may need adjustment based on what registry.ts exports. Inspect first.

- [ ] **Step 2: Create the test file**

```typescript
// packages/crm/tests/unit/services-block-validator.spec.ts

import { test } from "node:test";
import assert from "node:assert/strict";

// Adjust this import to match registry.ts's actual export shape.
// If registry.ts exports `servicesBlock` directly:
import { servicesBlock } from "../../src/lib/page-blocks/registry";
// If it exports via a `BLOCKS` map or similar, use that instead:
//   import { BLOCKS } from "../../src/lib/page-blocks/registry";
//   const servicesBlock = BLOCKS.services;

type ServicesProps = {
  headline: string;
  subhead?: string;
  layout?: string;
  items: Array<{
    icon: string;
    title: string;
    description: string;
    price_from?: number;
    category?: string;
  }>;
};

function makeProps(items: Array<{ icon: string; title: string; description?: string }>): ServicesProps {
  return {
    headline: "Our HVAC Services",
    items: items.map((i) => ({
      icon: i.icon,
      title: i.title,
      description: i.description ?? "Detailed service description with adequate length to pass any min-length checks.",
    })),
  };
}

function runValidators(props: ServicesProps): string[] {
  // servicesBlock.validators is an array of (props) => string | null
  return (servicesBlock.validators ?? [])
    .map((fn: (p: ServicesProps) => string | null) => fn(props))
    .filter((s): s is string => s !== null);
}

test("accepts non-empty distinct icon names without checking an allowlist", () => {
  // These were rejected by the old allowlist on 2026-05-15.
  const errors = runValidators(
    makeProps([
      { icon: "shield_check", title: "HVAC Maintenance" },
      { icon: "wind",         title: "Duct Services" },
      { icon: "building_2",   title: "Commercial HVAC" },
    ])
  );
  const allowlistErrors = errors.filter((e) => e.includes("icon_in_allowlist"));
  assert.equal(allowlistErrors.length, 0, `allowlist error should not fire: ${errors.join(" | ")}`);
});

test("rejects empty icon strings with icon_required", () => {
  const errors = runValidators(
    makeProps([
      { icon: "",      title: "Service A" },
      { icon: "shield", title: "Service B" },
    ])
  );
  const required = errors.find((e) => e.startsWith("icon_required"));
  assert.ok(required, `expected icon_required, got: ${errors.join(" | ")}`);
  assert.match(required!, /Service A/);
});

test("rejects whitespace-only icon strings with icon_required", () => {
  const errors = runValidators(
    makeProps([
      { icon: "   ",   title: "Service A" },
      { icon: "shield", title: "Service B" },
    ])
  );
  const required = errors.find((e) => e.startsWith("icon_required"));
  assert.ok(required, `expected icon_required, got: ${errors.join(" | ")}`);
});

test("rejects duplicate icons across cards with distinct_icons", () => {
  const errors = runValidators(
    makeProps([
      { icon: "shield", title: "A" },
      { icon: "shield", title: "B" },
      { icon: "wrench", title: "C" },
    ])
  );
  const distinct = errors.find((e) => e.startsWith("distinct_icons"));
  assert.ok(distinct, `expected distinct_icons, got: ${errors.join(" | ")}`);
  assert.doesNotMatch(distinct!, /from the allowlist/);
});

test("accepts icons previously rejected by the allowlist (regression)", () => {
  for (const icon of ["shield_check", "wind", "building_2", "umbrella", "tornado"]) {
    const errors = runValidators(
      makeProps([
        { icon,         title: "A" },
        { icon: "shield", title: "B" },
      ])
    );
    const allowlistErrors = errors.filter((e) => e.includes("icon_in_allowlist"));
    assert.equal(
      allowlistErrors.length,
      0,
      `"${icon}" should be accepted, got: ${errors.join(" | ")}`
    );
  }
});
```

- [ ] **Step 3: Adjust import if needed**

If `pnpm test:unit` errors with "servicesBlock is not exported", inspect [registry.ts](packages/crm/src/lib/page-blocks/registry.ts) for the actual export shape (likely a `BLOCKS` map; use `BLOCKS.services` instead).

- [ ] **Step 4: Run the tests**

```bash
pnpm test:unit 2>&1 | grep -E "services-block-validator|pass |fail " | head -15
```
Expected: 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/tests/unit/services-block-validator.spec.ts
git commit -m "test(page-blocks): unit tests for soft services-block validator

Covers: empty icons fail with icon_required, duplicate icons fail
with distinct_icons, previously-rejected lucide names (shield_check,
wind, building_2) now pass.

Refs: docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md"
```

---

## Phase D — v2-aware output-contract-validator

### Task 7: Refactor `validateWorkspaceOutputContract` into loader + checker

**Files:**
- Modify: `packages/crm/src/lib/workspace/output-contract-validator.ts`

This is a zero-behavior-change refactor that enables unit testing in Task 9.

- [ ] **Step 1: Read the current `validateWorkspaceOutputContract` function**

Open [output-contract-validator.ts](packages/crm/src/lib/workspace/output-contract-validator.ts). Find the function starting at line ~163. It does (in order):
1. Load `org` from DB (~lines 172-204)
2. Load `landing` from DB (~lines 206-218)
3. Load `pipeline` from DB (~lines 221-227)
4. Load `intake` from DB (~lines 229-236)
5. Load `bookingTemplate` from DB (~lines 238-249)
6. Push ~16 checks onto a `checks` array
7. Return `{ status, checks, summary }`

You will extract steps 1-5 into `loadValidatorInputs` and steps 6-7 into `runChecks`.

- [ ] **Step 2: Add the `ValidatorInputs` type + `loadValidatorInputs` function**

Insert ABOVE the existing `validateWorkspaceOutputContract` function (around line ~162):

```typescript
/**
 * Inputs the validator needs to evaluate. Loaded once via
 * loadValidatorInputs(); passed to runChecks() for pure-logic evaluation.
 * Splitting load + check lets unit tests inject synthetic inputs without
 * a real DB.
 */
export interface ValidatorInputs {
  workspaceId: string;
  input: OutputContractInput;
  personality: CRMPersonality;
  expectedTimezone: string;
  org: {
    id: string;
    name: string | null;
    timezone: string | null;
    theme: Record<string, unknown> | null;
    settings: Record<string, unknown> | null;
  } | null;
  landing: {
    contentHtml: string | null;
    contentCss: string | null;
    sections: Array<Record<string, unknown>> | null;
  } | null;
  pipeline: { stages: Array<{ name: string }> } | null;
  intake: {
    name: string | null;
    fields: unknown;
    contentHtml: string | null;
  } | null;
  bookingTemplate: {
    title: string | null;
    metadata: Record<string, unknown> | null;
    startsAt: Date | null;
    endsAt: Date | null;
    contentHtml: string | null;
  } | null;
}

async function loadValidatorInputs(
  workspaceId: string,
  input: OutputContractInput,
  personality: CRMPersonality,
  expectedTimezone: string
): Promise<ValidatorInputs> {
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      timezone: organizations.timezone,
      theme: organizations.theme,
      settings: organizations.settings,
    })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);

  const [landing] = await db
    .select({
      contentHtml: landingPages.contentHtml,
      contentCss: landingPages.contentCss,
      sections: landingPages.sections,
    })
    .from(landingPages)
    .where(
      and(eq(landingPages.orgId, workspaceId), eq(landingPages.slug, "home"))
    )
    .limit(1);

  const [pipeline] = await db
    .select({ stages: pipelines.stages })
    .from(pipelines)
    .where(
      and(eq(pipelines.orgId, workspaceId), eq(pipelines.isDefault, true))
    )
    .limit(1);

  const [intake] = await db
    .select({
      name: intakeForms.name,
      fields: intakeForms.fields,
      contentHtml: intakeForms.contentHtml,
    })
    .from(intakeForms)
    .where(eq(intakeForms.orgId, workspaceId))
    .limit(1);

  const [bookingTemplate] = await db
    .select({
      title: bookings.title,
      metadata: bookings.metadata,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      contentHtml: bookings.contentHtml,
    })
    .from(bookings)
    .where(
      and(eq(bookings.orgId, workspaceId), eq(bookings.status, "template"))
    )
    .limit(1);

  return {
    workspaceId,
    input,
    personality,
    expectedTimezone,
    org: (org as ValidatorInputs["org"]) ?? null,
    landing: (landing as ValidatorInputs["landing"]) ?? null,
    pipeline: (pipeline as ValidatorInputs["pipeline"]) ?? null,
    intake: (intake as ValidatorInputs["intake"]) ?? null,
    bookingTemplate: (bookingTemplate as ValidatorInputs["bookingTemplate"]) ?? null,
  };
}
```

Note: the existing function reads `bookingRendered.contentHtml` and `intakeRendered.contentHtml` in inline sub-queries inside the checks loop. Move those into `loadValidatorInputs` too — fold them into the `bookings` and `intakeForms` selects so `runChecks` is purely synchronous.

- [ ] **Step 3: Add the `runChecks` function**

Insert below `loadValidatorInputs`:

```typescript
export function runChecks(inputs: ValidatorInputs): OutputContractResult {
  const { workspaceId, input, personality, expectedTimezone, org, landing, pipeline, intake, bookingTemplate } = inputs;

  const checks: ValidationCheck[] = [];

  if (!org) {
    return {
      status: "degraded",
      checks: [
        {
          surface: "workspace_exists",
          status: "fail",
          expected: "organizations row",
          actual: "not found",
          severity: "blocking",
        },
      ],
      summary: { total: 1, passed: 0, failed: 1, warned: 0, blocking_failures: 1 },
    };
  }

  const html = landing?.contentHtml ?? "";
  const sections = (landing?.sections ?? []) as Array<{
    content?: {
      headline?: string;
      body?: string;
      subheadline?: string;
      items?: unknown[];
      [k: string]: unknown;
    };
  }>;

  // ─── COPY the remaining check logic verbatim from the existing
  //     validateWorkspaceOutputContract here ───────────────────────────
  //     (Everything from `// ─── LANDING PAGE checks ───`
  //      through `// ─── Summarize ───`.)
  //
  // Reference the inputs via `inputs.*` instead of the local variables
  // the original function captured. The `html`, `sections`, `org`,
  // `pipeline`, `intake`, `bookingTemplate` locals above are the same
  // names so the body should compile with minimal edits.

  // ... (move all the existing check-push statements here) ...

  // ─── Summarize ─────────────────────────────────────────────
  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  const blockingFailures = checks.filter(
    (c) => c.status === "fail" && c.severity === "blocking"
  ).length;

  return {
    status: blockingFailures === 0 ? "pass" : "degraded",
    checks,
    summary: { total: checks.length, passed, failed, warned, blocking_failures: blockingFailures },
  };
}
```

- [ ] **Step 4: Update `validateWorkspaceOutputContract` to be the composition**

Replace the existing function body (line ~168 through ~732) with:

```typescript
export async function validateWorkspaceOutputContract(
  workspaceId: string,
  input: OutputContractInput,
  personality: CRMPersonality,
  expectedTimezone: string
): Promise<OutputContractResult> {
  const inputs = await loadValidatorInputs(workspaceId, input, personality, expectedTimezone);
  return runChecks(inputs);
}
```

The function signature stays identical. Callers continue to work unchanged.

- [ ] **Step 5: Typecheck**

```bash
cd packages/crm && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "output-contract|TS[0-9]+:" | grep -v "next/types/validator" | head -10
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/lib/workspace/output-contract-validator.ts
git commit -m "refactor(workspace): split validator into loadInputs + runChecks

Zero behavior change. Extracts the DB-reading layer into
loadValidatorInputs and the pure check logic into runChecks. Enables
unit testing the v2-mode branches in subsequent tasks without a real
DB. The existing validateWorkspaceOutputContract becomes a thin
composition that callers continue to use unchanged.

Refs: docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md"
```

---

### Task 8: Add `isV2` mode + v2-aware branches

**Files:**
- Modify: `packages/crm/src/lib/workspace/output-contract-validator.ts`

- [ ] **Step 1: Add the `isV2` computation at the top of `runChecks`**

Inside `runChecks`, just before the `// ─── LANDING PAGE checks ───` block, add:

```typescript
  // 2026-05-15 — v2 mode detection. enhance-blocks.ts nulls contentHtml
  // when it writes the `sections` JSON column (the new <PageRenderer>
  // path renders from sections at request time). The v1 checks below
  // for landing_page_exists and cta_primary_href assume contentHtml is
  // populated — they need to look at sections instead in v2 mode.
  const isV2 = sections.length > 0 && (html === null || html.length === 0);
  const hasV2Content = sections.some((s) => {
    const c = s.content ?? {};
    return Boolean(
      c.headline ||
        c.body ||
        c.subheadline ||
        ((c.items as unknown[] | undefined)?.length ?? 0) > 0
    );
  });
```

- [ ] **Step 2: Replace the `landing_page_exists` check**

Find (in `runChecks`):
```typescript
  // 1. Landing page exists at all.
  checks.push({
    surface: "landing_page_exists",
    status: html.length > 100 ? "pass" : "fail",
    expected: "rendered HTML > 100 chars",
    actual: `${html.length} chars`,
    severity: "blocking",
  });
```

Replace with:
```typescript
  // 1. Landing page exists. v2 mode looks at the `sections` JSON column
  // (which <PageRenderer> renders from at request time); v1 mode looks
  // at the legacy contentHtml column.
  checks.push({
    surface: "landing_page_exists",
    status: isV2
      ? hasV2Content
        ? "pass"
        : "fail"
      : html.length > 100
        ? "pass"
        : "fail",
    expected: isV2
      ? "≥1 section with meaningful content (headline / body / items)"
      : "rendered HTML > 100 chars",
    actual: isV2
      ? `${sections.length} sections, content ${hasV2Content ? "present" : "all empty"}`
      : `${html.length} chars`,
    severity: "blocking",
  });
```

- [ ] **Step 3: Wrap the `cta_primary_href` + `cta_secondary_href` checks in `if (!isV2)`**

Find the block (around the original lines 288-313):

```typescript
  // 4. CTA href contract — primary MUST be /book, secondary MUST be /intake.
  // This is the structurally-enforced contract from the v1.1.9 spec.
  // The renderer's btn class names are sf-btn--primary / sf-btn--secondary.
  const primaryHref = extractHrefFor(html, "primary");
  checks.push({
    surface: "cta_primary_href",
    status: primaryHref === "/book" ? "pass" : "fail",
    expected: "/book",
    actual: primaryHref ?? "(not extracted)",
    severity: "blocking",
  });
  const secondaryHref = extractHrefFor(html, "secondary");
  checks.push({
    surface: "cta_secondary_href",
    status:
      secondaryHref === null
        ? "warn"
        : secondaryHref === "/intake"
          ? "pass"
          : "fail",
    expected: "/intake (or absent)",
    actual: secondaryHref ?? "(not present)",
    severity: secondaryHref === null ? "cosmetic" : "blocking",
  });
```

Replace with:

```typescript
  // 4. CTA href contract (v1 mode only). In v2, CTAs are rendered at
  // request time by <PageRenderer> from PageSchema.actions — fully
  // renderer-controlled (always emits /book + /intake). The v1 regex-
  // extract-from-HTML contract doesn't apply; skip in v2 mode.
  if (!isV2) {
    const primaryHref = extractHrefFor(html, "primary");
    checks.push({
      surface: "cta_primary_href",
      status: primaryHref === "/book" ? "pass" : "fail",
      expected: "/book",
      actual: primaryHref ?? "(not extracted)",
      severity: "blocking",
    });
    const secondaryHref = extractHrefFor(html, "secondary");
    checks.push({
      surface: "cta_secondary_href",
      status:
        secondaryHref === null
          ? "warn"
          : secondaryHref === "/intake"
            ? "pass"
            : "fail",
      expected: "/intake (or absent)",
      actual: secondaryHref ?? "(not present)",
      severity: secondaryHref === null ? "cosmetic" : "blocking",
    });
  }
```

- [ ] **Step 4: Typecheck**

```bash
cd packages/crm && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "output-contract|TS[0-9]+:" | grep -v "next/types/validator" | head -10
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/workspace/output-contract-validator.ts
git commit -m "feat(workspace): v2-aware validator (landing_page_exists, cta_*)

Detects v2 mode by sections.length > 0 && contentHtml is null/empty.
- landing_page_exists: v2 checks sections content; v1 keeps contentHtml.length > 100
- cta_primary_href + cta_secondary_href: skipped in v2 (renderer is
  source of truth; the v1 contract doesn't translate)

Eliminates the workspace_output_contract degraded false-alarm observed
on every v2 workspace creation 2026-05-15.

Refs: docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md"
```

---

### Task 9: Unit tests for the v2-aware validator

**Files:**
- Create: `packages/crm/tests/unit/output-contract-validator-v2.spec.ts`

- [ ] **Step 1: Create the test file**

```typescript
// packages/crm/tests/unit/output-contract-validator-v2.spec.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runChecks,
  type ValidatorInputs,
} from "../../src/lib/workspace/output-contract-validator";
import type { CRMPersonality } from "../../src/lib/crm/personality";

const HVAC_PERSONALITY = {
  vertical: "hvac",
  pipeline: {
    stages: [
      { name: "New Inquiry" },
      { name: "Diagnosed" },
      { name: "Quote" },
      { name: "Approved" },
      { name: "Scheduled" },
      { name: "In Progress" },
      { name: "Completed" },
      { name: "Lost" },
    ],
  },
  content_templates: { services_heading: "Our HVAC Services" },
  intake: { title: "Tell us about your HVAC issue" },
  booking: { title: "Schedule a service visit" },
} as unknown as CRMPersonality;

function makeInputs(overrides: {
  landing: ValidatorInputs["landing"];
  pipeline?: ValidatorInputs["pipeline"];
  intake?: ValidatorInputs["intake"];
  bookingTemplate?: ValidatorInputs["bookingTemplate"];
} = { landing: null }): ValidatorInputs {
  return {
    workspaceId: "test-workspace-id",
    input: {
      business_name: "Test HVAC Co",
      city: "Dallas",
      state: "TX",
      services: ["AC repair", "Heating install"],
    },
    personality: HVAC_PERSONALITY,
    expectedTimezone: "America/Chicago",
    org: {
      id: "test-workspace-id",
      name: "Test HVAC Co",
      timezone: "America/Chicago",
      theme: {},
      settings: { crmPersonality: { vertical: "hvac" } },
    },
    landing: overrides.landing,
    pipeline: overrides.pipeline ?? {
      stages: HVAC_PERSONALITY.pipeline.stages,
    },
    intake: overrides.intake ?? {
      name: "Tell us about your HVAC issue",
      fields: [
        {
          key: "service",
          options: ["AC repair", "Heating install", "Other / not sure"],
          type: "select",
        },
      ],
      contentHtml: "<form>Tell us about your HVAC issue ...</form>",
    },
    bookingTemplate: overrides.bookingTemplate ?? {
      title: "Schedule a service visit",
      metadata: {
        appointmentName: "HVAC consultation",
        availability: {
          monday: { enabled: true, start: "08:00", end: "17:00" },
        },
      },
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 60 * 60 * 1000),
      contentHtml: "<div data-sf-booking='{\"weekly\":{\"mon\":[]}}'></div>",
    },
  };
}

test("v2 mode: landing_page_exists passes when sections have headline content", () => {
  const result = runChecks(
    makeInputs({
      landing: {
        contentHtml: null,
        contentCss: null,
        sections: [
          { content: { headline: "Welcome", body: "..." } },
          { content: { items: [{ title: "Service A", icon: "wrench" }] } },
        ],
      },
    })
  );
  const check = result.checks.find((c) => c.surface === "landing_page_exists");
  assert.equal(check?.status, "pass", `landing_page_exists should pass: ${JSON.stringify(check)}`);
});

test("v2 mode: landing_page_exists fails when sections are all empty content", () => {
  const result = runChecks(
    makeInputs({
      landing: {
        contentHtml: null,
        contentCss: null,
        sections: [{ content: {} }, { content: { items: [] } }],
      },
    })
  );
  const check = result.checks.find((c) => c.surface === "landing_page_exists");
  assert.equal(check?.status, "fail");
  assert.match(check?.actual ?? "", /all empty/);
});

test("v2 mode: landing_page_exists fails when sections array is empty", () => {
  const result = runChecks(
    makeInputs({
      landing: { contentHtml: null, contentCss: null, sections: [] },
    })
  );
  const check = result.checks.find((c) => c.surface === "landing_page_exists");
  // 0 sections is NOT v2 mode (isV2 requires sections.length > 0); falls
  // through to the v1 contentHtml check, which also fails on empty html.
  assert.equal(check?.status, "fail");
});

test("v2 mode: cta_primary_href check is omitted entirely", () => {
  const result = runChecks(
    makeInputs({
      landing: {
        contentHtml: null,
        contentCss: null,
        sections: [{ content: { headline: "Welcome" } }],
      },
    })
  );
  const ctaCheck = result.checks.find((c) => c.surface === "cta_primary_href");
  assert.equal(ctaCheck, undefined, "cta_primary_href should not appear in v2 mode");
});

test("v2 mode: cta_secondary_href check is omitted entirely", () => {
  const result = runChecks(
    makeInputs({
      landing: {
        contentHtml: null,
        contentCss: null,
        sections: [{ content: { headline: "Welcome" } }],
      },
    })
  );
  const ctaCheck = result.checks.find((c) => c.surface === "cta_secondary_href");
  assert.equal(ctaCheck, undefined, "cta_secondary_href should not appear in v2 mode");
});

test("v1 mode (legacy contentHtml): landing_page_exists uses contentHtml check", () => {
  const longHtml = "<html>" + "x".repeat(200) + "</html>";
  const result = runChecks(
    makeInputs({
      landing: { contentHtml: longHtml, contentCss: null, sections: [] },
    })
  );
  const check = result.checks.find((c) => c.surface === "landing_page_exists");
  assert.equal(check?.status, "pass");
  assert.match(check?.actual ?? "", /chars/);
});

test("v1 mode: cta_primary_href check still runs", () => {
  const html = `<html><a class="sf-btn sf-btn--primary" href="/book">Book</a></html>`;
  const result = runChecks(
    makeInputs({
      landing: { contentHtml: html, contentCss: null, sections: [] },
    })
  );
  const ctaCheck = result.checks.find((c) => c.surface === "cta_primary_href");
  assert.ok(ctaCheck, "cta_primary_href should appear in v1 mode");
  assert.equal(ctaCheck?.status, "pass");
});

test("v2 mode: overall status is pass when no other blocking checks fail", () => {
  const result = runChecks(
    makeInputs({
      landing: {
        contentHtml: null,
        contentCss: null,
        sections: [{ content: { headline: "Welcome", body: "Hello world" } }],
      },
    })
  );
  // Should be 0 blocking failures because landing_page_exists passes
  // and cta_primary_href / cta_secondary_href are skipped.
  assert.equal(result.summary.blocking_failures, 0, `unexpected blocking failures: ${JSON.stringify(result.checks.filter(c => c.status === "fail"))}`);
  assert.equal(result.status, "pass");
});
```

- [ ] **Step 2: Run the tests**

```bash
pnpm test:unit 2>&1 | grep -E "output-contract-validator-v2|pass |fail " | head -25
```
Expected: 8 tests passing.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/tests/unit/output-contract-validator-v2.spec.ts
git commit -m "test(workspace): unit tests for v2-aware output-contract-validator

Covers: v2 landing_page_exists passes on populated sections + meaningful
content; fails on empty content / empty sections; cta_primary_href and
cta_secondary_href are omitted in v2 mode; v1 mode still runs the
contentHtml-based checks; overall status flips to pass when no other
blocking failures.

Refs: docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md"
```

---

## Phase E — Migrate v1 SSR renderer + delete `lucide-icons.ts`

### Task 10: Update `general-service-v1.ts` to use the new resolver

**Files:**
- Modify: `packages/crm/src/lib/blueprint/renderers/general-service-v1.ts`

- [ ] **Step 1: Replace the lucide-icons imports**

Find (around lines 84-88):
```typescript
import {
  ICON_PATHS_TYPE_GUARD,  // (if present — actual import names may vary)
  hasIcon as hasLucideIcon,
  ICON_NAMES,
  renderIcon as renderLucideIcon,
  IconName,
} from "./lucide-icons";
```

Replace with:
```typescript
import {
  renderIconToSvgString,
} from "./icon-resolver";
```

(The exact set of imports in the existing file may differ — adjust accordingly. The goal is to remove ALL imports from `./lucide-icons` from this file, since `lucide-icons.ts` is deleted in Task 11.)

- [ ] **Step 2: Replace `iconSvg(name)` function (around line 540-555)**

Find:
```typescript
function iconSvg(name: string | undefined): string {
  const key = (name ?? "").toLowerCase();
  if (hasLucideIcon(name)) {
    return `<span class="sf-icon" aria-hidden="true">${renderLucideIcon(name as string)}</span>`;
  }
  const svg = ICON_MAP[key] ?? ICON_MAP._default;
  return `<span class="sf-icon" aria-hidden="true">${svg}</span>`;
}
```

Replace with:
```typescript
function iconSvg(name: string | undefined): string {
  // 2026-05-15 — uses the shared resolver which tries (1) concept aliases,
  // (2) full lucide-react library, (3) Sparkles fallback. Always returns a
  // non-empty SVG. ICON_MAP (the "chrome" icons local to this file) is now
  // only used by the literal callers below (CHEVRON_RIGHT_SVG_SMALL,
  // PHONE_SVG_SMALL); the general iconSvg path no longer consults it.
  return `<span class="sf-icon" aria-hidden="true">${renderIconToSvgString(name)}</span>`;
}
```

- [ ] **Step 3: Replace `iconForContentItem(item)` function (around line 562-565)**

Find:
```typescript
function iconForContentItem(item: { icon?: string; title?: string }): string {
  if (item.icon && (hasLucideIcon(item.icon) || ICON_MAP[item.icon.toLowerCase()])) {
    return iconSvg(item.icon);
  }
  return `<span class="sf-icon" aria-hidden="true">${renderLucideIcon(lucideIconForTitle(item.title))}</span>`;
}
```

Replace with:
```typescript
function iconForContentItem(item: { icon?: string; title?: string }): string {
  // 2026-05-15 — the new resolver handles unknown icons gracefully
  // (Sparkles fallback), so the title-based fallback path is no longer
  // necessary. iconSvg handles all cases.
  return iconSvg(item.icon ?? "");
}
```

If `lucideIconForTitle` is no longer referenced anywhere else in this file, also delete its definition.

- [ ] **Step 4: Verify no remaining references to `lucide-icons`**

```bash
grep -n "lucide-icons\|hasLucideIcon\|renderLucideIcon\|ICON_NAMES\|lucideIconForTitle\|ICON_PATHS" packages/crm/src/lib/blueprint/renderers/general-service-v1.ts
```
Expected: no matches. (`ICON_MAP` may remain — that's a local file-private map for chrome icons, unrelated to the deleted lucide-icons.ts.)

- [ ] **Step 5: Typecheck**

```bash
cd packages/crm && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "general-service-v1|TS[0-9]+:" | grep -v "next/types/validator" | head -10
```
Expected: no errors specifically for this file.

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/lib/blueprint/renderers/general-service-v1.ts
git commit -m "refactor(renderers): v1 SSR uses shared icon-resolver

iconSvg + iconForContentItem now use renderIconToSvgString from the
shared resolver (lib/blueprint/renderers/icon-resolver.ts). All
references to lucide-icons.ts removed in preparation for that file's
deletion in the next task.

Refs: docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md"
```

---

### Task 11: Delete `lucide-icons.ts`

**Files:**
- Delete: `packages/crm/src/lib/blueprint/renderers/lucide-icons.ts`

- [ ] **Step 1: Confirm no remaining callers**

```bash
grep -rln "from.*blueprint/renderers/lucide-icons\|@/lib/blueprint/renderers/lucide-icons" packages/crm/src
```
Expected: no matches.

```bash
grep -rln "ICON_PATHS\|ICON_NAMES\|hasLucideIcon\|renderLucideIcon" packages/crm/src
```
Expected: no matches (the local `ICON_NAMES` inside `puck/config-fields.ts` is a different file-local constant and is fine; verify any matches are in unrelated files).

- [ ] **Step 2: Delete the file**

```bash
rm packages/crm/src/lib/blueprint/renderers/lucide-icons.ts
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/crm && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "TS[0-9]+:" | grep -v "next/types/validator" | head -10
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A packages/crm/src/lib/blueprint/renderers/
git commit -m "chore(renderers): delete lucide-icons.ts (superseded by icon-resolver)

The 205-line hand-maintained ICON_PATHS map is replaced by lucide-react's
~1500-icon library + Sparkles fallback in the shared icon-resolver.
No remaining callers.

Refs: docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md"
```

---

## Phase F — Update services SKILL.md prompt

### Task 12: Rewrite services-block icon prompt

**Files:**
- Modify: `packages/crm/src/blocks/services/SKILL.md`

- [ ] **Step 1: Find the icon allowlist sections**

```bash
grep -n -i "lucide\|allowlist\|icon" packages/crm/src/blocks/services/SKILL.md
```
Expected: matches around lines 32 (icon field description) and 96 (the full allowlist section).

- [ ] **Step 2: Update the icon field description (around line 32)**

Find:
```
description: Lucide icon name in snake_case from the allowlist (see body). Each item MUST pick a different icon.
```

Replace with:
```
description: Lucide icon name (snake_case, kebab-case, or PascalCase). Any valid lucide icon name from https://lucide.dev/icons — the renderer supports the full ~1500-icon library. Unknown names render a Sparkles fallback, so prefer names you're confident exist. Each item MUST pick a different icon.
```

- [ ] **Step 3: Replace the full allowlist section (line 96 onward)**

Find the section starting with:
```
## Lucide icon allowlist (snake_case names)
```

…and the list of 60 icon names that follow.

Replace the entire section with:

```
## Lucide icons

Use any valid lucide icon name from https://lucide.dev/icons — the renderer
supports the full library via lucide-react. Names are case-insensitive and
accept snake_case, kebab-case, or PascalCase (e.g. `shield_check`,
`shield-check`, and `ShieldCheck` all resolve to the same icon).

Common concept aliases also work: `storm`, `repair`, `inspection`,
`emergency`, `warranty`, `licensed`, `insured`, `drain`, `leak`, `cooling`,
`heating`, etc.

If you pick a name that doesn't exist in lucide, the renderer falls back to
a Sparkles icon — so prefer real lucide names you're confident exist.
```

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/blocks/services/SKILL.md
git commit -m "docs(blocks): drop services allowlist; document full lucide library

The services-block prompt no longer lists a 60-name allowlist. Claude
can use any valid lucide name (with snake/kebab/Pascal case variants).
Unknown names render Sparkles at render time.

Refs: docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md"
```

---

## Phase G — Deploy + verify

### Task 13: Push branch + merge to main

**Files:**
- None (operational)

- [ ] **Step 1: Confirm git log + diff stats**

```bash
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
```
Expected: ~12 commits across the tasks; mostly net-negative line counts (deletions of `lucide-icons.ts` + old resolver dominate).

- [ ] **Step 2: Push branch**

```bash
git push -u origin worktree-soften-rigid-validators
```
(Substitute the actual branch name from your worktree.)

- [ ] **Step 3: Merge to main via the seo-marketing-schema worktree**

```bash
cd "C:/Users/maxim/CascadeProjects/Seldon Frame/.claude/worktrees/seo-marketing-schema"
git pull --ff-only origin main
git merge --no-ff origin/worktree-soften-rigid-validators -m "Merge feat: soften rigid validators (icons + v2-aware contract checks)

Implements docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md
per plan docs/superpowers/plans/2026-05-15-soften-rigid-validators.md.

Three surgical changes:
- Drop the 60-entry icon allowlist; use lucide-react ~1500 icons +
  Sparkles fallback in the shared icon-resolver.
- output-contract-validator landing_page_exists is now v2-aware
  (checks sections JSON when contentHtml is null).
- output-contract-validator cta_primary_href + cta_secondary_href
  skipped in v2 mode (renderer is source of truth)."
git push origin main
```

- [ ] **Step 4: Wait for Vercel deploy**

```bash
sleep 180
vercel ls --prod --yes --token "$VERCEL_TOKEN" --cwd "C:/Users/maxim/CascadeProjects/Seldon Frame/.claude/worktrees/seo-marketing-schema/packages/crm" | head -5
```
Expected: newest deployment shows `● Ready`.

---

### Task 14: Manual smoke against production

**Files:**
- None (manual)

- [ ] **Step 1: Run a fresh CC session smoke**

In a clean Claude Code session:

```
create workspace for https://quigleyac.com
```

- [ ] **Step 2: Tail Vercel logs during the smoke run**

```bash
vercel logs --follow --yes --token "$VERCEL_TOKEN" --cwd "C:/Users/maxim/CascadeProjects/Seldon Frame/.claude/worktrees/seo-marketing-schema/packages/crm" 2>&1 | grep -E "workspace_output_contract|icon_in_allowlist|enhance_blocks_succeeded|v2_workspace_create_succeeded"
```

- [ ] **Step 3: Assert against the expected log diff**

| Log line | Today (baseline) | After this change |
|---|---|---|
| `Services block failed icon validation` | Fires (with substitutions) | Does not fire |
| `workspace_output_contract status` | `degraded`, blocking_failures: 2 | `pass`, blocking_failures: 0 |
| `workspace_output_contract_failure surface: landing_page_exists` | Logged | Not logged |
| `workspace_output_contract_failure surface: cta_primary_href` | Logged | Not logged |
| `enhance_blocks_succeeded` | Logged | Logged (unchanged) |
| `v2_workspace_create_succeeded` | Logged | Logged (unchanged) |

- [ ] **Step 4: Browser-check the rendered landing page**

Visit the public URL returned in the create response (e.g. `https://quigley-heating-air.app.seldonframe.com`). Confirm:
- Services-grid icons render with varied real lucide icons (not all-the-same Sparkles)
- No visible regressions vs the 2026-05-15 baseline

- [ ] **Step 5: Record results**

Append a `## Smoke results YYYY-MM-DD` section to this plan file with one line per assertion + observed result. Commit.

---

### Task 15: Soak window

**Files:**
- None (operational)

- [ ] **Step 1: Monitor Vercel logs for 24h (or compressed per ship-fast preference)**

```bash
vercel logs --since 24h --yes --token "$VERCEL_TOKEN" --cwd "C:/Users/maxim/CascadeProjects/Seldon Frame/.claude/worktrees/seo-marketing-schema/packages/crm" 2>&1 | \
  grep -E "icon_in_allowlist|workspace_output_contract_failure|workspace_output_contract status" | head -50
```

Expected:
- Zero `icon_in_allowlist` events
- Zero `workspace_output_contract_failure surface:(landing_page_exists|cta_primary_href|cta_secondary_href)` events
- Any `workspace_output_contract status: degraded` events should have an UNRELATED `failed` check — investigate if so

- [ ] **Step 2: If any unexpected failures surface — rollback**

```bash
# Revert the merge commit
cd "C:/Users/maxim/CascadeProjects/Seldon Frame/.claude/worktrees/seo-marketing-schema"
git log --oneline -5  # find the merge SHA
git revert -m 1 <merge-sha>
git push origin main
```

---

## Definition of done (mirror of spec §"Definition of done")

- [ ] All unit tests pass: `pnpm test:unit` is green for icon-resolver, services-block-validator, output-contract-validator-v2
- [ ] Manual smoke against quigleyac.com produces `workspace_output_contract status: pass`
- [ ] No `icon_in_allowlist` retry events in production logs for 24h post-merge
- [ ] No `workspace_output_contract_failure surface:(landing_page_exists|cta_primary_href|cta_secondary_href)` events in production logs for 24h
- [ ] Rendered v2 landing pages show varied real lucide icons (not all Sparkles)
- [ ] `lucide-icons.ts` deleted
- [ ] `components/landing/sections/icon-resolver.ts` deleted
- [ ] No remaining references to `ICON_PATHS`, `ICON_NAMES` (from lucide-icons), `renderIcon`, `hasIcon`, `resolveBlockIcon`

---

## Self-review notes

1. **Spec coverage**:
   - §Architecture / Before-After flow → Tasks 1, 5, 8 implement it
   - §Components / new icon-resolver → Task 1
   - §Components / registry.ts validator → Task 5
   - §Components / output-contract-validator → Tasks 7, 8
   - §Components / general-service-v1.ts → Task 10
   - §Components / config-fields.ts → not changed (deferred per surgical scope; the 16-icon picker UI is independent of the validator/renderer paths)
   - §Components / SKILL.md → Task 12
   - §Components / delete lucide-icons.ts → Task 11
   - §Data flow + §Failure modes → exercised in Task 14 manual smoke
   - §Testing → Tasks 2, 6, 9
   - §Migration / rollout 11 steps → Tasks 1-12 (plan-side 12 tasks map to spec-side 11 steps; the extra task is the test files)
   - §Rollback plan → Task 15 step 2

2. **Placeholder scan**:
   - Task 7 step 3 says "COPY the remaining check logic verbatim from the existing function" with a `// ... (move all the existing check-push statements here) ...` comment. This is a mechanical copy-paste operation; the existing 460 lines of check logic stays unchanged. Not a placeholder per se — the source code IS the spec — but the implementer should preserve line-for-line behavior. Task 7 step 5 (typecheck) catches errors.
   - No `TODO`, no vague "handle edge cases", no "implement later".

3. **Type consistency**:
   - `ValidatorInputs` defined in Task 7 step 2; imported in Task 9.
   - `runChecks` exported in Task 7 step 3; imported in Task 9.
   - `resolveIconComponent` defined in Task 1; imported in Task 3.
   - `renderIconToSvgString` defined in Task 1; imported in Task 10.
   - All naming consistent.

## Out of scope (mirror of spec §"Out of scope")

1. Comprehensive validator audit for other v1/v2 staleness
2. Removing the v1 render path entirely (`general-service-v1.ts` + contentHtml column)
3. Other rigid validators in the codebase (personality cache, weekly_hours regex)
4. Operator-facing icon picker UX improvements (`puck/config-fields.ts` 16-icon dropdown stays as-is)
5. Vertical-aware fallback maps
6. Bundle-size optimization for lucide
7. Migration of existing operator-edited workspaces
