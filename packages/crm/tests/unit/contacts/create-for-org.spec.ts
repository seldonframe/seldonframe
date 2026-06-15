import { test } from "node:test";
import assert from "node:assert/strict";
import { createContactForOrg, type CreateContactForOrgDeps } from "../../../src/lib/contacts/create-for-org";

test("createContactForOrg inserts under the given orgId and returns an id", async () => {
  let insertedOrgId: string | null = null;

  const deps: CreateContactForOrgDeps = {
    insertContact: async (values) => {
      insertedOrgId = values.orgId;
      return { id: "new-contact-id" };
    },
    emitContactCreated: async (_contactId, _orgId) => { /* no-op */ },
    inferLifecycle: async (_opts) => { /* no-op */ },
  };

  const result = await createContactForOrg(
    {
      orgId: "org-abc",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "+15550001234",
      status: "lead",
      source: "operator_portal",
    },
    deps
  );

  assert.equal(result.id, "new-contact-id");
  assert.equal(insertedOrgId, "org-abc");
});

test("createContactForOrg returns null id when insert returns nothing", async () => {
  const deps: CreateContactForOrgDeps = {
    insertContact: async (_values) => null,
    emitContactCreated: async (_contactId, _orgId) => { /* no-op */ },
    inferLifecycle: async (_opts) => { /* no-op */ },
  };

  const result = await createContactForOrg(
    { orgId: "org-xyz", firstName: "Bob", lastName: null, email: null, phone: null, status: "lead", source: "manual" },
    deps
  );

  assert.equal(result.id, null);
});

test("createContactForOrg does not call emitContactCreated when no id returned", async () => {
  let emitCalled = false;

  const deps: CreateContactForOrgDeps = {
    insertContact: async (_values) => null,
    emitContactCreated: async (_contactId, _orgId) => { emitCalled = true; },
    inferLifecycle: async (_opts) => { /* no-op */ },
  };

  await createContactForOrg(
    { orgId: "org-xyz", firstName: "Bob", lastName: null, email: null, phone: null, status: "lead", source: "manual" },
    deps
  );

  assert.equal(emitCalled, false);
});
