// Task 9 — calendar CONNECT flow (agency-key + per-deployment-entity).
//
// Two units under test, both DI'd so this runs with NO DB / NO network:
//   1. startCalendarConnect (the "use server" action) — org guard, toolkit
//      validation, and the happy-path createConnectLink call (scoped to the
//      AGENCY org = the Composio KEY, with { entityUserId: deploymentId } = the
//      Composio ENTITY, and a callback URL carrying deploymentId + toolkit). The
//      action takes an optional 2nd `deps` arg defaulting to the real getOrgId /
//      getDeployment / createConnectLink.
//   2. resolveCalendarRefFromCallback (the pure security helper the unauthenticated
//      callback route wraps) — persist ONLY when the query-param account id is a
//      REAL, connected account under the deployment ENTITY's own connections, and
//      stamp the persisted ref with ownerOrgId (agency) + entityUserId (deployment).
//
// Run:
//   node --import tsx --test tests/unit/deployments/connect-calendar.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { startCalendarConnect } from "../../../src/lib/deployments/connect-calendar";
import { resolveCalendarRefFromCallback } from "../../../src/app/api/deployments/[id]/calendar/callback/route";
import type { Deployment } from "../../../src/db/schema/deployments";
import type { ToolkitConnection } from "../../../src/lib/integrations/composio/client";

// A minimal Deployment fixture — only the fields the units read.
function deployment(over: Partial<Deployment>): Deployment {
  return {
    id: "dep_1",
    builderOrgId: "builder_1",
    clientOrgId: "client_1",
    calendarRef: null,
    ...over,
  } as Deployment;
}

function conn(over: Partial<ToolkitConnection>): ToolkitConnection {
  return {
    slug: "googlecalendar",
    name: "Google Calendar",
    logo: null,
    connected: true,
    connectedAccountId: "ca_real",
    ...over,
  };
}

// ── 1. startCalendarConnect ───────────────────────────────────────────────────

describe("startCalendarConnect", () => {
  test("unauthorized when there is no logged-in org", async () => {
    const res = await startCalendarConnect(
      { deploymentId: "dep_1", toolkit: "googlecalendar" },
      {
        getOrgId: async () => null,
        getDeployment: async () => deployment({}),
        createConnectLink: async () => ({ redirectUrl: "https://x" }),
      },
    );
    assert.deepEqual(res, { ok: false, error: "unauthorized" });
  });

  test("invalid_toolkit for an off-list toolkit", async () => {
    const res = await startCalendarConnect(
      // @ts-expect-error — deliberately invalid toolkit at the boundary.
      { deploymentId: "dep_1", toolkit: "gmail" },
      {
        getOrgId: async () => "builder_1",
        getDeployment: async () => deployment({}),
        createConnectLink: async () => ({ redirectUrl: "https://x" }),
      },
    );
    assert.deepEqual(res, { ok: false, error: "invalid_toolkit" });
  });

  test("not_found when the deployment is missing", async () => {
    const res = await startCalendarConnect(
      { deploymentId: "dep_1", toolkit: "googlecalendar" },
      {
        getOrgId: async () => "builder_1",
        getDeployment: async () => null,
        createConnectLink: async () => ({ redirectUrl: "https://x" }),
      },
    );
    assert.deepEqual(res, { ok: false, error: "not_found" });
  });

  test("not_found on builder mismatch (org guard)", async () => {
    const res = await startCalendarConnect(
      { deploymentId: "dep_1", toolkit: "googlecalendar" },
      {
        getOrgId: async () => "builder_1",
        getDeployment: async () => deployment({ builderOrgId: "someone_else" }),
        createConnectLink: async () => ({ redirectUrl: "https://x" }),
      },
    );
    assert.deepEqual(res, { ok: false, error: "not_found" });
  });

  test("happy path: scopes the connect link to the AGENCY key + deployment entity", async () => {
    const calls: Array<{
      orgId: string;
      toolkit: string;
      callbackUrl: string;
      entityUserId?: string | null;
    }> = [];
    // clientOrgId is null on purpose — prod Studio deployments never provision a
    // client workspace, and the connect must work anyway.
    const res = await startCalendarConnect(
      { deploymentId: "dep_42", toolkit: "googlecalendar" },
      {
        getOrgId: async () => "builder_1",
        getDeployment: async () =>
          deployment({ id: "dep_42", builderOrgId: "builder_1", clientOrgId: null }),
        createConnectLink: async (orgId, toolkit, callbackUrl, opts) => {
          calls.push({ orgId, toolkit, callbackUrl, entityUserId: opts?.entityUserId });
          return { redirectUrl: "https://consent.composio/abc" };
        },
      },
    );

    assert.deepEqual(res, { ok: true, redirectUrl: "https://consent.composio/abc" });
    assert.equal(calls.length, 1);
    // KEY = the agency (builder) org; ENTITY (Composio user_id) = the deployment id.
    assert.equal(calls[0].orgId, "builder_1");
    assert.equal(calls[0].entityUserId, "dep_42");
    assert.equal(calls[0].toolkit, "googlecalendar");
    // Callback carries the deployment id + toolkit so the callback can re-scope.
    assert.ok(
      calls[0].callbackUrl.includes("/api/deployments/dep_42/calendar/callback"),
      `callbackUrl had path: ${calls[0].callbackUrl}`,
    );
    assert.ok(
      calls[0].callbackUrl.includes("toolkit=googlecalendar"),
      `callbackUrl had toolkit: ${calls[0].callbackUrl}`,
    );
  });

  test("connect_failed when Composio returns no redirect URL", async () => {
    const res = await startCalendarConnect(
      { deploymentId: "dep_1", toolkit: "outlook" },
      {
        getOrgId: async () => "builder_1",
        getDeployment: async () => deployment({}),
        createConnectLink: async () => ({ redirectUrl: null }),
      },
    );
    assert.deepEqual(res, { ok: false, error: "connect_failed" });
  });
});

