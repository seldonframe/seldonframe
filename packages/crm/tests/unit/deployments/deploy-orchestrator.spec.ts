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
  type ProvisionSfManagedIfAvailableResult,
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
    // Default: Tier-0 is simply not configured/offered — every pre-Task-10
    // test (and any test that doesn't care about Tier-0) sees zero behavior
    // change, since `available:false` always falls straight through to the
    // pre-existing phone_required / applyPhone-failure handling.
    provisionSfManagedIfAvailable: async () => ({ ok: false, available: false }),
    // T10-review F2: default to "no BYO creds" so every pre-existing test
    // (written before this dep existed) keeps exercising the Tier-0 path
    // exactly as before — the gate only changes behavior for tests that
    // explicitly flip this to `true`.
    hasByoTelephony: async () => false,
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
  test("needs a number, none attached, phone provided, applyPhone fails, Tier-0 NOT available → the original phone error passes through unchanged (with missing)", async () => {
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
      // Tier-0 not configured/available — must fall straight through to the
      // pre-existing applyPhone failure, byte-for-byte.
      provisionSfManagedIfAvailable: async () => ({ ok: false, available: false }),
    });

    const result = await runDeploy(
      { orgId: "org-1", body: { source: { templateId: "tmpl-1" }, phone: { mode: "provision", areaCode: "512" } } },
      deps,
    );

    assert.deepEqual(result, { ok: false, reason: "needs_telephony", missing: ["twilio"] });
    assert.equal(statusForDeployResult(result), 400);
  });
});

// ─── Task 10: Tier-0 (SF-managed) deploy-verb payoff ────────────────────────
// Funded wallet ⇒ instant SF number ⇒ live, with ZERO connects. Tier-0 is
// attempted as a fallback exactly where the flow would otherwise require BYO
// Twilio: (a) no `phone` in the body at all (today: phone_required), and
// (b) applyPhone failing specifically because BYO creds are missing (today:
// needs_telephony passes straight through). `available:false` (Tier-0 not
// configured/offered) is a no-op fallthrough in BOTH cases — the flag-off
// byte-identical-behavior guarantee.

