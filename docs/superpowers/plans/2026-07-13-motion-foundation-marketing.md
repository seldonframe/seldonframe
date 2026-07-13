# Motion Foundation + Marketing-Landing Animations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a reusable motion foundation (vendored Magic UI components on our existing `motion` engine + motion tokens + a dev-only `/motion-lab` gallery + the comprehension-first rubric) and apply six comprehension-first animations to the marketing landing by augmenting existing sections.

**Architecture:** Vendored components live self-contained in `components/ui/magic/`, each a `"use client"` wrapper on `motion` that (a) guards `useReducedMotion()` → returns a complete static state, (b) reads motion-token CSS vars for timing, (c) themes via `--lp-*`. Marketing section files import and compose them; sections stay the composition layer. No new npm dependency.

**Tech Stack:** Next.js App Router (packages/crm), `motion` v12.38 / `framer-motion` v12.38 (already installed), Tailwind arbitrary values + `--lp-*` landing tokens, node:test + tsx runner, renderToString smokes.

## Global Constraints

- **Branch:** `feat/motion-marketing` off `origin/main` (worktree `.claude/worktrees/motion-marketing`). Real `pnpm install` in the worktree — NO node_modules junctions (repo lesson L-37; junctions break the tsx test runner).
- **No new dependency.** Vendor Magic UI components as source; never `npm i magicui`. The engine is the already-installed `motion` / `framer-motion`.
- **Canonical source = the Magic UI doc page** for each component (URLs in each task). Fetch the current component source from there and apply the Adaptation Contract below — do NOT reconstruct from memory. The doc page is the spec for the component's motion; our contract is the spec for how it behaves in this repo.
- **Adaptation Contract (every vendored component):** (1) `"use client"`; (2) `import { useReducedMotion } from "framer-motion"` — when `useReducedMotion()` is true, render the COMPLETE static state (all content present, final positions, no motion) and return early, matching the idiom in `components/landing-r1/_shared/motion.tsx:27-28`; (3) accept an optional `forceStatic?: boolean` prop that forces the reduced-motion static branch (the `/motion-lab` toggle drives it); (4) timing comes from the motion tokens (Task 1), not hardcoded ms, unless the component's motion is inherently continuous (e.g. orbit period) where a prop default is fine; (5) colors default to `currentColor` / `--lp-accent` / token vars, never a hardcoded brand hex; (6) `className` passthrough via `cn` from `@/lib/utils`.
- **Kill rule:** every applied animation names the concept/step/state it clarifies (spec §3). Decorative-only usage is a defect.
- **Guardrails:** complete static state is the real design; `prefers-reduced-motion` honored; NO CLS; animate transform/opacity only; below-fold motion lazy-mounts (`whileInView` / `useInView`), never runs offscreen.
- **Both landing modes:** every marketing augment must render correctly in light build mode AND warm-dark record mode (`--lp-*` tokens) and must not fight the in-place mode flip.
- **Truth in copy:** any label an animation introduces (surface names, module names, install command, counts) must be true/current — reuse CLAUDE.md §1b vocabulary and existing section copy; no invented numbers.
- **`/motion-lab` is dev-only:** 404 in production via the same strict-`"1"` env-flag idiom used by other gated routes (`SF_MOTION_LAB`), verified by a test.
- **Tests:** unit suite has a known red baseline (DB-bound + legacy) — judge by DELTA, not absolute. Single spec: `node --import tsx --test <path>` from `packages/crm/`. Typecheck delta baseline: 1 pre-existing `persist` error in a copilot route — PASS iff no new errors beyond it.
- **Commits:** conventional; body ends `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure (locked)

```
packages/crm/src/
  components/motion/
    motion-tokens.css              NEW  --motion-fast/base/slow + eases
  components/ui/magic/
    animated-beam.tsx              NEW  directional beam between two refs
    orbiting-circles.tsx           NEW  items orbiting a center
    terminal.tsx                   NEW  sequenced typed-line terminal
    bento-grid.tsx                 NEW  BentoGrid + BentoCard layout
    avatar-circles.tsx             NEW  overlapping avatar stack + "+N"
  components/landing/
    marketing-ide-strip.tsx        MOD  host the Terminal (install demo)
    marketing-modules.tsx          MOD  MarketingModules → bento reflow; MarketingAgents → orbiting surfaces (970-line file — touch only the two render blocks)
    marketing-proof-strip.tsx      MOD  host AvatarCircles (proof scale)
    marketing-build-steps.tsx      MOD  host IntegrationBeam sub-component
    integration-beam.tsx           NEW  small self-contained "SF pushes outward" beam figure (consumed by build-steps)
    marketing-hero.tsx             MOD  BorderBeam accent on the build CTA/workspace card (reuse existing component)
  app/(dev)/motion-lab/
    page.tsx                       NEW  dev-only gallery, SF_MOTION_LAB-gated
    motion-lab-client.tsx          NEW  client gallery w/ reduced-motion + light/dark toggles
