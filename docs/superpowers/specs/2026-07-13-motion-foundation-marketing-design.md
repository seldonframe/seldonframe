# Motion foundation + marketing-landing animations — design spec

**Date:** 2026-07-13
**Status:** Approved by Max (brainstorm 2026-07-13); ready for implementation plan
**Branch:** `feat/motion-marketing` off `origin/main` (worktree `.claude/worktrees/motion-marketing`)
**Scope:** Slice 0 (motion foundation) + Slice 1 (marketing landing). Guides / tools / dashboard are later slices with their own specs.

## 1. Problem & goal

Add **purposeful, comprehension-first animation** to seldonframe.com so motion helps a visitor *understand* the product (its architecture, its composition, how you connect to it), not just decorate it. Bar: world-class + intuitive, **net-positive UX**, Linear/Vercel-grade restraint. The static state is the real design; motion is an enhancement layered on top that must degrade cleanly.

We are **not** starting from zero and **not** adding a dependency:
- `motion` v12.38 + `framer-motion` v12.38 already ship (`packages/crm/package.json`). Magic UI's components are MIT copy-paste built on this exact engine — we **vendor**, never `npm i magicui`.
- Already on main: `components/motion/primitives.tsx` (RevealOnScroll, Stagger, Counter, Marquee, Parallax, HoverLift, MagneticButton, TextReveal, PRESETS), `components/ui/border-beam.tsx`, `components/ui/animated-list.tsx`, `components/ui/marquee.tsx`. `prefers-reduced-motion` handling is wired across 20+ files.

## 2. Decisions (settled with Max — do not re-litigate)

| Decision | Answer |
| --- | --- |
| Taste target | **Linear/Vercel restraint** — fast (150–400ms), one idea per animation, nothing loops in-your-face; "cool" comes from precision. |
| First surface | **Marketing landing** (this slice), then guides → tools → dashboard (later slices). |
| Dashboard | **Moments-only, and last** — not this slice. |
| Verification | **Dev-only `/motion-lab` gallery + Max review** for motion; existing static vision-gate for layout. |
| Marketing sections | **Augment existing sections, don't redesign** — a section may get a light internal reflow to host its animation; no wholesale rebuild of the just-merged landing. |
| Component strategy | **Vendor** missing Magic UI components into `components/ui/magic/` on top of `motion`; **reuse** existing border-beam / animated-list / primitives. No new dependency. |
| Green/brand | Reuse the `--lp-*` landing tokens (light build + warm-dark record); one accent green. |

## 3. The kill rule (the discipline that makes it net-positive)

**Every animation must name the one concept, step, or state it makes clearer. If the honest answer is "it looks cool," it is cut.** This rule is applied below — note how many of the 13 candidate components are *cut* from marketing and deferred.

Non-negotiable guardrails, every animation:
- Has a complete, correct **static state** (the reduced-motion / no-JS render) that is the real design.
- Honors `prefers-reduced-motion: reduce` → no motion, static state shows.
- **No CLS** (no layout shift); animates **transform/opacity only** (GPU-composited).
- Below-the-fold motion **lazy-mounts** (IntersectionObserver / `whileInView`), never runs offscreen.
- Works in **both landing modes** (light build + warm-dark record) via `--lp-*` tokens, and never fights the in-place mode flip.

## 4. Slice 0 — Motion foundation

**4.1 Vendored components** → `packages/crm/src/components/ui/magic/`, each a thin `"use client"` wrapper on `motion`, reduced-motion-aware, token-themeable:
- `animated-beam.tsx` — SVG beam between two refs (source → target), directional.
- `orbiting-circles.tsx` — items orbiting a center at configurable radius/speed.
- `terminal.tsx` — typed-line terminal with sequenced reveal.
- `bento-grid.tsx` + `bento-card.tsx` — responsive bento layout primitives.
- `avatar-circles.tsx` — overlapping avatar stack + "+N" count.
- (Deferred to later slices, NOT built now: `scroll-progress`, `highlighter`, `file-tree`, `dock`, `flickering-grid`, `animated-shiny-text`. Built when their slice needs them, to avoid dead code — YAGNI.)
Reused as-is: `border-beam.tsx`, `animated-list.tsx`, `primitives.tsx`.

