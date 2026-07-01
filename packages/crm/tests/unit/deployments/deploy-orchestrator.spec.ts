// Route-level orchestration test for POST /api/v1/build/deploy — the SPEC-
// MANDATED test that was missing and let two Critical regressions through:
//
//   C-1: after a phone is attached, go-live stayed permanently "blocked"
//        because the `phone` onboarding step was never marked done outside
//        the buyer wizard's markStepDoneAction. Fixed in route.ts's
//        applyGoLive: an attached deployment.phoneNumber now counts as the
//        `phone` step being done for the go-live blocker check.
//
//   C-2: the route's THREE deploymentNeedsNumber call sites (route.ts,
//        mirrored in deploy-orchestrator.ts's buildRealRunDeployDeps) were
//        passing the RAW templateType ("chat_assistant"/"voice_receptionist")
//        as the surface-fallback argument instead of the surface-mapped value
//        (surfaceForType(templateType) = "chat"/"voice"). That argument
//        mismatch is fixed at all three sites — it is the objectively
//        correct, type-correct call, and it matches the convention already
//        used by deploy-readiness-deps.ts (surfaceForType(type) at line 35).
//
//        FOLLOW-UP FIX (now closed): the surface-arg fix alone was NOT
//        sufficient — for a template with NO blueprint.trigger,
//        deploymentNeedsNumber/agentNeedsNumber (agent-trigger.ts) resolved
//        the absent trigger to the safe "inbound" default and used to return
//        `true` for EVERY inbound channel (it didn't branch on channel at
//        all), so a trigger-less CHAT template still hit `phone_required`
//        even with the surface-arg fix in place. Root-caused and fixed in
//        agent-trigger.ts: `agentNeedsNumber`'s inbound case now returns
//        `trigger.channel === "voice" || trigger.channel === "sms"` — only
//        those two channels RECEIVE on a phone line/number; inbound chat
//        receives on a web widget and inbound email on an inbox, so neither
//        needs one. See the "the C-2 fix: a trigger-less chat template
//        resolves to needing NO phone" test below for the corrected,
//        end-to-end behavior (chat → status:"live", not phone_required).
//
// `runDeploy` (src/lib/deployments/deploy-orchestrator.ts) is the extracted,
// DI'd core orchestration the route wires with real seams; here every seam is
// FAKE (no Postgres, no Twilio, no Composio) so these assert pure control
// flow.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  runDeploy,
  statusForDeployResult,
  type RunDeployDeps,
  type ResolvedSource,
  type ApplyPhoneResult,
} from "../../../src/lib/deployments/deploy-orchestrator";
import type { DeployReadiness } from "../../../src/lib/deployments/deploy-readiness";
import type { Deployment } from "../../../src/db/schema/deployments";
import type { AgentBlueprint } from "../../../src/db/schema/agents";
import { deploymentNeedsNumber } from "../../../src/lib/deployments/margin";
import { surfaceForType } from "../../../src/lib/agent-templates/store";

// ─── fixtures ────────────────────────────────────────────────────────────────