describe("runDeploy — Task 10: Tier-0-managed provisioning", () => {
  test("funded wallet + no BYO creds + NO phone in body → Tier-0 invoked, number attached, phone step done like BYO, goes live", async () => {
    let tier0Called: { orgId: string; deploymentId: string } | null = null;
    let appliedPhoneDeployment: Deployment | null = null;

    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ surface: "phone", phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      provisionSfManagedIfAvailable: async (orgId, deployment): Promise<ProvisionSfManagedIfAvailableResult> => {
        tier0Called = { orgId, deploymentId: deployment.id };
        const updated = fakeDeployment({ ...deployment, phoneNumber: "+15125550199", status: "active" });
        appliedPhoneDeployment = updated;
        return { ok: true, deployment: updated };
      },
      // Mirrors the FIXED applyGoLive from the C-1 suite: an attached
      // phoneNumber (however it got attached — BYO or Tier-0) satisfies the
      // `phone` onboarding step.
      applyGoLive: async (deployment) => {
        if (deployment.phoneNumber) {
          return { ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) };
        }
        return { ok: false, reason: "blocked" };
      },
    });

    const result = await runDeploy(
      { orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, // NO phone — zero connects
      deps,
    );

    assert.ok(tier0Called, "provisionSfManagedIfAvailable should have been invoked");
    const tier0Call = tier0Called as { orgId: string; deploymentId: string };
    assert.equal(tier0Call.orgId, "org-1");
    assert.equal(tier0Call.deploymentId, "dep-1");
    assert.ok(appliedPhoneDeployment, "Tier-0 should have attached a number");
    assert.equal(result.ok, true);
    assert.equal((result as { status?: string }).status, "live", `expected live, got ${JSON.stringify(result)}`);
    assert.equal((result as { phoneNumber?: string | null }).phoneNumber, "+15125550199");
    assert.equal(statusForDeployResult(result), 200);
  });

  test("unfunded wallet (Tier-0 NOT available) + no BYO + no phone in body → phone_required, exactly like before Task 10", async () => {
    let tier0Called = false;
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      provisionSfManagedIfAvailable: async (): Promise<ProvisionSfManagedIfAvailableResult> => {
        tier0Called = true;
        return { ok: false, available: false };
      },
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.ok(tier0Called, "Tier-0 should still be consulted before falling back to phone_required");
    assert.deepEqual(result, { ok: false, reason: "phone_required" });
    assert.equal(statusForDeployResult(result), 400);
  });

  test("Tier-0 available but rent-refused (insufficient_balance) ⇒ {ok:false, reason:\"insufficient_balance\"} — rides the existing error shape", async () => {
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      provisionSfManagedIfAvailable: async (): Promise<ProvisionSfManagedIfAvailableResult> => ({
        ok: false,
        available: true,
        reason: "insufficient_balance",
      }),
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.deepEqual(result, { ok: false, reason: "insufficient_balance" });
    assert.equal(statusForDeployResult(result), 400);
  });

  test("Tier-0 available but Twilio-side failure (twilio_error) ⇒ {ok:false, reason:\"twilio_error\"}", async () => {
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      provisionSfManagedIfAvailable: async (): Promise<ProvisionSfManagedIfAvailableResult> => ({
        ok: false,
        available: true,
        reason: "twilio_error",
      }),
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.deepEqual(result, { ok: false, reason: "twilio_error" });
    assert.equal(statusForDeployResult(result), 400);
  });

  test("no_numbers_available (Controller-A taxonomy) surfaces through runDeploy untouched", async () => {
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      provisionSfManagedIfAvailable: async (): Promise<ProvisionSfManagedIfAvailableResult> => ({
        ok: false,
        available: true,
        reason: "no_numbers_available",
      }),
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.deepEqual(result, { ok: false, reason: "no_numbers_available" });
  });

  test("body.phone IS provided (mode:provision) but applyPhone fails needs_telephony, Tier-0 available and succeeds → Tier-0 wins, goes live", async () => {
    // Documents the brief's \"instead\" — even when the caller supplied a
    // provision request, a missing-BYO-creds failure still gets the Tier-0
    // fallback rescue, not just the zero-body-phone path.
    let applyPhoneCalled = false;
    let tier0Called = false;
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      applyPhone: async (): Promise<ApplyPhoneResult> => {
        applyPhoneCalled = true;
        return { ok: false, reason: "needs_telephony", missing: ["twilio"] };
      },
      provisionSfManagedIfAvailable: async (_orgId, deployment): Promise<ProvisionSfManagedIfAvailableResult> => {
        tier0Called = true;
        return { ok: true, deployment: fakeDeployment({ ...deployment, phoneNumber: "+15125550111", status: "active" }) };
      },
      applyGoLive: async (deployment) => ({ ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) }),
    });

    const result = await runDeploy(
      { orgId: "org-1", body: { source: { templateId: "tmpl-1" }, phone: { mode: "provision", areaCode: "512" } } },
      deps,
    );

    assert.ok(applyPhoneCalled, "applyPhone (the BYO path) should still be tried first");
    assert.ok(tier0Called, "Tier-0 should rescue the needs_telephony failure");
    assert.equal(result.ok, true);
    assert.equal((result as { status?: string }).status, "live");
    assert.equal((result as { phoneNumber?: string | null }).phoneNumber, "+15125550111");
  });

  test("flag off (SF_DEPLOY_ENABLED=false via deployEnabled) → status:disabled, provisionSfManagedIfAvailable NEVER invoked", async () => {
    let tier0Called = false;
    const deps = fakeDeps({
      deployEnabled: () => false,
      provisionSfManagedIfAvailable: async (): Promise<ProvisionSfManagedIfAvailableResult> => {
        tier0Called = true;
        return { ok: false, available: false };
      },
    });

    const result = await runDeploy({ orgId: "org-1", body: {} }, deps);

    assert.deepEqual(result, { ok: true, status: "disabled" });
    assert.equal(tier0Called, false, "flag-off must short-circuit before touching any seam, Tier-0 included");
  });

  test("chat template needing NO number at all never consults Tier-0 (byte-identical prior behavior)", async () => {
    let tier0Called = false;
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ surface: "embed", phoneNumber: null }),
        templateType: "chat_assistant",
        blueprint: {} as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => false,
      provisionSfManagedIfAvailable: async (): Promise<ProvisionSfManagedIfAvailableResult> => {
        tier0Called = true;
        return { ok: false, available: false };
      },
      applyGoLive: async (deployment) => ({ ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) }),
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.equal(tier0Called, false, "a deployment that needs no number must never touch the Tier-0 seam");
    assert.equal(result.ok, true);
    assert.equal((result as { status?: string }).status, "live");
  });

  test("deployment already HAS a phoneNumber → never consults Tier-0 (byte-identical prior behavior)", async () => {
    let tier0Called = false;
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ surface: "phone", phoneNumber: "+15125550148" }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      provisionSfManagedIfAvailable: async (): Promise<ProvisionSfManagedIfAvailableResult> => {
        tier0Called = true;
        return { ok: false, available: false };
      },
      applyGoLive: async (deployment) => ({ ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) }),
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.equal(tier0Called, false, "an already-numbered deployment must never touch the Tier-0 seam");
    assert.equal(result.ok, true);
    assert.equal((result as { status?: string }).status, "live");
  });
});

