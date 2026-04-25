// Unit tests for src/blocks/crm.tools.ts — validates that the 13 CRM
// tool Zod schemas parse representative inputs correctly, reject bad
// inputs, and carry the expected emit events. Ships with C4 per Max's
// "tests alongside code" directive.
//
// This is NOT a tools.js round-trip test — tools.js itself is not
// imported here (it's a JS MCP server surface that runs against a live
// API). The goal here is to confirm the Zod schemas model the tool
// contract correctly on their own.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  CRM_TOOLS,
  createActivity,
  createContact,
  createDeal,
  deleteContact,
  deleteDeal,
  getContact,
  getDeal,
  listActivities,
  listContacts,
  listDeals,
  moveDealStage,
  updateContact,
  updateDeal,
} from "../../src/blocks/crm.tools";

// ---------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------

describe("CRM_TOOLS enumeration", () => {
  test("exports exactly 13 tools (5 contacts + 6 deals + 2 activities)", () => {
    assert.equal(CRM_TOOLS.length, 13);
  });

  test("all tool names are unique and match snake_case", () => {
    const names = CRM_TOOLS.map((t) => t.name);
    assert.equal(new Set(names).size, names.length, "duplicate tool names");
    for (const name of names) {
      assert.match(name, /^[a-z][a-z0-9_]*$/, `tool name ${name} must be snake_case`);
    }
  });

  test("every emit is a dot-notation event name", () => {
    for (const tool of CRM_TOOLS) {
      for (const event of tool.emits) {
        assert.match(event, /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, `bad emit ${event} on ${tool.name}`);
      }
    }
  });

  test("emit events are drawn only from CRM's produces list", () => {
    // CRM's produces per crm.block.md: contact.created, contact.updated, deal.stage_changed.
    // Tools cannot emit events outside their block's produces list.
    const allowed = new Set(["contact.created", "contact.updated", "deal.stage_changed"]);
    for (const tool of CRM_TOOLS) {
      for (const event of tool.emits) {
        assert.ok(allowed.has(event), `tool ${tool.name} emits ${event} not in CRM produces`);
      }
    }
  });
});

// ---------------------------------------------------------------------
// Contact tools
// ---------------------------------------------------------------------

describe("create_contact args", () => {
  test("accepts a minimal valid payload (first_name only)", () => {
    assert.equal(createContact.args.safeParse({ first_name: "Jane" }).success, true);
  });

  test("accepts a full payload with email and status", () => {
    const result = createContact.args.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@acme.co",
      status: "lead",
      source: "intake-form",
    });
    assert.equal(result.success, true);
  });

  test("rejects missing first_name", () => {
    assert.equal(createContact.args.safeParse({ email: "x@y.com" }).success, false);
  });

  test("rejects invalid email", () => {
    assert.equal(
      createContact.args.safeParse({ first_name: "Jane", email: "not-an-email" }).success,
      false,
    );
  });

  test("rejects status outside the allowed enum", () => {
    assert.equal(
      createContact.args.safeParse({ first_name: "Jane", status: "nurture" }).success,
      false,
    );
  });

  test("emits contact.created", () => {
    assert.deepEqual(createContact.emits, ["contact.created"]);
  });
});

describe("get_contact args", () => {
  test("accepts a valid uuid", () => {
    assert.equal(
      getContact.args.safeParse({ contact_id: "123e4567-e89b-12d3-a456-426614174000" }).success,
      true,
    );
  });

  test("rejects a non-uuid contact_id", () => {
    assert.equal(getContact.args.safeParse({ contact_id: "abc" }).success, false);
  });

  test("rejects missing contact_id", () => {
    assert.equal(getContact.args.safeParse({}).success, false);
  });

  test("emits [] (read-only)", () => {
    assert.deepEqual(getContact.emits, []);
  });
});

describe("update_contact args", () => {
  test("accepts a partial update with only contact_id + status", () => {
    assert.equal(
      updateContact.args.safeParse({
        contact_id: "123e4567-e89b-12d3-a456-426614174000",
        status: "customer",
      }).success,
      true,
    );
  });

  test("rejects when status is outside allowed enum", () => {
    assert.equal(
      updateContact.args.safeParse({
        contact_id: "123e4567-e89b-12d3-a456-426614174000",
        status: "cold",
      }).success,
      false,
    );
  });

  test("emits contact.updated", () => {
    assert.deepEqual(updateContact.emits, ["contact.updated"]);
  });
});

describe("delete_contact args", () => {
  test("accepts a valid uuid", () => {
    assert.equal(
      deleteContact.args.safeParse({ contact_id: "123e4567-e89b-12d3-a456-426614174000" }).success,
      true,
    );
  });

  test("emits [] (delete does not surface a typed event today)", () => {
    assert.deepEqual(deleteContact.emits, []);
  });
});

describe("list_contacts args", () => {
  test("accepts an empty payload", () => {
    assert.equal(listContacts.args.safeParse({}).success, true);
  });

  test("accepts an optional workspace_id uuid", () => {
    assert.equal(
      listContacts.args.safeParse({ workspace_id: "123e4567-e89b-12d3-a456-426614174000" }).success,
      true,
    );
  });
});

