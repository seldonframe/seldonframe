// Authz tests for Task 12's /api/v1/recordings/compile-agent route —
// exercises the pure resolveCompileAgentGate directly with DI'd fakes,
// same style as session-routes-authz.spec.ts (route.ts files may only
// export handlers + segment config; the gate lives in route-guards.ts).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveCompileAgentGate } from "@/lib/recordings/route-guards";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

function baseParams(overrides: Partial<Parameters<typeof resolveCompileAgentGate>[0]> = {}) {
  return {
    env: { SF_RECORD_TO_AGENT: "1" },
    orgId: "org-1",
    rawToken: "good-token",
    sessionIdFromBody: SESSION_ID,
    session: { id: SESSION_ID, status: "recapped" },
    approve: true,
    ...overrides,
  };
}

describe("resolveCompileAgentGate", () => {
  test("flag off → not_found (even with valid everything else)", () => {
    const out = resolveCompileAgentGate(baseParams({ env: {} }));
    assert.deepEqual(out, { kind: "not_found" });
  });

  test("no operator session (orgId null) → unauthorized, even with a valid bearer", () => {
    const out = resolveCompileAgentGate(baseParams({ orgId: null }));
    assert.deepEqual(out, { kind: "unauthorized" });
  });

  test("operator session present but wrong/missing bearer → unauthorized", () => {
    const wrongToken = resolveCompileAgentGate(baseParams({ session: null }));
    assert.deepEqual(wrongToken, { kind: "unauthorized" });

    const noToken = resolveCompileAgentGate(baseParams({ rawToken: null }));
    assert.deepEqual(noToken, { kind: "unauthorized" });

    const mismatchedSession = resolveCompileAgentGate(
      baseParams({ session: { id: "other-session-id", status: "recapped" } }),
    );
    assert.deepEqual(mismatchedSession, { kind: "unauthorized" });
  });

  test("session not recapped/approved (e.g. still 'recording') → conflict (409)", () => {
    const out = resolveCompileAgentGate(baseParams({ session: { id: SESSION_ID, status: "recording" } }));
    assert.deepEqual(out, { kind: "conflict" });

    const compiled = resolveCompileAgentGate(baseParams({ session: { id: SESSION_ID, status: "compiled" } }));
    assert.deepEqual(compiled, { kind: "conflict" });
  });

  test("recapped + approve:true → ok, shouldApprove true (transitions to approved)", () => {
    const out = resolveCompileAgentGate(baseParams({ session: { id: SESSION_ID, status: "recapped" }, approve: true }));
    assert.deepEqual(out, { kind: "ok", shouldApprove: true });
  });

  test("already approved → ok, shouldApprove false (no re-transition)", () => {
    const out = resolveCompileAgentGate(baseParams({ session: { id: SESSION_ID, status: "approved" }, approve: true }));
    assert.deepEqual(out, { kind: "ok", shouldApprove: false });
  });

  test("recapped but approve:false → conflict (never silently proceeds without approval)", () => {
    const out = resolveCompileAgentGate(baseParams({ session: { id: SESSION_ID, status: "recapped" }, approve: false }));
    assert.deepEqual(out, { kind: "conflict" });
  });
});
