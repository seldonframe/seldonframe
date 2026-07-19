// Phase 2 — billing-state consolidation.
//
// The platform billing webhook (/api/webhooks/stripe-billing) is the
// ONLY writer of the platform subscription. It must write to
// `organizations.subscription` (JSONB) — NOT the legacy
// `users.planId/stripeCustomerId/stripeSubscriptionId` columns — so the
// app (getOrgSubscription / resolveTierForWorkspace, which read
// organizations.subscription) can never drift from Stripe.
//
// These tests pin the contract of the extracted, dependency-injected
// handler `handleBillingSubscriptionEvent`. They use an in-memory store
// that faithfully mirrors the production semantics that matter:
//   - resolveOrgId(): metadata.orgId → metadata.userId → by
//     subscriptionId → by customerId (first hit wins).
//   - updateOrgSubscription(): read-modify-write MERGE (sibling keys in
//     `organizations.subscription` are preserved across writes), exactly
//     like lib/billing/subscription.ts::updateOrgSubscription.
//
// No Stripe SDK, no DB, no secret keys: the handler resolves the tier
// purely from the price ids carried on the event (subscription.items /
// session.metadata) via the Phase 0 price-id constants + normalizeTierId.

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  handleBillingSubscriptionEvent,
  detectWorkspaceOverageItemId,
  type BillingWebhookStore,
} from "@/app/api/webhooks/stripe-billing/handlers";
import type { OrganizationSubscription } from "@/db/schema";
import {
  BUILDER_PRICE_ID,
  WORKSPACE_PRICE_ID,
  AGENCY_BASE_PRICE_ID,
  AGENCY_WORKSPACE_OVERAGE_PRICE_ID,
  GROWTH_BASE_PRICE_ID,
  SCALE_BASE_PRICE_ID,
} from "@/lib/billing/price-ids";

// ── In-memory store that mirrors production resolution + merge ────────

type Row = { subscription: OrganizationSubscription };

function makeStore(seed: Record<string, OrganizationSubscription> = {}): {
  store: BillingWebhookStore;
  rows: Map<string, Row>;
  userOrg: Map<string, string>;
  writes: Array<{ orgId: string; updates: Partial<OrganizationSubscription> }>;
} {
  const rows = new Map<string, Row>();
  for (const [orgId, sub] of Object.entries(seed)) {
    rows.set(orgId, { subscription: { ...sub } });
  }
  const userOrg = new Map<string, string>();
  const writes: Array<{ orgId: string; updates: Partial<OrganizationSubscription> }> = [];

  const store: BillingWebhookStore = {
    async resolveOrgId({ metadata, customerId, subscriptionId }) {
      const metaOrg = metadata?.orgId?.trim();
      if (metaOrg) return metaOrg;
      const metaUser = metadata?.userId?.trim();
      if (metaUser && userOrg.has(metaUser)) return userOrg.get(metaUser)!;
      if (subscriptionId) {
        for (const [orgId, row] of rows) {
          if (row.subscription.stripeSubscriptionId === subscriptionId) return orgId;
        }
      }
      if (customerId) {
        for (const [orgId, row] of rows) {
          if (row.subscription.stripeCustomerId === customerId) return orgId;
        }
      }
      return null;
    },
    async getOrgSubscription(orgId) {
      return rows.get(orgId)?.subscription ?? {};
    },
    async updateOrgSubscription(orgId, updates) {
      writes.push({ orgId, updates });
      const current = rows.get(orgId)?.subscription ?? {};
      // MERGE — mirrors lib/billing/subscription.ts (sibling keys kept).
      rows.set(orgId, { subscription: { ...current, ...updates } });
    },
  };

  return { store, rows, userOrg, writes };
}

// ── Stripe event factories (minimal shapes the handler reads) ─────────

function subscriptionEvent(opts: {
  id?: string;
  type: "customer.subscription.updated" | "customer.subscription.deleted";
  subscriptionId?: string;
  customerId?: string;
  status?: string;
  priceIds: string[];
  /** Stripe item id paired with each price id (same index). */
  itemIds?: string[];
  metadata?: Record<string, string>;
  currentPeriodEnd?: number;
}) {
  return {
    id: opts.id ?? "evt_test",
    type: opts.type,
    data: {
      object: {
        id: opts.subscriptionId ?? "sub_123",
        customer: opts.customerId ?? "cus_123",
        status: opts.status ?? "active",
        metadata: opts.metadata ?? {},
        current_period_end: opts.currentPeriodEnd,
        items: {
          data: opts.priceIds.map((priceId, i) => ({
            id: opts.itemIds?.[i] ?? `si_${i}`,
            price: { id: priceId },
          })),
        },
      },
    },
  } as never;
}

