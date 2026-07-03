import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideRefreshOutcome } from "@/lib/oauth/rotate-refresh-token";

const activeToken = {
  familyId: "fam-1",
  clientId: "c1",
  orgId: "org1",
  userId: "user1",
  revokedAt: null as Date | null,
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
};

describe("decideRefreshOutcome", () => {
  it("rotates a valid, unrevoked, unexpired token", () => {
    const result = decideRefreshOutcome({ storedToken: activeToken, presentedClientId: "c1", now: new Date() });
    assert.equal(result.outcome, "rotate");
  });

  it("rejects a client_id mismatch", () => {
    const result = decideRefreshOutcome({ storedToken: activeToken, presentedClientId: "wrong-client", now: new Date() });
    assert.equal(result.outcome, "reject");
  });

  it("rejects an expired token", () => {
    const result = decideRefreshOutcome({
      storedToken: { ...activeToken, expiresAt: new Date(Date.now() - 1000) },
      presentedClientId: "c1",
      now: new Date(),
    });
    assert.equal(result.outcome, "reject");
  });

  it("detects reuse of an already-revoked token and signals family revocation", () => {
    const result = decideRefreshOutcome({
      storedToken: { ...activeToken, revokedAt: new Date() },
      presentedClientId: "c1",
      now: new Date(),
    });
    assert.equal(result.outcome, "reuse_detected");
    if (result.outcome === "reuse_detected") assert.equal(result.familyId, "fam-1");
  });

  it("rejects when storedToken is null (unknown token hash) without signaling reuse (nothing to revoke)", () => {
    const result = decideRefreshOutcome({ storedToken: null, presentedClientId: "c1", now: new Date() });
    assert.equal(result.outcome, "reject");
  });
});
