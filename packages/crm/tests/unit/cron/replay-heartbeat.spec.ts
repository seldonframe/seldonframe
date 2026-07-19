// Inbound-chain dead-man's switch (roadmap #7) — unit tests for the
// replay-heartbeat cron route.
//
// DI style rather than mock.module: runHeartbeatCron accepts injectable
// getHeartbeat/sendReplayHeartbeatAlert fns (see set-booking-policy.spec.ts's
// header — tsx's CJS interop makes module-mocking @/ imports unreliable in
// this repo). isAuthorized is tested directly with a plain Request, exercising
// the real CRON_SECRET check with no DB/network involved.
//
// Run:
//   node --import tsx --test tests/unit/cron/replay-heartbeat.spec.ts

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { isAuthorized, runHeartbeatCron, GET } from "../../../src/app/api/cron/replay-heartbeat/route";
import type { HeartbeatResult, HeartbeatDeploymentResult } from "../../../src/lib/deployments/replay/heartbeat";

const NOW = new Date("2026-07-18T12:00:00.000Z");

function heartbeatResult(deployments: HeartbeatDeploymentResult[]): HeartbeatResult {
  return {
    deployments,
    silentCount: deployments.filter((d) => d.status === "silent").length,
    lastReceiptAt: new Date("2026-07-18T11:00:00.000Z"),
    generatedAt: NOW,
  };
}

function okDeployment(overrides: Partial<HeartbeatDeploymentResult> = {}): HeartbeatDeploymentResult {
  return {
    deploymentId: "dep_ok",
    clientName: "Healthy Co",
    orgId: "org_ok",
    orgName: "Org Ok",
    lastActivityAt: new Date(NOW.getTime() - 1000),
    status: "ok",
    hoursSinceActivity: 0.0003,
    ...overrides,
  };
}

function silentDeployment(overrides: Partial<HeartbeatDeploymentResult> = {}): HeartbeatDeploymentResult {
  return {
    deploymentId: "dep_silent",
    clientName: "Silent Co",
    orgId: "org_silent",
    orgName: "Org Silent",
    lastActivityAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000),
    status: "silent",
    hoursSinceActivity: 72,
    ...overrides,
  };
}

describe("isAuthorized — CRON_SECRET fail-closed auth", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  test("rejects when CRON_SECRET is unset (fail-closed)", () => {
    delete process.env.CRON_SECRET;
    const req = new Request("https://example.com/api/cron/replay-heartbeat");
    assert.equal(isAuthorized(req), false);
  });

  test("rejects a request with no auth header when a secret IS configured", () => {
    process.env.CRON_SECRET = "test-secret";
    const req = new Request("https://example.com/api/cron/replay-heartbeat");
    assert.equal(isAuthorized(req), false);
  });

  test("rejects a wrong bearer token", () => {
    process.env.CRON_SECRET = "test-secret";
    const req = new Request("https://example.com/api/cron/replay-heartbeat", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    assert.equal(isAuthorized(req), false);
  });

  test("accepts the correct bearer token", () => {
    process.env.CRON_SECRET = "test-secret";
    const req = new Request("https://example.com/api/cron/replay-heartbeat", {
      headers: { authorization: "Bearer test-secret" },
    });
    assert.equal(isAuthorized(req), true);
  });

  test("accepts the correct x-cron-secret header", () => {
    process.env.CRON_SECRET = "test-secret";
    const req = new Request("https://example.com/api/cron/replay-heartbeat", {
      headers: { "x-cron-secret": "test-secret" },
    });
    assert.equal(isAuthorized(req), true);
  });

  test("GET returns 401 and never touches getHeartbeat when unauthorized", async () => {
    delete process.env.CRON_SECRET;
    const req = new Request("https://example.com/api/cron/replay-heartbeat");
    const res = await GET(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, "Unauthorized");
  });
});

describe("runHeartbeatCron — email invoked only when silent exists", () => {
  test("no silent deployments → email NOT sent, status 200 shape returned", async () => {
    let sendCalled = false;
    const result = await runHeartbeatCron({
      getHeartbeat: async () => heartbeatResult([okDeployment()]),
      sendReplayHeartbeatAlert: async () => {
        sendCalled = true;
      },
    });
    assert.equal(sendCalled, false);
    assert.equal(result.emailSent, false);
    assert.equal(result.silentCount, 0);
    assert.equal(result.deploymentsChecked, 1);
  });

  test("at least one silent deployment → email sent exactly once with the silent rows", async () => {
    let callCount = 0;
    const receivedSilentCounts: number[] = [];
    const result = await runHeartbeatCron({
      getHeartbeat: async () => heartbeatResult([okDeployment(), silentDeployment()]),
      sendReplayHeartbeatAlert: async (params) => {
        callCount += 1;
        receivedSilentCounts.push(params.silentDeployments.length);
      },
    });
    assert.equal(callCount, 1);
    assert.equal(result.emailSent, true);
    assert.equal(result.silentCount, 1);
    assert.deepEqual(receivedSilentCounts, [1]);
    assert.deepEqual(result.silentDeployments.map((d: { deploymentId: string }) => d.deploymentId), ["dep_silent"]);
  });

  test("'never' status deployments are NOT treated as silent and never trigger an email", async () => {
    const neverDeployment = okDeployment({
      deploymentId: "dep_never",
      status: "never",
      lastActivityAt: null,
      hoursSinceActivity: null,
    });
    let sendCalled = false;
    const result = await runHeartbeatCron({
      getHeartbeat: async () => heartbeatResult([neverDeployment]),
      sendReplayHeartbeatAlert: async () => {
        sendCalled = true;
      },
    });
    assert.equal(sendCalled, false);
    assert.equal(result.emailSent, false);
    assert.equal(result.neverCount, 1);
  });

  test("email send failure is caught — runHeartbeatCron still resolves (route still returns 200)", async () => {
    const result = await runHeartbeatCron({
      getHeartbeat: async () => heartbeatResult([silentDeployment()]),
      sendReplayHeartbeatAlert: async () => {
        throw new Error("Resend is down");
      },
    });
    // No throw propagated — the function resolved normally despite the
    // injected send failing.
    assert.equal(result.emailSent, true);
    assert.equal(result.silentCount, 1);
  });

  test("always returns JSON-shaped status regardless of email outcome", async () => {
    const result = await runHeartbeatCron({
      getHeartbeat: async () => heartbeatResult([okDeployment(), silentDeployment()]),
      sendReplayHeartbeatAlert: async () => {},
    });
    assert.equal(typeof result.generatedAt, "string");
    assert.equal(result.deploymentsChecked, 2);
    assert.equal(result.okCount, 1);
    assert.equal(result.silentCount, 1);
    assert.equal(result.lastReceiptAt, "2026-07-18T11:00:00.000Z");
  });
});