// ── 2. resolveCalendarRefFromCallback (pure security helper) ──────────────────

describe("resolveCalendarRefFromCallback", () => {
  const dep = deployment({ builderOrgId: "builder_1" });

  test("account found + connected under the deployment entity → calendarRef (stamped owner + entity)", () => {
    const out = resolveCalendarRefFromCallback({
      deployment: dep,
      entityUserId: "dep_1",
      toolkit: "googlecalendar",
      status: "ACTIVE",
      accountId: "ca_real",
      connections: [conn({ connectedAccountId: "ca_real", slug: "googlecalendar", connected: true })],
    });
    assert.deepEqual(out, {
      calendarRef: {
        provider: "googlecalendar",
        accountId: "ca_real",
        calendarId: "primary",
        // ownerOrgId = the agency (Composio key); entityUserId = the deployment.
        ownerOrgId: "builder_1",
        entityUserId: "dep_1",
      },
    });
  });

  test("account id NOT in the deployment entity's live connections → error (forged callback)", () => {
    const out = resolveCalendarRefFromCallback({
      deployment: dep,
      entityUserId: "dep_1",
      toolkit: "googlecalendar",
      status: "ACTIVE",
      accountId: "ca_forged",
      connections: [conn({ connectedAccountId: "ca_real", slug: "googlecalendar", connected: true })],
    });
    assert.deepEqual(out, { error: "not_verified" });
  });

  test("missing account id → error", () => {
    const out = resolveCalendarRefFromCallback({
      deployment: dep,
      entityUserId: "dep_1",
      toolkit: "googlecalendar",
      status: "ACTIVE",
      accountId: null,
      connections: [conn({ connectedAccountId: "ca_real" })],
    });
    assert.deepEqual(out, { error: "not_verified" });
  });

  test("matching id but not connected (isActive false) → error", () => {
    const out = resolveCalendarRefFromCallback({
      deployment: dep,
      entityUserId: "dep_1",
      toolkit: "googlecalendar",
      status: "ACTIVE",
      accountId: "ca_real",
      connections: [conn({ connectedAccountId: "ca_real", slug: "googlecalendar", connected: false })],
    });
    assert.deepEqual(out, { error: "not_verified" });
  });

  test("matching id + connected but WRONG toolkit slug → error", () => {
    const out = resolveCalendarRefFromCallback({
      deployment: dep,
      entityUserId: "dep_1",
      toolkit: "outlook",
      status: "ACTIVE",
      accountId: "ca_real",
      connections: [conn({ connectedAccountId: "ca_real", slug: "googlecalendar", connected: true })],
    });
    assert.deepEqual(out, { error: "not_verified" });
  });

  test("invalid toolkit in the callback param → error (never persists)", () => {
    const out = resolveCalendarRefFromCallback({
      deployment: dep,
      entityUserId: "dep_1",
      toolkit: "gmail",
      status: "ACTIVE",
      accountId: "ca_real",
      connections: [conn({ connectedAccountId: "ca_real", slug: "gmail", connected: true })],
    });
    assert.deepEqual(out, { error: "not_verified" });
  });
});
