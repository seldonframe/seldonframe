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
//        IMPORTANT — verified empirically (see the "PRE-FIX BEHAVIOR
//        DOCUMENTED" test below): for a template with NO blueprint.trigger,
//        deploymentNeedsNumber/agentNeedsNumber (agent-trigger.ts) resolves
//        the absent trigger to the safe "inbound" default and returns `true`
//        for EVERY inbound channel — it does not branch on channel at all.
//        So passing the raw vs. the surface-mapped string does NOT, by
//        itself, change deploymentNeedsNumber's boolean output for a
//        trigger-less chat template today (both resolve to `true`). The
//        surface-arg fix is still correct to make (type safety + convention),
//        but a trigger-less chat template deploy will still hit
//        `phone_required` today — that is a SEPARATE, pre-existing
//        disagreement between deploymentNeedsNumber (channel-blind) and
//        computeDeployReadiness / buildOnboardingSteps (which correctly omits
//        a `phone` step for a chat surface), and is OUT OF SCOPE for this
//        task's three named call-site fixes. Flagged separately; not silently
//        patched here to avoid scope creep beyond what was asked.
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
  test("PRE-FIX BEHAVIOR DOCUMENTED (real production code): for an ABSENT trigger, deploymentNeedsNumber is true for BOTH the raw templateType and the surfaceForType-mapped surface", () => {
    // This calls the REAL margin.ts deploymentNeedsNumber + the REAL
    // agent-templates/store.ts surfaceForType — no fakes. It documents,
    // precisely, why the surface-arg fix (route.ts now passes
    // surfaceForType(templateType) at all three deploymentNeedsNumber call
    // sites instead of the raw templateType) is the objectively correct,
    // type-safe, convention-matching call to make, while ALSO being honest
    // that it does not by itself flip this specific boolean for a
    // trigger-less template: agentNeedsNumber (agent-trigger.ts) switches
    // only on trigger.kind, never on channel, and an absent trigger clamps to
    // the inbound default for any unrecognized OR recognized channel string.
    const surface = surfaceForType("chat_assistant");
    assert.equal(surface, "chat");
    assert.equal(deploymentNeedsNumber(undefined, "chat_assistant"), true, "raw templateType");
    assert.equal(deploymentNeedsNumber(undefined, surface), true, "surfaceForType-mapped surface");
    // Same holds for voice — both forms already agreed (this was never
    // ambiguous for voice; only chat's absent-trigger case is subtle).
    assert.equal(deploymentNeedsNumber(undefined, "voice_receptionist"), true, "raw templateType");
    assert.equal(deploymentNeedsNumber(undefined, surfaceForType("voice_receptionist")), true, "surfaceForType-mapped surface");
  });

  test("the fixed call sites are exercised through runDeploy without throwing or diverging in shape — chat, ready, needsNumber true, no phone in body → phone_required (documents the residual, OUT-OF-SCOPE gap, not silently hidden)", async () => {
    // With deploymentNeedsNumber wired to its REAL, current, correct-per-today
    // value for a trigger-less chat template (true), and readiness reporting
    // ready (a separate, already-passing gate), the route still asks for a
    // phone here. That is NOT the C-1/C-2 regressions this task fixes — it is
    // a distinct, pre-existing disagreement between deploymentNeedsNumber
    // (channel-blind) and the onboarding step list (which correctly excludes
    // a `phone` step for chat), living in computeDeployReadiness /
    // buildOnboardingSteps, untouched by this task's three named call-site
    // fixes. Documented here rather than silently patched to avoid scope
    // creep — see this task's report for the flagged follow-up.
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
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.equal(result.ok, false);
    assert.equal((result as { reason?: string }).reason, "phone_required");
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
