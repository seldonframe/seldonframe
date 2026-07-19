# Agent Setup Mode — the multi-step funnel + in-place connect + celebration/share

**Date:** 2026-07-11 (Max-approved same day) · **Branch:** feature/record-to-agent, next slice AFTER the honest-verdict fix wave pushes · **Flag:** rides `SF_AGENT_LIFECYCLE`

## 0. Decisions (Max, settled)
1. **Two modes by lifecycle state.** Incomplete agent → **Setup mode**: one stage per screen, stepper navigation, single primary CTA, auto-advance on completion, "skip for now" everywhere, "View full page" escape hatch. Complete agent → the compact one-page home (collapsed stage rows). No toggle to discover — the page meets you where you are.
2. **In-place integration connect — NO redirects.** Connecting Gmail/Composio (or any toolkit) happens on the step the user is on. Never bounce to /integrations and make them find their way back.
3. **The wizard ends on a celebration screen** with the three Sell options — "your agent works — now what?" — the completion high IS the monetization moment (THE ONE value prop).
4. **Shareable card:** an OG-carded share page with an **animated SVG of THIS agent's workflow** — highly sharable, opt-in.

## 1. Setup mode (the funnel)
- Route/state: same page, `?stage=<learned|verified|connected|run|sell>` (URL-addressable → refresh/back/deep-link work). Server derives mode: any stage incomplete → Setup mode at the first incomplete stage; else home mode. Escape hatch swaps to home layout (`?view=full`).
- Screen contract per step: stage title + one-line why → the stage body (already-built components, kept mounted per F-A) → ONE primary CTA + "skip for now". Everything secondary (script viewer, old editor sections 01–04) stays behind the collapsed "Configure" disclosure inside Learned. Nothing from other stages renders.
- Stepper = the existing 5 chips, now clickable nav with completion glyphs; current step highlighted. Auto-advance: when the current stage's derived completion flips true (poll/refresh after actions), advance with a brief success beat (~800ms) — never a hard jump mid-reading; advance on the NEXT idle tick or a "Continue" that appears.
- Reuse: stage completion derivation (stage-derivation.ts), all stage bodies, lifecycleGate. New: the shell (mode resolution + stepper routing + advance logic, pure reducer + tests).

## 2. In-place connect (no-redirect OAuth)
- Composio OAuth requires a browser redirect by nature → use the **popup pattern**: Connect button opens `createConnectLink` URL in a `window.open` popup; the OAuth callback lands on a minimal route (`/integrations/connected?popup=1`) that renders a "Connected — you can close this window" page + `postMessage` to `window.opener` + self-close. Parent listens for the message AND polls a thin org-scoped status action (`listConnections`+`mapToolkitConnections`, already built for the Connected stage) every ~2s while the popup is open; on connected → row flips to ✓ in place, popup fallback-closes.
- Popup blocked → graceful fallback: same-tab redirect with `returnTo=<current stage URL>` carried through the callback (allowlist: same-origin /studio paths only — no open redirect).
- Same pattern applies anywhere a connect appears (Connected stage, routines confirm screen later). L-31: callback route exports handlers only; guards in lib.

## 3. Celebration screen + share card
- Trigger: supervised run flips to succeeded-verified while in Setup mode → the Run step resolves into **"Your agent works."** — a full-screen beat: the agent's name, the run's action count + proof line, then the three Sell options as cards (For myself · Marketplace [gate state shown] · To a client) — the Sell STAGE content, celebration-framed. Skip path: "take me to my agent" → home mode.
- **Share card (opt-in, never auto-public):** "Share what you built" on the celebration screen.
  - Mints a public share page `/a/<unguessable-slug>` (new public route, org resolved from the share row — NOT from session; slug is a capability token) showing: agent name, an **animated SVG pipeline of the flow model** (steps as nodes lighting up in sequence — CSS keyframe animation, no JS; reuse the guides-visual-engine SVG diagram conventions), "Built with SeldonFrame from a screen recording", CTA → **/record** ("Build yours from a screen recording").
  - `og:image`: static PNG variant of the same diagram via the existing `/api/og` rail (GHL-SEO precedent) — steps + arrows + brand frame.
  - Privacy gate: PREVIEW-before-publish — operator sees the exact card + step labels first; step labels pass the scrubber (emails/phones/URLs stripped) and are inline-editable in the preview; Publish writes a `share_cards` row (org_id, template_id, slug, sanitized steps jsonb, created_at) — additive migration. Unpublish = delete row (page 404s). Nothing renders publicly without the explicit Publish click.
- Distribution loop KPI: cards minted · share-page visits · share→/record starts (stamp `?ref=share-<slug>` and count starts; PostHog event, no PII).

## 4. Guards
- Setup mode = layout only — no new write paths; all actions are the existing stage actions. Flag-off untouched; home mode = current compact page.
- Share page is the ONLY new public surface: unguessable slug, sanitized content, no org identifiers beyond the operator-approved labels, opt-in, deletable (never-taxes applied to sharing).
- Optimistic path: popup connect polling has a timeout state ("still waiting — finish in the popup or retry"); celebration only fires on the DERIVED verified state, never on button click.

## 5. Build order (one implementer wave after the fix wave pushes)
T1 shell: mode resolution + stepper + URL state + advance reducer (tests). T2 step screens: per-stage single-CTA layout + Configure disclosure placement. T3 in-place connect: popup route + status poll + fallback (tests on the pure decision bits). T4 celebration screen. T5 share card: migration + mint/preview/publish actions + /a/[slug] + animated SVG + /api/og variant + scrubber tests. T6 vision-verify pass on Setup mode + celebration + share page.
Estimate: ~1,400–1,900 LOC incl. tests (UI composition 0.94x + one state machine ~1.3x + share backend).

## 6. Non-goals
Auto-posting to X (operator shares the link themselves) · share-page analytics dashboards · redesigning /record · multi-agent share galleries (later, marketplace-adjacent).
