import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { pollUntilFunded } from "../src/lib/poll.js";

describe("pollUntilFunded", () => {
  test("resolves true once the balance rises above the start", async () => {
    const balances = [10, 10, 30];
    let i = 0;
    const ok = await pollUntilFunded({
      startUsd: 10,
      getBalanceUsd: async () => balances[Math.min(i++, balances.length - 1)]!,
      sleep: async () => {},
      maxAttempts: 5,
    });
    assert.equal(ok, true);
  });
  test("resolves false after maxAttempts if the balance never rises", async () => {
    const ok = await pollUntilFunded({
      startUsd: 10, getBalanceUsd: async () => 10, sleep: async () => {}, maxAttempts: 3,
    });
    assert.equal(ok, false);
  });
});
