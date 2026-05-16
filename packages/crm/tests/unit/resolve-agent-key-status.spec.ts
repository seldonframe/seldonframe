// v1.55 — locks in the resolution order used by the dashboard sandbox
// (/agents/<id>/test). Previously the page only checked
// `org.integrations.anthropic.apiKey` and showed "No key configured" even
// when production turns worked fine via the platform env-var fallback.
//
// The resolution mirrors getAIClient(): BYOK Anthropic → BYOK OpenAI →
// platform env key → none. Tests use a pure helper that takes injected
// integrations + a platform-key boolean + a decrypt fn so we don't have to
// stand up the DB or mutate process.env in tests.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveAgentKeyStatusFromInputs } from "../../src/lib/ai/client";

// Decrypter that mimics the real behavior: undefined/empty -> "",
// strings starting with "v1." -> "decrypted-<rest>", everything else -> as-is.
const fakeDecrypt = (value: string | undefined): string => {
  if (!value) return "";
  if (value.startsWith("v1.")) return `decrypted-${value.slice(3)}`;
  return value;
};

describe("resolveAgentKeyStatusFromInputs", () => {
  test("returns byok/anthropic when a plaintext Anthropic key is present", () => {
    const status = resolveAgentKeyStatusFromInputs(
      { anthropic: { apiKey: "sk-ant-real-key" } },
      false,
      fakeDecrypt,
    );
    assert.deepEqual(status, {
      hasKey: true,
      mode: "byok",
      provider: "anthropic",
    });
  });

  test("returns byok/anthropic when the stored key is encrypted (v1.<ciphertext>)", () => {
    // Regression: the dashboard's old check was `apiKey.length > 0` which
    // passed for encrypted keys too — but never called decrypt, so the page
    // didn't actually verify usability. Now we go through the decrypter.
    const status = resolveAgentKeyStatusFromInputs(
      { anthropic: { apiKey: "v1.encrypted-blob" } },
      false,
      fakeDecrypt,
    );
    assert.equal(status.hasKey, true);
    assert.equal(status.mode, "byok");
    assert.equal(status.provider, "anthropic");
  });

  test("falls through to OpenAI when Anthropic key is missing or empty", () => {
    const status = resolveAgentKeyStatusFromInputs(
      { anthropic: { apiKey: "" }, openai: { apiKey: "sk-openai-real" } },
      false,
      fakeDecrypt,
    );
    assert.deepEqual(status, {
      hasKey: true,
      mode: "byok",
      provider: "openai",
    });
  });

  test("falls through to platform mode when no BYOK key but env var is set", () => {
    // This is the bug fix: production has ANTHROPIC_API_KEY set so chats
    // succeed, but the sandbox previously said "no key configured" for any
    // org without BYOK. Now it correctly reports the platform fallback.
    const status = resolveAgentKeyStatusFromInputs({}, true, fakeDecrypt);
    assert.deepEqual(status, {
      hasKey: true,
      mode: "platform",
      provider: null,
    });
  });

  test("returns none when no BYOK key AND no platform key", () => {
    const status = resolveAgentKeyStatusFromInputs({}, false, fakeDecrypt);
    assert.deepEqual(status, {
      hasKey: false,
      mode: "none",
      provider: null,
    });
  });

  test("treats an undecryptable v1. blob as missing (decrypt returns empty)", () => {
    // Simulate decryption failure: the helper's decryptIfNeeded swallows
    // exceptions and returns "" — so a corrupted ciphertext should NOT be
    // counted as a valid BYOK key.
    const failingDecrypt = (value: string | undefined): string => {
      if (!value) return "";
      if (value.startsWith("v1.")) return ""; // simulate decrypt failure
      return value;
    };
    const status = resolveAgentKeyStatusFromInputs(
      { anthropic: { apiKey: "v1.corrupted" } },
      true, // platform fallback IS available
      failingDecrypt,
    );
    // Should fall through to platform, not return byok/anthropic.
    assert.deepEqual(status, {
      hasKey: true,
      mode: "platform",
      provider: null,
    });
  });

  test("prefers BYOK Anthropic over BYOK OpenAI when both exist", () => {
    const status = resolveAgentKeyStatusFromInputs(
      {
        anthropic: { apiKey: "sk-ant" },
        openai: { apiKey: "sk-openai" },
      },
      true,
      fakeDecrypt,
    );
    assert.equal(status.provider, "anthropic");
  });
});
