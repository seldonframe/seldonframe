// Per-client context Phase 1 — tests for the capture path that the deploy
// wizard relies on:
//   1. normalizeClientContext (store) — the persistence "never store {}" guard.
//   2. CreateDeploymentSchema — accepts/threads clientContext, rejects junk.
//   3. createDeployment (store, DI'd) — persists clientContext on the inserted row.
//
// All network-free: the store is exercised via injected deps, the schema is a
// pure zod parse. generateClientContextAction itself is a thin "use server"
// wrapper (org-guard + DI compile + mapSoulToClientContext); its compile→map
// composition is covered by client-context.spec.ts (mapSoulToClientContext) and
// the schema/store tests below. We do not boot Next.js session here.
//
// To run:
//   cd packages/crm
//   node --import tsx --test tests/unit/deployments/generate-client-context.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  createDeployment,
  normalizeClientContext,
  resolveSeededBookingPolicy,
  type CreateDeploymentDeps,
} from "../../../src/lib/deployments/store";
import { CreateDeploymentSchema } from "../../../src/lib/deployments/schema";
import type {
  Deployment,
  DeploymentClientContext,
  NewDeployment,
} from "../../../src/db/schema/deployments";
import type { AgentTemplate } from "../../../src/db/schema/agent-templates";

// ── 1. normalizeClientContext ─────────────────────────────────────────────────

describe("normalizeClientContext", () => {
  test("undefined / empty → undefined (never persist {})", () => {
    assert.equal(normalizeClientContext(undefined), undefined);
    assert.equal(normalizeClientContext({}), undefined);
    assert.equal(normalizeClientContext({ soul: {}, faq: [] }), undefined);
  });

  test("keeps a populated soul + faq, trimming + dropping blanks", () => {
    const out = normalizeClientContext({
      soul: {
        businessName: "  Acme Plumbing  ",
        businessDescription: "  Family-owned  ",
        services: [
          { name: "  Drain cleaning  ", description: "  Fast  " },
          { name: "   ", description: "blank name dropped" },
        ],
      },
      faq: [
        { q: "  Hours?  ", a: "  7-6  " },
        { q: "", a: "blank dropped" },
      ],
    });
    assert.deepEqual(out, {
      soul: {
        businessName: "Acme Plumbing",
        businessDescription: "Family-owned",
        services: [{ name: "Drain cleaning", description: "Fast" }],
      },
      faq: [{ q: "Hours?", a: "7-6" }],
    });
  });

  test("a service with only a name keeps just the name (no empty description key)", () => {
    const out = normalizeClientContext({
      soul: { services: [{ name: "Inspection", description: "   " }] },
    });
    assert.deepEqual(out, { soul: { services: [{ name: "Inspection" }] } });
  });

  test("drops an empty business_hours object but keeps a populated one", () => {
    assert.deepEqual(
      normalizeClientContext({ soul: { businessName: "X", business_hours: {} } }),
      { soul: { businessName: "X" } },
    );
    assert.deepEqual(
      normalizeClientContext({
        soul: { businessName: "X", business_hours: { mon: "9-5" } },
      }),
      { soul: { businessName: "X", business_hours: { mon: "9-5" } } },
    );
  });
});

// ── 2. CreateDeploymentSchema accepts + bounds clientContext ───────────────────

describe("CreateDeploymentSchema — clientContext", () => {
  const base = {
    // A valid RFC-variant v4 UUID (zod v4 enforces the version/variant nibbles).
    agentTemplateId: "11111111-1111-4111-8111-111111111111",
    clientName: "Acme Plumbing",
  };

  test("accepts a well-formed clientContext", () => {
    const parsed = CreateDeploymentSchema.safeParse({
      ...base,
      clientContext: {
        soul: {
          businessName: "Acme",
          businessDescription: "Plumbers",
          services: [{ name: "Drain cleaning", description: "Fast" }],
        },
        faq: [{ q: "Hours?", a: "7-6" }],
      },
    });
    assert.equal(parsed.success, true);
  });

  test("accepts omitted clientContext (optional)", () => {
    assert.equal(CreateDeploymentSchema.safeParse(base).success, true);
  });

  test("rejects unknown keys inside clientContext.soul (strict — no SoulV4 leakage)", () => {
    const parsed = CreateDeploymentSchema.safeParse({
      ...base,
      clientContext: {
        soul: { businessName: "Acme", pricing_config: { enabled: true } },
      },
    });
    assert.equal(parsed.success, false, "pricing_config must be rejected by .strict()");
  });

  test("rejects a service missing a name", () => {
    const parsed = CreateDeploymentSchema.safeParse({
      ...base,
      clientContext: { soul: { services: [{ description: "no name" }] } },
    });
    assert.equal(parsed.success, false);
  });
});

// ── 3. createDeployment persists clientContext ─────────────────────────────────

function fakeTemplate(over: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    id: "tmpl-1",
    builderOrgId: "builder-1",
    name: "Receptionist",
    slug: "receptionist",
    type: "voice-receptionist",
    blueprint: {},
    status: "active",
    evalScore: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as AgentTemplate;
}

