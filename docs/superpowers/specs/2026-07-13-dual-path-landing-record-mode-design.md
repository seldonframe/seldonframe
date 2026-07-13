# Dual-path landing + dark record mode — design spec

**Date:** 2026-07-13
**Status:** Approved by Max (brainstorm 2026-07-13); ready for implementation plan
**Branch plan:** fresh branch off `origin/main` (the `/record` surface only exists on main; do NOT build on `feat/guides-rewrite-all`)

## 1. Problem

Two separate front doors exist for the same promise:

- `seldonframe.com` (light, warm parchment) — hero card with Paste-a-URL / Describe-the-business → builds a front-office workspace.
- `/record` (dark, cold green-black) — screen-record how you work → Seldon compiles an agent. Live + validated, flag-gated (`SF_RECORD_TO_AGENT`), noindex.

Problems, confirmed in code on `origin/main`:

1. **No brand logo on /record.** `record-client.tsx:649` renders a placeholder teal square, not `/brand/seldonframe-icon.svg`. The landing nav (`marketing-nav.tsx:82-91`) uses a hand-drawn inline SVG approximation instead of the canonical asset.
2. **Readability failures on /record.** Body/meta copy at 12–13px; secondary text `#9CA3AF` and `rgba(231,229,222,.35/.45)` on `#0B0F0E` — below WCAG AA in several places. Max's complaint ("fonts too small, colors too dark") is measurable.
3. **Brand drift.** Three greens in play: landing accent `#00897B`, /record accent `#14B8A6` (teal), logo SVG `#1FAE85`. Two unrelated dark/light worlds.
4. **Split funnel.** The record path is invisible from the homepage; the two on-ramps tell disconnected stories.

## 2. Decisions (settled with Max — do not re-litigate)