function fakeDeployment(over: Partial<Deployment> = {}): Deployment {
  return {
    id: "dep-1",
    builderOrgId: "org-1",
    agentTemplateId: "tmpl-1",
    clientName: "Acme Plumbing",
    clientContact: null,
    surface: "phone",
    phoneNumber: null,
    phoneNumberSid: null,
    numberOrigin: null,
    calendarRef: null,
    bookingMode: "native",
    externalBookingUrl: null,
    bookingPolicy: null,
    customization: null,
    clientContext: null,
    priceCents: 0,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    clientOrgId: null,
    portalInvitedAt: null,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Deployment;
}

const READY: DeployReadiness = {
  ready: true,
  requirements: [],
  missing: [],
  wizardPath: "/agent/dep-1/setup",
};

const NOT_READY: DeployReadiness = {
  ready: false,
  requirements: [{ kind: "business_info", met: false, label: "Business info" }],
  missing: [{ kind: "business_info", met: false, label: "Business info" }],
  wizardPath: "/agent/dep-1/setup",
};

/** A deps object where every seam is a FAKE — override only what a test cares
 *  about. Defaults to the "everything ready, no phone needed, go-live
 *  succeeds" happy path so each test overrides only its point of interest. */
function fakeDeps(overrides: Partial<RunDeployDeps> = {}): RunDeployDeps {
  return {
    deployEnabled: () => true,
    resolveSource: async () => ({
      ok: true,
      deployment: fakeDeployment(),
      templateType: "chat_assistant",
      blueprint: {} as AgentBlueprint,
    }),
    resolveDeployReadiness: async () => READY,
    deploymentNeedsNumber: () => false,
    applyPhone: async () => ({ ok: true, deployment: fakeDeployment({ phoneNumber: "+15125550148" }) }),
    wizardUrlFor: (wizardPath) => `https://app.seldonframe.com${wizardPath}`,
    applyGoLive: async (deployment) => ({ ok: true, deployment }),
    ...overrides,
  };
}

// ─── C-1 regression: attached phone must NOT stay go-live "blocked" ─────────

describe("runDeploy — C-1: voice deploy with a freshly-attached number goes live", () => {
  test("voice template + phone:forward + creds present + ready → status:live (NOT blocked)", async () => {
    // Mirrors the pre-fix bug exactly: a correct fake models the FIXED
    // applyGoLive behavior (an attached phoneNumber satisfies the `phone`
    // onboarding step) by returning ok:true once phoneNumber is set. Before
    // the C-1 fix, route.ts's applyGoLive read the onboarding progress
    // WITHOUT accounting for the just-attached number, so it always returned
    // {ok:false, reason:"blocked"} here — see the next test for that exact
    // unfixed behavior reproduced.
    let appliedPhoneDeployment: Deployment | null = null;
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ surface: "phone", phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true, // an inbound voice receptionist needs a number
      applyPhone: async (_orgId, deployment) => {
        // Simulates applyForwardedNumber: attaches the number + flips active.
        const updated = fakeDeployment({ ...deployment, phoneNumber: "+15125550148", status: "active" });
        appliedPhoneDeployment = updated;
        return { ok: true, deployment: updated };
      },
      // The FIXED applyGoLive: an attached phoneNumber counts as the `phone`
      // step done, so go-live succeeds instead of reporting "blocked".
      applyGoLive: async (deployment) => {
        if (deployment.phoneNumber) {
          return { ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) };
        }
        return { ok: false, reason: "blocked" };
      },
    });

    const result = await runDeploy(
      { orgId: "org-1", body: { source: { templateId: "tmpl-1" }, phone: { mode: "forward", number: "+15125550148" } } },
      deps,
    );

    assert.equal(result.ok, true);
    assert.equal((result as { status?: string }).status, "live", `expected status:"live", got ${JSON.stringify(result)}`);
    assert.notEqual((result as { reason?: string }).reason, "blocked");
    assert.ok(appliedPhoneDeployment, "applyPhone should have been invoked");
    assert.equal(statusForDeployResult(result), 200);
  });

  test("regression guard: an UNFIXED applyGoLive (ignores the attached number) reproduces blocked", async () => {
    // This test intentionally wires the OLD buggy behavior to prove the test
    // harness actually discriminates fixed vs. unfixed — it must FAIL to go
    // live even though a phone was just attached, exactly like the pre-fix
    // route.
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ surface: "phone", phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      applyPhone: async (_orgId, deployment) => ({
        ok: true,
        deployment: fakeDeployment({ ...deployment, phoneNumber: "+15125550148", status: "active" }),
      }),
      // The UNFIXED behavior: go-live blocked regardless of the attached number.
      applyGoLive: async () => ({ ok: false, reason: "blocked" }),
    });

    const result = await runDeploy(
      { orgId: "org-1", body: { source: { templateId: "tmpl-1" }, phone: { mode: "forward", number: "+15125550148" } } },
      deps,
    );

    assert.equal(result.ok, false);
    assert.equal((result as { reason?: string }).reason, "blocked");
  });
});

// ─── C-2: the surface-arg fix at the three named call sites ─────────────────

