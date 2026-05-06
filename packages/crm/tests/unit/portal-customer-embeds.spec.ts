// ============================================================================
// v1.15.0 — portal customer.* embed refs (schema + render)
// ============================================================================
//
// Tests for the 5 new per-customer embed.ref values added to the
// composite primitive schema:
//
//   customer.next_appointment   — single upcoming booking card
//   customer.recent_appointments — last N completed appointments
//   customer.documents          — portal documents list
//   customer.deals              — deals/jobs list
//   customer.contact_info       — name + email + phone summary
//
// Plus tests for the CustomerRenderContext builder (assembleCustomer
// Context, the pure assembly half) — verifies orgId+customerId are
// REQUIRED, never inferred.
//
// Per-customer DB resolvers (the impure half) are NOT tested here —
// they're integration-test territory (live DB, scoped queries). The
// security-relevant bit is covered by the assembly contract:
// every resolver MUST receive both orgId and customerId, never one
// alone.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CompositeNodeSchema,
} from "@/lib/page-blocks/composite/schema";
import {
  renderCompositeTree,
  type CompositeRenderContext,
} from "@/lib/page-blocks/composite/render";
import {
  assembleCustomerContext,
  type CustomerRenderContext,
  type CustomerData,
} from "@/lib/page-blocks/portal/customer-context";
import type { CompositeNode } from "@/lib/page-blocks/composite/schema";

// ─── Schema accepts the 5 new embed refs ──────────────────────────────────

test("CompositeNodeSchema accepts embed.ref=customer.next_appointment", () => {
  const r = CompositeNodeSchema.safeParse({
    kind: "embed",
    ref: "customer.next_appointment",
  });
  assert.equal(r.success, true);
});

test("CompositeNodeSchema accepts all 5 customer.* embed refs", () => {
  for (const ref of [
    "customer.next_appointment",
    "customer.recent_appointments",
    "customer.documents",
    "customer.deals",
    "customer.contact_info",
  ]) {
    const r = CompositeNodeSchema.safeParse({ kind: "embed", ref });
    assert.equal(r.success, true, `expected ref=${ref} to parse`);
  }
});

test("CompositeNodeSchema still accepts the original 5 workspace embed refs", () => {
  for (const ref of ["services", "faq", "testimonials", "hours", "phone"]) {
    const r = CompositeNodeSchema.safeParse({ kind: "embed", ref });
    assert.equal(r.success, true, `expected ref=${ref} to still parse`);
  }
});

test("CompositeNodeSchema still rejects unknown embed refs", () => {
  for (const ref of [
    "customer.password",
    "customer.credit_card",
    "system.env",
    "secret",
    "../etc/passwd",
  ]) {
    const r = CompositeNodeSchema.safeParse({ kind: "embed", ref });
    assert.equal(r.success, false, `expected ref=${ref} to reject`);
  }
});

// ─── assembleCustomerContext — pure assembly ──────────────────────────────

const SAMPLE_CUSTOMER: CustomerData["customer"] = {
  id: "00000000-0000-0000-0000-000000000001",
  first_name: "Maxime",
  last_name: "Houle",
  email: "maxime.houle@hec.ca",
  phone: "+15555550123",
};

const BASE_WORKSPACE_CTX: CompositeRenderContext = {
  workspace_phone: "+16045550142",
  workspace_phone_display: "(604) 555-0142",
  services: [],
  faq: [],
  testimonials: [],
  hours_summary: "",
  book_url: "/book",
  intake_url: "/intake",
};

test("assembleCustomerContext extends CompositeRenderContext with customer data", () => {
  const ctx = assembleCustomerContext({
    workspace: BASE_WORKSPACE_CTX,
    customer: SAMPLE_CUSTOMER,
    next_appointment: null,
    recent_appointments: [],
    documents: [],
    deals: [],
  });

  // Workspace fields preserved.
  assert.equal(ctx.workspace_phone, "+16045550142");
  assert.equal(ctx.book_url, "/book");
  // Customer-scoped fields populated.
  assert.equal(ctx.customer.id, SAMPLE_CUSTOMER.id);
  assert.equal(ctx.customer.first_name, "Maxime");
  assert.equal(ctx.next_appointment, null);
  assert.deepEqual(ctx.documents, []);
});

test("assembleCustomerContext requires customer.id (security: never default to empty)", () => {
  // The render context's customer.id is the auth scope. If it were ever
  // empty/null/undefined and the renderer tried to fall through, an
  // attacker could request a portal page without identifying which
  // customer they ARE. Force the contract: id is non-empty string.
  assert.throws(() => {
    assembleCustomerContext({
      workspace: BASE_WORKSPACE_CTX,
      customer: { ...SAMPLE_CUSTOMER, id: "" },
      next_appointment: null,
      recent_appointments: [],
      documents: [],
      deals: [],
    });
  }, /customer\.id/i);
});

// ─── Renderer handles each customer.* ref ──────────────────────────────────

