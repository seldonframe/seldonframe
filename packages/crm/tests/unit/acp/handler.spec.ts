// Unit tests for lib/acp/handler.ts — the DI'd ACP checkout handlers.
//
// These exercise the FULL create → get → update → complete → cancel flow with
// FAKE deps (in-memory store, a stub listing resolver, the no-charge processor,
// a spy logEvent). No Postgres, no network, no money. The key money-safety
// assertions: complete returns a simulated order with a STUB payment ref
// (acp_stub_… / acp_free) and the recorded feeCents — never a real charge; the
// logEvent spy captures the acp_order_completed event the seller-earnings rollup
// will later read.

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  handleCreate,
  handleGet,
  handleUpdate,
  handleComplete,
  handleCancel,
  type AcpHandlerDeps,
  type AcpResolvedListing,
  type AcpStoredSession,
} from "../../../src/lib/acp/handler";
import { devStubProcessor } from "../../../src/lib/acp/processor";

// ─── fakes ───────────────────────────────────────────────────────────────────

const PAID: AcpResolvedListing = {
  slug: "review-responder",
  name: "Review Responder",
  priceCents: 2500,
  niche: "reviews",
  sellerOrgId: "org-seller-1",
  isPublished: true,
  enableCheckout: true,
};
const FREE: AcpResolvedListing = {
  slug: "free-bot",
  name: "Free Bot",
  priceCents: 0,
  niche: "misc",
  sellerOrgId: "org-seller-2",
  isPublished: true,
  enableCheckout: false,
};

type LoggedEvent = { event: string; properties: Record<string, unknown>; orgId?: string | null };

function makeDeps(overrides: Partial<AcpHandlerDeps> = {}): {
  deps: AcpHandlerDeps;
  store: Map<string, AcpStoredSession>;
  events: LoggedEvent[];
} {
  const store = new Map<string, AcpStoredSession>();
  const events: LoggedEvent[] = [];
  let seq = 0;
  const deps: AcpHandlerDeps = {
    resolveListing: async (slug: string) =>
      slug === PAID.slug ? PAID : slug === FREE.slug ? FREE : null,
    store: {
      create: async (s) => {
        store.set(s.id, s);
        return s;
      },
      get: async (id) => store.get(id) ?? null,
      update: async (id, patch) => {
        const cur = store.get(id);
        if (!cur) return null;
        const next = { ...cur, ...patch };
        store.set(id, next);
        return next;
      },
      findByIdempotencyKey: async (key) => {
        if (!key) return null;
        for (const s of store.values()) if (s.idempotencyKey === key) return s;
        return null;
      },
    },
    processor: devStubProcessor,
    logEvent: (event, properties, ctx) => {
      events.push({ event, properties, orgId: ctx?.orgId });
    },
    newId: () => `acp_sess_${++seq}`,
    now: () => new Date("2026-06-23T00:00:00.000Z"),
    ...overrides,
  };
  return { deps, store, events };
}

// ─── create ──────────────────────────────────────────────────────────────────

