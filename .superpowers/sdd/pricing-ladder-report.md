# Pricing Ladder — implementation report (2026-07-08)

Branch `feature/pricing-ladder`, 11 commits on top of `1b51475b3` (spec)
and `64042581f` (plan). All work done in the isolated worktree
`.claude/worktrees/pricing-ladder`. Commit 7
(`5c4bd7dcf`, `test(billing): re-pin entitlements to the 5-tier
policy`), commits 8-9 (`a1cf476e7` sub-account-cap gate fixes,
`da06cc101` upgrade-modal flag-gate + tier ranks), commit 10
(`ac09002c5`, the live-$29-checkout regression fix), and commit 11
(`231653b7e`, the marketing-branded /pricing rebuild) were added
post-review — see "Post-review follow-up", "Second post-review fix
wave", "Third post-review fix wave — live checkout regression", and
"Fourth follow-up — marketing-branded pricing page + CTA hierarchy"
below.

**Note:** between commits 10 and 11, `origin/main` advanced to
`6eb789a0c` with an unrelated SSR/metadata hotfix
(`3c77b6a1d`, "SSR both audience card rows (crawler-visible tiers) +
scrub stale $19 root metadata") that also touched `pricing-shell.tsx`
— pulled into this branch before starting commit 11's work; its
both-rows-SSR behavior is explicitly preserved in the rebuild (see
commit 11's section below).

## Files changed

**Task 1 — `5089ec164` feat(billing): 5-tier catalog + grandfathered legacy plans**
- `packages/crm/src/lib/billing/plans.ts` — `TierId` union expanded to 7
  (5 sellable + 2 grandfathered); `Plan.sellable` + `Plan.limits.maxSubAccounts`
  added; `PLANS[]` rewritten (5 new tier objects + grandfathered
  `workspace`/`agency` with untouched limits); top-of-file comment rewritten.
- `packages/crm/src/lib/billing/features.ts` — `TIER_FEATURES` gets 5 new
  keys + grandfathered `workspace`/`agency` keys (unchanged shape);
  `normalizeTierId` passes through the 5 new ids.
- `packages/crm/src/lib/billing/price-ids.ts` — 4 new env-backed price id
  constants (`MANAGED_PRICE_ID`, `AGENCY_STARTER_PRICE_ID`,
  `AGENCY_GROWTH_PRICE_ID`, `AGENCY_SCALE_PRICE_ID`) with
  `price_PLACEHOLDER_*` fallbacks; added to `ALLOWED_PRICE_IDS`
  (5 new + 2 grandfathered).
- `packages/crm/src/lib/billing/tier-resolve.ts` — `resolveTierFromPriceIds`
  (the webhook's data-driven price→tier map) extended for the 5 new tiers,
  ranked `agency_scale > agency_growth > agency_starter > agency
  (grandfathered) > managed > workspace (grandfathered) > builder`.
- `packages/crm/tests/unit/billing-plans-catalog.spec.ts` — rewritten,
  22 tests pinning the 7-tier catalog + grandfather invariants.

**Task 2 — `7fb04adef` feat(billing): sub-account limit on the handoff boundary**
- `packages/crm/src/lib/billing/limits.ts` — new pure
  `maxSubAccountsForTier` / `enforceSubAccountLimit` (reads
  `Plan.limits.maxSubAccounts`; no DB import, to avoid a circular import
  since `orgs.ts` already imports `enforceWorkspaceLimit` from this file).
- `packages/crm/src/lib/billing/orgs.ts` — exported
  `fetchAgencyAttachedWorkspaceIds` (was module-private) for the limit
  check to count current attachments.
- `packages/crm/src/app/api/v1/partner-agencies/route.ts` — new
  `enforceSubAccountLimitForUser` (DB-wired wrapper, lives here rather
  than in limits.ts to avoid the circular import); wired in BEFORE the
  `attachWorkspaceToAgency` store call on the `"attach"` op; returns 402
  `subaccount_limit_reached` on cap.
- `packages/crm/src/components/billing/upgrade-modal.tsx` — rewritten to
  the new ladder (Managed $49 / Agency Starter $99), replacing the stale
  "$49 workspace / $297 agency" copy.
- `packages/crm/tests/unit/billing/subaccount-limit.spec.ts` (new) —
  8 tests, pure-core DI.
- `packages/crm/tests/unit/billing-features.spec.ts` — collateral fix:
  the "builder" test pinned the OLD ($19, landing-pages-only) shape that
  Task 1's `features.ts` edit repurposed; updated to the new $29
  unlimited-workspaces shape.

**Task 3 — `20d6d1319` feat(billing): checkout for the 5-tier ladder (inert without env)**
- `packages/crm/src/lib/billing/checkout-items.ts` —
  `TIER_BASE_PRICE`/`tierFromBasePriceId` extended to all 7 tiers.
- `packages/crm/src/app/api/stripe/checkout/route.ts` — tier resolution
  (body.tier / lookup_key / priceId) covers the 5 new ids; new
  `Plan.sellable` gate rejects a resolved-but-non-sellable tier with 409
  `tier_unavailable`; the existing placeholder-price fail-soft (Hotfix
  H4b) now also carries `reason: "tier_unavailable"` and returns 409
  (was a bare 503).
- `packages/crm/tests/unit/billing-checkout-items.spec.ts` — rewritten,
  10 tests.

**Task 4 — `68e8cb8a0` feat(pricing): audience-toggle pricing page behind SF_TIER_LADDER**
- `packages/crm/src/app/pricing/pricing-shell.tsx` — new `<TierLadder>`
  component (audience toggle "For your businesses" / "For your clients'
  businesses", cards from `PLANS.filter(p => p.sellable)`, "Book a demo"
  CTA for placeholder-priced tiers); rendered below the existing
  single-$29 hero when `tierLadderOn` prop is true (default false).
- `packages/crm/src/app/pricing/page.tsx` — reads `SF_TIER_LADDER`
  server-side (strict `"1"` contract, local helper — did not add to
  `lib/web-build/policy.ts`, out of scope) and passes it to
  `<PricingShell>`. **Deviation**: the plan's global file list marks this
  file "(Task 6 only)"; Task 4's own task text explicitly requires
  wiring the flag here for the toggle to ever activate. Reconciled by
  treating "(Task 6 only)" as referring to the FAQ-copy edit only.
- `packages/crm/src/components/landing/marketing-pricing-section.tsx` —
  new `tierLadderOn` prop (default false); adds one flag-gated line
  under the $29 card ("Running client sub-accounts? Agency plans from
  $99/mo → See agency pricing", links `/pricing`). Card content
  unchanged when the flag is off.
- `packages/crm/src/lib/billing/plans.ts` — top-of-file comment updated
  (was describing the pre-ladder single-plan model; now describes the
  7-tier catalog + the flag's UI-only scope). No behavior change.
- `packages/crm/tests/unit/landing/marketing-pricing.spec.ts` —
  rewritten (previous spec pinned a stale 3-tier `data-tier` matrix that
  predated the 2026-06-22 single-card rewrite and was already failing at
  HEAD); 5 tests.

**Task 5 — `0cda290e2` feat(ai): agency key inheritance + launch-window banner (flagged)**
- `packages/crm/src/lib/ai/client.ts` — new `resolveAgencyKeyOrgId`
  (resolves `partner_agencies.ownerWorkspaceId ?? (ownerUserId ->
  users.orgId)`, DI-injectable, fail-soft) and `resolveRuntimeAiClient`
  (wraps `getAIClient`: own BYOK always wins → flag+parentAgencyId →
  agency owner's BYOK → platform fallback; every step wrapped so ANY
  error falls through to `getAIClient`'s own result — never throws).
- `packages/crm/src/lib/agents/runtime.ts` — the sole `getAIClient` call
  site (line ~286, inside a `"use server"` file) now calls
  `resolveRuntimeAiClient`. Voice (OPENAI) runtime untouched.
- `packages/crm/src/components/dashboard/agency-key-banner.tsx` (new) —
  purely presentational `<AgencyKeyBanner show={boolean}>`; all gating
  computed server-side.
- `packages/crm/src/app/(dashboard)/layout.tsx` — `activeOrg` select
  extended with `parentAgencyId` + `createdAt` (no extra query — same
  row already fetched); `showAgencyKeyBanner` computed (flag on +
  parentAgencyId set + no own Anthropic BYOK key + org age > 14 days);
  banner rendered next to `TestModeBanner`.
- `packages/crm/tests/unit/ai/resolve-runtime-client.spec.ts` (new) —
  13 tests (resolution order, both flag states, 5 distinct fail-soft
  paths).

**Task 6 — `878b56ee9` feat(pricing): flip-time copy — registry + FAQs** (isolated, last, cherry-pickable)
- `packages/crm/src/lib/seo/alternative-pages.ts` —
  `SF_COLUMN.pricingModel` → `"From $29/mo flat — unlimited workspaces
  (agency whitelabel from $99/mo)"`. Single source of truth consumed by
  all 25 `/vs/<competitor>` pages + their markdown twins
  (`alternative-markdown.ts`) + comparison components (`vs-page.tsx`,
  `alternative-page.tsx`) — verified no per-page literal copies exist.
  `llms.txt` only links to `/pricing` (no hardcoded pricing string).
- `packages/crm/src/app/pricing/page.tsx` — FAQS array: workspace-count
  and white-label answers now mention the agency ladder ($99/mo,
  sub-accounts) while keeping "$29/mo flat" as the Builder-plan truth.
- `packages/crm/src/components/landing/marketing-faq-section.tsx` — same
  two answers updated; "$29/mo flat" remains the homepage anchor
  (one-number rule).
- `packages/crm/tests/unit/landing/marketing-faq.spec.ts` — rewritten
  (previous spec pinned an even older $297/$497 GoHighLevel-era
  8-question ladder, already failing at HEAD before this branch —
  confirmed via `git stash`: current component renders 9 FAQs, not 8);
  8 tests pinning the current 9-question component + ladder mentions.

## Deviations from the plan (and why)

1. **`tier-resolve.ts` edited instead of `handlers.ts`.** The plan
   listed `handlers.ts (only if price→tier map isn't fully data-driven)`.
   Reading `handlers.ts` showed it imports `resolveTierFromPriceIds` from
   a *separate* file, `tier-resolve.ts` — that file **is** the
   data-driven price→tier map the plan was pointing at, just under a
   name the plan author guessed slightly wrong. Edited `tier-resolve.ts`
   directly; `handlers.ts` itself needed no changes.

2. **`orgs.ts` gained one export** (`fetchAgencyAttachedWorkspaceIds`,
   previously module-private) — necessary for the sub-account count and
   explicitly anticipated by the plan's "callers" phrasing, but not
   itself named as a file to touch. Minimal (one `export` keyword + a
   doc comment), no behavior change to the function itself.

3. **`enforceSubAccountLimitForUser` lives in `api/v1/partner-agencies/route.ts`,
   not in `limits.ts`.** `orgs.ts` already imports `enforceWorkspaceLimit`
   from `limits.ts`; had I added `orgs.ts`'s `fetchAgencyAttachedWorkspaceIds`
   as an import into `limits.ts`, that would create `limits.ts ↔ orgs.ts`
   circular import. Kept `limits.ts`'s new functions pure (no DB import)
   and put the DB-wired wrapper at the sole call site instead. The pure
   core (`maxSubAccountsForTier`, `enforceSubAccountLimit`) is exactly
   where the plan said it should be and is what's unit-tested.

4. **`tests/unit/billing-features.spec.ts` touched (not in the plan's
   file list).** Task 1's `features.ts` edit repurposed the `"builder"`
   key from the old $19 landing-pages-only shape to the new $29
   unlimited-workspaces shape. This broke a pre-existing test that
   pinned the old shape. Per CLAUDE.md/spec D6 ("never weaken the
   gate"), fixed it rather than leaving a broken test in the suite —
   4-line assertion change, no scope creep.

5. **`app/pricing/page.tsx` edited in Task 4, not held for Task 6.**
   The plan's global file list marks this file "(Task 6 only)", but
   Task 4's own task description explicitly says "flag read server-side
   in pricing/page.tsx and passed as prop." Without this, `tierLadderOn`
   would never be true and Task 4's toggle would be permanently dead
   code. Reconciled by wiring the flag-read + prop-pass in Task 4 and
   reserving the FAQ-copy edit (the actual Task 6 concern) for Task 6.

6. **`app/(public)/page.tsx` (homepage) NOT wired to pass `tierLadderOn`
   to `LandingMarketingPricingSection`.** This file isn't in the plan's
   file list. The component defaults `tierLadderOn` to `false`, so the
   flag-off (current, dark) behavior is unaffected — but the homepage's
   quiet ladder-pointer line can never actually appear even after Max
   flips `SF_TIER_LADDER=1`, until someone wires this one prop. Flagged
   as an open risk below rather than expanding scope.

7. **`lib/billing/feature-flags.ts` (FEATURE_TIERS / TIER_RANK) NOT
   updated** for the 5 new tier ids, even though it's logically adjacent
   to `features.ts`. Investigated: `hasFeature`/`tierMeetsMinimum` are
   defined but never called from any live app code path (only
   referenced in a comment) — confirmed via grep. Leaving it stale is
   inert today; flagged as an open risk in case a future caller adopts
   `hasFeature` and finds the 5 new tiers rank as 0 (unlock nothing).

8. **My original verify sweep's glob missed `tests/unit/billing-entitlements.spec.ts`
   entirely.** I ran the plan's 6 explicitly-named spec files plus a
   secondary sweep of `tests/unit/billing-features.spec.ts`,
   `tests/unit/billing-workspace-limit.spec.ts`, and
   `tests/unit/billing/*.spec.ts` (107 tests) — but never globbed the
   *other* top-level `tests/unit/billing-*.spec.ts` files (there are 10:
   byok-gate-removed, checkout-items, checkout-session-params,
   entitlements, features, plans-catalog, price-ids-placeholder-guard,
   tier-resolve, webhook-state-consolidation, workspace-limit), so
   `billing-entitlements.spec.ts` never ran. An independent
   verify-runner caught this with a wider sweep and found 2 stale pins.
   See "Post-review follow-up" below for the fix + the corrected full
   sweep.

## Post-review follow-up (commit 7 — `5c4bd7dcf`)

**What was wrong:** `tests/unit/billing-entitlements.spec.ts` had 2
tests pinning pre-ladder policy that Task 1's catalog change already
silently invalidated:
- `"only agency can submit + sell blocks"` (line 82) — the approved
  spec changed marketplace sell/rent to be available on EVERY sellable
  tier (5% fee uniformly), and `entitlements.ts`'s
  `canSubmitBlocks`/`canSellBlocks` already read
  `plan.limits.marketplace`, which Task 1 set `true` on builder,
  managed, and all 3 agency_* tiers (plus the grandfathered `agency`
  tier) — matching the new policy. Only the grandfathered `workspace`
  tier keeps `marketplace: false` (frozen, one-way door). **The
  production code was already correct**; only the test's expectations
  were stale.
- `"builder = 0 full workspaces (landing pages only)"` (line 100) —
  pinned the dead $19 builder shape. New builder (spec D1) is
  unlimited own workspaces (`maxOrgs: -1` → `getMaxOrgs`'s
  `Number.POSITIVE_INFINITY` sentinel).

**Route/action audit for divergent marketplace gating:** grepped every
`canSubmitBlocks`/`canSellBlocks` call site. `canSellBlocks` has no
live caller anywhere in `src/`. `canSubmitBlocks` has exactly one
caller — `lib/marketplace/actions.ts:1371` inside
`generateBlockForReviewAction` — which resolves the plan via
`resolvePlanFromPlanId` (→ `plans.ts`, the same catalog Task 1 edited)
and gates purely through `canSubmitBlocks(plan)`. Also grepped for any
route/action hard-coding a tier string (`tier === "agency"` /
`planId === "agency"`) near marketplace submission — found 7 matches,
all unrelated to marketplace gating (workspace-count/quota logic in
`orgs.ts`, `limits.ts`, `settings/billing/page.tsx`,
`proposals/check-tier-quota.ts`, `stripe/webhook/route.ts`). **No
divergent route found** — `entitlements.ts` → `plans.ts` remains the
single source of truth for marketplace gating; nothing else needed
changing.

**Fix:** updated both assertions in
`tests/unit/billing-entitlements.spec.ts` with comments citing
`docs/superpowers/specs/2026-07-08-pricing-ladder-design.md` (D1 for
the builder re-pin, the model paragraph + Task 1 feature booleans for
the marketplace re-pin). Committed separately (`5c4bd7dcf`,
`test(billing): re-pin entitlements to the 5-tier policy`) — no
amending of prior commits.

**Corrected full sweep glob** (the one that should have run from the
start): every `tests/unit/billing-*.spec.ts` (top-level, 10 files) +
every file under `tests/unit/billing/` (9 files) +
`tests/unit/marketplace/billing/` (8 files) + `*entitlement*.spec.ts` +
`*feature*.spec.ts` + `tests/unit/ai/*.spec.ts` +
`tests/unit/landing/*pricing*.spec.ts` /
`tests/unit/landing/*faq*.spec.ts` — 31 files, 319 tests total.

```
$ FILES=$( { find tests/unit -maxdepth 1 -iname "billing*.spec.ts"; \
    find tests/unit/billing -iname "*.spec.ts"; \
    find tests/unit/marketplace/billing -iname "*.spec.ts"; \
    find tests/unit -iname "*entitlement*.spec.ts"; \
    find tests/unit -iname "*feature*.spec.ts"; \
    find tests/unit/ai -iname "*.spec.ts"; \
    find tests/unit/landing -iname "*pricing*.spec.ts" -o -iname "*faq*.spec.ts"; \
  } | sort -u )
$ node --import tsx --test $FILES
...
ℹ tests 319
ℹ suites 93
ℹ pass 318
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 4682.4118
```

The 1 skip is pre-existing and unrelated to this branch: TAP output
shows `# SKIP AGENCY_WORKSPACE_OVERAGE_PRICE_ID not configured in env`
in `billing-webhook-state-consolidation.spec.ts` — an intentional
env-conditional skip (the overage price id is env-only, no
placeholder), not a hidden failure.

`tsc --noEmit` re-run after the re-pin: 23 total errors (exactly
baseline), 0 new outside it. `check:use-server.sh src`: clean.
Regression grep: empty.

## Second post-review fix wave (commits 8-9)

Opus review verdict: fix-first, one BLOCKING finding + 4 non-blocking
items in the same wave.

### BLOCKING — sub-account cap bypassable + miscounts (spec invariant 5)

Two writes of `organizations.parentAgencyId` existed OUTSIDE the one
route (`api/v1/partner-agencies`) gated in commit 2
(`7fb04adef`):

1. **`deployments/store.ts::setOrgParentAgency`**, called from
   `provisionClientWorkspaceForDeployment` — the deploy-to-client
   activation flow (`deployments/actions.ts:611`,
   `provisionDeploymentNumberAction`). This was completely ungated
   (the module's own header comment literally said "Not gated; the
   agency-creation tier check already happened upstream" — which was
   false once the sub-account ladder existed). A builder at their
   tier's cap could deploy unlimited additional client workspaces
   simply by activating more deployments.

2. **`agency-profile/sync-to-partner-agency.ts`'s bulk-attach** on
   every `/settings/agency-profile` save — this one is intentionally
   ungated (it's an idempotent self-branding sync, not a client
   handoff) but the ORIGINAL counting query
   (`fetchAgencyAttachedWorkspaceIds`) would have counted its
   auto-attached rows (the agency owner's OWN unparented workspaces,
   `organizations.ownerId = the saving user`) against the cap —
   producing false rejections purely from an operator saving their
   profile.

**Root fix — refined the counted unit** (new
`packages/crm/src/lib/billing/subaccount-count.ts`): a counted
sub-account is now `parentAgencyId IN (agencies owned by the user) AND
archivedAt IS NULL AND ownerId IS DISTINCT FROM the agency owner's
userId`. A client sub-account is a handoff by definition; an org whose
owner IS the agency owner is self-branding, not a handoff, and is
excluded. This is a SEPARATE query from
`lib/billing/orgs.ts::fetchAgencyAttachedWorkspaceIds`, which keeps
its original semantics (org listing / branding rollup) unchanged for
its other callers — deliberately not touched, per the fix design's
"extend or wrap without changing other callers' semantics" instruction.
The exact predicate (`isCountableClientSubAccount`) is exported and
unit-tested directly (7 tests) so the live SQL WHERE clause can be
trusted to encode the same rule without a DB round trip in tests.

**Gate wiring:**
- `api/v1/partner-agencies/route.ts`'s existing
  `enforceSubAccountLimitForUser` now calls
  `countClientSubAccountsForOwner` (the refined count) instead of
  `fetchAgencyAttachedWorkspaceIds`.
- `provisionClientWorkspaceForDeployment`
  (`lib/deployments/provision-client-workspace.ts`) gained a new
  REQUIRED dep, `enforceSubAccountCap: (builderOrgId) =>
  Promise<SubAccountCapDecision>`, checked immediately after the
  idempotent already-provisioned guard and BEFORE `buildInput`/
  `createFullWorkspace`/anything else. An over-cap decision returns
  `{ ok:false, error:"subaccount_limit_reached", used, limit }` with
  **zero side effects** — no workspace created, no agency attach, no
  deployment row updated. The idempotent guard runs first and
  short-circuits before the cap check (a re-activation of an
  already-provisioned deployment creates no new attachment, so
  there's nothing to gate — confirmed by a dedicated test). Wired to
  the real DB implementation in `actions.ts`'s `buildProvisionDeps()`
  (resolves the builder org's `ownerId` → tier via
  `resolveTierForWorkspace` → refined count via
  `countClientSubAccountsForOwner` → `enforceSubAccountLimit`). The
  stale "Not gated" comment on `setOrgParentAgency` was removed and
  replaced with a pointer to where the gate now lives.
- The outer action (`provisionDeploymentNumberAction`) keeps its
  pre-existing soft-fail contract for Twilio-number activation ("never
  block the action's success on provisioning, never let it throw") —
  that contract predates this fix and wasn't part of the requested
  change; I did NOT alter it, since doing so would be a larger, unasked
  behavior change to the Twilio activation flow. What changed is that
  the `subaccount_limit_reached` rejection is now structurally
  distinguishable in the `console.warn` log line (carries `used`/
  `limit`) instead of being indistinguishable from a transient
  `create_threw`/`create_failed`.

**New tests:** `tests/unit/billing/subaccount-count.spec.ts` (7 tests:
the refined predicate, including the exact owner-owned-exclusion case
that motivated the fix, plus a mixed-set test proving only genuine
handoffs count) + 3 new tests added to
`tests/unit/deployments/provision-client-workspace.spec.ts`
(blocked-at-cap with zero side effects, under-cap proceeds normally,
idempotent-skip does not re-check the cap) — all DI-fakes, no DB.

### NON-BLOCKING (same wave)

5. **upgrade-modal flag-gate.** The modal was unconditionally showing
   the NEW ladder targets (Managed/Agency Starter), which 409
   `tier_unavailable` at checkout until Max sets the new Stripe price
   env vars — while main's LIVE behavior (Workspace/Agency,
   grandfathered, real prices) is what every current 402-workspace-
   limit path actually needs today. Flag-gated behind
   `NEXT_PUBLIC_SF_TIER_LADDER` (a client-safe, build-time twin of the
   server flag `SF_TIER_LADDER` — this component has no server-
   component ancestor across its 4+ call sites that would let a single
   server-read prop thread down cheaply, so it reads its own copy
   directly, same dark-by-default strict-`"1"` contract as every other
   flag). Flag off (default) now renders BYTE-IDENTICAL targets/copy/
   price-ids to main's current live modal. Rewrote
   `tests/unit/web-onboarding/upgrade-modal.spec.tsx` (8 tests: 3
   flag-independent free-tier tests, 3 pinning flag-OFF = main's exact
   grandfathered targets + the `tier:"workspace"` checkout payload, 2
   pinning flag-ON = the new ladder + `tier:"agency_starter"` payload).
   Also fixed a latent test-isolation bug found while writing these:
   the spec file had no `cleanup()` between tests, so `render()` calls
   accumulated in the shared jsdom document and a later test's
   ABSENCE assertion (new in this wave) would have seen a PREVIOUS
   test's still-mounted DOM.

6. **Dead homepage line.** `app/(public)/page.tsx:102` and
   `app/(marketing)/pricing-public/page.tsx:52` never passed
   `tierLadderOn` to `LandingMarketingPricingSection` (both are server
   components; each now reads `SF_TIER_LADDER` server-side, mirroring
   `pricing/page.tsx`'s local helper — not centralized into
   `lib/web-build/policy.ts`, kept out of scope). The D4 homepage
   quiet-line is now reachable post-flip on both marketing surfaces
   that render the pricing section.

7. **`feature-flags.ts` TIER_RANK extended.** Added the 5 new tier ids
   to `TIER_RANK` (ranked by actual entitlement level from `plans.ts`'s
   `Plan.limits`, not by price: `managed` ranks with `builder`;
   `agency_starter`/`agency_growth`/`agency_scale` all rank with the
   grandfathered `agency`), closing the latent bug where
   `hasFeature()`/`tierMeetsMinimum` would rank every new-tier
   subscriber at 0 (unlock nothing) if a future caller wires them up
   (confirmed still dead code today — see deviation #7 in the original
   session's notes above; this fix makes it correct WHEN it's wired,
   not live yet). Added 2 tests to
   `tests/unit/billing/feature-flags.spec.ts`.

8. **Flip checklist addition.** Appended to spec §6 (see the updated
   flip checklist in the Open Risks section below):
   **"Task-6 copy commit (`878b56ee9`) must not deploy ahead of
   `SF_TIER_LADDER=1`"** — the FAQ/registry copy in that commit
   describes the ladder as live ("Running client sub-accounts? Agency
   plans from $99/mo") but the underlying checkout only works once the
   flag is on AND the Stripe prices exist; deploying that copy commit
   to production before the flip would show truthful-sounding copy
   backed by a 409.

### Verification (second wave)

Full billing/entitlements/features/pricing/deployments sweep (58
files, the node-only spec files — `node --import tsx --test`):

```
ℹ tests 631
ℹ suites 160
ℹ pass 630
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 7801.8574
```

Plus the jsdom-based upgrade-modal spec (separate process — needs
`--import ./tests/setup-dom.ts`):

```
ℹ tests 8
ℹ suites 3
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3070.9755
```

**Combined: 639 tests, 638 pass, 0 fail, 1 pre-existing skip**
(same env-conditional skip as before, unrelated to this branch).

`tsc --noEmit`: 23 total (exact baseline), 0 new.
`check:use-server.sh src`: clean.
Regression grep (`bookings/actions|create-for-customer|messaging/|lib/sms/|agents/booking/|voice/openai|landing-r1/`):
empty. No `packages/crm/drizzle` files touched.

## Third post-review fix wave — live checkout regression (commit 10, `ac09002c5`)

A second, independent re-review of the sub-account-cap fix (wave 2)
found it clean, but surfaced a NEW BLOCKING regression the sub-account
work incidentally exposed: **the live $29 checkout would 409 on merge,
flag-independent** — a real production outage waiting to happen, not a
theoretical gap.

### The Optimistic-Path lesson (CLAUDE.md §3.1)

CLAUDE.md §3.1 names this exact failure mode:

> **Optimistic Path** — you handled the happy path and ignored the 500
> / null / empty case. A tool that reports success on a write it never
> verified is this bug... **Success must be defined against the
> observable end-state, not "the code ran."** Reject a missing/
> malformed input with an explicit error, never a silent pass.

Every test I wrote in waves 1-2 for the upgrade-modal (and every
pre-existing test for pricing-shell.tsx's single card) asserted the
**shape of the outgoing fetch() call** — that `body.tier` equaled the
expected string, that the URL was `/api/stripe/checkout`. None of them
asserted that the **route would accept the request**. That's the
Optimistic Path bug precisely: "the code ran" (a POST was sent with
the right-looking body) was mistaken for "the feature works" (the
route returns 200, not 409). The tests were green; the checkout was
broken. A `fetch` mock that returns `{status:200}` unconditionally
cannot catch a real route-level rejection — it only proves the UI
*tried*, never that the *system* would have succeeded.

**Root cause chain:** Task 1 (this branch, wave 1) made `"workspace"`/
`"agency"` `sellable: false` (frozen, grandfathered). Task 3 (also
wave 1) added a checkout-route gate that 409s any non-sellable tier,
**flag-independently** (it runs regardless of `SF_TIER_LADDER`). But
`pricing-shell.tsx`'s always-rendered single card (`PLAN.id:
"workspace"`) and the flag-off `upgrade-modal.tsx` (`"workspace"`/
`"agency"` targets) were never updated to stop targeting the
now-frozen tiers — both are the LIVE, currently-shipping UI paths, not
behind any flag. Merged as-is, every "Get started" click and every
workspace-limit upgrade click would have 409'd.

### The shared-price-id webhook design

**The fix:** repoint the live UI to `"builder"` (the intended new
sellable $29 tier per spec D1) instead of adding a NEW Stripe price —
`BUILDER_PRICE_ID` was changed from its own (still-unconfigured)
`STRIPE_BUILDER_PRICE_ID` env var to `= WORKSPACE_PRICE_ID` directly
(`price-ids.ts`), so `"builder"` resolves to the EXACT same
live-configured Stripe price `"workspace"` used to use. This is
deliberately a relabel, not a new checkout path or a new Stripe
product — verified by reading `checkout-items.ts`'s `TIER_BASE_PRICE`
map and confirming main's `pricing-shell.tsx` POSTs `tier:"workspace"`
→ `WORKSPACE_PRICE_ID` → env `STRIPE_WORKSPACE_PRICE_ID` (the one Max
has actually configured), not `AGENCY_BASE_PRICE_ID` as an initial
memory-note skim might suggest.

This means **one Stripe price id now maps to two tier ids** — legacy
`workspace` subscribers (existing, frozen) and new `builder`
purchasers (new checkout going forward). Price-id-only inference can
no longer distinguish them. The design: `stripe-billing/handlers.ts`'s
`customer.subscription.updated` handler now prefers
`subscription.metadata.tier` (embedded at checkout via
`buildCheckoutSessionParams`'s `subscription_data.metadata`, and
persisted on the Stripe subscription object for its entire lifetime,
renewals included) over price-id inference — price-id inference
remains only as the fallback for legacy pre-metadata rows. Without
this, EVERY renewal/quantity-change event for a shared-price
subscriber (whether they originally checked out as `builder` or as a
grandfathered `workspace` sub) would have relabeled them to
`"workspace"` (`resolveTierFromPriceIds`'s documented precedence
checks `workspace` before `builder`), silently reassigning new builder
purchasers back into the frozen grandfathered tier on their very first
renewal.

`invoice.paid`/`invoice.payment_failed` were already correct before
this fix (the module comment already said "the authoritative tier
writer is customer.subscription.updated... mutating tier here... we
preserve the existing tier") — confirmed by reading the handler (never
reads price ids, the `updateOrgSubscription` patch never includes
`tier`) and pinned explicitly with a new test simulating a renewal
invoice for an existing grandfathered workspace subscriber.

### Fixes landed

1. **`pricing-shell.tsx`**: `PLAN.id` → `"builder"` (was `"workspace"`).
2. **`upgrade-modal.tsx`**: flag-off collapses to a SINGLE `"builder"`
   target rather than trying to also manufacture an "agency-ish"
   second card. Main's original modal offered "Agency $297,
   unlimited/10-included workspaces" as the recommended upsell; there
   is no sellable tier that preserves that semantic (`agency_starter`
   $99 is for CLIENT SUB-ACCOUNTS, a materially different offer, not
   "more of your own workspaces"). Mis-selling `agency_starter` as a
   like-for-like Agency replacement would itself be a false-advertising
   bug, so flag-off intentionally shows builder only; the real ladder
   comparison is reachable at `/pricing` once `SF_TIER_LADDER` is on.
3. **`price-ids.ts`**: `BUILDER_PRICE_ID = WORKSPACE_PRICE_ID` (was its
   own placeholder-only env var).
4. **`stripe-billing/handlers.ts`**: `customer.subscription.updated`
   is now metadata-first (see design above).
5. **`checkout-items.ts`**: new pure, exported
   `resolveCheckoutTierGate(tier)` — extracted from `route.ts`'s inline
   sellable-gate block so the route AND tests share the exact same
   function (route.ts now calls it; no re-implementation drift
   possible). This is what makes the new test class (below) a true
   end-state assertion instead of another optimistic mock.
6. **`route.ts`**: calls `resolveCheckoutTierGate` instead of its own
   inline `getPlan(...).sellable` check (same behavior, now shared +
   testable).
7. **Non-blocking (item #5 of the review)**: extracted the duplicated
   inline sub-account-cap closure — was hand-written once in
   `deployments/actions.ts`'s `buildProvisionDeps` and once in
   `api/v1/partner-agencies/route.ts` — into a single shared
   `resolveSubAccountCapForBuilderOrg(orgId)` (`subaccount-count.ts`),
   used by both call sites now.

### The missing test class (now closed)

New `tests/unit/billing/checkout-tier-gate.spec.ts` (16 tests):
- An explicit audit table (`UI_REACHABLE_TIERS`) of every tier id a
  live UI surface can currently POST — the single card, both
  `TierLadder` audiences, and both upgrade-modal flag states — each
  asserted against the REAL `resolveCheckoutTierGate` (not a
  reimplementation) to never reject as `not_sellable`. This test class
  would have caught the original bug on the first run (both grandfathered
  tiers were, at the time, still reachable from the live UI and both
  would have failed the `not_sellable` assertion).
- A regression pin: `resolveCheckoutTierGate("workspace")` and
  `resolveCheckoutTierGate("agency")` are explicitly asserted to still
  reject (`not_sellable`) — these must NEVER become reachable from a
  NEW checkout POST again.
- An env-independent design note baked into the tests: whether a tier
  is `Plan.sellable` is an invariant this repo can assert offline;
  whether its Stripe price is configured (`placeholder_price`) is an
  environment fact that depends on Max's env vars and is NOT asserted
  in a fixed direction — the tests check the gate's `detail` field
  distinguishes the two failure classes rather than asserting a
  environment-dependent outcome.

### Fallout from the shared price id (all intentional, now documented)

Making `BUILDER_PRICE_ID === WORKSPACE_PRICE_ID` broke 3 pre-existing
test assertions that expected price-id-only resolution to
disambiguate the two tiers — all 3 are genuinely ambiguous now by
design (metadata is the disambiguator going forward), fixed with
documentation rather than silently changing behavior further:
- `billing-tier-resolve.spec.ts`: `resolveTierFromPriceIds([BUILDER_
  PRICE_ID])` now resolves `"workspace"` (documented precedence checks
  workspace first) — added a sanity test pinning that the two
  constants are equal BY DESIGN, not by accident.
- `billing-checkout-items.spec.ts`: `tierFromBasePriceId(WORKSPACE_
  PRICE_ID)` now resolves `"builder"` (if-chain checks builder first) —
  intentionally prefers the new sellable tier for a bare-price-id
  lookup, mirroring the "prefer the new tier when ambiguous" principle
  from the webhook fix.
- `billing-plans-catalog.spec.ts`: `getPlanByStripePriceId(WORKSPACE_
  PRICE_ID)` now resolves to the `builder` Plan (first-match-wins scan
  over `PLANS[]`, builder listed before workspace) — documented as a
  reverse-lookup byproduct that does NOT affect any subscriber's
  actually-stored tier (that's written once by the webhook, which is
  metadata-first).

### Verification (third wave)

Full node-only sweep (60 files after adding checkout-tier-gate.spec.ts):

```
ℹ tests 653
ℹ suites 164
ℹ pass 652
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 7831.6044
```

jsdom-based upgrade-modal spec (rewritten flag-off block for the
minimal single-target design):

```
ℹ tests 8
ℹ suites 3
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3171.5431
```

**Combined: 661 tests, 660 pass, 0 fail, 1 pre-existing skip.**

`tsc --noEmit`: 23 total (exact baseline), 0 new.
`check:use-server.sh src`: clean.
Regression grep: empty. No `packages/crm/drizzle` files touched.

## Fourth follow-up — marketing-branded pricing page + CTA hierarchy (commit 11, `231653b7e`)

Max's live-page feedback after the third wave shipped: the flag-ON
`/pricing` view didn't match seldonframe.com's marketing branding (it
inherited the dark dashboard-chrome look from `PricingShell` instead
of the light cream/paper homepage look), the CTA hierarchy was
unclear (every button read "Get started" / "Redirecting…" with no
lower-commitment path), and the sticky bottom bar visually overlapped
the Managed card's own button.

### Branding source

Read `components/landing/marketing-hero.tsx`,
`components/landing/marketing-pricing-section.tsx`, and
`app/(public)/page.tsx`'s composition to extract the design tokens
(documented in `pricing-shell-marketing.tsx`'s header):
`#F6F2EA` paper background, `#221D17` ink text, `#6E665A` soft ink,
`#1F2B24` dark rounded primary buttons, `#00897B` teal/SeldonFrame-
green accents, Hanken Grotesk body font + Newsreader-italic serif
display accents (both already loaded globally in `app/layout.tsx` —
no new font setup needed). `MarketingNav` and `MarketingFooter`
(`components/landing/marketing-nav.tsx` /
`marketing-footer.tsx`) turned out to be cleanly reusable as-is — both
are self-contained, prop-free components — so they're reused verbatim
rather than rebuilt.

### Architecture

`app/pricing/page.tsx` now branches into two ENTIRELY SEPARATE render
trees based on `SF_TIER_LADDER`, rather than one component
conditionally rendering an extra section (the shape that existed
before this fix and that produced the branding mismatch — the ladder
was bolted onto the dark `PricingShell`'s dashboard-chrome wrapper):

- **Flag OFF (default)** — `<PricingShell>` unchanged: the legacy dark
  2-column single-card layout + sticky bottom CTA bar + the shared
  dark `Accordion` FAQ. The `TierLadder` component and the
  `tierLadderOn` prop were REMOVED from `pricing-shell.tsx` entirely
  (moved out, not deleted — see below), restoring this file to its
  pre-Task-4 shape (byte-identical DOM output, pinned by the new
  test file).
- **Flag ON** — new `<MarketingNav>` + new
  `<PricingShellMarketing>` (`pricing-shell-marketing.tsx`, a
  from-scratch component, NOT a themed variant of `PricingShell`) + a
  restyled-light FAQ (details/summary pattern matching
  `marketing-faq-section.tsx`'s visual language, same `FAQS` copy as
  the flag-off page) + `<MarketingFooter>`.

This hard split (rather than one shared component with theme
branching) was the deliberate choice — it makes "flag-off is
byte-identical" independently verifiable without threading a theme
prop through every element of a shared component, and matches the
review's stated requirement precisely.

### What's preserved from the SSR hotfix (verified, not re-derived)

`pricing-shell-marketing.tsx`'s tier-card grid carries forward the
2026-07-08 SSR hotfix (`3c77b6a1d`, pulled from `origin/main` before
this work started) byte-for-byte: BOTH audience rows
(`personal`/`agency`) are server-rendered every time, with the
inactive row marked `hidden` (CSS) + `aria-hidden` rather than
conditionally unmounted — so crawlers/LLMs see all 5 tiers regardless
of which audience tab is visually active; only VISIBILITY is client
state. Also preserved: `role="tablist"`/`role="tab"`/`aria-selected`
toggle semantics, and `data-tier={tier.id}` / `data-tier-cta={tier.id}`
attributes (tests + smokes key off these — verified unchanged).

### CTA hierarchy (Max's explicit call)

Every non-placeholder tier card now renders:
- **PRIMARY**: "Get started" — the `#1F2B24` dark rounded button
  (homepage style), wired to the SAME checkout/signup POST logic that
  existed before (no change to the money-path).
- **SECONDARY**: a quiet "or book a demo" text link ->
  `BOOK_A_DEMO_URL`, on every non-placeholder card, giving a visitor
  who isn't ready to buy a lower-commitment escape hatch.

A tier whose Stripe price is still the unconfigured PLACEHOLDER keeps
the existing money-safe logic unchanged: its PRIMARY becomes "Book a
demo" and it does NOT also render the secondary (no duplicate demo
link on a card whose only CTA already is a demo).

### Sticky bar removed (flag-ON only)

The sticky bottom CTA bar (`PricingStickyBar`, a dashboard-chrome
pattern designed for a single, short one-card view) is REMOVED
entirely from the flag-ON render tree — it doesn't exist in
`pricing-shell-marketing.tsx` at all. It stays exactly as it was in
the flag-OFF `PricingShell` (unrelated, unchanged). The flag-ON hero
instead carries a light "Simple pricing" marketing-style heading (serif
italic accent + the "$29/mo" anchor line) in place of the dark "The
plan" card language.

### Tests

New `tests/unit/landing/pricing-shell.spec.tsx` (10 tests,
`renderToString` — no jsdom needed for these structural pins):
- Flag-OFF (`<PricingShell>`): pins the sticky bar's presence, the
  single `$29` card with no `data-tier=`/`role="tablist"` markup
  (proving the ladder is truly gone from this component), and the
  absence of the new light-theme marker
  (`data-pricing-theme="marketing"`).
- Flag-ON (`<PricingShellMarketing>`): pins the light-theme marker;
  BOTH audience rows present in SSR HTML (all 5 tier ids findable
  regardless of active tab, exactly one row wrapper carrying
  `hidden`); tablist/tab semantics (exactly 2 tabs); the CTA-hierarchy
  invariant computed from LIVE catalog state (`getPlan` +
  `isPlaceholderPriceId`) rather than a fixed environment assumption —
  one "Get started" + one "or book a demo" per non-placeholder tier,
  one "Book a demo" primary with no duplicate secondary per
  placeholder tier (in this local/CI environment all 5 tiers are still
  placeholder-priced, so this test currently exercises the placeholder
  branch; verified manually that setting `STRIPE_WORKSPACE_PRICE_ID`
  before module load flips `builder` to non-placeholder and produces
  exactly 1 "Get started" + 1 "or book a demo", confirming the
  assertion logic is correct for whichever branch is live); absence of
  the sticky bar; `data-tier-cta` present for all 5 tiers; the
  everything-included list present without any dashboard-chrome
  utility classes (`bg-card/`, `text-muted-foreground`).

`tests/unit/landing/marketing-pricing.spec.ts` (the coordinator's
explicit call-out) was re-verified rather than edited — it tests
`marketing-pricing-section.tsx`, the HOMEPAGE pricing section, which
this commit does not touch at all; all 5 of its existing assertions
still pass unchanged.

### Verification (fourth wave)

Full billing + pricing sweep (60 node-only spec files, +10 tests vs.
wave 3 from the new pricing-shell spec):

```
ℹ tests 663
ℹ suites 166
ℹ pass 662
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 8567.3914
```

jsdom-based upgrade-modal spec (separate process, unaffected by this
commit — re-verified for regression):

```
ℹ tests 8
ℹ suites 3
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3318.2326
```

**Combined: 671 tests, 670 pass, 0 fail, 1 pre-existing skip.**

`tsc --noEmit`: 23 total (exact baseline), 0 new — including 0 in the
4 touched files (`page.tsx`, `pricing-shell.tsx`,
`pricing-shell-marketing.tsx`, the new spec).
`check:use-server.sh src`: clean.
Regression grep: empty. No `packages/crm/drizzle` files touched.

### Open item

No live/visual smoke of the flag-ON page was performed (no
`.claude/launch.json` dev-server config exists in this worktree, and
standing one up with full DB/auth/Stripe env was out of scope for this
fix). Verification relied on `renderToString` structural assertions +
`tsc`, matching the pattern used throughout every prior wave of this
branch. Recommend a real-browser smoke of `/pricing` with
`SF_TIER_LADDER=1` (both audience tabs, desktop + mobile) before or
immediately after the eventual flip, per the existing flip checklist's
"flip + smoke" step.

## Test results (verbatim tails, original session)

All six named spec files, together, fail 0:

```
$ node --import tsx --test tests/unit/billing-plans-catalog.spec.ts tests/unit/billing-checkout-items.spec.ts tests/unit/landing/marketing-pricing.spec.ts tests/unit/landing/marketing-faq.spec.ts tests/unit/billing/subaccount-limit.spec.ts tests/unit/ai/resolve-runtime-client.spec.ts
...
ℹ tests 66
ℹ suites 13
ℹ pass 66
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1068.5132
```

Broader billing regression sweep (all `tests/unit/billing*.spec.ts` +
`tests/unit/billing/*.spec.ts`), fail 0:

```
ℹ tests 107
ℹ suites 33
ℹ pass 107
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2623.625
```

`tsc --noEmit`:

```
$ node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | wc -l
23
$ node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -v "^\.next/types\|posthog\|qrcode\|markdown-to-jsx\|composio/client\|copilot/turn"
(empty)
```

23 total errors — exactly the documented baseline (`.next/types`
staleness ×14, `markdown-to-jsx`/`posthog-js`/`qrcode`/`posthog-node`
missing-module ×4, `composio` `mcp` ×3, `copilot/turn` `persist` ×1,
`posthog-node` in the analytics spec ×1). Zero new errors outside that
set.

`check:use-server.sh`:

```
$ bash scripts/check-use-server.sh src
✓ All 'use server' files export only async functions / types.
```

Regression grep (must be empty — confirmed empty, exit 1 = no match):

```
$ git diff --name-only origin/main..HEAD | grep -E "bookings/actions|create-for-customer|messaging/|lib/sms/|agents/booking/|voice/openai|landing-r1/"
(no output, exit 1)
```

Migration journal untouched:

```
$ git diff --name-only origin/main..HEAD -- packages/crm/drizzle
(no output)
```

## Open risks

1. ~~**Homepage ladder-pointer line is dead code today.**~~ **RESOLVED
   in the second post-review fix wave (commit `da06cc101`).**
   `app/(public)/page.tsx` and `app/(marketing)/pricing-public/page.tsx`
   now both read `SF_TIER_LADDER` server-side and pass `tierLadderOn`
   down. The homepage line is reachable post-flip.

2. ~~**`feature-flags.ts`'s `TIER_RANK`/`FEATURE_TIERS` not extended**~~
   **RESOLVED in the second post-review fix wave (commit `da06cc101`).**
   `TIER_RANK` now includes the 5 new tier ids. `FEATURE_TIERS` itself
   (the `MinimumTier` map, distinct from `TIER_RANK`) was intentionally
   left untouched — it still only maps flags to the 3 legacy minimum
   tiers (`builder`/`workspace`/`agency`), which is sufficient because
   `tierMeetsMinimum`'s rank comparison is what actually needed the
   new ids; `hasFeature`/`tierMeetsMinimum` remain unreachable from any
   live app code path.

3. **`vision-verify` on `/pricing` (both toggle states, desktop +
   mobile) not run** — the plan's §4 validation lists this alongside
   the six spec-file/tsc/use-server/grep checks I did run. This requires
   a live dev-server render + independent vision grading pass, which is
   outside what this implementation task covers; recommend running it
   before the flip (spec §6 already lists "flip + smoke" as Max's
   action).

4. **Live smoke of `/pricing` + one checkout-intent 402 path** — also
   listed in plan §4 validation, also not run here (requires a running
   server + real HTTP round trip). The unit-level equivalents
   (`tier_unavailable` 409 response shape, `isPlaceholderPriceId` gate)
   are covered by Task 3's rewritten spec, but an actual live 402/409
   round trip against a dev server was not exercised in this session.

5. **`getPlan(tier)` in `maxSubAccountsForTier`** takes a `BillingTier`
   (includes `"inactive"`) but is typed to accept a `string` planId —
   `getPlan("inactive")` correctly returns `undefined` (no catalog entry
   named "inactive") and falls through to the `?? 0` default, but this
   relies on that coincidental non-match rather than an explicit
   `"inactive" -> 0` branch. Behaviorally correct (verified by the
   `inactive: 0` test case) but worth noting for a future refactor.

6. **`provisionDeploymentNumberAction`'s soft-fail contract is
   unchanged by design.** The sub-account cap gate makes
   `provisionClientWorkspaceForDeployment` itself refuse to provision
   over cap (zero side effects), but the OUTER Twilio-activation action
   still returns `{ ok:true }` even when provisioning was blocked by
   the cap — this preserves the pre-existing "activation must always
   succeed" bridge contract (the agent falls back to writing the
   builder org). This means an over-cap builder's Twilio number
   activation silently succeeds while their client workspace silently
   isn't created; the `console.warn` log line is the only surfaced
   signal today (carries `used`/`limit`). If product wants the operator
   to SEE "you're over your sub-account cap" at the point of clicking
   "Get a number", that requires a UI-facing change to
   `ProvisionDeploymentNumberActionResult`, which was not requested and
   would be a larger behavior change to a flow whose existing contract
   is "never block Twilio activation on workspace provisioning."

## Flip checklist (spec §6, updated)

1. Create 4 Stripe prices ($49/$99/$199/$299) + set
   `STRIPE_MANAGED_PRICE_ID`, `STRIPE_AGENCY_STARTER_PRICE_ID`,
   `STRIPE_AGENCY_GROWTH_PRICE_ID`, `STRIPE_AGENCY_SCALE_PRICE_ID` in
   Vercel.
2. Flip `SF_TIER_LADDER=1` **AND** `NEXT_PUBLIC_SF_TIER_LADDER=1`
   together (the upgrade-modal's client-safe flag twin, added in the
   second post-review fix wave — flipping only the server flag leaves
   the modal showing grandfathered targets while `/pricing` shows the
   new ladder, an inconsistent but non-broken state; flipping only the
   client flag would show ladder targets that 409 until step 1 is
   done). Then smoke one $49 test-mode checkout.
3. Flip `SF_AGENCY_KEY_INHERIT=1` after confirming your own agency key
   is set.
4. Approve the T4 registry-copy commit (`878b56ee9`) with the flip.
5. **NEW — Task-6 copy commit (`878b56ee9`) must not deploy ahead of
   `SF_TIER_LADDER=1`.** That commit's FAQ/registry copy describes the
   agency ladder as available today ("Running client sub-accounts?
   Agency plans from $99/mo"); if it ships to production before the
   flag flip + Stripe prices exist, the copy is truthful-sounding but
   checkout 409s. Deploy it in the same release as step 2, not before.
6. **NEW (third wave) — the live $29 card + upgrade-modal flag-off
   path are UNCONDITIONAL, not part of the SF_TIER_LADDER flip.** They
   already merge/deploy targeting `"builder"` (sharing
   `WORKSPACE_PRICE_ID`'s live-configured price) regardless of the
   flag. No additional flip action needed for these two surfaces — they
   work today, on merge, with the SAME Stripe price that's already
   configured. Only the NEW tiers (managed, agency_starter/growth/
   scale) need step 1's new Stripe prices before their surfaces
   (the flagged `TierLadder` + flag-on modal) go live.
7. **NEW (third wave) — once Max creates a real, distinct Builder
   Stripe price**, update `price-ids.ts`'s `BUILDER_PRICE_ID` to read
   `STRIPE_BUILDER_PRICE_ID` instead of `= WORKSPACE_PRICE_ID`, and
   drop the shared-price-id special-casing this wave added to
   `stripe-billing/handlers.ts` (the metadata-first preference can stay
   as a general hardening, but the specific "two tiers share one
   price" ambiguity goes away).

## Commits

```
5089ec164 feat(billing): 5-tier catalog + grandfathered legacy plans
7fb04adef feat(billing): sub-account limit on the handoff boundary
20d6d1319 feat(billing): checkout for the 5-tier ladder (inert without env)
68e8cb8a0 feat(pricing): audience-toggle pricing page behind SF_TIER_LADDER
0cda290e2 feat(ai): agency key inheritance + launch-window banner (flagged)
878b56ee9 feat(pricing): flip-time copy — registry + FAQs
5c4bd7dcf test(billing): re-pin entitlements to the 5-tier policy
a1cf476e7 fix(billing): gate all sub-account attach paths + owner-owned exclusion
da06cc101 fix(pricing): flag-gate upgrade modal targets + thread tierLadderOn + tier ranks
ac09002c5 fix(billing): live $29 checkout POSTs sellable builder tier + webhook metadata-first tier resolution
231653b7e feat(pricing): marketing-branded pricing page + CTA hierarchy
```

(Between `ac09002c5` and `231653b7e`, this branch pulled forward through
`origin/main`'s `6eb789a0c` — the SSR/metadata hotfix `3c77b6a1d` — see
the note at the top of this report.)

## Fifth follow-up — hydration-mismatch fix: no price id lives in the client

**The live bug:** the /pricing tier cards (SF_TIER_LADDER ON,
`pricing-shell-marketing.tsx`) rendered "Book a demo" as the PRIMARY CTA
for every tier instead of "Get started" — even for tiers with a real,
configured Stripe price.

**Root cause.** `pricing-shell-marketing.tsx` is `"use client"` and
computed `placeholder = isPlaceholderPriceId(tier.stripePriceId)` itself,
where `tier.stripePriceId` came from `PLANS` (`lib/billing/plans.ts`),
whose price ids in turn come from `price-ids.ts`'s `readEnv("STRIPE_*_
PRICE_ID", "price_PLACEHOLDER_*")`. `readEnv` reads `process.env` at
MODULE LOAD TIME. `STRIPE_*_PRICE_ID` env vars are never exposed to the
browser (they're not prefixed `NEXT_PUBLIC_`, by design — a Stripe price
id isn't secret, but nothing marks it public either, so Next.js correctly
strips it from the client bundle). Server-side (SSR pass), `process.env`
has the real values → `available` tiers render "Get started". Client-side
(hydration pass, same component re-rendering in the browser),
`process.env.STRIPE_*` is `undefined` → EVERY tier re-evaluates as
`isPlaceholderPriceId(undefined)` → `true` → "Book a demo". React
hydration reconciles the mismatch by keeping the CLIENT's render (the
wrong one), so the page visibly shows "Book a demo" once JS takes over,
even though the initial HTML (view-source) had "Get started".

This is the exact bug class the LEGACY single card (`pricing-shell.tsx`)
was already immune to — its file header states the rule explicitly: "No
price id lives in the client." The ladder violated that rule when it was
built as a `"use client"` component that read `PLANS`/`price-ids.ts`
directly instead of receiving pre-resolved availability as a prop.

**The fix — restore the rule, three surfaces:**

1. `app/pricing/page.tsx` (Server Component): added `buildLadderTiers()`,
   which filters `PLANS` to `sellable === true` and maps each to
   `{ id, name, price, tagline, maxSubAccounts, fullWhiteLabel, available:
   !isPlaceholderPriceId(p.stripePriceId) }` — a plain, serializable
   object with `available: boolean` as the ONLY env-derived fact, resolved
   SERVER-side where `process.env` actually has the real values. Passed
   as `<PricingShellMarketing tiers={buildLadderTiers()} ... />`.
2. `pricing-shell-marketing.tsx`: deleted its `PLANS` and
   `isPlaceholderPriceId` imports, deleted its local `SELLABLE_TIERS`
   computed-from-PLANS array, deleted the `stripePriceId` field from its
   local tier type entirely. `PricingShellMarketingProps` now requires
   `tiers: LadderTier[]` (exported type, `LadderTier.available:
   boolean`, no price id field anywhere in the type). `placeholder =
   isPlaceholderPriceId(tier.stripePriceId)` became `placeholder =
   !tier.available`. Zero `process.env` reads, zero `PLANS`/`price-ids`
   imports remain in this file (source-guard test enforces this — see
   below).
3. **Second leak found + fixed (grep sweep across every `"use client"`
   file):** `components/billing/upgrade-modal.tsx` also imported
   `BUILDER_PRICE_ID` / `MANAGED_PRICE_ID` / `AGENCY_STARTER_PRICE_ID`
   directly from `price-ids.ts`, baking those (also server-only-resolved,
   so always-placeholder-in-the-browser) values into the client bundle
   purely to forward them in the `/api/stripe/checkout` POST body as
   `priceId`. Investigation of the route (`api/stripe/checkout/route.ts`)
   confirmed `tier` is resolved FIRST (before any `priceId` fallback) —
   the server already re-derives the real Stripe price id from `tier`
   via `PLANS`, so `priceId` in the request body was pure dead weight
   with an accidental money-adjacent footgun (a stale/placeholder id
   silently forwarded from the client for no functional reason). Fixed
   by dropping `priceId` from `StartCheckoutInput`
   (`lib/billing/start-checkout.ts`) and from `upgrade-modal.tsx`'s
   `TIER_TO_PRICE_ID` maps entirely — `startCheckout` now sends only
   `{ tier, successPath, cancelPath }`. This didn't reproduce the exact
   same VISIBLE symptom (the modal never branched on `isPlaceholderPriceId`
   itself, so it always rendered the same "Upgrade to X" copy regardless
   of hydration), but it was the same rule violation and the same latent
   risk class, so it's fixed the same way per the coordinator's explicit
   ask to check for other leaks.
   No other `"use client"` file imports `lib/billing/plans` or
   `lib/billing/price-ids` for its own display/availability logic (the
   remaining hits — `super-admin/users/page.tsx`, `super-admin/*.ts`,
   `blueprint/rerender-org.ts`, `billing/orgs.ts`, `billing/public.ts`,
   `billing/actions.ts`, `billing/checkout-items.ts`, `billing/
   workspace-billing.ts`, `proposals/check-tier-quota.ts`, the Stripe
   webhook, and the checkout route itself — are all Server Components,
   server actions, or API routes; none are `"use client"`).

**Tests (Files: `tests/unit/landing/pricing-shell.spec.tsx`,
`tests/unit/billing/start-checkout.spec.ts`):**

- (a) END STATE both ways, DI'd via the new `tiers` prop (no env
  manipulation): `fixtureTiers(true)` → every card's primary is "Get
  started" (5/5) + secondary "or book a demo" (5/5), zero "Book a demo"
  anywhere; `fixtureTiers(false)` → every card's primary is "Book a
  demo" (5/5), zero "Get started", zero secondary links. Plus a
  BOUNDARY case (mixed availability) asserting each card's CTA is
  independent of its siblings.
- (b) Source-guard tests (read the file, assert on stripped-of-comments
  source text): `pricing-shell-marketing.tsx` contains no
  `stripePriceId`, no `isPlaceholderPriceId` call, no import from
  `@/lib/billing/plans` or `@/lib/billing/price-ids`, no `process.env`
  read. A parallel guard on `upgrade-modal.tsx` asserts no import from
  `price-ids` and no `*_PRICE_ID` identifier anywhere in its live code.
  These are cheap, falsifiable, and — unlike the CTA-count assertions —
  they catch a REINTRODUCTION of the leak even if a future edit
  accidentally produces output that still happens to look right.
- (c) **Why the OLD `pricing-shell.spec.tsx` passed with this bug —
  the actual answer, not a guess:** the old test called
  `renderToString(<PricingShellMarketing isAuthed={false} />)` with NO
  `tiers` prop — the component read `PLANS` itself. `renderToString`
  runs entirely in THIS Node test process, which is neither the real
  server (Vercel, with `STRIPE_*_PRICE_ID` set in the environment) nor
  the real browser (webpack/turbopack-bundled, env vars stripped at
  BUILD time). This repo has no `.env.local` / `.env` file (confirmed:
  `ls .env*` → not found), so `process.env.STRIPE_*_PRICE_ID` was
  UNSET in the test process too — `isPlaceholderPriceId` returned
  `true` for all 5 tiers, confirmed by directly evaluating
  `getPlan(id).stripePriceId` for every ladder tier id in this test
  process (every one resolves to a literal `price_PLACEHOLDER_*`
  string). The old test's own "CTA hierarchy" assertion computed
  `nonPlaceholderCount` from that SAME always-unconfigured `getPlan()`
  call, got `0`, and then asserted `getStartedMatches.length === 0` —
  which is trivially true regardless of what the component does with a
  CONFIGURED tier, because the test never exercised that branch AT ALL.
  The test was internally self-consistent (it computed its own
  expectation from the same broken source the component used) but never
  pinned the true end state. More fundamentally: a hydration mismatch is
  by definition a DELTA between a server render and a client render: a
  single `renderToString` call in one Node process has no "client half"
  to diverge from, so no amount of env-juggling in that old test design
  could ever have caught this class of bug — the fix had to change WHAT
  the component receives (DI'd `tiers` prop), not just how the existing
  test was run. This is the structural lesson below.

## Lesson — server-only env vars can NEVER be read inside a `"use client"`
## component, even indirectly through an imported constant

**The pattern that bit us:** a module-level `const X = readEnv("SERVER_
ONLY_VAR", fallback)` (or any top-level `process.env.FOO` read) inside a
file that's imported — even transitively, even just for its exported
constants — by a `"use client"` component. Next.js does NOT statically
strip non-`NEXT_PUBLIC_` env reads from client bundles the way you might
expect; it just leaves `process.env.FOO` as `undefined` at runtime in the
browser (the read itself isn't an error — it silently returns `undefined`
and code branches on that as if the var were legitimately unset). There
is no build-time or lint-time signal that a `"use client"` file has this
problem; it only manifests as a HYDRATION MISMATCH in the actual browser,
which:
  - Is invisible to `tsc` (types don't know about env-var origin).
  - Is invisible to a same-process `renderToString` unit test (no
    separate "client half" exists to diverge from).
  - Is often invisible in local dev too if the dev server's env happens
    to be unset in a way that makes server and "client" (also unset)
    agree — the bug only shows once one side (prod server, which HAS the
    var) and the other side (every browser, which never has it) actually
    disagree, i.e. exactly the deployed-with-real-env case this was.

**The rule (already stated once, in `pricing-shell.tsx`'s header, and
now restored / extended here):** a `"use client"` file must never
import a value that was resolved from `process.env` at module scope,
UNLESS that env var is explicitly `NEXT_PUBLIC_`-prefixed (build-time
inlined, safe by construction — see `upgrade-modal.tsx`'s own
`isTierLadderOnClient()` reading `NEXT_PUBLIC_SF_TIER_LADDER`, which is
correct and was NOT part of this bug). Concretely: resolve any
server-only-derived boolean/string/id the client needs to DISPLAY (not
just gate a build-time feature flag) in the nearest Server Component
ancestor, and pass it down as a plain serializable prop. Never pass the
raw underlying value (a price id, an API key, a feature-detection
result computed from server env) — pass the ALREADY-DECIDED fact the
client needs (`available: boolean`, not `stripePriceId: string`).

**How to catch this class going forward, cheaply:** a source-guard test
(read the file as text, assert on what identifiers/imports/`process.env`
reads are absent) is a better catch than any render-based assertion,
because — per finding (c) above — the render-based test can be
accidentally self-consistent with the very bug it's supposed to catch
when both "server" and "client" happen to share the same (wrong) input
in a single test process. A source guard has no such blind spot: it
either finds the string `process.env` in a `"use client"` file or it
doesn't, full stop, independent of whatever env happens to be set when
the test runs. Recommend the same audit (grep `readEnv(` / bare
`process\.env\.` call sites, cross-referenced against every `"use
client"` file that imports them, even transitively) whenever a new
`"use client"` component is added anywhere near billing/config code.

## Commit — this fix

```
fix(pricing): tier availability computed server-side — no price ids in the client bundle
```

Files touched: `app/pricing/page.tsx`, `app/pricing/pricing-shell-marketing.tsx`,
`components/billing/upgrade-modal.tsx`, `lib/billing/start-checkout.ts`,
`tests/unit/landing/pricing-shell.spec.tsx`, `tests/unit/billing/start-checkout.spec.ts`.

Verify: `tests/unit/landing/pricing-shell.spec.tsx` +
`tests/unit/billing/start-checkout.spec.ts` = 26/26 pass; the full
`tests/unit/billing/*.spec.ts` sweep = 117/117 pass (fail-0); `tsc
--noEmit` = 9 pre-existing baseline errors (0 in touched files — the
9 are unrelated missing-optional-deps / a pre-existing Composio type
mismatch / a pre-existing `persist` prop on `copilot/turn/route.ts`'s
`executeTurn` call, all present before this fix); `scripts/check-use-
server.sh src` clean. (One unrelated pre-existing failure was observed
in `tests/unit/landing/hero-cta.spec.tsx` — a date/DOM-snapshot-style
assertion unrelated to pricing, not touched by this diff — while running
a broader `landing/*.spec.tsx` glob; excluded from the reported counts
as out of scope for this fix.)

## Sixth follow-up — PostPlanify-style per-tier feature checklists (single source: plans.ts)

Max wanted the /pricing tier cards to show rich, PostPlanify-style
feature checklists (~4-8 checkmarked items per tier, with "Everything
in X, plus:" headers on upper tiers) instead of just price + tagline.

**Design (anti-drift):** the copy lives in exactly ONE place —
`Plan.marketingFeatures?: { header?: string; items: string[] }` on each
SELLABLE `Plan` entry in `lib/billing/plans.ts`. `app/pricing/page.tsx`'s
`buildLadderTiers()` passes `p.marketingFeatures` through the existing
serializable `tiers` prop unmodified (same server-resolved-then-DI'd
pattern the fifth follow-up established for `available`).
`pricing-shell-marketing.tsx` renders a checkmark list under the
tagline/subLabel block — teal `Check` icon (14px), 13.5px text, 1.6
line-height, bold header line when present — reading `tier.
marketingFeatures` verbatim. No component anywhere hand-copies this
list; the grandfathered legacy tiers ("workspace", "agency") have no
`marketingFeatures` field at all (they're not marketed on /pricing).
The flag-OFF `PricingShell` is completely untouched.

**Honesty-rule audit (BEFORE shipping any copy — this is money-adjacent
marketing text, not aspirational).** Verified every claim against the
actual codebase in THIS worktree (not a stale/different worktree — see
the false-negative caveat below):

| Claim | Verdict | Evidence |
|---|---|---|
| 8 ready-to-deploy agent templates | TRUE | `lib/agent-templates/starter-pack.ts`'s `STARTER_TEMPLATES` array has exactly 8 entries (`ai-phone-receptionist`, `website-support-chat`, `lead-qualifier-intake`, `booking-concierge`, `quote-estimate-assistant`, `social-content-assistant`, `review-requester`, `speed-to-lead`) |
| Review-request + speed-to-lead automations | TRUE | Live event wiring: `lib/agents/triggers/agent-trigger.ts`, dispatched on `booking.completed`/`lead.created` from the real event bus |
| BYOK — provider cost, zero markup | TRUE | `lib/ai/client.ts`'s `getAIClient()` BYOK path instantiates the raw provider client directly; `runtime.ts`'s `llmCostCents`/`computeCostCents` is READ-ONLY observability (feeds the usage-rollup meter), never a Stripe charge or wallet debit |
| Buy & sell agents on the marketplace | TRUE | `app/marketplace/`, `app/api/marketplace/`, `app/api/v1/marketplace/`; `lib/marketplace/actions.ts`'s `publishAgentTemplateAction` (seller) + install/purchase flow (buyer) |
| Per-sub-account usage meter & caps | TRUE | `lib/billing/usage-rollup.ts` + `usage-cap.ts`, live-wired (unconditionally, no flag) into `app/(dashboard)/studio/clients/page.tsx` (`ClientUsagePanel`/`UsageCapEditor`/`UsageTotalsTile`) — this is the usage-meter feature this same worktree built earlier in this session |
| One-click deploy to ALL clients | TRUE | `lib/deployments/deploy-to-clients-action.ts` + `app/(dashboard)/studio/agents/[id]/deploy-to-clients/` UI |
| API + MCP access | TRUE, but see caveat below | `app/api/v1/**` (35+ routes) + the SeldonFrame MCP server (visible as this session's own `seldonframe` MCP tool inventory) |
| Rent your agents via the marketplace rail | TRUE | `lib/marketplace/rental.ts`, `rental-pricing.ts`, `agent-rental-run.ts`, `app/api/v1/agents/[slug]/mcp/route.ts` |
| Set your own resale pricing | TRUE | `lib/marketplace/actions.ts`'s `publishAgentTemplateAction(input: { priceCents, ... })` — the seller sets `priceCents` directly, no server override |
| Custom domain included (managed) | TRUE | `plans.ts`: `managed.limits.customDomain === true` |
| Branded client portal logins (agency_starter) | TRUE | `app/portal/[orgSlug]/` surfaces reference `partnerAgencies`/`logoUrl`/`primaryColor`/`accentColor` across 8 files — matches the existing whitelabel-front-office infra (partner_agencies + portal + branding, per project memory) |
| Deploy agent templates to clients (agency_starter) | TRUE | Same deploy-to-client flow as the "deploy to ALL clients" item, single-client variant |
| **Priority email support (agency_starter)** | **FALSE — CAUGHT AND DROPPED** | `plans.ts`: `agency_starter.limits.prioritySupport === false`. Only `agency_growth`/`agency_scale` (and the grandfathered `agency` tier) have `prioritySupport: true`. Shipping this claim on agency_starter would have directly contradicted the catalog's own source-of-truth entitlement flag — the exact kind of drift the single-source design is supposed to prevent. **Removed from agency_starter's `marketingFeatures.items`** (a comment in `plans.ts` documents why, at the point it was dropped). |
| White-label ROI reports (agency_growth) | N/A — shipped exactly as instructed | Marked `"(coming soon)"` per the coordinator's own copy and the honesty rule — not built, correctly labeled, no audit action needed. |

**A note on verification methodology:** a background research agent
dispatched to independently cross-check these claims returned false
negatives for items 5 ("Per-sub-account usage meter"), 6 ("One-click
deploy to ALL clients"), and 12 ("Deploy agent templates to clients")
— but it had run its search against the WRONG branch/worktree
(`feature/crm-engine`, which predates this feature entirely), not
`feature/pricing-ladder`. Its own report flagged this caveat explicitly
("verify that's what's actually deployed to production"). All three
were independently re-confirmed directly in THIS worktree via direct
grep/read before shipping — the agent's mis-scoped run did not change
the shipped copy, but it's a reminder that a dispatched verification
agent's cwd/branch must be sanity-checked against its findings,
especially when its "not found" verdicts contradict direct evidence
already gathered in the current session.

**Caveat kept in mind, not acted on:** "API + MCP access" is listed
under `agency_scale`'s checklist, but the underlying API (`/api/v1/**`)
and MCP server access are NOT tier-gated anywhere found in the codebase
— they're platform-wide, consistent with CLAUDE.md's "no upfront API
key... progressive key disclosure" philosophy. The claim itself doesn't
assert exclusivity ("API + MCP access" is stated as an included
capability, not "ONLY on this tier") so it's not false, and it was kept
as instructed — but it's worth Max knowing this bullet doesn't
differentiate agency_scale from the lower tiers in practice today, in
case that's not the intended positioning.

**Tests added:**
- `tests/unit/billing-plans-catalog.spec.ts`: `marketingFeatures` exists
  (with ≥1 item) on every sellable tier, absent on both grandfathered
  tiers; builder has no header (base tier); the 4 upper tiers' exact
  header strings; the ROI-reports item carries `(coming soon)`;
  agency_starter's catalog `prioritySupport` is false AND its
  `marketingFeatures.items` contains no priority-support claim (this is
  the regression test for the caught-and-dropped item above); no item
  across any sellable tier mentions "autopay" (money-safety guard per
  the honesty rule).
- `tests/unit/landing/pricing-shell.spec.tsx`: a new `catalogTiers()`
  helper builds `LadderTier[]` DIRECTLY FROM `PLANS` (not hardcoded) so
  every count assertion tracks the catalog automatically — per-tier
  checkmark-icon counts equal `plan.marketingFeatures.items.length`
  exactly (via a `data-tier-features={tier.id}` DOM hook added to the
  component for this purpose); every item string appears verbatim
  (HTML-entity-escaped for comparison — React SSR-escapes `&`/`'`/etc.)
  in the rendered output; all 4 "Everything in X, plus:" headers render
  and builder has none; the `(coming soon)` marker is present; the
  dropped priority-support claim is confirmed absent from agency_starter's
  rendered card; exactly one `data-tier-features` block per sellable
  tier (each tier belongs to exactly one audience row, so no
  duplication — a real assertion this test initially got wrong at 2x
  before checking the component's actual per-audience-row filtering
  behavior). The existing source-guard tests (`pricing-shell-marketing.tsx`
  still imports nothing from `lib/billing/plans`/`price-ids`, no
  `process.env`) pass UNCHANGED — the checklist copy arrives entirely
  via the `tiers` prop, confirming the single-source design holds.

## Commit — this fix

```
feat(pricing): per-tier feature checklists from the catalog (single source)
```

Files touched: `lib/billing/plans.ts`, `app/pricing/page.tsx`,
`app/pricing/pricing-shell-marketing.tsx`,
`tests/unit/billing-plans-catalog.spec.ts`,
`tests/unit/landing/pricing-shell.spec.tsx`.

Verify: `tests/unit/landing/pricing-shell.spec.tsx` (25/25) +
`tests/unit/billing-plans-catalog.spec.ts` (29/29) = 54/54 pass; the
full `tests/unit/billing/*.spec.ts` + `billing-plans-catalog.spec.ts`
sweep = 241/241 pass (fail-0); `tsc --noEmit` = 9 pre-existing baseline
errors, unchanged from before this fix, 0 in touched files;
`scripts/check-use-server.sh src` clean.
