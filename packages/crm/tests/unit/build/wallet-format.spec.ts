// wallet format — pure micro-dollar ↔ display helpers (spec 1ff09dcb, P2 Task 4).
//
// Pins the Monid-mirrored balance shape ({ value, currency }) the GET
// /wallet/balance API returns, and the dollar rounding (micros → dollars to the
// cent). $1 = 1_000_000 micros (run-cost.ts's MICRO unit).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  microsToDollars,
  microsToMoney,
  formatMicrosUsd,
  MICRO_PER_DOLLAR,
} from "../../../src/lib/build/wallet-format";

describe("microsToDollars", () => {
  test("$1 = 1_000_000 micros", () => {
    assert.equal(MICRO_PER_DOLLAR, 1_000_000);
    assert.equal(microsToDollars(1_000_000), 1);
  });

  test("20_000_000 micros → 20 dollars", () => {
    assert.equal(microsToDollars(20_000_000), 20);
  });

  test("rounds to the cent (1_005_000 micros → $1.01)", () => {
    // 1_005_000 / 10_000 = 100.5 cents → round → 101 cents → $1.01
    assert.equal(microsToDollars(1_005_000), 1.01);
  });

  test("junk / negative → 0", () => {
    assert.equal(microsToDollars(-5), 0);
    assert.equal(microsToDollars(Number.NaN), 0);
    assert.equal(microsToDollars("abc"), 0);
  });
});

describe("microsToMoney — the Monid-mirrored { value, currency }", () => {
  test("builds { value (dollars), currency }", () => {
    assert.deepEqual(microsToMoney(20_000_000), { value: 20, currency: "USD" });
  });

  test("an empty wallet → { value: 0, currency }", () => {
    assert.deepEqual(microsToMoney(0), { value: 0, currency: "USD" });
  });

  test("respects an explicit currency", () => {
    assert.deepEqual(microsToMoney(1_000_000, "EUR"), { value: 1, currency: "EUR" });
  });
});

describe("formatMicrosUsd", () => {
  test('formats to "$X.XX"', () => {
    assert.equal(formatMicrosUsd(20_000_000), "$20.00");
    assert.equal(formatMicrosUsd(0), "$0.00");
    assert.equal(formatMicrosUsd(1_005_000), "$1.01");
  });
});
