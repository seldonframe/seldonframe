// Agent marketplace — publish-gate wiring (Wave 1 review, F4).
//
// publishOrUpdateAgentListingAction's auth + org-guard + agent-lifecycle
// publish-gate preamble is extracted into resolvePublishGuard (a pure,
// DI'd function — same convention as set-booking-policy.spec.ts) precisely
// so this wiring is testable without a live DB: the review flagged that the
// gate (lib/agents/lifecycle/gate.ts) was itself unit-tested but nothing
// proved seller-actions.ts actually WIRES it correctly.
//
// These tests prove the three cases the review named:
//   1. flag on + gate missing  -> {ok:false, error:"lifecycle_gate"} and no
//      further write path is reachable (resolvePublishGuard performs no
//      writes at all — this is the ENTIRE guard the real action's write
//      path sits behind).
//   2. flag on + gate satisfied -> proceeds ({ok:true, orgId, template}).
//   3. flag off -> proceeds regardless of the gate's missing[].

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolvePublishGuard, type ResolvePublishGuardDeps } from "../../../src/lib/marketplace/seller-actions";
import type { AgentTemplate } from "../../../src/db/schema/agent-templates";

const ORG_ID = "org-1";
const TEMPLATE_ID = "tmpl-1";

function fakeTemplate(over: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    id: TEMPLATE_ID,
    builderOrgId: ORG_ID,
    name: "Inbox Watcher",
    type: "chat",
    // F-D: a real action-capable capability, so these tests exercise the
    // STRICT gate (a template WITH tools) — a blank blueprint would make
    // hasActionableTools false and exempt the supervised-run requirement
    // entirely, which is a different, deliberately-tested case (see the
    // "F-D exemption" describe block below), not what these tests intend.
    blueprint: { capabilities: ["book_appointment"] },
    status: "tested",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as AgentTemplate;
}

function baseDeps(over: Partial<ResolvePublishGuardDeps> = {}): ResolvePublishGuardDeps {
  return {
    getOrgId: async () => ORG_ID,
    getCurrentUser: async () => ({ id: "user-1" }),
    loadTemplate: async () => fakeTemplate(),
    lifecycleGateDeps: {
      getLatestEvalRun: async () => ({
        id: "run-1",
        orgId: ORG_ID,
        subjectKind: "template",
        subjectId: TEMPLATE_ID,
        kind: "manual",
        passRate: 100,
        scenarioCount: 3,
        passedCount: 3,
        graderModel: "claude-haiku",
        blueprintVersion: null,
        resultsSummary: [],
        createdAt: new Date(),
      }) as never,
      hasSucceededSupervisedRun: async () => true,
    },
    isLifecycleEnabled: false,
    ...over,
  };
}

