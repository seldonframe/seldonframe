# Onboarding Batch 2 — Audit Fixes #4 / #5 / #6 (re-scoped)

**Design spec — 2026-07-04.** Follow-up to `2026-07-03-web-activation-design.md` §12. Approved by Max after the current-state pinning revised the scope.

## Context — what the pinning found on main @ 99e0927e

- **#4 is already true in the flow.** Cold signup → `/clients/new` directly (`buildSignupNextPath()`, `signup/page.tsx:76-81`); `/signup/billing` is reached ONLY from upgrade gates (`enforceWorkspaceLimit` → `/settings/billing` at `lib/billing/limits.ts:109`; domain upsell → `/signup/billing?next=/settings/domain` at `lib/billing/domain-gate.ts:21-22`) and has two skip affordances. The audit was misled by a **stale comment** at `signup-form.tsx:12-15` claiming the default path lands on `/signup/billing`.
- **#5's wizard is already dead.** Zero references to `/setup` on main. The surviving jargon: the dormant `(onboarding)/welcome/page.tsx` (8 hits: "Your Soul" / "Your Blocks" / "Your Framework"; nothing routes to it) and the signup tagline `signup/page.tsx:89` — "One Soul powering every block in your business."
- **#6 is real work with an existing asset.** Hero above-the-fold = copy + CTAs + paste box; proof (screenshot marquee) sits below; the "60s" section uses terminal mockups. A **real recorded 60-second build** exists: `public/marketing/walkthrough/spin-up-60-seconds.mp4` + `.gif`.

## Scope (3 tasks, no migration, no flags, no money paths)

### T1 — Cleanup: retire /welcome, plain-language tagline, truthful comment (#4 + #5)
- Replace `(onboarding)/welcome/page.tsx` body with a server `redirect("/dashboard")` (keep the route so old links don't 404; delete the now-unused `enterDashboardAction` if nothing else imports it). `SAFE_REDIRECT_PREFIXES` keeps `/welcome` (harmless; old magic links resolve to the redirect).
- `signup/page.tsx:89` tagline → `"Your website, booking, CRM, and AI receptionist — live in minutes."` (exact copy; also update the login page if it shows the same line — check).
- Fix the stale comment at `signup-form.tsx:12-15` to describe the real flow (default → `/clients/new`; billing only via upgrade gates).
- Grep-proof in the task report: every remaining `signup/billing` reference is an upgrade-gate path (quote them); every remaining page-level "Soul"/"block" copy hit is either deleted with /welcome or intentionally retained (list any survivors outside auth/onboarding with one-line justification — dashboard-internal copy is out of scope).

### T2 — Hero proof panel: the real 60-second build, above the fold (#6)
- `marketing-hero.tsx`: add a "Watch it build" media panel above the fold — desktop: two-column at `lg` (existing copy+paste stack left, video right); mobile: video stacks directly under the paste box, before the proof checklist/marquee.
- Media: `<video>` with `src=/marketing/walkthrough/spin-up-60-seconds.mp4`, `muted autoPlay loop playsInline preload="none"`, `poster` = an existing real workspace shot (`/shots/<first LIVE_DEMOS slug>.jpg` — implementer picks from `marketing-demo-marquee.tsx:19-29`), lazy via `loading`-appropriate technique; `prefers-reduced-motion` → render the static poster `<img>` (no autoplaying video), with a play button that swaps in the video on click.
- Caption under the panel: `"A real build — 60 seconds, unedited."` Overlay/adjacent CTA: `"Try it with your URL →"` → `href = ungatedBuildEnabled ? "/try" : "/signup"` (the prop already flows into MarketingHero from batch 1).
- Constraints: no layout shift (reserve aspect-ratio box); no new deps; palette/tokens match the hero; the paste box remains the primary action (video is proof, not the hero CTA); marquee + everything below unchanged.

### T3 — Verify gate + merge
- `pnpm typecheck` (baseline-only), `pnpm check:use-server`, `pnpm build`; existing unit specs untouched and passing (`marketing-hero-target.spec.ts`, `signup-redirect.spec.ts` — /welcome stays allowlisted).
- No new unit specs: T1/T2 are copy/UI; verification = the gate + quoted grep-proofs in reports.
- Review per task (spec + quality), then whole-branch review only if any task needed a fix round; merge `feature/onboarding-batch-2` → main (flag-independent; all changes are live immediately — they are copy/proof improvements safe without `SF_WEB_UNGATED_BUILD`).

## Global constraints
- No new Stripe calls; no schema changes; no new env/flags; no new dependencies.
- `/signup/billing` page itself is NOT modified (its upgrade-gate role is correct).
- Exact tagline + caption copy as written above; CTA copy "Try it with your URL →".
- Byte-safety: `heroSubmitTarget` behavior and the paste box submit flow unchanged.

## Out of scope
- Rewriting `/signup/billing` UX, `/welcome` content resurrection, marquee changes, the BuildSteps mockups, recording a new video.
