// packages/crm/tests/unit/telephony/provision-sf-managed.spec.ts
//
// TDD — the SF-managed (Tier-0) provisioning orchestrator: rent-before-buy,
// then subaccount → trunk → the existing provisionVoiceNumber state machine
// with numberOrigin: "sf_managed". All deps (rent debit, subaccount/trunk
// ensure, the state machine) are fakes. No network, no DB.
//
// MONEY RULE under test: rent is charged FIRST. A refusal buys NOTHING (zero
// Twilio-side calls). A duplicate-ok (idempotent re-run within the same
// month) proceeds through the rest of the pipeline exactly once more,
// WITHOUT re-charging rent.
//
// Run: ( cd packages/crm && node --import tsx --test tests/unit/telephony/provision-sf-managed.spec.ts )

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  provisionSfManagedNumber,
  type ProvisionSfManagedDeps,
  type ProvisionSfManagedResult,
} from "../../../src/lib/telephony/provision-sf-managed";
import type { Deployment } from "@/db/schema/deployments";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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

const MASTER_ENV = {
  SF_VOICE_MANAGED: "1",
  TWILIO_MASTER_ACCOUNT_SID: "ACmaster",
  TWILIO_MASTER_AUTH_TOKEN: "tokmaster",
};

type RentCall = { orgId: string; deploymentId: string; monthKey: string; amountMicros: number };
type EnsureSubaccountCall = { orgId: string };
type EnsureTrunkCall = { subaccountSid: string; authToken: string };
type StateMachineCall = {
  client: unknown;
  trunkSid: string;
  deploymentId: string;
  areaCode: string;
  numberOrigin: string;
};

/**
 * Recording fake for ProvisionSfManagedDeps. Tracks every call so tests can
 * assert exact counts + ORDER (the money-safety claims live in the sequence).
 */
function buildFakeDeps(over: {
  env?: Record<string, string | undefined>;
  debitNumberRent?: (args: RentCall) => Promise<
    | { ok: true; balanceMicros: number; applied: boolean; duplicate: boolean }
    | { ok: false; reason: "insufficient" | "invalid" }
  >;
  ensureBuilderSubaccount?: (
    orgId: string,
  ) => Promise<{ ok: true; subaccountSid: string; authToken: string } | { ok: false; error: "not_configured" | "twilio_error" }>;
  ensureSubaccountTrunk?: (
    subCreds: { subaccountSid: string; authToken: string },
  ) => Promise<{ ok: true; trunkSid: string } | { ok: false; error: "not_configured" | "twilio_error" }>;
  runStateMachine?: (args: StateMachineCall) => Promise<ProvisionSfManagedResult>;
  now?: Date;
} = {}) {
  const calls = {
    debitNumberRent: [] as RentCall[],
    ensureBuilderSubaccount: [] as EnsureSubaccountCall[],
    ensureSubaccountTrunk: [] as EnsureTrunkCall[],
    runStateMachine: [] as StateMachineCall[],
    order: [] as string[],
  };

  const deps: ProvisionSfManagedDeps = {
    env: over.env ?? MASTER_ENV,
    now: () => over.now ?? new Date("2026-07-01T00:00:00.000Z"),
    debitNumberRent: async (args: RentCall) => {
      calls.debitNumberRent.push(args);
      calls.order.push("rent");
      if (over.debitNumberRent) return over.debitNumberRent(args);
      return { ok: true, balanceMicros: 100_000_000, applied: true, duplicate: false };
    },
    ensureBuilderSubaccount: async (orgId: string) => {
      calls.ensureBuilderSubaccount.push({ orgId });
      calls.order.push("subaccount");
      if (over.ensureBuilderSubaccount) return over.ensureBuilderSubaccount(orgId);
      return { ok: true, subaccountSid: "ACsub_1", authToken: "sub-token-1" };
    },
    ensureSubaccountTrunk: async (subCreds: { subaccountSid: string; authToken: string }) => {
      calls.ensureSubaccountTrunk.push(subCreds);
      calls.order.push("trunk");
      if (over.ensureSubaccountTrunk) return over.ensureSubaccountTrunk(subCreds);
      return { ok: true, trunkSid: "TKsub_1" };
    },
    runStateMachine: async (args: StateMachineCall) => {
      calls.runStateMachine.push(args);
      calls.order.push("state_machine");
      if (over.runStateMachine) return over.runStateMachine(args);
      return { ok: true, phoneNumber: "+15551234567" };
    },
  };

  return { deps, calls };
}

// ─── not-configured guard ─────────────────────────────────────────────────────