// ─── T10 review, F1: the rescue must be CONSENT-SCOPED to needs_telephony ───
// The 4b rescue used to fire on ANY applyPhone failure — an `invalid_phone`
// typo, `phone_in_use`, `invalid_area_code`, or a BYO `attach_failed` could
// all get "rescued" into an unconsented SF-managed number purchase (and, on
// BYO attach_failed, a double-acquisition). The rescue may fire ONLY when the
// failure reason is exactly `needs_telephony` — the one case that actually
// means "no BYO creds configured", which is the whole reason Tier-0 exists.
// Every other reason must pass through UNCHANGED, with the Tier-0 seam never
// even invoked (not just "invoked but ignored" — a real consent boundary).

describe("runDeploy — T10 review F1: Tier-0 rescue scoped to needs_telephony only", () => {
  test("applyPhone fails invalid_phone (a typo) + Tier-0 available → the ORIGINAL invalid_phone passes through; Tier-0 seam NEVER invoked", async () => {
    let tier0Called = false;
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      applyPhone: async (): Promise<ApplyPhoneResult> => ({ ok: false, reason: "invalid_phone" }),
      // Tier-0 IS available (funded wallet) — but must not be consulted for a
      // typo'd phone number. If the orchestrator wrongly invokes this, the
      // test fails via tier0Called.
      provisionSfManagedIfAvailable: async (): Promise<ProvisionSfManagedIfAvailableResult> => {
        tier0Called = true;
        return { ok: true, deployment: fakeDeployment({ phoneNumber: "+15125559999" }) };
      },
    });

    const result = await runDeploy(
      { orgId: "org-1", body: { source: { templateId: "tmpl-1" }, phone: { mode: "forward", number: "not-a-number" } } },
      deps,
    );

    assert.equal(tier0Called, false, "an unconsented SF-managed purchase must never be triggered by a phone typo");
    assert.equal(result.ok, false);
    assert.equal((result as { reason?: string }).reason, "invalid_phone");
  });

  test("applyPhone fails phone_in_use + Tier-0 available → the ORIGINAL phone_in_use passes through; Tier-0 seam NEVER invoked", async () => {
    let tier0Called = false;
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      applyPhone: async (): Promise<ApplyPhoneResult> => ({ ok: false, reason: "phone_in_use" }),
      provisionSfManagedIfAvailable: async (): Promise<ProvisionSfManagedIfAvailableResult> => {
        tier0Called = true;
        return { ok: true, deployment: fakeDeployment({ phoneNumber: "+15125559999" }) };
      },
    });

    const result = await runDeploy(
      { orgId: "org-1", body: { source: { templateId: "tmpl-1" }, phone: { mode: "forward", number: "+15125550148" } } },
      deps,
    );

    assert.equal(tier0Called, false, "phone_in_use must never be rescued into a purchase");
    assert.equal(result.ok, false);
    assert.equal((result as { reason?: string }).reason, "phone_in_use");
  });

  test("applyPhone fails invalid_area_code + Tier-0 available → the ORIGINAL invalid_area_code passes through; Tier-0 seam NEVER invoked", async () => {
    let tier0Called = false;
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      applyPhone: async (): Promise<ApplyPhoneResult> => ({ ok: false, reason: "invalid_area_code" }),
      provisionSfManagedIfAvailable: async (): Promise<ProvisionSfManagedIfAvailableResult> => {
        tier0Called = true;
        return { ok: true, deployment: fakeDeployment({ phoneNumber: "+15125559999" }) };
      },
    });

    const result = await runDeploy(
      { orgId: "org-1", body: { source: { templateId: "tmpl-1" }, phone: { mode: "provision", areaCode: "9" } } },
      deps,
    );

    assert.equal(tier0Called, false, "invalid_area_code must never be rescued into a purchase");
    assert.equal(result.ok, false);
    assert.equal((result as { reason?: string }).reason, "invalid_area_code");
  });

  test("BYO provision fails attach_failed (Twilio-side, creds WERE present) + Tier-0 available → the ORIGINAL attach_failed passes through; Tier-0 seam NEVER invoked (no double-acquisition)", async () => {
    let tier0Called = false;
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      applyPhone: async (): Promise<ApplyPhoneResult> => ({ ok: false, reason: "attach_failed" }),
      provisionSfManagedIfAvailable: async (): Promise<ProvisionSfManagedIfAvailableResult> => {
        tier0Called = true;
        return { ok: true, deployment: fakeDeployment({ phoneNumber: "+15125559999" }) };
      },
    });

    const result = await runDeploy(
      { orgId: "org-1", body: { source: { templateId: "tmpl-1" }, phone: { mode: "provision", areaCode: "512" } } },
      deps,
    );

    assert.equal(tier0Called, false, "a BYO-side Twilio failure must never trigger a second (SF-managed) acquisition");
    assert.equal(result.ok, false);
    assert.equal((result as { reason?: string }).reason, "attach_failed");
  });

  test("applyPhone fails needs_telephony (the ONE consented case) + Tier-0 available → Tier-0 STILL rescues, goes live (unchanged from before this fix)", async () => {
    let tier0Called = false;
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      applyPhone: async (): Promise<ApplyPhoneResult> => ({ ok: false, reason: "needs_telephony", missing: ["twilio"] }),
      provisionSfManagedIfAvailable: async (_orgId, deployment): Promise<ProvisionSfManagedIfAvailableResult> => {
        tier0Called = true;
        return { ok: true, deployment: fakeDeployment({ ...deployment, phoneNumber: "+15125559999", status: "active" }) };
      },
      applyGoLive: async (deployment) => ({ ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) }),
    });

    const result = await runDeploy(
      { orgId: "org-1", body: { source: { templateId: "tmpl-1" }, phone: { mode: "provision", areaCode: "512" } } },
      deps,
    );

    assert.ok(tier0Called, "needs_telephony is the ONE reason the rescue must still fire for");
    assert.equal(result.ok, true);
    assert.equal((result as { status?: string }).status, "live");
  });

  test("no body.phone at all (the 4a zero-connect path) + Tier-0 available → STILL rescues (needs_telephony scoping applies only to the 4b applyPhone-failure branch, not 4a)", async () => {
    // 4a has no applyPhone failure to scope at all — the caller sent nothing,
    // so Tier-0 is the FIRST thing tried, unconditionally (subject to F2's
    // BYO-absent gate, covered separately below). This test documents that F1
    // does not regress the 4a path.
    let tier0Called = false;
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      provisionSfManagedIfAvailable: async (_orgId, deployment): Promise<ProvisionSfManagedIfAvailableResult> => {
        tier0Called = true;
        return { ok: true, deployment: fakeDeployment({ ...deployment, phoneNumber: "+15125559999", status: "active" }) };
      },
      applyGoLive: async (deployment) => ({ ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) }),
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.ok(tier0Called, "the 4a zero-connect path is unaffected by the F1 needs_telephony scoping");
    assert.equal(result.ok, true);
    assert.equal((result as { status?: string }).status, "live");
  });
});

