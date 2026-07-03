// Improve verb + trust rail (2026-07-02) — Task 10: bearer route auth+dispatch.
//
// `handleImproveRequest` / `handleApplyRequest` (the two route files) factor
// out auth + body-parsing + dispatch as DI'd functions — see each route's
// header note for why (no separate orchestrator exists for the improve verb
// to extract auth into, unlike deploy's `runDeploy`). This spec drives that
// control flow entirely over fakes: a fake `resolveBearer` standing in for
// `guardApiRequest`, and a fake core function standing in for
// `runImproveForAgent`/`applyImproveProposal` — no network, no Postgres, no
// real bearer token.
//
// The binding behaviors under test (brief's Steps list):
//   - no bearer / garbage bearer → 401, the core is never called;
//   - missing agent_id / proposal_id → 400, the core is never called (with a
//     fake-resolved org — proves this is a request-shape check, not an auth
//     miss in disguise);
//   - happy path → the core is called with the BEARER-resolved org, and a
//     body-supplied orgId is ignored (proves the body can never override
//     the bearer's org — the money-safety-adjacent invariant this route
//     exists to preserve, mirroring deploy/route.ts's own posture).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { NextResponse } from "next/server";

import { handleImproveRequest, type ResolveBearerResult as ImproveResolveBearerResult } from "@/app/api/v1/build/improve/route";
import { handleApplyRequest, type ResolveBearerResult as ApplyResolveBearerResult } from "@/app/api/v1/build/improve/apply/route";
import type { ImproveRunResult } from "@/lib/agents/improve/improve-run";
import type { ApplyProposalResult } from "@/lib/agents/improve/deps";

const BEARER_ORG = "org-bearer-1";

