// packages/crm/tests/unit/proposals/check-tier-quota.spec.ts
// 2026-05-19 — Proposal Builder tier gate. Spec open-question #5.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateProposalQuota } from "@/lib/proposals/check-tier-quota";

describe("evaluateProposalQuota", () => {
  it("allows scale tier unlimited", () => {
    assert.deepEqual(evaluateProposalQuota({ tier: "scale", proposalsThisMonth: 50 }), {
      allowed: true,
    });
  });

  it("allows growth tier under the 10 cap", () => {
    assert.deepEqual(evaluateProposalQuota({ tier: "growth", proposalsThisMonth: 9 }), {
      allowed: true,
      remaining: 1,
    });
  });

  it("blocks growth tier at the 10 cap", () => {
    assert.deepEqual(evaluateProposalQuota({ tier: "growth", proposalsThisMonth: 10 }), {
      allowed: false,
      reason: "monthly_quota_exceeded",
      capacity: 10,
    });
  });

  it("blocks free tier entirely", () => {
    assert.deepEqual(evaluateProposalQuota({ tier: "free", proposalsThisMonth: 0 }), {
      allowed: false,
      reason: "tier_does_not_include_proposals",
      capacity: 0,
    });
  });
});