// ─── T10 review, F1 (areaCode threading): the caller's explicit areaCode ────
// must win over clientContact-derivation/512 when provisioning Tier-0.

describe("runDeploy — T10 review F1: the caller's requested areaCode threads into the Tier-0 rescue", () => {
  test("body.phone = {mode:'provision', areaCode:'212'} + applyPhone fails needs_telephony + Tier-0 available → provisionSfManagedIfAvailable receives areaCode:'212'", async () => {
    let receivedAreaCode: string | undefined;
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      applyPhone: async (): Promise<ApplyPhoneResult> => ({ ok: false, reason: "needs_telephony", missing: ["twilio"] }),
      provisionSfManagedIfAvailable: async (_orgId, deployment, areaCode): Promise<ProvisionSfManagedIfAvailableResult> => {
        receivedAreaCode = areaCode;
        return { ok: true, deployment: fakeDeployment({ ...deployment, phoneNumber: "+12125559999", status: "active" }) };
      },
      applyGoLive: async (deployment) => ({ ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) }),
    });

    const result = await runDeploy(
      { orgId: "org-1", body: { source: { templateId: "tmpl-1" }, phone: { mode: "provision", areaCode: "212" } } },
      deps,
    );

    assert.equal(receivedAreaCode, "212", "the caller's explicit areaCode must win over clientContact-derivation/512");
    assert.equal(result.ok, true);
  });

  test("body.phone = {mode:'forward', ...} (no areaCode on this mode) + applyPhone fails needs_telephony + Tier-0 available → provisionSfManagedIfAvailable receives undefined (no caller-supplied areaCode to thread)", async () => {
    let receivedAreaCode: string | undefined = "unset";
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      applyPhone: async (): Promise<ApplyPhoneResult> => ({ ok: false, reason: "needs_telephony", missing: ["twilio"] }),
      provisionSfManagedIfAvailable: async (_orgId, deployment, areaCode): Promise<ProvisionSfManagedIfAvailableResult> => {
        receivedAreaCode = areaCode;
        return { ok: true, deployment: fakeDeployment({ ...deployment, phoneNumber: "+15125559999", status: "active" }) };
      },
      applyGoLive: async (deployment) => ({ ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) }),
    });

    const result = await runDeploy(
      { orgId: "org-1", body: { source: { templateId: "tmpl-1" }, phone: { mode: "forward", number: "+15125550148" } } },
      deps,
    );

    assert.equal(receivedAreaCode, undefined, "forward mode carries no areaCode — nothing to thread");
    assert.equal(result.ok, true);
  });

  test("no body.phone at all (4a) → provisionSfManagedIfAvailable receives undefined areaCode (no caller input to derive one from)", async () => {
    let receivedAreaCode: string | undefined = "unset";
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      provisionSfManagedIfAvailable: async (_orgId, deployment, areaCode): Promise<ProvisionSfManagedIfAvailableResult> => {
        receivedAreaCode = areaCode;
        return { ok: true, deployment: fakeDeployment({ ...deployment, phoneNumber: "+15125559999", status: "active" }) };
      },
      applyGoLive: async (deployment) => ({ ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) }),
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.equal(receivedAreaCode, undefined);
    assert.equal(result.ok, true);
  });
});