describe("runDeploy — C-2: the surface-arg fix (deploymentNeedsNumber receives the mapped surface, not the raw templateType)", () => {
  test("the C-2 fix (real production code): for an ABSENT trigger, the surfaceForType-mapped chat surface resolves to needing NO phone (the raw templateType string still doesn't match a known channel, which is WHY the surface-arg fix matters)", () => {
    // This calls the REAL margin.ts deploymentNeedsNumber + the REAL
    // agent-templates/store.ts surfaceForType — no fakes. It documents the
    // fully-closed C-2 fix, which needs BOTH companion changes together:
    //   1. the surface-arg fix (already landed): pass surfaceForType(type)
    //      ("chat"/"voice"), not the raw templateType string
    //      ("chat_assistant"/"voice_receptionist") — the raw string is not a
    //      recognized channel, so it falls back to the safe inbound-VOICE
    //      default regardless of the actual surface, which is why it STILL
    //      shows true below (a separate, pre-existing quirk of that
    //      fallback — not what this task's fix targets).
    //   2. THIS task's fix: agentNeedsNumber's inbound case (agent-trigger.ts)
    //      now branches on trigger.channel — voice/sms → true, chat/email →
    //      false — so once surfaceForType correctly resolves the channel to
    //      "chat", the trigger-less chat template needs NO phone.
    const chatSurface = surfaceForType("chat_assistant");
    assert.equal(chatSurface, "chat");
    // The raw templateType doesn't match a known channel → falls back to the
    // inbound-voice default → still true. This is unaffected by this task's
    // fix; it is exactly the gap the (already-landed) surface-arg fix exists
    // to close by passing the MAPPED surface instead, asserted next.
    assert.equal(deploymentNeedsNumber(undefined, "chat_assistant"), true, "raw templateType (unmapped, falls back to inbound-voice default)");
    assert.equal(deploymentNeedsNumber(undefined, chatSurface), false, "surfaceForType-mapped surface (THIS fix: chat correctly needs no phone)");
    // Voice is unaffected — both forms still agree, and still need a number.
    assert.equal(deploymentNeedsNumber(undefined, "voice_receptionist"), true, "raw templateType");
    assert.equal(deploymentNeedsNumber(undefined, surfaceForType("voice_receptionist")), true, "surfaceForType-mapped surface");
  });

  test("the fixed call sites are exercised through runDeploy — chat, ready, no trigger stored (needsNumber now correctly FALSE), no phone in body → status:live (C-2 closed, not phone_required)", async () => {
    // With deploymentNeedsNumber wired to its REAL, current, CORRECT value for
    // a trigger-less chat template (false, post-fix), and readiness reporting
    // ready (a separate, already-passing gate), the route no longer asks for
    // a phone — it goes straight to live. This is the real C-2 regression
    // path: a chat deploy must not hit phone_required.
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ surface: "embed", phoneNumber: null }),
        templateType: "chat_assistant",
        blueprint: {} as AgentBlueprint, // no trigger — every chat starter-fork ships this way
      }),
      resolveDeployReadiness: async () => READY,
      deploymentNeedsNumber: (blueprint, templateType) =>
        deploymentNeedsNumber(blueprint.trigger, surfaceForType(templateType as "voice_receptionist" | "chat_assistant")),
      applyGoLive: async (deployment) => ({ ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) }),
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.equal(result.ok, true);
    assert.equal((result as { status?: string }).status, "live");
    assert.notEqual((result as { reason?: string }).reason, "phone_required");
  });

  test("voice template + inbound trigger + surfaceForType-mapped surface → needsNumber true (voice's correct, unaffected behavior)", async () => {
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ surface: "phone", phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: (blueprint, templateType) =>
        deploymentNeedsNumber(blueprint.trigger, surfaceForType(templateType as "voice_receptionist" | "chat_assistant")),
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.equal(result.ok, false);
    assert.equal((result as { reason?: string }).reason, "phone_required", "a voice receptionist genuinely needs a number");
  });

  test("event trigger (missed_call) + surfaceForType-mapped surface → needsNumber true regardless of surface (the missed-call carve-out, unaffected)", async () => {
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ surface: "sms", phoneNumber: null }),
        templateType: "chat_assistant",
        blueprint: { trigger: { kind: "event", event: "missed_call", channel: "sms" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: (blueprint, templateType) =>
        deploymentNeedsNumber(blueprint.trigger, surfaceForType(templateType as "voice_receptionist" | "chat_assistant")),
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.equal(result.ok, false);
    assert.equal((result as { reason?: string }).reason, "phone_required");
  });

  test("pure-outbound event trigger (booking.completed) → needsNumber false, no phone asked, deploy is live", async () => {
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ surface: "sms", phoneNumber: null }),
        templateType: "chat_assistant",
        blueprint: { trigger: { kind: "event", event: "booking.completed", channel: "sms" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: (blueprint, templateType) =>
        deploymentNeedsNumber(blueprint.trigger, surfaceForType(templateType as "voice_receptionist" | "chat_assistant")),
      applyGoLive: async (deployment) => ({ ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) }),
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.equal(result.ok, true);
    assert.equal((result as { status?: string }).status, "live");
  });
});