describe("provisionSfManagedNumber — not_configured guard", () => {
  test("SF_VOICE_MANAGED off ⇒ not_configured, ZERO deps calls", async () => {
    const { deps, calls } = buildFakeDeps({
      env: { ...MASTER_ENV, SF_VOICE_MANAGED: "0" },
    });

    const result = await provisionSfManagedNumber(
      { deployment: fakeDeployment(), areaCode: "415" },
      deps,
    );

    assert.deepEqual(result, { ok: false, error: "not_configured" });
    assert.equal(calls.debitNumberRent.length, 0);
    assert.equal(calls.ensureBuilderSubaccount.length, 0);
    assert.equal(calls.ensureSubaccountTrunk.length, 0);
    assert.equal(calls.runStateMachine.length, 0);
  });

  test("no master creds ⇒ not_configured, ZERO deps calls", async () => {
    const { deps, calls } = buildFakeDeps({
      env: { SF_VOICE_MANAGED: "1" }, // flag on, but no TWILIO_MASTER_* creds
    });

    const result = await provisionSfManagedNumber(
      { deployment: fakeDeployment(), areaCode: "415" },
      deps,
    );

    assert.deepEqual(result, { ok: false, error: "not_configured" });
    assert.equal(calls.debitNumberRent.length, 0);
    assert.equal(calls.ensureBuilderSubaccount.length, 0);
    assert.equal(calls.ensureSubaccountTrunk.length, 0);
    assert.equal(calls.runStateMachine.length, 0);
  });
});

// ─── rent-refused ─────────────────────────────────────────────────────────────

describe("provisionSfManagedNumber — rent refused", () => {
  test("insufficient balance ⇒ insufficient_balance, ZERO Twilio-side calls", async () => {
    const { deps, calls } = buildFakeDeps({
      debitNumberRent: async () => ({ ok: false, reason: "insufficient" }),
    });

    const result = await provisionSfManagedNumber(
      { deployment: fakeDeployment(), areaCode: "415" },
      deps,
    );

    assert.deepEqual(result, { ok: false, error: "insufficient_balance" });
    assert.equal(calls.debitNumberRent.length, 1, "rent should have been attempted exactly once");
    assert.equal(calls.ensureBuilderSubaccount.length, 0, "ZERO Twilio-side calls on rent refusal");
    assert.equal(calls.ensureSubaccountTrunk.length, 0, "ZERO Twilio-side calls on rent refusal");
    assert.equal(calls.runStateMachine.length, 0, "ZERO Twilio-side calls on rent refusal");
  });
});

// ─── happy path — ORDER + shapes ──────────────────────────────────────────────

describe("provisionSfManagedNumber — happy path", () => {
  test("ORDER: rent THEN subaccount THEN trunk THEN state machine; subaccount-creds client + trunkSid; origin sf_managed", async () => {
    const dep = fakeDeployment({ id: "dep-42", builderOrgId: "builder-42" });
    const { deps, calls } = buildFakeDeps({
      ensureBuilderSubaccount: async () => ({ ok: true, subaccountSid: "ACsub_42", authToken: "sub-token-42" }),
      ensureSubaccountTrunk: async () => ({ ok: true, trunkSid: "TKsub_42" }),
    });

    const result = await provisionSfManagedNumber(
      { deployment: dep, areaCode: "415" },
      deps,
    );

    assert.ok(result.ok, `expected ok:true, got ${JSON.stringify(result)}`);
    assert.deepEqual(calls.order, ["rent", "subaccount", "trunk", "state_machine"]);

    // Rent: correct orgId/deploymentId/monthKey/amount (rentMonthKey("2026-07-01") = "2026-07").
    assert.equal(calls.debitNumberRent.length, 1);
    assert.equal(calls.debitNumberRent[0]!.orgId, "builder-42");
    assert.equal(calls.debitNumberRent[0]!.deploymentId, "dep-42");
    assert.equal(calls.debitNumberRent[0]!.monthKey, "2026-07");
    assert.equal(calls.debitNumberRent[0]!.amountMicros, 1_500_000);

    // Subaccount ensured for the deployment's builderOrgId.
    assert.equal(calls.ensureBuilderSubaccount.length, 1);
    assert.equal(calls.ensureBuilderSubaccount[0]!.orgId, "builder-42");

    // Trunk ensured with the SUBACCOUNT creds returned by ensureBuilderSubaccount.
    assert.equal(calls.ensureSubaccountTrunk.length, 1);
    assert.deepEqual(calls.ensureSubaccountTrunk[0], {
      subaccountSid: "ACsub_42",
      authToken: "sub-token-42",
    });

    // State machine receives the subaccount-creds client + the subaccount trunkSid
    // + origin sf_managed.
    assert.equal(calls.runStateMachine.length, 1);
    const smCall = calls.runStateMachine[0]!;
    assert.equal(smCall.trunkSid, "TKsub_42");
    assert.equal(smCall.deploymentId, "dep-42");
    assert.equal(smCall.areaCode, "415");
    assert.equal(smCall.numberOrigin, "sf_managed");
    assert.ok(smCall.client, "state machine must receive a client built from subaccount creds");
  });
});