// ─── T10 review, F2: gate the 4a zero-connect path (and 4b's rescue) on ─────
// BYO creds being ABSENT. The spec's text is explicit: the SF-managed path
// applies when "no BYO creds but Tier-0 available". A BYO-equipped org running
// bare `seldonframe deploy` must get the exact pre-Task-10 outcome
// (phone_required), not a surprise SF number + rent debit.

describe("runDeploy — T10 review F2: Tier-0 (4a + 4b) requires BYO telephony to be ABSENT", () => {
  test("BYO-present (hasByoTelephony:true) + funded Tier-0 + bare deploy (no body.phone) → phone_required, Tier-0 seam NEVER invoked", async () => {
    let tier0Called = false;
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      hasByoTelephony: async () => true,
      provisionSfManagedIfAvailable: async (): Promise<ProvisionSfManagedIfAvailableResult> => {
        tier0Called = true;
        return { ok: true, deployment: fakeDeployment({ phoneNumber: "+15125559999" }) };
      },
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.equal(tier0Called, false, "BYO-present must gate OFF the Tier-0 seam entirely — this is the pre-Task-10 outcome");
    assert.deepEqual(result, { ok: false, reason: "phone_required" });
  });

  test("BYO-absent (hasByoTelephony:false) + funded Tier-0 + bare deploy → Tier-0 DOES fire (unchanged happy path)", async () => {
    let tier0Called = false;
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      hasByoTelephony: async () => false,
      provisionSfManagedIfAvailable: async (_orgId, deployment): Promise<ProvisionSfManagedIfAvailableResult> => {
        tier0Called = true;
        return { ok: true, deployment: fakeDeployment({ ...deployment, phoneNumber: "+15125559999", status: "active" }) };
      },
      applyGoLive: async (deployment) => ({ ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) }),
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.ok(tier0Called, "BYO-absent must still let the zero-connect Tier-0 payoff fire");
    assert.equal(result.ok, true);
    assert.equal((result as { status?: string }).status, "live");
  });

  test("BYO-present (hasByoTelephony:true) + applyPhone fails needs_telephony (a caller who explicitly supplied phone input, but BYO turns out configured after all) + funded Tier-0 → the ORIGINAL needs_telephony passes through, Tier-0 seam NEVER invoked (same consent logic as 4a)", async () => {
    let tier0Called = false;
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: null }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      hasByoTelephony: async () => true,
      applyPhone: async (): Promise<ApplyPhoneResult> => ({ ok: false, reason: "needs_telephony", missing: ["twilio"] }),
      provisionSfManagedIfAvailable: async (): Promise<ProvisionSfManagedIfAvailableResult> => {
        tier0Called = true;
        return { ok: true, deployment: fakeDeployment({ phoneNumber: "+15125559999" }) };
      },
    });

    const result = await runDeploy(
      { orgId: "org-1", body: { source: { templateId: "tmpl-1" }, phone: { mode: "provision", areaCode: "512" } } },
      deps,
    );

    assert.equal(tier0Called, false, "BYO-present gates OFF the 4b rescue too — same consent logic as 4a");
    assert.deepEqual(result, { ok: false, reason: "needs_telephony", missing: ["twilio"] });
  });

  test("hasByoTelephony is never invoked when the deployment needs no number at all (chat template) — the BYO-gate check is skipped entirely, zero I/O", async () => {
    let hasByoCalled = false;
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ surface: "embed", phoneNumber: null }),
        templateType: "chat_assistant",
        blueprint: {} as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => false,
      hasByoTelephony: async () => {
        hasByoCalled = true;
        return false;
      },
      applyGoLive: async (deployment) => ({ ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) }),
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.equal(hasByoCalled, false, "a chat deploy needing no number must never touch the BYO-gate check either");
    assert.equal(result.ok, true);
  });
});

