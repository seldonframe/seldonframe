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
import {
  safeBuyerReturnTo,
  resolveCalendarCallbackRedirect,
} from "../../../src/lib/deployments/calendar-return";
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

// ── 3. safeBuyerReturnTo (Bug 1 — buyer wizard returnTo validation) ───────────
//
// The buyer's connect-calendar threads a `returnTo` so the OAuth callback lands
// back on the wizard (NOT the agency Clients page). It MUST be an internal buyer
// `/agent/...` path — anything else (a foreign host, a non-/agent path, scheme
// tricks) is rejected so the callback falls back to the safe agency default.

describe("safeBuyerReturnTo", () => {
  test("accepts the buyer wizard setup path", () => {
    assert.equal(safeBuyerReturnTo("/agent/dep_42/setup"), "/agent/dep_42/setup");
  });

  test("accepts the My Agent home path", () => {
    assert.equal(safeBuyerReturnTo("/agent/dep_42"), "/agent/dep_42");
  });

  test("accepts a buyer path carrying a query string", () => {
    assert.equal(
      safeBuyerReturnTo("/agent/dep_42/setup?step=phone"),
      "/agent/dep_42/setup?step=phone",
    );
  });

  test("rejects a non-/agent internal path (no agency-surface laundering)", () => {
    assert.equal(safeBuyerReturnTo("/studio/clients"), null);
    assert.equal(safeBuyerReturnTo("/dashboard"), null);
    assert.equal(safeBuyerReturnTo("/agentupling"), null); // prefix-collision guard
  });

  test("rejects absolute URLs, protocol-relative, and scheme tricks", () => {
    assert.equal(safeBuyerReturnTo("https://evil.com/agent/dep_42"), null);
    assert.equal(safeBuyerReturnTo("//evil.com/agent/dep_42"), null);
    assert.equal(safeBuyerReturnTo("/agent/..//evil.com"), null);
    assert.equal(safeBuyerReturnTo("/agent/dep\\x"), null);
    assert.equal(safeBuyerReturnTo("javascript:alert(1)"), null);
  });

  test("rejects empties + non-strings", () => {
    assert.equal(safeBuyerReturnTo(""), null);
    assert.equal(safeBuyerReturnTo("   "), null);
    assert.equal(safeBuyerReturnTo(null), null);
    assert.equal(safeBuyerReturnTo(undefined), null);
    assert.equal(safeBuyerReturnTo(123), null);
  });
});

// ── 4. resolveCalendarCallbackRedirect (Bug 1 — where the OAuth return lands) ──
//
// The callback computes its redirect from the (validated) returnTo param. A safe
// buyer `/agent/...` returnTo lands the buyer back on the wizard with the
// ?calendar=<outcome> flag; absent/invalid returnTo keeps the AGENCY default
// (/studio/clients?calendar=<outcome>) so the agency flow never regresses.

describe("resolveCalendarCallbackRedirect", () => {
  const appUrl = "https://app.seldonframe.com";

  test("buyer returnTo → back to the wizard with the calendar flag (connected)", () => {
    const url = resolveCalendarCallbackRedirect({
      appUrl,
      returnTo: "/agent/dep_42/setup",
      outcome: "connected",
    });
    assert.equal(url, "https://app.seldonframe.com/agent/dep_42/setup?calendar=connected");
  });

  test("buyer returnTo → back to the wizard with the calendar flag (error)", () => {
    const url = resolveCalendarCallbackRedirect({
      appUrl,
      returnTo: "/agent/dep_42/setup",
      outcome: "error",
    });
    assert.equal(url, "https://app.seldonframe.com/agent/dep_42/setup?calendar=error");
  });

  test("buyer returnTo that already has a query → flag is appended with &", () => {
    const url = resolveCalendarCallbackRedirect({
      appUrl,
      returnTo: "/agent/dep_42/setup?step=phone",
      outcome: "connected",
    });
    assert.equal(
      url,
      "https://app.seldonframe.com/agent/dep_42/setup?step=phone&calendar=connected",
    );
  });

  test("NO returnTo → the AGENCY default (/studio/clients) is unchanged", () => {
    assert.equal(
      resolveCalendarCallbackRedirect({ appUrl, returnTo: null, outcome: "connected" }),
      "https://app.seldonframe.com/studio/clients?calendar=connected",
    );
    assert.equal(
      resolveCalendarCallbackRedirect({ appUrl, returnTo: undefined, outcome: "error" }),
      "https://app.seldonframe.com/studio/clients?calendar=error",
    );
  });

  test("UNSAFE returnTo → falls back to the AGENCY default (no open redirect)", () => {
    assert.equal(
      resolveCalendarCallbackRedirect({
        appUrl,
        returnTo: "https://evil.com/agent/x",
        outcome: "connected",
      }),
      "https://app.seldonframe.com/studio/clients?calendar=connected",
    );
    assert.equal(
      resolveCalendarCallbackRedirect({
        appUrl,
        returnTo: "/dashboard",
        outcome: "connected",
      }),
      "https://app.seldonframe.com/studio/clients?calendar=connected",
    );
  });
});

