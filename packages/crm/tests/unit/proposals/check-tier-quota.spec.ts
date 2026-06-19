// packages/crm/tests/unit/proposals/check-tier-quota.spec.ts
// 2026-05-19 — Proposal Builder tier gate. Spec open-question #5.
// 2026-06-18 — remapped to builder/workspace/agency: agency unlimited,
// workspace 10/mo cap, builder + no-plan blocked.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateProposalQuota } from "@/lib/proposals/check-tier-quota";

describe("evaluateProposalQuota", () => {
  it("allows agency tier unlimited", () => {
    assert.deepEqual(evaluateProposalQuota({ tier: "agency", proposalsThisMonth: 50 }), {
      allowed: true,
    });
  });

  it("allows workspace tier under the 10 cap", () => {
    assert.deepEqual(evaluateProposalQuota({ tier: "workspace", proposalsThisMonth: 9 }), {
      allowed: true,
      remaining: 1,
    });
  });

  it("blocks workspace tier at the 10 cap", () => {
    assert.deepEqual(evaluateProposalQuota({ tier: "workspace", proposalsThisMonth: 10 }), {
      allowed: false,
      reason: "monthly_quota_exceeded",
      capacity: 10,
    });
  });

  it("blocks builder tier entirely (proposals are workspace+)", () => {
    assert.deepEqual(evaluateProposalQuota({ tier: "builder", proposalsThisMonth: 0 }), {
      allowed: false,
      reason: "tier_does_not_include_proposals",
      capacity: 0,
    });
  });

  // Legacy plan IDs must resolve to current tiers.
  it("aliases legacy cloud-pro → agency (unlimited)", () => {
    assert.deepEqual(
      evaluateProposalQuota({ tier: "cloud-pro", proposalsThisMonth: 50 }),
      { allowed: true },
    );
  });

  it("aliases legacy pro-3 → agency (unlimited)", () => {
    assert.deepEqual(
      evaluateProposalQuota({ tier: "pro-3", proposalsThisMonth: 50 }),
      { allowed: true },
    );
  });

  it("aliases legacy cloud-starter → workspace (10/mo cap)", () => {
    assert.deepEqual(
      evaluateProposalQuota({ tier: "cloud-starter", proposalsThisMonth: 9 }),
      { allowed: true, remaining: 1 },
    );
  });

  it("aliases legacy 'growth' → workspace (10/mo cap)", () => {
    assert.deepEqual(
      evaluateProposalQuota({ tier: "growth", proposalsThisMonth: 9 }),
      { allowed: true, remaining: 1 },
    );
  });

  it("aliases legacy 'scale' → agency (unlimited)", () => {
    assert.deepEqual(
      evaluateProposalQuota({ tier: "scale", proposalsThisMonth: 50 }),
      { allowed: true },
    );
  });

  it("blocks null planId (fails closed)", () => {
    assert.deepEqual(
      evaluateProposalQuota({ tier: "", proposalsThisMonth: 0 }),
      { allowed: false, reason: "tier_does_not_include_proposals", capacity: 0 },
    );
  });

  it("blocks 'free' / unknown planId (fails closed)", () => {
    assert.deepEqual(
      evaluateProposalQuota({ tier: "free", proposalsThisMonth: 0 }),
      { allowed: false, reason: "tier_does_not_include_proposals", capacity: 0 },
    );
    assert.deepEqual(
      evaluateProposalQuota({ tier: "enterprise-custom", proposalsThisMonth: 0 }),
      { allowed: false, reason: "tier_does_not_include_proposals", capacity: 0 },
    );
  });
});
