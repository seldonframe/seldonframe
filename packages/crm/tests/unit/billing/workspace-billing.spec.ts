// Phase 4 (2026-06-18 pricing migration) — per-active-workspace billing.
//
// The Agency tier bills $10/mo for every LIVE client workspace beyond the
// 10 included in the $297 base. This file pins the contract of
// lib/billing/workspace-billing.ts:
//
//   - countActiveAgencyWorkspaces(agencyOrgId, deps): counts the agency's
//     child workspaces that are PUBLISHED (>=1 landing_pages row with
//     status='published') AND not archived (the org row still exists —
//     workspaces are hard-deleted, there's no soft-archive column) AND
//     not previewMode (proposal-provisioned, billing-gated). The actual
//     SQL lives behind deps.queryActiveWorkspaceCount so these tests run
//     with NO database.
//
//   - syncAgencyWorkspaceQuantity(agencyOrgId, deps): reads the agency's
//     subscription (must be tier=agency + an active stripeSubscriptionId,
//     else no-op), computes qty = max(0, active − includedWorkspaces)
//     [included defaults to 10], then drives the Stripe overage
//     subscription-item:
//       qty>0 + no item     → stripe.subscriptionItems.create(...)
//       qty>0 + item exists → update quantity (SKIP if already equal)
//       qty=0 + item exists → set quantity 0
//     Every Stripe call is wrapped so a failure logs + never throws.
//
// PATTERN NOTE: dependency-injection over module mocking (tsx's CJS
// interop makes node:test mock.method unreliable here — see
// tests/unit/billing/has-feature.spec.ts). We inject a fake Stripe
// `subscriptionItems` surface + fake subscription store, and assert on
// the recorded calls.

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  countActiveAgencyWorkspaces,
  syncAgencyWorkspaceQuantity,
  workspaceOverageQuantity,
  type WorkspaceBillingDeps,
} from "@/lib/billing/workspace-billing";
import type { OrganizationSubscription } from "@/db/schema";

// ── Fakes ─────────────────────────────────────────────────────────────

type StripeCall =
  | { kind: "create"; subscription: string; price: string; quantity: number }
  | { kind: "update"; itemId: string; quantity: number }
  | { kind: "del"; itemId: string };

function makeStripe(opts: { failOn?: StripeCall["kind"] } = {}) {
  const calls: StripeCall[] = [];
  const stripe = {
    subscriptionItems: {
      async create(params: { subscription: string; price: string; quantity: number }) {
        if (opts.failOn === "create") throw new Error("stripe_create_boom");
        calls.push({
          kind: "create",
          subscription: params.subscription,
          price: params.price,
          quantity: params.quantity,
        });
        return { id: "si_created_overage" };
      },
      async update(itemId: string, params: { quantity: number }) {
        if (opts.failOn === "update") throw new Error("stripe_update_boom");
        calls.push({ kind: "update", itemId, quantity: params.quantity });
        return { id: itemId };
      },
      async del(itemId: string) {
        if (opts.failOn === "del") throw new Error("stripe_del_boom");
        calls.push({ kind: "del", itemId });
        return { id: itemId, deleted: true };
      },
    },
  };
  return { stripe, calls };
}

function makeDeps(args: {
  activeCount: number;
  subscription: OrganizationSubscription;
  overagePriceId?: string;
  stripe?: ReturnType<typeof makeStripe>["stripe"] | null;
}): {
  deps: WorkspaceBillingDeps;
  writes: Array<{ orgId: string; updates: Partial<OrganizationSubscription> }>;
} {
  const writes: Array<{ orgId: string; updates: Partial<OrganizationSubscription> }> = [];
  let current = { ...args.subscription };
  const deps: WorkspaceBillingDeps = {
    queryActiveWorkspaceCount: async () => args.activeCount,
    getOrgSubscription: async () => current,
    updateOrgSubscription: async (orgId, updates) => {
      writes.push({ orgId, updates });
      current = { ...current, ...updates };
    },
    stripe: args.stripe === undefined ? makeStripe().stripe : args.stripe,
    overagePriceId: args.overagePriceId ?? "price_overage_10",
  };
  return { deps, writes };
}

const AGENCY_SUB = (over?: Partial<OrganizationSubscription>): OrganizationSubscription => ({
  tier: "agency",
  status: "active",
  stripeSubscriptionId: "sub_agency_1",
  includedWorkspaces: 10,
  ...over,
});

// ── workspaceOverageQuantity (pure math) ──────────────────────────────

describe("workspaceOverageQuantity — max(0, active − included)", () => {
  test("5 active, 10 included → 0", () => {
    assert.equal(workspaceOverageQuantity(5, 10), 0);
  });
  test("10 active, 10 included → 0 (at the boundary)", () => {
    assert.equal(workspaceOverageQuantity(10, 10), 0);
  });
  test("11 active, 10 included → 1 (first overage)", () => {
    assert.equal(workspaceOverageQuantity(11, 10), 1);
  });
  test("25 active, 10 included → 15", () => {
    assert.equal(workspaceOverageQuantity(25, 10), 15);
  });
  test("undefined included defaults to 10", () => {
    assert.equal(workspaceOverageQuantity(12, undefined), 2);
  });
  test("never negative", () => {
    assert.equal(workspaceOverageQuantity(0, 10), 0);
  });
});

