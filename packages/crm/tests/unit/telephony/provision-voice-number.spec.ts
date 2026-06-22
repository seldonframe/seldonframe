// packages/crm/tests/unit/telephony/provision-voice-number.spec.ts
//
// TDD — state machine tests for provisionVoiceNumber.
// All deps (TwilioTelephonyClient, loadDeployment, updateDeployment) are fakes.
// No network, no DB.
//
// Run: ( cd packages/crm && node --import tsx --test tests/unit/telephony/provision-voice-number.spec.ts )

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  provisionVoiceNumber,
  type ProvisionVoiceNumberDeps,
} from "../../../src/lib/telephony/provision-voice-number";
import type { TwilioTelephonyClient } from "../../../src/lib/telephony/twilio-client";
import type { Deployment } from "../../../src/db/schema/deployments";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakeDeployment(over: Partial<Deployment> = {}): Deployment {
  return {
    id: "dep-1",
    builderOrgId: "builder-1",
    agentTemplateId: "tmpl-1",
    clientName: "Acme Plumbing",
    clientContact: null,
    surface: "phone",
    phoneNumber: null,
    phoneNumberSid: null,
    numberOrigin: null,
    calendarRef: null,
    priceCents: 9900,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Deployment;
}

/** Build a fake TwilioTelephonyClient with all methods as no-ops / stubs. */
function fakeTwilioClient(overrides: Partial<TwilioTelephonyClient> = {}): TwilioTelephonyClient & {
  _searchCalls: number;
  _buyCalls: number;
  _attachCalls: number;
  _releaseCalls: number;
} {
  let searchCalls = 0;
  let buyCalls = 0;
  let attachCalls = 0;
  let releaseCalls = 0;

  return {
    get _searchCalls() { return searchCalls; },
    get _buyCalls() { return buyCalls; },
    get _attachCalls() { return attachCalls; },
    get _releaseCalls() { return releaseCalls; },

    async searchLocalVoiceNumbers() {
      searchCalls++;
      return ["+15551234567"];
    },
    async buyNumber({ phoneNumber }) {
      buyCalls++;
      return { sid: "PNtest001", phoneNumber };
    },
    async attachNumberToTrunk() {
      attachCalls++;
    },
    async releaseNumber() {
      releaseCalls++;
    },
    ...overrides,
  };
}

/** Track patch calls to updateDeployment. */
type PatchCall = { id: string; patch: Record<string, unknown> };

function buildFakeDeps(
  deployment: Deployment,
  clientOverrides: Partial<TwilioTelephonyClient> = {},
): ProvisionVoiceNumberDeps & {
  client: ReturnType<typeof fakeTwilioClient>;
  patches: PatchCall[];
} {
  const patches: PatchCall[] = [];
  // Mutable snapshot so updateDeployment fakes an in-memory DB mutation.
  let current = { ...deployment };

  const client = fakeTwilioClient(clientOverrides);

  return {
    client,
    patches,
    async loadDeployment(id: string) {
      return current.id === id ? { ...current } : null;
    },
    async updateDeployment(id: string, patch: Record<string, unknown>) {
      patches.push({ id, patch });
      current = { ...current, ...(patch as Partial<Deployment>) };
      return { ...current };
    },
  };
}

// ─── Test scenarios ───────────────────────────────────────────────────────────

describe("provisionVoiceNumber", () => {

  describe("NONE — no phoneNumberSid, not active", () => {
    test("search → buy → persists sid BEFORE attach → attach → status active → ok result", async () => {
      const dep = fakeDeployment({ status: "draft", phoneNumberSid: null });
      const deps = buildFakeDeps(dep);

      // Track call ordering: buy must happen before attach
      const callOrder: string[] = [];
      deps.client.buyNumber = async ({ phoneNumber }: { phoneNumber: string; friendlyName: string }) => {
        callOrder.push("buy");
        return { sid: "PNtest001", phoneNumber };
      };
      deps.client.attachNumberToTrunk = async () => {
        callOrder.push("attach");
      };

      const result = await provisionVoiceNumber(deps, {
        deploymentId: "dep-1",
        areaCode: "415",
        trunkSid: "TKtrunk001",
      });

      assert.ok(result.ok, `Expected ok:true, got: ${JSON.stringify(result)}`);
      assert.strictEqual((result as { ok: true; phoneNumber: string }).phoneNumber, "+15551234567");

      // buy called once
      assert.strictEqual(deps.patches.filter((p) => p.patch.phoneNumberSid).length >= 1, true,
        "sid should be persisted before attach");

      // Ordering check: buy before attach
      assert.strictEqual(callOrder[0], "buy");
      assert.strictEqual(callOrder[1], "attach");

      // Final patch sets status to active
      const activePatches = deps.patches.filter((p) => p.patch.status === "active");
      assert.ok(activePatches.length >= 1, "status should be set to active");

      // The sid+numberOrigin patch comes before the active patch
      const sidPatchIdx = deps.patches.findIndex((p) => p.patch.phoneNumberSid === "PNtest001");
      const activePatchIdx = deps.patches.findIndex((p) => p.patch.status === "active");
      assert.ok(sidPatchIdx < activePatchIdx, "sid should be persisted before status:active");
    });

    test("buy called exactly once on a fresh deployment", async () => {
      const dep = fakeDeployment({ status: "draft", phoneNumberSid: null });
      const deps = buildFakeDeps(dep);
      let buyCalls = 0;
      deps.client.buyNumber = async ({ phoneNumber }: { phoneNumber: string; friendlyName: string }) => {
        buyCalls++;
        return { sid: "PNtest001", phoneNumber };
      };

      await provisionVoiceNumber(deps, { deploymentId: "dep-1", areaCode: "415", trunkSid: "TKtrunk001" });
      assert.strictEqual(buyCalls, 1);
    });
  });

  describe("PURCHASED — has phoneNumberSid but not active", () => {
    test("does NOT buy again; resumes at attach; sets status active", async () => {
      const dep = fakeDeployment({
        status: "draft",
        phoneNumber: "+15551234567",
        phoneNumberSid: "PNexisting",
        numberOrigin: "provisioned",
      });
      const deps = buildFakeDeps(dep);
      let buyCalls = 0;
      deps.client.buyNumber = async ({ phoneNumber }: { phoneNumber: string; friendlyName: string }) => {
        buyCalls++;
        return { sid: "PNwrong", phoneNumber };
      };
      let attachCalls = 0;
      deps.client.attachNumberToTrunk = async () => { attachCalls++; };

      const result = await provisionVoiceNumber(deps, {
        deploymentId: "dep-1",
        areaCode: "415",
        trunkSid: "TKtrunk001",
      });

      assert.ok(result.ok, `Expected ok:true, got: ${JSON.stringify(result)}`);
      assert.strictEqual(buyCalls, 0, "buy must NOT be called when sid already exists");
      assert.strictEqual(attachCalls, 1, "attach must be called to resume");

      const activePatches = deps.patches.filter((p) => p.patch.status === "active");
      assert.ok(activePatches.length >= 1, "status should be set to active");
    });
  });

  describe("ALREADY_DONE — status active + has phoneNumberSid", () => {
    test("no-op: returns existing number, no client calls, no updateDeployment calls", async () => {
      const dep = fakeDeployment({
        status: "active",
        phoneNumber: "+15551234567",
        phoneNumberSid: "PNexisting",
        numberOrigin: "provisioned",
      });
      const deps = buildFakeDeps(dep);
      let anyCall = 0;
      deps.client.searchLocalVoiceNumbers = async () => { anyCall++; return []; };
      deps.client.buyNumber = async ({ phoneNumber }: { phoneNumber: string; friendlyName: string }) => { anyCall++; return { sid: "X", phoneNumber }; };
      deps.client.attachNumberToTrunk = async () => { anyCall++; };

      const result = await provisionVoiceNumber(deps, {
        deploymentId: "dep-1",
        areaCode: "415",
      });

      assert.ok(result.ok, `Expected ok:true, got: ${JSON.stringify(result)}`);
      assert.strictEqual((result as { ok: true; phoneNumber: string }).phoneNumber, "+15551234567");
      assert.strictEqual(anyCall, 0, "no client calls on already-active deployment");
      assert.strictEqual(deps.patches.length, 0, "no updateDeployment calls on already-active");
    });
  });

  describe("search returns empty", () => {
    test("returns ok:false, error:'no_numbers_available', nothing persisted", async () => {
      const dep = fakeDeployment({ status: "draft", phoneNumberSid: null });
      const deps = buildFakeDeps(dep, {
        async searchLocalVoiceNumbers() { return []; },
      });

      const result = await provisionVoiceNumber(deps, {
        deploymentId: "dep-1",
        areaCode: "999",
      });

      assert.ok(!result.ok, "Expected ok:false");
      assert.strictEqual(
        (result as { ok: false; error: string }).error,
        "no_numbers_available",
      );
      assert.strictEqual(deps.patches.length, 0, "nothing should be persisted when search is empty");
    });
  });

  describe("attach throws", () => {
    test("deployment left with sid persisted (status NOT active), returns ok:false, error:'attach_failed'", async () => {
      const dep = fakeDeployment({ status: "draft", phoneNumberSid: null });
      const deps = buildFakeDeps(dep, {
        async attachNumberToTrunk() {
          throw new Error("Trunk 503");
        },
      });

      const result = await provisionVoiceNumber(deps, {
        deploymentId: "dep-1",
        areaCode: "415",
        trunkSid: "TKtrunk001",
      });

      assert.ok(!result.ok, "Expected ok:false when attach throws");
      assert.strictEqual(
        (result as { ok: false; error: string }).error,
        "attach_failed",
      );

      // The sid must be persisted (so retry can resume at attach)
      const sidPatches = deps.patches.filter((p) => p.patch.phoneNumberSid === "PNtest001");
      assert.ok(sidPatches.length >= 1, "phoneNumberSid must be persisted before attach fails");

      // Status must NOT be active
      const activePatches = deps.patches.filter((p) => p.patch.status === "active");
      assert.strictEqual(activePatches.length, 0, "status must NOT be active after attach failure");
    });
  });

  describe("deployment not found", () => {
    test("returns ok:false, error:'deployment_not_found'", async () => {
      const dep = fakeDeployment();
      const deps = buildFakeDeps(dep);
      // Override loadDeployment to return null
      deps.loadDeployment = async () => null;

      const result = await provisionVoiceNumber(deps, {
        deploymentId: "missing-id",
        areaCode: "415",
      });

      assert.ok(!result.ok);
      assert.strictEqual(
        (result as { ok: false; error: string }).error,
        "deployment_not_found",
      );
    });
  });

  // ── Multi-surface number: SMS webhook on the provisioned number ───────────
  describe("SMS webhook (multi-surface number)", () => {
    test("sets the number's smsUrl after attach when deps.smsUrl is provided", async () => {
      const dep = fakeDeployment({ status: "draft", phoneNumberSid: null });
      const deps = buildFakeDeps(dep);
      const smsCalls: Array<{ phoneNumberSid: string; smsUrl: string }> = [];
      const callOrder: string[] = [];
      deps.client.attachNumberToTrunk = async () => {
        callOrder.push("attach");
      };
      deps.client.configureSmsUrl = async (arg) => {
        callOrder.push("sms");
        smsCalls.push(arg);
      };
      deps.smsUrl = "https://app.seldonframe.com/api/webhooks/twilio/sms";

      const result = await provisionVoiceNumber(deps, {
        deploymentId: "dep-1",
        areaCode: "415",
        trunkSid: "TKtrunk001",
      });

      assert.ok(result.ok);
      assert.equal(smsCalls.length, 1, "configureSmsUrl should be called once");
      assert.deepEqual(smsCalls[0], {
        phoneNumberSid: "PNtest001",
        smsUrl: "https://app.seldonframe.com/api/webhooks/twilio/sms",
      });
      // SMS config happens AFTER the trunk attach (voice first, then SMS).
      assert.deepEqual(callOrder, ["attach", "sms"]);
    });

    test("does NOT set smsUrl when deps.smsUrl is absent (unchanged voice-only behavior)", async () => {
      const dep = fakeDeployment({ status: "draft", phoneNumberSid: null });
      const deps = buildFakeDeps(dep);
      let smsCalls = 0;
      deps.client.configureSmsUrl = async () => {
        smsCalls++;
      };
      // deps.smsUrl intentionally left undefined.

      const result = await provisionVoiceNumber(deps, {
        deploymentId: "dep-1",
        areaCode: "415",
        trunkSid: "TKtrunk001",
      });

      assert.ok(result.ok);
      assert.equal(smsCalls, 0, "no smsUrl → configureSmsUrl never called");
    });

    test("soft-fail: configureSmsUrl throwing does NOT fail provisioning (status still active)", async () => {
      const dep = fakeDeployment({ status: "draft", phoneNumberSid: null });
      const deps = buildFakeDeps(dep);
      deps.client.configureSmsUrl = async () => {
        throw new Error("Twilio IncomingPhoneNumbers update 500");
      };
      deps.smsUrl = "https://app.seldonframe.com/api/webhooks/twilio/sms";

      const result = await provisionVoiceNumber(deps, {
        deploymentId: "dep-1",
        areaCode: "415",
        trunkSid: "TKtrunk001",
      });

      // Voice provisioning succeeds even though the SMS config threw.
      assert.ok(result.ok, "SMS-config failure must not break voice provisioning");
      const activePatches = deps.patches.filter((p) => p.patch.status === "active");
      assert.ok(activePatches.length >= 1, "status should still be set to active");
    });

    test("does NOT set smsUrl when attach fails (number isn't live yet)", async () => {
      const dep = fakeDeployment({ status: "draft", phoneNumberSid: null });
      const deps = buildFakeDeps(dep, {
        async attachNumberToTrunk() {
          throw new Error("Trunk 503");
        },
      });
      let smsCalls = 0;
      deps.client.configureSmsUrl = async () => {
        smsCalls++;
      };
      deps.smsUrl = "https://app.seldonframe.com/api/webhooks/twilio/sms";

      const result = await provisionVoiceNumber(deps, {
        deploymentId: "dep-1",
        areaCode: "415",
        trunkSid: "TKtrunk001",
      });

      assert.ok(!result.ok);
      assert.equal(smsCalls, 0, "SMS webhook must not be set when the attach failed");
    });
  });
});
