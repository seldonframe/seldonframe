// Unit tests for lib/acp/checkout.ts — the PURE ACP checkout-session math +
// validation. No I/O, no Date.now, no random: ids are derived from the session
// id, so every assertion here is deterministic.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildLineItem,
  computeTotals,
  resolveStatus,
  applyBuyer,
  validateCreateBody,
  validateUpdateBody,
  validateCompleteBody,
  toCheckoutSessionResponse,
  buildOrder,
  type InternalSession,
} from "../../../src/lib/acp/checkout";

// ─── buildLineItem ───────────────────────────────────────────────────────────

describe("buildLineItem", () => {
  test("computes base/subtotal/total for quantity > 1 (tax 0 in v1)", () => {
    const li = buildLineItem({ slug: "review-responder", name: "Review Responder", priceCents: 2500 }, 3);
    assert.equal(li.base_amount, 2500);
    assert.equal(li.subtotal, 7500);
    assert.equal(li.tax, 0);
    assert.equal(li.total, 7500);
    assert.deepEqual(li.item, { id: "review-responder", quantity: 3 });
  });

  test("derives a stable, non-random line id from the slug", () => {
    const a = buildLineItem({ slug: "lead-qualifier", name: "Lead Qualifier", priceCents: 1000 }, 1);
    const b = buildLineItem({ slug: "lead-qualifier", name: "Lead Qualifier", priceCents: 1000 }, 1);
    assert.equal(a.id, b.id);
    assert.ok(a.id.includes("lead-qualifier"));
  });

  test("clamps a bad quantity up to 1", () => {
    const li = buildLineItem({ slug: "x", name: "X", priceCents: 500 }, 0);
    assert.equal(li.item.quantity, 1);
    assert.equal(li.subtotal, 500);
  });

  test("free product yields a 0 line", () => {
    const li = buildLineItem({ slug: "free-bot", name: "Free Bot", priceCents: 0 }, 2);
    assert.equal(li.base_amount, 0);
    assert.equal(li.total, 0);
  });
});

// ─── computeTotals ───────────────────────────────────────────────────────────

describe("computeTotals", () => {
  test("sums line totals into subtotal/tax/total with the totals[] ledger", () => {
    const lines = [
      buildLineItem({ slug: "a", name: "A", priceCents: 1000 }, 2), // 2000
      buildLineItem({ slug: "b", name: "B", priceCents: 500 }, 1), //  500
    ];
    const t = computeTotals(lines);
    assert.equal(t.subtotal, 2500);
    assert.equal(t.tax, 0);
    assert.equal(t.total, 2500);
    assert.deepEqual(
      t.totals.map((row) => ({ type: row.type, amount: row.amount })),
      [
        { type: "subtotal", amount: 2500 },
        { type: "tax", amount: 0 },
        { type: "total", amount: 2500 },
      ],
    );
    for (const row of t.totals) assert.equal(typeof row.display_text, "string");
  });

  test("empty line items → all zero", () => {
    const t = computeTotals([]);
    assert.equal(t.subtotal, 0);
    assert.equal(t.total, 0);
  });
});

// ─── resolveStatus ───────────────────────────────────────────────────────────

describe("resolveStatus", () => {
  const base: InternalSession = {
    id: "acp_sess_abc",
    status: "not_ready_for_payment",
    currency: "usd",
    lineItems: [],
    totals: { subtotal: 0, tax: 0, total: 0, totals: [] },
    messages: [],
  };

  test("ready_for_payment once there is ≥1 line item with resolved amounts", () => {
    const li = buildLineItem({ slug: "a", name: "A", priceCents: 1000 }, 1);
    assert.equal(resolveStatus({ ...base, lineItems: [li], totals: computeTotals([li]) }), "ready_for_payment");
  });

  test("not_ready_for_payment with no line items", () => {
    assert.equal(resolveStatus(base), "not_ready_for_payment");
  });

  test("a free (0-total) line is still ready (install-via-ACP edge, total 0)", () => {
    const li = buildLineItem({ slug: "free", name: "Free", priceCents: 0 }, 1);
    assert.equal(resolveStatus({ ...base, lineItems: [li], totals: computeTotals([li]) }), "ready_for_payment");
  });

  test("preserves a terminal status (completed/canceled never regress)", () => {
    const li = buildLineItem({ slug: "a", name: "A", priceCents: 1000 }, 1);
    const completed: InternalSession = { ...base, status: "completed", lineItems: [li], totals: computeTotals([li]) };
    assert.equal(resolveStatus(completed), "completed");
    const canceled: InternalSession = { ...base, status: "canceled" };
    assert.equal(resolveStatus(canceled), "canceled");
  });
});

