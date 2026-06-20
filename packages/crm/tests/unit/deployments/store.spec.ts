// ICP-3 — TDD tests for the deployments data layer (the lite-tenant store).
//
// Covers the createDeployment / updateDeployment orchestration via injected
// deps (DI convention — see agent-templates/store.spec.ts) plus the pure
// normalizeClientContact helper. NO DB: deps are fakes. Asserts the core
// invariants of this task:
//   - createDeployment writes status:'draft' ONLY (no provisioning/billing).
//   - ownership guard: the template must belong to the builder.
//   - contact normalization drops blanks.
//   - updateDeployment validates surface/status + bumps updatedAt.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  createDeployment,
  updateDeployment,
  normalizeClientContact,
  type CreateDeploymentDeps,
  type UpdateDeploymentDeps,
} from "../../../src/lib/deployments/store";
import type { Deployment } from "../../../src/db/schema/deployments";
import type { AgentTemplate } from "../../../src/db/schema/agent-templates";

// ── fixtures ──────────────────────────────────────────────────────────

function fakeTemplate(over: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    id: "tmpl-1",
    builderOrgId: "builder-1",
    name: "HVAC Front Desk",
    slug: "hvac-front-desk",
    type: "voice_receptionist",
    blueprint: { archetype: "voice-receptionist" },
    status: "draft",
    evalScore: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as AgentTemplate;
}

function fakeDeployment(over: Partial<Deployment> = {}): Deployment {
  return {
    id: "dep-1",
    builderOrgId: "builder-1",
    agentTemplateId: "tmpl-1",
    clientName: "Acme Plumbing",
    clientContact: null,
    surface: "phone",
    phoneNumber: null,
    calendarRef: null,
    priceCents: 9900,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Deployment;
}

// ── normalizeClientContact (pure) ─────────────────────────────────────

describe("normalizeClientContact", () => {
  test("trims fields and drops blanks", () => {
    assert.deepEqual(
      normalizeClientContact({ phone: "  555-1212 ", email: "  ", address: "" }),
      { phone: "555-1212" },
    );
  });

  test("returns undefined when nothing remains", () => {
    assert.equal(normalizeClientContact({ phone: "  ", email: "" }), undefined);
    assert.equal(normalizeClientContact(undefined), undefined);
  });

  test("keeps all three when present", () => {
    assert.deepEqual(
      normalizeClientContact({
        phone: "555",
        email: "a@b.co",
        address: "1 Main St",
      }),
      { phone: "555", email: "a@b.co", address: "1 Main St" },
    );
  });
});

// ── createDeployment (DI) ─────────────────────────────────────────────

describe("createDeployment", () => {
  test("inserts a DRAFT row (no provisioning/billing) for an owned template", async () => {
    let inserted: Record<string, unknown> | null = null;
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate(),
      insert: async (values) => {
        inserted = values as Record<string, unknown>;
        return fakeDeployment({
          clientName: values.clientName,
          surface: values.surface as Deployment["surface"],
          priceCents: values.priceCents ?? 0,
        });
      },
    };

    const result = await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "  Acme Plumbing  ",
      clientContact: { phone: " 555 ", email: "" },
      surface: "phone",
      priceCents: 9900,
      deps,
    });

    assert.equal(result.ok, true);
    assert.ok(inserted, "insert must be called");
    const vals = inserted as Record<string, unknown>;
    assert.equal(vals.builderOrgId, "builder-1");
    assert.equal(vals.agentTemplateId, "tmpl-1");
    assert.equal(vals.clientName, "Acme Plumbing", "name trimmed");
    assert.equal(vals.surface, "phone");
    assert.equal(vals.priceCents, 9900);
    assert.equal(vals.status, "draft", "MUST be draft — no activation here");
    assert.deepEqual(vals.clientContact, { phone: "555" }, "contact normalized");
    // Provisioning/billing fields must NOT be set by create.
    assert.equal(vals.phoneNumber, undefined, "no phone number provisioned");
    assert.equal(vals.stripeSubscriptionId, undefined, "no Stripe subscription");
    assert.equal(vals.stripeCustomerId, undefined, "no Stripe customer");
  });

  test("defaults surface to 'phone' and price to 0", async () => {
    let inserted: Record<string, unknown> | null = null;
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate(),
      insert: async (values) => {
        inserted = values as Record<string, unknown>;
        return fakeDeployment();
      },
    };
    await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "Acme",
      deps,
    });
    assert.ok(inserted, "insert must be called");
    const vals = inserted as Record<string, unknown>;
    assert.equal(vals.surface, "phone");
    assert.equal(vals.priceCents, 0);
  });

  test("ownership guard: rejects a template owned by a DIFFERENT builder", async () => {
    let insertCalled = false;
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate({ builderOrgId: "someone-else" }),
      insert: async () => {
        insertCalled = true;
        return fakeDeployment();
      },
    };
    const result = await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "Acme",
      deps,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "template_not_found");
    assert.equal(insertCalled, false, "must not insert when ownership fails");
  });

  test("rejects a missing template", async () => {
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => null,
      insert: async () => fakeDeployment(),
    };
    const result = await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "nope",
      clientName: "Acme",
      deps,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "template_not_found");
  });

  test("requires a builderOrgId and a 2+ char client name", async () => {
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate(),
      insert: async () => fakeDeployment(),
    };
    const noOrg = await createDeployment({
      builderOrgId: "",
      agentTemplateId: "tmpl-1",
      clientName: "Acme",
      deps,
    });
    assert.equal(noOrg.ok, false);
    if (!noOrg.ok) assert.equal(noOrg.error, "unauthorized");

    const shortName = await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: " x ",
      deps,
    });
    assert.equal(shortName.ok, false);
    if (!shortName.ok) assert.equal(shortName.error, "invalid_input");
  });

  test("clamps a negative price to 0", async () => {
    let inserted: Record<string, unknown> | null = null;
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate(),
      insert: async (values) => {
        inserted = values as Record<string, unknown>;
        return fakeDeployment();
      },
    };
    await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "Acme",
      priceCents: -500,
      deps,
    });
    assert.ok(inserted, "insert must be called");
    assert.equal((inserted as Record<string, unknown>).priceCents, 0);
  });
});