function checkoutEvent(opts: {
  id?: string;
  subscriptionId?: string;
  customerId?: string;
  metadata?: Record<string, string>;
}) {
  return {
    id: opts.id ?? "evt_checkout",
    type: "checkout.session.completed",
    data: {
      object: {
        subscription: opts.subscriptionId ?? "sub_123",
        customer: opts.customerId ?? "cus_123",
        metadata: opts.metadata ?? {},
      },
    },
  } as never;
}

function invoiceEvent(opts: {
  id?: string;
  type: "invoice.paid" | "invoice.payment_failed";
  subscriptionId?: string;
  customerId?: string;
  metadata?: Record<string, string>;
}) {
  return {
    id: opts.id ?? "evt_invoice",
    type: opts.type,
    data: {
      object: {
        subscription: opts.subscriptionId ?? "sub_123",
        customer: opts.customerId ?? "cus_123",
        metadata: opts.metadata ?? {},
      },
    },
  } as never;
}

const SIBLINGS: OrganizationSubscription = {
  // Non-billing-state keys that MUST survive every webhook write.
  layer2Enabled: true,
  trialEndsAt: "2026-01-01T00:00:00.000Z",
};

describe("billing webhook — checkout.session.completed", () => {
  let h: ReturnType<typeof makeStore>;
  beforeEach(() => {
    h = makeStore({ org_1: { ...SIBLINGS } });
  });

  test("writes tier + status + ids to organizations.subscription (org from metadata)", async () => {
    await handleBillingSubscriptionEvent(
      checkoutEvent({
        metadata: { orgId: "org_1", tier: "workspace", priceId: WORKSPACE_PRICE_ID },
        subscriptionId: "sub_ws",
        customerId: "cus_ws",
      }),
      h.store,
    );

    const sub = h.rows.get("org_1")!.subscription;
    assert.equal(sub.tier, "workspace");
    assert.equal(sub.status, "active");
    assert.equal(sub.stripeCustomerId, "cus_ws");
    assert.equal(sub.stripeSubscriptionId, "sub_ws");
    assert.equal(sub.stripePriceId, WORKSPACE_PRICE_ID);
  });

  test("preserves sibling keys (layer2Enabled, trialEndsAt)", async () => {
    await handleBillingSubscriptionEvent(
      checkoutEvent({ metadata: { orgId: "org_1", tier: "builder", priceId: BUILDER_PRICE_ID } }),
      h.store,
    );
    const sub = h.rows.get("org_1")!.subscription;
    assert.equal(sub.layer2Enabled, true);
    assert.equal(sub.trialEndsAt, "2026-01-01T00:00:00.000Z");
    assert.equal(sub.tier, "builder");
  });

  test("records the event id in the idempotency list", async () => {
    await handleBillingSubscriptionEvent(
      checkoutEvent({ id: "evt_abc", metadata: { orgId: "org_1", tier: "workspace", priceId: WORKSPACE_PRICE_ID } }),
      h.store,
    );
    const sub = h.rows.get("org_1")!.subscription;
    assert.ok(sub.stripeProcessedEventIds?.includes("evt_abc"));
  });

  test("resolves org by stripeCustomerId when metadata.orgId is absent", async () => {
    h = makeStore({ org_1: { ...SIBLINGS, stripeCustomerId: "cus_known" } });
    await handleBillingSubscriptionEvent(
      checkoutEvent({ metadata: { tier: "agency", priceId: AGENCY_BASE_PRICE_ID }, customerId: "cus_known" }),
      h.store,
    );
    assert.equal(h.rows.get("org_1")!.subscription.tier, "agency");
  });
});

