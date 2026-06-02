// Stage C1 — tests for resolveVoiceCardStatus (pure card-badge logic).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveVoiceCardStatus,
  normalizeVoiceNumber,
} from "../../../../src/lib/agents/voice/card-status";

describe("resolveVoiceCardStatus", () => {
  test("no agent row → not_configured (regardless of number)", () => {
    assert.equal(
      resolveVoiceCardStatus({ agentStatus: null, hasNumber: false }),
      "not_configured",
    );
    assert.equal(
      resolveVoiceCardStatus({ agentStatus: undefined, hasNumber: true }),
      "not_configured",
    );
  });

  test("agent live + number assigned → live", () => {
    assert.equal(
      resolveVoiceCardStatus({ agentStatus: "live", hasNumber: true }),
      "live",
    );
  });

  test("agent live but NO number → no_number (can't actually route a call)", () => {
    assert.equal(
      resolveVoiceCardStatus({ agentStatus: "live", hasNumber: false }),
      "no_number",
    );
  });

  test("agent paused → paused even without a number (explicit operator choice)", () => {
    assert.equal(
      resolveVoiceCardStatus({ agentStatus: "paused", hasNumber: false }),
      "paused",
    );
    assert.equal(
      resolveVoiceCardStatus({ agentStatus: "paused", hasNumber: true }),
      "paused",
    );
  });

  test("draft agent with a number → draft", () => {
    assert.equal(
      resolveVoiceCardStatus({ agentStatus: "draft", hasNumber: true }),
      "draft",
    );
  });

  test("draft agent without a number → no_number", () => {
    assert.equal(
      resolveVoiceCardStatus({ agentStatus: "draft", hasNumber: false }),
      "no_number",
    );
  });

  test("unknown status (e.g. 'test') with a number falls back to draft", () => {
    assert.equal(
      resolveVoiceCardStatus({ agentStatus: "test", hasNumber: true }),
      "draft",
    );
  });
});

describe("normalizeVoiceNumber", () => {
  test("normalizes an already-E.164 number unchanged", () => {
    assert.deepEqual(normalizeVoiceNumber("+18335551234"), {
      ok: true,
      value: "+18335551234",
    });
  });

  test("strips spaces / dashes / parens and keeps the +", () => {
    assert.deepEqual(normalizeVoiceNumber("+1 (833) 555-1234"), {
      ok: true,
      value: "+18335551234",
    });
  });

  test("defaults a bare 10-digit US number to +1", () => {
    assert.deepEqual(normalizeVoiceNumber("833 555 1234"), {
      ok: true,
      value: "+18335551234",
    });
  });

  test("blank/whitespace input clears the number (ok with empty value)", () => {
    assert.deepEqual(normalizeVoiceNumber(""), { ok: true, value: "" });
    assert.deepEqual(normalizeVoiceNumber("   "), { ok: true, value: "" });
  });

  test("rejects garbage that doesn't form a valid E.164", () => {
    const r = normalizeVoiceNumber("not-a-number");
    assert.equal(r.ok, false);
  });

  test("rejects a too-short number", () => {
    const r = normalizeVoiceNumber("+123");
    assert.equal(r.ok, false);
  });
});
