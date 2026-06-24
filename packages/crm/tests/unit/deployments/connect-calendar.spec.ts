// Task 9 — client-scoped calendar CONNECT flow.
//
// Two units under test, both DI'd so this runs with NO DB / NO network:
//   1. startCalendarConnect (the "use server" action) — org guard, toolkit
//      validation, no-client-org guard, and the happy-path createConnectLink call
//      (scoped to the CLIENT org, with a callback URL carrying deploymentId +
//      toolkit). The action takes an optional 2nd `deps` arg defaulting to the
//      real getOrgId / getDeployment / createConnectLink.
//   2. resolveCalendarRefFromCallback (the pure security helper the unauthenticated
//      callback route wraps) — persist ONLY when the query-param account id is a
//      REAL, connected account under the deployment's own client-org connections.
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

  test("no_client_org when the client workspace is not provisioned", async () => {
    const res = await startCalendarConnect(
      { deploymentId: "dep_1", toolkit: "googlecalendar" },
      {
        getOrgId: async () => "builder_1",
        getDeployment: async () => deployment({ clientOrgId: null }),
        createConnectLink: async () => ({ redirectUrl: "https://x" }),
      },
    );
    assert.deepEqual(res, { ok: false, error: "no_client_org" });
  });

  test("happy path: scopes the connect link to the CLIENT org + returns redirectUrl", async () => {
    const calls: Array<{ orgId: string; toolkit: string; callbackUrl: string }> = [];
    const res = await startCalendarConnect(
      { deploymentId: "dep_42", toolkit: "googlecalendar" },
      {
        getOrgId: async () => "builder_1",
        getDeployment: async () =>
          deployment({ id: "dep_42", builderOrgId: "builder_1", clientOrgId: "client_99" }),
        createConnectLink: async (orgId, toolkit, callbackUrl) => {
          calls.push({ orgId, toolkit, callbackUrl });
          return { redirectUrl: "https://consent.composio/abc" };
        },
      },
    );

    assert.deepEqual(res, { ok: true, redirectUrl: "https://consent.composio/abc" });
    assert.equal(calls.length, 1);
    // SECURITY: the connect link is scoped to the CLIENT org (the Composio user_id),
    // never the builder's org.
    assert.equal(calls[0].orgId, "client_99");
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
  const dep = deployment({ clientOrgId: "client_1" });

  test("account found + connected under the client org → calendarRef", () => {
    const out = resolveCalendarRefFromCallback({
      deployment: dep,
      toolkit: "googlecalendar",
      status: "ACTIVE",
      accountId: "ca_real",
      connections: [conn({ connectedAccountId: "ca_real", slug: "googlecalendar", connected: true })],
    });
    assert.deepEqual(out, {
      calendarRef: { provider: "googlecalendar", accountId: "ca_real", calendarId: "primary" },
    });
  });

  test("account id NOT in the client org's live connections → error (forged callback)", () => {
    const out = resolveCalendarRefFromCallback({
      deployment: dep,
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
      toolkit: "gmail",
      status: "ACTIVE",
      accountId: "ca_real",
      connections: [conn({ connectedAccountId: "ca_real", slug: "gmail", connected: true })],
    });
    assert.deepEqual(out, { error: "not_verified" });
  });
});
