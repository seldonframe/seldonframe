# Pricing Ladder — design spec (2026-07-08)

Feature: the 5-tier pricing ladder — pricing-page audience toggle, plan gating
on the handoff boundary, the comparison-registry copy edit, and the
agency-key-inheritance seam with a launch window.

Model (approved by Max over 2026-07-07/08; artifact v2 + wedge/pricing docs):
**SF keys build everything; the agency's one key runs sub-account agents;
Managed $49 runs entirely on SF keys; rails (2%/5%) on every tier.** Builder
vocabulary = "workspaces (your own businesses)"; agency vocabulary =
"sub-accounts", counted at the handoff.

## 0. Grounded seam map (scout recon 2026-07-08, refs = origin/main @ ca2418bbd)

- **Tiers:** `lib/billing/plans.ts:38` `TierId = "builder"|"workspace"|"agency"`;
  `PLANS[]` at :106-202 (price, stripePriceId, limits incl. maxOrgs + feature
  booleans). `lib/billing/features.ts:30-133` TIER_FEATURES + `normalizeTierId`
  (legacy remaps growth→workspace, scale→agency).
- **Resolution:** `lib/billing/tier-resolver.ts:67-133` — subscription.tier
  (jsonb) → plan (text) → agency chain walk. **No migration needed** (tier is a
  jsonb string).
- **Write path:** `/api/stripe/checkout/route.ts:76-150` (tier in body →
  buildCheckoutSessionParams) → webhook `stripe-billing/handlers.ts`
  `resolveTierFromPriceIds` → `updateOrgSubscription` (subscription.ts:21-43).
  Price env vars in `lib/billing/price-ids.ts` (+ ALLOWED_PRICE_IDS allowlist);
  the live $29 = `STRIPE_AGENCY_BASE_PRICE_ID` → tier **"agency"** (repurposed
  2026-06-22).
- **Stale UI:** `components/billing/upgrade-modal.tsx:40-75` still shows legacy
  "$49 workspace / $297 agency" copy.
- **Pricing surfaces:** `app/pricing/page.tsx` + `pricing-shell.tsx` (PLAN
  const $29, trust signals, features grid, FAQ×4);
  `components/landing/marketing-pricing-section.tsx` ($29 card);
  `marketing-faq-section.tsx` (9 FAQs incl. $29+GMV).
- **Stale tests (~29 assertions, $19/$49/$297):**
  `tests/unit/landing/marketing-pricing.spec.ts`,
  `tests/unit/billing-plans-catalog.spec.ts`,
  `tests/unit/billing-checkout-items.spec.ts`, parts of
  `tests/unit/landing/marketing-faq.spec.ts`.
- **Key resolution:** `lib/ai/client.ts:189-237` `getAIClient({orgId})` — org
  BYOK (organizations.integrations[provider].apiKey, encrypted) → platform
  `ANTHROPIC_API_KEY` env. Called from `lib/agents/runtime.ts:286`.
  ⚠ **Finding: today EVERY keyless org silently runs on platform keys** (mode
  "platform") — the dead-sub-account trap doesn't exist yet, but neither does
  the agency-pays economics. `builder_llm_keys` table exists, unused.
- **Handoff primitives:** `lib/partner-agencies/store.ts:16-20`
  `attachWorkspaceToAgency` sets `organizations.parent_agency_id`; enumeration
  `lib/billing/orgs.ts:303-330` `fetchAgencyAttachedWorkspaceIds`; portal
  invite `lib/deployments/actions.ts:997-1049`; owned-count
  `getOwnedWorkspaceCount` (ownerId, archivedAt IS NULL).

## 1. Decisions (with the two spec-time changes)

**D1 — Tier catalog.** `TierId = "builder" | "managed" | "agency_starter" |
"agency_growth" | "agency_scale"` + grandfathered legacy ids.
- builder $29: maxOrgs -1 (unlimited OWN workspaces), all front-office
  features, NO whitelabel/clientPortal, BYOK runtime.
- managed $49: maxOrgs 1, all front-office, SF-keys runtime (fair use), NO
  whitelabel.
- agency_starter $99 / growth $199 / scale $299: maxOrgs -1 own +
  **maxSubAccounts 10 / 30 / -1** (new limit field), whitelabel +
  clientPortal true; growth adds multi-deploy + ROI reports (feature booleans,
  UI may lag); scale adds API/MCP + resale control.
