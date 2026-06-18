# SeldonFrame Pricing Backend — Design Spec

**Date:** 2026-06-18
**Status:** Approved (brainstorm). Pending implementation plan.
**Replaces:** the legacy Free / $29 Growth / $99 Scale + BYOK billing model.

## Goal

Replace the legacy billing model with a three-tier ladder whose revenue **scales as
customers (agencies) succeed**. As an agency sells more client workspaces and deploys
more voice receptionists, SeldonFrame earns more — without surprise usage bills.

## Core principle

Two **seat-based** expansion levers — per active workspace, and per voice agent —
billed as predictable Stripe **quantity** items. No metered usage wallet and no
rev-share take-rate in v1 (both deliberately deferred; see Out of Scope).

## The tier ladder

| Tier | Price | Includes | Audience |
|---|---|---|---|
| **Builder** | $19/mo | Up to 10 standalone landing pages; own domain + branding; managed AI generation. No CRM / booking / agents. | Freelancers, SMBs testing the water |
| **Workspace** | $49/mo | One complete workspace — website, booking, intake, CRM, chatbot. Managed AI. 1 chat agent included. Optional voice add-on. | SMB running its own front office |
| **Agency** | $297/mo | White-label platform; **10 active client workspaces included, +$10/mo each beyond**; voice add-ons; marketplace; priority support. | Agencies reselling DFY (and Seldon Studio) |

- **No free tier.**
- **No BYOK** — managed inference is included on every tier; the "paste your Anthropic
  key" gate is removed.

## Expansion lever 1 — per active workspace (Agency only)

- Agency base ($297) includes **10 active workspaces**.
- Each additional **active** workspace: **+$10/mo**.
- **"Active" = published (live to the public) AND not archived/suspended.** Drafts and
  trials do not bill.
- Billed as a Stripe quantity-based recurring item: `qty = max(0, activeWorkspaces − 10)`.
- Workspace tier is strictly 1 workspace; to manage multiple / white-label, upgrade to
  Agency. The per-workspace lever does not apply to Builder or Workspace.

## Expansion lever 2 — per voice receptionist (Workspace + Agency)

- Voice (OpenAI Realtime) agent add-on: **+$99/mo per agent**, **500 voice-minutes/mo
  included**.
- Beyond 500 min: **notify the operator + soft-throttle** the agent. No per-minute
  overage billing — keeps pricing predictable; the cap protects margin (≈$60 max
  OpenAI cost at 500 min vs $99 price).
- **Chat agents are included free** (cents of LLM tokens). Only **voice** is a paid SKU.
- Billed as a Stripe quantity-based recurring item: `qty = # active voice agents`.
- **New build:** voice minutes are NOT tracked today (the usage-mapping audit confirmed
  no call-duration field exists). A voice-minute meter is required to enforce the
  500-min allotment.

## Stripe architecture

- **Products / prices (5 recurring):** Builder $19, Workspace $49, Agency $297 (bases) +
  workspace-overage $10 (quantity) + voice-agent $99 (quantity). These replace the live
  Growth ($29, `price_1TRt9a…`) and Scale ($99, `price_1TRtA0…`) prices.
- **Agency subscription composition:** one subscription, up to 3 items — base ($297),
  workspace-overage (qty), voice-agent (qty). Workspace subscription: base ($49) +
  optional voice-agent (qty).
- **Quantity sync (live):** on workspace publish/archive and voice-agent add/remove,
  update the matching Stripe subscription-item quantity via API (debounced).
- **Reconcile cron (backstop):** a nightly job recomputes active-workspace and
  voice-agent counts from the DB and pushes corrected quantities to Stripe. Idempotent,
  mirrors the existing `meters.ts` cron pattern. Guarantees Stripe never drifts from
  reality even if a live-sync call is missed.
- Use **licensed (quantity) prices, not metered** — invoices read "14 workspaces × $10",
  fully predictable.

## Plan-gate rewrite

Touches the existing billing module (`src/lib/billing/*`):

- Remove the `free` tier from `plans.ts` and `TIER_FEATURES` (`features.ts`).
- Remove the **BYOK gate** (the `getOperatorByokAnthropicKey` 412 in
  `web-onboarding/run-create-from-url.ts`): managed inference for all tiers.
