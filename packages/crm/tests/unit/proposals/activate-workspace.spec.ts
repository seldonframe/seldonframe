// packages/crm/tests/unit/proposals/activate-workspace.spec.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildActivationOps } from "@/lib/proposals/activate-workspace";

describe("buildActivationOps", () => {
  it("returns ops list with workspace flip + ownership transfer", () => {
    const ops = buildActivationOps({
      proposalId: "prop_123",
      workspaceId: "ws_456",
      prospectEmail: "owner@example.com",
      stripeSubscriptionId: "sub_xyz",
      stripeCustomerId: "cus_abc",
    });
    const types = ops.map((o) => o.type);
    assert.ok(types.includes("flip_preview_mode"), "should include flip_preview_mode");
    assert.ok(types.includes("update_proposal_status"), "should include update_proposal_status");
    assert.ok(types.includes("log_event_workspace_activated"), "should include log_event_workspace_activated");
  });

  it("preserves null workspaceId (proposal without preview workspace)", () => {
    const ops = buildActivationOps({
      proposalId: "prop_123",
      workspaceId: null,
      prospectEmail: "owner@example.com",
      stripeSubscriptionId: "sub_xyz",
      stripeCustomerId: "cus_abc",
    });
    const types = ops.map((o) => o.type);
    assert.ok(!types.includes("flip_preview_mode"), "should NOT include flip_preview_mode");
    assert.ok(types.includes("update_proposal_status"), "should include update_proposal_status");
  });
});