// ── updateDeployment (DI) ─────────────────────────────────────────────

describe("updateDeployment", () => {
  test("patches provided fields and bumps updatedAt", async () => {
    let updateArgs: { id: string; patch: Record<string, unknown> } | null = null;
    const deps: UpdateDeploymentDeps = {
      findById: async () => fakeDeployment(),
      update: async (id, patch) => {
        updateArgs = { id, patch: patch as Record<string, unknown> };
        return fakeDeployment({ status: (patch.status as Deployment["status"]) ?? "draft" });
      },
    };
    const result = await updateDeployment({
      id: "dep-1",
      patch: { status: "paused", priceCents: 12000 },
      deps,
    });
    assert.equal(result.ok, true);
    assert.ok(updateArgs, "update must be called");
    const args = updateArgs as { id: string; patch: Record<string, unknown> };
    assert.equal(args.id, "dep-1");
    assert.equal(args.patch.status, "paused");
    assert.equal(args.patch.priceCents, 12000);
    assert.ok(args.patch.updatedAt instanceof Date, "updatedAt bumped");
  });

  test("rejects an unknown status / surface", async () => {
    const deps: UpdateDeploymentDeps = {
      findById: async () => fakeDeployment(),
      update: async () => fakeDeployment(),
    };
    const badStatus = await updateDeployment({
      id: "dep-1",
      patch: { status: "live" as never },
      deps,
    });
    assert.equal(badStatus.ok, false);
    if (!badStatus.ok) assert.equal(badStatus.error, "invalid_input");

    const badSurface = await updateDeployment({
      id: "dep-1",
      patch: { surface: "sms" as never },
      deps,
    });
    assert.equal(badSurface.ok, false);
  });

  test("returns deployment_not_found when the row is missing", async () => {
    const deps: UpdateDeploymentDeps = {
      findById: async () => null,
      update: async () => {
        throw new Error("update should not be called");
      },
    };
    const result = await updateDeployment({ id: "nope", patch: { status: "active" }, deps });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "deployment_not_found");
  });
});