describe("createDeployment — clientContext persistence", () => {
  test("threads a populated clientContext onto the inserted row", async () => {
    let inserted: NewDeployment | null = null;
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate(),
      insert: async (values) => {
        inserted = values;
        return { ...(values as object), id: "dep-1" } as Deployment;
      },
    };

    const ctx: DeploymentClientContext = {
      soul: { businessName: "Acme", services: [{ name: "Drain cleaning" }] },
      faq: [{ q: "Hours?", a: "7-6" }],
    };

    const result = await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "Acme Plumbing",
      clientContext: ctx,
      deps,
    });

    assert.equal(result.ok, true);
    assert.ok(inserted, "insert must be called");
    const row: NewDeployment = inserted;
    assert.deepEqual(row.clientContext, ctx);
  });

  test("an empty clientContext persists as undefined (→ null column → name-only)", async () => {
    let inserted: NewDeployment | null = null;
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate(),
      insert: async (values) => {
        inserted = values;
        return { ...(values as object), id: "dep-1" } as Deployment;
      },
    };

    const result = await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "Acme Plumbing",
      clientContext: { soul: {}, faq: [] },
      deps,
    });

    assert.equal(result.ok, true);
    assert.ok(inserted, "insert must be called");
    const row: NewDeployment = inserted;
    assert.equal(row.clientContext, undefined);
  });

  test("no clientContext arg → undefined on the row (unchanged legacy behavior)", async () => {
    let inserted: NewDeployment | null = null;
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate(),
      insert: async (values) => {
        inserted = values;
        return { ...(values as object), id: "dep-1" } as Deployment;
      },
    };

    await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "Acme Plumbing",
      deps,
    });

    assert.ok(inserted, "insert must be called");
    const row: NewDeployment = inserted;
    assert.equal(row.clientContext, undefined);
  });
});

// ── 4. booking_policy seeded from intake at create time ────────────────────────

describe("resolveSeededBookingPolicy", () => {
  const HOURS_MON_FRI = {
    monday: { enabled: true, start: "09:00", end: "17:00" },
    tuesday: { enabled: true, start: "09:00", end: "17:00" },
    wednesday: { enabled: true, start: "09:00", end: "17:00" },
    thursday: { enabled: true, start: "09:00", end: "17:00" },
    friday: { enabled: true, start: "09:00", end: "17:00" },
    saturday: { enabled: false, start: "09:00", end: "17:00" },
    sunday: { enabled: false, start: "09:00", end: "17:00" },
  };

  test("seeds from captured hours when no explicit policy is given", () => {
    const out = resolveSeededBookingPolicy(undefined, {
      soul: { business_hours: HOURS_MON_FRI },
    });
    // The seed is now the per-day `hours` map (one entry per enabled day).
    assert.deepEqual(out, {
      hours: {
        1: { start: "09:00", end: "17:00" },
        2: { start: "09:00", end: "17:00" },
        3: { start: "09:00", end: "17:00" },
        4: { start: "09:00", end: "17:00" },
        5: { start: "09:00", end: "17:00" },
      },
    });
  });

  test("an explicit policy WINS over the intake seed (already-set case)", () => {
    const explicit = { durationMinutes: 60, hours: { 2: { start: "10:00", end: "16:00" } } };
    const out = resolveSeededBookingPolicy(explicit, {
      soul: { business_hours: HOURS_MON_FRI },
    });
    assert.deepEqual(out, explicit);
  });

  test("no hours + no explicit → null (column left null → defaults)", () => {
    assert.equal(resolveSeededBookingPolicy(undefined, undefined), null);
    assert.equal(resolveSeededBookingPolicy(undefined, { soul: {} }), null);
    assert.equal(resolveSeededBookingPolicy({}, undefined), null); // empty explicit ignored
  });
});

describe("createDeployment — booking_policy seed", () => {
  test("seeds booking_policy on the inserted row from captured hours", async () => {
    let inserted: NewDeployment | null = null;
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate(),
      insert: async (values) => {
        inserted = values;
        return { ...(values as object), id: "dep-1" } as Deployment;
      },
    };

    const result = await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "Acme Plumbing",
      clientContext: {
        soul: {
          businessName: "Acme",
          business_hours: {
            monday: { enabled: true, start: "08:00", end: "18:00" },
            tuesday: { enabled: true, start: "08:00", end: "18:00" },
            wednesday: { enabled: true, start: "08:00", end: "18:00" },
            thursday: { enabled: true, start: "08:00", end: "18:00" },
            friday: { enabled: true, start: "08:00", end: "18:00" },
            saturday: { enabled: false, start: "09:00", end: "17:00" },
            sunday: { enabled: false, start: "09:00", end: "17:00" },
          },
        },
      },
      deps,
    });

    assert.equal(result.ok, true);
    assert.ok(inserted, "insert must be called");
    const row: NewDeployment = inserted;
    assert.deepEqual(row.bookingPolicy, {
      hours: {
        1: { start: "08:00", end: "18:00" },
        2: { start: "08:00", end: "18:00" },
        3: { start: "08:00", end: "18:00" },
        4: { start: "08:00", end: "18:00" },
        5: { start: "08:00", end: "18:00" },
      },
    });
  });

  test("no captured hours → bookingPolicy is null on the row", async () => {
    let inserted: NewDeployment | null = null;
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate(),
      insert: async (values) => {
        inserted = values;
        return { ...(values as object), id: "dep-1" } as Deployment;
      },
    };

    await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "Acme Plumbing",
      clientContext: { soul: { businessName: "Acme" } },
      deps,
    });

    const row = inserted as unknown as NewDeployment;
    assert.equal(row.bookingPolicy, null);
  });
});