describe("handleCreate", () => {
  test("paid item → 201, ready_for_payment, totals + recorded feeCents (5%)", async () => {
    const { deps, store } = makeDeps();
    const res = await handleCreate({ items: [{ id: "review-responder", quantity: 2 }] }, null, deps);
    assert.equal(res.status, 201);
    const body = res.body as { id: string; status: string; totals: { amount: number }[]; line_items: unknown[] };
    assert.equal(body.status, "ready_for_payment");
    assert.equal(body.line_items.length, 1);
    // 2500 × 2 = 5000 total.
    assert.equal(body.totals.find((t) => (t as { type: string }).type === "total")?.amount, 5000);
    // Persisted with the recorded fee (5% of 5000 = 250) + seller org.
    const stored = store.get(body.id);
    assert.equal(stored?.feeCents, 250);
    assert.equal(stored?.sellerOrgId, "org-seller-1");
    assert.equal(stored?.listingSlug, "review-responder");
  });

  test("unknown slug → 400 invalid_request with a helpful message", async () => {
    const { deps } = makeDeps();
    const res = await handleCreate({ items: [{ id: "nope", quantity: 1 }] }, null, deps);
    assert.equal(res.status, 400);
    assert.equal((res.body as { type: string }).type, "invalid_request");
  });

  test("free agent (enable_checkout false) is rejected — install via the App, not ACP", async () => {
    const { deps } = makeDeps();
    const res = await handleCreate({ items: [{ id: "free-bot", quantity: 1 }] }, null, deps);
    assert.equal(res.status, 400);
    assert.match((res.body as { message: string }).message, /free|install|app/i);
  });

  test("missing items → 400", async () => {
    const { deps } = makeDeps();
    const res = await handleCreate({}, null, deps);
    assert.equal(res.status, 400);
    assert.equal((res.body as { param?: string }).param, "items");
  });

  test("Idempotency-Key dedupes: same key returns the SAME session id", async () => {
    const { deps } = makeDeps();
    const a = await handleCreate({ items: [{ id: "review-responder", quantity: 1 }] }, "idem-1", deps);
    const b = await handleCreate({ items: [{ id: "review-responder", quantity: 1 }] }, "idem-1", deps);
    assert.equal((a.body as { id: string }).id, (b.body as { id: string }).id);
  });
});

// ─── get ─────────────────────────────────────────────────────────────────────

