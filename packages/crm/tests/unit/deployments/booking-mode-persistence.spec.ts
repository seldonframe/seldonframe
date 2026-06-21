// ICP-3 — booking-mode persistence (deploy wizard → schema → store).
//
// The deploy wizard lets the operator choose how a deployed agent books
// (native | external_link | api_mcp | cal_com) + optionally a client booking URL.
// This locks the two persistence seams the UI relies on:
//   1. CreateDeploymentSchema accepts bookingMode + externalBookingUrl, defaults
//      to native, and REQUIRES a non-empty URL when bookingMode === 'external_link'.
//   2. createDeployment (store, DI'd) threads both fields onto the inserted row.
//
// Network-free: the schema is a pure zod parse; the store runs via injected deps.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { CreateDeploymentSchema } from "../../../src/lib/deployments/schema";
import {
  createDeployment,
  type CreateDeploymentDeps,
} from "../../../src/lib/deployments/store";
import type {
  Deployment,
  NewDeployment,
} from "../../../src/db/schema/deployments";
import type { AgentTemplate } from "../../../src/db/schema/agent-templates";

const BASE = {
  // RFC-variant v4 UUID (zod v4 enforces version/variant nibbles).
  agentTemplateId: "11111111-1111-4111-8111-111111111111",
  clientName: "Acme Plumbing",
};

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

// ── 1. CreateDeploymentSchema — bookingMode + externalBookingUrl ───────────────

describe("CreateDeploymentSchema — bookingMode", () => {
  test("defaults bookingMode to native when omitted", () => {
    const parsed = CreateDeploymentSchema.safeParse(BASE);
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.bookingMode, "native");
  });

  test("accepts external_link WITH a valid url", () => {
    const parsed = CreateDeploymentSchema.safeParse({
      ...BASE,
      bookingMode: "external_link",
      externalBookingUrl: "https://book.acme.test/x",
    });
    assert.equal(parsed.success, true);
  });

  test("REJECTS external_link without a url", () => {
    const parsed = CreateDeploymentSchema.safeParse({
      ...BASE,
      bookingMode: "external_link",
    });
    assert.equal(parsed.success, false, "external_link demands a booking URL");
  });

  test("REJECTS external_link with an empty/garbage url", () => {
    const empty = CreateDeploymentSchema.safeParse({
      ...BASE,
      bookingMode: "external_link",
      externalBookingUrl: "",
    });
    assert.equal(empty.success, false);
    const garbage = CreateDeploymentSchema.safeParse({
      ...BASE,
      bookingMode: "external_link",
      externalBookingUrl: "not-a-url",
    });
    assert.equal(garbage.success, false);
  });

  test("accepts the coming-soon modes without a url", () => {
    for (const mode of ["api_mcp", "cal_com"] as const) {
      const parsed = CreateDeploymentSchema.safeParse({ ...BASE, bookingMode: mode });
      assert.equal(parsed.success, true, `${mode} accepted`);
    }
  });

  test("rejects an unknown bookingMode", () => {
    const parsed = CreateDeploymentSchema.safeParse({ ...BASE, bookingMode: "telepathy" });
    assert.equal(parsed.success, false);
  });
});

// ── 2. createDeployment threads bookingMode + externalBookingUrl ───────────────

describe("createDeployment — booking-mode persistence", () => {
  test("persists external_link + url on the inserted row", async () => {
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
      bookingMode: "external_link",
      externalBookingUrl: "https://book.acme.test/x",
      deps,
    });

    assert.equal(result.ok, true);
    assert.ok(inserted, "insert must be called");
    const row: NewDeployment = inserted;
    assert.equal(row.bookingMode, "external_link");
    assert.equal(row.externalBookingUrl, "https://book.acme.test/x");
  });

  test("defaults to native + null url when not supplied (legacy behavior preserved)", async () => {
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
    assert.equal(row.bookingMode, "native");
    // A native deployment never carries a URL.
    assert.equal(row.externalBookingUrl ?? null, null);
  });

  test("drops a stray externalBookingUrl when mode is native", async () => {
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
      bookingMode: "native",
      externalBookingUrl: "https://book.acme.test/x",
      deps,
    });

    assert.ok(inserted, "insert must be called");
    const row: NewDeployment = inserted;
    assert.equal(row.bookingMode, "native");
    // The URL is only meaningful for external_link — native must not persist one.
    assert.equal(row.externalBookingUrl ?? null, null);
  });
});
