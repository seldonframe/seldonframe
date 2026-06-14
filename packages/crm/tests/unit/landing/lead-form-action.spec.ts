import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  submitLeadFormWithDeps,
  type LeadFormDeps,
} from "@/lib/landing/lead-form-action";

// Each makeDeps call gets a unique timestamp offset by 2 minutes per call so
// the module-level idempotency cache never deduplicates across tests.
let nowCounter = 0;
const BASE_NOW_MS = new Date("2026-06-14T12:00:00.000Z").getTime();
const TTL_SKIP_MS = 2 * 60 * 1000; // 2 min > the 60s dedup window

// A fresh recording-fakes set per test. Defaults model the happy path
// for a brand-new contact in a Twilio-configured workspace.
function makeDeps(overrides: Partial<LeadFormDeps> = {}): {
  deps: LeadFormDeps;
  events: Array<{ type: string; data: Record<string, unknown> }>;
  emails: unknown[];
  smsCalls: Array<{ toNumber: string; body: string }>;
  inserts: Array<Record<string, unknown>>;
  updates: Array<{ id: string; patch: Record<string, unknown> }>;
} {
  const events: Array<{ type: string; data: Record<string, unknown> }> = [];
  const emails: unknown[] = [];
  const smsCalls: Array<{ toNumber: string; body: string }> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  const deps: LeadFormDeps = {
    assertWritable: () => {},
    resolveOrgIdBySlug: async () => "org-1",
    enforceContactLimit: async () => ({ allowed: true, tier: "free" }),
    findContactByPhone: async () => null,
    getContactById: async () => null,
    createContact: async (values) => {
      inserts.push(values);
      return "contact-new";
    },
    updateContact: async (id, patch) => {
      updates.push({ id, patch });
    },
    emit: async (type, data, _orgId) => {
      events.push({ type, data });
    },
    buildBookUrl: () => "https://maloney-plumbing.app.seldonframe.com/book",
    sendSms: async ({ toNumber, body }) => {
      smsCalls.push({ toNumber, body });
      return { suppressed: false };
    },
    sendOperatorEmail: async (p) => {
      emails.push(p);
    },
    getBusinessName: async () => "Maloney Plumbing",
    // Each makeDeps call gets a unique timestamp offset by > the 60s dedup TTL
    // so the module-level idempotency cache never deduplicates across tests.
    now: () => new Date(BASE_NOW_MS + (nowCounter++) * TTL_SKIP_MS),
    ...overrides,
  };
  return { deps, events, emails, smsCalls, inserts, updates };
}

const INPUT = {
  orgSlug: "maloney-plumbing",
  name: "Dana Reyes",
  phone: "(209) 555-0144",
  need: "Burst pipe under the sink",
};

describe("submitLeadFormWithDeps — new contact, Twilio configured", () => {
  test("creates a lead contact, texts the lead, emails the operator, returns ok+smsSent", async () => {
    const { deps, events, emails, smsCalls, inserts } = makeDeps();
    const result = await submitLeadFormWithDeps(INPUT, deps);

    assert.equal(result.ok, true);
    assert.equal(result.smsSent, true);
    assert.equal(result.bookUrl, "https://maloney-plumbing.app.seldonframe.com/book");

    // One contact created, status=lead, source=landing-leadform, need in customFields.
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].orgId, "org-1");
    assert.equal(inserts[0].status, "lead");
    assert.equal(inserts[0].source, "landing-leadform");
    assert.equal(inserts[0].firstName, "Dana");
    assert.equal(inserts[0].lastName, "Reyes");
    assert.deepEqual(inserts[0].customFields, { need: "Burst pipe under the sink" });

    // Both events emitted: contact.created (create) + form.submitted (always).
    const types = events.map((e) => e.type);
    assert.deepEqual(types, ["contact.created", "form.submitted"]);
    assert.deepEqual(events[0].data, { contactId: "contact-new" });
    assert.equal(events[1].data.contactId, "contact-new");
    assert.equal(events[1].data.formId, "landing-leadform");

    // Lead SMS sent to the normalized number, with the book URL in the body.
    assert.equal(smsCalls.length, 1);
    assert.equal(smsCalls[0].toNumber, "+12095550144");
    assert.match(smsCalls[0].body, /maloney-plumbing\.app\.seldonframe\.com\/book/);

    // Operator emailed once.
    assert.equal(emails.length, 1);
  });
});