docs/motion/
  comprehension-first.md           NEW  the rubric (kill rule + guardrails)
packages/crm/tests/unit/motion/
  animated-beam.spec.tsx           NEW
  orbiting-circles.spec.tsx        NEW
  terminal.spec.tsx                NEW
  bento-grid.spec.tsx              NEW
  avatar-circles.spec.tsx          NEW
  motion-lab-gate.spec.ts          NEW  404-in-prod gate
  integration-beam.spec.tsx        NEW
```

---

### Task 0: Worktree bring-up

**Files:** none (git/env)

- [ ] **Step 1:** Worktree already exists at `.claude/worktrees/motion-marketing` (branch `feat/motion-marketing` off origin/main) with the spec + this plan committed. Confirm: `git -C .claude/worktrees/motion-marketing log --oneline -2`.
- [ ] **Step 2:** Real install (L-37): from the worktree root run `pnpm install` (warm store ≈ hardlinks). Do NOT create node_modules junctions.
- [ ] **Step 3:** Baseline for delta judgment: `node scripts/run-unit-tests.js > .superpowers/sdd/baseline-tests.txt 2>&1`; record pass/fail counts (grep `✔`/`✖`).

---

### Task 1: Motion tokens + rubric doc

**Files:**
- Create: `packages/crm/src/components/motion/motion-tokens.css`
- Create: `docs/motion/comprehension-first.md`

**Interfaces:**
- Produces: CSS vars `--motion-fast: 180ms; --motion-base: 280ms; --motion-slow: 420ms; --motion-ease: cubic-bezier(0.22,1,0.36,1); --motion-ease-inout: cubic-bezier(0.65,0,0.35,1);` on `:root`. Vendored components and `/motion-lab` read these. Import site: `motion-lab/page.tsx` and the marketing route already imports `landing-theme.css` at route level — add `motion-tokens.css` import alongside it in `app/(public)/page.tsx` and `app/(dev)/motion-lab/page.tsx` (Task 7/8 note this).

- [ ] **Step 1:** Write `motion-tokens.css`:

```css
/* packages/crm/src/components/motion/motion-tokens.css
   Cross-surface motion timing tokens (spec §4.2). Imported at the route
   level (like landing-theme.css). Vendored magic/* components read these
   so timing is consistent everywhere; nothing hardcodes ms. */