// ---------------------------------------------------------------------
// Deal tools
// ---------------------------------------------------------------------

describe("create_deal args", () => {
  test("accepts contact_id + title minimum", () => {
    assert.equal(
      createDeal.args.safeParse({
        contact_id: "123e4567-e89b-12d3-a456-426614174000",
        title: "Q2 retainer",
      }).success,
      true,
    );
  });

  test("rejects missing title", () => {
    assert.equal(
      createDeal.args.safeParse({ contact_id: "123e4567-e89b-12d3-a456-426614174000" }).success,
      false,
    );
  });

  test("rejects value < 0", () => {
    assert.equal(
      createDeal.args.safeParse({
        contact_id: "123e4567-e89b-12d3-a456-426614174000",
        title: "x",
        value: -100,
      }).success,
      false,
    );
  });

  test("rejects probability outside [0, 100]", () => {
    const base = { contact_id: "123e4567-e89b-12d3-a456-426614174000", title: "x" };
    assert.equal(createDeal.args.safeParse({ ...base, probability: -1 }).success, false);
    assert.equal(createDeal.args.safeParse({ ...base, probability: 101 }).success, false);
    assert.equal(createDeal.args.safeParse({ ...base, probability: 50 }).success, true);
  });
});

describe("update_deal args", () => {
  test("accepts partial updates", () => {
    assert.equal(
      updateDeal.args.safeParse({
        deal_id: "123e4567-e89b-12d3-a456-426614174000",
        value: 7500,
      }).success,
      true,
    );
  });

  test("emits deal.stage_changed (may fire conditionally when stage changes)", () => {
    assert.deepEqual(updateDeal.emits, ["deal.stage_changed"]);
  });
});

describe("move_deal_stage args", () => {
  test("accepts deal_id + to_stage", () => {
    assert.equal(
      moveDealStage.args.safeParse({
        deal_id: "123e4567-e89b-12d3-a456-426614174000",
        to_stage: "Proposal",
      }).success,
      true,
    );
  });

  test("rejects empty to_stage", () => {
    assert.equal(
      moveDealStage.args.safeParse({
        deal_id: "123e4567-e89b-12d3-a456-426614174000",
        to_stage: "",
      }).success,
      false,
    );
  });

  test("emits deal.stage_changed", () => {
    assert.deepEqual(moveDealStage.emits, ["deal.stage_changed"]);
  });
});

describe("list_deals / get_deal / delete_deal args", () => {
  test("list_deals accepts empty", () => {
    assert.equal(listDeals.args.safeParse({}).success, true);
  });

  test("get_deal requires a uuid deal_id", () => {
    assert.equal(getDeal.args.safeParse({ deal_id: "not-a-uuid" }).success, false);
    assert.equal(
      getDeal.args.safeParse({ deal_id: "123e4567-e89b-12d3-a456-426614174000" }).success,
      true,
    );
  });

  test("delete_deal requires a uuid deal_id", () => {
    assert.equal(
      deleteDeal.args.safeParse({ deal_id: "123e4567-e89b-12d3-a456-426614174000" }).success,
      true,
    );
  });
});

// ---------------------------------------------------------------------
// Activity tools
// ---------------------------------------------------------------------

describe("create_activity args", () => {
  test("accepts a contact-scoped activity with subject only", () => {
    assert.equal(
      createActivity.args.safeParse({
        contact_id: "123e4567-e89b-12d3-a456-426614174000",
        type: "agent_action",
        subject: "Speed-to-Lead agent booked consult",
      }).success,
      true,
    );
  });

  test("accepts a deal-scoped activity with body only", () => {
    assert.equal(
      createActivity.args.safeParse({
        deal_id: "123e4567-e89b-12d3-a456-426614174000",
        type: "note",
        body: "Discussed Q3 renewal terms",
      }).success,
      true,
    );
  });

  test("rejects when both contact_id and deal_id are missing", () => {
    const result = createActivity.args.safeParse({ type: "note", subject: "x" });
    assert.equal(result.success, false);
  });

  test("rejects when both subject and body are missing", () => {
    const result = createActivity.args.safeParse({
      contact_id: "123e4567-e89b-12d3-a456-426614174000",
      type: "note",
    });
    assert.equal(result.success, false);
  });

  test("rejects type outside allowed enum", () => {
    assert.equal(
      createActivity.args.safeParse({
        contact_id: "123e4567-e89b-12d3-a456-426614174000",
        type: "brainstorm",
        subject: "x",
      }).success,
      false,
    );
  });

  test("accepts optional metadata record", () => {
    assert.equal(
      createActivity.args.safeParse({
        contact_id: "123e4567-e89b-12d3-a456-426614174000",
        type: "agent_action",
        subject: "x",
        metadata: { agentId: "agt_123", confidence: 0.87 },
      }).success,
      true,
    );
  });
});

describe("list_activities args", () => {
  test("accepts an empty payload", () => {
    assert.equal(listActivities.args.safeParse({}).success, true);
  });
});