// ── countActiveAgencyWorkspaces ───────────────────────────────────────

describe("countActiveAgencyWorkspaces", () => {
  test("delegates to deps.queryActiveWorkspaceCount with the agency org id", async () => {
    let seenOrgId: string | null = null;
    const count = await countActiveAgencyWorkspaces("agency-org-1", {
      queryActiveWorkspaceCount: async (orgId) => {
        seenOrgId = orgId;
        return 7;
      },
    });
    assert.equal(count, 7);
    assert.equal(seenOrgId, "agency-org-1");
  });

  test("only published, non-archived, non-preview children are counted (fixture)", async () => {
    // Simulate the DB layer: three published+live children, one draft-only,
    // one previewMode. The query is expected to return 3.
    const children = [
      { published: true, previewMode: false },
      { published: true, previewMode: false },
      { published: true, previewMode: false },
      { published: false, previewMode: false }, // draft only — excluded
      { published: true, previewMode: true }, // proposal preview — excluded
    ];
    const expected = children.filter((c) => c.published && !c.previewMode).length;
    const count = await countActiveAgencyWorkspaces("agency-org-1", {
      queryActiveWorkspaceCount: async () =>
        children.filter((c) => c.published && !c.previewMode).length,
    });
    assert.equal(count, expected);
    assert.equal(count, 3);
  });

  test("null/empty agency org id → 0 without querying", async () => {
    let called = false;
    const count = await countActiveAgencyWorkspaces(null, {
      queryActiveWorkspaceCount: async () => {
        called = true;
        return 99;
      },
    });
    assert.equal(count, 0);
    assert.equal(called, false);
  });
});

// ── syncAgencyWorkspaceQuantity ───────────────────────────────────────

describe("syncAgencyWorkspaceQuantity — create item crossing the included threshold", () => {
  test("11 active, no overage item yet → Stripe create(price, qty=1) + stores item id", async () => {
    const { stripe, calls } = makeStripe();
    const { deps, writes } = makeDeps({
      activeCount: 11,
      subscription: AGENCY_SUB({ stripeWorkspaceItemId: null }),
      stripe,
      overagePriceId: "price_overage_10",
    });

    const result = await syncAgencyWorkspaceQuantity("agency-org-1", deps);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      kind: "create",
      subscription: "sub_agency_1",
      price: "price_overage_10",
      quantity: 1,
    });
    // Persisted the new item id so future syncs update instead of recreate.
    const itemWrite = writes.find((w) => w.updates.stripeWorkspaceItemId !== undefined);
    assert.ok(itemWrite, "should persist the new item id");
    assert.equal(itemWrite!.updates.stripeWorkspaceItemId, "si_created_overage");
    assert.equal(result.action, "created");
    assert.equal(result.quantity, 1);
  });

  test("25 active, no item → create(qty=15)", async () => {
    const { stripe, calls } = makeStripe();
    const { deps } = makeDeps({
      activeCount: 25,
      subscription: AGENCY_SUB({ stripeWorkspaceItemId: null }),
      stripe,
    });
    await syncAgencyWorkspaceQuantity("agency-org-1", deps);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, "create");
    assert.equal((calls[0] as { quantity: number }).quantity, 15);
  });
});

describe("syncAgencyWorkspaceQuantity — update existing item on change", () => {
  test("existing item, qty changes 1 → 15 → Stripe update(item, 15)", async () => {
    const { stripe, calls } = makeStripe();
    const { deps } = makeDeps({
      activeCount: 25,
      subscription: AGENCY_SUB({ stripeWorkspaceItemId: "si_existing" }),
      stripe,
    });
    const result = await syncAgencyWorkspaceQuantity("agency-org-1", deps);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { kind: "update", itemId: "si_existing", quantity: 15 });
    assert.equal(result.action, "updated");
    assert.equal(result.quantity, 15);
  });
});

describe("syncAgencyWorkspaceQuantity — idempotent NO-OP when quantity unchanged", () => {
  test("existing item already at the target qty → NO Stripe call", async () => {
    const { stripe, calls } = makeStripe();
    // 13 active − 10 included = 3; item already carries quantity 3.
    const { deps } = makeDeps({
      activeCount: 13,
      subscription: AGENCY_SUB({
        stripeWorkspaceItemId: "si_existing",
        // current persisted quantity surfaced to the sync via the sub
        stripeWorkspaceItemQuantity: 3,
      } as Partial<OrganizationSubscription>),
      stripe,
    });
    const result = await syncAgencyWorkspaceQuantity("agency-org-1", deps);
    assert.equal(calls.length, 0, "must not call Stripe when quantity is unchanged");
    assert.equal(result.action, "noop");
    assert.equal(result.quantity, 3);
  });
});

