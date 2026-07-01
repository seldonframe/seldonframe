// packages/crm/tests/unit/telephony/sf-managed.spec.ts
//
// TDD — Tier-0 subaccount layer. Pure matcher (pickTrunkWithOrigination) +
// fake-DI orchestration (ensure/suspend/reactivate). All deps (org-integrations
// read/write, the Twilio clients, env) are fakes. No network, no DB.
//
// Run: ( cd packages/crm && node --import tsx --test tests/unit/telephony/sf-managed.spec.ts )

import { describe, test } from "node:test";
import assert from "node:assert/strict";

// sf-managed.ts persists the subaccount authToken via the real
// encryptValue/decryptValue helpers (src/lib/encryption.ts's "v1." scheme —
// same as BYO Twilio). Those helpers require ENCRYPTION_KEY. Set a throwaway
// test-only key BEFORE importing anything that touches encryption, so this
// spec is self-contained and doesn't depend on the shell environment.
process.env.ENCRYPTION_KEY ??= "test-only-encryption-key-not-for-prod-use";

import { encryptValue } from "../../../src/lib/encryption";
import {
  resolveMasterTwilio,
  pickTrunkWithOrigination,
  ensureBuilderSubaccount,
  ensureSubaccountTrunk,
  suspendBuilderSubaccount,
  reactivateBuilderSubaccount,
  type SfManagedDeps,
} from "../../../src/lib/telephony/sf-managed";

// ─── pickTrunkWithOrigination (PURE) ───────────────────────────────────────────

describe("pickTrunkWithOrigination", () => {
  const URI = "sip:proj_abc@sip.api.openai.com;transport=tls";

  test("match: single trunk with the exact URI in its origination list", () => {
    const trunks = [{ trunkSid: "TK1", originationUris: [URI] }];
    assert.equal(pickTrunkWithOrigination(trunks, URI), "TK1");
  });

  test("no-match: trunk exists but origination list doesn't contain the URI", () => {
    const trunks = [{ trunkSid: "TK1", originationUris: ["sip:other@example.com"] }];
    assert.equal(pickTrunkWithOrigination(trunks, URI), null);
  });

  test("multiple trunks: first match wins", () => {
    const trunks = [
      { trunkSid: "TK1", originationUris: ["sip:other@example.com"] },
      { trunkSid: "TK2", originationUris: [URI] },
      { trunkSid: "TK3", originationUris: [URI] },
    ];
    assert.equal(pickTrunkWithOrigination(trunks, URI), "TK2");
  });

  test("empty list → null", () => {
    assert.equal(pickTrunkWithOrigination([], URI), null);
  });

  test("exact-string match only — a substring/superstring URI does not match", () => {
    const trunks = [
      { trunkSid: "TK1", originationUris: [`${URI}extra`] },
      { trunkSid: "TK2", originationUris: [URI.slice(0, -1)] },
    ];
    assert.equal(pickTrunkWithOrigination(trunks, URI), null);
  });
});

// ─── resolveMasterTwilio ────────────────────────────────────────────────────────

describe("resolveMasterTwilio", () => {
  test("both present → object with accountSid + authToken", () => {
    const env = { TWILIO_MASTER_ACCOUNT_SID: "ACmaster", TWILIO_MASTER_AUTH_TOKEN: "tokmaster" };
    assert.deepEqual(resolveMasterTwilio(env), { accountSid: "ACmaster", authToken: "tokmaster" });
  });

  test("accountSid missing → null", () => {
    assert.equal(resolveMasterTwilio({ TWILIO_MASTER_AUTH_TOKEN: "tokmaster" }), null);
  });

  test("authToken missing → null", () => {
    assert.equal(resolveMasterTwilio({ TWILIO_MASTER_ACCOUNT_SID: "ACmaster" }), null);
  });

  test("both blank strings → null", () => {
    assert.equal(
      resolveMasterTwilio({ TWILIO_MASTER_ACCOUNT_SID: "", TWILIO_MASTER_AUTH_TOKEN: "" }),
      null,
    );
  });

  test("neither set → null", () => {
    assert.equal(resolveMasterTwilio({}), null);
  });
});

// ─── Fake deps builder ──────────────────────────────────────────────────────────

type FakeIntegrations = {
  sfTelephony?: { subaccountSid: string; authToken: string; trunkSid?: string };
};

/**
 * Recording fake for SfManagedDeps. Tracks every call made to the master +
 * subaccount Twilio clients so tests can assert exact counts + arguments
 * (the idempotency claims are the money here).
 */