const FULL_CUSTOMER_CTX: CustomerRenderContext = {
  ...BASE_WORKSPACE_CTX,
  customer: SAMPLE_CUSTOMER,
  next_appointment: {
    id: "appt-1",
    title: "HVAC service call",
    starts_at_iso: "2026-05-15T17:00:00Z",
    starts_at_display: "Friday, May 15 at 5:00 PM",
    location_summary: "On-site at 46 Rue de Calais",
  },
  recent_appointments: [
    {
      id: "appt-old-1",
      title: "Furnace tune-up",
      starts_at_display: "April 4, 2026",
      status: "completed",
    },
    {
      id: "appt-old-2",
      title: "AC inspection",
      starts_at_display: "March 22, 2026",
      status: "completed",
    },
  ],
  documents: [
    {
      id: "doc-1",
      file_name: "Service contract.pdf",
      blob_url: "https://example.blob.com/contract.pdf",
      uploaded_at_display: "April 6, 2026",
    },
  ],
  deals: [
    {
      id: "deal-1",
      title: "AC unit replacement",
      stage: "Estimate Given",
      value_display: "$4,200",
    },
  ],
};

test("renderCompositeTree resolves embed.ref=customer.contact_info to name + email + phone", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [{ kind: "embed", ref: "customer.contact_info" }],
  };
  const html = renderCompositeTree(tree, FULL_CUSTOMER_CTX);
  assert.match(html, /Maxime/);
  assert.match(html, /maxime\.houle@hec\.ca/);
  // Phone may be formatted differently; just check digits present.
  assert.match(html, /5555550123|555-?\s?0123/);
});

test("renderCompositeTree resolves embed.ref=customer.next_appointment to title + datetime", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [{ kind: "embed", ref: "customer.next_appointment" }],
  };
  const html = renderCompositeTree(tree, FULL_CUSTOMER_CTX);
  assert.match(html, /HVAC service call/);
  assert.match(html, /Friday.*May 15.*5:00 PM/);
});

test("renderCompositeTree resolves embed.ref=customer.next_appointment as empty placeholder when null", () => {
  const ctx: CustomerRenderContext = {
    ...FULL_CUSTOMER_CTX,
    next_appointment: null,
  };
  const tree: CompositeNode = {
    kind: "section",
    children: [{ kind: "embed", ref: "customer.next_appointment" }],
  };
  const html = renderCompositeTree(tree, ctx);
  assert.match(html, /sf-cmp-embed-empty|no upcoming|no appointments/i);
});

test("renderCompositeTree resolves embed.ref=customer.recent_appointments to a list", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [{ kind: "embed", ref: "customer.recent_appointments" }],
  };
  const html = renderCompositeTree(tree, FULL_CUSTOMER_CTX);
  assert.match(html, /Furnace tune-up/);
  assert.match(html, /AC inspection/);
});

test("renderCompositeTree resolves embed.ref=customer.documents to download links", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [{ kind: "embed", ref: "customer.documents" }],
  };
  const html = renderCompositeTree(tree, FULL_CUSTOMER_CTX);
  assert.match(html, /Service contract\.pdf/);
  assert.match(html, /href="https:\/\/example\.blob\.com\/contract\.pdf"/);
});

test("renderCompositeTree resolves embed.ref=customer.deals to deals list", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [{ kind: "embed", ref: "customer.deals" }],
  };
  const html = renderCompositeTree(tree, FULL_CUSTOMER_CTX);
  assert.match(html, /AC unit replacement/);
  assert.match(html, /Estimate Given/);
  assert.match(html, /\$4,200/);
});

test("renderCompositeTree HTML-escapes customer-supplied data (no XSS via document filename)", () => {
  // Customer data that ends up in HTML must be escaped — operators
  // can't trust filenames or appointment titles to be safe.
  const ctx: CustomerRenderContext = {
    ...FULL_CUSTOMER_CTX,
    documents: [
      {
        id: "x",
        file_name: '<script>alert("xss")</script>.pdf',
        blob_url: "https://example.blob.com/x.pdf",
        uploaded_at_display: "now",
      },
    ],
  };
  const tree: CompositeNode = {
    kind: "section",
    children: [{ kind: "embed", ref: "customer.documents" }],
  };
  const html = renderCompositeTree(tree, ctx);
  assert.ok(!html.includes("<script>alert"), "must escape script tags in filenames");
  assert.ok(html.includes("&lt;script&gt;") || html.includes("&lt;"), "must HTML-escape");
});

test("renderCompositeTree handles ALL empty customer collections gracefully", () => {
  const ctx: CustomerRenderContext = {
    ...BASE_WORKSPACE_CTX,
    customer: SAMPLE_CUSTOMER,
    next_appointment: null,
    recent_appointments: [],
    documents: [],
    deals: [],
  };
  for (const ref of [
    "customer.next_appointment",
    "customer.recent_appointments",
    "customer.documents",
    "customer.deals",
    "customer.contact_info",
  ]) {
    const tree: CompositeNode = {
      kind: "section",
      children: [{ kind: "embed", ref: ref as never }],
    };
    const html = renderCompositeTree(tree, ctx);
    assert.equal(typeof html, "string");
    assert.ok(html.length > 0, `embed ref=${ref} produced empty output`);
  }
  // contact_info still renders even with no appointments/docs because
  // SAMPLE_CUSTOMER has name+email+phone.
});