// ─── readiness gate ──────────────────────────────────────────────────────────

describe("runDeploy — readiness gate", () => {
  test("readiness not ready → status:needs_connect with a wizardUrl", async () => {
    const deps = fakeDeps({
      resolveDeployReadiness: async () => NOT_READY,
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.equal(result.ok, true);
    assert.equal((result as { status?: string }).status, "needs_connect");
    const needsConnect = result as { deploymentId: string; wizardUrl: string; missing: unknown[] };
    assert.equal(needsConnect.deploymentId, "dep-1");
    assert.equal(needsConnect.wizardUrl, "https://app.seldonframe.com/agent/dep-1/setup");
    assert.equal(needsConnect.missing.length, 1);
    assert.equal(statusForDeployResult(result), 200);
  });
});

// ─── flag gate ───────────────────────────────────────────────────────────────

describe("runDeploy — flag gate", () => {
  test("SF_DEPLOY_ENABLED off → status:disabled, no seams invoked", async () => {
    let resolveSourceCalled = false;
    const deps = fakeDeps({
      deployEnabled: () => false,
      resolveSource: async () => {
        resolveSourceCalled = true;
        return { ok: true, deployment: fakeDeployment(), templateType: "chat_assistant", blueprint: {} as AgentBlueprint };
      },
    });

    const result = await runDeploy({ orgId: "org-1", body: {} }, deps);

    assert.deepEqual(result, { ok: true, status: "disabled" });
    assert.equal(resolveSourceCalled, false, "flag-off must short-circuit before touching any other seam");
    assert.equal(statusForDeployResult(result), 200);
  });
});

// ─── source resolution errors (status code mapping) ─────────────────────────

describe("runDeploy — source resolution errors", () => {
  test("invalid_source → 400", async () => {
    const deps = fakeDeps({
      resolveSource: async (): Promise<ResolvedSource> => ({ ok: false, reason: "invalid_source" }),
    });
    const result = await runDeploy({ orgId: "org-1", body: {} }, deps);
    assert.deepEqual(result, { ok: false, reason: "invalid_source" });
    assert.equal(statusForDeployResult(result), 400);
  });

  test("template_not_found → 404", async () => {
    const deps = fakeDeps({
      resolveSource: async (): Promise<ResolvedSource> => ({ ok: false, reason: "template_not_found" }),
    });
    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "nope" } } }, deps);
    assert.deepEqual(result, { ok: false, reason: "template_not_found" });
    assert.equal(statusForDeployResult(result), 404);
  });
});

// ─── phone application errors pass through with `missing` ────────────────────

describe("runDeploy — phone application errors", () => {
  test("needs a number, none attached, phone provided, applyPhone fails → the phone error (with missing)", async () => {
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      applyPhone: async (): Promise<ApplyPhoneResult> => ({
        ok: false,
        reason: "needs_telephony",
        missing: ["twilio"],
      }),
    });

    const result = await runDeploy(
      { orgId: "org-1", body: { source: { templateId: "tmpl-1" }, phone: { mode: "provision", areaCode: "512" } } },
      deps,
    );

    assert.deepEqual(result, { ok: false, reason: "needs_telephony", missing: ["twilio"] });
    assert.equal(statusForDeployResult(result), 400);
  });
});
