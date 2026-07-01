import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { gateMeteredAccept, meterCallEnd, isMeteredCall } from "../../../src/lib/telephony/voice-metering-orchestration";

const ENV_ON = { SF_VOICE_MANAGED: "1" };

describe("isMeteredCall", () => {
  test("metered only: flag on + deployment path + platform webhook", () => {
    assert.equal(isMeteredCall({ env: ENV_ON, viaDeployment: true, perOrgWebhook: false }), true);
    assert.equal(isMeteredCall({ env: {}, viaDeployment: true, perOrgWebhook: false }), false);       // flag off
    assert.equal(isMeteredCall({ env: ENV_ON, viaDeployment: false, perOrgWebhook: false }), false);  // legacy workspace
    assert.equal(isMeteredCall({ env: ENV_ON, viaDeployment: true, perOrgWebhook: true }), false);    // Tier 2
  });
});

describe("gateMeteredAccept", () => {
  test("accepts at/above the $1 floor, refuses below", async () => {
    assert.deepEqual(await gateMeteredAccept("o1", { env: ENV_ON, getBalanceMicros: async () => 1_000_000 }), { accept: true });
    assert.deepEqual(await gateMeteredAccept("o1", { env: ENV_ON, getBalanceMicros: async () => 999_999 }), { accept: false, reason: "low_balance" });
  });
  test("balance-read failure fails OPEN (never drop a call to a metering hiccup)", async () => {
    assert.deepEqual(await gateMeteredAccept("o1", { env: ENV_ON, getBalanceMicros: async () => { throw new Error("db"); } }), { accept: true });
  });
});

describe("meterCallEnd", () => {
  const base = (over?: Partial<Parameters<typeof meterCallEnd>[1]>) => {
    const calls: unknown[] = []; const suspended: string[] = [];
    const deps = {
      env: ENV_ON,
      debitVoiceUsage: async (a: { orgId: string; callId: string; amountMicros: number }) => {
        calls.push(a); return { ok: true as const, applied: true, duplicate: false, drainedMicros: a.amountMicros, shortfallMicros: 0 };
      },
      onShortfall: async (o: string) => { suspended.push(o); },
      ...over,
    };
    return { deps, calls, suspended };
  };
  test("debits ceil-minutes × rate, no shortfall → no suspend", async () => {
    const { deps, calls, suspended } = base();
    const r = await meterCallEnd({ orgId: "o1", callId: "c1", seconds: 61 }, deps);
    assert.deepEqual(r, { metered: true, amountMicros: 300_000, shortfallMicros: 0 });
    assert.equal((calls[0] as { amountMicros: number }).amountMicros, 300_000);
    assert.deepEqual(suspended, []);
  });
  test("0-second call → metered:false, NO debit call", async () => {
    const { deps, calls } = base();
    assert.deepEqual(await meterCallEnd({ orgId: "o1", callId: "c1", seconds: 0 }, deps), { metered: false });
    assert.equal(calls.length, 0);
  });
  test("shortfall → onShortfall fired once with the org", async () => {
    const { deps, suspended } = base({
      debitVoiceUsage: async (a) => ({ ok: true as const, applied: true, duplicate: false, drainedMicros: 100_000, shortfallMicros: a.amountMicros - 100_000 }),
    });
    const r = await meterCallEnd({ orgId: "o1", callId: "c1", seconds: 61 }, deps);
    assert.deepEqual(r, { metered: true, amountMicros: 300_000, shortfallMicros: 200_000 });
    assert.deepEqual(suspended, ["o1"]);
  });
  test("debit throws → swallowed (fail-soft), metered:false returned, no suspend", async () => {
    const { deps, suspended } = base({ debitVoiceUsage: async () => { throw new Error("db down"); } });
    assert.deepEqual(await meterCallEnd({ orgId: "o1", callId: "c1", seconds: 61 }, deps), { metered: false });
    assert.deepEqual(suspended, []);
  });
  test("onShortfall throwing never propagates", async () => {
    const { deps } = base({
      debitVoiceUsage: async (a) => ({ ok: true as const, applied: true, duplicate: false, drainedMicros: 0, shortfallMicros: a.amountMicros }),
      onShortfall: async () => { throw new Error("twilio down"); },
    });
    const r = await meterCallEnd({ orgId: "o1", callId: "c1", seconds: 30 }, deps);
    assert.equal(r.metered, true);
  });
});