function jsonRequest(body: unknown): Request {
  return new Request("https://app.seldonframe.test/api/v1/build/improve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function okBearer(): ImproveResolveBearerResult & ApplyResolveBearerResult {
  return { orgId: BEARER_ORG };
}

function unauthorizedBearer(reason = "unauthorized"): { error: NextResponse } {
  return { error: NextResponse.json({ ok: false, reason }, { status: 401 }) };
}

async function readJson(res: NextResponse): Promise<unknown> {
  return res.json();
}

// ─── /api/v1/build/improve ─────────────────────────────────────────────────

describe("handleImproveRequest", () => {
  test("no bearer → 401, core never called", async () => {
    let called = false;
    const res = await handleImproveRequest(jsonRequest({ agent_id: "agent-1" }), {
      resolveBearer: async () => unauthorizedBearer(),
      runImprove: async () => {
        called = true;
        return { ok: false, reason: "should_not_be_called" };
      },
    });

    assert.equal(res.status, 401);
    assert.equal(called, false);
  });

  test("garbage bearer → 401, core never called", async () => {
    let called = false;
    const request = new Request("https://app.seldonframe.test/api/v1/build/improve", {
      method: "POST",
      headers: { authorization: "Bearer wst_garbage-not-a-real-token", "content-type": "application/json" },
      body: JSON.stringify({ agent_id: "agent-1" }),
    });

    const res = await handleImproveRequest(request, {
      // Simulates guardApiRequest's own behavior for a bearer that LOOKS
      // like a workspace token but fails to resolve — see guard.ts's
      // dedicated 401 branch for `/^bearer\s+wst_/i` that never resolved.
      resolveBearer: async () => unauthorizedBearer("invalid_bearer"),
      runImprove: async () => {
        called = true;
        return { ok: false, reason: "should_not_be_called" };
      },
    });

    assert.equal(res.status, 401);
    assert.equal(called, false);
  });

  test("missing agent_id → 400, core never called (bearer resolves fine)", async () => {
    let called = false;
    const res = await handleImproveRequest(jsonRequest({}), {
      resolveBearer: async () => okBearer(),
      runImprove: async () => {
        called = true;
        return { ok: false, reason: "should_not_be_called" };
      },
    });

    assert.equal(res.status, 400);
    assert.equal(called, false);
    const body = (await readJson(res)) as { ok: boolean; reason: string };
    assert.equal(body.ok, false);
    assert.equal(body.reason, "missing_agent_id");
  });

  test("non-string agent_id → 400, core never called", async () => {
    let called = false;
    const res = await handleImproveRequest(jsonRequest({ agent_id: 12345 }), {
      resolveBearer: async () => okBearer(),
      runImprove: async () => {
        called = true;
        return { ok: false, reason: "should_not_be_called" };
      },
    });

    assert.equal(res.status, 400);
    assert.equal(called, false);
  });

  test("happy path: core called with BEARER org; body orgId is ignored", async () => {
    const recorded: Array<{ agentId: string; orgId: string }> = [];
    const fakeResult: ImproveRunResult = {
      ok: true,
      proposalId: "proposal-9",
      baseline: { passRate: 0.7, total: 20 },
      candidate: { passRate: 0.85, total: 20 },
      paired: { improved: 4, regressed: 1, unchanged: 15, criticalRegressed: false },
      verdict: "better",
      clusters: [],
    };

    const res = await handleImproveRequest(
      jsonRequest({ agent_id: "agent-42", orgId: "org-attacker-supplied", org_id: "org-attacker-supplied" }),
      {
        resolveBearer: async () => okBearer(),
        runImprove: async (agentId, orgId) => {
          recorded.push({ agentId, orgId });
          return fakeResult;
        },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0]?.agentId, "agent-42");
    // The BEARER org is what's used — NEVER the body-supplied orgId/org_id.
    assert.equal(recorded[0]?.orgId, BEARER_ORG);
    assert.notEqual(recorded[0]?.orgId, "org-attacker-supplied");

    const body = (await readJson(res)) as ImproveRunResult;
    assert.deepEqual(body, fakeResult);
  });

  test("no_llm_key core result → 402, verbatim JSON", async () => {
    const res = await handleImproveRequest(jsonRequest({ agent_id: "agent-1" }), {
      resolveBearer: async () => okBearer(),
      runImprove: async () => ({ ok: false, reason: "no_llm_key", message: "needs BYOK" }),
    });

    assert.equal(res.status, 402);
    const body = (await readJson(res)) as { ok: boolean; reason: string; message?: string };
    assert.equal(body.ok, false);
    assert.equal(body.reason, "no_llm_key");
    assert.equal(body.message, "needs BYOK");
  });

  test("other ok:false core result (e.g. agent_not_found) → 422, verbatim JSON", async () => {
    const res = await handleImproveRequest(jsonRequest({ agent_id: "agent-missing" }), {
      resolveBearer: async () => okBearer(),
      runImprove: async () => ({ ok: false, reason: "agent_not_found" }),
    });

    assert.equal(res.status, 422);
    const body = (await readJson(res)) as { ok: boolean; reason: string };
    assert.equal(body.reason, "agent_not_found");
  });
});

// ─── /api/v1/build/improve/apply ───────────────────────────────────────────

describe("handleApplyRequest", () => {
  test("no bearer → 401, core never called", async () => {
    let called = false;
    const res = await handleApplyRequest(jsonRequest({ proposal_id: "proposal-1" }), {
      resolveBearer: async () => unauthorizedBearer(),
      applyProposal: async () => {
        called = true;
        return { ok: false, error: "should_not_be_called" };
      },
    });

    assert.equal(res.status, 401);
    assert.equal(called, false);
  });

  test("garbage bearer → 401, core never called", async () => {
    let called = false;
    const res = await handleApplyRequest(jsonRequest({ proposal_id: "proposal-1" }), {
      resolveBearer: async () => unauthorizedBearer("invalid_bearer"),
      applyProposal: async () => {
        called = true;
        return { ok: false, error: "should_not_be_called" };
      },
    });

    assert.equal(res.status, 401);
    assert.equal(called, false);
  });

  test("missing proposal_id → 400, core never called (bearer resolves fine)", async () => {
    let called = false;
    const res = await handleApplyRequest(jsonRequest({}), {
      resolveBearer: async () => okBearer(),
      applyProposal: async () => {
        called = true;
        return { ok: false, error: "should_not_be_called" };
      },
    });

    assert.equal(res.status, 400);
    assert.equal(called, false);
    const body = (await readJson(res)) as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "missing_proposal_id");
  });

  test("non-string proposal_id → 400, core never called", async () => {
    let called = false;
    const res = await handleApplyRequest(jsonRequest({ proposal_id: { nested: true } }), {
      resolveBearer: async () => okBearer(),
      applyProposal: async () => {
        called = true;
        return { ok: false, error: "should_not_be_called" };
      },
    });

    assert.equal(res.status, 400);
    assert.equal(called, false);
  });

  test("happy path: core called with BEARER org; body orgId is ignored", async () => {
    const recorded: Array<{ proposalId: string; orgId: string }> = [];
    const fakeResult: ApplyProposalResult = { ok: true, version: 8 };

    const res = await handleApplyRequest(
      jsonRequest({ proposal_id: "proposal-9", orgId: "org-attacker-supplied" }),
      {
        resolveBearer: async () => okBearer(),
        applyProposal: async (proposalId, orgId) => {
          recorded.push({ proposalId, orgId });
          return fakeResult;
        },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0]?.proposalId, "proposal-9");
    assert.equal(recorded[0]?.orgId, BEARER_ORG);
    assert.notEqual(recorded[0]?.orgId, "org-attacker-supplied");

    const body = (await readJson(res)) as ApplyProposalResult;
    assert.deepEqual(body, fakeResult);
  });

  test("ok:false core result (e.g. not_proposed) → 422, verbatim JSON", async () => {
    const res = await handleApplyRequest(jsonRequest({ proposal_id: "proposal-already-applied" }), {
      resolveBearer: async () => okBearer(),
      applyProposal: async () => ({ ok: false, error: "not_proposed" }),
    });

    assert.equal(res.status, 422);
    const body = (await readJson(res)) as { ok: boolean; error: string };
    assert.equal(body.error, "not_proposed");
  });
});