- New tier ids in `plans.ts` / `TIER_FEATURES` / `feature-flags.ts`: `builder`,
  `workspace`, `agency`.
  - `builder`: landing pages only (cap 10), own domain + branding; no CRM / booking /
    agents / portal.
  - `workspace`: 1 full workspace, all modules, managed AI, custom domain, client portal,
    1 chat agent, optional voice add-on.
  - `agency`: white-label (`partner_agencies`), 10 workspaces included + overage, voice
    add-ons, marketplace, priority support.
- `normalizeTierId` / `LEGACY_PLAN_ID_REMAP`: `growth / cloud-starter / starter →
  workspace`; `scale / cloud-pro / pro-* / cloud-agency → agency`; `free → inactive (no
  longer offered)`.
- Rewrite `entitlements.ts` `canX()` helpers + the `feature-flags.ts` minimum-tier map
  for the new tier names.
- `enforceWorkspaceLimit` (`limits.ts`): builder = 0 full workspaces (landing pages have
  their own cap of 10), workspace = 1, agency = unlimited (billed per-seat past 10).

## Billing-state consolidation

The audit found billing state split across two tables that can drift
(`users.planId/stripeCustomerId/stripeSubscriptionId` written by the webhook, vs
`organizations.subscription` JSONB read by the app). Fix:

- **Single source of truth: `organizations.subscription` (JSONB).**
- The platform billing webhook (`/api/webhooks/stripe-billing`) writes to
  `organizations.subscription` instead of `users`.
- `getOrgSubscription` / `resolveTierForWorkspace` already read
  `organizations.subscription` — keep.
- Stop writing the `users` billing columns (leave them readable during the migration
  window for back-compat, then drop later).

## Migration — reset all except Seldon Studio

- **Seldon Studio (org `e1b16f47-d90a-4f3f-adb5-484b639ff0ed`) → Agency tier**, comped
  owner account (Max's own white-label agency).
- Its 9 demo workspaces (children via `parentAgencyId`) become its **included** client
  workspaces (count toward the 10).
- **Every other org → reset** to the new model: clear legacy Stripe subscription state,
  set to no active paid plan. They are test/demo data. APEX (the $1 smoke-test) is
  included in the reset.
- One-time migration script: identify Seldon Studio + its children; comp Seldon Studio to
  Agency; null out legacy billing fields on all other orgs; optionally archive obvious
  test orgs.
- New pricing applies to all new signups. **No grandfathering needed** — no real
  third-party paying customers exist besides Max's own account.

## Marketing alignment

seldonframe.com is being refreshed **SMB-first**, with the Agency offer presented simply
as "**$297/mo white-label**." The +$10/workspace and +$99/voice mechanics live
in-product (billing + dashboard), not on the marketing pricing cards.

## Out of scope (v1 — noted for future)

- **Metered usage wallet** (prepaid credits + overage for SMS / AI tokens beyond
  allotments). Deferred — agencies dislike surprise usage bills.
- **Rev-share take-rate** (Stripe Connect `application_fee_amount` on agency→client
  billing; infra exists, currently 0%).
- **Yearly pricing** (the `stripeYearlyPriceId` fields are empty today; monthly-only for
  v1).

## Suggested implementation phases (for the plan)

1. **Schema + types** — new tier enum; subscription-item refs on
   `organizations.subscription`; new voice-minute usage table.
2. **Stripe products/prices** — 3 base + 2 quantity add-ons; env/constants in
   `price-ids.ts`.
3. **Subscription composition + quantity sync** — publish/archive + agent hooks +
   nightly reconcile cron.
4. **Voice-minute meter** — record call duration; 500-min allotment; throttle + notify.
5. **Plan-gate rewrite** — remove free + BYOK; new `TIER_FEATURES` / `entitlements` /
   `feature-flags`; workspace-limit logic.
6. **Billing-state consolidation** — webhook → `organizations.subscription`; stop
   `users.planId` writes.
7. **Migration script** — Seldon Studio → Agency (comped); reset the rest.
8. **Tests + smoke** — gate logic, quantity sync, reconcile idempotency, migration;
   manual smoke on a Vercel preview.

## Constraints carried from prior sessions

- Max enters Stripe secret keys himself — do not handle them.
- Build payment features on a branch; do not merge/deploy until tested.
- No prod DB writes from subagents — output SQL, the operator runs it.
- The card never touches the server (Stripe-hosted checkout / SetupIntent).