describe("billing webhook — customer.subscription.updated", () => {
  let h: ReturnType<typeof makeStore>;
  beforeEach(() => {
    h = makeStore({ org_1: { ...SIBLINGS } });
  });

  test("resolves tier from the subscription's price ids", async () => {
    await handleBillingSubscriptionEvent(
      subscriptionEvent({
        type: "customer.subscription.updated",
        metadata: { orgId: "org_1" },
        subscriptionId: "sub_x",
        customerId: "cus_x",
        status: "active",
        priceIds: [AGENCY_BASE_PRICE_ID],
        currentPeriodEnd: 1_800_000_000,
      }),
      h.store,
    );
    const sub = h.rows.get("org_1")!.subscription;
    assert.equal(sub.tier, "agency");
    assert.equal(sub.status, "active");
    assert.equal(sub.stripeSubscriptionId, "sub_x");
    assert.equal(sub.stripePriceId, AGENCY_BASE_PRICE_ID);
    assert.equal(sub.currentPeriodEnd, new Date(1_800_000_000 * 1000).toISOString());
  });

  test("maps Stripe status (past_due) through", async () => {
    await handleBillingSubscriptionEvent(
      subscriptionEvent({
        type: "customer.subscription.updated",
        metadata: { orgId: "org_1" },
        status: "past_due",
        priceIds: [WORKSPACE_PRICE_ID],
      }),
      h.store,
    );
    assert.equal(h.rows.get("org_1")!.subscription.status, "past_due");
    assert.equal(h.rows.get("org_1")!.subscription.tier, "workspace");
  });

  test("legacy price id (Scale base) remaps to agency", async () => {
    await handleBillingSubscriptionEvent(
      subscriptionEvent({
        type: "customer.subscription.updated",
        metadata: { orgId: "org_1" },
        priceIds: [SCALE_BASE_PRICE_ID],
      }),
      h.store,
    );
    assert.equal(h.rows.get("org_1")!.subscription.tier, "agency");
  });

  test("legacy price id (Growth base) remaps to workspace", async () => {
    await handleBillingSubscriptionEvent(
      subscriptionEvent({
        type: "customer.subscription.updated",
        metadata: { orgId: "org_1" },
        priceIds: [GROWTH_BASE_PRICE_ID],
      }),
      h.store,
    );
    assert.equal(h.rows.get("org_1")!.subscription.tier, "workspace");
  });

  test("detects stripeWorkspaceItemId from the agency overage line item", async (t) => {
    if (!AGENCY_WORKSPACE_OVERAGE_PRICE_ID) {
      t.skip("AGENCY_WORKSPACE_OVERAGE_PRICE_ID not configured in env");
      return;
    }
    await handleBillingSubscriptionEvent(
      subscriptionEvent({
        type: "customer.subscription.updated",
        metadata: { orgId: "org_1" },
        priceIds: [AGENCY_BASE_PRICE_ID, AGENCY_WORKSPACE_OVERAGE_PRICE_ID],
        itemIds: ["si_base", "si_overage"],
      }),
      h.store,
    );
    const sub = h.rows.get("org_1")!.subscription;
    assert.equal(sub.tier, "agency");
    assert.equal(sub.stripeWorkspaceItemId, "si_overage");
    // The stored base price id must be the agency base, not the overage.
    assert.equal(sub.stripePriceId, AGENCY_BASE_PRICE_ID);
  });

  test("preserves sibling keys", async () => {
    await handleBillingSubscriptionEvent(
      subscriptionEvent({
        type: "customer.subscription.updated",
        metadata: { orgId: "org_1" },
        priceIds: [WORKSPACE_PRICE_ID],
      }),
      h.store,
    );
    assert.equal(h.rows.get("org_1")!.subscription.layer2Enabled, true);
  });

  // 2026-07-08 SECOND post-review fix wave (BLOCKING) — since
  // BUILDER_PRICE_ID now equals WORKSPACE_PRICE_ID (both tiers share one
  // Stripe price until Max creates a distinct Builder price),
  // price-id-only inference can no longer tell a "builder" subscriber
  // from a grandfathered "workspace" subscriber on a renewal-shaped
  // customer.subscription.updated event. subscription.metadata.tier
  // (embedded at checkout and carried on the subscription object for
  // its whole lifetime) must be preferred over price-id inference so
  // neither tier gets silently relabeled to the other.
  describe("metadata-first tier resolution (shared BUILDER/WORKSPACE price id)", () => {
    test("an existing GRANDFATHERED workspace subscriber's renewal does NOT relabel them to builder", async () => {
      // Seed: org already has tier "workspace" persisted (as a real
      // grandfathered subscriber would).
      h.rows.set("org_1", { subscription: { ...SIBLINGS, tier: "workspace" } });
      await handleBillingSubscriptionEvent(
        subscriptionEvent({
          type: "customer.subscription.updated",
          // The Stripe subscription's own metadata — set at the ORIGINAL
          // checkout, still carries tier:"workspace" for this subscriber.
          metadata: { orgId: "org_1", tier: "workspace" },
          priceIds: [WORKSPACE_PRICE_ID], // === BUILDER_PRICE_ID
          status: "active",
        }),
        h.store,
      );
      assert.equal(
        h.rows.get("org_1")!.subscription.tier,
        "workspace",
        "a renewal must not relabel an existing workspace subscriber to builder",
      );
    });

    test("a NEW builder subscriber's renewal does NOT relabel them to workspace", async () => {
      h.rows.set("org_1", { subscription: { ...SIBLINGS, tier: "builder" } });
      await handleBillingSubscriptionEvent(
        subscriptionEvent({
          type: "customer.subscription.updated",
          // The checkout embedded tier:"builder" in the subscription's
          // own metadata (buildCheckoutSessionParams).
          metadata: { orgId: "org_1", tier: "builder" },
          priceIds: [BUILDER_PRICE_ID], // === WORKSPACE_PRICE_ID
          status: "active",
        }),
        h.store,
      );
      assert.equal(
        h.rows.get("org_1")!.subscription.tier,
        "builder",
        "a renewal must not relabel a builder subscriber to the grandfathered workspace tier",
      );
    });

    test("without metadata.tier (pre-2026-06-18 rows), falls back to price-id inference (today's behavior, unchanged)", async () => {
      await handleBillingSubscriptionEvent(
        subscriptionEvent({
          type: "customer.subscription.updated",
          metadata: { orgId: "org_1" }, // no tier in metadata — legacy row
          priceIds: [WORKSPACE_PRICE_ID],
        }),
        h.store,
      );
      // Price-id inference checks WORKSPACE_PRICE_ID before BUILDER_PRICE_ID
      // (tier-resolve.ts's precedence) — this is the pre-existing fallback
      // behavior, unchanged by this fix.
      assert.equal(h.rows.get("org_1")!.subscription.tier, "workspace");
    });

    test("metadata.tier wins even when it disagrees with price-id inference (real-world: metadata is authoritative)", async () => {
      await handleBillingSubscriptionEvent(
        subscriptionEvent({
          type: "customer.subscription.updated",
          metadata: { orgId: "org_1", tier: "builder" },
          priceIds: [AGENCY_BASE_PRICE_ID], // would infer "agency" without metadata
        }),
        h.store,
      );
      assert.equal(h.rows.get("org_1")!.subscription.tier, "builder");
    });
  });
});

