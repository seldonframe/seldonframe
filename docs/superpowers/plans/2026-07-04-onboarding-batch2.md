# Onboarding Batch 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish audit fixes #4/#5/#6 as re-scoped: retire the dormant jargon surfaces, make the signup copy truthful and plain, and put the real 60-second build video above the fold as proof.

**Architecture:** Three small waves on `feature/onboarding-batch-2` (off main @ 99e0927e). No schema, no flags, no money paths. T1 = copy/routing cleanup; T2 = hero media panel reusing an existing recorded asset; T3 = gate + merge.

**Tech Stack:** Next.js 16 App Router (packages/crm), existing marketing palette/tokens, native `<video>`.

**Spec:** `docs/superpowers/specs/2026-07-04-onboarding-batch2-design.md`

## Global Constraints

- No new Stripe calls; no schema changes; no new env vars/flags; no new dependencies.
- `/signup/billing/page.tsx` is NOT modified.
- Exact copy strings: tagline `Your website, booking, CRM, and AI receptionist — live in minutes.` · caption `A real build — 60 seconds, unedited.` · CTA `Try it with your URL →`.
- `heroSubmitTarget` and the paste-box submit flow byte-unchanged (`tests/unit/marketing-hero-target.spec.ts` must still pass untouched).
- `/welcome` stays in `SAFE_REDIRECT_PREFIXES` (old links must resolve, now to the redirect).
- Verify commands run from `packages/crm`; commit per task.

## Pinned facts

- Stale comment: `src/app/(auth)/signup/signup-form.tsx:12-15` (claims default → /signup/billing; reality: `buildSignupNextPath()` → `/clients/new`, billing only via `lib/billing/limits.ts:109` and `lib/billing/domain-gate.ts:21-22`).
- Tagline: `src/app/(auth)/signup/page.tsx:89`. Check `login/page.tsx` for the same line.
- Welcome page: `src/app/(onboarding)/welcome/page.tsx` (104 lines; `enterDashboardAction` sets `settings.welcomeShown` then redirects `/dashboard?fromWelcome=1`; page is dormant — nothing routes to it).
- Hero: `src/components/landing/marketing-hero.tsx` (above-fold stack ends with proof checklist ~:335-342 then `<MarketingDemoMarquee />` ~:345-347; `ungatedBuildEnabled` prop exists from batch 1).
- Assets: `public/marketing/walkthrough/spin-up-60-seconds.mp4` + `.gif`; posters available at `public/shots/<slug>.jpg` (slugs listed in `marketing-demo-marquee.tsx:19-29`).

---

### Task 1: Cleanup — retire /welcome, truthful comment, plain tagline (#4+#5)

**Files:**
- Modify: `packages/crm/src/app/(onboarding)/welcome/page.tsx` (replace with redirect)
- Modify: `packages/crm/src/app/(auth)/signup/page.tsx:89` (tagline)
- Modify: `packages/crm/src/app/(auth)/signup/signup-form.tsx:12-15` (comment only)
- Maybe modify: `packages/crm/src/app/(auth)/login/page.tsx` (only if it renders the same Soul tagline — check first)

- [ ] **Step 1:** Read `welcome/page.tsx` fully. Replace the page with a minimal server component:

```tsx
import { redirect } from "next/navigation";

// 2026-07-04 — the Soul/Blocks/Framework welcome interstitial is retired
// (audit fix #5: jargon-free onboarding; nothing routed here since the
// paste→build flow became the default landing). The route stays so old
// magic-link callbacks and bookmarks resolve; they now land on the
// dashboard directly. Spec: docs/superpowers/specs/2026-07-04-onboarding-batch2-design.md
export default function WelcomePage() {
  redirect("/dashboard");
}
```