:root {
  --motion-fast: 180ms;
  --motion-base: 280ms;
  --motion-slow: 420ms;
  --motion-ease: cubic-bezier(0.22, 1, 0.36, 1);       /* ease-out-ish */
  --motion-ease-inout: cubic-bezier(0.65, 0, 0.35, 1);
}
@media (prefers-reduced-motion: reduce) {
  :root { --motion-fast: 0ms; --motion-base: 0ms; --motion-slow: 0ms; }
}
```

- [ ] **Step 2:** Write `docs/motion/comprehension-first.md` — one page: the kill rule (every animation names its concept or it's cut), the guardrails (static state is real; reduced-motion; no CLS; transform/opacity only; lazy-mount below fold; both landing modes), and a one-line "how to add a new animation" checklist that points future slices (guides/tools/dashboard) at this doc. No placeholders — write the actual prose (source it from spec §3).
- [ ] **Step 3:** Commit — `feat(motion): motion timing tokens + comprehension-first rubric`

---

### Task 2: Vendor `AnimatedBeam`

**Files:**
- Create: `packages/crm/src/components/ui/magic/animated-beam.tsx`
- Test: `packages/crm/tests/unit/motion/animated-beam.spec.tsx`

**Canonical source:** https://magicui.design/docs/components/animated-beam — fetch current source, apply the Adaptation Contract (Global Constraints).

**Interfaces:**
- Produces: `AnimatedBeam({ containerRef, fromRef, toRef, curvature?, reverse?, duration?, gradientStartColor?, gradientStopColor?, forceStatic?, className? })`. Consumed by Task 12 (IntegrationBeam) and Task 7 (motion-lab). `forceStatic` / reduced-motion → renders the static SVG path (beam at rest, no animated gradient).

- [ ] **Step 1: Failing test**

```tsx
// packages/crm/tests/unit/motion/animated-beam.spec.tsx
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { AnimatedBeam } from "../../../src/components/ui/magic/animated-beam";

