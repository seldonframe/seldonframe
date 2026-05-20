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

  // 2026-05-20 production hotfix: legacy plan IDs must resolve to current tiers
  it("aliases legacy cloud-pro → scale (unlimited)", () => {
    assert.deepEqual(
      evaluateProposalQuota({ tier: "cloud-pro", proposalsThisMonth: 50 }),
      { allowed: true },
    );
  });

  it("aliases legacy pro-3 → scale (unlimited)", () => {
    assert.deepEqual(
      evaluateProposalQuota({ tier: "pro-3", proposalsThisMonth: 50 }),
      { allowed: true },
    );
  });

  it("aliases legacy cloud-starter → growth (10/mo cap)", () => {
    assert.deepEqual(
      evaluateProposalQuota({ tier: "cloud-starter", proposalsThisMonth: 9 }),
      { allowed: true, remaining: 1 },
    );
  });

  it("blocks null planId (fails closed)", () => {
    assert.deepEqual(
      evaluateProposalQuota({ tier: "", proposalsThisMonth: 0 }),
      { allowed: false, reason: "tier_does_not_include_proposals", capacity: 0 },
    );
  });

  it("blocks unknown planId (fails closed)", () => {
    assert.deepEqual(
      evaluateProposalQuota({ tier: "enterprise-custom", proposalsThisMonth: 0 }),
      { allowed: false, reason: "tier_does_not_include_proposals", capacity: 0 },
    );
  });
});
