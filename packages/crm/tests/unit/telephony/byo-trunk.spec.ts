// packages/crm/tests/unit/telephony/byo-trunk.spec.ts
//
// TDD — Task 9 (voice-deploy metered billing, Tier 2). `ensureTrunkForCreds` is
// the BYO-Twilio sibling of `ensureSubaccountTrunk` (sf-managed.ts): same
// list-and-match idempotency (pickTrunkWithOrigination) + the same
// TwilioTelephonyClient trunk methods, but parameterized by CALLER-SUPPLIED
// creds + origination URI instead of reading OPENAI_SIP_ORIGINATION_URI from
// env and persisting a trunkSid into `sfTelephony` via the reverse-jsonb
// lookup. Tier 2 has no such persistence for v1 — idempotency comes from
// list-and-match on every call, so there is no org-side write to verify here,
// only the Twilio call shape.
//
// Fake-DI orchestration; no network, no DB. Mirrors the recording-fake idiom
// from sf-managed.spec.ts's buildFakeDeps (a bespoke, smaller fake here since
// ensureTrunkForCreds only touches ONE client, not the master+sub pair).
//
// Run: ( cd packages/crm && node --import tsx --test tests/unit/telephony/byo-trunk.spec.ts )

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { ensureTrunkForCreds } from "../../../src/lib/telephony/sf-managed";

const CREDS = { accountSid: "ACbyo123", authToken: "byo-auth-token" };
const SIP_URI = "sip:proj_abc123@sip.api.openai.com;transport=tls";

/** Recording fake for the single Twilio client `ensureTrunkForCreds` builds
 *  via `subClientFor`. Tracks constructor creds + every call so tests can
 *  assert exact counts/arguments. */
function buildFakeClientFor(over: {
  listTrunksWithOrigination?: () => Promise<Array<{ trunkSid: string; originationUris: string[] }>>;
  createTrunkWithOrigination?: (input: {
    friendlyName: string;
    originationSipUri: string;
  }) => Promise<{ trunkSid: string }>;
} = {}) {
  const calls = {
    subClientForCreds: [] as Array<{ accountSid: string; authToken: string }>,
    listTrunksWithOrigination: 0,
    createTrunkWithOrigination: [] as Array<{ friendlyName: string; originationSipUri: string }>,
  };

  const client = {
    async listTrunksWithOrigination() {
      calls.listTrunksWithOrigination++;
      if (over.listTrunksWithOrigination) return over.listTrunksWithOrigination();
      return [];
    },
    async createTrunkWithOrigination(input: { friendlyName: string; originationSipUri: string }) {
      calls.createTrunkWithOrigination.push(input);
      if (over.createTrunkWithOrigination) return over.createTrunkWithOrigination(input);
      return { trunkSid: "TKbyocreated" };
    },
  };

  const deps = {
    subClientFor(creds: { accountSid: string; authToken: string }) {
      calls.subClientForCreds.push(creds);
      return client;
    },
  };

  return { deps, calls };
}

describe("ensureTrunkForCreds", () => {
  test("existing matching trunk ⇒ reused, NO create call", async () => {
    const { deps, calls } = buildFakeClientFor({
      listTrunksWithOrigination: async () => [
        { trunkSid: "TKother", originationUris: ["sip:someone-else@example.com"] },
        { trunkSid: "TKmatch", originationUris: [SIP_URI] },
      ],
    });

    const result = await ensureTrunkForCreds(
      { creds: CREDS, originationSipUri: SIP_URI },
      deps,
    );

    assert.deepEqual(result, { ok: true, trunkSid: "TKmatch" });
    assert.equal(calls.listTrunksWithOrigination, 1);
    assert.equal(calls.createTrunkWithOrigination.length, 0);

    // Trunk ops MUST run on a client built with the CALLER's own creds — the
    // BYO account IS the trunking owner (no subaccount indirection for Tier 2).
    assert.equal(calls.subClientForCreds.length, 1);
    assert.deepEqual(calls.subClientForCreds[0], CREDS);
  });

  test("no match ⇒ exactly one create with the URI", async () => {
    const { deps, calls } = buildFakeClientFor({
      listTrunksWithOrigination: async () => [
        { trunkSid: "TKother", originationUris: ["sip:someone-else@example.com"] },
      ],
      createTrunkWithOrigination: async () => ({ trunkSid: "TKbrandnew" }),
    });

    const result = await ensureTrunkForCreds(
      { creds: CREDS, originationSipUri: SIP_URI },
      deps,
    );

    assert.deepEqual(result, { ok: true, trunkSid: "TKbrandnew" });
    assert.equal(calls.listTrunksWithOrigination, 1);
    assert.equal(calls.createTrunkWithOrigination.length, 1);
    assert.equal(calls.createTrunkWithOrigination[0].originationSipUri, SIP_URI);
  });

  test("empty trunk list ⇒ exactly one create", async () => {
    const { deps, calls } = buildFakeClientFor({
      listTrunksWithOrigination: async () => [],
    });

    const result = await ensureTrunkForCreds(
      { creds: CREDS, originationSipUri: SIP_URI },
      deps,
    );

    assert.deepEqual(result, { ok: true, trunkSid: "TKbyocreated" });
    assert.equal(calls.createTrunkWithOrigination.length, 1);
  });

  test("client throw on list ⇒ twilio_error, not a throw", async () => {
    const { deps } = buildFakeClientFor({
      listTrunksWithOrigination: async () => {
        throw new Error("Twilio trunking down");
      },
    });

    const result = await ensureTrunkForCreds(
      { creds: CREDS, originationSipUri: SIP_URI },
      deps,
    );

    assert.deepEqual(result, { ok: false, error: "twilio_error" });
  });

  test("client throw on create ⇒ twilio_error, not a throw", async () => {
    const { deps } = buildFakeClientFor({
      listTrunksWithOrigination: async () => [],
      createTrunkWithOrigination: async () => {
        throw new Error("Twilio API down");
      },
    });

    const result = await ensureTrunkForCreds(
      { creds: CREDS, originationSipUri: SIP_URI },
      deps,
    );

    assert.deepEqual(result, { ok: false, error: "twilio_error" });
  });

  test("no listTrunksWithOrigination on the client ⇒ falls through to create (optional method)", async () => {
    const { deps, calls } = buildFakeClientFor();
    // Simulate a client that doesn't implement the optional method at all.
    const bareDeps = {
      subClientFor() {
        return {
          async createTrunkWithOrigination(input: { friendlyName: string; originationSipUri: string }) {
            calls.createTrunkWithOrigination.push(input);
            return { trunkSid: "TKbare" };
          },
        };
      },
    };

    const result = await ensureTrunkForCreds(
      { creds: CREDS, originationSipUri: SIP_URI },
      bareDeps,
    );

    assert.deepEqual(result, { ok: true, trunkSid: "TKbare" });
  });
});