describe("syncAgencyWorkspaceQuantity — drop to zero overage", () => {
  test("active falls back to 10, item exists → set quantity 0 (item kept)", async () => {
    const { stripe, calls } = makeStripe();
    const { deps } = makeDeps({
      activeCount: 10,
      subscription: AGENCY_SUB({
        stripeWorkspaceItemId: "si_existing",
        stripeWorkspaceItemQuantity: 5,
      } as Partial<OrganizationSubscription>),
      stripe,
    });
    const result = await syncAgencyWorkspaceQuantity("agency-org-1", deps);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { kind: "update", itemId: "si_existing", quantity: 0 });
    assert.equal(result.action, "updated");
    assert.equal(result.quantity, 0);
  });

  test("active below included, NO item → nothing to do (no create at qty 0)", async () => {
    const { stripe, calls } = makeStripe();
    const { deps } = makeDeps({
      activeCount: 5,
      subscription: AGENCY_SUB({ stripeWorkspaceItemId: null }),
      stripe,
    });
    const result = await syncAgencyWorkspaceQuantity("agency-org-1", deps);
    assert.equal(calls.length, 0, "must never create an item at quantity 0");
    assert.equal(result.action, "noop");
    assert.equal(result.quantity, 0);
  });
});

describe("syncAgencyWorkspaceQuantity — guards (no-op, no Stripe)", () => {
  test("non-agency tier → no-op, no count query, no Stripe", async () => {
    const { stripe, calls } = makeStripe();
    let counted = false;
    const result = await syncAgencyWorkspaceQuantity("org-1", {
      queryActiveWorkspaceCount: async () => {
        counted = true;
        return 50;
      },
      getOrgSubscription: async () => ({ tier: "workspace", status: "active", stripeSubscriptionId: "sub_x" }),
      updateOrgSubscription: async () => {},
      stripe,
      overagePriceId: "price_overage_10",
    });
    assert.equal(calls.length, 0);
    assert.equal(counted, false);
    assert.equal(result.action, "skipped");
  });

  test("agency tier but no active stripeSubscriptionId → no-op, no Stripe", async () => {
    const { stripe, calls } = makeStripe();
    const result = await syncAgencyWorkspaceQuantity("org-1", {
      queryActiveWorkspaceCount: async () => 50,
      getOrgSubscription: async () => ({ tier: "agency", status: "active", stripeSubscriptionId: null }),
      updateOrgSubscription: async () => {},
      stripe,
      overagePriceId: "price_overage_10",
    });
    assert.equal(calls.length, 0);
    assert.equal(result.action, "skipped");
  });

  test("overage price id not configured → no-op (env-only price, can't create)", async () => {
    const { stripe, calls } = makeStripe();
    const result = await syncAgencyWorkspaceQuantity("org-1", {
      queryActiveWorkspaceCount: async () => 25,
      getOrgSubscription: async () => AGENCY_SUB({ stripeWorkspaceItemId: null }),
      updateOrgSubscription: async () => {},
      stripe,
      overagePriceId: "", // unset
    });
    assert.equal(calls.length, 0);
    assert.equal(result.action, "skipped");
  });

  test("no Stripe client → no-op (key missing), never throws", async () => {
    const result = await syncAgencyWorkspaceQuantity("org-1", {
      queryActiveWorkspaceCount: async () => 25,
      getOrgSubscription: async () => AGENCY_SUB({ stripeWorkspaceItemId: null }),
      updateOrgSubscription: async () => {},
      stripe: null,
      overagePriceId: "price_overage_10",
    });
    assert.equal(result.action, "skipped");
  });

  test("null agency org id → skipped without reading subscription", async () => {
    let read = false;
    const result = await syncAgencyWorkspaceQuantity(null, {
      queryActiveWorkspaceCount: async () => 25,
      getOrgSubscription: async () => {
        read = true;
        return AGENCY_SUB();
      },
      updateOrgSubscription: async () => {},
      stripe: makeStripe().stripe,
      overagePriceId: "price_overage_10",
    });
    assert.equal(result.action, "skipped");
    assert.equal(read, false);
  });
});

describe("syncAgencyWorkspaceQuantity — Stripe failure is swallowed", () => {
  test("create throws → caller does NOT throw, action='error', item id NOT persisted", async () => {
    const { stripe } = makeStripe({ failOn: "create" });
    const { deps, writes } = makeDeps({
      activeCount: 11,
      subscription: AGENCY_SUB({ stripeWorkspaceItemId: null }),
      stripe,
    });
    const result = await syncAgencyWorkspaceQuantity("agency-org-1", deps);
    assert.equal(result.action, "error");
    // Must not persist a bogus item id when the create failed.
    const itemWrite = writes.find((w) => w.updates.stripeWorkspaceItemId);
    assert.equal(itemWrite, undefined);
  });

  test("update throws → caller does NOT throw, action='error'", async () => {
    const { stripe } = makeStripe({ failOn: "update" });
    const { deps } = makeDeps({
      activeCount: 25,
      subscription: AGENCY_SUB({ stripeWorkspaceItemId: "si_existing" }),
      stripe,
    });
    const result = await syncAgencyWorkspaceQuantity("agency-org-1", deps);
    assert.equal(result.action, "error");
  });
});