// ─── applyBuyer ──────────────────────────────────────────────────────────────

describe("applyBuyer", () => {
  const base: InternalSession = {
    id: "acp_sess_abc",
    status: "ready_for_payment",
    currency: "usd",
    lineItems: [],
    totals: { subtotal: 0, tax: 0, total: 0, totals: [] },
    messages: [],
  };

  test("attaches the buyer block immutably (does not mutate input)", () => {
    const next = applyBuyer(base, { email: "a@b.com", first_name: "Ada" });
    assert.deepEqual(next.buyer, { email: "a@b.com", first_name: "Ada" });
    assert.equal(base.buyer, undefined);
  });

  test("undefined buyer is a no-op (keeps existing)", () => {
    const withBuyer = applyBuyer(base, { email: "a@b.com" });
    const next = applyBuyer(withBuyer, undefined);
    assert.deepEqual(next.buyer, { email: "a@b.com" });
  });
});

// ─── validateCreateBody ──────────────────────────────────────────────────────

describe("validateCreateBody", () => {
  test("accepts a well-formed body and normalizes quantity", () => {
    const r = validateCreateBody({ items: [{ id: "a", quantity: 2 }], buyer: { email: "a@b.com" } });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.items.length, 1);
      assert.equal(r.value.items[0].quantity, 2);
      assert.deepEqual(r.value.buyer, { email: "a@b.com" });
    }
  });

  test("defaults a missing quantity to 1", () => {
    const r = validateCreateBody({ items: [{ id: "a" }] });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.items[0].quantity, 1);
  });

  test("rejects a missing/empty items array", () => {
    const r1 = validateCreateBody({});
    assert.equal(r1.ok, false);
    if (!r1.ok) {
      assert.equal(r1.error.type, "invalid_request");
      assert.equal(r1.error.param, "items");
    }
    assert.equal(validateCreateBody({ items: [] }).ok, false);
  });

  test("rejects an item with a missing id", () => {
    const r = validateCreateBody({ items: [{ quantity: 1 }] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.param, "items");
  });

  test("rejects a non-positive or non-integer quantity", () => {
    assert.equal(validateCreateBody({ items: [{ id: "a", quantity: 0 }] }).ok, false);
    assert.equal(validateCreateBody({ items: [{ id: "a", quantity: -2 }] }).ok, false);
    assert.equal(validateCreateBody({ items: [{ id: "a", quantity: 1.5 }] }).ok, false);
  });

  test("rejects a non-object body", () => {
    assert.equal(validateCreateBody(null).ok, false);
    assert.equal(validateCreateBody("nope").ok, false);
  });
});

// ─── validateUpdateBody ──────────────────────────────────────────────────────

describe("validateUpdateBody", () => {
  test("accepts an items-only update", () => {
    const r = validateUpdateBody({ items: [{ id: "a", quantity: 1 }] });
    assert.equal(r.ok, true);
  });

  test("accepts a buyer-only update", () => {
    const r = validateUpdateBody({ buyer: { email: "a@b.com" } });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.items, undefined);
  });

  test("accepts an empty update (no-op)", () => {
    assert.equal(validateUpdateBody({}).ok, true);
  });

  test("still rejects a present-but-bad items array", () => {
    assert.equal(validateUpdateBody({ items: [] }).ok, false);
    assert.equal(validateUpdateBody({ items: [{ quantity: 1 }] }).ok, false);
  });
});

