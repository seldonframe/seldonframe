import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ceilMinutes, voiceDebitMicros, voiceDebitKey, rentMonthKey,
  shouldAcceptMeteredCall, voiceRateMicrosPerMin, numberRentMicros,
  voiceManagedEnabled, ACCEPT_FLOOR_MICROS, TIER0_READY_FLOOR_MICROS,
} from "../../../src/lib/telephony/voice-metering";

describe("voice-metering (pure)", () => {
  test("ceilMinutes: rounds up, min 1 for any answered call, 0 only for 0s", () => {
    assert.equal(ceilMinutes(0), 0);
    assert.equal(ceilMinutes(1), 1);
    assert.equal(ceilMinutes(59), 1);
    assert.equal(ceilMinutes(60), 1);
    assert.equal(ceilMinutes(61), 2);
    assert.equal(ceilMinutes(299.4), 5);
    assert.equal(ceilMinutes(-5), 0);   // malformed → no charge
    assert.equal(ceilMinutes(NaN), 0);
  });
  test("voiceDebitMicros: minutes × rate; 0s → 0", () => {
    assert.equal(voiceDebitMicros(61, 150_000), 300_000);  // 2 min × $0.15
    assert.equal(voiceDebitMicros(0, 150_000), 0);
  });
  test("keys: exact formats", () => {
    assert.equal(voiceDebitKey("call_abc"), "voice:call_abc");
    assert.equal(rentMonthKey(new Date(Date.UTC(2026, 6, 31, 23, 59))), "2026-07");
    assert.equal(rentMonthKey(new Date(Date.UTC(2026, 0, 1))), "2026-01"); // zero-pad
  });
  test("accept floor: $1 boundary inclusive", () => {
    assert.equal(shouldAcceptMeteredCall(ACCEPT_FLOOR_MICROS), true);
    assert.equal(shouldAcceptMeteredCall(999_999), false);
    assert.equal(TIER0_READY_FLOOR_MICROS, 5_000_000);
  });
  test("env rates: defaults + override + garbage-tolerant", () => {
    assert.equal(voiceRateMicrosPerMin({}), 150_000);
    assert.equal(voiceRateMicrosPerMin({ SF_VOICE_RATE_MICROS_PER_MIN: "200000" }), 200_000);
    assert.equal(voiceRateMicrosPerMin({ SF_VOICE_RATE_MICROS_PER_MIN: "junk" }), 150_000);
    assert.equal(numberRentMicros({}), 1_500_000);
  });
  test("flag: '1'/'true' on, everything else off", () => {
    assert.equal(voiceManagedEnabled({ SF_VOICE_MANAGED: "1" }), true);
    assert.equal(voiceManagedEnabled({ SF_VOICE_MANAGED: "true" }), true);
    assert.equal(voiceManagedEnabled({}), false);
    assert.equal(voiceManagedEnabled({ SF_VOICE_MANAGED: "0" }), false);
  });
});