Delete `enterDashboardAction` and any welcome-only helpers/imports IF nothing else imports them (grep `enterDashboardAction` + `fromWelcome` first; if `/dashboard` reads `fromWelcome=1`, leave that reading code alone — it just never fires).
- [ ] **Step 2:** `signup/page.tsx:89` — replace the tagline string with exactly `Your website, booking, CRM, and AI receptionist — live in minutes.` Check `login/page.tsx` (and its form) for the same "One Soul…" line; if present, apply the same replacement.
- [ ] **Step 3:** `signup-form.tsx:12-15` — rewrite the stale comment to describe the real flow: default redirect = `/clients/new` (with url/biz prefill); `/signup/billing` is reached only from upgrade gates (workspace limit, custom-domain upsell). Comment change only — no code.
- [ ] **Step 4:** Grep-proofs (paste outputs in the report): (a) `grep -rn "signup/billing" src` → every hit is the page itself, the unused-in-cold-flow helper, or an upgrade gate — quote each with one-line classification; (b) `grep -rn "Soul" src/app/(auth) src/app/(onboarding)"` → zero user-facing hits remain; (c) `grep -rn "/welcome" src` → allowlist + any dashboard `fromWelcome` reader only.
- [ ] **Step 5:** Verify — `node --import tsx --test tests/unit/signup-redirect.spec.ts` (44/44, /welcome prefix untouched); `pnpm typecheck` (baseline-only); `pnpm check:use-server`.
- [ ] **Step 6:** Commit — `git commit -m "cleanup(onboarding): retire /welcome interstitial, plain-language signup tagline, truthful billing comment (#4+#5)"`

---

### Task 2: Hero proof panel — the real 60-second build (#6)

**Files:**
- Modify: `packages/crm/src/components/landing/marketing-hero.tsx`
- Create (only if the media element warrants a client island): `packages/crm/src/components/landing/hero-build-proof.tsx`

**Interfaces:**
- Consumes: `ungatedBuildEnabled` prop (already on MarketingHero from batch 1); assets `public/marketing/walkthrough/spin-up-60-seconds.mp4` (+ `.gif`), poster from `public/shots/<slug>.jpg` (pick the first `LIVE_DEMOS` slug in `marketing-demo-marquee.tsx:19-29`).

- [ ] **Step 1:** Read `marketing-hero.tsx` fully (layout, breakpoints, palette tokens) + `marketing-demo-marquee.tsx:19-29` (poster slug).
- [ ] **Step 2:** Build the proof panel as `HeroBuildProof` (client component `"use client"` — it needs matchMedia for reduced motion):
  - Container: fixed aspect-ratio box (16:10 or match the video's true ratio — check the file) with the hero's card styling (rounded, border, shadow consistent with the paste box), so zero layout shift.
  - Default: `<video src="/marketing/walkthrough/spin-up-60-seconds.mp4" muted autoPlay loop playsInline preload="none" poster="/shots/<slug>.jpg" />`.
  - `prefers-reduced-motion: reduce` → render the poster `<img>` + a visible play button; clicking swaps in the video (user-initiated, not autoplaying).
  - Under the panel: caption `A real build — 60 seconds, unedited.` (muted ink token) + CTA link `Try it with your URL →` with `href={ungatedBuildEnabled ? "/try" : "/signup"}` (plain `<a>`/`<Link>` matching hero idiom).
- [ ] **Step 3:** Place it: desktop `lg:` two-column — existing headline/CTAs/paste-box stack left (keep widths readable, ~55/45), `HeroBuildProof` right, vertically centered; below `lg`: panel renders directly after the paste box, before the proof checklist. The marquee and all sections below remain untouched.
- [ ] **Step 4:** Verify — `node --import tsx --test tests/unit/marketing-hero-target.spec.ts` (2/2 untouched); `pnpm typecheck`; `pnpm check:use-server`. Report must state the chosen poster slug + the video's real aspect ratio.
- [ ] **Step 5:** Commit — `git commit -m "feat(marketing): above-the-fold proof — real 60s build video in the hero with reduced-motion fallback (#6)"`

---

### Task 3: Gate + merge

- [ ] **Step 1:** From `packages/crm`: `node --import tsx --test tests/unit/marketing-hero-target.spec.ts tests/unit/signup-redirect.spec.ts` → all pass; `pnpm typecheck` → baseline-only; `pnpm check:use-server` → clean; `pnpm build` → succeeds.
- [ ] **Step 2:** Update `.superpowers/sdd/progress.md` (batch-2 section) with both task lines + gate results.
- [ ] **Step 3:** After review approvals: `git push -u origin feature/onboarding-batch-2 && git push origin feature/onboarding-batch-2:main` (fast-forward; confirm `origin/main` hasn't moved first with `git rev-list --left-right --count origin/main...HEAD`).

## Self-review

Spec coverage: T1 covers spec-T1 (all four bullets incl. grep-proofs), T2 covers spec-T2 (panel, media behavior, copy, placement, constraints), T3 covers spec-T3. No placeholders; copy strings pinned verbatim; file paths exact; the only judgment points (poster slug, aspect ratio, login-page tagline presence) are explicit LOCATE-in-task steps with report requirements.