describe("submitLeadFormWithDeps — existing contact by phone (upsert)", () => {
  test("links existing contact, backfills blank name only, no contact.created", async () => {
    const { deps, events, inserts, updates } = makeDeps({
      findContactByPhone: async () => "contact-existing",
      // Existing contact has no firstName/lastName → name backfills.
      getContactById: async () => ({ firstName: "", lastName: null }),
    });
    const result = await submitLeadFormWithDeps(INPUT, deps);

    assert.equal(result.ok, true);
    // No new insert.
    assert.equal(inserts.length, 0);
    // Name backfilled + need merged into customFields via update.
    assert.equal(updates.length, 1);
    assert.equal(updates[0].id, "contact-existing");
    assert.equal(updates[0].patch.firstName, "Dana");
    assert.equal(updates[0].patch.lastName, "Reyes");
    // Only form.submitted — contact.created is NOT emitted on upsert.
    assert.deepEqual(events.map((e) => e.type), ["form.submitted"]);
  });

  test("does NOT clobber an existing non-blank name", async () => {
    const { deps, updates } = makeDeps({
      findContactByPhone: async () => "contact-existing",
      getContactById: async () => ({ firstName: "Daniela", lastName: "Reyes-Cruz" }),
    });
    await submitLeadFormWithDeps(INPUT, deps);
    // name fields must be absent from the patch (we only set need-related fields).
    const patch = updates[0]?.patch ?? {};
    assert.equal(patch.firstName, undefined);
    assert.equal(patch.lastName, undefined);
  });
});

describe("submitLeadFormWithDeps — SMS graceful skip (no Twilio)", () => {
  test("sendSms throwing leaves contact + operator email intact, smsSent=false", async () => {
    const { deps, events, emails } = makeDeps({
      sendSms: async () => {
        throw new Error("Twilio fromNumber not configured for this workspace");
      },
    });
    const result = await submitLeadFormWithDeps(INPUT, deps);

    assert.equal(result.ok, true);
    assert.equal(result.smsSent, false);
    // Contact + form events still emitted, operator still emailed.
    assert.deepEqual(events.map((e) => e.type), ["contact.created", "form.submitted"]);
    assert.equal(emails.length, 1);
  });
});

describe("submitLeadFormWithDeps — suppressed number", () => {
  test("suppressed result yields smsSent=false without throwing", async () => {
    const { deps } = makeDeps({
      sendSms: async () => ({ suppressed: true }),
    });
    const result = await submitLeadFormWithDeps(INPUT, deps);
    assert.equal(result.ok, true);
    assert.equal(result.smsSent, false);
  });
});

describe("submitLeadFormWithDeps — contact-limit reached", () => {
  test("returns ok=false with the upgrade message; no contact, no SMS", async () => {
    const { deps, inserts, smsCalls, events } = makeDeps({
      enforceContactLimit: async () => ({
        allowed: false,
        tier: "free",
        reason: "contact_limit_reached",
        message: "You've reached 50 contacts on the Free plan. Upgrade to Growth to keep adding clients.",
        upgradeUrl: "/settings/billing",
        used: 50,
        limit: 50,
      }),
      // limit is checked only when the contact doesn't already exist.
      findContactByPhone: async () => null,
    });
    const result = await submitLeadFormWithDeps(INPUT, deps);

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /Free plan|Upgrade/i);
    assert.equal(inserts.length, 0);
    assert.equal(smsCalls.length, 0);
    assert.deepEqual(events, []);
  });
});

describe("submitLeadFormWithDeps — validation + unknown org", () => {
  beforeEach(() => {});

  test("missing name/phone returns ok=false without side effects", async () => {
    const { deps, inserts } = makeDeps();
    const result = await submitLeadFormWithDeps(
      { orgSlug: "x", name: "  ", phone: "", need: "Z" },
      deps,
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /name and phone/i);
    assert.equal(inserts.length, 0);
  });

  test("unknown org returns ok=false", async () => {
    const { deps } = makeDeps({ resolveOrgIdBySlug: async () => null });
    const result = await submitLeadFormWithDeps(INPUT, deps);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /not found/i);
  });
});
