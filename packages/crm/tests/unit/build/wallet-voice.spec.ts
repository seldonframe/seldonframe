// splitVoiceDrain — the PURE drain-arithmetic helper behind debitVoiceUsage
// (spec voice deploy + metered billing, Task 2). Voice minutes, unlike a build
// run, are never refusable after the fact: once consumed, the wallet drains
// whatever it can cover (LEAST(balance, amount)) rather than rejecting the
// whole debit. This is the pure split the DB layer (wallet-store.ts) applies
// atomically; it is unit-tested here per house precedent (payout.spec.ts /
// requestPayout) — DB-touching fns ship tsc-verified, the arithmetic is pure-tested.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { splitVoiceDrain } from "../../../src/lib/build/wallet-store";

describe("splitVoiceDrain (pure)", () => {
  test("covered: drain = full amount, shortfall 0", () => {
    assert.deepEqual(splitVoiceDrain(1_000_000, 300_000), { drainedMicros: 300_000, shortfallMicros: 0 });
  });
  test("short: drain = whole balance, shortfall = remainder", () => {
    assert.deepEqual(splitVoiceDrain(200_000, 300_000), { drainedMicros: 200_000, shortfallMicros: 100_000 });
  });
  test("empty wallet: drain 0, shortfall = amount", () => {
    assert.deepEqual(splitVoiceDrain(0, 300_000), { drainedMicros: 0, shortfallMicros: 300_000 });
  });
  test("garbage-tolerant: negative/NaN inputs clamp to 0", () => {
    assert.deepEqual(splitVoiceDrain(-5, 300_000), { drainedMicros: 0, shortfallMicros: 300_000 });
    assert.deepEqual(splitVoiceDrain(NaN, NaN), { drainedMicros: 0, shortfallMicros: 0 });
  });
});
