// packages/crm/tests/unit/telephony/delinquency.spec.ts
//
// T10 review, F3 — computeVoiceBillingSignal: the pure combinator behind
// workspace-state's `voice_billing: { suspended, low_balance }` surface.
// `getDelinquentSince`/`setDelinquentSince`/`clearDelinquentSince`/the two
// list helpers are all lazy-DB-import (no DI), same as every other store
// helper in this module — only the pure combinator is unit-tested here, per
// this repo's "DB-touching fns ship tsc-verified, the arithmetic is
// pure-tested" convention (see wallet-voice.spec.ts's header comment).
//
// Run: ( cd packages/crm && node --import tsx --test tests/unit/telephony/delinquency.spec.ts )

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { computeVoiceBillingSignal, getDelinquentSince } from "../../../src/lib/telephony/delinquency";
import { ACCEPT_FLOOR_MICROS } from "../../../src/lib/telephony/voice-metering";

describe("computeVoiceBillingSignal (pure)", () => {
  test("no delinquency marker + balance at/above the accept floor → {suspended:false, low_balance:false}", () => {
    assert.deepEqual(
      computeVoiceBillingSignal({ delinquentSince: null, balanceMicros: ACCEPT_FLOOR_MICROS }),
      { suspended: false, low_balance: false },
    );
    assert.deepEqual(
      computeVoiceBillingSignal({ delinquentSince: null, balanceMicros: ACCEPT_FLOOR_MICROS * 10 }),
      { suspended: false, low_balance: false },
    );
  });

  test("a delinquentSince marker present → suspended:true, regardless of balance", () => {
    assert.deepEqual(
      computeVoiceBillingSignal({ delinquentSince: "2026-06-01T00:00:00.000Z", balanceMicros: 100_000_000 }),
      { suspended: true, low_balance: false },
    );
  });

  test("balance strictly below the accept floor → low_balance:true (the SAME floor the live-call accept-gate uses)", () => {
    assert.deepEqual(
      computeVoiceBillingSignal({ delinquentSince: null, balanceMicros: ACCEPT_FLOOR_MICROS - 1 }),
      { suspended: false, low_balance: true },
    );
    assert.deepEqual(
      computeVoiceBillingSignal({ delinquentSince: null, balanceMicros: 0 }),
      { suspended: false, low_balance: true },
    );
  });

  test("both suspended AND low_balance can be true simultaneously (delinquent AND drained)", () => {
    assert.deepEqual(
      computeVoiceBillingSignal({ delinquentSince: "2026-05-01T00:00:00.000Z", balanceMicros: 0 }),
      { suspended: true, low_balance: true },
    );
  });

  test("the accept floor boundary is inclusive (mirrors shouldAcceptMeteredCall's own $1-boundary-inclusive test)", () => {
    assert.equal(
      computeVoiceBillingSignal({ delinquentSince: null, balanceMicros: ACCEPT_FLOOR_MICROS }).low_balance,
      false,
    );
    assert.equal(
      computeVoiceBillingSignal({ delinquentSince: null, balanceMicros: ACCEPT_FLOOR_MICROS - 1 }).low_balance,
      true,
    );
  });
});

// ─── getDelinquentSince sanity (already existed, pinning it stays in scope) ─

describe("getDelinquentSince (pure, pre-existing)", () => {
  test("reads the reserved key off customization; null/absent/non-string → null", () => {
    assert.equal(
      getDelinquentSince({ customization: { _delinquentSince: "2026-06-01T00:00:00.000Z" } }),
      "2026-06-01T00:00:00.000Z",
    );
    assert.equal(getDelinquentSince({ customization: null }), null);
    assert.equal(getDelinquentSince({ customization: {} }), null);
    assert.equal(getDelinquentSince({ customization: { _delinquentSince: 12345 } }), null);
  });
});
