// Phase 1 — enforceWorkspaceLimit per tier.
//
// builder = 0 full workspaces (landing pages capped separately at 10),
// workspace = 1, agency = unlimited (billed per-seat past 10). The tier
// resolver is injected via `deps` so the gate is unit-testable without a
// DB (mirrors the hasFeature dependency-injection pattern).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { enforceWorkspaceLimit } from "@/lib/billing/limits";
import type { BillingTier } from "@/lib/billing/features";

function withTier(tier: BillingTier) {
  return { resolveTier: async (_orgId: string | null | undefined) => tier };
}

describe("enforceWorkspaceLimit — builder (0 full workspaces)", () => {
  test("blocks the very first full workspace on builder", async () => {
    const decision = await enforceWorkspaceLimit(
      { userId: "u1", primaryOrgId: "org-1", ownedWorkspaceCount: 0 },
      withTier("builder"),
    );
    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.equal(decision.reason, "workspace_limit_reached");
      assert.equal(decision.limit, 0);
      assert.equal(decision.tier, "builder");
    }
  });
});

describe("enforceWorkspaceLimit — workspace (1)", () => {
  test("allows the first workspace", async () => {
    const decision = await enforceWorkspaceLimit(
      { userId: "u1", primaryOrgId: "org-1", ownedWorkspaceCount: 0 },
      withTier("workspace"),
    );
    assert.equal(decision.allowed, true);
    if (decision.allowed) assert.equal(decision.tier, "workspace");
  });

  test("blocks the second workspace", async () => {
    const decision = await enforceWorkspaceLimit(
      { userId: "u1", primaryOrgId: "org-1", ownedWorkspaceCount: 1 },
      withTier("workspace"),
    );
    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.equal(decision.limit, 1);
      assert.equal(decision.tier, "workspace");
    }
  });
});

describe("enforceWorkspaceLimit — agency (unlimited)", () => {
  test("allows workspaces well past the included 10", async () => {
    for (const count of [0, 1, 10, 25, 100]) {
      const decision = await enforceWorkspaceLimit(
        { userId: "u1", primaryOrgId: "org-1", ownedWorkspaceCount: count },
        withTier("agency"),
      );
      assert.equal(decision.allowed, true, `agency must allow ${count}`);
      if (decision.allowed) assert.equal(decision.tier, "agency");
    }
  });
});

describe("enforceWorkspaceLimit — inactive / no plan", () => {
  test("blocks workspace creation with no active plan", async () => {
    const decision = await enforceWorkspaceLimit(
      { userId: "u1", primaryOrgId: "org-1", ownedWorkspaceCount: 0 },
      withTier("inactive"),
    );
    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.equal(decision.reason, "workspace_limit_reached");
      assert.equal(decision.limit, 0);
    }
  });

  test("missing primaryOrgId is treated as no plan (blocked)", async () => {
    const decision = await enforceWorkspaceLimit(
      { userId: "u1", primaryOrgId: null, ownedWorkspaceCount: 0 },
      withTier("inactive"),
    );
    assert.equal(decision.allowed, false);
  });
});