describe("billing webhook — customer.subscription.deleted (cancel)", () => {
  test("sets tier inactive + status canceled and clears subscription id", async () => {
    const h = makeStore({
      org_1: { ...SIBLINGS, tier: "agency", status: "active", stripeSubscriptionId: "sub_z", stripeCustomerId: "cus_z" },
    });
    await handleBillingSubscriptionEvent(
      subscriptionEvent({
        type: "customer.subscription.deleted",
        metadata: { orgId: "org_1" },
        subscriptionId: "sub_z",
        customerId: "cus_z",
        priceIds: [AGENCY_BASE_PRICE_ID],
      }),
      h.store,
    );
    const sub = h.rows.get("org_1")!.subscription;
    assert.equal(sub.tier, "inactive");
    assert.equal(sub.status, "canceled");
    assert.equal(sub.stripeSubscriptionId, null);
    // Sibling + customer id retained for back-reference.
    assert.equal(sub.layer2Enabled, true);
  });
});

describe("billing webhook — invoice.paid / invoice.payment_failed", () => {
  let h: ReturnType<typeof makeStore>;
  beforeEach(() => {
    h = makeStore({
      org_1: { ...SIBLINGS, tier: "workspace", status: "past_due", stripeCustomerId: "cus_inv", stripeSubscriptionId: "sub_inv" },
    });
  });

  test("invoice.paid flips status to active, preserves tier", async () => {
    await handleBillingSubscriptionEvent(
      invoiceEvent({ type: "invoice.paid", metadata: { orgId: "org_1" }, subscriptionId: "sub_inv", customerId: "cus_inv" }),
      h.store,
    );
    const sub = h.rows.get("org_1")!.subscription;
    assert.equal(sub.status, "active");
    assert.equal(sub.tier, "workspace"); // tier untouched by invoice events
  });

  // 2026-07-08 SECOND post-review fix wave — explicitly pins the
  // "renewal must not relabel" invariant this fix wave is about, in
  // the invoice (the literal Stripe renewal-billing event) path. The
  // invoice handler NEVER reads price ids at all (see the module
  // comment: "the authoritative tier writer is customer.subscription.
  // updated"), so an existing GRANDFATHERED workspace subscriber stays
  // "workspace" through every renewal invoice regardless of the shared
  // BUILDER/WORKSPACE price id — this was already correct before the
  // fix wave; this test makes that guarantee explicit for the shared-
  // price-id scenario the review flagged.
  test("a renewal invoice for an existing GRANDFATHERED workspace subscriber does NOT relabel them (shared price id is never read here)", async () => {
    h = makeStore({
      org_1: {
        ...SIBLINGS,
        tier: "workspace",
        status: "active",
        stripeCustomerId: "cus_inv",
        stripeSubscriptionId: "sub_inv",
        stripePriceId: WORKSPACE_PRICE_ID, // === BUILDER_PRICE_ID now
      },
    });
    await handleBillingSubscriptionEvent(
      invoiceEvent({ type: "invoice.paid", subscriptionId: "sub_inv", customerId: "cus_inv" }),
      h.store,
    );
    assert.equal(h.rows.get("org_1")!.subscription.tier, "workspace");
  });

  test("invoice.payment_failed flips status to past_due", async () => {
    h = makeStore({ org_1: { ...SIBLINGS, tier: "workspace", status: "active", stripeCustomerId: "cus_inv", stripeSubscriptionId: "sub_inv" } });
    await handleBillingSubscriptionEvent(
      invoiceEvent({ type: "invoice.payment_failed", metadata: { orgId: "org_1" }, subscriptionId: "sub_inv", customerId: "cus_inv" }),
      h.store,
    );
    assert.equal(h.rows.get("org_1")!.subscription.status, "past_due");
    assert.equal(h.rows.get("org_1")!.subscription.tier, "workspace");
  });

  test("resolves org by subscription id when metadata absent", async () => {
    await handleBillingSubscriptionEvent(
      invoiceEvent({ type: "invoice.paid", subscriptionId: "sub_inv", customerId: "cus_inv" }),
      h.store,
    );
    assert.equal(h.rows.get("org_1")!.subscription.status, "active");
  });
});

