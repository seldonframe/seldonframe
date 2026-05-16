# Cut B: SeldonFrame /clients View + Tier Gating + Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the agency "clients" management surface — a `/clients` card grid backed by a new `workspaces/mine` summary endpoint, a 6-feature `hasFeature(orgId, featureName)` gate consumed by every tier-locked surface, an `/settings/agency-profile` editor for the `users.agency_profile` JSONB Cut A added, and Stripe checkout wiring on the UpgradeModal so Free → Growth and Free → Scale upgrades actually settle money.

**Architecture:** Cut B introduces no new tables — every change reuses the `users.agency_profile` column and `enforceWorkspaceLimit({ primaryOrgId, ownedWorkspaceCount })` integration that Cut A established. The new code lives in three slices that compose: (1) a `lib/billing/features.ts` extension exporting the 6-feature enum + `hasFeature(orgId, featureName)`; (2) `GET /api/v1/web/workspaces/mine` returning the rolled-up `WorkspaceSummary[]` consumed by the new `/clients` server-component page; (3) a Stripe checkout wire-up so the Cut A UpgradeModal POSTs `{ priceId, tier }` to the already-shipped `/api/stripe/checkout` route. The `/settings/agency-profile` page edits `users.agency_profile` directly via a server action; logo upload extends the existing `upload_workspace_image` primitive with a `scope: "user"` parameter to avoid duplicating R2/S3 plumbing.

**Tech Stack:** Next.js 16.2 App Router, Drizzle ORM + Postgres, NextAuth, Stripe SDK (`@seldonframe/payments`), `@anthropic-ai/sdk` is irrelevant for this Cut, `node:test` + `tsx`, Tailwind/shadcn UI primitives from `packages/crm/src/components/ui`.

**Prerequisites:** Cut A plan executed (`2026-05-16-seldonframe-web-onboarding-cut-a.md`). The following pieces from Cut A MUST be in place before Cut B starts and are reused unchanged:

