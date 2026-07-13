# Dual-Path Landing + Dark Record Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the `/record` entry point into the seldonframe.com landing as a second hero on-ramp ("From your website" / "From a recording") with an in-place light→dark theme flip, fix `/record`'s readability and logo, and make `/record` an indexable dark sales page — all per the approved spec `docs/superpowers/specs/2026-07-13-dual-path-landing-record-mode-design.md`.

**Architecture:** A landing-scoped CSS-variable token layer (`.lp-root`, light values default, warm-dark under `[data-mode="record"]`) lets shared chrome (nav/footer/pricing/final-CTA) re-theme with zero JS. A client `LandingModeShell` owns the mode state, the `data-mode` attribute, and cosmetic URL updates; build and record section stacks are server-rendered children. The existing 778-line `record-client.tsx` machinery is **reused, not rewritten** — only its outer page shell and hero copy move out.

**Tech Stack:** Next.js App Router (packages/crm), Tailwind (arbitrary values), node:test + tsx via `node scripts/run-unit-tests.js`, renderToString + jsdom (`tests/setup-dom.ts`) for component tests.

## Global Constraints

- **Branch:** fresh branch `feat/dual-path-landing` off `origin/main` — NOT off `feat/guides-rewrite-all`. Cherry-pick the spec/plan docs commit(s) from `feat/guides-rewrite-all` onto it first.
- **Reuse, don't rebuild:** `record-client.tsx`, `recorder-machine.ts`, `capture.ts`, `capture-file.ts`, service worker, claim flow are live-validated. Behavior-preserving edits only; no logic rewrites.
- **Blast radius:** token refactor touches ONLY `components/landing/*`, `app/(public)/record/*`, `app/(public)/page.tsx`, `app/(public)/unified-landing.tsx`, `app/sitemap.ts`. No dashboard/global token changes.
- **Readability floor (record mode):** body ≥ 16px, labels/meta ≥ 13.5px, line-height ≥ 1.55, all text ≥ WCAG AA 4.5:1. The `rgba(231,229,222,.35/.4/.45)` text alphas are banned. (Purely decorative numerals inside ≥22px chips may stay 12px.)
- **One green:** light accent `#00897B`, dark accent `#1FAE85`. Teal `#14B8A6`/`#2DD4BF` retire from the record surface.
- **Flag contract unchanged:** `SF_RECORD_TO_AGENT` off ⇒ no record toggle on `/`, `?mode=record` ignored, `/record` 404s. Strict-`"1"` check via existing `isRecordToAgentOn` (`src/lib/recordings/policy.ts`).
- **Truth-pass on all new copy:** every claim in record-mode sections must describe SHIPPED, flag-on behavior. Do not promise supervised-run/lifecycle/marketplace features that sit behind dark flags.
- **Copy:** hero H1 stays "Show Seldon how you work. It builds the agent." Toggle labels exactly "From your website" / "From a recording".
- **Tests:** unit suite has a known pre-existing failure baseline — judge by delta vs a stash-run on the same worktree (house rule). Single-spec runs: `node --import tsx --test <spec-path>` from `packages/crm/`.
- **Commit style:** conventional commits, one per task, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure (locked)

```
packages/crm/src/
  components/landing/
    landing-theme.css            NEW  token definitions + mode transition + CSS-only mode visibility helpers
    landing-mode.tsx             NEW  LandingModeShell + LandingModeContext + useLandingMode + HeroModeSwitch
    brand-mark.tsx               NEW  canonical logo (icon SVG asset + wordmark), token-colored
    record/record-hero.tsx       NEW  dark hero: badge/H1/sub + HeroModeSwitch + RecordClient mount
    record/record-steps.tsx      NEW  3-step how-it-works (readable sizes)
    record/record-what-you-get.tsx NEW bridge section (same product outcome)
    record/record-proof.tsx      NEW  recording-timeline → agent-card figure
    record/record-faq.tsx        NEW  record FAQ + FAQPage JSON-LD gated by withSchema
    marketing-nav.tsx            MOD  BrandMark, tokens, record-mode chip
    marketing-footer.tsx         MOD  tokens, record-mode privacy line
    marketing-hero.tsx           MOD  HeroModeSwitch above URL/Describe tabs
    marketing-pricing-section.tsx MOD tokens
    marketing-final-cta.tsx      MOD  tokens + per-mode copy prop
  app/(public)/
    landing-mode.ts              NEW  resolveLandingMode() pure helper
    unified-landing.tsx          NEW  server composition shared by / and /record
    page.tsx                     MOD  flags + searchParams → UnifiedLanding
    record/page.tsx              MOD  gate+auth+params → UnifiedLanding(record), indexable metadata
    record/record-client.tsx     MOD  shell/hero copy removed → surface-only render + token/readability sweep
    record/record-ui/*.tsx       MOD  token/readability sweep (mapping table)
  app/sitemap.ts                 MOD  add /record entry
packages/crm/tests/unit/landing/
    landing-mode.spec.ts         NEW  resolveLandingMode
    landing-mode-shell.spec.tsx  NEW  shell SSR + toggle behavior (jsdom)
    brand-mark.spec.tsx          NEW  canonical asset renders
    record-faq.spec.tsx          NEW  JSON-LD gating
packages/crm/tests/unit/recordings/
    record-page-render.spec.ts   MOD  assertions follow the extraction
```

---

### Task 0: Worktree + branch setup

**Files:** none (git only)

- [ ] **Step 1: Create the worktree off origin/main** (use `superpowers:using-git-worktrees` if executing with subagents)

```bash
cd "/c/Users/maxim/CascadeProjects/Seldon Frame"
git fetch origin
git worktree add .claude/worktrees/dual-path-landing -b feat/dual-path-landing origin/main
cd .claude/worktrees/dual-path-landing
```

- [ ] **Step 2: Bring the spec + this plan onto the branch**

```bash
# the docs commit(s) live on feat/guides-rewrite-all
git log feat/guides-rewrite-all --oneline -3 -- docs/superpowers/specs/2026-07-13-dual-path-landing-record-mode-design.md docs/superpowers/plans/2026-07-13-dual-path-landing-record-mode.md
git cherry-pick <those-sha(s)>
```

- [ ] **Step 3: Node modules junction (house rule for worktrees)** — per `worktree-typecheck-method` memory, junction `packages/crm/node_modules` into the worktree (PowerShell `New-Item -ItemType Junction`), and re-verify it exists before every typecheck run.