describe("resolvePublishGuard", () => {
  test("unauthorized when there is no logged-in org", async () => {
    const result = await resolvePublishGuard(
      baseDeps({ getOrgId: async () => null }),
      { templateId: TEMPLATE_ID },
    );
    assert.deepEqual(result, { ok: false, error: "unauthorized" });
  });

  test("unauthorized when there is no current user", async () => {
    const result = await resolvePublishGuard(
      baseDeps({ getCurrentUser: async () => null }),
      { templateId: TEMPLATE_ID },
    );
    assert.deepEqual(result, { ok: false, error: "unauthorized" });
  });

  test("invalid on a blank templateId", async () => {
    const result = await resolvePublishGuard(baseDeps(), { templateId: "   " });
    assert.deepEqual(result, { ok: false, error: "invalid" });
  });

  test("template_not_found when the org-guarded lookup returns nothing", async () => {
    const result = await resolvePublishGuard(
      baseDeps({ loadTemplate: async () => null }),
      { templateId: TEMPLATE_ID },
    );
    assert.deepEqual(result, { ok: false, error: "template_not_found" });
  });

  // ── the lifecycle gate itself ────────────────────────────────────────────

  test("flag ON + gate missing (no eval pass, no supervised run) -> blocked as lifecycle_gate, no write path reachable", async () => {
    let loadTemplateCalls = 0;
    const result = await resolvePublishGuard(
      baseDeps({
        loadTemplate: async () => {
          loadTemplateCalls += 1;
          return fakeTemplate();
        },
        lifecycleGateDeps: {
          getLatestEvalRun: async () => null,
          hasSucceededSupervisedRun: async () => false,
        },
        isLifecycleEnabled: true,
      }),
      { templateId: TEMPLATE_ID },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "lifecycle_gate");
    if (result.error === "lifecycle_gate") {
      assert.deepEqual(result.missing.sort(), ["eval_pass", "supervised_run"]);
    }
    // The org-guarded template lookup still ran (needed to resolve the gate
    // inputs) but resolvePublishGuard itself never writes anything — it is
    // the entire guard the real action's insert/update path sits behind, so
    // a block here means the caller's early `if (!guard.ok) return guard`
    // is the only code path taken; the listing write is unreachable.
    assert.equal(loadTemplateCalls, 1);
  });

  test("flag ON + gate PARTIALLY missing (eval passes, no supervised run) -> still blocked", async () => {
    const result = await resolvePublishGuard(
      baseDeps({
        lifecycleGateDeps: {
          getLatestEvalRun: async () => ({ passRate: 100, scenarioCount: 3 } as never),
          hasSucceededSupervisedRun: async () => false,
        },
        isLifecycleEnabled: true,
      }),
      { templateId: TEMPLATE_ID },
    );
    assert.deepEqual(result, { ok: false, error: "lifecycle_gate", missing: ["supervised_run"] });
  });

  test("flag ON + gate satisfied (eval passes, supervised run succeeded) -> proceeds", async () => {
    const result = await resolvePublishGuard(baseDeps({ isLifecycleEnabled: true }), {
      templateId: TEMPLATE_ID,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.orgId, ORG_ID);
    assert.equal(result.template.id, TEMPLATE_ID);
  });

  // ── F-D exemption (2026-07-11, opus-review gate regression) ────────────────
  // A tool-free (pure-chat) template's supervised-run requirement is exempt
  // — this server-side publish gate must match the Run stage's ladder badge
  // exactly, so this wiring is proven here too, not just in gate.spec.ts.

  test("F-D: flag ON, tool-free template (blank blueprint), eval passes, no supervised run -> proceeds (exempt)", async () => {
    const result = await resolvePublishGuard(
      baseDeps({
        loadTemplate: async () => fakeTemplate({ blueprint: {} }),
        lifecycleGateDeps: {
          getLatestEvalRun: async () => ({ passRate: 100, scenarioCount: 3 } as never),
          hasSucceededSupervisedRun: async () => false,
        },
        isLifecycleEnabled: true,
      }),
      { templateId: TEMPLATE_ID },
    );
    assert.equal(result.ok, true);
  });

  test("F-D: flag ON, tool-free template, eval FAILS -> still blocked on eval_pass only", async () => {
    const result = await resolvePublishGuard(
      baseDeps({
        loadTemplate: async () => fakeTemplate({ blueprint: {} }),
        lifecycleGateDeps: {
          getLatestEvalRun: async () => null,
          hasSucceededSupervisedRun: async () => false,
        },
        isLifecycleEnabled: true,
      }),
      { templateId: TEMPLATE_ID },
    );
    assert.deepEqual(result, { ok: false, error: "lifecycle_gate", missing: ["eval_pass"] });
  });

  test("flag OFF -> proceeds regardless of the gate (dark-ship, zero behavior change)", async () => {
    const result = await resolvePublishGuard(
      baseDeps({
        lifecycleGateDeps: {
          getLatestEvalRun: async () => null,
          hasSucceededSupervisedRun: async () => false,
        },
        isLifecycleEnabled: false,
      }),
      { templateId: TEMPLATE_ID },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.template.id, TEMPLATE_ID);
  });
});