- **Grandfathering (one-way door, spec-time change #1):** existing payers hold
  tier `"agency"` (the repurposed $29-flat cohort) — their tier id, limits and
  price are NOT touched. `"agency"`, `"workspace"`, `"growth"`, `"scale"`
  remain in `normalizeTierId` as grandfathered aliases; they are simply no
  longer sold. New checkout sells only the 5 new ids.

**D2 — Sub-account counting.** Counted unit = `parent_agency_id` attachment
(archivedAt IS NULL). New `enforceSubAccountLimit(userId)` in
`lib/billing/limits.ts` (mirror of enforceWorkspaceLimit) using
`fetchAgencyAttachedWorkspaceIds`; enforced at `attachWorkspaceToAgency` and
any flow that auto-attaches. Over-limit → 402 `subaccount_limit_reached` →
upgrade modal (rewritten copy). Portal invite requires attachment.

**D3 — Key inheritance + launch window (spec-time change #2: SOFT window,
not hard cutoff).** New `resolveRuntimeAiClient(orgId)` wrapping
`getAIClient` at runtime.ts:286:
1. org's own BYOK key (unchanged, always wins),
2. NEW: if `parentAgencyId` set → the agency owner org's BYOK key,
3. platform env fallback (unchanged — the safety net stays).
Because platform fallback already catches everything, a hard 14-day cutoff
would introduce the dead-sub-account failure we're trying to avoid. v1 window
is **advisory**: sub-accounts >14 days old running on mode "platform" surface
a dashboard banner + (existing rails) operator email nudge "add your agency
key". Hard enforcement + the 200-run counter arrive WITH usage metering
(out of scope). Flag: `SF_AGENCY_KEY_INHERIT` (inheritance is a silent cost
shift onto agencies' keys for existing attached orgs — dark until Max flips).
Voice runtime (OPENAI env) untouched.

**D4 — Pricing page.** Rebuild `pricing-shell.tsx` with the audience toggle:
"For your businesses" (Builder $29 · Managed $49) / "For your clients'
businesses" (Starter $99 · Growth $199 · Scale $299, sub-account vocabulary).
CTAs POST the existing `/api/stripe/checkout` with the new tier ids. **Money-
safe:** a tier whose Stripe price env var is unset renders its CTA as
"Talk to us" (mailto/demo link) — inert without env, no new Stripe call
sites. Homepage `marketing-pricing-section` keeps the single $29 card
(one-number rule) + one quiet line "Running client sub-accounts? Agency plans
from $99 →" linking /pricing. FAQs updated on both surfaces. Flag:
`SF_TIER_LADDER` gates the toggle (dark → current single-card view).

**D5 — Comparison registry edit.** `lib/seo/alternative-pages.ts`
SF_COLUMN.pricingModel → `"From $29/mo flat — unlimited workspaces (agency
whitelabel from $99/mo)"`. True only when tiers are purchasable → this edit
ships in the branch but is INCLUDED in the flag-flip checklist, not merged
dark ahead of it (keep as the final commit, cherry-pickable). "from $29/mo
flat" alone is already true; the parenthetical waits for the flip.

**D6 — Stale tests are rewritten, not skipped** (verify-build rule: never
weaken the gate): the 4 spec files get rewritten to pin the NEW catalog +
grandfathered aliases.

## 2. Slices (build order)

- **T1 — catalog + gating:** plans.ts 5 tiers + maxSubAccounts; features.ts;
  price-ids.ts (4 new env vars, placeholder-inert, allowlist);
  normalizeTierId grandfathers; enforceSubAccountLimit + attach-site
  enforcement; checkout route accepts new tier ids; webhook resolves them;
  upgrade-modal copy rewrite. TDD against rewritten billing-plans-catalog +
  billing-checkout-items specs.
- **T2 — pricing page:** pricing-shell toggle (flagged), homepage line, FAQ
  updates; rewritten marketing-pricing/faq specs; vision-verify after deploy.
- **T3 — key seam:** resolveRuntimeAiClient (flagged) + advisory banner
  (dashboard) for stale-platform-mode sub-accounts; unit tests with DI fakes
  (no live keys).
- **T4 — registry copy** (final commit): SF_COLUMN edit → all 25 pages + md
  twins + llms.txt.

## 3. Regression set (forbidden paths)

`bookings/actions.ts` · `bookings/create-for-customer.ts` ·
`messaging/**` · `lib/sms/**` · `lib/agents/booking/**` · voice webhook ·
`landing-r1/**`. Billing invariants: no NEW Stripe call sites (reuse
checkout/webhook); every new price behind ALLOWED_PRICE_IDS; nothing changes
for existing subscriptions (grandfather test pins this).

## 4. Validation

`/verify-build` six checks (rewritten specs must pass; tsc delta vs baseline;
use-server; no migration → journal untouched; regression grep; live smoke of
/pricing + one checkout-intent 402 path) + vision-verify on /pricing (both
toggle states, desktop + mobile).

## 5. Out of scope (explicit)

Usage meter + caps · multi-client autopay console (next build) · hard
launch-window cutoff + run counter · voice key inheritance · Stripe price
CREATION (Max's console action) · homepage redesign.

## 6. Human actions (one batch, at flip time)

1. Create 4 Stripe prices ($49/$99/$199/$299) + set
   `STRIPE_MANAGED_PRICE_ID`, `STRIPE_AGENCY_STARTER_PRICE_ID`,
   `STRIPE_AGENCY_GROWTH_PRICE_ID`, `STRIPE_AGENCY_SCALE_PRICE_ID` in Vercel.
2. Flip `SF_TIER_LADDER=1`, then smoke one $49 test-mode checkout.
3. Flip `SF_AGENCY_KEY_INHERIT=1` after confirming your own agency key is set.
4. Approve the T4 registry-copy commit with the flip.