- [ ] **Step 4: Baseline test run (for delta judgment)**

```bash
node scripts/run-unit-tests.js > /tmp/baseline-tests.txt 2>&1; tail -5 /tmp/baseline-tests.txt
```
Record the pass/fail counts — every later task is judged by delta against this.

---

### Task 1: `resolveLandingMode` pure helper

**Files:**
- Create: `packages/crm/src/app/(public)/landing-mode.ts`
- Test: `packages/crm/tests/unit/landing/landing-mode.spec.ts`

**Interfaces:**
- Produces: `type LandingMode = "build" | "record"`; `resolveLandingMode(modeParam: string | string[] | undefined, recordEnabled: boolean): LandingMode`. Consumed by Task 9 (`page.tsx`) and re-exported type consumed by Tasks 2/6/9/10.

- [ ] **Step 1: Write the failing test**

```ts
// packages/crm/tests/unit/landing/landing-mode.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveLandingMode } from "../../../src/app/(public)/landing-mode";

describe("resolveLandingMode", () => {
  test("?mode=record with flag on → record", () => {
    assert.equal(resolveLandingMode("record", true), "record");
  });
  test("?mode=record with flag OFF → build (flag contract)", () => {
    assert.equal(resolveLandingMode("record", false), "build");
  });
  test("absent / unknown / array params → build", () => {
    assert.equal(resolveLandingMode(undefined, true), "build");
    assert.equal(resolveLandingMode("banana", true), "build");
    assert.equal(resolveLandingMode(["record", "record"], true), "build");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (module not found)

```bash
cd packages/crm && node --import tsx --test tests/unit/landing/landing-mode.spec.ts
```

- [ ] **Step 3: Implement**

```ts
// packages/crm/src/app/(public)/landing-mode.ts
//
// Pure mode resolution for the dual-path landing (spec 2026-07-13).
// Server-safe: no React, no env reads — the caller passes the flag.

export type LandingMode = "build" | "record";

export function resolveLandingMode(
  modeParam: string | string[] | undefined,
  recordEnabled: boolean,
): LandingMode {
  if (!recordEnabled) return "build";
  return modeParam === "record" ? "record" : "build";
}
```

- [ ] **Step 4: Run test — expect PASS**
- [ ] **Step 5: Commit** — `feat(landing): resolveLandingMode helper for dual-path hero`

---

### Task 2: Token layer + `LandingModeShell` + `HeroModeSwitch`

**Files:**
- Create: `packages/crm/src/components/landing/landing-theme.css`
- Create: `packages/crm/src/components/landing/landing-mode.tsx`
- Test: `packages/crm/tests/unit/landing/landing-mode-shell.spec.tsx`

**Interfaces:**
- Consumes: `LandingMode` from Task 1.
- Produces:
  - CSS custom properties `--lp-bg --lp-card --lp-border --lp-border-soft --lp-ink --lp-body --lp-muted --lp-faint --lp-accent --lp-accent-strong --lp-accent-soft --lp-on-accent --lp-cta-bg --lp-cta-ink` (used by every later task).
  - CSS helper classes `.lp-record-only` / `.lp-build-only` (display gated by `[data-mode]` — for server components like nav/footer that can't read context).
  - `LandingModeShell({ initialMode, recordEnabled, urlStrategy, nav, buildStack, recordStack, footer })` (client).
  - `useLandingMode(): { mode, recordEnabled, setMode }` and `HeroModeSwitch()` (client, context-bound; rendered by Tasks 6 and 8's hero edits).

- [ ] **Step 1: Write the token stylesheet**

```css
/* packages/crm/src/components/landing/landing-theme.css
   Landing-scoped theme tokens (spec §3.1). Light = warm parchment
   (values copied from the shipped landing); dark = "parchment with the
   lights off" under [data-mode="record"]. LANDING SURFACE ONLY —
   never import outside components/landing/ or app/(public)/. */

.lp-root {
  --lp-bg: #F6F2EA;
  --lp-card: #FFFDFA;
  --lp-border: rgba(34, 29, 23, 0.14);
  --lp-border-soft: rgba(34, 29, 23, 0.08);
  --lp-ink: #221D17;
  --lp-body: #6E665A;
  --lp-muted: #6E665A;
  --lp-faint: #9A9183;
  --lp-accent: #00897B;
  --lp-accent-strong: #00796B;
  --lp-accent-soft: rgba(0, 137, 123, 0.12);
  --lp-on-accent: #FFFDFA;
  --lp-cta-bg: #1F2B24;
  --lp-cta-ink: #F6F2EA;
  transition: background-color 0.4s ease, color 0.4s ease;
}

.lp-root[data-mode="record"] {
  --lp-bg: #14110D;
  --lp-card: #1F1A15;
  --lp-border: rgba(246, 242, 234, 0.16);
  --lp-border-soft: rgba(246, 242, 234, 0.10);
  --lp-ink: #F6F2EA;
  --lp-body: #C9C2B6;   /* ~9:1 on --lp-bg */
  --lp-muted: #A39B8D;  /* ~6.5:1 — the contrast floor */
  --lp-faint: #8A8275;  /* kbd hints only, ~4.9:1 */
  --lp-accent: #1FAE85;
  --lp-accent-strong: #27C495;
  --lp-accent-soft: rgba(31, 174, 133, 0.16);
  --lp-on-accent: #14110D;
  --lp-cta-bg: #F6F2EA;
  --lp-cta-ink: #1F2B24;
}

/* Mode-gated visibility for SERVER components (nav chip, footer line)
   that cannot read the client context. */
.lp-record-only { display: none; }
.lp-root[data-mode="record"] .lp-record-only { display: inline-flex; }
.lp-root[data-mode="record"] .lp-build-only { display: none; }

/* Incoming stack crossfade on flip. */
@keyframes lp-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.lp-stack { animation: lp-fade-in 0.35s ease; }
@media (prefers-reduced-motion: reduce) {
  .lp-root { transition: none; }
  .lp-stack { animation: none; }
}
```

- [ ] **Step 2: Write the failing shell test**

```tsx
// packages/crm/tests/unit/landing/landing-mode-shell.spec.tsx
// jsdom bootstrap MUST be the first import (green-main lesson: unwired
// setup-dom was the root of 16 "stale UI" CI failures).
import "../../setup-dom";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { LandingModeShell } from "../../../src/components/landing/landing-mode";

