// Record v3 (T2) — stampClaimedCompileOnboarded: the soft-fail onboarding
// stamp on the compile-agent claim path (root fix for the /clients/new
// bounce — see docs/superpowers/specs/2026-07-12-record-v3-design.md S4b).
//
// markOperatorOnboarded is DI'd so this is testable without a DB, mirroring
// compile-agent-route-authz.spec.ts's DI style for the same route's gate.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { stampClaimedCompileOnboarded } from "@/lib/recordings/route-guards";

describe("stampClaimedCompileOnboarded", () => {
  test("calls markOperatorOnboarded with orgId + userId on the happy path", async () => {
    const calls: Array<{ orgId: string; userId?: string }> = [];
    await stampClaimedCompileOnboarded(
      "org-1",
      "user-1",
      async (orgId, userId) => {
        calls.push({ orgId, userId });
      },
    );
    assert.deepEqual(calls, [{ orgId: "org-1", userId: "user-1" }]);
  });

  test("userId null (id unavailable) still stamps the org, with userId undefined", async () => {
    const calls: Array<{ orgId: string; userId?: string }> = [];
    await stampClaimedCompileOnboarded("org-1", null, async (orgId, userId) => {
      calls.push({ orgId, userId });
    });
    assert.deepEqual(calls, [{ orgId: "org-1", userId: undefined }]);
  });

  test("a throwing markOperatorOnboarded never propagates — the compile response must not fail on this", async () => {
    await assert.doesNotReject(
      stampClaimedCompileOnboarded("org-1", "user-1", async () => {
        throw new Error("db unavailable");
      }),
    );
  });

  test("onError fires with the caught error (for logging) when the stamp fails", async () => {
    let captured: unknown = null;
    await stampClaimedCompileOnboarded(
      "org-1",
      "user-1",
      async () => {
        throw new Error("db unavailable");
      },
      (error) => {
        captured = error;
      },
    );
    assert.ok(captured instanceof Error);
    assert.equal((captured as Error).message, "db unavailable");
  });

  test("onError is never called on success", async () => {
    let errorCalled = false;
    await stampClaimedCompileOnboarded(
      "org-1",
      "user-1",
      async () => {},
      () => {
        errorCalled = true;
      },
    );
    assert.equal(errorCalled, false);
  });
});