function buildFakeDeps(over: {
  env?: Record<string, string | undefined>;
  integrations?: FakeIntegrations;
  master?: {
    createSubaccount?: (input: { friendlyName: string }) => Promise<{ sid: string; authToken: string }>;
    findSubaccountByFriendlyName?: (input: { friendlyName: string }) => Promise<{ sid: string; authToken: string } | null>;
    setSubaccountStatus?: (input: { subaccountSid: string; status: "suspended" | "active" | "closed" }) => Promise<void>;
  };
  sub?: {
    listTrunksWithOrigination?: () => Promise<Array<{ trunkSid: string; originationUris: string[] }>>;
    createTrunkWithOrigination?: (input: { friendlyName: string; originationSipUri: string }) => Promise<{ trunkSid: string }>;
  };
} = {}) {
  const calls = {
    createSubaccount: [] as Array<{ friendlyName: string }>,
    findSubaccountByFriendlyName: [] as Array<{ friendlyName: string }>,
    setSubaccountStatus: [] as Array<{ subaccountSid: string; status: string }>,
    listTrunksWithOrigination: 0,
    createTrunkWithOrigination: [] as Array<{ friendlyName: string; originationSipUri: string }>,
    patchOrgIntegrations: [] as Array<{ orgId: string; patch: unknown }>,
    subClientForCreds: [] as Array<{ accountSid: string; authToken: string }>,
  };

  let integrations: FakeIntegrations = over.integrations ? { ...over.integrations } : {};

  const masterClient = {
    async createSubaccount(input: { friendlyName: string }) {
      calls.createSubaccount.push(input);
      if (over.master?.createSubaccount) return over.master.createSubaccount(input);
      return { sid: "ACsub_created", authToken: "created-token" };
    },
    async findSubaccountByFriendlyName(input: { friendlyName: string }) {
      calls.findSubaccountByFriendlyName.push(input);
      if (over.master?.findSubaccountByFriendlyName) return over.master.findSubaccountByFriendlyName(input);
      return null;
    },
    async setSubaccountStatus(input: { subaccountSid: string; status: "suspended" | "active" | "closed" }) {
      calls.setSubaccountStatus.push(input);
      if (over.master?.setSubaccountStatus) return over.master.setSubaccountStatus(input);
    },
  };

  const subClient = {
    async listTrunksWithOrigination() {
      calls.listTrunksWithOrigination++;
      if (over.sub?.listTrunksWithOrigination) return over.sub.listTrunksWithOrigination();
      return [];
    },
    async createTrunkWithOrigination(input: { friendlyName: string; originationSipUri: string }) {
      calls.createTrunkWithOrigination.push(input);
      if (over.sub?.createTrunkWithOrigination) return over.sub.createTrunkWithOrigination(input);
      return { trunkSid: "TKcreated" };
    },
  };

  const deps: SfManagedDeps = {
    env: over.env ?? {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getOrgIntegrations(_orgId: string) {
      return integrations;
    },
    async patchOrgIntegrations(orgId: string, patch: Record<string, unknown>) {
      calls.patchOrgIntegrations.push({ orgId, patch });
      integrations = { ...integrations, ...patch };
    },
    masterClient: masterClient as unknown as SfManagedDeps["masterClient"],
    subClientFor(creds: { accountSid: string; authToken: string }) {
      calls.subClientForCreds.push(creds);
      return subClient as unknown as ReturnType<NonNullable<SfManagedDeps["subClientFor"]>>;
    },
  };

  return { deps, calls, getIntegrations: () => integrations };
}

const MASTER_ENV = { TWILIO_MASTER_ACCOUNT_SID: "ACmaster", TWILIO_MASTER_AUTH_TOKEN: "tokmaster" };

// ─── ensureBuilderSubaccount ───────────────────────────────────────────────────

describe("ensureBuilderSubaccount", () => {
  test("already-persisted ⇒ returns it decrypted, ZERO client calls", async () => {
    const { deps, calls } = buildFakeDeps({
      env: MASTER_ENV,
      integrations: { sfTelephony: { subaccountSid: "ACexisting", authToken: encryptValue("tok-existing") } },
    });

    const result = await ensureBuilderSubaccount("org-1", deps);

    assert.deepEqual(result, { ok: true, subaccountSid: "ACexisting", authToken: "tok-existing" });
    assert.equal(calls.createSubaccount.length, 0);
    assert.equal(calls.findSubaccountByFriendlyName.length, 0);
    assert.equal(calls.patchOrgIntegrations.length, 0);
  });

  test("found-by-friendlyName ⇒ persisted + returned, NO create call", async () => {
    const { deps, calls, getIntegrations } = buildFakeDeps({
      env: MASTER_ENV,
      master: {
        findSubaccountByFriendlyName: async () => ({ sid: "ACfound", authToken: "tok-found" }),
      },
    });

    const result = await ensureBuilderSubaccount("org-2", deps);

    assert.deepEqual(result, { ok: true, subaccountSid: "ACfound", authToken: "tok-found" });
    assert.equal(calls.findSubaccountByFriendlyName.length, 1);
    assert.deepEqual(calls.findSubaccountByFriendlyName[0], { friendlyName: "org-2" });
    assert.equal(calls.createSubaccount.length, 0);
    assert.equal(calls.patchOrgIntegrations.length, 1);

    const persisted = (getIntegrations() as FakeIntegrations).sfTelephony!;
    assert.equal(persisted.subaccountSid, "ACfound");
    assert.ok(persisted.authToken.startsWith("v1."), "authToken must be persisted encrypted (v1. scheme)");
  });

  test("not-found ⇒ exactly one create + persisted", async () => {
    const { deps, calls, getIntegrations } = buildFakeDeps({
      env: MASTER_ENV,
      master: {
        findSubaccountByFriendlyName: async () => null,
        createSubaccount: async () => ({ sid: "ACcreated", authToken: "tok-created" }),
      },
    });

    const result = await ensureBuilderSubaccount("org-3", deps);

    assert.deepEqual(result, { ok: true, subaccountSid: "ACcreated", authToken: "tok-created" });
    assert.equal(calls.findSubaccountByFriendlyName.length, 1);
    assert.equal(calls.createSubaccount.length, 1);
    assert.deepEqual(calls.createSubaccount[0], { friendlyName: "org-3" });
    assert.equal(calls.patchOrgIntegrations.length, 1);

    const persisted = (getIntegrations() as FakeIntegrations).sfTelephony!;
    assert.equal(persisted.subaccountSid, "ACcreated");
    assert.ok(persisted.authToken.startsWith("v1."));
  });

  test("no master creds ⇒ not_configured, zero calls", async () => {
    const { deps, calls } = buildFakeDeps({ env: {} });

    const result = await ensureBuilderSubaccount("org-4", deps);

    assert.deepEqual(result, { ok: false, error: "not_configured" });
    assert.equal(calls.findSubaccountByFriendlyName.length, 0);
    assert.equal(calls.createSubaccount.length, 0);
    assert.equal(calls.patchOrgIntegrations.length, 0);
  });

  test("client throw ⇒ twilio_error (not a throw)", async () => {
    const { deps } = buildFakeDeps({
      env: MASTER_ENV,
      master: {
        findSubaccountByFriendlyName: async () => {
          throw new Error("Twilio API down");
        },
      },
    });

    const result = await ensureBuilderSubaccount("org-5", deps);

    assert.deepEqual(result, { ok: false, error: "twilio_error" });
  });
});

// ─── ensureSubaccountTrunk ──────────────────────────────────────────────────────

const SUB_CREDS = { subaccountSid: "ACsub", authToken: "sub-token" };
const SIP_URI = "sip:proj_abc@sip.api.openai.com;transport=tls";
const ENV_WITH_SIP = { OPENAI_SIP_ORIGINATION_URI: SIP_URI };

describe("ensureSubaccountTrunk", () => {
  test("persisted trunkSid ⇒ zero calls", async () => {
    const { deps, calls } = buildFakeDeps({
      env: ENV_WITH_SIP,
      integrations: { sfTelephony: { subaccountSid: "ACsub", authToken: "irrelevant", trunkSid: "TKpersisted" } },
    });

    const result = await ensureSubaccountTrunk(SUB_CREDS, deps);

    assert.deepEqual(result, { ok: true, trunkSid: "TKpersisted" });
    assert.equal(calls.listTrunksWithOrigination, 0);
    assert.equal(calls.createTrunkWithOrigination.length, 0);
    assert.equal(calls.patchOrgIntegrations.length, 0);
  });

  test("existing matching trunk ⇒ reused + persisted, NO create", async () => {
    const { deps, calls, getIntegrations } = buildFakeDeps({
      env: ENV_WITH_SIP,
      sub: {
        listTrunksWithOrigination: async () => [
          { trunkSid: "TKother", originationUris: ["sip:someone-else@example.com"] },
          { trunkSid: "TKmatch", originationUris: [SIP_URI] },
        ],
      },
    });

    const result = await ensureSubaccountTrunk(SUB_CREDS, deps);

    assert.deepEqual(result, { ok: true, trunkSid: "TKmatch" });
    assert.equal(calls.listTrunksWithOrigination, 1);
    assert.equal(calls.createTrunkWithOrigination.length, 0);
    assert.equal(calls.patchOrgIntegrations.length, 1);
    assert.equal((getIntegrations() as FakeIntegrations).sfTelephony?.trunkSid, "TKmatch");

    // Trunk ops MUST run on a client built with the SUBACCOUNT creds
    // (subCreds.subaccountSid IS that subaccount's accountSid — subClientFor
    // takes Twilio's native {accountSid, authToken} client-constructor shape).
    assert.equal(calls.subClientForCreds.length, 1);
    assert.deepEqual(calls.subClientForCreds[0], {
      accountSid: SUB_CREDS.subaccountSid,
      authToken: SUB_CREDS.authToken,
    });
  });

  test("none ⇒ exactly one create with the env URI", async () => {
    const { deps, calls, getIntegrations } = buildFakeDeps({
      env: ENV_WITH_SIP,
      sub: {
        listTrunksWithOrigination: async () => [],
        createTrunkWithOrigination: async () => ({ trunkSid: "TKbrandnew" }),
      },
    });

    const result = await ensureSubaccountTrunk(SUB_CREDS, deps);

    assert.deepEqual(result, { ok: true, trunkSid: "TKbrandnew" });
    assert.equal(calls.createTrunkWithOrigination.length, 1);
    assert.equal(calls.createTrunkWithOrigination[0].originationSipUri, SIP_URI);
    assert.equal(calls.patchOrgIntegrations.length, 1);
    assert.equal((getIntegrations() as FakeIntegrations).sfTelephony?.trunkSid, "TKbrandnew");
  });

  test("missing env URI ⇒ not_configured, zero calls", async () => {
    const { deps, calls } = buildFakeDeps({ env: {} });

    const result = await ensureSubaccountTrunk(SUB_CREDS, deps);

    assert.deepEqual(result, { ok: false, error: "not_configured" });
    assert.equal(calls.listTrunksWithOrigination, 0);
    assert.equal(calls.createTrunkWithOrigination.length, 0);
  });

  test("client throw ⇒ twilio_error", async () => {
    const { deps } = buildFakeDeps({
      env: ENV_WITH_SIP,
      sub: {
        listTrunksWithOrigination: async () => {
          throw new Error("Twilio trunking down");
        },
      },
    });

    const result = await ensureSubaccountTrunk(SUB_CREDS, deps);

    assert.deepEqual(result, { ok: false, error: "twilio_error" });
  });
});

// ─── suspend / reactivateBuilderSubaccount ─────────────────────────────────────

describe("suspendBuilderSubaccount", () => {
  test("fires setSubaccountStatus with the right sid + status", async () => {
    const { deps, calls } = buildFakeDeps({
      env: MASTER_ENV,
      integrations: { sfTelephony: { subaccountSid: "ACsub9", authToken: "tok" } },
    });

    await suspendBuilderSubaccount("org-9", deps);

    assert.equal(calls.setSubaccountStatus.length, 1);
    assert.deepEqual(calls.setSubaccountStatus[0], { subaccountSid: "ACsub9", status: "suspended" });
  });

  test("throwing client NEVER propagates", async () => {
    const { deps } = buildFakeDeps({
      env: MASTER_ENV,
      integrations: { sfTelephony: { subaccountSid: "ACsub10", authToken: "tok" } },
      master: {
        setSubaccountStatus: async () => {
          throw new Error("Twilio down");
        },
      },
    });

    await assert.doesNotReject(suspendBuilderSubaccount("org-10", deps));
  });

  test("no subaccount persisted ⇒ no-op", async () => {
    const { deps, calls } = buildFakeDeps({ env: MASTER_ENV });

    await suspendBuilderSubaccount("org-11", deps);

    assert.equal(calls.setSubaccountStatus.length, 0);
  });

  test("no master creds ⇒ no-op (never throws)", async () => {
    const { deps, calls } = buildFakeDeps({
      env: {},
      integrations: { sfTelephony: { subaccountSid: "ACsub12", authToken: "tok" } },
    });

    await assert.doesNotReject(suspendBuilderSubaccount("org-12", deps));
    assert.equal(calls.setSubaccountStatus.length, 0);
  });
});

describe("reactivateBuilderSubaccount", () => {
  test("fires setSubaccountStatus with the right sid + status", async () => {
    const { deps, calls } = buildFakeDeps({
      env: MASTER_ENV,
      integrations: { sfTelephony: { subaccountSid: "ACsub13", authToken: "tok" } },
    });

    await reactivateBuilderSubaccount("org-13", deps);

    assert.equal(calls.setSubaccountStatus.length, 1);
    assert.deepEqual(calls.setSubaccountStatus[0], { subaccountSid: "ACsub13", status: "active" });
  });

  test("throwing client NEVER propagates", async () => {
    const { deps } = buildFakeDeps({
      env: MASTER_ENV,
      integrations: { sfTelephony: { subaccountSid: "ACsub14", authToken: "tok" } },
      master: {
        setSubaccountStatus: async () => {
          throw new Error("Twilio down");
        },
      },
    });

    await assert.doesNotReject(reactivateBuilderSubaccount("org-14", deps));
  });

  test("no subaccount persisted ⇒ no-op", async () => {
    const { deps, calls } = buildFakeDeps({ env: MASTER_ENV });

    await reactivateBuilderSubaccount("org-15", deps);

    assert.equal(calls.setSubaccountStatus.length, 0);
  });
});