// ─── idempotent re-run (rent duplicate-ok) ────────────────────────────────────

describe("provisionSfManagedNumber — idempotent re-run", () => {
  test("rent duplicate-ok ⇒ proceeds through ensure+state machine (resume), does NOT double-charge", async () => {
    const dep = fakeDeployment({
      id: "dep-7",
      builderOrgId: "builder-7",
      // Simulate a PURCHASED-state resume: sid already on file from a prior
      // partial run, not yet active.
      phoneNumber: "+15551239999",
      phoneNumberSid: "PNexisting",
    });

    const { deps, calls } = buildFakeDeps({
      debitNumberRent: async () => ({
        ok: true,
        balanceMicros: 50_000_000,
        applied: false,
        duplicate: true, // already charged this month — proceed, don't re-charge
      }),
      ensureBuilderSubaccount: async () => ({ ok: true, subaccountSid: "ACsub_7", authToken: "sub-token-7" }),
      ensureSubaccountTrunk: async () => ({ ok: true, trunkSid: "TKsub_7" }),
      runStateMachine: async () => ({ ok: true, phoneNumber: "+15551239999" }),
    });

    const result = await provisionSfManagedNumber(
      { deployment: dep, areaCode: "415" },
      deps,
    );

    assert.ok(result.ok, `expected ok:true, got ${JSON.stringify(result)}`);

    // Rent was called (attempted) exactly once — the duplicate-ok comes back FROM
    // the debit call itself (the wallet store's own idempotency), not from this
    // orchestrator skipping the call.
    assert.equal(calls.debitNumberRent.length, 1);
    assert.equal(calls.debitNumberRent[0]!.monthKey, "2026-07");

    // Proceeds through the rest of the pipeline exactly once more (resume).
    assert.equal(calls.ensureBuilderSubaccount.length, 1);
    assert.equal(calls.ensureSubaccountTrunk.length, 1);
    assert.equal(calls.runStateMachine.length, 1);
  });
});

// ─── subaccount / trunk failure ───────────────────────────────────────────────

describe("provisionSfManagedNumber — Twilio-side failure", () => {
  test("ensureBuilderSubaccount fails ⇒ twilio_error, state machine NEVER invoked", async () => {
    const { deps, calls } = buildFakeDeps({
      ensureBuilderSubaccount: async () => ({ ok: false, error: "twilio_error" }),
    });

    const result = await provisionSfManagedNumber(
      { deployment: fakeDeployment(), areaCode: "415" },
      deps,
    );

    assert.deepEqual(result, { ok: false, error: "twilio_error" });
    assert.equal(calls.debitNumberRent.length, 1, "rent still charged — the month is paid");
    assert.equal(calls.ensureSubaccountTrunk.length, 0);
    assert.equal(calls.runStateMachine.length, 0, "state machine must NEVER run after a subaccount failure");
  });

  test("ensureSubaccountTrunk fails ⇒ twilio_error, state machine NEVER invoked", async () => {
    const { deps, calls } = buildFakeDeps({
      ensureSubaccountTrunk: async () => ({ ok: false, error: "twilio_error" }),
    });

    const result = await provisionSfManagedNumber(
      { deployment: fakeDeployment(), areaCode: "415" },
      deps,
    );

    assert.deepEqual(result, { ok: false, error: "twilio_error" });
    assert.equal(calls.debitNumberRent.length, 1, "rent still charged — the month is paid");
    assert.equal(calls.ensureBuilderSubaccount.length, 1);
    assert.equal(calls.runStateMachine.length, 0, "state machine must NEVER run after a trunk failure");
  });

  test("ensureBuilderSubaccount not_configured ⇒ mapped to twilio_error, state machine never invoked", async () => {
    const { deps, calls } = buildFakeDeps({
      ensureBuilderSubaccount: async () => ({ ok: false, error: "not_configured" }),
    });

    const result = await provisionSfManagedNumber(
      { deployment: fakeDeployment(), areaCode: "415" },
      deps,
    );

    assert.deepEqual(result, { ok: false, error: "twilio_error" });
    assert.equal(calls.runStateMachine.length, 0);
  });
});
