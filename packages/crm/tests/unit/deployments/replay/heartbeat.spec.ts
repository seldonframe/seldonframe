// Inbound-chain dead-man's switch (roadmap #7) — unit tests for
// heartbeat.ts.
//
// Two layers, mirroring ledger-queries.spec.ts's style:
//   1. Pure math (computeHeartbeat) tested directly against fixture rows and
//      an explicit `now` — no DB, no DI, deterministic 24h boundary.
//   2. The DI wrapper (getHeartbeat) tested at spy level: assert the
//      injected fetch fns are called and their results are folded correctly.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  computeHeartbeat,
  getHeartbeat,
  HEARTBEAT_SILENT_THRESHOLD_MS,
  type HeartbeatDeploymentRow,
} from "@/lib/deployments/replay/heartbeat";

const NOW = new Date("2026-07-18T12:00:00.000Z");

function row(overrides: Partial<HeartbeatDeploymentRow> = {}): HeartbeatDeploymentRow {
  return {
    deploymentId: "dep_1",
    clientName: "Metro Med Spa",
    orgId: "org_1",
    orgName: "Metro Med Spa Agency",
    lastActivityAt: null,
    ...overrides,
  };
}

describe("computeHeartbeat — pure status matrix", () => {
  test("never had activity → status 'never', hoursSinceActivity null, never counted as silent", () => {
    const result = computeHeartbeat([row({ lastActivityAt: null })], NOW, null);
    assert.equal(result.deployments[0].status, "never");
    assert.equal(result.deployments[0].hoursSinceActivity, null);
    assert.equal(result.silentCount, 0);
  });

  test("activity 1 minute ago → status 'ok'", () => {
    const lastActivityAt = new Date(NOW.getTime() - 60 * 1000);
    const result = computeHeartbeat([row({ lastActivityAt })], NOW, null);
    assert.equal(result.deployments[0].status, "ok");
    assert.equal(result.silentCount, 0);
  });

  test("activity exactly 24h ago (boundary, inclusive) → status 'ok'", () => {
    const lastActivityAt = new Date(NOW.getTime() - HEARTBEAT_SILENT_THRESHOLD_MS);
    const result = computeHeartbeat([row({ lastActivityAt })], NOW, null);
    assert.equal(result.deployments[0].status, "ok");
  });

  test("activity 24h + 1ms ago → status 'silent'", () => {
    const lastActivityAt = new Date(NOW.getTime() - HEARTBEAT_SILENT_THRESHOLD_MS - 1);
    const result = computeHeartbeat([row({ lastActivityAt })], NOW, null);
    assert.equal(result.deployments[0].status, "silent");
    assert.equal(result.silentCount, 1);
  });

  test("activity 3 days ago → status 'silent' with hoursSinceActivity ~72", () => {
    const lastActivityAt = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000);
    const result = computeHeartbeat([row({ lastActivityAt })], NOW, null);
    assert.equal(result.deployments[0].status, "silent");
    assert.ok(Math.abs((result.deployments[0].hoursSinceActivity ?? 0) - 72) < 0.001);
  });

  test("mixed rows: silentCount only counts 'silent', never 'never' or 'ok'", () => {
    const rows: HeartbeatDeploymentRow[] = [
      row({ deploymentId: "ok_1", lastActivityAt: new Date(NOW.getTime() - 1000) }),
      row({
        deploymentId: "silent_1",
        lastActivityAt: new Date(NOW.getTime() - 2 * HEARTBEAT_SILENT_THRESHOLD_MS),
      }),
      row({ deploymentId: "silent_2", lastActivityAt: new Date(NOW.getTime() - HEARTBEAT_SILENT_THRESHOLD_MS - 5000) }),
      row({ deploymentId: "never_1", lastActivityAt: null }),
    ];
    const result = computeHeartbeat(rows, NOW, null);
    assert.equal(result.silentCount, 2);
    assert.equal(result.deployments.length, 4);
  });

  test("lastReceiptAt and generatedAt pass through unchanged", () => {
    const lastReceiptAt = new Date("2026-07-18T10:00:00.000Z");
    const result = computeHeartbeat([], NOW, lastReceiptAt);
    assert.equal(result.lastReceiptAt, lastReceiptAt);
    assert.equal(result.generatedAt, NOW);
    assert.equal(result.deployments.length, 0);
    assert.equal(result.silentCount, 0);
  });

  test("null lastReceiptAt (no receipts ever) passes through as null, never throws", () => {
    const result = computeHeartbeat([], NOW, null);
    assert.equal(result.lastReceiptAt, null);
  });
});

describe("getHeartbeat — DI wrapper folds fetch results correctly", () => {
  test("folds per-deployment activity map onto the deployment list; missing map entries become 'never'", async () => {
    const deploymentsFetched: string[][] = [];
    const result = await getHeartbeat({
      fetchActiveEmailDeployments: async () => [
        { deploymentId: "dep_active", clientName: "Active Co", orgId: "org_a", orgName: "Org A" },
        { deploymentId: "dep_quiet", clientName: "Quiet Co", orgId: "org_b", orgName: "Org B" },
      ],
      fetchLastActivityByDeployment: async (ids) => {
        deploymentsFetched.push(ids);
        const map = new Map<string, Date>();
        map.set("dep_active", new Date(NOW.getTime() - 1000));
        // dep_quiet intentionally absent — never had a row.
        return map;
      },
      fetchGlobalLastReceiptAt: async () => new Date("2026-07-18T11:00:00.000Z"),
      now: () => NOW,
    });

    assert.deepEqual(deploymentsFetched[0].sort(), ["dep_active", "dep_quiet"]);
    const active = result.deployments.find((d) => d.deploymentId === "dep_active");
    const quiet = result.deployments.find((d) => d.deploymentId === "dep_quiet");
    assert.equal(active?.status, "ok");
    assert.equal(quiet?.status, "never");
    assert.equal(result.lastReceiptAt?.toISOString(), "2026-07-18T11:00:00.000Z");
  });

  test("zero active email deployments → empty result, activity fetch called with empty array, never throws", async () => {
    let calledWith: string[] | null = null;
    const result = await getHeartbeat({
      fetchActiveEmailDeployments: async () => [],
      fetchLastActivityByDeployment: async (ids) => {
        calledWith = ids;
        return new Map();
      },
      fetchGlobalLastReceiptAt: async () => null,
      now: () => NOW,
    });
    assert.deepEqual(calledWith, []);
    assert.equal(result.deployments.length, 0);
    assert.equal(result.silentCount, 0);
    assert.equal(result.lastReceiptAt, null);
  });
});
