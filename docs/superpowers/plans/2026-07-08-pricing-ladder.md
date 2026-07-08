# Pricing Ladder — build plan (2026-07-08)

Spec: `docs/superpowers/specs/2026-07-08-pricing-ladder-design.md` (read it first).
Worktree: `.claude/worktrees/pricing-ladder`, branch `feature/pricing-ladder`.
TDD per task (watch the test fail first), commit per task, diff-only edits.
No migration anywhere. No new Stripe call sites — reuse checkout/webhook.

## Files touched (the complete list — nothing outside it)

- `packages/crm/src/lib/billing/plans.ts`
- `packages/crm/src/lib/billing/features.ts`
- `packages/crm/src/lib/billing/price-ids.ts`
- `packages/crm/src/lib/billing/limits.ts`
- `packages/crm/src/lib/billing/tier-resolver.ts` (only if resolution needs the new ids surfaced — expected no-op)
- `packages/crm/src/lib/partner-agencies/store.ts` callers (attach actions — grep `attachWorkspaceToAgency(`)
- `packages/crm/src/app/api/stripe/checkout/route.ts`
- `packages/crm/src/app/api/webhooks/stripe-billing/handlers.ts` (only if price→tier map isn't fully data-driven from price-ids.ts)
- `packages/crm/src/components/billing/upgrade-modal.tsx`
- `packages/crm/src/app/pricing/pricing-shell.tsx`
- `packages/crm/src/app/pricing/page.tsx` (Task 6 only)
- `packages/crm/src/components/landing/marketing-pricing-section.tsx`
- `packages/crm/src/components/landing/marketing-faq-section.tsx` (Task 6 only)
- `packages/crm/src/lib/ai/client.ts`
- `packages/crm/src/lib/agents/runtime.ts` (one call-site wrap at ~:286)
- `packages/crm/src/components/dashboard/agency-key-banner.tsx` (new)
- one dashboard layout/page include for the banner (locate the dashboard shell; smallest insertion)
- `packages/crm/src/lib/seo/alternative-pages.ts` (Task 6 only)
- Tests: `tests/unit/billing-plans-catalog.spec.ts`, `tests/unit/billing-checkout-items.spec.ts`, `tests/unit/landing/marketing-pricing.spec.ts`, `tests/unit/landing/marketing-faq.spec.ts` (rewrites); `tests/unit/billing/subaccount-limit.spec.ts`, `tests/unit/ai/resolve-runtime-client.spec.ts` (new)

## Task 1 — the catalog (plans + features + price ids)

Test first: REWRITE `tests/unit/billing-plans-catalog.spec.ts` to pin:
- 7 `PLANS` entries: sellable `builder($29)`, `managed($49)`, `agency_starter($99)`,
  `agency_growth($199)`, `agency_scale($299)`; grandfathered `workspace($49)`,
  `agency($29-flat)` with `sellable:false` and their CURRENT limits untouched.
- New `Plan.limits.maxSubAccounts`: builder 0 · managed 0 · starter 10 ·
  growth 30 · scale -1 · workspace 0 · agency -1 (grandfathered keeps whitelabel).
- New `Plan.sellable: boolean`.
- Feature booleans: `fullWhiteLabel`/`clientPortal` true ONLY on agency_* (+
  grandfathered `agency`); front-office booleans (crm/booking/intake/agents)
  true on ALL tiers.
- `normalizeTierId` UNCHANGED for legacy (`growth`→`workspace`, `scale`→`agency`)
  and passes through the 5 new ids.
Implementation: `plans.ts` (TierId union + entries + fields), `features.ts`
(TIER_FEATURES for new ids), `price-ids.ts` (4 env vars
`STRIPE_MANAGED_PRICE_ID`, `STRIPE_AGENCY_STARTER_PRICE_ID`,
`STRIPE_AGENCY_GROWTH_PRICE_ID`, `STRIPE_AGENCY_SCALE_PRICE_ID` with
`price_PLACEHOLDER_*` defaults; add to ALLOWED_PRICE_IDS; extend
price→tier resolution; export `isPlaceholderPriceId(id)` = `/^price_PLACEHOLDER_/`).
Commit: `feat(billing): 5-tier catalog + grandfathered legacy plans`.

## Task 2 — sub-account gate

Test first: NEW `tests/unit/billing/subaccount-limit.spec.ts` (DI fakes, no DB):
`maxSubAccountsForTier` per tier; `enforceSubAccountLimit({tier, currentCount})`
pure-core allows under cap, rejects at cap with
`{ok:false, reason:"subaccount_limit_reached", used, limit}`, `-1` = unlimited,
grandfathered `agency` unlimited.
Implementation: pure core in `limits.ts` + a thin
`enforceSubAccountLimitForUser(userId)` that resolves tier
(`resolveTierForWorkspace` of the user's primary org — same read path as
enforceWorkspaceLimit) and counts via `fetchAgencyAttachedWorkspaceIds`.
Wire it into every caller of `attachWorkspaceToAgency` (grep; wrap BEFORE the
store call; store stays pure). Rewrite `upgrade-modal.tsx` copy: free branch
unchanged; paid branch shows the NEW ladder cards (managed/starter/growth/scale
as relevant) — kill the stale "$49 workspace / $297 agency" copy.
Commit: `feat(billing): sub-account limit on the handoff boundary`.

## Task 3 — checkout accepts the new tiers

Test first: REWRITE `tests/unit/billing-checkout-items.spec.ts`: checkout
params built for each sellable tier map to its price id; a PLACEHOLDER price id
→ `{ok:false, reason:"tier_unavailable"}` (no Stripe call); legacy remapped ids
still resolve; non-sellable ids rejected for NEW checkouts.
Implementation: `checkout/route.ts` validates tier against sellable PLANS,
returns 409 `tier_unavailable` on placeholder price (money-safe: inert without
env). Webhook side should be data-driven already; extend only if the price→tier
map lives outside price-ids.ts.
Commit: `feat(billing): checkout for the 5-tier ladder (inert without env)`.

## Task 4 — pricing page toggle (flag `SF_TIER_LADDER`)

Test first: REWRITE `tests/unit/landing/marketing-pricing.spec.ts` (and add
pricing-shell coverage if a spec exists): flag OFF → current single-$29 view
byte-compatible (pin the $29 card + absence of tier names); flag ON → toggle
with 2 personal cards + 3 agency cards using the words "sub-accounts",
CTAs carry the new tier ids, placeholder-priced tiers render "Book a demo"
(href `https://app.seldonframe.com/book/seldonframes-workspace-7798/default`).
Implementation: `pricing-shell.tsx` — audience toggle, cards data-driven from
`PLANS.filter(p => p.sellable)`; flag read server-side in `pricing/page.tsx`
and passed as prop. `marketing-pricing-section.tsx`: flag-gated single line
under the $29 card: "Running client sub-accounts? Agency plans from $99 →"
(link /pricing). NO FAQ edits in this task.
Commit: `feat(pricing): audience-toggle pricing page behind SF_TIER_LADDER`.

## Task 5 — agency key inheritance (flag `SF_AGENCY_KEY_INHERIT`)

Test first: NEW `tests/unit/ai/resolve-runtime-client.spec.ts` (DI fakes):
resolution order = own BYOK → (flag on + parentAgencyId) agency owner org's
BYOK → platform fallback; agency owner org resolved
`partner_agencies.ownerWorkspaceId ?? (ownerUserId → users.orgId)`; every
failure path falls through to today's behavior (fail-soft — never throws).
Implementation: `lib/ai/client.ts` adds `resolveRuntimeAiClient({orgId})`
(injectable lookups; wraps getAIClient) + `resolveAgencyKeyOrgId(parentAgencyId)`
helper; `runtime.ts:286` uses it when `SF_AGENCY_KEY_INHERIT` is set, else
`getAIClient` untouched. Advisory banner: new
`components/dashboard/agency-key-banner.tsx` — server-computed props: show when
active org `parentAgencyId` set AND no BYOK key AND `createdAt` > 14 days AND
flag on; copy: "This sub-account is running on SeldonFrame's keys — add your
agency AI key so client agents run at your raw cost." Link /settings
integrations. Insert in the dashboard shell (smallest seam).
Commit: `feat(ai): agency key inheritance + launch-window banner (flagged)`.

## Task 6 — the flip commit (LAST; cherry-pickable)

No test changes beyond copy pins. In ONE commit clearly labeled
`feat(pricing): flip-time copy — registry + FAQs`:
- `lib/seo/alternative-pages.ts` SF_COLUMN.pricingModel →
  `"From $29/mo flat — unlimited workspaces (agency whitelabel from $99/mo)"`.
- `pricing/page.tsx` FAQS + `marketing-faq-section.tsx`: mention the ladder
  (keep "$29/mo flat" as the anchor truth), update marketing-faq.spec.ts pins.
This commit merges only when Max flips the flags (see spec §6).

## Regression set (grep must be empty)

`git diff --name-only origin/main..HEAD | grep -E "bookings/actions|create-for-customer|messaging/|lib/sms/|agents/booking/|voice/openai|landing-r1/"`

## Verify

`node --import tsx --test` on the six named spec files (fail 0) → tsc delta vs
baseline (~23 incl. junction staleness; 0 NEW outside .next) → check-use-server
→ regression grep → report. Maker writes
`.superpowers/sdd/pricing-ladder-report.md` (Files changed first, verbatim test
tails).