describe("handleGet", () => {
  test("returns the session", async () => {
    const { deps } = makeDeps();
    const created = await handleCreate({ items: [{ id: "review-responder", quantity: 1 }] }, null, deps);
    const id = (created.body as { id: string }).id;
    const res = await handleGet(id, deps);
    assert.equal(res.status, 200);
    assert.equal((res.body as { id: string }).id, id);
  });

  test("unknown id → 404", async () => {
    const { deps } = makeDeps();
    const res = await handleGet("acp_sess_missing", deps);
    assert.equal(res.status, 404);
    assert.equal((res.body as { type: string }).type, "invalid_request");
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe("handleUpdate", () => {
  test("re-resolves items + recomputes totals/fee", async () => {
    const { deps, store } = makeDeps();
    const created = await handleCreate({ items: [{ id: "review-responder", quantity: 1 }] }, null, deps);
    const id = (created.body as { id: string }).id;
    const res = await handleUpdate(id, { items: [{ id: "review-responder", quantity: 4 }] }, deps);
    assert.equal(res.status, 200);
    const body = res.body as { totals: { type: string; amount: number }[] };
    assert.equal(body.totals.find((t) => t.type === "total")?.amount, 10000);
    assert.equal(store.get(id)?.feeCents, 500); // 5% of 10000
  });

  test("applies a buyer-only update", async () => {
    const { deps } = makeDeps();
    const created = await handleCreate({ items: [{ id: "review-responder", quantity: 1 }] }, null, deps);
    const id = (created.body as { id: string }).id;
    const res = await handleUpdate(id, { buyer: { email: "a@b.com" } }, deps);
    assert.equal(res.status, 200);
    assert.deepEqual((res.body as { buyer: unknown }).buyer, { email: "a@b.com" });
  });

  test("unknown id → 404", async () => {
    const { deps } = makeDeps();
    const res = await handleUpdate("missing", { buyer: { email: "a@b.com" } }, deps);
    assert.equal(res.status, 404);
  });
});

// ─── complete (the money-safety heart) ───────────────────────────────────────

describe("handleComplete", () => {
  test("completes with a STUB payment ref + order — NO real charge", async () => {
    const { deps, store, events } = makeDeps();
    const created = await handleCreate({ items: [{ id: "review-responder", quantity: 2 }] }, null, deps);
    const id = (created.body as { id: string }).id;
    const res = await handleComplete(
      id,
      { payment_data: { token: "spt_test", provider: "stripe" } },
      null,
      deps,
    );
    assert.equal(res.status, 200);
    const body = res.body as { status: string; order: { id: string; checkout_session_id: string } };
    assert.equal(body.status, "completed");
    assert.ok(body.order);
    assert.equal(body.order.checkout_session_id, id);
    // Persisted as completed.
    assert.equal(store.get(id)?.status, "completed");
    // The acp_order_completed event carries the stub ref + recorded fee + seller.
    const ev = events.find((e) => e.event === "acp_order_completed");
    assert.ok(ev, "acp_order_completed event logged");
    assert.equal(ev?.properties.slug, "review-responder");
    assert.equal(ev?.properties.amount_cents, 5000);
    assert.equal(ev?.properties.fee_cents, 250);
    assert.equal(ev?.properties.payment_ref, "acp_stub_" + id);
    assert.equal(ev?.properties.sellerOrgId, "org-seller-1");
    // Attributed to the seller org (so seller earnings can pick it up).
    assert.equal(ev?.orgId, "org-seller-1");
  });

  test("missing payment token → 400 (no completion)", async () => {
    const { deps, store } = makeDeps();
    const created = await handleCreate({ items: [{ id: "review-responder", quantity: 1 }] }, null, deps);
    const id = (created.body as { id: string }).id;
    const res = await handleComplete(id, { payment_data: { provider: "stripe" } }, null, deps);
    assert.equal(res.status, 400);
    assert.equal(store.get(id)?.status, "ready_for_payment"); // unchanged
  });

  test("completing a non-ready session → 400 (must be ready_for_payment)", async () => {
    const { deps } = makeDeps();
    const created = await handleCreate({ items: [{ id: "review-responder", quantity: 1 }] }, null, deps);
    const id = (created.body as { id: string }).id;
    // Cancel first → no longer ready.
    await handleCancel(id, deps);
    const res = await handleComplete(id, { payment_data: { token: "t", provider: "stripe" } }, null, deps);
    assert.equal(res.status, 400);
  });

  test("unknown id → 404", async () => {
    const { deps } = makeDeps();
    const res = await handleComplete("missing", { payment_data: { token: "t", provider: "stripe" } }, null, deps);
    assert.equal(res.status, 404);
  });

  test("processor error → 402 processing_error, session stays ready", async () => {
    const { deps, store } = makeDeps({
      processor: { authorizeAndCapture: async () => ({ ok: false, error: { code: "card_declined", message: "Declined." } }) },
    });
    const created = await handleCreate({ items: [{ id: "review-responder", quantity: 1 }] }, null, deps);
    const id = (created.body as { id: string }).id;
    const res = await handleComplete(id, { payment_data: { token: "t", provider: "stripe" } }, null, deps);
    assert.equal(res.status, 402);
    assert.equal((res.body as { type: string }).type, "processing_error");
    assert.equal(store.get(id)?.status, "ready_for_payment");
  });

  test("idempotent complete: a second complete returns the same completed order", async () => {
    const { deps } = makeDeps();
    const created = await handleCreate({ items: [{ id: "review-responder", quantity: 1 }] }, null, deps);
    const id = (created.body as { id: string }).id;
    const first = await handleComplete(id, { payment_data: { token: "t", provider: "stripe" } }, null, deps);
    const second = await handleComplete(id, { payment_data: { token: "t", provider: "stripe" } }, null, deps);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal((second.body as { status: string }).status, "completed");
    assert.deepEqual((first.body as { order: unknown }).order, (second.body as { order: unknown }).order);
  });
});

// ─── cancel ──────────────────────────────────────────────────────────────────

describe("handleCancel", () => {
  test("sets status canceled", async () => {
    const { deps, store } = makeDeps();
    const created = await handleCreate({ items: [{ id: "review-responder", quantity: 1 }] }, null, deps);
    const id = (created.body as { id: string }).id;
    const res = await handleCancel(id, deps);
    assert.equal(res.status, 200);
    assert.equal((res.body as { status: string }).status, "canceled");
    assert.equal(store.get(id)?.status, "canceled");
  });

  test("unknown id → 404", async () => {
    const { deps } = makeDeps();
    const res = await handleCancel("missing", deps);
    assert.equal(res.status, 404);
  });
});