**4.2 Motion tokens** → append to a shared stylesheet (e.g. `components/motion/motion-tokens.css`, imported at the route level like `landing-theme.css`): `--motion-fast: 180ms; --motion-base: 280ms; --motion-slow: 420ms;` and standard eases (`--ease-out`, `--ease-spring`-equivalent cubic-beziers). Vendored components read these so timing is consistent cross-surface.

**4.3 The rubric doc** → `docs/motion/comprehension-first.md`: the kill rule + guardrails above, as the reference every later slice (guides/tools/dashboard) is judged against. One page.

**4.4 `/motion-lab`** → dev-only route (`app/(dev)/motion-lab/page.tsx` or equivalent, **404 in production** via env/flag gate like the other dark routes): renders every animated component (vendored + reused) with, for each: its **labelled comprehension purpose**, a **reduced-motion toggle** (forces the static state), and a light/dark(record) toggle. This is Max's single review surface and a permanent regression catalog.

## 5. Slice 1 — Marketing landing: concept → animation map

Current `buildStack` composition (verified on main, `unified-landing.tsx:63-72`): Hero → BuildSteps → IdeStrip → Modules → SmbCta → Agents → Pricing → ProofStrip → FAQ → FinalCta. Every kept animation maps to an **existing** section:

| Component | Concept it makes tangible | Host section (augment) |
| --- | --- | --- |
| **animated-beam** | "SF is the source of truth that pushes *outward*" — SF core → client tools (Google Cal / Gmail / phone / Slack), the no-Zapier claim | `MarketingBuildSteps` step-3 ("go live and let it run") visual, or `MarketingModules` — implementer picks the stronger host |
| **orbiting-circles** | the agent's **surfaces** (voice · web-chat · SMS · email · DM · MCP) — or the 6 primitives — orbiting one agent core; makes the composition claim concrete | `MarketingAgents` ("Hire agents") — light internal reflow permitted |
| **terminal** | the IDE/MCP on-ramp — animated typing of `npx -y @seldonframe/mcp`, literally demoing the connect step | `MarketingIdeStrip` |
| **bento-grid** | the all-in-one front office (CRM · booking · intake · portal · landing · reviews) — a layout that *is* "one system" | `MarketingModules` — reflow the module cards into a bento arrangement |
| **avatar-circles** | social-proof scale | `MarketingProofStrip` |
| **border-beam** *(reuse)* | "live / building right now" active-state accent | hero workspace/build CTA |

**Copy/claims discipline:** any label an animation introduces (surface names, module names, the install command, proof counts) must be **true and current** — reuse the exact primitive/surface/module vocabulary from CLAUDE.md §1b and the existing sections; no invented numbers (avatar-circles count must be real or a generic non-numeric treatment).

**Explicitly cut from marketing (kill rule):** `scroll-progress` (a landing isn't a long read → guides), `highlighter` (→ guides), `file-tree` (→ guides/dashboard), `dock` (→ dashboard maybe), `flickering-grid` (at most one very-low-opacity ambient panel behind the dark record hero, else cut), `animated-shiny-text` (≤1 accent on the eyebrow, or cut).

## 6. Architecture & isolation

- Vendored components are **self-contained** (`components/ui/magic/*`), each with one responsibility and a documented prop interface; consumable without reading internals. No cross-imports between them.
- Marketing sections **import and compose** them; section files stay the composition layer. A section's animation lives in a small sub-component if it grows the file meaningfully.
- Motion tokens + reduced-motion are the shared contract; no component hardcodes durations.

## 7. Verification

- `/verify-build` (six checks) — unit + tsc + use-server + migration-journal (no migrations) + regression-grep.
- Unit: each vendored component gets a renderToString smoke (renders, reduced-motion prop yields static markup, no crash). `/motion-lab` gated 404-in-prod (test the gate).
- **Static vision-gate** (existing worktree+Neon method): landing in both modes still correct, no layout regression, no CLS.
- **Motion review (Max, blocking):** walk `/motion-lab` — every component's motion reads as purposeful, none annoying, reduced-motion toggle correct in each; then the live landing sections in both modes.
- Perf sanity: below-fold motion lazy-mounts (confirmed in `/motion-lab` + landing), transform/opacity only.

## 8. Out of scope (later slices, own specs)

- Guides motion (scroll-progress, highlighter, file-tree/terminal on the diagram engine).
- Tools motion (animated result reveals on the 9 calculators).
- Dashboard motion (moments-only, last).
- Any dependency addition, any `--lp-*` token redefinition, any landing layout redesign.