describe("billing webhook — idempotency", () => {
  test("re-delivered event id is a no-op (no second write)", async () => {
    const h = makeStore({ org_1: { ...SIBLINGS } });
    const evt = subscriptionEvent({
      id: "evt_dup",
      type: "customer.subscription.updated",
      metadata: { orgId: "org_1" },
      priceIds: [WORKSPACE_PRICE_ID],
    });

    await handleBillingSubscriptionEvent(evt, h.store);
    const writesAfterFirst = h.writes.length;
    assert.ok(writesAfterFirst >= 1);

    // Re-deliver the SAME event id.
    await handleBillingSubscriptionEvent(evt, h.store);
    assert.equal(h.writes.length, writesAfterFirst, "duplicate event must not write again");
    assert.equal(h.rows.get("org_1")!.subscription.tier, "workspace");
  });

  test("a different event id after a cancel is still applied", async () => {
    const h = makeStore({ org_1: { ...SIBLINGS, tier: "workspace", status: "active" } });
    await handleBillingSubscriptionEvent(
      subscriptionEvent({ id: "evt_1", type: "customer.subscription.updated", metadata: { orgId: "org_1" }, priceIds: [WORKSPACE_PRICE_ID] }),
      h.store,
    );
    await handleBillingSubscriptionEvent(
      subscriptionEvent({ id: "evt_2", type: "customer.subscription.deleted", metadata: { orgId: "org_1" }, priceIds: [WORKSPACE_PRICE_ID] }),
      h.store,
    );
    assert.equal(h.rows.get("org_1")!.subscription.tier, "inactive");
    assert.equal(h.rows.get("org_1")!.subscription.status, "canceled");
  });
});

describe("detectWorkspaceOverageItemId (env-independent)", () => {
  const OVERAGE = "price_overage_test";
  const items = {
    data: [
      { id: "si_base", price: { id: AGENCY_BASE_PRICE_ID } },
      { id: "si_overage", price: { id: OVERAGE } },
    ],
  } as never;

  test("returns the item id of the matching overage line", () => {
    assert.equal(detectWorkspaceOverageItemId(items, OVERAGE), "si_overage");
  });

  test("returns null when no line matches the overage price", () => {
    assert.equal(detectWorkspaceOverageItemId(items, "price_nope"), null);
  });

  test("returns null when the overage price id is empty (unconfigured)", () => {
    assert.equal(detectWorkspaceOverageItemId(items, ""), null);
  });
});

describe("billing webhook — org resolution failure is a safe no-op", () => {
  test("unknown org → no throw, no write", async () => {
    const h = makeStore();
    const result = await handleBillingSubscriptionEvent(
      subscriptionEvent({ type: "customer.subscription.updated", metadata: {}, customerId: "cus_nobody", priceIds: [WORKSPACE_PRICE_ID] }),
      h.store,
    );
    assert.equal(result, null);
    assert.equal(h.writes.length, 0);
  });
});
