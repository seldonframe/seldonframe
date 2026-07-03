// Improve verb + trust rail (2026-07-02) — Task 9: apply/dismiss proposal core.
//
// TDD focus: `applyImproveProposal` / `dismissImproveProposal` (deps.ts) are
// the PROPOSE-ONLY apply gate — the plan's Global Constraints say "nothing
// but applyImproveProposal may call updateAgentBlueprint from this feature,
// and it requires proposal status 'proposed' + org match". Every external
// effect arrives via injected deps, so this spec drives the whole apply/
// dismiss lifecycle with plain fakes — no network, no Postgres.
//
// The binding behaviors under test (brief's Steps list):
//   - wrong org (loadProposal scoped by id+orgId) → "not_found", nothing else
//     called;
//   - proposal not in "proposed" status (e.g. already "applied") → rejected,
//     updateBlueprint never called;
//   - the patch fails RE-VALIDATION against the CURRENT (possibly-moved)
//     blueprint → rejected, updateBlueprint never called, proposal status
//     untouched;
//   - happy path: updateBlueprint called with the patch + publishNotes
//     "improve run <proposalId>", proposal marked applied + resolvedAt set,
//     returns { ok: true, version };
//   - version drift (basedOnVersion !== currentVersion) does NOT block —
//     applies anyway, but the return carries `note: "applied over vN"`;
//   - dismiss ONLY flips status (never touches the blueprint), still scoped
//     by id+orgId+status, and dismissing an already-resolved proposal is a
//     no-op ok:false.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  applyImproveProposal,
  dismissImproveProposal,
  type ApplyProposalDeps,
  type DismissProposalDeps,
} from "@/lib/agents/improve/deps";
import type { AgentBlueprint } from "@/db/schema/agents";
import type { ImproveProposal } from "@/db/schema/eval-runs";

const ORG_ID = "org-1";
const AGENT_ID = "agent-1";
const PROPOSAL_ID = "proposal-1";

function blueprint(overrides: Partial<AgentBlueprint> = {}): AgentBlueprint {
  return {
    archetype: "receptionist",
    greeting: "Hi, how can I help?",
    faq: [{ q: "What are your hours?", a: "9-5 Mon-Fri" }],
    capabilities: ["book_appointment"],
    connectors: [],
    trigger: { kind: "inbound" } as unknown as AgentBlueprint["trigger"],
    ...overrides,
  };
}

function proposal(overrides: Partial<ImproveProposal> = {}): ImproveProposal {
  return {
    id: PROPOSAL_ID,
    orgId: ORG_ID,
    agentId: AGENT_ID,
    basedOnVersion: 7,
    patch: { greeting: "A clearer greeting." },
    rationale: { clusters: [] },
    baselineRunId: "run-1",
    candidateRunId: "run-2",
    status: "proposed",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    resolvedAt: null,
    ...overrides,
  } as ImproveProposal;
}

// ─── apply deps harness ───────────────────────────────────────────────────

type MakeApplyDepsOpts = {
  proposalRow?: ImproveProposal | null;
  currentBlueprint?: AgentBlueprint | null;
  currentVersion?: number;
  updateResult?: { ok: true; version: number } | { ok: false; error: string };
};

function makeApplyDeps(opts: MakeApplyDepsOpts = {}) {
  const recorded = {
    loadProposalArgs: [] as Array<{ proposalId: string; orgId: string }>,
    loadCurrentArgs: [] as Array<{ agentId: string; orgId: string }>,
    updateBlueprintArgs: [] as Array<{
      agentId: string;
      orgId: string;
      patch: Partial<AgentBlueprint>;
      publishNotes?: string;
    }>,
    markAppliedArgs: [] as Array<{ proposalId: string; orgId: string }>,
  };

  const currentVersion = opts.currentVersion ?? 7;
  const currentBlueprint =
    opts.currentBlueprint !== undefined ? opts.currentBlueprint : blueprint();

  const deps: ApplyProposalDeps = {
    loadProposal: async (args) => {
      recorded.loadProposalArgs.push(args);
      return opts.proposalRow !== undefined ? opts.proposalRow : proposal();
    },
    loadCurrentAgent: async (args) => {
      recorded.loadCurrentArgs.push(args);
      if (currentBlueprint === null) return null;
      return { blueprint: currentBlueprint, currentVersion };
    },
    updateBlueprint: async (args) => {
      recorded.updateBlueprintArgs.push(args);
      return opts.updateResult ?? { ok: true, version: currentVersion + 1 };
    },
    markApplied: async (args) => {
      recorded.markAppliedArgs.push(args);
    },
  };

  return { deps, recorded };
}