// ─── validateCompleteBody ────────────────────────────────────────────────────

describe("validateCompleteBody", () => {
  test("accepts a body with a stripe payment token", () => {
    const r = validateCompleteBody({ payment_data: { token: "spt_123", provider: "stripe" } });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.payment_data.token, "spt_123");
  });

  test("rejects a missing payment_data", () => {
    const r = validateCompleteBody({ buyer: { email: "a@b.com" } });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.param, "payment_data");
  });

  test("rejects a missing/empty token", () => {
    assert.equal(validateCompleteBody({ payment_data: { provider: "stripe" } }).ok, false);
    assert.equal(validateCompleteBody({ payment_data: { token: "", provider: "stripe" } }).ok, false);
    if (!validateCompleteBody({ payment_data: { provider: "stripe" } }).ok) {
      const r = validateCompleteBody({ payment_data: { provider: "stripe" } });
      if (!r.ok) assert.equal(r.error.param, "payment_data.token");
    }
  });

  test("rejects a non-object body", () => {
    assert.equal(validateCompleteBody(null).ok, false);
  });
});

// ─── buildOrder ──────────────────────────────────────────────────────────────

describe("buildOrder", () => {
  test("derives a deterministic order id from the session id + slug permalink", () => {
    const o1 = buildOrder({ sessionId: "acp_sess_abc123", slug: "review-responder" });
    const o2 = buildOrder({ sessionId: "acp_sess_abc123", slug: "review-responder" });
    assert.equal(o1.id, o2.id);
    assert.ok(o1.id.startsWith("order_"));
    assert.equal(o1.checkout_session_id, "acp_sess_abc123");
    assert.equal(o1.permalink_url, "https://app.seldonframe.com/marketplace/review-responder");
  });

  test("different sessions yield different order ids", () => {
    const a = buildOrder({ sessionId: "acp_sess_aaa", slug: "x" });
    const b = buildOrder({ sessionId: "acp_sess_bbb", slug: "x" });
    assert.notEqual(a.id, b.id);
  });
});

// ─── toCheckoutSessionResponse ───────────────────────────────────────────────

describe("toCheckoutSessionResponse", () => {
  test("shapes the internal session onto the ACP wire object", () => {
    const li = buildLineItem({ slug: "a", name: "A", priceCents: 1000 }, 2);
    const internal: InternalSession = {
      id: "acp_sess_abc",
      status: "ready_for_payment",
      currency: "usd",
      lineItems: [li],
      totals: computeTotals([li]),
      buyer: { email: "a@b.com" },
      messages: [{ type: "info", text: "Ready." }],
    };
    const wire = toCheckoutSessionResponse(internal);
    assert.equal(wire.id, "acp_sess_abc");
    assert.equal(wire.status, "ready_for_payment");
    assert.equal(wire.currency, "usd");
    assert.deepEqual(wire.payment_provider, { provider: "stripe", supported_payment_methods: ["card"] });
    assert.equal(wire.line_items.length, 1);
    assert.equal(wire.totals.length, 3);
    assert.deepEqual(wire.buyer, { email: "a@b.com" });
    assert.equal(wire.order, undefined);
  });

  test("includes the order when present", () => {
    const internal: InternalSession = {
      id: "acp_sess_abc",
      status: "completed",
      currency: "usd",
      lineItems: [],
      totals: { subtotal: 0, tax: 0, total: 0, totals: [] },
      messages: [],
      order: buildOrder({ sessionId: "acp_sess_abc", slug: "x" }),
    };
    const wire = toCheckoutSessionResponse(internal);
    assert.ok(wire.order);
    assert.equal(wire.order?.checkout_session_id, "acp_sess_abc");
  });
});