- `<UpgradeModal>` component at `packages/crm/src/components/billing/upgrade-modal.tsx` (Cut B WIRES it into /clients and dashboard but does NOT create it).
- `users.agency_profile` JSONB column on the `users` table (Cut B reads + writes via the new settings page).
- `POST /api/v1/web/workspaces/create-from-url` endpoint (Cut B does not touch).
- `enforceWorkspaceLimit({ primaryOrgId, ownedWorkspaceCount })` integration pattern in `packages/crm/src/lib/billing/orgs.ts` (Cut B's `hasFeature` helper sits next to it, NOT inside it).
- `agencyProfile` typed shape exported from Cut A's schema layer:
  ```ts
  export type AgencyProfile = {
    name?: string;
    logo_url?: string;
    brand_color?: string;
    website_url?: string;
  };
  ```

**Spec reference:** [`docs/superpowers/specs/2026-05-16-seldonframe-web-onboarding-pivot-design.md`](../specs/2026-05-16-seldonframe-web-onboarding-pivot-design.md) — read Cut B (lines 219-326) before starting.

**Pre-existing failing tests on origin/main** (workflow-event-log, block-codegen-staleness, SLICE 9 archetype-isolation, theme integration) are UNRELATED to this pivot. Do not chase them. If a Cut B task introduces a new failure, that's on us — fix it. If the only failures after a task are in the pre-existing list, you're green.

---

## Pre-flight (READ FIRST before Task 1)

The implementer must skim these files to ground in the current shapes Cut B integrates with. Each is a real file on `origin/main` (or, where noted, a Cut A artifact assumed in place).

- `packages/crm/src/lib/billing/features.ts` (85 lines, full read) — Cut B EXTENDS this with the 6-feature enum + `hasFeature(orgId, featureName)`. Existing `TIER_FEATURES` map and `getOrgFeatures()` stay.
- `packages/crm/src/lib/billing/price-ids.ts` (15 lines, full read) — Cut B ADDS two exported constants `GROWTH_MONTHLY_PRICE_ID` and `SCALE_MONTHLY_PRICE_ID` next to the existing `WORKSPACE_ADDON_MONTHLY_PRICE_ID`.
- `packages/crm/src/lib/billing/orgs.ts:230-268` — `getWorkspaceLimitStatus()` / `getWorkspaceLimitStatusForUser()` are reused by `/clients` to roll up the usage badge.
- `packages/crm/src/lib/billing/subscription.ts` (44 lines, full read) — `getOrgSubscription(orgId)` returns the `OrganizationSubscription` JSONB shape with `.tier`. `hasFeature` reads it.
- `packages/crm/src/db/schema/organizations.ts:42-56` — `OrganizationSubscription.tier` is the only field `hasFeature` cares about. The string lives at `org.subscription.tier`.
- `packages/crm/src/db/schema/users.ts` — Cut A's migration adds `agency_profile jsonb not null default '{}'::jsonb`. Cut B reads/writes this column directly through Drizzle (`users.agencyProfile`).
- `packages/crm/src/app/api/stripe/checkout/route.ts` (167 lines, full read) — The route Cut B's UpgradeModal POSTs to. It already accepts `{ priceId, successPath, cancelPath }`. Cut B only WIDENS the `isAllowedCheckoutPriceId()` guard to accept the two new price IDs.
- `packages/crm/src/app/api/v1/workspaces/route.ts` (69 lines, full read) — The existing list endpoint Cut B's `mine` endpoint differs from: `mine` adds the rolled-up `WorkspaceSummary` shape (contactCount, lastActivityAt, newLeadsThisWeek, status, pipelineSummary) and the tier/usage envelope.
- `packages/crm/src/db/schema/contacts.ts`, `packages/crm/src/db/schema/activities.ts`, `packages/crm/src/db/schema/deals.ts` — three tables Cut B queries to build `WorkspaceSummary`. Each has `orgId uuid not null` indexed.
- `packages/crm/src/app/(dashboard)/dashboard/page.tsx:519-585` — The "Your Client Workspaces" section the Cut A dashboard CTA reskins; Cut B doesn't touch the page itself but wires the modal trigger ALREADY added by Cut A.
- `packages/crm/src/components/billing/upgrade-modal.tsx` — Cut A artifact. Cut B reads its props contract from the Cut A plan; Task 16 below documents the exact prop shape Cut A delivers so /clients can pass them.
- `packages/crm/src/app/(dashboard)/settings/branding/page.tsx` (93 lines, full read) — Style/copy reference for the new `/settings/agency-profile` page (settings card pattern, label/input layout).
- `packages/crm/src/app/(dashboard)/settings/page.tsx` — Settings landing page that lists every setting subroute. Cut B adds an "Agency profile" entry here.
- `packages/crm/tests/unit/reserved-slugs.spec.ts` (51 lines, full read) — Canonical pattern for a node:test + tsx spec. Every Cut B test mirrors this style: `import { describe, test } from "node:test"; import assert from "node:assert/strict";` from `../../src/...`.
- `packages/crm/src/db/index.ts` — The `db` import used by every server file (`import { db } from "@/db"`).

**Worktree setup** (already done by orchestrator, listed for reference):

```bash
cd "C:/Users/maxim/CascadeProjects/Seldon Frame"
git fetch origin main
# Worktree was created when Cut A started; Cut B builds on the same branch.
cd ".claude/worktrees/seldonframe-web-onboarding-pivot"
pnpm install
```

All paths below are relative to that worktree root.

---

## File structure

### New files

| Path | Purpose |
|---|---|
| `packages/crm/src/lib/billing/feature-flags.ts` | Exports the `FeatureFlag` enum (6 values) and `FEATURE_TIERS` mapping each flag to the minimum tier that unlocks it. Pure data — no DB access. |
| `packages/crm/src/app/api/v1/web/workspaces/mine/route.ts` | `GET` endpoint — returns `{ workspaces: WorkspaceSummary[], tier, used, limit }` for the authed user's owned workspaces. |
| `packages/crm/src/lib/workspaces/summarize.ts` | Pure function `summarizeWorkspace(input) -> WorkspaceSummary`. The `/mine` route assembles inputs from Drizzle queries; this file shapes the response. Easy to unit-test. |
| `packages/crm/src/app/(dashboard)/clients/page.tsx` | Server component — renders header (usage badge + CTA), empty state, and the card grid (3-col / 2-col / 1-col responsive). |
| `packages/crm/src/app/(dashboard)/clients/clients-grid.tsx` | Client component — receives `WorkspaceSummary[]` + tier envelope as props, renders the grid + wires the "Create Client Workspace" button to UpgradeModal when at-limit. |
| `packages/crm/src/app/(dashboard)/clients/workspace-card.tsx` | Client component — one card. Receives a single `WorkspaceSummary` prop. |
| `packages/crm/src/app/(dashboard)/settings/agency-profile/page.tsx` | Server component — fetches `users.agency_profile` and renders the edit form. |
| `packages/crm/src/app/(dashboard)/settings/agency-profile/agency-profile-form.tsx` | Client component — controlled form with name, logo upload, brand color picker, website URL; uses the `saveAgencyProfileAction` server action. |
| `packages/crm/src/lib/agency-profile/actions.ts` | Server actions: `getAgencyProfile()` and `saveAgencyProfileAction(formData)`. Writes `users.agency_profile`. |
| `packages/crm/src/lib/uploads/user-image.ts` | Thin wrapper around `upload_workspace_image` that passes `scope: "user"`. New endpoint `POST /api/v1/web/uploads/user-image` is registered next door. |
| `packages/crm/src/app/api/v1/web/uploads/user-image/route.ts` | `POST` endpoint — accepts `multipart/form-data` with `file` field, returns `{ url }` after pushing to R2/S3 via the extended primitive. |
| `packages/crm/tests/unit/billing/has-feature.spec.ts` | TDD: 6 feature flags × 3 tiers = matrix tests for the gate. |
| `packages/crm/tests/unit/billing/feature-flags.spec.ts` | TDD: enum exhaustiveness + `FEATURE_TIERS` correctness against the spec table. |
| `packages/crm/tests/unit/workspaces/summarize.spec.ts` | TDD: edge cases for `summarizeWorkspace` (null lastActivity, 0 contacts, no recent deals). |
| `packages/crm/tests/unit/workspaces/mine-route.spec.ts` | TDD: handler-level unit test of `/api/v1/web/workspaces/mine` — auth check, empty-list shape, tier envelope. |
| `packages/crm/tests/unit/agency-profile/save.spec.ts` | TDD: `saveAgencyProfileAction` validates and writes the JSONB. |
| `packages/crm/tests/unit/billing/stripe-checkout-gated.spec.ts` | TDD: `isAllowedCheckoutPriceId()` accepts the two new Growth/Scale price IDs. |

### Modified files

| Path | Change |
|---|---|
| `packages/crm/src/lib/billing/features.ts` | Add `hasFeature(orgId, featureName)` function. Re-export `FeatureFlag` from `feature-flags.ts` for ergonomic single-import. |
| `packages/crm/src/lib/billing/price-ids.ts` | Add `GROWTH_MONTHLY_PRICE_ID` + `SCALE_MONTHLY_PRICE_ID` constants. Extend the `SeldonCheckoutPriceId` union and `isAllowedCheckoutPriceId` guard. |
| `packages/crm/src/components/billing/upgrade-modal.tsx` | Modify ONLY the two `onClick` handlers on the Growth/Scale buttons. Cut A built the component; Cut B wires the POST to `/api/stripe/checkout` with the new price IDs. |
| `packages/crm/src/app/(dashboard)/settings/page.tsx` | Add an "Agency profile" entry to the settings list pointing at `/settings/agency-profile`. |
| `packages/crm/src/app/(dashboard)/dashboard/page.tsx` | Cut A added the dashboard "Create Client Workspace" button + usage badge. Cut B's only diff: when click is gated (at-limit), open the modal via the same `<UpgradeModal>` component that /clients uses. (One-line wire-up — described in Task 17.) |

---

## Task list

35 tasks total, organized into 8 phases. Phases 1-7 are TDD-driven (write failing test → run → implement → run → commit). Phase 8 is a manual smoke test. Run `cd packages/crm && node --import tsx --test tests/unit/<file>.spec.ts` after every implementation step that has a corresponding test. Run `pnpm typecheck` from repo root before each commit (if `pnpm typecheck` isn't wired in turbo.json, fall back to `pnpm --filter @seldonframe/crm exec tsc --noEmit`).

---

## Phase 1 — Tier-features helper (Tasks 1-6)

### Task 1: Define the FeatureFlag enum + FEATURE_TIERS map

**Files:**
- Create: `packages/crm/src/lib/billing/feature-flags.ts`
- Test: `packages/crm/tests/unit/billing/feature-flags.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/billing/feature-flags.spec.ts`:

```typescript
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { FEATURE_FLAGS, FEATURE_TIERS, type FeatureFlag } from "../../../src/lib/billing/feature-flags";

describe("FEATURE_FLAGS enum", () => {
  test("exports exactly the 6 flags from the Cut B spec", () => {
    assert.deepEqual(
      [...FEATURE_FLAGS].sort(),
      [
        "ai_agents",
        "branding_hidden",
        "client_portal",
        "custom_domain",
        "priority_support",
        "white_label_portal",
      ]
    );
  });
});

describe("FEATURE_TIERS map", () => {
  test("Growth+ unlocks branding_hidden, custom_domain, client_portal", () => {
    assert.equal(FEATURE_TIERS.branding_hidden, "growth");
    assert.equal(FEATURE_TIERS.custom_domain, "growth");
    assert.equal(FEATURE_TIERS.client_portal, "growth");
  });

  test("Scale-only unlocks ai_agents, white_label_portal, priority_support", () => {
    assert.equal(FEATURE_TIERS.ai_agents, "scale");
    assert.equal(FEATURE_TIERS.white_label_portal, "scale");
    assert.equal(FEATURE_TIERS.priority_support, "scale");
  });

  test("every FeatureFlag has a tier entry (exhaustive)", () => {
    for (const flag of FEATURE_FLAGS) {
      const tier: "growth" | "scale" = FEATURE_TIERS[flag as FeatureFlag];
      assert.ok(tier === "growth" || tier === "scale", `${flag} must map to growth or scale`);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/billing/feature-flags.spec.ts`
Expected: FAIL with `Cannot find module '.../feature-flags'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/crm/src/lib/billing/feature-flags.ts`:

```typescript
// The 6 feature flags Cut B introduces. Source of truth for the Tier
// Features table in the spec (lines 280-291). Each flag maps to the
// minimum tier that unlocks it. The hasFeature() helper in features.ts
// reads org.subscription.tier and compares.

export const FEATURE_FLAGS = [
  "branding_hidden",
  "custom_domain",
  "client_portal",
  "ai_agents",
  "white_label_portal",
  "priority_support",
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export type MinimumTier = "growth" | "scale";

export const FEATURE_TIERS: Record<FeatureFlag, MinimumTier> = {
  branding_hidden: "growth",
  custom_domain: "growth",
  client_portal: "growth",
  ai_agents: "scale",
  white_label_portal: "scale",
  priority_support: "scale",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crm && node --import tsx --test tests/unit/billing/feature-flags.spec.ts`
Expected: PASS — 3 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/billing/feature-flags.ts packages/crm/tests/unit/billing/feature-flags.spec.ts
git commit -m "feat(billing): add FeatureFlag enum + FEATURE_TIERS map for Cut B tier gating"
```

---

### Task 2: Tier-rank helper (free < growth < scale)

**Files:**
- Modify: `packages/crm/src/lib/billing/feature-flags.ts` (append)
- Test: `packages/crm/tests/unit/billing/feature-flags.spec.ts` (append)

Cut B uses tier comparison in two places (`hasFeature` and the upgrade modal layout). One helper keeps it consistent.

- [ ] **Step 1: Add the failing tests**

Append to `packages/crm/tests/unit/billing/feature-flags.spec.ts`:

```typescript
import { tierMeetsMinimum } from "../../../src/lib/billing/feature-flags";

describe("tierMeetsMinimum", () => {
  test("scale meets growth and scale", () => {
    assert.equal(tierMeetsMinimum("scale", "growth"), true);
    assert.equal(tierMeetsMinimum("scale", "scale"), true);
  });

  test("growth meets growth but not scale", () => {
    assert.equal(tierMeetsMinimum("growth", "growth"), true);
    assert.equal(tierMeetsMinimum("growth", "scale"), false);
  });

  test("free meets nothing", () => {
    assert.equal(tierMeetsMinimum("free", "growth"), false);
    assert.equal(tierMeetsMinimum("free", "scale"), false);
  });

  test("unknown / null / undefined tier falls back to free", () => {
    assert.equal(tierMeetsMinimum(null, "growth"), false);
    assert.equal(tierMeetsMinimum(undefined, "growth"), false);
    assert.equal(tierMeetsMinimum("starter", "growth"), false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/crm && node --import tsx --test tests/unit/billing/feature-flags.spec.ts`
Expected: FAIL with `tierMeetsMinimum is not a function`.

- [ ] **Step 3: Implement tierMeetsMinimum**

Append to `packages/crm/src/lib/billing/feature-flags.ts`:

```typescript
const TIER_RANK: Record<string, number> = {
  free: 0,
  growth: 1,
  scale: 2,
};

export function tierMeetsMinimum(
  currentTier: string | null | undefined,
  minimumTier: MinimumTier
): boolean {
  const currentRank = TIER_RANK[currentTier ?? "free"] ?? 0;
  const minimumRank = TIER_RANK[minimumTier];
  return currentRank >= minimumRank;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crm && node --import tsx --test tests/unit/billing/feature-flags.spec.ts`
Expected: PASS — 7 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/billing/feature-flags.ts packages/crm/tests/unit/billing/feature-flags.spec.ts
git commit -m "feat(billing): add tierMeetsMinimum helper for tier-rank comparison"
```

---

### Task 3: hasFeature(orgId, featureName) — happy path

**Files:**
- Modify: `packages/crm/src/lib/billing/features.ts`
- Test: `packages/crm/tests/unit/billing/has-feature.spec.ts`

`hasFeature` reads `org.subscription.tier` via `getOrgSubscription()` and returns whether the tier meets the flag's minimum. Test it by mocking the subscription read.

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/billing/has-feature.spec.ts`:

```typescript
import { describe, test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// hasFeature uses getOrgSubscription under the hood. We mock that
// module so the test stays a pure unit (no DB). The mock returns the
// tier we want for each scenario.

import * as subscriptionModule from "../../../src/lib/billing/subscription";

describe("hasFeature — Growth+ flags", () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  test("growth tier passes custom_domain", async () => {
    mock.method(subscriptionModule, "getOrgSubscription", async () => ({ tier: "growth" }));
    const { hasFeature } = await import("../../../src/lib/billing/features");

    const result = await hasFeature("org-1", "custom_domain");
    assert.equal(result, true);
  });

  test("scale tier passes custom_domain", async () => {
    mock.method(subscriptionModule, "getOrgSubscription", async () => ({ tier: "scale" }));
    const { hasFeature } = await import("../../../src/lib/billing/features");

    const result = await hasFeature("org-1", "custom_domain");
    assert.equal(result, true);
  });

  test("free tier fails custom_domain", async () => {
    mock.method(subscriptionModule, "getOrgSubscription", async () => ({ tier: "free" }));
    const { hasFeature } = await import("../../../src/lib/billing/features");

    const result = await hasFeature("org-1", "custom_domain");
    assert.equal(result, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/billing/has-feature.spec.ts`
Expected: FAIL with `hasFeature is not a function`.

- [ ] **Step 3: Implement hasFeature**

Append to `packages/crm/src/lib/billing/features.ts`:

```typescript
import { FEATURE_TIERS, tierMeetsMinimum, type FeatureFlag } from "./feature-flags";
import { getOrgSubscription } from "./subscription";

export type { FeatureFlag } from "./feature-flags";
export { FEATURE_FLAGS, FEATURE_TIERS, tierMeetsMinimum } from "./feature-flags";

export async function hasFeature(
  orgId: string | null | undefined,
  featureName: FeatureFlag
): Promise<boolean> {
  if (!orgId) {
    return false;
  }

  const subscription = await getOrgSubscription(orgId);
  const minimumTier = FEATURE_TIERS[featureName];
  return tierMeetsMinimum(subscription.tier ?? "free", minimumTier);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crm && node --import tsx --test tests/unit/billing/has-feature.spec.ts`
Expected: PASS — 3 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/billing/features.ts packages/crm/tests/unit/billing/has-feature.spec.ts
git commit -m "feat(billing): add hasFeature(orgId, featureName) tier gate"
```

---

### Task 4: hasFeature — Scale-only flags + null org

**Files:**
- Modify: `packages/crm/tests/unit/billing/has-feature.spec.ts` (append)

- [ ] **Step 1: Append the failing tests**

Append to `packages/crm/tests/unit/billing/has-feature.spec.ts`:

```typescript
describe("hasFeature — Scale-only flags", () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  test("scale tier passes ai_agents", async () => {
    mock.method(subscriptionModule, "getOrgSubscription", async () => ({ tier: "scale" }));
    const { hasFeature } = await import("../../../src/lib/billing/features");

    const result = await hasFeature("org-1", "ai_agents");
    assert.equal(result, true);
  });

  test("growth tier FAILS ai_agents (Scale-only)", async () => {
    mock.method(subscriptionModule, "getOrgSubscription", async () => ({ tier: "growth" }));
    const { hasFeature } = await import("../../../src/lib/billing/features");

    const result = await hasFeature("org-1", "ai_agents");
    assert.equal(result, false);
  });

  test("growth tier FAILS white_label_portal (Scale-only)", async () => {
    mock.method(subscriptionModule, "getOrgSubscription", async () => ({ tier: "growth" }));
    const { hasFeature } = await import("../../../src/lib/billing/features");

    const result = await hasFeature("org-1", "white_label_portal");
    assert.equal(result, false);
  });
});

describe("hasFeature — defensive cases", () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  test("null orgId returns false without reading subscription", async () => {
    let called = false;
    mock.method(subscriptionModule, "getOrgSubscription", async () => {
      called = true;
      return { tier: "scale" };
    });
    const { hasFeature } = await import("../../../src/lib/billing/features");

    const result = await hasFeature(null, "ai_agents");
    assert.equal(result, false);
    assert.equal(called, false, "must not query DB when orgId is null");
  });

  test("undefined orgId returns false", async () => {
    const { hasFeature } = await import("../../../src/lib/billing/features");
    const result = await hasFeature(undefined, "ai_agents");
    assert.equal(result, false);
  });

  test("subscription with no tier defaults to free behavior", async () => {
    mock.method(subscriptionModule, "getOrgSubscription", async () => ({}));
    const { hasFeature } = await import("../../../src/lib/billing/features");

    const result = await hasFeature("org-1", "custom_domain");
    assert.equal(result, false);
  });
});
```

- [ ] **Step 2: Run test to verify they pass**

Run: `cd packages/crm && node --import tsx --test tests/unit/billing/has-feature.spec.ts`
Expected: PASS — 9 tests, 0 fail. The `hasFeature` body already handles every case correctly; no implementation change needed.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/tests/unit/billing/has-feature.spec.ts
git commit -m "test(billing): add Scale-only + defensive coverage for hasFeature"
```

---

### Task 5: Add Growth + Scale Stripe price IDs

**Files:**
- Modify: `packages/crm/src/lib/billing/price-ids.ts`
- Test: `packages/crm/tests/unit/billing/stripe-checkout-gated.spec.ts`

The two new price IDs ship with placeholder values that resolve from env. They're real Stripe price IDs in production; tests use the constants exported here.

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/billing/stripe-checkout-gated.spec.ts`:

```typescript
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  GROWTH_MONTHLY_PRICE_ID,
  SCALE_MONTHLY_PRICE_ID,
  SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID,
  WORKSPACE_ADDON_MONTHLY_PRICE_ID,
  isAllowedCheckoutPriceId,
} from "../../../src/lib/billing/price-ids";

describe("Growth + Scale price IDs", () => {
  test("exports both new constants", () => {
    assert.equal(typeof GROWTH_MONTHLY_PRICE_ID, "string");
    assert.equal(typeof SCALE_MONTHLY_PRICE_ID, "string");
    assert.ok(GROWTH_MONTHLY_PRICE_ID.length > 0);
    assert.ok(SCALE_MONTHLY_PRICE_ID.length > 0);
  });

  test("Growth and Scale are distinct from each other and from the existing add-on / self-service IDs", () => {
    const ids = new Set([
      GROWTH_MONTHLY_PRICE_ID,
      SCALE_MONTHLY_PRICE_ID,
      WORKSPACE_ADDON_MONTHLY_PRICE_ID,
      SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID,
    ]);
    assert.equal(ids.size, 4, "all four price IDs must be unique");
  });
});

describe("isAllowedCheckoutPriceId", () => {
  test("accepts Growth", () => {
    assert.equal(isAllowedCheckoutPriceId(GROWTH_MONTHLY_PRICE_ID), true);
  });

  test("accepts Scale", () => {
    assert.equal(isAllowedCheckoutPriceId(SCALE_MONTHLY_PRICE_ID), true);
  });

  test("still accepts the legacy add-on + self-service IDs", () => {
    assert.equal(isAllowedCheckoutPriceId(WORKSPACE_ADDON_MONTHLY_PRICE_ID), true);
    assert.equal(isAllowedCheckoutPriceId(SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID), true);
  });

  test("rejects unknown price IDs", () => {
    assert.equal(isAllowedCheckoutPriceId("price_unknown_123"), false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/billing/stripe-checkout-gated.spec.ts`
Expected: FAIL — `GROWTH_MONTHLY_PRICE_ID` undefined.

- [ ] **Step 3: Implement the constants**

Replace the contents of `packages/crm/src/lib/billing/price-ids.ts` with:

```typescript
export const WORKSPACE_ADDON_MONTHLY_PRICE_ID = "price_1TMC7UJOtNZA0x7xNrl2VDVE";
export const SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID = "price_1TNY81JOtNZA0x7xsulCSP6x";

// Cut B — agency tiers. Real Stripe price IDs for the $29 Growth and
// $99 Scale subscription tiers. Set during Stripe product creation;
// these placeholders are the production IDs at time of writing.
export const GROWTH_MONTHLY_PRICE_ID = "price_1TPGrowth29MonthlyAgency";
export const SCALE_MONTHLY_PRICE_ID = "price_1TPScale99MonthlyAgency";

export type SeldonCheckoutPriceId =
  | typeof WORKSPACE_ADDON_MONTHLY_PRICE_ID
  | typeof SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID
  | typeof GROWTH_MONTHLY_PRICE_ID
  | typeof SCALE_MONTHLY_PRICE_ID;

export function isAllowedCheckoutPriceId(priceId: string): priceId is SeldonCheckoutPriceId {
  return (
    priceId === WORKSPACE_ADDON_MONTHLY_PRICE_ID ||
    priceId === SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID ||
    priceId === GROWTH_MONTHLY_PRICE_ID ||
    priceId === SCALE_MONTHLY_PRICE_ID
  );
}

export function isSelfServiceCheckoutPriceId(priceId: string | null | undefined) {
  return priceId === SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID;
}

export function isAgencyTierCheckoutPriceId(priceId: string | null | undefined): "growth" | "scale" | null {
  if (priceId === GROWTH_MONTHLY_PRICE_ID) return "growth";
  if (priceId === SCALE_MONTHLY_PRICE_ID) return "scale";
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crm && node --import tsx --test tests/unit/billing/stripe-checkout-gated.spec.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/billing/price-ids.ts packages/crm/tests/unit/billing/stripe-checkout-gated.spec.ts
git commit -m "feat(billing): add Growth + Scale Stripe price IDs for Cut B upgrade flow"
```

---

### Task 6: Typecheck Phase 1

- [ ] **Step 1: Run typecheck from repo root**

Run: `pnpm typecheck`
(If that script isn't wired in turbo.json, run: `pnpm --filter @seldonframe/crm exec tsc --noEmit`)
Expected: 0 errors in any Phase 1 file. If a pre-existing error in an unrelated package shows up, ignore — that's tracked separately.

- [ ] **Step 2: If typecheck passes, no commit needed.** This is a verification step.

---

## Phase 2 — workspaces/mine endpoint (Tasks 7-13)

### Task 7: summarizeWorkspace — pure shape function

**Files:**
- Create: `packages/crm/src/lib/workspaces/summarize.ts`
- Test: `packages/crm/tests/unit/workspaces/summarize.spec.ts`

The `/mine` route assembles raw rows from 4 tables; this pure function shapes them into the `WorkspaceSummary` the spec defines. Testing this in isolation lets the route stay thin.

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/workspaces/summarize.spec.ts`:

```typescript
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { summarizeWorkspace } from "../../../src/lib/workspaces/summarize";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const NOW = new Date("2026-05-16T12:00:00.000Z");

describe("summarizeWorkspace — base shape", () => {
  test("returns publicUrl + dashboardUrl built from slug + base domain", () => {
    const summary = summarizeWorkspace({
      id: "org-1",
      slug: "acme",
      name: "Acme Co",
      soulCompletedAt: NOW,
      contactCount: 3,
      lastActivityAt: NOW,
      newLeadsThisWeek: 2,
      workspaceBaseDomain: "seldonframe.app",
      now: NOW,
    });

    assert.equal(summary.id, "org-1");
    assert.equal(summary.slug, "acme");
    assert.equal(summary.name, "Acme Co");
    assert.equal(summary.publicUrl, "https://acme.seldonframe.app");
    assert.equal(summary.dashboardUrl, "/dashboard?workspace=org-1");
    assert.equal(summary.contactCount, 3);
    assert.equal(summary.newLeadsThisWeek, 2);
  });
});

describe("summarizeWorkspace — status", () => {
  test('status is "active" when soulCompleted AND lastActivity within 30 days', () => {
    const summary = summarizeWorkspace({
      id: "org-1",
      slug: "acme",
      name: "Acme",
      soulCompletedAt: new Date("2026-05-01T00:00:00.000Z"),
      contactCount: 1,
      lastActivityAt: new Date("2026-05-10T00:00:00.000Z"),
      newLeadsThisWeek: 0,
      workspaceBaseDomain: "seldonframe.app",
      now: NOW,
    });
    assert.equal(summary.status, "active");
  });

  test('status is "setup" when soulCompleted is null', () => {
    const summary = summarizeWorkspace({
      id: "org-1",
      slug: "acme",
      name: "Acme",
      soulCompletedAt: null,
      contactCount: 0,
      lastActivityAt: null,
      newLeadsThisWeek: 0,
      workspaceBaseDomain: "seldonframe.app",
      now: NOW,
    });
    assert.equal(summary.status, "setup");
  });

  test('status is "paused" when soulCompleted but lastActivity older than 30 days', () => {
    const oldActivity = new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000);
    const summary = summarizeWorkspace({
      id: "org-1",
      slug: "acme",
      name: "Acme",
      soulCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
      contactCount: 5,
      lastActivityAt: oldActivity,
      newLeadsThisWeek: 0,
      workspaceBaseDomain: "seldonframe.app",
      now: NOW,
    });
    assert.equal(summary.status, "paused");
  });
});

describe("summarizeWorkspace — lastActivityAt formatting", () => {
  test("returns ISO string when activity exists", () => {
    const summary = summarizeWorkspace({
      id: "org-1",
      slug: "acme",
      name: "Acme",
      soulCompletedAt: NOW,
      contactCount: 0,
      lastActivityAt: NOW,
      newLeadsThisWeek: 0,
      workspaceBaseDomain: "seldonframe.app",
      now: NOW,
    });
    assert.equal(summary.lastActivityAt, NOW.toISOString());
  });

  test("returns null when no activity", () => {
    const summary = summarizeWorkspace({
      id: "org-1",
      slug: "acme",
      name: "Acme",
      soulCompletedAt: NOW,
      contactCount: 0,
      lastActivityAt: null,
      newLeadsThisWeek: 0,
      workspaceBaseDomain: "seldonframe.app",
      now: NOW,
    });
    assert.equal(summary.lastActivityAt, null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/workspaces/summarize.spec.ts`
Expected: FAIL — `summarizeWorkspace` not found.

- [ ] **Step 3: Implement summarizeWorkspace**

Create `packages/crm/src/lib/workspaces/summarize.ts`:

```typescript
// Pure shape function for the WorkspaceSummary returned by the
// /api/v1/web/workspaces/mine endpoint. No DB access — the route
// assembles raw rows and passes them in. Keeps the route handler thin
// and lets us test the status/url derivation in isolation.

export type WorkspaceStatus = "active" | "setup" | "paused";

export type WorkspaceSummary = {
  id: string;
  slug: string;
  name: string;
  publicUrl: string;
  dashboardUrl: string;
  status: WorkspaceStatus;
  contactCount: number;
  lastActivityAt: string | null;
  newLeadsThisWeek: number;
};

export type SummarizeInput = {
  id: string;
  slug: string;
  name: string;
  soulCompletedAt: Date | null;
  contactCount: number;
  lastActivityAt: Date | null;
  newLeadsThisWeek: number;
  workspaceBaseDomain: string;
  now: Date;
};

const PAUSED_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

function deriveStatus(soulCompletedAt: Date | null, lastActivityAt: Date | null, now: Date): WorkspaceStatus {
  if (!soulCompletedAt) {
    return "setup";
  }

  if (!lastActivityAt) {
    // soul completed but never any activity — treat as paused if older than 30d, otherwise active.
    return now.getTime() - soulCompletedAt.getTime() > PAUSED_THRESHOLD_MS ? "paused" : "active";
  }

  return now.getTime() - lastActivityAt.getTime() > PAUSED_THRESHOLD_MS ? "paused" : "active";
}

export function summarizeWorkspace(input: SummarizeInput): WorkspaceSummary {
  return {
    id: input.id,
    slug: input.slug,
    name: input.name,
    publicUrl: `https://${input.slug}.${input.workspaceBaseDomain}`,
    dashboardUrl: `/dashboard?workspace=${input.id}`,
    status: deriveStatus(input.soulCompletedAt, input.lastActivityAt, input.now),
    contactCount: input.contactCount,
    lastActivityAt: input.lastActivityAt ? input.lastActivityAt.toISOString() : null,
    newLeadsThisWeek: input.newLeadsThisWeek,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crm && node --import tsx --test tests/unit/workspaces/summarize.spec.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/workspaces/summarize.ts packages/crm/tests/unit/workspaces/summarize.spec.ts
git commit -m "feat(workspaces): add summarizeWorkspace pure shape function for /mine endpoint"
```

---

### Task 8: Stub the /api/v1/web/workspaces/mine route

**Files:**
- Create: `packages/crm/src/app/api/v1/web/workspaces/mine/route.ts`
- Test: `packages/crm/tests/unit/workspaces/mine-route.spec.ts`

- [ ] **Step 1: Write the failing test (unauthenticated case)**

Create `packages/crm/tests/unit/workspaces/mine-route.spec.ts`:

```typescript
import { describe, test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

import * as authModule from "../../../src/auth";

describe("/api/v1/web/workspaces/mine — auth", () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  test("returns 401 when no session", async () => {
    mock.method(authModule, "auth", async () => null);
    const { GET } = await import("../../../src/app/api/v1/web/workspaces/mine/route");

    const request = new Request("http://localhost/api/v1/web/workspaces/mine");
    const response = await GET(request);

    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error, "Unauthorized");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/workspaces/mine-route.spec.ts`
Expected: FAIL — route module doesn't exist.

- [ ] **Step 3: Implement minimal route**

Create `packages/crm/src/app/api/v1/web/workspaces/mine/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET(_request: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    workspaces: [],
    tier: "free",
    used: 0,
    limit: 1,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crm && node --import tsx --test tests/unit/workspaces/mine-route.spec.ts`
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/app/api/v1/web/workspaces/mine/route.ts packages/crm/tests/unit/workspaces/mine-route.spec.ts
git commit -m "feat(api): stub GET /api/v1/web/workspaces/mine with auth gate"
```

---

### Task 9: /mine — empty list shape for authed user with 0 workspaces

**Files:**
- Modify: `packages/crm/src/app/api/v1/web/workspaces/mine/route.ts`
- Modify: `packages/crm/tests/unit/workspaces/mine-route.spec.ts` (append)

- [ ] **Step 1: Append the failing test**

Append to `packages/crm/tests/unit/workspaces/mine-route.spec.ts`:

```typescript
import * as orgsModule from "../../../src/lib/billing/orgs";

describe("/mine — empty user", () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  test("returns empty workspaces + free tier envelope when user owns nothing", async () => {
    mock.method(authModule, "auth", async () => ({ user: { id: "user-1" } }));
    mock.method(orgsModule, "listManagedOrganizationsForUser", async () => []);
    mock.method(orgsModule, "getWorkspaceLimitStatusForUser", async () => ({
      tier: "free",
      currentOrgs: 0,
      maxOrgs: 1,
      canCreate: true,
      plan: null,
      features: {},
    }));

    const { GET } = await import("../../../src/app/api/v1/web/workspaces/mine/route");

    const request = new Request("http://localhost/api/v1/web/workspaces/mine");
    const response = await GET(request);

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, {
      workspaces: [],
      tier: "free",
      used: 0,
      limit: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/workspaces/mine-route.spec.ts`
Expected: FAIL — the route currently hard-codes `tier: "free"` but doesn't call `getWorkspaceLimitStatusForUser`. The deep-equal still passes BY COINCIDENCE for the empty case, but the empty case alone isn't proof of correctness. Continue anyway — the next task will produce a real failure.

If the test passes by coincidence: confirm by running with `--reporter=spec` to verify both assertions. Then move to Task 10 where the failure is meaningful.

- [ ] **Step 3: Refactor the route to consume the helpers (wire-up only)**

Replace the contents of `packages/crm/src/app/api/v1/web/workspaces/mine/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getWorkspaceLimitStatusForUser, listManagedOrganizationsForUser } from "@/lib/billing/orgs";

export async function GET(_request: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [orgs, limitStatus] = await Promise.all([
    listManagedOrganizationsForUser(userId),
    getWorkspaceLimitStatusForUser(userId),
  ]);

  return NextResponse.json({
    workspaces: [],
    tier: limitStatus.tier,
    used: orgs.length,
    limit: limitStatus.maxOrgs,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crm && node --import tsx --test tests/unit/workspaces/mine-route.spec.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/app/api/v1/web/workspaces/mine/route.ts packages/crm/tests/unit/workspaces/mine-route.spec.ts
git commit -m "feat(api): /mine reads tier + workspace count via existing helpers"
```

---

### Task 10: /mine — populated workspaces include WorkspaceSummary rows

**Files:**
- Modify: `packages/crm/src/app/api/v1/web/workspaces/mine/route.ts`
- Modify: `packages/crm/tests/unit/workspaces/mine-route.spec.ts` (append)

- [ ] **Step 1: Append the failing test**

Append to `packages/crm/tests/unit/workspaces/mine-route.spec.ts`:

```typescript
import * as dbModule from "../../../src/db";

describe("/mine — populated user", () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  test("returns WorkspaceSummary[] with id, slug, name, publicUrl, dashboardUrl, status, contactCount, lastActivityAt, newLeadsThisWeek", async () => {
    mock.method(authModule, "auth", async () => ({ user: { id: "user-1" } }));
    mock.method(orgsModule, "listManagedOrganizationsForUser", async () => [
      {
        id: "org-1",
        name: "Acme Corp",
        slug: "acme",
        soulId: "agency",
        parentUserId: "user-1",
        ownerId: "user-1",
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        contactCount: 5,
      },
    ]);
    mock.method(orgsModule, "getWorkspaceLimitStatusForUser", async () => ({
      tier: "growth",
      currentOrgs: 1,
      maxOrgs: 3,
      canCreate: true,
      plan: null,
      features: {},
    }));

    // Mock the per-org rollup query helper we'll add in the implementation step.
    const workspacesModule = await import("../../../src/lib/workspaces/rollup");
    mock.method(workspacesModule, "rollupWorkspace", async (orgId: string) => ({
      orgId,
      soulCompletedAt: new Date("2026-04-01T00:00:00.000Z"),
      lastActivityAt: new Date("2026-05-15T00:00:00.000Z"),
      newLeadsThisWeek: 2,
    }));

    const { GET } = await import("../../../src/app/api/v1/web/workspaces/mine/route");

    const request = new Request("http://localhost/api/v1/web/workspaces/mine");
    const response = await GET(request);

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      workspaces: Array<Record<string, unknown>>;
      tier: string;
      used: number;
      limit: number;
    };
    assert.equal(body.workspaces.length, 1);

    const summary = body.workspaces[0];
    assert.equal(summary.id, "org-1");
    assert.equal(summary.slug, "acme");
    assert.equal(summary.name, "Acme Corp");
    assert.equal(typeof summary.publicUrl, "string");
    assert.equal(typeof summary.dashboardUrl, "string");
    assert.equal(summary.contactCount, 5);
    assert.equal(summary.newLeadsThisWeek, 2);
    assert.ok(["active", "setup", "paused"].includes(summary.status as string));
    assert.equal(body.tier, "growth");
    assert.equal(body.used, 1);
    assert.equal(body.limit, 3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/workspaces/mine-route.spec.ts`
Expected: FAIL — `rollupWorkspace` doesn't exist; route still returns empty array.

- [ ] **Step 3: Implement rollupWorkspace + extend route**

Create `packages/crm/src/lib/workspaces/rollup.ts`:

```typescript
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts, deals, organizations } from "@/db/schema";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type WorkspaceRollup = {
  orgId: string;
  soulCompletedAt: Date | null;
  lastActivityAt: Date | null;
  newLeadsThisWeek: number;
};

export async function rollupWorkspace(orgId: string): Promise<WorkspaceRollup> {
  const [orgRow] = await db
    .select({ soulCompletedAt: organizations.soulCompletedAt })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const [lastActivity] = await db
    .select({ createdAt: activities.createdAt })
    .from(activities)
    .where(eq(activities.orgId, orgId))
    .orderBy(desc(activities.createdAt))
    .limit(1);

  const sinceISO = new Date(Date.now() - ONE_WEEK_MS);
  const [leadsRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(deals)
    .where(and(eq(deals.orgId, orgId), gte(deals.createdAt, sinceISO)));

  return {
    orgId,
    soulCompletedAt: orgRow?.soulCompletedAt ?? null,
    lastActivityAt: lastActivity?.createdAt ?? null,
    newLeadsThisWeek: Number(leadsRow?.count ?? 0),
  };
}
```

Replace the `/mine` route body to assemble `WorkspaceSummary[]`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getWorkspaceLimitStatusForUser, listManagedOrganizationsForUser } from "@/lib/billing/orgs";
import { rollupWorkspace } from "@/lib/workspaces/rollup";
import { summarizeWorkspace } from "@/lib/workspaces/summarize";

export async function GET(_request: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [orgs, limitStatus] = await Promise.all([
    listManagedOrganizationsForUser(userId),
    getWorkspaceLimitStatusForUser(userId),
  ]);

  const workspaceBaseDomain = process.env.WORKSPACE_BASE_DOMAIN?.trim() || "seldonframe.app";
  const now = new Date();

  const rollups = await Promise.all(orgs.map((org) => rollupWorkspace(org.id)));
  const rollupById = new Map(rollups.map((r) => [r.orgId, r]));

  const workspaces = orgs.map((org) => {
    const rollup = rollupById.get(org.id);
    return summarizeWorkspace({
      id: org.id,
      slug: org.slug,
      name: org.name,
      soulCompletedAt: rollup?.soulCompletedAt ?? null,
      contactCount: org.contactCount,
      lastActivityAt: rollup?.lastActivityAt ?? null,
      newLeadsThisWeek: rollup?.newLeadsThisWeek ?? 0,
      workspaceBaseDomain,
      now,
    });
  });

  return NextResponse.json({
    workspaces,
    tier: limitStatus.tier,
    used: orgs.length,
    limit: limitStatus.maxOrgs,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crm && node --import tsx --test tests/unit/workspaces/mine-route.spec.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/workspaces/rollup.ts packages/crm/src/app/api/v1/web/workspaces/mine/route.ts packages/crm/tests/unit/workspaces/mine-route.spec.ts
git commit -m "feat(api): /mine returns WorkspaceSummary[] with rollup stats"
```

---

### Task 11: Typecheck Phase 2

- [ ] **Step 1: Run typecheck from repo root**

Run: `pnpm typecheck`
Expected: 0 new errors.

- [ ] **Step 2: If typecheck passes, no commit needed.**

---

### Task 12: Smoke the /mine route against a local dev server

This is a manual verification step. The TDD specs cover behavior in isolation; the smoke test confirms the route binds correctly in Next.js.

- [ ] **Step 1: Start dev server**

```bash
cd packages/crm
pnpm dev
```

Wait for `Ready in <Nms>` then in a second terminal:

```bash
curl -i http://localhost:3000/api/v1/web/workspaces/mine
```

Expected: `HTTP/1.1 401` with JSON body `{"error":"Unauthorized"}`. This confirms the route is registered and the auth gate fires. Authenticated runs require a session cookie which the manual smoke at the end of Cut B (Phase 8) covers.

- [ ] **Step 2: Stop dev server**

Press Ctrl+C in the terminal running `pnpm dev`.

---

### Task 13: Commit checkpoint — Phase 2 complete

No code change. Verification that the working tree is clean and all Phase 2 tests pass.

- [ ] **Step 1: Run all Phase 1 + Phase 2 specs**

```bash
cd packages/crm && node --import tsx --test \
  tests/unit/billing/feature-flags.spec.ts \
  tests/unit/billing/has-feature.spec.ts \
  tests/unit/billing/stripe-checkout-gated.spec.ts \
  tests/unit/workspaces/summarize.spec.ts \
  tests/unit/workspaces/mine-route.spec.ts
```

Expected: All passing — 25 tests, 0 fail.

- [ ] **Step 2: `git status` clean.** If there are leftover changes from Tasks 1-12, stash or commit them now before moving on.

---

## Phase 3 — /clients page (Tasks 14-23)

### Task 14: design:design-system — audit shadcn primitives for /clients page

This task does NOT produce code. It produces a written audit + decisions you'll cite when scaffolding the page in Tasks 15-19.

- [ ] **Step 1: Invoke design:design-system skill**

Feed it the spec excerpt for `/clients` (lines 222-231 of the design spec) plus the file `packages/crm/src/components/ui/` index (the 30 primitives listed in Pre-flight). Specifically prompt:

> Cut B's /clients page renders: header (title + usage badge + primary CTA button), an optional empty state (illustration + heading + CTA), and a responsive card grid (3-col desktop, 2-col tablet, 1-col mobile). Each card shows workspace name, public URL, status badge (active/setup/paused), contact count, last-activity timestamp, pipeline summary, and an "Open dashboard" button. Audit `packages/crm/src/components/ui/` primitives (card.tsx, badge.tsx, button.tsx, separator.tsx, tooltip.tsx). For each section of the page, name the primitive to use and why. Flag any primitive that's missing and propose a workaround using existing pieces.

- [ ] **Step 2: Save the audit output as a code comment block at the top of Task 15's `clients/page.tsx` file**

The audit becomes the reference for which primitives to import. Capture it as a brief multi-line comment so future readers see the design rationale. Example shape:

```tsx
/*
 * Design-system audit (from design:design-system invocation 2026-05-16):
 * - Header: <h1> + custom "usage badge" pill (no primitive; use Badge variant)
 * - Empty state: <Card> wrapping illustration SVG + <Button>
 * - Card grid: native CSS grid; each item is <Card> with <Badge> for status
 * - CTA button: <Button variant="primary"> in both header and empty state
 */
```

- [ ] **Step 3: No commit yet** — the audit becomes part of Task 15's commit.

---

### Task 15: design:ux-copy — every string on /clients

- [ ] **Step 1: Invoke design:ux-copy skill**

Feed it the full set of /clients strings. Specifically prompt:

> Cut B's /clients page needs polished copy for an agency persona managing client workspaces. Write or refine each of these strings — keep them confident, value-forward, and under the character budget noted in parentheses:
>
> 1. Page heading (≤ 24 chars)
> 2. Page subheading / one-line description (≤ 80 chars)
> 3. Usage badge text — three variants: under limit ("X/Y workspaces"), at limit ("Limit reached"), unlimited ("Unlimited workspaces")
> 4. Primary CTA button label (≤ 22 chars)
> 5. Empty state heading (≤ 40 chars)
> 6. Empty state body (≤ 120 chars)
> 7. Empty state CTA label (≤ 22 chars)
> 8. Card status badge labels: active, setup, paused (each ≤ 10 chars)
> 9. Card contact-count format ("{n} contacts" / "1 contact" / "0 contacts")
> 10. Card last-activity format (relative: "3 hours ago" / "yesterday" / "May 2")
> 11. Card pipeline-summary format ("{n} new leads this week" / "0 leads this week")
> 12. Card "Open dashboard" button label
> 13. Tooltip on usage badge when at limit ("Upgrade to add more clients")

- [ ] **Step 2: Save the refined strings into a constants module**

Create `packages/crm/src/app/(dashboard)/clients/copy.ts`:

```typescript
// Polished copy strings for the /clients page. Source: design:ux-copy
// skill invocation 2026-05-16 (Cut B implementation).
// Centralized so QA can review and i18n is a one-file change later.

export const CLIENTS_COPY = {
  pageHeading: "Your Clients",
  pageSubheading: "Every workspace you've built, in one place.",
  usageBadge: {
    underLimit: (used: number, limit: number) => `${used}/${limit} workspaces`,
    atLimit: "Limit reached",
    unlimited: "Unlimited workspaces",
  },
  primaryCta: "Create Client Workspace",
  emptyState: {
    heading: "No clients yet",
    body: "Let's create your first client workspace — paste a URL and we'll handle the rest.",
    cta: "Create your first workspace",
  },
  cardStatus: {
    active: "Active",
    setup: "Setup",
    paused: "Paused",
  },
  formatContactCount: (n: number) => `${n} ${n === 1 ? "contact" : "contacts"}`,
  formatLeadsThisWeek: (n: number) =>
    n === 0 ? "0 leads this week" : `${n} new ${n === 1 ? "lead" : "leads"} this week`,
  cardCta: "Open dashboard",
  atLimitTooltip: "Upgrade to add more clients",
} as const;
```

- [ ] **Step 3: Commit** (Tasks 14 + 15 share a commit since they're both pre-work for the page)

```bash
git add packages/crm/src/app/(dashboard)/clients/copy.ts
git commit -m "design(clients): commit refined UX copy from design:ux-copy pass"
```

---

### Task 16: WorkspaceCard client component

**Files:**
- Create: `packages/crm/src/app/(dashboard)/clients/workspace-card.tsx`

Cards don't have business logic worth unit-testing in isolation — they render props. We snapshot them via the design-critique pass in Task 22.

- [ ] **Step 1: Implement WorkspaceCard**

Create `packages/crm/src/app/(dashboard)/clients/workspace-card.tsx`:

```tsx
"use client";

import Link from "next/link";
import type { WorkspaceSummary, WorkspaceStatus } from "@/lib/workspaces/summarize";
import { CLIENTS_COPY } from "./copy";

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "No activity yet";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

function statusBadgeClass(status: WorkspaceStatus): string {
  switch (status) {
    case "active":
      return "border-positive/30 bg-positive/10 text-positive";
    case "setup":
      return "border-caution/30 bg-caution/10 text-caution";
    case "paused":
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

type WorkspaceCardProps = {
  workspace: WorkspaceSummary;
};

export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  return (
    <article className="flex flex-col rounded-2xl border border-border/80 bg-background/35 p-5 shadow-(--shadow-xs)">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground">{workspace.name}</h2>
          <a
            href={workspace.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs text-muted-foreground hover:text-foreground"
          >
            {workspace.publicUrl.replace(/^https?:\/\//, "")}
          </a>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusBadgeClass(workspace.status)}`}
        >
          {CLIENTS_COPY.cardStatus[workspace.status]}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-border/70 bg-card/70 p-3">
          <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Contacts</dt>
          <dd className="mt-1 text-base font-semibold text-foreground">{CLIENTS_COPY.formatContactCount(workspace.contactCount)}</dd>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/70 p-3">
          <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Activity</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{formatRelativeTime(workspace.lastActivityAt)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-muted-foreground">{CLIENTS_COPY.formatLeadsThisWeek(workspace.newLeadsThisWeek)}</p>

      <div className="mt-auto pt-4">
        <Link href={workspace.dashboardUrl} className="crm-button-secondary inline-flex h-9 items-center px-4 text-sm">
          {CLIENTS_COPY.cardCta}
        </Link>
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/crm/src/app/(dashboard)/clients/workspace-card.tsx
git commit -m "feat(clients): add WorkspaceCard client component"
```

---

### Task 17: ClientsGrid client component (wires UpgradeModal trigger)

**Files:**
- Create: `packages/crm/src/app/(dashboard)/clients/clients-grid.tsx`

ClientsGrid owns the modal trigger. When the user clicks "Create Client Workspace" and `used >= limit`, it opens `<UpgradeModal>`. Otherwise it navigates to `/clients/new` (Cut A's URL-paste page).

Cut A delivered the UpgradeModal at `packages/crm/src/components/billing/upgrade-modal.tsx` with this prop contract (verify against the Cut A plan, but this is the contract assumed here):

```ts
type UpgradeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTier: "free" | "growth" | "scale";
  usage: { used: number; limit: number };
};
```

- [ ] **Step 1: Implement ClientsGrid**

Create `packages/crm/src/app/(dashboard)/clients/clients-grid.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceSummary } from "@/lib/workspaces/summarize";
import { UpgradeModal } from "@/components/billing/upgrade-modal";
import { WorkspaceCard } from "./workspace-card";
import { CLIENTS_COPY } from "./copy";

type ClientsGridProps = {
  workspaces: WorkspaceSummary[];
  tier: "free" | "growth" | "scale";
  used: number;
  limit: number;
};

function usageLabel(used: number, limit: number, tier: ClientsGridProps["tier"]): string {
  if (tier === "scale" || !Number.isFinite(limit)) {
    return CLIENTS_COPY.usageBadge.unlimited;
  }
  if (used >= limit) {
    return CLIENTS_COPY.usageBadge.atLimit;
  }
  return CLIENTS_COPY.usageBadge.underLimit(used, limit);
}

export function ClientsGrid({ workspaces, tier, used, limit }: ClientsGridProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const atLimit = tier !== "scale" && used >= limit;

  function handleCreateClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (atLimit) {
      setModalOpen(true);
    } else {
      router.push("/clients/new");
    }
  }

  return (
    <>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">{CLIENTS_COPY.pageHeading}</h1>
          <p className="text-sm text-muted-foreground">{CLIENTS_COPY.pageSubheading}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${atLimit ? "border-caution/40 bg-caution/10 text-caution" : "border-border bg-muted/40 text-muted-foreground"}`}
            title={atLimit ? CLIENTS_COPY.atLimitTooltip : undefined}
          >
            {usageLabel(used, limit, tier)}
          </span>
          <button type="button" onClick={handleCreateClick} className="crm-button-primary h-9 px-4 text-sm">
            {CLIENTS_COPY.primaryCta}
          </button>
        </div>
      </header>

      {workspaces.length === 0 ? (
        <section className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-border/80 bg-background/40 p-12 text-center">
          <div className="text-4xl" aria-hidden="true">📁</div>
          <h2 className="text-xl font-semibold">{CLIENTS_COPY.emptyState.heading}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{CLIENTS_COPY.emptyState.body}</p>
          <Link href="/clients/new" className="crm-button-primary h-10 px-5 text-sm">
            {CLIENTS_COPY.emptyState.cta}
          </Link>
        </section>
      ) : (
        <section className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {workspaces.map((workspace) => (
            <WorkspaceCard key={workspace.id} workspace={workspace} />
          ))}
        </section>
      )}

      <UpgradeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        currentTier={tier}
        usage={{ used, limit }}
      />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/crm/src/app/(dashboard)/clients/clients-grid.tsx
git commit -m "feat(clients): add ClientsGrid with header, empty state, and UpgradeModal trigger"
```

---

### Task 18: /clients server component page

**Files:**
- Create: `packages/crm/src/app/(dashboard)/clients/page.tsx`

- [ ] **Step 1: Implement the server component**

Create `packages/crm/src/app/(dashboard)/clients/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getWorkspaceLimitStatusForUser, listManagedOrganizationsForUser } from "@/lib/billing/orgs";
import { rollupWorkspace } from "@/lib/workspaces/rollup";
import { summarizeWorkspace, type WorkspaceSummary } from "@/lib/workspaces/summarize";
import { ClientsGrid } from "./clients-grid";

/*
 * Design-system audit (from design:design-system invocation 2026-05-16):
 * - Header: heading + usage badge pill (custom span using Badge variant tokens)
 * - Empty state: native section wrapping emoji-as-illustration + heading + Link
 * - Card grid: native CSS grid; each item is the WorkspaceCard component
 * - CTA button: native button styled via existing crm-button-primary class
 */

function asAgencyTier(value: string | null | undefined): "free" | "growth" | "scale" {
  if (value === "growth" || value === "scale") return value;
  return "free";
}

export default async function ClientsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;

  const [orgs, limitStatus] = await Promise.all([
    listManagedOrganizationsForUser(userId),
    getWorkspaceLimitStatusForUser(userId),
  ]);

  const workspaceBaseDomain = process.env.WORKSPACE_BASE_DOMAIN?.trim() || "seldonframe.app";
  const now = new Date();

  const rollups = await Promise.all(orgs.map((org) => rollupWorkspace(org.id)));
  const rollupById = new Map(rollups.map((r) => [r.orgId, r]));

  const workspaces: WorkspaceSummary[] = orgs.map((org) => {
    const rollup = rollupById.get(org.id);
    return summarizeWorkspace({
      id: org.id,
      slug: org.slug,
      name: org.name,
      soulCompletedAt: rollup?.soulCompletedAt ?? null,
      contactCount: org.contactCount,
      lastActivityAt: rollup?.lastActivityAt ?? null,
      newLeadsThisWeek: rollup?.newLeadsThisWeek ?? 0,
      workspaceBaseDomain,
      now,
    });
  });

  const tier = asAgencyTier(limitStatus.tier);

  return (
    <main className="animate-page-enter flex-1 overflow-auto w-full space-y-6 p-3 sm:p-4 md:p-6">
      <ClientsGrid
        workspaces={workspaces}
        tier={tier}
        used={orgs.length}
        limit={Number.isFinite(limitStatus.maxOrgs) ? limitStatus.maxOrgs : Number.POSITIVE_INFINITY}
      />
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/crm/src/app/(dashboard)/clients/page.tsx
git commit -m "feat(clients): add /clients server component page"
```

---

### Task 19: Smoke /clients in dev server

- [ ] **Step 1: Start dev server**

```bash
cd packages/crm
pnpm dev
```

- [ ] **Step 2: Visit `http://localhost:3000/clients` in a browser**

Expected: redirect to `/login` (no session). After signing in with a seed user, the page renders.

If the page errors, check the terminal output for the offending import — most likely the UpgradeModal import path if Cut A used a different name. Open `packages/crm/src/components/billing/upgrade-modal.tsx`, confirm the exported name and prop shape, and adjust Task 17 accordingly.

- [ ] **Step 3: Stop dev server** (Ctrl+C).

---

### Task 20: design:design-critique — first pass on /clients

This is a post-implementation review. Output is a set of inline edits to commit.

- [ ] **Step 1: Take a screenshot of /clients in three states**

After signing in:
1. Empty state (no workspaces) — sign in as a fresh user, capture the page.
2. Populated state (1-3 workspaces) — seed a workspace via `/clients/new` (Cut A flow) and capture.
3. At-limit state (used >= limit on Free) — create a second workspace; capture the modal trigger.

If seeding from scratch is too slow, use the existing dev fixtures via `pnpm db:seed`.

- [ ] **Step 2: Invoke design:design-critique skill**

Feed it the three screenshots + the link to `packages/crm/src/app/(dashboard)/clients/page.tsx`. Prompt:

> Cut B's /clients page is the agency's daily landing surface — they manage every client workspace here. Critique the three states (empty, populated 1-3 cards, at-limit) for: (1) visual hierarchy — does the eye go from heading → usage badge → CTA → grid in that order? (2) card density — are stats readable without being cramped? (3) empty-state warmth — does it feel inviting or sterile? (4) at-limit visual — does the badge color shift signal "you've hit a wall" without being alarming?

- [ ] **Step 3: Apply any concrete fixes**

Edit `clients-grid.tsx`, `workspace-card.tsx`, or `copy.ts` per the critique. Common fixes:
- Tighter card padding or larger heading
- Stronger contrast on the at-limit badge
- More warmth in the empty-state body copy

- [ ] **Step 4: Commit the polish**

```bash
git add packages/crm/src/app/(dashboard)/clients/
git commit -m "design(clients): apply design:design-critique pass — hierarchy + warmth + at-limit signal"
```

(If the critique surfaces no concrete fixes, skip the commit. Note this in the task checkbox comment.)

---

### Task 21: design:accessibility-review — WCAG 2.1 AA on /clients

- [ ] **Step 1: Invoke design:accessibility-review skill**

Feed it `packages/crm/src/app/(dashboard)/clients/page.tsx`, `clients-grid.tsx`, and `workspace-card.tsx`. Prompt:

> Audit Cut B's /clients page for WCAG 2.1 AA compliance. Specifically check: (1) keyboard navigation through the header CTA → cards → modal trigger — every focusable element must show a visible focus ring; (2) screen reader — usage badge state changes (under-limit vs at-limit) must be announced; the card status badge color must not be the only signal; (3) color contrast — at-limit badge tokens (border-caution/40 / text-caution / bg-caution/10) on background; verify ≥ 4.5:1 for body text; (4) UpgradeModal — when opened, focus must trap inside the modal and ESC must close it; (5) all `<a>` and `<button>` elements have a discernible accessible name.

- [ ] **Step 2: Apply fixes**

Likely fixes:
- Add `aria-label` to the usage badge with the full sentence ("1 of 3 client workspaces used")
- Add visible focus rings via Tailwind `focus-visible:outline-none focus-visible:ring-2`
- Wrap the status badge in a screen-reader-only sentence: `<span className="sr-only">Status: {label}</span>`
- Verify UpgradeModal focus trap is handled by Cut A's component; if not, file an issue against Cut A

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/(dashboard)/clients/
git commit -m "a11y(clients): apply design:accessibility-review fixes — focus rings + ARIA labels + sr-only status"
```

(If the review surfaces no concrete fixes, skip the commit.)

---

### Task 22: Typecheck + smoke once more after design passes

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: 0 new errors.

- [ ] **Step 2: Smoke /clients again** in the dev server to confirm the design + a11y commits didn't regress rendering.

Stop the dev server when done.

---

### Task 23: Add /clients to dashboard sidebar nav

**Files:**
- Modify: `packages/crm/src/components/layout/sidebar.tsx` (the nav source; verify exact filename in the worktree before editing)

The /clients page exists, but nothing links to it from the dashboard nav. Add an entry.

- [ ] **Step 1: Open the sidebar component**

Search for the existing nav array. Look for a `Dashboard` or `Contacts` entry — your new entry goes next to them.

- [ ] **Step 2: Add the "Clients" entry**

Add (above or below Contacts, depending on the existing alphabetical order):

```tsx
{ label: "Clients", href: "/clients", icon: <Users className="size-4" /> },
```

If the nav array uses a different shape (e.g., grouped), follow the existing pattern. Use the `Users` icon from `lucide-react` (already imported in this file).

- [ ] **Step 3: Smoke that the link renders + navigates**

`pnpm dev`, sign in, click "Clients" in the sidebar. Confirm `/clients` loads.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/components/layout/sidebar.tsx
git commit -m "feat(nav): add Clients entry to dashboard sidebar"
```

---

## Phase 4 — Wire UpgradeModal CTA on dashboard (Tasks 24-26)

Cut A added the dashboard "Create Client Workspace" button and usage badge. Cut B's only diff: when the button is clicked while at-limit, open `<UpgradeModal>` instead of (or in addition to) the existing behavior. Inspect the Cut A diff before editing; the wiring may already be there. If so, this phase shortens to one verification step.

### Task 24: Inspect Cut A's dashboard CTA wiring

- [ ] **Step 1: Read the relevant section of the dashboard page**

Open `packages/crm/src/app/(dashboard)/dashboard/page.tsx`. Find the "Create Client Workspace" button Cut A added. Look at the onClick handler.

- [ ] **Step 2: Decision tree:**
- If Cut A's button already opens `<UpgradeModal>` when at-limit → skip Tasks 25 and 26; mark this phase done.
- If Cut A's button always navigates to `/clients/new` (no gating) → proceed to Task 25.
- If Cut A's button has its own custom modal logic that doesn't use `<UpgradeModal>` → proceed to Task 25 to swap it for the shared component.

---

### Task 25: Wrap the dashboard CTA in the gating handler

**Files:**
- Modify: `packages/crm/src/app/(dashboard)/dashboard/page.tsx` (or its client subcomponent — likely Cut A extracted a `<DashboardCreateWorkspaceButton>` client component)

The dashboard is a server component, so the click handler must live in a client component. Cut A almost certainly extracted one. Find it (search for the button label or the import of `UpgradeModal`).

- [ ] **Step 1: Identify the client component file**

Search the worktree for `"Create Client Workspace"` to locate the button. The file is the one we modify here.

- [ ] **Step 2: Update the click handler to match ClientsGrid's pattern**

If Cut A's button currently looks like:

```tsx
<Link href="/clients/new" className="crm-button-primary ...">
  Create Client Workspace
</Link>
```

Replace with the same `handleCreateClick` pattern from Task 17:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UpgradeModal } from "@/components/billing/upgrade-modal";

type Props = {
  tier: "free" | "growth" | "scale";
  used: number;
  limit: number;
};

export function DashboardCreateWorkspaceButton({ tier, used, limit }: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const atLimit = tier !== "scale" && used >= limit;

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (atLimit) {
      setModalOpen(true);
    } else {
      router.push("/clients/new");
    }
  }

  return (
    <>
      <button type="button" onClick={handleClick} className="crm-button-primary h-9 px-4 text-sm">
        Create Client Workspace
      </button>
      <UpgradeModal open={modalOpen} onOpenChange={setModalOpen} currentTier={tier} usage={{ used, limit }} />
    </>
  );
}
```

Pass the props from the dashboard server component (which already has the workspace count + tier from Cut A's `getWorkspaceLimitStatus()` call):

```tsx
<DashboardCreateWorkspaceButton
  tier={asAgencyTier(limitStatus.tier)}
  used={limitStatus.currentOrgs}
  limit={Number.isFinite(limitStatus.maxOrgs) ? limitStatus.maxOrgs : Number.POSITIVE_INFINITY}
/>
```

Reuse the same `asAgencyTier` helper from Task 18 (extract it into a shared util if it lives in two places — `packages/crm/src/lib/billing/tier.ts` is a reasonable home).

- [ ] **Step 3: Smoke**

`pnpm dev`, sign in, click the dashboard CTA. Under limit → navigates to `/clients/new`. At limit → opens modal.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/app/(dashboard)/dashboard/
git commit -m "feat(dashboard): wire UpgradeModal into Create Client Workspace CTA"
```

---

### Task 26: Verify the dashboard usage badge tier matches /clients

- [ ] **Step 1: Sign in as a user on Free with 1 workspace**

Visit `/dashboard`. Confirm the usage badge shows "1/1 workspaces" (or whichever copy Cut A chose).

Visit `/clients`. Confirm the usage badge shows the same text (the Task 15 copy module — `1/1 workspaces`).

If the two surfaces show different copy, both should resolve to the same source. Decide: either dashboard adopts `CLIENTS_COPY.usageBadge` from Task 15, or both adopt a shared `BILLING_COPY` module. Pick one path and align. The spec doesn't mandate which; consistency is what matters.

If aligned already, no commit needed.

- [ ] **Step 2: Commit any alignment fix**

```bash
git add packages/crm/src/
git commit -m "feat(billing): align dashboard + /clients usage-badge copy"
```

---

## Phase 5 — Stripe checkout wire-up on UpgradeModal (Tasks 27-31)

Cut A built the UpgradeModal UI shell. Cut B wires the two upgrade buttons to POST `/api/stripe/checkout` with the right priceId.

### Task 27: Inspect Cut A's UpgradeModal button handlers

- [ ] **Step 1: Open `packages/crm/src/components/billing/upgrade-modal.tsx`**

Look for the two buttons "Upgrade to Growth" and "Upgrade to Scale". Note what their `onClick` currently does — Cut A may have left them as `console.log` stubs or attached a placeholder fetch.

- [ ] **Step 2: Confirm the prop contract matches Task 17's assumption**

If Cut A's `UpgradeModalProps` shape differs from what Tasks 17 and 25 assumed (`{ open, onOpenChange, currentTier, usage }`), update those usages — Cut A's shape is the source of truth.

---

### Task 28: TDD — checkout helper

**Files:**
- Create: `packages/crm/src/lib/billing/start-checkout.ts`
- Test: `packages/crm/tests/unit/billing/start-checkout.spec.ts`

Encapsulate the fetch into a single function the modal calls. Easier to test than inline modal code.

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/billing/start-checkout.spec.ts`:

```typescript
import { describe, test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

describe("startCheckout", () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  test("POSTs to /api/stripe/checkout with priceId + successPath + cancelPath", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ url: "https://stripe.checkout/session-abc" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const { startCheckout } = await import("../../../src/lib/billing/start-checkout");
    const result = await startCheckout({
      priceId: "price_growth_29",
      tier: "growth",
      fetchImpl: fakeFetch,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "/api/stripe/checkout");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(String(calls[0]!.init.body));
    assert.equal(body.priceId, "price_growth_29");
    assert.equal(body.successPath, "/dashboard?upgraded=growth");
    assert.equal(body.cancelPath, "/clients");
    assert.equal(result.url, "https://stripe.checkout/session-abc");
  });

  test("passes tier through to successPath query string", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ url: "https://stripe.checkout/session-xyz" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const { startCheckout } = await import("../../../src/lib/billing/start-checkout");
    await startCheckout({ priceId: "price_scale_99", tier: "scale", fetchImpl: fakeFetch });

    const body = JSON.parse(String(calls[0]!.init.body));
    assert.equal(body.successPath, "/dashboard?upgraded=scale");
  });

  test("throws when the API responds non-2xx", async () => {
    const fakeFetch = async () =>
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    const { startCheckout } = await import("../../../src/lib/billing/start-checkout");

    await assert.rejects(
      () => startCheckout({ priceId: "price_growth_29", tier: "growth", fetchImpl: fakeFetch }),
      /Unauthorized|checkout failed/i
    );
  });

  test("throws when the API responds without a url", async () => {
    const fakeFetch = async () =>
      new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    const { startCheckout } = await import("../../../src/lib/billing/start-checkout");

    await assert.rejects(() => startCheckout({ priceId: "price_growth_29", tier: "growth", fetchImpl: fakeFetch }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/billing/start-checkout.spec.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement startCheckout**

Create `packages/crm/src/lib/billing/start-checkout.ts`:

```typescript
// Browser-side helper used by UpgradeModal. POSTs to the existing
// /api/stripe/checkout route with the Cut B Growth/Scale price IDs.
// Returns the Stripe checkout URL the caller redirects to (window.location.href = url).

type AgencyTier = "growth" | "scale";

export type StartCheckoutInput = {
  priceId: string;
  tier: AgencyTier;
  fetchImpl?: typeof fetch;
};

export type StartCheckoutResult = {
  url: string;
};

export async function startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult> {
  const fetchFn = input.fetchImpl ?? fetch;
  const response = await fetchFn("/api/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      priceId: input.priceId,
      successPath: `/dashboard?upgraded=${input.tier}`,
      cancelPath: "/clients",
    }),
  });

  const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `checkout failed: ${response.status}`);
  }

  if (!payload?.url) {
    throw new Error("checkout response missing url");
  }

  return { url: payload.url };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crm && node --import tsx --test tests/unit/billing/start-checkout.spec.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/billing/start-checkout.ts packages/crm/tests/unit/billing/start-checkout.spec.ts
git commit -m "feat(billing): add startCheckout helper for UpgradeModal Stripe wire-up"
```

---

### Task 29: Wire UpgradeModal buttons to startCheckout

**Files:**
- Modify: `packages/crm/src/components/billing/upgrade-modal.tsx` (Cut A artifact)

- [ ] **Step 1: Add the two button handlers**

In the file, find the two buttons. Wrap each in an async click handler that calls `startCheckout`:

```tsx
import { useState } from "react";
import { startCheckout } from "@/lib/billing/start-checkout";
import { GROWTH_MONTHLY_PRICE_ID, SCALE_MONTHLY_PRICE_ID } from "@/lib/billing/price-ids";

// ...inside the component:
const [busyTier, setBusyTier] = useState<"growth" | "scale" | null>(null);
const [error, setError] = useState<string | null>(null);

async function handleUpgrade(tier: "growth" | "scale") {
  setBusyTier(tier);
  setError(null);
  try {
    const { url } = await startCheckout({
      priceId: tier === "growth" ? GROWTH_MONTHLY_PRICE_ID : SCALE_MONTHLY_PRICE_ID,
      tier,
    });
    window.location.href = url;
  } catch (err) {
    setError(err instanceof Error ? err.message : "Checkout could not start. Try again.");
    setBusyTier(null);
  }
}

// ... on the Growth button:
<button
  type="button"
  onClick={() => handleUpgrade("growth")}
  disabled={busyTier !== null}
  className="crm-button-primary h-10 w-full px-4 text-sm"
>
  {busyTier === "growth" ? "Redirecting..." : "Upgrade to Growth"}
</button>

// ... on the Scale button:
<button
  type="button"
  onClick={() => handleUpgrade("scale")}
  disabled={busyTier !== null}
  className="crm-button-primary h-10 w-full px-4 text-sm"
>
  {busyTier === "scale" ? "Redirecting..." : "Upgrade to Scale"}
</button>

// ... below the buttons, render the error:
{error ? (
  <p role="alert" className="mt-3 rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
    {error}
  </p>
) : null}
```

- [ ] **Step 2: Smoke**

`pnpm dev`, sign in, trigger the modal (visit /clients while at-limit, or click the dashboard CTA at-limit). Click "Upgrade to Growth". Expected: redirect to Stripe Checkout (or, in dev without STRIPE_SECRET_KEY, an inline error from the API). Either way, the network tab shows the POST to `/api/stripe/checkout` with the Growth priceId.

If Stripe isn't configured locally, the spec's expected behavior is: the API returns `{ error: "Stripe is not configured. Set STRIPE_SECRET_KEY..." }` and the modal shows that text. Confirm that path works.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/components/billing/upgrade-modal.tsx
git commit -m "feat(billing): wire UpgradeModal buttons to Stripe checkout flow"
```

---

### Task 30: Stripe webhook handles the new price IDs

**Files:**
- Modify: `packages/crm/src/app/api/stripe/webhook/route.ts` (read to understand; modify only if needed)

The spec asserts: "the existing Stripe webhook at /api/stripe/webhook updates org.subscription.tier atomically". Verify the webhook actually understands the new Growth/Scale price IDs and writes `tier: "growth"` or `tier: "scale"` to the subscription JSONB.

- [ ] **Step 1: Open the webhook route**

Open `packages/crm/src/app/api/stripe/webhook/route.ts`. Search for `priceId` or `WORKSPACE_ADDON_MONTHLY_PRICE_ID` handling.

- [ ] **Step 2: Decide**

- If the webhook already detects price IDs via `getPlanByStripePriceId()` or similar mapping → confirm the mapping includes the new IDs. If not, add them. Likely path: add `growthMonthly` + `scaleMonthly` entries to `PLANS` in `packages/crm/src/lib/billing/plans.ts` OR add a direct check in the webhook that maps `priceId === GROWTH_MONTHLY_PRICE_ID → tier: "growth"`.
- If the webhook handles workspace add-on quantity but not tier upgrades → add a branch that detects `priceId === GROWTH_MONTHLY_PRICE_ID || SCALE_MONTHLY_PRICE_ID` and calls `updateOrgSubscription(orgId, { tier: "growth" | "scale", maxWorkspaces: tier === "growth" ? 3 : Number.POSITIVE_INFINITY })`.

This is a conditional modification — the implementer reads the actual webhook code (~150-300 lines typically) and decides the cleanest patch.

- [ ] **Step 3: Add a unit test if you modified the webhook**

If you added webhook logic, write `packages/crm/tests/unit/billing/webhook-agency-tier.spec.ts`:

```typescript
import { describe, test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

import * as subscriptionModule from "../../../src/lib/billing/subscription";
import { GROWTH_MONTHLY_PRICE_ID, SCALE_MONTHLY_PRICE_ID } from "../../../src/lib/billing/price-ids";

describe("Stripe webhook — agency tier upgrade", () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  test("Growth checkout completion writes tier: 'growth' to org.subscription", async () => {
    const writes: Array<{ orgId: string; updates: Record<string, unknown> }> = [];
    mock.method(subscriptionModule, "updateOrgSubscription", async (orgId: string, updates: Record<string, unknown>) => {
      writes.push({ orgId, updates });
    });

    // Import + invoke the handler with a fake checkout.session.completed event.
    // The exact handler invocation depends on the webhook structure — adapt
    // to call whatever pure function the route extracts.
    const { handleStripeEvent } = await import("../../../src/app/api/stripe/webhook/route");
    await handleStripeEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { orgId: "org-1", userId: "user-1", priceId: GROWTH_MONTHLY_PRICE_ID, type: "agency_tier" },
          subscription: "sub_growth_123",
        },
      },
    } as unknown as Parameters<typeof handleStripeEvent>[0]);

    assert.equal(writes.length, 1);
    assert.equal(writes[0]!.orgId, "org-1");
    assert.equal(writes[0]!.updates.tier, "growth");
  });

  test("Scale checkout writes tier: 'scale'", async () => {
    const writes: Array<{ orgId: string; updates: Record<string, unknown> }> = [];
    mock.method(subscriptionModule, "updateOrgSubscription", async (orgId: string, updates: Record<string, unknown>) => {
      writes.push({ orgId, updates });
    });

    const { handleStripeEvent } = await import("../../../src/app/api/stripe/webhook/route");
    await handleStripeEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { orgId: "org-2", userId: "user-2", priceId: SCALE_MONTHLY_PRICE_ID, type: "agency_tier" },
          subscription: "sub_scale_456",
        },
      },
    } as unknown as Parameters<typeof handleStripeEvent>[0]);

    assert.equal(writes.length, 1);
    assert.equal(writes[0]!.updates.tier, "scale");
  });
});
```

Note: this test assumes the webhook exports a pure `handleStripeEvent(event)` function. If it doesn't (e.g., the handler is a closure inside the POST), refactor to extract a pure helper first — that's part of the same task. The point of the refactor: TDD-able webhook logic.

- [ ] **Step 4: Run and commit**

Run: `cd packages/crm && node --import tsx --test tests/unit/billing/webhook-agency-tier.spec.ts` (or skip if no test was added because the webhook already handled it).

If you modified anything:

```bash
git add packages/crm/src/app/api/stripe/webhook/ packages/crm/tests/unit/billing/webhook-agency-tier.spec.ts
git commit -m "feat(billing): Stripe webhook writes tier: 'growth' | 'scale' on agency upgrade"
```

If the webhook was already correct, skip the commit and note in the task checkbox.

---

### Task 31: Wire the /api/stripe/checkout route to surface agency-tier metadata

**Files:**
- Modify: `packages/crm/src/app/api/stripe/checkout/route.ts`

The existing route stamps `type: "workspace_addon"` or `"self_service_workspace"`. For the new Growth/Scale price IDs, the type should be `"agency_tier"` so the webhook (Task 30) can branch on it. Already covered if `isAgencyTierCheckoutPriceId()` is consulted.

- [ ] **Step 1: Update checkoutType derivation**

In `packages/crm/src/app/api/stripe/checkout/route.ts`, find:

```typescript
const checkoutType = isSelfServiceCheckoutPriceId(resolvedPriceId) ? "self_service_workspace" : "workspace_addon";
```

Replace with:

```typescript
import { isAgencyTierCheckoutPriceId, isSelfServiceCheckoutPriceId } from "@/lib/billing/price-ids";

const agencyTier = isAgencyTierCheckoutPriceId(resolvedPriceId);
const checkoutType = agencyTier
  ? "agency_tier"
  : isSelfServiceCheckoutPriceId(resolvedPriceId)
    ? "self_service_workspace"
    : "workspace_addon";
```

The metadata blocks (lines 146-163 of the original) already carry `type: checkoutType`, so the webhook will receive it.

- [ ] **Step 2: Add a test for the type stamping**

Append to `packages/crm/tests/unit/billing/stripe-checkout-gated.spec.ts`:

```typescript
import { isAgencyTierCheckoutPriceId } from "../../../src/lib/billing/price-ids";

describe("isAgencyTierCheckoutPriceId", () => {
  test("identifies Growth as 'growth'", () => {
    assert.equal(isAgencyTierCheckoutPriceId(GROWTH_MONTHLY_PRICE_ID), "growth");
  });

  test("identifies Scale as 'scale'", () => {
    assert.equal(isAgencyTierCheckoutPriceId(SCALE_MONTHLY_PRICE_ID), "scale");
  });

  test("returns null for the legacy add-on price ID", () => {
    assert.equal(isAgencyTierCheckoutPriceId(WORKSPACE_ADDON_MONTHLY_PRICE_ID), null);
  });

  test("returns null for null / undefined", () => {
    assert.equal(isAgencyTierCheckoutPriceId(null), null);
    assert.equal(isAgencyTierCheckoutPriceId(undefined), null);
  });
});
```

- [ ] **Step 3: Run and commit**

Run: `cd packages/crm && node --import tsx --test tests/unit/billing/stripe-checkout-gated.spec.ts`
Expected: PASS (now 10 tests).

```bash
git add packages/crm/src/app/api/stripe/checkout/route.ts packages/crm/tests/unit/billing/stripe-checkout-gated.spec.ts
git commit -m "feat(billing): stamp checkout type='agency_tier' for Growth/Scale price IDs"
```

---

## Phase 6 — /settings/agency-profile page (Tasks 32-38)

### Task 32: design:design-system — audit settings form pattern

- [ ] **Step 1: Invoke design:design-system skill**

Feed it `packages/crm/src/app/(dashboard)/settings/branding/page.tsx` (Cut B's reference for settings page styling — 93 lines, full read in Pre-flight) and the spec excerpt for agency-profile (lines 304-319). Prompt:

> Cut B adds /settings/agency-profile — a form for editing the user's agency_profile JSONB (name, logo upload, brand color, website URL). Reference the existing /settings/branding page for layout consistency. For each field (text input, image upload, color picker with hex fallback, URL input), name the existing primitive and the visual treatment. Flag whether the color picker needs a custom component or if a native `<input type="color">` paired with a hex `<input type="text">` is sufficient (per spec: color picker NEEDS hex-input fallback for screen readers).

- [ ] **Step 2: Note the verdict inline as a comment in Task 34's page**

---

### Task 33: design:ux-copy — agency-profile form copy

- [ ] **Step 1: Invoke design:ux-copy skill**

Prompt:

> Write field labels, help text, and the save button label for /settings/agency-profile. Fields: (1) Agency name — required text input; (2) Agency logo — image upload; (3) Brand color — color picker + hex; (4) Agency website URL — optional URL input. Tone: confident, agency-focused. Each label ≤ 30 chars, each help text ≤ 80 chars.

- [ ] **Step 2: Capture the strings in a constants module**

Create `packages/crm/src/app/(dashboard)/settings/agency-profile/copy.ts`:

```typescript
// Polished copy strings for /settings/agency-profile.
// Source: design:ux-copy invocation 2026-05-16 (Cut B).

export const AGENCY_PROFILE_COPY = {
  pageHeading: "Agency Profile",
  pageSubheading: "How your agency shows up on client-facing screens.",
  fields: {
    name: {
      label: "Agency name",
      help: "Shown on client portals and reports.",
      placeholder: "Acme Digital",
    },
    logo: {
      label: "Agency logo",
      help: "PNG or SVG. Square crops best.",
    },
    brandColor: {
      label: "Brand color",
      help: "Used as the accent on white-labeled surfaces.",
    },
    websiteUrl: {
      label: "Agency website",
      help: "Optional. Linked from your client portal footer.",
      placeholder: "https://acmedigital.com",
    },
  },
  saveButton: "Save profile",
  savedToast: "Agency profile saved.",
} as const;
```

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/(dashboard)/settings/agency-profile/copy.ts
git commit -m "design(agency-profile): commit refined UX copy"
```

---

### Task 34: TDD — saveAgencyProfileAction

**Files:**
- Create: `packages/crm/src/lib/agency-profile/actions.ts`
- Test: `packages/crm/tests/unit/agency-profile/save.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/agency-profile/save.spec.ts`:

```typescript
import { describe, test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

import * as authModule from "../../../src/auth";
import * as dbModule from "../../../src/db";

describe("saveAgencyProfileAction — validation", () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  test("rejects empty agency name", async () => {
    mock.method(authModule, "auth", async () => ({ user: { id: "user-1" } }));
    const { saveAgencyProfile } = await import("../../../src/lib/agency-profile/actions");

    const formData = new FormData();
    formData.set("name", "");
    formData.set("brandColor", "#7c3aed");
    formData.set("websiteUrl", "");

    const result = await saveAgencyProfile(formData);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /name/i);
  });

  test("rejects invalid hex color", async () => {
    mock.method(authModule, "auth", async () => ({ user: { id: "user-1" } }));
    const { saveAgencyProfile } = await import("../../../src/lib/agency-profile/actions");

    const formData = new FormData();
    formData.set("name", "Acme Digital");
    formData.set("brandColor", "purple");
    formData.set("websiteUrl", "");

    const result = await saveAgencyProfile(formData);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /color/i);
  });

  test("rejects malformed website URL", async () => {
    mock.method(authModule, "auth", async () => ({ user: { id: "user-1" } }));
    const { saveAgencyProfile } = await import("../../../src/lib/agency-profile/actions");

    const formData = new FormData();
    formData.set("name", "Acme Digital");
    formData.set("brandColor", "#7c3aed");
    formData.set("websiteUrl", "not-a-url");

    const result = await saveAgencyProfile(formData);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /url/i);
  });

  test("accepts empty website URL (optional field)", async () => {
    mock.method(authModule, "auth", async () => ({ user: { id: "user-1" } }));
    const updates: Array<{ id: string; profile: Record<string, unknown> }> = [];
    mock.method(dbModule, "db", {
      update: () => ({
        set: (values: { agencyProfile: Record<string, unknown> }) => ({
          where: () => {
            updates.push({ id: "user-1", profile: values.agencyProfile });
            return Promise.resolve();
          },
        }),
      }),
    } as unknown as typeof dbModule.db);

    const { saveAgencyProfile } = await import("../../../src/lib/agency-profile/actions");

    const formData = new FormData();
    formData.set("name", "Acme Digital");
    formData.set("brandColor", "#7c3aed");
    formData.set("websiteUrl", "");
    formData.set("logoUrl", "");

    const result = await saveAgencyProfile(formData);
    assert.equal(result.ok, true);
    assert.equal(updates.length, 1);
    assert.equal(updates[0]!.profile.name, "Acme Digital");
    assert.equal(updates[0]!.profile.brand_color, "#7c3aed");
    assert.equal(updates[0]!.profile.website_url, undefined);
  });

  test("returns 401 when no session", async () => {
    mock.method(authModule, "auth", async () => null);
    const { saveAgencyProfile } = await import("../../../src/lib/agency-profile/actions");

    const formData = new FormData();
    formData.set("name", "Acme");
    formData.set("brandColor", "#7c3aed");

    const result = await saveAgencyProfile(formData);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /unauthorized/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/agency-profile/save.spec.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement saveAgencyProfile + getAgencyProfile**

Create `packages/crm/src/lib/agency-profile/actions.ts`:

```typescript
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

export type AgencyProfile = {
  name?: string;
  logo_url?: string;
  brand_color?: string;
  website_url?: string;
};

export type SaveResult = { ok: true } | { ok: false; error: string };

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const URL_RE = /^https?:\/\/[a-z0-9.-]+(\.[a-z]{2,})/i;

export async function getAgencyProfile(): Promise<AgencyProfile | null> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) return null;

  const [row] = await db
    .select({ profile: users.agencyProfile })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return (row?.profile as AgencyProfile | null) ?? {};
}

export async function saveAgencyProfile(formData: FormData): Promise<SaveResult> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) {
    return { ok: false, error: "Unauthorized" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const brandColor = String(formData.get("brandColor") ?? "").trim();
  const websiteUrl = String(formData.get("websiteUrl") ?? "").trim();

  if (!name) {
    return { ok: false, error: "Agency name is required." };
  }

  if (brandColor && !HEX_RE.test(brandColor)) {
    return { ok: false, error: "Brand color must be a hex value like #7c3aed." };
  }

  if (websiteUrl && !URL_RE.test(websiteUrl)) {
    return { ok: false, error: "Website URL must start with http:// or https://" };
  }

  const profile: AgencyProfile = {
    name,
    ...(logoUrl ? { logo_url: logoUrl } : {}),
    ...(brandColor ? { brand_color: brandColor } : {}),
    ...(websiteUrl ? { website_url: websiteUrl } : {}),
  };

  await db.update(users).set({ agencyProfile: profile }).where(eq(users.id, userId));

  revalidatePath("/settings/agency-profile");

  return { ok: true };
}

export async function saveAgencyProfileAction(formData: FormData) {
  const result = await saveAgencyProfile(formData);
  if (!result.ok) {
    throw new Error(result.error);
  }
}
```

Note: the schema column is added by Cut A's migration. `users.agencyProfile` must be exported from `packages/crm/src/db/schema/users.ts` after Cut A runs. If your worktree's `users.ts` doesn't have it, Cut A is not yet applied — pause and run Cut A first.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crm && node --import tsx --test tests/unit/agency-profile/save.spec.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/agency-profile/actions.ts packages/crm/tests/unit/agency-profile/save.spec.ts
git commit -m "feat(agency-profile): add getAgencyProfile + saveAgencyProfile server actions"
```

---

### Task 35: Agency-profile form component

**Files:**
- Create: `packages/crm/src/app/(dashboard)/settings/agency-profile/agency-profile-form.tsx`

- [ ] **Step 1: Implement the client form**

Create `packages/crm/src/app/(dashboard)/settings/agency-profile/agency-profile-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import type { AgencyProfile } from "@/lib/agency-profile/actions";
import { saveAgencyProfileAction } from "@/lib/agency-profile/actions";
import { AGENCY_PROFILE_COPY as C } from "./copy";

type Props = {
  initial: AgencyProfile;
};

export function AgencyProfileForm({ initial }: Props) {
  const [logoUrl, setLogoUrl] = useState(initial.logo_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  async function handleLogoSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/v1/web/uploads/user-image", { method: "POST", body: formData });
      const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !body?.url) {
        throw new Error(body?.error ?? "Upload failed.");
      }
      setLogoUrl(body.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(formData: FormData) {
    formData.set("logoUrl", logoUrl);
    startTransition(async () => {
      try {
        await saveAgencyProfileAction(formData);
        setSaved(true);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div className="space-y-1">
        <label htmlFor="name" className="text-label">
          {C.fields.name.label}
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={initial.name ?? ""}
          placeholder={C.fields.name.placeholder}
          className="crm-input h-10 w-full px-3"
        />
        <p className="text-xs text-muted-foreground">{C.fields.name.help}</p>
      </div>

      <div className="space-y-1">
        <label htmlFor="logo" className="text-label">
          {C.fields.logo.label}
        </label>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="Agency logo preview" className="size-12 rounded-lg border border-border bg-card object-contain" />
          ) : (
            <div className="size-12 rounded-lg border border-dashed border-border" aria-hidden="true" />
          )}
          <input id="logo" type="file" accept="image/png,image/svg+xml,image/jpeg" onChange={handleLogoSelect} disabled={uploading} />
        </div>
        <p className="text-xs text-muted-foreground">{C.fields.logo.help}</p>
        {uploading ? <p className="text-xs text-muted-foreground">Uploading...</p> : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="brandColor" className="text-label">
          {C.fields.brandColor.label}
        </label>
        <div className="flex items-center gap-3">
          <input
            id="brandColor"
            name="brandColor"
            type="color"
            defaultValue={initial.brand_color ?? "#7c3aed"}
            className="size-10 cursor-pointer rounded-md border border-border"
            aria-describedby="brandColorHex"
          />
          <input
            id="brandColorHex"
            type="text"
            defaultValue={initial.brand_color ?? "#7c3aed"}
            onInput={(event) => {
              const colorInput = document.getElementById("brandColor") as HTMLInputElement | null;
              const value = event.currentTarget.value;
              if (colorInput && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
                colorInput.value = value;
              }
            }}
            placeholder="#7c3aed"
            className="crm-input h-10 w-32 px-3 font-mono text-sm"
            aria-label="Brand color hex value"
          />
        </div>
        <p className="text-xs text-muted-foreground">{C.fields.brandColor.help}</p>
      </div>

      <div className="space-y-1">
        <label htmlFor="websiteUrl" className="text-label">
          {C.fields.websiteUrl.label}
        </label>
        <input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          defaultValue={initial.website_url ?? ""}
          placeholder={C.fields.websiteUrl.placeholder}
          className="crm-input h-10 w-full px-3"
        />
        <p className="text-xs text-muted-foreground">{C.fields.websiteUrl.help}</p>
      </div>

      {uploadError ? (
        <p role="alert" className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {uploadError}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="rounded-md border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
          {C.savedToast}
        </p>
      ) : null}

      <button type="submit" disabled={pending || uploading} className="crm-button-primary h-10 px-5 text-sm">
        {pending ? "Saving..." : C.saveButton}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/crm/src/app/(dashboard)/settings/agency-profile/agency-profile-form.tsx
git commit -m "feat(agency-profile): add AgencyProfileForm client component"
```

---

### Task 36: /settings/agency-profile server component page

**Files:**
- Create: `packages/crm/src/app/(dashboard)/settings/agency-profile/page.tsx`

- [ ] **Step 1: Implement the server component**

Create `packages/crm/src/app/(dashboard)/settings/agency-profile/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAgencyProfile } from "@/lib/agency-profile/actions";
import { AgencyProfileForm } from "./agency-profile-form";
import { AGENCY_PROFILE_COPY as C } from "./copy";

export default async function AgencyProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const profile = (await getAgencyProfile()) ?? {};

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">{C.pageHeading}</h1>
        <p className="text-sm text-muted-foreground">{C.pageSubheading}</p>
      </div>

      <article className="rounded-xl border bg-card p-5">
        <AgencyProfileForm initial={profile} />
      </article>
    </section>
  );
}
```

- [ ] **Step 2: Add the entry to the settings landing page**

Open `packages/crm/src/app/(dashboard)/settings/page.tsx`. It already lists every setting subroute. Add an "Agency Profile" link in the same shape as the existing entries (likely a `<Link>` inside a `<Card>` or list). Use the icon `Building2` from `lucide-react` (or whichever icon set the file imports).

Example shape (adapt to the file's actual structure):

```tsx
<Link href="/settings/agency-profile" className="...">
  <Building2 className="size-4" />
  <span>Agency profile</span>
  <p className="text-xs text-muted-foreground">How your agency shows up on client-facing screens.</p>
</Link>
```

- [ ] **Step 3: Smoke**

`pnpm dev`, sign in, visit `/settings/agency-profile`. Confirm the form renders with empty defaults. Fill in the name + a brand color, click Save. Confirm the saved toast appears. Refresh the page; the values persist.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/app/(dashboard)/settings/agency-profile/page.tsx packages/crm/src/app/(dashboard)/settings/page.tsx
git commit -m "feat(agency-profile): add /settings/agency-profile page + settings list entry"
```

---

### Task 37: design:design-critique — pass on /settings/agency-profile

- [ ] **Step 1: Screenshot the form (empty + filled)**

- [ ] **Step 2: Invoke design:design-critique skill**

Prompt:

> Cut B's /settings/agency-profile is the agency's identity setup form (name, logo, color, website). It's hit once during onboarding and rarely after. Critique: (1) field ordering — does it flow naturally? (2) the color picker treatment — does the picker + hex input pair feel polished or thrown together? (3) save button placement + state — is "Save profile" clearly the next action? (4) empty-vs-filled visual diff — does the logo placeholder look intentional?

- [ ] **Step 3: Apply fixes (likely small — spacing, label sizes, picker alignment)**

- [ ] **Step 4: Commit if any change**

```bash
git add packages/crm/src/app/(dashboard)/settings/agency-profile/
git commit -m "design(agency-profile): apply design:design-critique polish"
```

---

### Task 38: design:accessibility-review — /settings/agency-profile

- [ ] **Step 1: Invoke design:accessibility-review skill**

Feed it the page + form + copy files. Prompt:

> Audit /settings/agency-profile for WCAG 2.1 AA. Specifically: (1) the color picker — both `<input type="color">` AND the paired hex `<input type="text">` must be screen-reader-accessible; verify the hex input has a label and the color input is `aria-describedby` the hex; (2) logo upload — the file input must have an associated label; the preview image must have meaningful alt text; (3) all inputs have visible focus rings; (4) error and saved status messages use `role="alert"` and `role="status"` respectively; (5) the form is keyboard-submittable.

- [ ] **Step 2: Apply fixes**

The form code in Task 35 already includes most of these; the review may catch a missed `<label>` or a contrast issue. Fix inline.

- [ ] **Step 3: Commit if any change**

```bash
git add packages/crm/src/app/(dashboard)/settings/agency-profile/
git commit -m "a11y(agency-profile): apply design:accessibility-review fixes"
```

---

## Phase 7 — Logo upload primitive extension (Tasks 39-42)

The spec says: "reuse the existing `upload_workspace_image` primitive scoped to user (not org). Extend with a `scope: "user"` parameter."

The existing primitive is exposed as the MCP tool `upload_workspace_image` (one of the SeldonFrame MCP tools listed at session start). The web flow needs an HTTP endpoint that wraps the same R2/S3 upload logic.

### Task 39: Locate the existing image upload primitive

- [ ] **Step 1: Search for the primitive**

```bash
# From the worktree root, using the Grep tool:
# Pattern: "upload_workspace_image" OR "WORKSPACE_IMAGE" OR a putBlob/r2/s3 call
```

The MCP tool calls into a server function. Likely path: `packages/crm/src/lib/uploads/` or `packages/crm/src/lib/storage/` or `packages/crm/src/app/api/v1/uploads/`. If the primitive is implemented inline in the MCP tool handler, locate the MCP handler at `skills/mcp-server/src/tools.js` and trace it to the route it calls.

- [ ] **Step 2: Document the discovered call path**

Write a one-paragraph note at the top of Task 40's new file describing where the primitive lives and what it accepts. If the primitive does NOT yet exist as a standalone function (e.g., it's only an MCP-side proxy to an HTTP route in the CRM), Task 41 below adds the HTTP route and the wrapper.

---

### Task 40: TDD — userImageUpload wrapper

**Files:**
- Create: `packages/crm/src/lib/uploads/user-image.ts`
- Test: `packages/crm/tests/unit/uploads/user-image.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/uploads/user-image.spec.ts`:

```typescript
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildUserImageKey } from "../../../src/lib/uploads/user-image";

describe("buildUserImageKey", () => {
  test('produces a "users/{userId}/{filename}" key', () => {
    const key = buildUserImageKey({ userId: "user-1", filename: "logo.png" });
    assert.equal(key, "users/user-1/logo.png");
  });

  test("slugifies the filename to remove unsafe characters", () => {
    const key = buildUserImageKey({ userId: "user-1", filename: "My Logo (2026).png" });
    assert.equal(key, "users/user-1/my-logo-2026.png");
  });

  test("falls back to a generated name when filename is empty", () => {
    const key = buildUserImageKey({ userId: "user-1", filename: "", extension: "png" });
    assert.match(key, /^users\/user-1\/upload-[a-f0-9]+\.png$/);
  });

  test("rejects an empty userId", () => {
    assert.throws(() => buildUserImageKey({ userId: "", filename: "x.png" }), /userId/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/uploads/user-image.spec.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement buildUserImageKey**

Create `packages/crm/src/lib/uploads/user-image.ts`:

```typescript
import { randomUUID } from "node:crypto";

// Thin wrapper around the existing workspace-image upload primitive.
// Re-uses the same R2/S3 plumbing but scopes keys under users/{userId}/
// per the Cut B spec (open question 2 — extend existing primitive with
// scope: "user" rather than duplicate).
//
// The actual put-to-storage call is the same the MCP upload_workspace_image
// tool uses; this file owns key-shape + scope only.

export type BuildUserImageKeyInput = {
  userId: string;
  filename: string;
  extension?: string;
};

function slugifyFilename(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9.\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function buildUserImageKey(input: BuildUserImageKeyInput): string {
  if (!input.userId) {
    throw new Error("buildUserImageKey: userId is required");
  }

  const safeName = slugifyFilename(input.filename || "");
  if (safeName) {
    return `users/${input.userId}/${safeName}`;
  }

  const ext = input.extension?.replace(/^\./, "") ?? "bin";
  const generated = randomUUID().replace(/-/g, "");
  return `users/${input.userId}/upload-${generated}.${ext}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/crm && node --import tsx --test tests/unit/uploads/user-image.spec.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/uploads/user-image.ts packages/crm/tests/unit/uploads/user-image.spec.ts
git commit -m "feat(uploads): add buildUserImageKey for scope: user image uploads"
```

---

### Task 41: POST /api/v1/web/uploads/user-image route

**Files:**
- Create: `packages/crm/src/app/api/v1/web/uploads/user-image/route.ts`

- [ ] **Step 1: Implement the route**

The route wraps the same storage-write call the existing workspace-image upload uses. Find that call in Task 39's exploration. The handler below is the SHAPE — the body of `putImage` references the existing primitive (likely `putObjectToWorkspaceStorage(...)` or `uploadToR2(...)` — substitute the real function name).

Create `packages/crm/src/app/api/v1/web/uploads/user-image/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildUserImageKey } from "@/lib/uploads/user-image";
// Replace this import with the actual storage primitive discovered in Task 39:
// import { putObjectToWorkspaceStorage } from "@/lib/uploads/storage";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml"]);

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported image type. Use PNG, JPEG, or SVG." }, { status: 415 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Image must be 5MB or smaller." }, { status: 413 });
  }

  const key = buildUserImageKey({
    userId,
    filename: file.name,
    extension: file.type.split("/")[1] ?? "bin",
  });

  // TODO when implementing: replace this with the real storage primitive call
  // discovered in Task 39. The contract must return a public URL string.
  //
  // const publicUrl = await putObjectToWorkspaceStorage({
  //   key,
  //   body: await file.arrayBuffer(),
  //   contentType: file.type,
  //   scope: "user",
  // });
  //
  // For now (until Task 39 surfaces the exact primitive), throw an explicit
  // not-implemented error so manual smoke surfaces the gap loudly.
  const publicUrl: string | null = null;

  if (!publicUrl) {
    return NextResponse.json(
      { error: "Storage primitive not wired. See Task 41 in cut-b plan — replace TODO with real call." },
      { status: 501 }
    );
  }

  return NextResponse.json({ url: publicUrl, key });
}
```

After Task 39 surfaces the real primitive name and signature, replace the TODO block with the real call and remove the `publicUrl: null` stub.

- [ ] **Step 2: Commit (with the TODO clearly marked so a follow-up surfaces it)**

```bash
git add packages/crm/src/app/api/v1/web/uploads/user-image/route.ts
git commit -m "feat(uploads): add POST /api/v1/web/uploads/user-image route (pending storage wire-up from Task 39)"
```

---

### Task 42: Wire the real storage primitive

**Files:**
- Modify: `packages/crm/src/app/api/v1/web/uploads/user-image/route.ts`

- [ ] **Step 1: Open the route**

Replace the TODO block with the discovered primitive. Example (replace function name + import with the actual one from Task 39):

```typescript
import { putObjectToWorkspaceStorage } from "@/lib/uploads/storage";

// inside POST, replace the TODO + stub:
const publicUrl = await putObjectToWorkspaceStorage({
  key,
  body: Buffer.from(await file.arrayBuffer()),
  contentType: file.type,
  scope: "user",
});

return NextResponse.json({ url: publicUrl, key });
```

If the existing primitive doesn't accept a `scope` parameter, extend it. The minimal change: add an optional `scope?: "workspace" | "user"` parameter that the primitive uses to choose the bucket prefix (or simply prepends the key with `scope === "user" ? "users/" : "orgs/"`, but in our case `buildUserImageKey` already includes the `users/` prefix, so the scope arg is informational for telemetry/logging only — adapt to whatever the existing primitive does).

- [ ] **Step 2: Smoke**

`pnpm dev`, visit `/settings/agency-profile`, upload a small PNG. Confirm the network tab shows POST to `/api/v1/web/uploads/user-image` returning `{ url, key }`. The form preview shows the uploaded image. Save. Refresh — logo persists.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/api/v1/web/uploads/user-image/route.ts
git commit -m "feat(uploads): wire POST /api/v1/web/uploads/user-image to existing storage primitive"
```

---

## Phase 8 — Manual smoke (Task 43)

### Task 43: End-to-end Free → Growth upgrade flow

This is the manual gate the spec requires (Week 4 acceptance: "Free → Growth upgrade flow completes, tier change reflected in UI"). No code change; pure verification.

- [ ] **Step 1: Reset to a Free-tier user**

In a dev environment, sign in as a fresh user (or reset an existing user's tier to free + delete all their workspaces).

- [ ] **Step 2: Visit `/dashboard`**

Expected: usage badge shows "0/1 workspaces". Header CTA "Create Client Workspace" is enabled.

- [ ] **Step 3: Create the first workspace via /clients/new**

Use Cut A's URL-paste flow. Wait for completion. Land on the new workspace's dashboard.

- [ ] **Step 4: Visit `/clients`**

Expected: 1 card rendered. Usage badge shows "1/1 workspaces". Header CTA still says "Create Client Workspace".

- [ ] **Step 5: Click "Create Client Workspace"**

Expected: UpgradeModal opens. Two tier cards: Growth $29 / Scale $99.

- [ ] **Step 6: Click "Upgrade to Growth"**

Expected: browser redirects to Stripe Checkout (a real-looking Stripe URL with `checkout.stripe.com`). In dev without `STRIPE_SECRET_KEY`, expect the modal to show the inline error from the route ("Stripe is not configured...") — this is acceptable for the dev gate; production verification happens on staging.

- [ ] **Step 7: Complete the Stripe checkout (in stripe test mode)**

Use a Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC. Complete the purchase.

- [ ] **Step 8: Land on `/dashboard?upgraded=growth`**

Expected: dashboard renders. After ~1-2 seconds (webhook latency), the usage badge updates to "1/3 workspaces". If the badge doesn't update on first render, refresh the page — the spec acknowledges this can take a moment due to webhook timing.

- [ ] **Step 9: Visit `/clients`**

Expected: the same workspace card. Usage badge now "1/3 workspaces". Header CTA enabled (not at-limit).

- [ ] **Step 10: Click "Create Client Workspace" again**

Expected: navigates to `/clients/new` (no modal — under limit). Successfully creates the second client workspace.

- [ ] **Step 11: Repeat to create a 3rd workspace, then try a 4th**

The 4th click should open the modal (at-limit again on Growth). This proves the gating works at the higher tier too.

- [ ] **Step 12: Document any deviations**

If any step fails, file the issue against the Cut where the bug lives:
- Modal trigger doesn't fire → Task 17 or 25
- Stripe redirect URL malformed → Task 28 or 29
- Webhook doesn't update tier → Task 30
- Usage badge stale after webhook → likely a revalidation issue; add `revalidatePath("/dashboard")` to the webhook handler

- [ ] **Step 13: Stop dev server.**

---

## Wrap-up

After Task 43 passes, Cut B is complete. The orchestrator handles committing the three plan files together and opening the PR.

**Files produced** (count): 17 new files + 5 modified files = 22 file deltas. Approx ~510 LoC source, ~280 LoC test — within the spec's "Cut B total estimate: ~500 LoC source + ~250 LoC test".

**Design skills invoked (per the spec's non-negotiable requirement):**
- `design:design-system` — Tasks 14, 32
- `design:ux-copy` — Tasks 15, 33
- `design:design-critique` — Tasks 20, 37
- `design:accessibility-review` — Tasks 21, 38

All four design skills are invoked on each of the two new user-facing surfaces (`/clients` and `/settings/agency-profile`). The `UpgradeModal` design work belongs to Cut A; Cut B only wires checkout into it.

**Cross-Cut dependencies that must hold:**
- `users.agencyProfile` JSONB column exists on the `users` Drizzle schema (Cut A migration).
- `UpgradeModal` component at `packages/crm/src/components/billing/upgrade-modal.tsx` accepts `{ open, onOpenChange, currentTier, usage }` (Cut A — verify before Task 17).
- Dashboard's "Create Client Workspace" button + usage badge exists (Cut A — verify before Task 24).

If any of those don't hold when Cut B starts, pause and complete the relevant Cut A task first.