const runApply = (deps: ApplyProposalDeps) =>
  applyImproveProposal({ proposalId: PROPOSAL_ID, orgId: ORG_ID }, deps);

// ─── happy path ───────────────────────────────────────────────────────────

describe("applyImproveProposal — happy path", () => {
  test("re-validates against the CURRENT blueprint, calls updateAgentBlueprint with publishNotes, marks applied", async () => {
    const { deps, recorded } = makeApplyDeps();

    const res = await runApply(deps);

    assert.deepEqual(res, { ok: true, version: 8 });

    assert.deepEqual(recorded.loadProposalArgs, [
      { proposalId: PROPOSAL_ID, orgId: ORG_ID },
    ]);
    assert.deepEqual(recorded.loadCurrentArgs, [
      { agentId: AGENT_ID, orgId: ORG_ID },
    ]);

    assert.equal(recorded.updateBlueprintArgs.length, 1);
    const call = recorded.updateBlueprintArgs[0];
    assert.equal(call.agentId, AGENT_ID);
    assert.equal(call.orgId, ORG_ID);
    assert.deepEqual(call.patch, { greeting: "A clearer greeting." });
    assert.equal(call.publishNotes, `improve run ${PROPOSAL_ID}`);

    assert.deepEqual(recorded.markAppliedArgs, [
      { proposalId: PROPOSAL_ID, orgId: ORG_ID },
    ]);
  });

  test("version drift (basedOnVersion !== currentVersion) does NOT block — applies anyway with a drift note", async () => {
    // Proposal was based on version 7; the live agent has since moved to 9
    // (some other change landed in between). Apply should still proceed.
    const { deps, recorded } = makeApplyDeps({
      proposalRow: proposal({ basedOnVersion: 7 }),
      currentVersion: 9,
      updateResult: { ok: true, version: 10 },
    });

    const res = await runApply(deps);

    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("unreachable");
    assert.equal(res.version, 10);
    assert.equal(res.note, "applied over v9");
    assert.equal(recorded.updateBlueprintArgs.length, 1);
    assert.equal(recorded.markAppliedArgs.length, 1);
  });

  test("no version drift → the happy-path return carries no drift note", async () => {
    const { deps } = makeApplyDeps({
      proposalRow: proposal({ basedOnVersion: 7 }),
      currentVersion: 7,
    });

    const res = await runApply(deps);
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("unreachable");
    assert.equal(res.note, undefined);
  });
});

// ─── org scoping ──────────────────────────────────────────────────────────

describe("applyImproveProposal — org scoping", () => {
  test("wrong org (loadProposal scoped by id+orgId returns null) → not found, nothing else called", async () => {
    const { deps, recorded } = makeApplyDeps({ proposalRow: null });

    const res = await runApply(deps);

    assert.deepEqual(res, { ok: false, error: "not_found" });
    assert.equal(recorded.loadCurrentArgs.length, 0);
    assert.equal(recorded.updateBlueprintArgs.length, 0);
    assert.equal(recorded.markAppliedArgs.length, 0);
  });
});

// ─── status guard ─────────────────────────────────────────────────────────

describe("applyImproveProposal — status guard", () => {
  test("status already 'applied' → rejected, updateAgentBlueprint never called", async () => {
    const { deps, recorded } = makeApplyDeps({
      proposalRow: proposal({ status: "applied", resolvedAt: new Date() }),
    });

    const res = await runApply(deps);

    assert.deepEqual(res, { ok: false, error: "not_proposed" });
    assert.equal(recorded.updateBlueprintArgs.length, 0);
    assert.equal(recorded.markAppliedArgs.length, 0);
  });

  test("status 'dismissed' → rejected, updateAgentBlueprint never called", async () => {
    const { deps, recorded } = makeApplyDeps({
      proposalRow: proposal({ status: "dismissed", resolvedAt: new Date() }),
    });

    const res = await runApply(deps);

    assert.deepEqual(res, { ok: false, error: "not_proposed" });
    assert.equal(recorded.updateBlueprintArgs.length, 0);
  });
});

// ─── re-validation against the current blueprint ─────────────────────────