| Decision | Answer |
| --- | --- |
| Positioning | **One product, two on-ramps.** URL = "show us your website"; Record = "show us how you work". Same outcome (agent + workspace), same pricing. |
| Routing | **In-place theme flip on `/`** (`?mode=record`, no navigation). **`/record` stays a real route** and renders the same landing pre-flipped to record mode; all existing params/flows (`?session`, `?claimed`, `?shared`) keep working. |
| Dark aesthetic | **Warm-dark, same brand system** — parchment with the lights off, Vercel/shadcn contrast discipline. Not neutral-zinc, not the dashboard tokens. |
| Toggle copy | **"From your website" / "From a recording"** (globe icon / red ● dot). |
| Recorder placement | **Recorder live in the flipped hero** — zero friction, mirrors the paste-URL ethos. Sales sections below. |
| Record-mode body | **Adapted mirror** of the landing's section rhythm, rewritten for the "from screenshare to deployed agent" buyer. |
| SEO | **`/record` becomes indexable** (proper metadata + OG); it is now a marketing surface. Recorder island stays client-side. |
| Brand green | **One green:** `#00897B` on light, `#1FAE85` (the logo's own green) on dark. Teal `#14B8A6` retires. |
| Scope | **One slice:** hero toggle + dark record mode + /record unification + readability fixes + canonical logo. One branch, one verify/vision gate. |

## 3. Architecture

### 3.1 Landing theme tokens (the enabling refactor)

Introduce **landing-scoped CSS variables** — light values by default, warm-dark values under `data-mode="record"` on the page root:

```
--lp-bg        #F6F2EA  →  #14110D   (warm near-black; NOT the cold #0B0F0E)
--lp-card      #FFFFFF… →  #1F1A15
--lp-border    …        →  rgba(246,242,234,.10)
--lp-ink       #221D17  →  #F6F2EA
--lp-body      …        →  #C9C2B6   (~9:1 on bg)
--lp-muted     #6E665A  →  #A39B8D   (contrast floor — nothing dimmer ships)
--lp-accent    #00897B  →  #1FAE85
```

`marketing-*.tsx` components migrate from hardcoded hex to these tokens. **Guardrail: the token refactor is landing-scoped only** (`components/landing/*` + the record surface). No dashboard/global token changes — this is the Runaway Refactor line.

### 3.2 The flip

- Segmented control at the top of the hero card: **🌐 From your website** (default) | **● From a recording**.
- Clicking Record sets `data-mode="record"` on the page root; a ~400ms CSS transition animates colors. URL updates to `/?mode=record` (shareable; SSR-respects the param so a deep link renders dark with no flash). Flip back is symmetric.
- Build mode keeps the existing Paste-URL / Describe tabs, compacted one visual level below the mode switcher.
- Sections below the hero swap copy per mode (same components with per-mode content where the structure matches; a section may be mode-specific where the narrative demands it — implementation plan decides per section).
- **Flag behavior unchanged in spirit:** `SF_RECORD_TO_AGENT` off → record toggle hidden on `/`, `?mode=record` ignored, `/record` 404s exactly as today.

### 3.3 Reuse, don't rebuild (record-client)

`record-client.tsx` + `recorder-machine.ts` + `record-ui/*` are live-validated machinery (recorder state machine, service worker, localStorage sessions, upload, recap, interview, claim). The work is an **extraction, not a rewrite**: lift the interactive surface into a mountable `RecordSurface` island that the landing hero mounts in record mode. `/record/page.tsx` becomes: flag gate + auth check (unchanged) → render the landing shell pre-flipped with `RecordSurface` in the hero. As the visitor progresses (recordings → recap → interview → claim), the deeper stages take over the hero region exactly as on `/record` today; sales sections simply remain below.

### 3.4 Logo

Canonical mark everywhere, both modes:

- Light: `/brand/seldonframe-icon.svg` + wordmark text.
- Dark: `/brand/seldonframe-icon-white.svg` (or the green icon if it reads better on `#14110D` — vision gate decides) + wordmark.
- Replace: the inline SVG in `marketing-nav.tsx`, the teal placeholder square in the record header, and the footer marks.

### 3.5 Typography & readability floor (applies to all record-mode content)

- Body ≥ **16px**, line-height ≥ 1.55. Meta/labels ≥ **13.5px**. Step titles 17–18px. Hero clamp stays.
- Contrast: everything ≥ WCAG AA (4.5:1); body targets ~9:1. The `.35`-alpha text class of styles is banned.
- Fonts unchanged: Hanken Grotesk (UI/body), Newsreader italic (display accents), mono only for the `/record` path chip.
- shadcn/Vercel discipline: 8px spacing grid, visible focus rings, subtle 1px borders over shadows.

## 4. Record-mode page content (below the hero)

1. **Hero (dark):** "No signup to start" badge · H1 "Show Seldon how you work. It builds the agent." (keep) · live recorder card (Record / upload / restored recordings).
2. **How it works:** the 3 steps (Record yourself working → Answer Seldon's questions → Get your agent) at readable sizes.
3. **What you get:** bridges to the same outcome as the build path — compiled agent + full workspace, testable, yours to switch on. "From screenshare to deployed agent."
4. **Proof/demo:** recording timeline → compiled agent card (re-skin the landing's demo strip).
5. **Pricing:** the same $29 block, dark re-skin. Same ladder, no record-specific pricing.
6. **FAQ:** leads with recording privacy ("recordings stay private — they train your agent only"), what jobs compile well, multiple recordings for edge cases, editing after compile.
7. **Final CTA:** Record again.

Copy is written during implementation against the never-lies/never-taxes/never-goes-stale positioning; sell on value, never on the $.

## 5. Mobile

**Verify before designing around it:** first task on the build branch is testing `/record` on main from a phone (iOS Safari lacks `getDisplayMedia`). If the existing record/upload path works and is intuitive → keep it. If it dead-ends → recorder slot shows a short demo video + upload + "email me a desktop link" capture. No assumption ships.

## 6. Verification

- Fresh branch off `origin/main`; maker ≠ checker per `.claude/agents/` roster.
- `/verify-build` gate (six checks).
- **vision-verify** on: light hero (regression), dark record mode desktop, dark record mode mobile width — rubric includes explicit contrast/type-size checks and "canonical logo present".
- Live smoke: `/` renders light with toggle · toggle flips without reload and updates URL · `/?mode=record` SSRs dark (no flash) · `/record` renders the unified dark page · recorder records (Max manual check) · claim params (`?session/?claimed/?shared`) still work · flag-off 404 preserved · `/record` metadata now indexable with OG image.

## 7. Risks & guardrails

- **Runaway Refactor:** the hex→token migration touches every `marketing-*.tsx`; it is mechanical and stops at the landing boundary. Any temptation to unify dashboard tokens is a separate slice.
- **Load-bearing recorder:** `record-client.tsx` is live and validated (2026-07-10/12 fixes). Extraction must preserve behavior byte-for-byte where possible; the recorder state machine, service worker registration, and claim redirects are regression hot-spots.
- **SSR flash:** `?mode=record` and `/record` must render dark server-side; a light-flash-then-flip is a vision-gate failure.
- **SEO flip:** switching `/record` to indexable changes `robots` metadata only; sitemap addition included.

## 8. Out of scope

- Dashboard dark-theme readability (separate surface).
- Record wedge repositioning as THE hero (explicitly not chosen).
- Any pricing/flag changes beyond visibility of the toggle.
- Guides/SEO branch work (`feat/guides-rewrite-all` continues independently).