// ── 5. startCalendarConnect threads returnTo into the callback URL ─────────────

describe("startCalendarConnect — returnTo threading", () => {
  test("a safe buyer returnTo is encoded into the callback URL", async () => {
    const calls: Array<{ callbackUrl: string }> = [];
    const res = await startCalendarConnect(
      {
        deploymentId: "dep_42",
        toolkit: "googlecalendar",
        returnTo: "/agent/dep_42/setup",
      },
      {
        getOrgId: async () => "builder_1",
        getDeployment: async () =>
          deployment({ id: "dep_42", builderOrgId: "builder_1", clientOrgId: null }),
        createConnectLink: async (_orgId, _toolkit, callbackUrl) => {
          calls.push({ callbackUrl });
          return { redirectUrl: "https://consent.composio/abc" };
        },
      },
    );
    assert.equal(res.ok, true);
    assert.equal(calls.length, 1);
    // The callback carries the returnTo (URL-encoded) so the OAuth return knows to
    // land the buyer back on their wizard rather than the agency Clients page.
    assert.ok(
      calls[0].callbackUrl.includes(
        `returnTo=${encodeURIComponent("/agent/dep_42/setup")}`,
      ),
      `callbackUrl had returnTo: ${calls[0].callbackUrl}`,
    );
  });

  test("an UNSAFE returnTo is dropped from the callback URL (agency default preserved)", async () => {
    const calls: Array<{ callbackUrl: string }> = [];
    await startCalendarConnect(
      {
        deploymentId: "dep_42",
        toolkit: "googlecalendar",
        returnTo: "https://evil.com/agent/x",
      },
      {
        getOrgId: async () => "builder_1",
        getDeployment: async () =>
          deployment({ id: "dep_42", builderOrgId: "builder_1", clientOrgId: null }),
        createConnectLink: async (_orgId, _toolkit, callbackUrl) => {
          calls.push({ callbackUrl });
          return { redirectUrl: "https://consent.composio/abc" };
        },
      },
    );
    assert.equal(calls.length, 1);
    assert.ok(
      !calls[0].callbackUrl.includes("returnTo="),
      `callbackUrl must NOT carry an unsafe returnTo: ${calls[0].callbackUrl}`,
    );
  });

  test("no returnTo (agency flow) → callback URL has no returnTo param", async () => {
    const calls: Array<{ callbackUrl: string }> = [];
    await startCalendarConnect(
      { deploymentId: "dep_42", toolkit: "googlecalendar" },
      {
        getOrgId: async () => "builder_1",
        getDeployment: async () =>
          deployment({ id: "dep_42", builderOrgId: "builder_1", clientOrgId: null }),
        createConnectLink: async (_orgId, _toolkit, callbackUrl) => {
          calls.push({ callbackUrl });
          return { redirectUrl: "https://consent.composio/abc" };
        },
      },
    );
    assert.equal(calls.length, 1);
    assert.ok(!calls[0].callbackUrl.includes("returnTo="));
  });
});