describe("applyImproveProposal — re-validation against the CURRENT blueprint", () => {
  test("a patch that WAS valid at propose-time but touches a key removed from the current blueprint → rejected, updateAgentBlueprint never called", async () => {
    // The proposal's patch touches `greeting`, but the CURRENT blueprint (as
    // of apply-time) no longer has that key — validateProposedPatch's subset
    // rule rejects it. Built via destructuring (not `{ greeting: undefined }`
    // — a spread with an `undefined` value still leaves the KEY present via
    // `Object.keys`, which would defeat the very subset-rule miss this test
    // means to exercise) so the key is genuinely absent.
    const { greeting: _dropped, ...blueprintWithoutGreeting } = blueprint();
    const { deps, recorded } = makeApplyDeps({
      proposalRow: proposal({ patch: { greeting: "A clearer greeting." } }),
      currentBlueprint: blueprintWithoutGreeting as AgentBlueprint,
    });

    const res = await runApply(deps);

    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.equal(res.error, "revalidation_failed");
    assert.equal(recorded.updateBlueprintArgs.length, 0);
    assert.equal(recorded.markAppliedArgs.length, 0);
  });

  test("a patch touching connectors/trigger (always-denied keys) fails re-validation even if somehow persisted → rejected", async () => {
    const { deps, recorded } = makeApplyDeps({
      proposalRow: proposal({ patch: { connectors: [] } }),
    });

    const res = await runApply(deps);

    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.equal(res.error, "revalidation_failed");
    assert.equal(recorded.updateBlueprintArgs.length, 0);
  });

  test("current agent not found → not_found, updateAgentBlueprint never called", async () => {
    const { deps, recorded } = makeApplyDeps({ currentBlueprint: null });

    const res = await runApply(deps);

    assert.deepEqual(res, { ok: false, error: "not_found" });
    assert.equal(recorded.updateBlueprintArgs.length, 0);
  });
});

// ─── updateAgentBlueprint failure propagates ─────────────────────────────

describe("applyImproveProposal — updateAgentBlueprint failure", () => {
  test("updateAgentBlueprint returning ok:false propagates its error and does NOT mark applied", async () => {
    const { deps, recorded } = makeApplyDeps({
      updateResult: { ok: false, error: "agent_not_found" },
    });

    const res = await runApply(deps);

    assert.deepEqual(res, { ok: false, error: "agent_not_found" });
    assert.equal(recorded.markAppliedArgs.length, 0);
  });
});

// ─── dismiss ──────────────────────────────────────────────────────────────

describe("dismissImproveProposal — flips status only", () => {
  function makeDismissDeps(opts: { proposalRow?: ImproveProposal | null } = {}) {
    const recorded = {
      loadProposalArgs: [] as Array<{ proposalId: string; orgId: string }>,
      markDismissedArgs: [] as Array<{ proposalId: string; orgId: string }>,
    };
    const deps: DismissProposalDeps = {
      loadProposal: async (args) => {
        recorded.loadProposalArgs.push(args);
        return opts.proposalRow !== undefined ? opts.proposalRow : proposal();
      },
      markDismissed: async (args) => {
        recorded.markDismissedArgs.push(args);
      },
    };
    return { deps, recorded };
  }

  test("happy path: status 'proposed' → marks dismissed, returns ok:true", async () => {
    const { deps, recorded } = makeDismissDeps();

    const res = await dismissImproveProposal(
      { proposalId: PROPOSAL_ID, orgId: ORG_ID },
      deps,
    );

    assert.deepEqual(res, { ok: true });
    assert.deepEqual(recorded.markDismissedArgs, [
      { proposalId: PROPOSAL_ID, orgId: ORG_ID },
    ]);
  });

  test("wrong org / missing proposal → ok:false, markDismissed never called", async () => {
    const { deps, recorded } = makeDismissDeps({ proposalRow: null });

    const res = await dismissImproveProposal(
      { proposalId: PROPOSAL_ID, orgId: ORG_ID },
      deps,
    );

    assert.deepEqual(res, { ok: false });
    assert.equal(recorded.markDismissedArgs.length, 0);
  });

  test("already resolved (status 'applied') → ok:false, markDismissed never called (idempotent no-op)", async () => {
    const { deps, recorded } = makeDismissDeps({
      proposalRow: proposal({ status: "applied", resolvedAt: new Date() }),
    });

    const res = await dismissImproveProposal(
      { proposalId: PROPOSAL_ID, orgId: ORG_ID },
      deps,
    );

    assert.deepEqual(res, { ok: false });
    assert.equal(recorded.markDismissedArgs.length, 0);
  });

  test("already dismissed → ok:false, markDismissed never called", async () => {
    const { deps, recorded } = makeDismissDeps({
      proposalRow: proposal({ status: "dismissed", resolvedAt: new Date() }),
    });

    const res = await dismissImproveProposal(
      { proposalId: PROPOSAL_ID, orgId: ORG_ID },
      deps,
    );

    assert.deepEqual(res, { ok: false });
    assert.equal(recorded.markDismissedArgs.length, 0);
  });
});