// ─── product-gap fix: workspace-built agents are valid deploy sources ───────
// The real fix lives entirely INSIDE the route's real `resolveSource`
// implementation (resolveTemplateSource's fallback to
// resolveAgentAsTemplate — see route.ts + agent-templates/store.ts, both
// unit-tested directly with DI'd fakes in
// tests/unit/agent-templates/store.spec.ts:resolveAgentAsTemplate).
// `runDeploy` itself never branches on WHICH kind of source produced a
// `ResolvedSource` — it only ever sees the same three-field shape
// ({deployment, templateType, blueprint}) regardless of whether a template
// id, a listing slug, or (now) a bridged workspace-agent id resolved it. This
// suite proves that CONTRACT at the orchestrator boundary: once source
// resolution succeeds via the agent-bridge, the downstream flow (readiness →
// Tier-0 → go-live) is BYTE-IDENTICAL to a plain template-source deploy — the
// orchestrator needed zero changes, exactly as the brief mandates.

describe("runDeploy — product-gap fix: the agent-bridge's ResolvedSource flows through unchanged", () => {
  test("a ResolvedSource produced by the agent-bridge (template_not_found on templateId, then bridged via resolveAgentAsTemplate) reaches the SAME Tier-0-funded live outcome as a plain template source", async () => {
    // Models exactly what route.ts's real resolveSource now does: templateId
    // doesn't match an owned template, so it falls back to the agent bridge,
    // which resolves-or-creates an agent_templates row and returns the
    // IDENTICAL ResolvedSource shape a plain template hit would have
    // returned. The orchestrator must not be able to tell the difference.
    let tier0Called = false;
    const deps = fakeDeps({
      resolveSource: async (_orgId, body) => {
        // The caller passed an agents.id in source.templateId; the real
        // resolveTemplateSource's first getAgentTemplate lookup would miss
        // (not an agent_templates row), then resolveAgentAsTemplate bridges
        // it — represented here by returning the bridged template's
        // resulting ResolvedSource directly (the DB-wiring itself is
        // separately unit-tested in agent-templates/store.spec.ts).
        assert.equal(body.source?.templateId, "agent-1", "the agent's id rode the templateId slot, per the wire contract");
        return {
          ok: true,
          deployment: fakeDeployment({ agentTemplateId: "tmpl-generated-from-agent-1", phoneNumber: null }),
          templateType: "voice_receptionist",
          blueprint: { trigger: { kind: "inbound", channel: "voice" }, sourceAgentId: "agent-1" } as AgentBlueprint,
        };
      },
      deploymentNeedsNumber: () => true,
      hasByoTelephony: async () => false, // no BYO — Tier-0 is the payoff path
      provisionSfManagedIfAvailable: async (_orgId, deployment): Promise<ProvisionSfManagedIfAvailableResult> => {
        tier0Called = true;
        return { ok: true, deployment: fakeDeployment({ ...deployment, phoneNumber: "+15125550199", status: "active" }) };
      },
      applyGoLive: async (deployment) => {
        if (deployment.phoneNumber) {
          return { ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) };
        }
        return { ok: false, reason: "blocked" };
      },
    });

    const result = await runDeploy(
      { orgId: "org-1", body: { source: { templateId: "agent-1" } } }, // zero connects — no `phone` in body
      deps,
    );

    assert.ok(tier0Called, "the Tier-0 payoff must be reachable through an agent-bridged source, exactly like a template source");
    assert.equal(result.ok, true);
    assert.equal((result as { status?: string }).status, "live", `expected live, got ${JSON.stringify(result)}`);
    assert.equal((result as { phoneNumber?: string | null }).phoneNumber, "+15125550199");
    assert.equal(statusForDeployResult(result), 200);
  });

  test("regression pin: a PLAIN template source (no agent bridge involved) is completely unaffected — byte-identical outcome shape", async () => {
    // Guards against the agent-bridge fix accidentally changing behavior for
    // the untouched, pre-existing template path.
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ phoneNumber: "+15125550148" }),
        templateType: "voice_receptionist",
        blueprint: { trigger: { kind: "inbound", channel: "voice" } } as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => true,
      applyGoLive: async (deployment) => ({ ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) }),
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { templateId: "tmpl-1" } } }, deps);

    assert.deepEqual(result, { ok: true, status: "live", deploymentId: "dep-1", phoneNumber: "+15125550148" });
  });

  test("regression pin: a PLAIN listing source (marketplace path, no agent bridge involved) is completely unaffected — byte-identical outcome shape", async () => {
    const deps = fakeDeps({
      resolveSource: async () => ({
        ok: true,
        deployment: fakeDeployment({ surface: "embed", phoneNumber: null }),
        templateType: "chat_assistant",
        blueprint: {} as AgentBlueprint,
      }),
      deploymentNeedsNumber: () => false,
      applyGoLive: async (deployment) => ({ ok: true, deployment: fakeDeployment({ ...deployment, status: "active" }) }),
    });

    const result = await runDeploy({ orgId: "org-1", body: { source: { listingSlug: "hvac-receptionist" } } }, deps);

    assert.deepEqual(result, { ok: true, status: "live", deploymentId: "dep-1", phoneNumber: null });
  });

  test("cross-org agent id (the agent bridge's ownership guard) surfaces as the EXISTING template_not_found outcome — byte-identical to today's unowned-template 404", async () => {
    const deps = fakeDeps({
      resolveSource: async (): Promise<ResolvedSource> => {
        // Models the real route: getAgentTemplate misses (not a template),
        // resolveAgentAsTemplate ALSO misses (the agent belongs to a
        // different org — resolveAgentAsTemplate's findAgentInOrg returns
        // null, never distinguishing "no such agent" from "someone else's
        // agent") — so resolveTemplateSource reports the SAME
        // template_not_found it always has.
        return { ok: false, reason: "template_not_found" };
      },
    });

    const result = await runDeploy(
      { orgId: "org-1", body: { source: { templateId: "agent-owned-by-another-org" } } },
      deps,
    );

    assert.deepEqual(result, { ok: false, reason: "template_not_found" });
    assert.equal(statusForDeployResult(result), 404);
  });
});