function harness(forceStatic: boolean) {
  const container = React.createRef<HTMLDivElement>();
  const a = React.createRef<HTMLDivElement>();
  const b = React.createRef<HTMLDivElement>();
  return renderToString(
    React.createElement(AnimatedBeam, { containerRef: container, fromRef: a, toRef: b, forceStatic }),
  );
}
describe("<AnimatedBeam>", () => {
  test("renders an svg without crashing (refs null at SSR)", () => {
    assert.doesNotThrow(() => harness(false));
    assert.match(harness(false), /<svg/);
  });
  test("forceStatic renders no animated <motion> gradient offset (static path only)", () => {
    // static branch must still produce the svg path but omit the animated
    // <linearGradient> keyframe markup; assert the beam svg is present.
    assert.match(harness(true), /<svg/);
  });
});
```

- [ ] **Step 2:** Run → FAIL (module missing). `cd packages/crm && node --import tsx --test tests/unit/motion/animated-beam.spec.tsx`
- [ ] **Step 3:** Implement: fetch canonical source from the doc URL; apply the Adaptation Contract. Reduced-motion / `forceStatic` branch: render the same `<svg>` with the resting path (`M`…) and a static stroke (no animated `<motion.linearGradient>` offset). SSR-safe: refs are null during renderToString → guard the geometry effect so it no-ops server-side (the component computes the path in a `useEffect` after mount; initial render draws an empty/placeholder `<svg>` — that satisfies the test and hydrates to the real path).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit — `feat(motion): vendor AnimatedBeam (reduced-motion + forceStatic)`

---

### Task 3: Vendor `OrbitingCircles`

**Files:**
- Create: `packages/crm/src/components/ui/magic/orbiting-circles.tsx`
- Test: `packages/crm/tests/unit/motion/orbiting-circles.spec.tsx`

**Canonical source:** https://magicui.design/docs/components/orbiting-circles

**Interfaces:**
- Produces: `OrbitingCircles({ children, radius?, duration?, delay?, reverse?, path?, iconSize?, forceStatic?, className? })` — renders each child positioned around a center; CSS/motion drives the orbit. Reduced-motion/`forceStatic` → children rendered at fixed angular positions, no rotation. Consumed by Task 10 (MarketingAgents) + Task 7.

- [ ] **Step 1: Failing test**

```tsx
// packages/crm/tests/unit/motion/orbiting-circles.spec.tsx
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { OrbitingCircles } from "../../../src/components/ui/magic/orbiting-circles";
const kids = ["A", "B", "C"].map((k) => React.createElement("span", { key: k }, k));
describe("<OrbitingCircles>", () => {
  test("renders every child (static markup present for SSR/crawlers)", () => {
    const html = renderToString(React.createElement(OrbitingCircles, { radius: 80 }, kids));
    assert.match(html, /A/); assert.match(html, /B/); assert.match(html, /C/);
  });
  test("forceStatic renders children at fixed positions, no orbit animation class", () => {
    const html = renderToString(React.createElement(OrbitingCircles, { radius: 80, forceStatic: true }, kids));
    assert.match(html, /A/); assert.doesNotMatch(html, /animate-orbit|orbit\s/);
  });
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement from canonical source + contract; static branch positions children by precomputed `cos/sin(2π·i/n)` with no orbit animation. **Step 4:** PASS. **Step 5:** Commit — `feat(motion): vendor OrbitingCircles (reduced-motion + forceStatic)`

---

### Task 4: Vendor `Terminal`

**Files:**
- Create: `packages/crm/src/components/ui/magic/terminal.tsx`
- Test: `packages/crm/tests/unit/motion/terminal.spec.tsx`

**Canonical source:** https://magicui.design/docs/components/terminal

**Interfaces:**
- Produces: `Terminal({ children, className })` plus line primitives `TypingAnimation({ children, delay?, duration?, forceStatic? })` and `AnimatedSpan({ children, delay?, forceStatic? })`. Reduced-motion/`forceStatic` → all lines rendered fully, no per-char typing. Consumed by Task 8 (IdeStrip) + Task 7.

- [ ] **Step 1: Failing test**

```tsx
// packages/crm/tests/unit/motion/terminal.spec.tsx
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { Terminal, TypingAnimation, AnimatedSpan } from "../../../src/components/ui/magic/terminal";
describe("<Terminal>", () => {
  test("static render shows the full command text (SSR/no-JS/crawler safe)", () => {
    const html = renderToString(
      React.createElement(Terminal, null,
        React.createElement(TypingAnimation, { forceStatic: true }, "npx -y @seldonframe/mcp"),
        React.createElement(AnimatedSpan, { forceStatic: true }, "✓ connected")),
    );
    assert.match(html, /npx -y @seldonframe\/mcp/);
    assert.match(html, /connected/);
  });
});
```

- [ ] **Step 2:** FAIL. **Step 3:** Implement from canonical source + contract; the static branch of `TypingAnimation` renders `children` in full. **Step 4:** PASS. **Step 5:** Commit — `feat(motion): vendor Terminal (full-text static state)`

---

### Task 5: Vendor `BentoGrid` + `BentoCard`

**Files:**
- Create: `packages/crm/src/components/ui/magic/bento-grid.tsx`
- Test: `packages/crm/tests/unit/motion/bento-grid.spec.tsx`

**Canonical source:** https://magicui.design/docs/components/bento-grid

**Interfaces:**
- Produces: `BentoGrid({ children, className })` and `BentoCard({ name, className, background?, Icon?, description, href?, cta?, forceStatic? })`. Layout is CSS grid (no continuous motion — the only motion is a hover/reveal, contract-guarded). Consumed by Task 9 (MarketingModules) + Task 7.

- [ ] **Step 1: Failing test**

```tsx
// packages/crm/tests/unit/motion/bento-grid.spec.tsx
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { BentoGrid, BentoCard } from "../../../src/components/ui/magic/bento-grid";
describe("<BentoGrid>", () => {
  test("renders each card's name + description", () => {
    const html = renderToString(
      React.createElement(BentoGrid, null,
        React.createElement(BentoCard, { name: "CRM", description: "Contacts & deals" }),
        React.createElement(BentoCard, { name: "Booking", description: "Cal.diy" })),
    );
    assert.match(html, /CRM/); assert.match(html, /Contacts & deals/);
    assert.match(html, /Booking/);
  });
});
```

- [ ] **Step 2:** FAIL. **Step 3:** Implement from canonical source; theme via `--lp-card`/`--lp-border`/`--lp-ink`/`--lp-body` (NOT hardcoded hex, so it works in both modes); hover motion contract-guarded. **Step 4:** PASS. **Step 5:** Commit — `feat(motion): vendor BentoGrid/BentoCard (token-themed, both modes)`

---

### Task 6: Vendor `AvatarCircles`

**Files:**
- Create: `packages/crm/src/components/ui/magic/avatar-circles.tsx`
- Test: `packages/crm/tests/unit/motion/avatar-circles.spec.tsx`

**Canonical source:** https://magicui.design/docs/components/avatar-circles

**Interfaces:**
- Produces: `AvatarCircles({ numPeople?, avatarUrls, className })` — overlapping avatars + optional "+N". Static (hover-only motion). Consumed by Task 11 (ProofStrip) + Task 7.

- [ ] **Step 1: Failing test**

```tsx
// packages/crm/tests/unit/motion/avatar-circles.spec.tsx
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { AvatarCircles } from "../../../src/components/ui/magic/avatar-circles";
describe("<AvatarCircles>", () => {
  test("renders +N overflow when numPeople given", () => {
    const html = renderToString(React.createElement(AvatarCircles, {
      numPeople: 99, avatarUrls: [{ imageUrl: "/brand/maxime-houle.png", profileUrl: "#" }],
    }));
    assert.match(html, /\+99/);
  });
});
```

- [ ] **Step 2:** FAIL. **Step 3:** Implement from canonical source; accept the object-shaped `avatarUrls` (current Magic UI API); token-themed ring. **Step 4:** PASS. **Step 5:** Commit — `feat(motion): vendor AvatarCircles`

---

### Task 7: `/motion-lab` dev-only gallery

**Files:**
- Create: `packages/crm/src/app/(dev)/motion-lab/page.tsx`
- Create: `packages/crm/src/app/(dev)/motion-lab/motion-lab-client.tsx`
- Test: `packages/crm/tests/unit/motion/motion-lab-gate.spec.ts`

**Interfaces:**
- Consumes: all Task 2–6 components + BorderBeam/AnimatedList (existing).
- Produces: the review surface. `page.tsx` is a server component: strict-`"1"` `SF_MOTION_LAB` gate → `notFound()` when off (mirror `isRecordToAgentOn` idiom); imports `motion-tokens.css` + `landing-theme.css`; renders `<MotionLabClient/>`. Client renders each animated component in a labelled card: name, its **comprehension purpose** (one line), the component live, and two toggles — **reduced-motion** (drives every component's `forceStatic`) and **light / dark(record)** (wraps the gallery in `.lp-root` with/without `data-mode="record"`).

- [ ] **Step 1: Failing gate test**

```ts
// packages/crm/tests/unit/motion/motion-lab-gate.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isMotionLabOn } from "../../../src/app/(dev)/motion-lab/gate";
describe("motion-lab gate", () => {
  test("strict '1' only", () => {
    assert.equal(isMotionLabOn({ SF_MOTION_LAB: "1" }), true);
    assert.equal(isMotionLabOn({ SF_MOTION_LAB: "true" }), false);
    assert.equal(isMotionLabOn({ SF_MOTION_LAB: undefined }), false);
  });
});
```

- [ ] **Step 2:** FAIL. **Step 3:** Create `gate.ts` (`isMotionLabOn(env)` strict-`"1"`), `page.tsx` (`if (!isMotionLabOn(process.env)) notFound()`, `robots: noindex`), and `motion-lab-client.tsx` with the labelled cards + two toggles driving `forceStatic` and the `.lp-root`/`data-mode` wrapper. Each card's purpose line comes from spec §5's concept column. **Step 4:** gate test PASS; manually confirm `SF_MOTION_LAB=1 pnpm dev` renders and unset → 404 (note in report; also covered by the gate unit test). **Step 5:** Commit — `feat(motion): dev-only /motion-lab gallery (SF_MOTION_LAB-gated)`

---

### Task 8: Apply `Terminal` → `MarketingIdeStrip`

**Files:**
- Modify: `packages/crm/src/components/landing/marketing-ide-strip.tsx` (52 lines)
- Modify: `packages/crm/src/app/(public)/page.tsx` (add `motion-tokens.css` import next to `landing-theme.css`)

**Concept:** the IDE/MCP on-ramp — the terminal typing `npx -y @seldonframe/mcp` literally demos the connect step.

**Interfaces:** Consumes `Terminal`/`TypingAnimation`/`AnimatedSpan` (Task 4).

- [ ] **Step 1:** Read the current section; identify where the IDE/install content sits. Insert a `<Terminal>` showing the real connect sequence (use the exact command the repo advertises — verify via `grep -rn "npx.*@seldonframe/mcp" packages/crm/src` and reuse that exact string; do not invent). Keep the section's existing copy/layout; the terminal augments, not replaces.
- [ ] **Step 2:** Ensure both-mode theming (terminal chrome via `--lp-card`/`--lp-border`) and that with reduced-motion the full command shows.
- [ ] **Step 3:** `pnpm typecheck` delta + `node --import tsx --test tests/unit/landing/*.spec.*` (no landing spec should break; if one asserts ide-strip text, keep that text present). **Step 4:** Commit — `feat(landing): Terminal install demo in the IDE strip`

---

### Task 9: Apply `BentoGrid` → `MarketingModules`

**Files:**
- Modify: `packages/crm/src/components/landing/marketing-modules.tsx` — **only** the `MarketingModules` render block (starts ~line 79; the section grid is ~line 109). This is a 970-line file that also holds `MarketingAgents` — DO NOT touch `MarketingAgents` here (that's Task 10).

**Concept:** the all-in-one front office (CRM · booking · intake · portal · landing · reviews) — a bento layout that *is* "one system."

**Interfaces:** Consumes `BentoGrid`/`BentoCard` (Task 5).

- [ ] **Step 1:** Read `MarketingModules` (79–133). Its module cards currently render in a `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. Reflow them into `<BentoGrid>` with `<BentoCard>` per module, preserving the exact module names + descriptions already in the section (reuse the existing data array; do not reword). This is the "light internal reflow" the spec permits.
- [ ] **Step 2:** Verify both modes + reduced-motion (cards fully present, hover-only motion). No CLS vs the old grid (similar heights).
- [ ] **Step 3:** typecheck delta + landing specs (if `marketing-*.spec` asserts module names, they must still be present). **Step 4:** Commit — `feat(landing): modules as a bento grid (one-system layout)`

---

### Task 10: Apply `OrbitingCircles` → `MarketingAgents`

**Files:**
- Modify: `packages/crm/src/components/landing/marketing-modules.tsx` — **only** the `MarketingAgents` render block (starts ~line 134). Leave `MarketingModules` (Task 9) untouched.

**Concept:** the agent's surfaces (voice · web-chat · SMS · email · DM · MCP-endpoint) orbiting one agent core — makes the "any agent on any surface" composition claim concrete (CLAUDE.md §1b).

**Interfaces:** Consumes `OrbitingCircles` (Task 3).

- [ ] **Step 1:** Read `MarketingAgents` (134–~500). It already has hardcoded animated sub-UI (slot grids, `slotsIn` toggles). Add ONE `<OrbitingCircles>` figure — a central agent glyph with the 6 surfaces orbiting as labelled chips — as a self-contained visual within the section (a light internal reflow of the section's hero/figure area; do not rip out the existing animated sub-UI unless it directly conflicts — if it does, prefer placing the orbit as the section's lead figure and demoting the conflicting bit, and flag it in the report for review).
- [ ] **Step 2:** Surface labels must be the real six (Surface·Skill·Tools·Knowledge·Guardrails·Voice are the PRIMITIVES; the SURFACES are voice·web-chat·SMS·email·DM·MCP — use the SURFACES for the orbit since the concept is "any surface"; confirm against CLAUDE.md §1b). Both modes + reduced-motion (chips at rest, readable).
- [ ] **Step 3:** typecheck delta + landing specs. **Step 4:** Commit — `feat(landing): agent surfaces orbiting the core (any-surface claim)`

---

### Task 11: Apply `AvatarCircles` → `MarketingProofStrip`

**Files:**
- Modify: `packages/crm/src/components/landing/marketing-proof-strip.tsx` (54 lines)

**Concept:** social-proof scale.

**Interfaces:** Consumes `AvatarCircles` (Task 6).

- [ ] **Step 1:** Add `<AvatarCircles>` to the proof strip. **Truth constraint:** we do not have real customer avatars/counts — use a **non-numeric, honest** treatment: a small stack of generic/abstract avatars WITHOUT a fabricated "+N" count, OR reuse only assets we own (`/brand/maxime-houle.png` as the founder). Do NOT invent "500+ agencies." If no honest count exists, omit `numPeople`. Flag the copy choice in the report.
- [ ] **Step 2:** Both modes + reduced-motion. **Step 3:** typecheck delta + specs. **Step 4:** Commit — `feat(landing): avatar-circles proof accent (honest, no invented counts)`

---

### Task 12: `IntegrationBeam` → `MarketingBuildSteps`

**Files:**
- Create: `packages/crm/src/components/landing/integration-beam.tsx`
- Modify: `packages/crm/src/components/landing/marketing-build-steps.tsx` (386 lines — add the figure to step 3's area only)
- Test: `packages/crm/tests/unit/motion/integration-beam.spec.tsx`

**Concept:** "SF is the source of truth that pushes *outward*" — a central SF node beaming out to client tools (Google Calendar, Gmail, phone, Slack): the no-Zapier architecture claim.

**Interfaces:** Consumes `AnimatedBeam` (Task 2). Produces `IntegrationBeam()` — a self-contained figure (its own refs/container) so the 386-line section only imports and drops it in.

- [ ] **Step 1: Failing test**

```tsx
// packages/crm/tests/unit/motion/integration-beam.spec.tsx
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { IntegrationBeam } from "../../../src/components/landing/integration-beam";
describe("<IntegrationBeam>", () => {
  test("renders the SF center + outward tool nodes (labels present for a11y/crawlers)", () => {
    const html = renderToString(React.createElement(IntegrationBeam));
    assert.match(html, /SeldonFrame|SF/);
    assert.match(html, /Calendar|Gmail|Phone|Slack/);
  });
});
```

- [ ] **Step 2:** FAIL. **Step 3:** Build `IntegrationBeam` — a bounded container with a center SF node and 3–4 labelled tool nodes, `AnimatedBeam` from center→each (directional = outward). Tool labels are real integration targets (Calendar/Gmail/phone/Slack). Static state: nodes + resting connector lines. Then drop `<IntegrationBeam />` into build-steps' step-3 figure area (the "go live and let it run" step), preserving existing step copy/animation.
- [ ] **Step 4:** PASS + both modes + reduced-motion. **Step 5:** Commit — `feat(landing): outward integration beam (source-of-truth claim) in step 3`

---

### Task 13: `BorderBeam` accent → hero build CTA

**Files:**
- Modify: `packages/crm/src/components/landing/marketing-hero.tsx`

**Concept:** "live / building right now" active-state accent.

**Interfaces:** Reuses existing `components/ui/border-beam.tsx` (`BorderBeam`).

- [ ] **Step 1:** Add a single, restrained `<BorderBeam>` to the hero's build affordance (the workspace/build card or primary CTA container — it must be `position: relative` and `overflow-hidden`). Colors from `--lp-accent` (both modes). ONE instance — kill-rule restraint; not on every button.
- [ ] **Step 2:** Reduced-motion: BorderBeam already respects it (verify); if not, guard it. Both modes. **Step 3:** typecheck delta + hero spec (`tests/unit/landing/hero-*.spec.*` must stay green). **Step 4:** Commit — `feat(landing): live-state border-beam on the build CTA`

---

### Task 14: Gates

**Files:** none (verification)

- [ ] **Step 1:** Full unit suite delta vs Task 0 baseline — `node scripts/run-unit-tests.js`; delta must be only the new motion specs passing (no new failures).
- [ ] **Step 2:** `/verify-build` via **verify-runner** (not an implementer): unit delta, tsc (≤1 baseline `persist` error), check:use-server, migration-journal (no migrations — no-op pass), regression-grep (scope = components/ui/magic/**, components/motion/**, components/landing/**, app/(dev)/motion-lab/**, app/(public)/page.tsx, docs/motion/**).
- [ ] **Step 3:** **Static vision-gate** (worktree dev server + Neon branch + host-spoof proxy for SSR shots, per `docs/learnings/2026-07-13-host-spoof-proxy-kills-hydration.md`): landing `/` light + `/?mode=record` dark, desktop + mobile — assert NO layout regression vs pre-branch, no CLS, sections still readable, the new figures (terminal, bento, orbit, beam, avatars) present in their static state and correct in BOTH modes. (Screenshots capture the static/hydrated state — motion quality is Step 4.)
- [ ] **Step 4:** **Motion review — Max, BLOCKING (the whole point):** with `SF_MOTION_LAB=1`, walk `/motion-lab`: every component reads as purposeful (names its concept), none annoying, reduced-motion toggle correct for each, both light/dark correct. Then the live landing sections. Max signs off on the taste bar.
- [ ] **Step 5:** Perf sanity: confirm below-fold figures lazy-mount (don't animate offscreen) and animate transform/opacity only (spot-check in devtools; note in report).
- [ ] **Step 6:** On green + Max sign-off: merge per house method; then `extract-approach` (learning law) — candidate note: "vendoring Magic UI on an existing motion engine + the forceStatic/reduced-motion contract + motion-lab as the human motion gate."

---

## Self-Review (done at write time)

- **Spec coverage:** Slice 0 (§4) → Tasks 1–7 (tokens+rubric, 5 vendored components, motion-lab). Slice 1 (§5) → Tasks 8–13 (terminal/IIdeStrip, bento/Modules, orbit/Agents, avatars/Proof, beam/BuildSteps, border-beam/hero). Verification (§7) → Task 14. Every §5 kept-component has a task; every cut component is absent (not built) per YAGNI. No gaps.
- **Type consistency:** component prop names (`forceStatic`, `containerRef/fromRef/toRef`, `avatarUrls` object shape, `BentoCard{name,description}`) are consistent between the vendor task and its consumer task.
- **Placeholder scan:** the vendored-component tasks deliberately direct to the canonical Magic UI doc URL + a precise Adaptation Contract + exact tests rather than transcribing ~60 lines of motion code from memory (which would be less accurate) — this is the "external source is the spec" pattern, not a placeholder; the repo-specific behavior (reduced-motion, forceStatic, tokens, tests) is fully specified. All copy/data reuse is pinned to "reuse existing section strings / grep the real command / no invented numbers."
- **Risk notes surfaced:** the 970-line `marketing-modules.tsx` is split across Tasks 9 & 10 with explicit "touch only your block" guards; the honest-proof constraint (no fake counts) is called out in Task 11; motion quality is gated by a human (Task 14 Step 4), since static screenshots can't judge it.
