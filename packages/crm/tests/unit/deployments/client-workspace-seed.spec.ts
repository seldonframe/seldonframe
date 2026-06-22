// Front-office bridge — tests for buildClientWorkspaceInput
// (lib/deployments/client-workspace-seed.ts).
//
// The mapper turns a deployment's captured clientContext (+ clientContact) into
// the STRUCTURED CreateFullWorkspaceInput that createFullWorkspace validates. The
// load-bearing guarantee is that it ALWAYS satisfies createFullWorkspace's
// required-field validator (create-full.ts:161 — non-empty business_name, city,
// state, phone, a NON-EMPTY services[], and business_description), even when the
// captured context is sparse/blank. A workspace that fails validation would
// abort provisioning, so the fallbacks are not cosmetic.
//
// Pure mapper → unit-tested with no DB / network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClientWorkspaceInput } from "../../../src/lib/deployments/client-workspace-seed.ts";

test("maps a full clientContext", () => {
  const input = buildClientWorkspaceInput({
    clientName: "Acme Plumbing",
    clientContext: {
      soul: {
        businessName: "Acme Plumbing",
        businessDescription: "24/7 drain & pipe",
        services: [{ name: "Drain cleaning" }, { name: "Leak repair" }],
        business_hours: { monday: { enabled: true, start: "08:00", end: "17:00" } },
      },
      faq: [{ q: "Hours?", a: "24/7" }],
    },
    clientContact: { phone: "+15125550101", email: "ops@acme.test", address: "12 Main St, Austin, TX" },
  });
  assert.equal(input.business_name, "Acme Plumbing");
  assert.deepEqual(input.services, ["Drain cleaning", "Leak repair"]);
  assert.equal(input.phone, "+15125550101");
  assert.equal(input.email, "ops@acme.test");
  assert.ok(input.business_description.length > 0);
  assert.ok(input.city && input.state); // derived from address or safe default
});

test("guarantees required fields when clientContext is sparse", () => {
  const input = buildClientWorkspaceInput({ clientName: "Bob's Shop", clientContext: null, clientContact: null });
  assert.equal(input.business_name, "Bob's Shop");
  assert.ok(input.services.length >= 1); // non-empty fallback
  assert.ok(input.business_description.length > 0);
  assert.equal(typeof input.city, "string");
  assert.equal(typeof input.state, "string");
  assert.equal(typeof input.phone, "string");
});

// ── extra guards: prove the output ALWAYS passes createFullWorkspace's
//    validator (non-empty trimmed required fields), and that the optional
//    channels + weekly_hours map through correctly. ─────────────────────────

test("every required field is a non-empty trimmed string even on a blank capture", () => {
  const input = buildClientWorkspaceInput({
    clientName: "  Trim Co  ",
    clientContext: { soul: {} },
    clientContact: {},
  });
  // clientName is trimmed into business_name.
  assert.equal(input.business_name, "Trim Co");
  for (const field of [input.business_name, input.city, input.state, input.phone, input.business_description]) {
    assert.equal(typeof field, "string");
    assert.ok(field.trim().length > 0, "required field must be non-empty after trim");
  }
  assert.ok(Array.isArray(input.services) && input.services.length >= 1);
  for (const s of input.services) assert.ok(s.trim().length > 0, "service names are non-empty");
});

test("soul businessName overrides clientName; blank service names are dropped", () => {
  const input = buildClientWorkspaceInput({
    clientName: "Legal Fallback Name",
    clientContext: {
      soul: {
        businessName: "Captured Brand",
        services: [{ name: "  " }, { name: "Roof repair" }, { name: "" }],
      },
    },
    clientContact: null,
  });
  assert.equal(input.business_name, "Captured Brand");
  assert.deepEqual(input.services, ["Roof repair"]);
});

test("parses city + state from a 'Street, City, ST' address", () => {
  const input = buildClientWorkspaceInput({
    clientName: "Geo Co",
    clientContext: null,
    clientContact: { address: "500 Congress Ave, Austin, TX 78701" },
  });
  assert.equal(input.city, "Austin");
  // State is the 2-letter code, uppercased (zip stripped).
  assert.equal(input.state, "TX");
  assert.equal(input.address, "500 Congress Ave, Austin, TX 78701");
});

test("maps weekly_hours from captured business_hours (day → {enabled,start,end})", () => {
  const input = buildClientWorkspaceInput({
    clientName: "Hours Co",
    clientContext: {
      soul: {
        business_hours: {
          monday: { enabled: true, start: "09:00", end: "17:00" },
          sunday: { enabled: false, start: "00:00", end: "00:00" },
          // junk entries must be ignored, never crash:
          notaday: { enabled: true, start: "1", end: "2" },
          tuesday: "closed",
        },
      },
    },
    clientContact: null,
  });
  assert.ok(input.weekly_hours, "weekly_hours present when hours captured");
  assert.deepEqual(input.weekly_hours!.monday, { enabled: true, start: "09:00", end: "17:00" });
  assert.deepEqual(input.weekly_hours!.sunday, { enabled: false, start: "00:00", end: "00:00" });
  // unknown day key dropped; malformed value dropped.
  assert.equal((input.weekly_hours as Record<string, unknown>).notaday, undefined);
  assert.equal((input.weekly_hours as Record<string, unknown>).tuesday, undefined);
});

test("email + address are null when absent (not empty strings)", () => {
  const input = buildClientWorkspaceInput({
    clientName: "No Contact Co",
    clientContext: null,
    clientContact: null,
  });
  assert.equal(input.email, null);
  assert.equal(input.address, null);
  assert.equal(input.weekly_hours, null);
});