function shell(initialMode: "build" | "record", recordEnabled = true) {
  return renderToString(
    React.createElement(LandingModeShell, {
      initialMode,
      recordEnabled,
      urlStrategy: "replace-state",
      nav: React.createElement("div", null, "NAV"),
      buildStack: React.createElement("div", null, "BUILD-STACK"),
      recordStack: React.createElement("div", null, "RECORD-STACK"),
      footer: React.createElement("div", null, "FOOTER"),
    }),
  );
}

describe("<LandingModeShell> SSR", () => {
  test("build mode: data-mode=build, record stack NOT mounted", () => {
    const html = shell("build");
    assert.match(html, /data-mode="build"/);
    assert.match(html, /BUILD-STACK/);
    assert.doesNotMatch(html, /RECORD-STACK/);
  });
  test("record mode SSRs dark with record stack mounted (no-flash contract)", () => {
    const html = shell("record");
    assert.match(html, /data-mode="record"/);
    assert.match(html, /RECORD-STACK/);
  });
  test("flag off forces build even when initialMode=record", () => {
    const html = shell("record", false);
    assert.match(html, /data-mode="build"/);
    assert.doesNotMatch(html, /RECORD-STACK/);
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (`node --import tsx --test tests/unit/landing/landing-mode-shell.spec.tsx` from `packages/crm/`)

- [ ] **Step 4: Implement the shell + switch**

```tsx
// packages/crm/src/components/landing/landing-mode.tsx
//
// Client shell for the dual-path landing (spec 2026-07-13 §3.2).
// Owns: mode state, the data-mode attribute the token layer keys off,
// and the cosmetic URL update. Build/record stacks arrive as
// server-rendered children — this file adds no section content.
//
// URL strategy: on `/` the flip is instant client state +
// history.replaceState (no Next navigation — a router.push round-trip
// would delay the flip). On `/record`, flipping back to the website
// path is a real navigation to `/` (you arrived on a deep link).

"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Globe } from "lucide-react";
import type { LandingMode } from "@/app/(public)/landing-mode";
import "./landing-theme.css";

const LandingModeContext = createContext<{
  mode: LandingMode;
  recordEnabled: boolean;
  setMode: (next: LandingMode) => void;
} | null>(null);

export function useLandingMode() {
  const ctx = useContext(LandingModeContext);
  if (!ctx) throw new Error("useLandingMode must render inside <LandingModeShell>");
  return ctx;
}

export function LandingModeShell({
  initialMode,
  recordEnabled,
  urlStrategy,
  nav,
  buildStack,
  recordStack,
  footer,
}: {
  initialMode: LandingMode;
  recordEnabled: boolean;
  /** "replace-state" on /, "navigate-home" on /record */
  urlStrategy: "replace-state" | "navigate-home";
  nav: ReactNode;
  buildStack: ReactNode;
  recordStack: ReactNode;
  footer: ReactNode;
}) {
  const [mode, setModeState] = useState<LandingMode>(recordEnabled ? initialMode : "build");

  const setMode = useCallback(
    (next: LandingMode) => {
      if (next === "record" && !recordEnabled) return;
      if (next === "build" && urlStrategy === "navigate-home") {
        window.location.assign("/");
        return;
      }
      setModeState(next);
      if (urlStrategy === "replace-state") {
        window.history.replaceState(null, "", next === "record" ? "/?mode=record" : "/");
      }
    },
    [recordEnabled, urlStrategy],
  );

  return (
    <LandingModeContext.Provider value={{ mode, recordEnabled, setMode }}>
      <div
        data-mode={mode}
        className="lp-root min-h-screen bg-[var(--lp-bg)] text-[var(--lp-ink)] selection:bg-[var(--lp-accent)]/20 selection:text-[var(--lp-accent)]"
      >
        {nav}
        <main id="main-content">
          {/* Build stack stays mounted-but-hidden so hero input state
              survives a round-trip flip; record stack mounts on demand
              so its client bundle doesn't hydrate on the default view. */}
          <div hidden={mode !== "build"} className="lp-stack">
            {buildStack}
          </div>
          {mode === "record" ? <div className="lp-stack">{recordStack}</div> : null}
        </main>
        {footer}
      </div>
    </LandingModeContext.Provider>
  );
}

/** Segmented two-mode control — renders at the top of BOTH hero cards
 *  (build: marketing-hero form card; record: record-hero card).
 *  Null when the record flag is off: the landing looks exactly as today. */
export function HeroModeSwitch() {
  const { mode, recordEnabled, setMode } = useLandingMode();
  if (!recordEnabled) return null;

  const base =
    "inline-flex h-[38px] items-center justify-center gap-2 rounded-[8px] px-3 text-[13.5px] transition-colors";
  const active = "bg-[var(--lp-card)] font-[600] text-[var(--lp-ink)] shadow-[0_1px_3px_rgba(0,0,0,.14)]";
  const idle = "font-[500] text-[var(--lp-muted)] hover:text-[var(--lp-ink)]";

  return (
    <div
      role="tablist"
      aria-label="How do you want to show Seldon your business?"
      className="grid w-full grid-cols-2 gap-1 rounded-[12px] border border-[var(--lp-border-soft)] bg-[var(--lp-bg)] p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "build"}
        onClick={() => setMode("build")}
        className={`${base} ${mode === "build" ? active : idle}`}
      >
        <Globe size={14} className="shrink-0" aria-hidden />
        From your website
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "record"}
        onClick={() => setMode("record")}
        className={`${base} ${mode === "record" ? active : idle}`}
      >
        <span className="size-2 shrink-0 rounded-full bg-[#E5484D]" aria-hidden />
        From a recording
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Run tests — expect PASS**
- [ ] **Step 6: Commit** — `feat(landing): token layer + LandingModeShell + HeroModeSwitch`

---

### Task 3: `BrandMark` + nav migration

**Files:**
- Create: `packages/crm/src/components/landing/brand-mark.tsx`
- Modify: `packages/crm/src/components/landing/marketing-nav.tsx` (brand block ~lines 76-95; color classes throughout)
- Test: `packages/crm/tests/unit/landing/brand-mark.spec.tsx`

**Interfaces:**
- Produces: `BrandMark({ size?: number, withPathChip?: boolean })` — canonical logo asset + wordmark; consumed by Task 4 (footer) and used in nav here.

- [ ] **Step 1: Failing test**

```tsx
// packages/crm/tests/unit/landing/brand-mark.spec.tsx
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { BrandMark } from "../../../src/components/landing/brand-mark";

describe("<BrandMark>", () => {
  test("renders the canonical brand asset, not an inline approximation", () => {
    const html = renderToString(React.createElement(BrandMark));
    assert.match(html, /\/brand\/seldonframe-icon\.svg/);
    assert.match(html, /SeldonFrame/);
  });
  test("withPathChip renders the /record chip (CSS-gated to record mode)", () => {
    const html = renderToString(React.createElement(BrandMark, { withPathChip: true }));
    assert.match(html, /lp-record-only/);
    assert.match(html, /\/record/);
  });
});
```

- [ ] **Step 2: Run — FAIL.** Then implement:

```tsx
// packages/crm/src/components/landing/brand-mark.tsx
//
// THE canonical SeldonFrame mark for the landing surface (spec §3.4).
// Uses the real brand asset (public/brand/seldonframe-icon.svg — its
// #1FAE85 green reads on both parchment and warm-dark), wordmark as
// token-colored text so it re-themes with the mode flip.

import Image from "next/image";

export function BrandMark({
  size = 26,
  withPathChip = false,
}: {
  size?: number;
  withPathChip?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5 leading-none">
      <Image src="/brand/seldonframe-icon.svg" alt="" width={size} height={size} priority />
      <span className="text-[15.5px] font-medium tracking-[-0.01em] text-[var(--lp-ink)]">
        SeldonFrame
      </span>
      {withPathChip ? (
        <span className="lp-record-only font-mono text-[13.5px] text-[var(--lp-muted)]">/record</span>
      ) : null}
    </span>
  );
}
```

- [ ] **Step 3: Migrate `marketing-nav.tsx`.** Replace the inline 26×26 `<svg>` + `<span>SeldonFrame</span>` brand block with `<BrandMark withPathChip />`. Then apply this exact color mapping to every occurrence in the file (mechanical find/replace; verify with the grep in Step 4):

| Old literal | New |
| --- | --- |
| `text-[#221D17]` | `text-[var(--lp-ink)]` |
| `text-[#6E665A]` | `text-[var(--lp-muted)]` |
| `text-[#443E35]` | `text-[var(--lp-ink)]/80` |
| `bg-[#FFFDFA]/90` | `bg-[color-mix(in_oklab,var(--lp-card)_90%,transparent)]` |
| `bg-[#FFFDFA]` | `bg-[var(--lp-card)]` |
| `border-[rgba(34,29,23,.10)]` / `.12` | `border-[var(--lp-border-soft)]` |
| `border-[rgba(34,29,23,.18)]` / `.28` | `border-[var(--lp-border)]` |
| `bg-[#1F2B24]` (Start-for-free pill) | `bg-[var(--lp-cta-bg)]` |
| `text-[#F6F2EA]` (pill text) | `text-[var(--lp-cta-ink)]` |
| `bg-[#00897B]` / `outline-[#00897B]` / `text-[#00897B]` | same class with `var(--lp-accent)` |
| `hover:bg-[rgba(0,137,123,.07)]` | `hover:bg-[var(--lp-accent-soft)]` |

- [ ] **Step 4: Verify no stray hardcoded landing hexes remain in the file**

```bash
grep -nE "#(221D17|6E665A|FFFDFA|1F2B24|00897B|443E35)|rgba\(34,29,23" packages/crm/src/components/landing/marketing-nav.tsx
```
Expected: no matches.

- [ ] **Step 5: Run brand-mark spec + existing `navbar-service-links.spec.ts` — PASS / no delta.**
- [ ] **Step 6: Commit** — `feat(landing): canonical BrandMark + token-aware nav`

---

### Task 4: Footer migration + record privacy line

**Files:**
- Modify: `packages/crm/src/components/landing/marketing-footer.tsx`

**Interfaces:** Consumes `BrandMark` (Task 3) and `.lp-record-only` (Task 2).

- [ ] **Step 1:** Replace any inline logo markup with `<BrandMark size={22} />`; apply the Task 3 color mapping table to all hexes in the file (same table, same grep verification pattern).
- [ ] **Step 2:** Add inside the footer's main row:

```tsx
<span className="lp-record-only items-center text-[13.5px] text-[var(--lp-muted)]">
  Recordings stay private — they train your agent only.
</span>
```

- [ ] **Step 3:** Run existing `tests/unit/landing/footer.spec.ts` — no delta. Visual check deferred to Task 11's vision gate.
- [ ] **Step 4: Commit** — `feat(landing): token-aware footer + record privacy line`

---

### Task 5: record-client extraction + record-ui readability/token sweep

**Files:**
- Modify: `packages/crm/src/app/(public)/record/record-client.tsx` (render section only, ~lines 645-778 on main; state/handlers untouched)
- Modify: `packages/crm/src/app/(public)/record/record-ui/{capture-card,recap-panel,step-strip,traced-list,restored-banner,wait-copy}.tsx`
- Modify test: `packages/crm/tests/unit/recordings/record-page-render.spec.ts`

**Interfaces:**
- Produces: `RecordClient` keeps its exact prop signature `{ claimedSessionId: string | null; claimed: boolean; isAuthed: boolean; sharedFlag?: "1" | "miss" | null }` but now renders ONLY the interactive surface (error/notice lines, StepStrip, RestoredBanner, CaptureCard/TracedList, RecapPanel) — no `<header>`, no `<footer>`, no page background, no hero badge/H1/subhead. Task 6 wraps it.

- [ ] **Step 1: Strip the shell.** In `record-client.tsx`'s return: delete the outer `div.flex.min-h-screen.bg-[#0B0F0E]` wrapper, the top `<header>` (placeholder-logo block), the hero `<header>` copy (badge, H1, subhead — these move to Task 6's `record-hero.tsx`), and the bottom `<footer>`. Keep — in this order — `message` alert, `sharedNotice`, `StepStrip`, and the existing capture/recap two-column layout, inside a single fragment rooted at the current `mx-auto flex w-full max-w-[1100px] flex-col gap-8` div. The `handleStartFresh` `window.location.assign("/record")` stays as-is (it must land back on the record surface).

- [ ] **Step 2: Apply the record-surface mapping table** to `record-client.tsx`'s remaining render AND all six `record-ui/*` files. This is a deterministic find/replace — the left column is the complete inventory of what exists in those files today:

| Old literal | New | Rationale |
| --- | --- | --- |
| `#0B0F0E` (as bg) | `var(--lp-bg)` | warm-dark, not cold |
| `#0B0F0E` (as text on teal buttons) | `var(--lp-on-accent)` | |
| `#052E2B` (as text/bg pair on teal chips) | `var(--lp-on-accent)` / `var(--lp-accent-soft)` per role | |
| `#E7E5DE`, `#F5F4F0` | `var(--lp-ink)` | |
| `#9CA3AF` | `var(--lp-body)` | contrast fix |
| `#6B7280` | `var(--lp-muted)` | contrast fix |
| `#14B8A6` | `var(--lp-accent)` | one green |
| `#2DD4BF` | `var(--lp-accent-strong)` | |
| `#1B2220`, `#0F1413` | `var(--lp-card)` | |
| `rgba(231,229,222,.07)` `.1` `.12` | `var(--lp-border-soft)` | |
| `rgba(231,229,222,.16)` | `var(--lp-border)` | |
| `rgba(231,229,222,.35)` `.4` `.45` **as text** | `var(--lp-muted)` | banned alphas |
| `#EF4444` | keep | 4.6:1 on new bg — passes |

Type-scale floors (same sweep):

| Old | New |
| --- | --- |
| `text-[12px]`, `text-[12.5px]`, `text-[13px]` (labels/meta) | `text-[13.5px]` |
| `text-[14px]` (labels) | `text-[14px]` keep |
| `text-[15px]` (paragraph/body copy) | `text-[16px]` |
| `text-[10px]` (numerals inside ≥22px step chips) | keep `text-[12px]` max — decorative-numeral exception |
| any `leading-` below `1.5` on body copy | `leading-[1.55]` |

- [ ] **Step 3: Verify the sweep is total**

```bash
grep -rnE "#(14B8A6|2DD4BF|0B0F0E|E7E5DE|F5F4F0|9CA3AF|6B7280|052E2B|1B2220|0F1413)|rgba\(231,229,222" "packages/crm/src/app/(public)/record/"
```
Expected: no matches.

- [ ] **Step 4: Update `record-page-render.spec.ts`.** The renderToString harness stays; change assertions that referenced the removed shell/hero (e.g. the H1 text, header/footer strings) to assert the surface still renders: exactly 1 Record button, exactly 1 upload affordance, StepStrip labels present, and — new — `assert.doesNotMatch(html, /min-h-screen/)` (shell is gone).

- [ ] **Step 5: Run** `node --import tsx --test tests/unit/recordings/record-page-render.spec.ts` — PASS; full suite delta = 0 vs baseline.
- [ ] **Step 6: Commit** — `refactor(record): extract RecordClient surface + readability/token sweep`

---

### Task 6: `RecordHero`

**Files:**
- Create: `packages/crm/src/components/landing/record/record-hero.tsx`

**Interfaces:**
- Consumes: `HeroModeSwitch` (Task 2), `RecordClient` props signature (Task 5).
- Produces: `RecordHero(props: RecordClientProps)` — consumed by Task 9's composition.

- [ ] **Step 1: Implement**

```tsx
// packages/crm/src/components/landing/record/record-hero.tsx
//
// Dark hero for record mode (spec §4.1): the hero card IS the working
// recorder — zero friction, mirroring the paste-URL ethos. Hero copy
// moved here from record-client.tsx (Task 5 extraction).

"use client";

import dynamic from "next/dynamic";
import { HeroModeSwitch } from "@/components/landing/landing-mode";

// Code-split: the recorder bundle (state machine, service worker,
// upload pipeline) loads when record mode mounts — never on the
// default build-mode homepage.
const RecordSurface = dynamic(
  () => import("@/app/(public)/record/record-client").then((m) => m.RecordClient),
  {
    loading: () => (
      <div className="flex h-40 items-center justify-center text-[14px] text-[var(--lp-muted)]">
        Loading the recorder…
      </div>
    ),
  },
);

export function RecordHero({
  claimedSessionId,
  claimed,
  isAuthed,
  sharedFlag,
}: {
  claimedSessionId: string | null;
  claimed: boolean;
  isAuthed: boolean;
  sharedFlag?: "1" | "miss" | null;
}) {
  return (
    <section
      id="top"
      aria-label="Record how you work"
      className="relative flex flex-col items-center px-5 pb-16 pt-[100px] md:px-8 md:pb-20 md:pt-[120px]"
    >
      <div className="flex w-full max-w-[860px] flex-col items-center text-center">
        <p className="inline-flex items-center gap-2.5 font-sans text-[13.5px] tracking-[0.04em] text-[var(--lp-muted)]">
          <span className="inline-block size-1.5 rounded-full bg-[var(--lp-accent)]" aria-hidden />
          No signup to start
        </p>
        <h1 className="mt-3 max-w-[20ch] text-balance font-sans text-[clamp(34px,4.8vw,56px)] font-[500] leading-[1.04] tracking-[-0.025em] text-[var(--lp-ink)]">
          Show Seldon how you work.{" "}
          <em className="font-[Newsreader,Georgia,serif] font-normal not-italic tracking-[-0.01em]">
            It builds the agent.
          </em>
        </h1>
        <p className="mx-auto mt-4 max-w-[62ch] text-pretty text-[16px] leading-[1.55] text-[var(--lp-body)]">
          Screen-record yourself doing the job once — talking out loud, narration is half the
          signal. Seldon watches, asks about what it didn&apos;t understand, and compiles a
          working agent.
        </p>

        {/* The hero card: mode switch on top, live recorder inside. */}
        <div className="mt-10 w-full max-w-[860px] rounded-[18px] border border-[var(--lp-border)] bg-[var(--lp-card)] p-2 text-left shadow-[0_1px_2px_rgba(0,0,0,.2),0_10px_30px_rgba(0,0,0,.25)]">
          <HeroModeSwitch />
          <div className="px-3 pb-3 pt-4 md:px-4">
            <RecordSurface
              claimedSessionId={claimedSessionId}
              claimed={claimed}
              isAuthed={isAuthed}
              sharedFlag={sharedFlag}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
```

Note for implementer: after this mounts, eyeball CaptureCard's outer border inside the card — if double-chrome reads badly, soften CaptureCard's outermost border to `border-[var(--lp-border-soft)]` (one-line, allowed by Task 5's mapping).

- [ ] **Step 2:** `pnpm typecheck` in `packages/crm` (junction present per Task 0) — judge by delta.
- [ ] **Step 3: Commit** — `feat(landing): RecordHero — live recorder in the dark hero card`

---

### Task 7: Record sections (steps · what-you-get · proof)

**Files:**
- Create: `packages/crm/src/components/landing/record/record-steps.tsx`
- Create: `packages/crm/src/components/landing/record/record-what-you-get.tsx`
- Create: `packages/crm/src/components/landing/record/record-proof.tsx`

**Interfaces:** Produces three zero-prop server components consumed by Task 9. All copy below is final (truth-passed against shipped behavior: trace → recap coverage → interview → compile → claim → test).

- [ ] **Step 1: `record-steps.tsx`** — server component, token-native, type floors respected:

```tsx
// 3-step how-it-works for record mode (spec §4.2). Server component.
const STEPS = [
  {
    n: "1",
    title: "Record yourself working",
    body: "One normal, successful run — start to finish. Talk out loud: narration is half the signal.",
  },
  {
    n: "2",
    title: "Answer Seldon's questions",
    body: "Seldon shows you what it traced — green, yellow, red — and asks only about what the recording didn't show.",
  },
  {
    n: "3",
    title: "Get your agent",
    body: "Compiled from your real workflow. Testable before it touches anything. Yours to switch on.",
  },
] as const;

export function RecordSteps() {
  return (
    <section aria-label="How it works" className="px-5 py-16 md:px-8 md:py-20">
      <div className="mx-auto grid w-full max-w-[1000px] gap-8 md:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="flex flex-col items-start gap-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-[var(--lp-accent-soft)] text-[14px] font-[700] text-[var(--lp-accent)]">
              {s.n}
            </span>
            <h3 className="text-[18px] font-[600] leading-[1.3] text-[var(--lp-ink)]">{s.title}</h3>
            <p className="text-[16px] leading-[1.55] text-[var(--lp-body)]">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: `record-what-you-get.tsx`** — the one-product bridge (spec §4.3). Same structural pattern as Step 1 (section head + 4-card grid). Section head: eyebrow "From screenshare to deployed agent", H2 "The same SeldonFrame, entered sideways", lede "A recording doesn't build a toy. It builds the same agent + workspace the front-door path builds — just trained on how you actually work." (H2 at `text-[clamp(26px,3.2vw,38px)]`, lede `text-[16px] text-[var(--lp-body)]`.) Cards (title / body, all `text-[16px]` body):
  1. "A compiled agent" / "Every step traced from your recording, with coverage you can see — green, yellow, red — before you trust it."
  2. "Grounded, not improvised" / "The agent runs your workflow the way you showed it. When it doesn't know, it asks — it doesn't guess."
  3. "A full workspace around it" / "CRM, booking, intake, and a portal come with it. The agent has somewhere to work from day one."
  4. "Yours, flat price" / "Recording and compiling are free with no signup. $29/mo when you switch it on. Cancel anytime."

- [ ] **Step 3: `record-proof.tsx`** — static two-panel figure (spec §4.4), no live data, no fabricated receipts (GENERATED-vs-CAPTURE house rule: this is clearly illustrative UI, not a fake screenshot). Left panel (card): mono-ish traced-steps list with three rows ("Opened the quote spreadsheet ✓", "Copied totals into the email ✓", "Sent follow-up to the customer ✓") each with a `var(--lp-accent)` check. Arrow glyph between panels. Right panel (card): an "agent card" — dot + "Quote follow-up agent", status line "Compiled · ready to test", muted caption "Built from a 4-minute recording". Both cards `bg-[var(--lp-card)] border-[var(--lp-border-soft)] rounded-[14px] p-5`; caption row under the figure: "Your recording becomes a checkable plan — then an agent you can test." at `text-[16px] text-[var(--lp-body)]`.

- [ ] **Step 4:** renderToString smoke for all three in one throwaway check (no new spec file — they're static): `node --import tsx -e "..."` rendering each and asserting non-empty output, or fold into Task 9's composition test (preferred — see Task 9 Step 2).
- [ ] **Step 5: Commit** — `feat(landing): record-mode sections — steps, what-you-get, proof`

---

### Task 8: `RecordFaq` + pricing/final-CTA token migration

**Files:**
- Create: `packages/crm/src/components/landing/record/record-faq.tsx`
- Modify: `packages/crm/src/components/landing/marketing-pricing-section.tsx` (colors only)
- Modify: `packages/crm/src/components/landing/marketing-final-cta.tsx` (colors + copy prop)
- Test: `packages/crm/tests/unit/landing/record-faq.spec.tsx`

**Interfaces:**
- Produces: `RecordFaq({ withSchema?: boolean })`; `MarketingFinalCta({ variant?: "build" | "record" })` (default `"build"` — existing call sites unchanged).

- [ ] **Step 1: Failing FAQ test**

```tsx
// packages/crm/tests/unit/landing/record-faq.spec.tsx
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { RecordFaq } from "../../../src/components/landing/record/record-faq";

describe("<RecordFaq> JSON-LD gating", () => {
  test("withSchema renders exactly one FAQPage schema", () => {
    const html = renderToString(React.createElement(RecordFaq, { withSchema: true }));
    assert.equal(html.split("FAQPage").length - 1, 1);
    assert.match(html, /recordings stay private/i);
  });
  test("default renders NO schema (avoids duplicate FAQPage on /)", () => {
    const html = renderToString(React.createElement(RecordFaq));
    assert.doesNotMatch(html, /FAQPage/);
  });
});
```

- [ ] **Step 2: Implement `record-faq.tsx`.** Mirror `marketing-faq-section.tsx`'s visual structure (same disclosure/list pattern, token colors, question titles ≥16px, answers `text-[16px] leading-[1.55] text-[var(--lp-body)]`). Q&A copy (final, truth-passed — no dark-flag features promised):
  1. **Are my recordings private?** "Yes. Recordings stay private — they train your agent only. They're never published, never shared to the marketplace, and you can start fresh at any time."
  2. **What kinds of work compile well?** "Repeatable computer work with a clear start and finish: quoting, intake triage, moving data between tools, follow-up emails. If you can screen-record one clean run of it, Seldon can trace it."
  3. **Do I have to narrate?** "You don't have to, but it helps a lot — narration is half the signal. Seldon asks about anything the recording didn't show."
  4. **How do I know the agent got it right?** "You see the traced plan before anything runs: green for covered, yellow for assumed, red for missing. Seldon interviews you about the gaps, and you test the compiled agent before switching it on."
  5. **How many recordings do I need?** "One normal, successful run is enough to start. Add more recordings to teach edge cases — Seldon merges them into one model of the job."
  6. **What does it cost?** "Recording, compiling, and testing are free — no signup to start. It's $29/mo when you switch your agent on. Cancel anytime."
  `withSchema` gates a single `<script type="application/ld+json">` with the FAQPage graph built from the same array (map, don't duplicate strings).
- [ ] **Step 3:** Apply the Task 3 color mapping table to `marketing-pricing-section.tsx` and `marketing-final-cta.tsx` (all landing hexes → tokens; verify with the same grep pattern scoped to each file). In `marketing-final-cta.tsx` add `variant` prop: `"record"` swaps the headline to "Show Seldon how you work." and the CTA to `<a href="#top">` "Record your first run →" (same button classes); `"build"` output must be byte-identical to today's render.
- [ ] **Step 4:** Run new spec + existing `marketing-faq.spec.ts`, `marketing-pricing.spec.ts` — PASS / no delta.
- [ ] **Step 5: Commit** — `feat(landing): RecordFaq + token-aware pricing/final CTA`

---

### Task 9: `/` composition — `UnifiedLanding`

**Files:**
- Create: `packages/crm/src/app/(public)/unified-landing.tsx`
- Modify: `packages/crm/src/app/(public)/page.tsx`
- Modify: `packages/crm/src/components/landing/marketing-hero.tsx` (insert `HeroModeSwitch`)
- Test: extend `packages/crm/tests/unit/landing/landing-mode-shell.spec.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: `UnifiedLanding({ initialMode, recordEnabled, urlStrategy, tierLadderOn, ungatedBuildEnabled, recordProps })` — also consumed by Task 10.

- [ ] **Step 1: Implement `unified-landing.tsx`** (server component — single source for both routes):

```tsx
// packages/crm/src/app/(public)/unified-landing.tsx
//
// ONE composition, two modes (spec §2). `/` renders it with the mode
// resolved from ?mode=; /record renders it pre-flipped. Section stacks
// are server-rendered and handed to the client shell as children.

import type { LandingMode } from "./landing-mode";
import { LandingModeShell } from "@/components/landing/landing-mode";
import { MarketingNav } from "@/components/landing/marketing-nav";
import { MarketingHero } from "@/components/landing/marketing-hero";
import { MarketingProofStrip } from "@/components/landing/marketing-proof-strip";
import { MarketingBuildSteps } from "@/components/landing/marketing-build-steps";
import { MarketingIdeStrip } from "@/components/landing/marketing-ide-strip";
import { MarketingModules, MarketingAgents } from "@/components/landing/marketing-modules";
import { MarketingSmbCta } from "@/components/landing/marketing-smb-cta";
import { LandingMarketingPricingSection } from "@/components/landing/marketing-pricing-section";
import { LandingMarketingFaqSection } from "@/components/landing/marketing-faq-section";
import { MarketingFinalCta } from "@/components/landing/marketing-final-cta";
import { MarketingFooter } from "@/components/landing/marketing-footer";
import { RecordHero } from "@/components/landing/record/record-hero";
import { RecordSteps } from "@/components/landing/record/record-steps";
import { RecordWhatYouGet } from "@/components/landing/record/record-what-you-get";
import { RecordProof } from "@/components/landing/record/record-proof";
import { RecordFaq } from "@/components/landing/record/record-faq";

export type RecordSurfaceProps = {
  claimedSessionId: string | null;
  claimed: boolean;
  isAuthed: boolean;
  sharedFlag?: "1" | "miss" | null;
};

export function UnifiedLanding({
  initialMode,
  recordEnabled,
  urlStrategy,
  tierLadderOn,
  ungatedBuildEnabled,
  recordProps,
  recordFaqWithSchema = false,
}: {
  initialMode: LandingMode;
  recordEnabled: boolean;
  urlStrategy: "replace-state" | "navigate-home";
  tierLadderOn: boolean;
  ungatedBuildEnabled: boolean;
  recordProps: RecordSurfaceProps;
  /** true only on /record — FAQPage JSON-LD must not duplicate on / */
  recordFaqWithSchema?: boolean;
}) {
  return (
    <LandingModeShell
      initialMode={initialMode}
      recordEnabled={recordEnabled}
      urlStrategy={urlStrategy}
      nav={<MarketingNav />}
      footer={<MarketingFooter />}
      buildStack={
        <>
          <MarketingHero ungatedBuildEnabled={ungatedBuildEnabled} />
          <MarketingBuildSteps />
          <MarketingIdeStrip />
          <MarketingModules />
          <MarketingSmbCta />
          <MarketingAgents />
          <LandingMarketingPricingSection tierLadderOn={tierLadderOn} />
          <MarketingProofStrip />
          <LandingMarketingFaqSection />
          <MarketingFinalCta />
        </>
      }
      recordStack={
        <>
          <RecordHero {...recordProps} />
          <RecordSteps />
          <RecordWhatYouGet />
          <RecordProof />
          <LandingMarketingPricingSection tierLadderOn={tierLadderOn} />
          <RecordFaq withSchema={recordFaqWithSchema} />
          <MarketingFinalCta variant="record" />
        </>
      }
    />
  );
}
```

- [ ] **Step 2: Rewrite `page.tsx`'s body.** Keep: metadata export, JSON-LD org/website `<script>` (move it INSIDE the returned fragment above `UnifiedLanding` — it must stay on `/`), auth redirect, `isTierLadderOn`, `isWebUngatedBuildOn`. Add: `searchParams: Promise<{ mode?: string }>` to the page props, `isRecordToAgentOn` import from `@/lib/recordings/policy`, and:

```tsx
const params = await searchParams;
const recordEnabled = isRecordToAgentOn({ SF_RECORD_TO_AGENT: process.env.SF_RECORD_TO_AGENT });
const initialMode = resolveLandingMode(params.mode, recordEnabled);

return (
  <>
    {/* existing JSON-LD script unchanged */}
    <UnifiedLanding
      initialMode={initialMode}
      recordEnabled={recordEnabled}
      urlStrategy="replace-state"
      tierLadderOn={tierLadderOn}
      ungatedBuildEnabled={/* existing computation */}
      recordProps={{ claimedSessionId: null, claimed: false, isAuthed: false, sharedFlag: null }}
    />
  </>
);
```
The old `min-h-screen bg-[#F6F2EA]` wrapper div is deleted — `LandingModeShell` now owns the root (same classes via tokens).

- [ ] **Step 3: Insert `HeroModeSwitch` in `marketing-hero.tsx`** — first child inside the `<form id="hero-form">` card, ABOVE the existing URL/Describe `role="tablist"` div, wrapped in `className="mx-2 mt-2"` to match the tabs' inset. (Renders null when the flag is off — zero visual change.)

- [ ] **Step 4: Extend the shell spec** with a composition test: renderToString `UnifiedLanding` with `initialMode: "record"`, `recordEnabled: true`, stub recordProps — assert it contains "No signup to start", "Record yourself working", "The same SeldonFrame", and does NOT contain the build hero's "Start a service business". (RecordSurface is `next/dynamic`; renderToString renders its loading fallback — that's fine, assert on hero copy not recorder internals.)

- [ ] **Step 5: Run** the landing spec files + typecheck — PASS / delta 0.
- [ ] **Step 6: Commit** — `feat(landing): UnifiedLanding dual-path composition on /`

---

### Task 10: `/record` route rewrite + SEO

**Files:**
- Modify: `packages/crm/src/app/(public)/record/page.tsx`
- Modify: `packages/crm/src/app/sitemap.ts`

**Interfaces:** Consumes `UnifiedLanding` (Task 9). `/record`'s external contract (flag 404, auth-aware claim, `?session/?claimed/?shared`) is UNCHANGED.

- [ ] **Step 1: Rewrite `record/page.tsx`.** Keep the flag gate, `auth()` check, and searchParams parsing byte-for-byte. Replace the metadata (was noindex) and the render:

```tsx
export const metadata: Metadata = {
  title: "Turn a screen recording into a working AI agent — SeldonFrame",
  description:
    "Screen-record yourself doing the job once. Seldon watches, asks about what it didn't understand, and compiles a working agent — free to try, no signup.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://www.seldonframe.com/record" },
  openGraph: {
    title: "Turn a screen recording into a working AI agent — SeldonFrame",
    description:
      "Show Seldon how you work. It builds the agent — compiled from your real workflow, testable before you switch it on.",
    type: "website",
    url: "https://www.seldonframe.com/record",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
};
```

Render becomes:

```tsx
return (
  <UnifiedLanding
    initialMode="record"
    recordEnabled={true /* the gate above already 404'd when off */}
    urlStrategy="navigate-home"
    tierLadderOn={isTierLadderOn({ SF_TIER_LADDER: process.env.SF_TIER_LADDER })}
    ungatedBuildEnabled={isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: process.env.SF_WEB_UNGATED_BUILD })}
    recordFaqWithSchema
    recordProps={{
      claimedSessionId: typeof params.session === "string" ? params.session : null,
      claimed: params.claimed === "1",
      isAuthed,
      sharedFlag: params.shared === "1" ? "1" : params.shared === "miss" ? "miss" : null,
    }}
  />
);
```
(`isTierLadderOn` is duplicated locally today in `page.tsx` and `pricing/page.tsx` — copy the same 3-line local helper here with the same comment; house precedent.)

- [ ] **Step 2: Sitemap.** In `src/app/sitemap.ts`, alongside the other static entries, add:

```ts
entries.push({ url: `${base}/record`, lastModified: now, changeFrequency: "monthly", priority: 0.8 });
```
Gate it on `isRecordToAgentOn(...)` so a 404ing route is never sitemapped.

- [ ] **Step 3: Run** `tests/unit/recordings/policy.spec.ts` + `record-page-render.spec.ts` + typecheck — delta 0.
- [ ] **Step 4: Commit** — `feat(record): /record = indexable record-mode landing, same claim contract`

---

### Task 11: Gates — verify-build, vision-verify, live smoke, mobile checkpoint

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite delta** — `node scripts/run-unit-tests.js`, compare against Task 0 baseline. Delta must be 0 (or only the intentionally-updated record-page-render assertions).
- [ ] **Step 2: `/verify-build`** — dispatch **verify-runner** (never the implementer) on the worktree. All six checks green.
- [ ] **Step 3: `/vision-verify`** — three shots, graded by **vision-grader**:
  1. `/` desktop light (regression: hero + switch present, nothing else moved)
  2. `/?mode=record` desktop dark — rubric MUST include: warm-dark (not pure black), body text ≥16px and clearly readable, no sub-AA gray-on-black text, canonical logo (real brand mark, not a teal square), one green accent, recorder card visible with mode switch on top
  3. `/?mode=record` at 375px mobile width — same rubric + no horizontal scroll
- [ ] **Step 4: Live smoke (after deploy, smoke-runner)** — assert per route: `/` 200 + "From your website" sentinel; `/?mode=record` 200 + `data-mode="record"` in the SSR HTML (no-flash contract); `/record` 200 + same sentinel + `robots` meta NOT noindex; `/record` with flag off (preview env) → 404; sitemap contains `/record`.
- [ ] **Step 5: Max manual checklist (blocking merge):**
  - Toggle flips both ways on `/` without reload; URL updates; browser back/forward not broken.
  - Record an actual run on `/record` — recorder, upload, restored-session banner, Start fresh, and claim flow all behave exactly as before the extraction.
  - **Mobile checkpoint (spec §5):** open `/record` on your phone. The existing surface already has upload + text-fallback paths — confirm they're intuitive. Only if this dead-ends do we scope the demo-video/email-link fallback as a follow-up slice.
- [ ] **Step 6:** On green: merge per house merge-to-main method, then run `extract-approach` (learning law).

---

## Self-Review (done at write time)

- **Spec coverage:** §2 decisions → Tasks 1/2/9/10 (routing, flip, flag), 2/5 (readability), 3/4 (logo), 7/8 (adapted mirror, FAQ, pricing), 10 (SEO), 11+§5 (mobile verification checkpoint). Spec §3.1 token names match Task 2 CSS exactly. No gaps found.
- **Type consistency:** `LandingMode`, `RecordSurfaceProps`, `urlStrategy` literals, `variant` prop names checked across Tasks 1/2/6/8/9/10 — consistent.
- **Placeholder scan:** mechanical sweeps are specified as complete old→new mapping tables over a grep-verified inventory (deterministic, no judgment left to the implementer); all copy is final text. One intentional deferral: Task 6's double-chrome eyeball note — bounded to a one-line class change.
