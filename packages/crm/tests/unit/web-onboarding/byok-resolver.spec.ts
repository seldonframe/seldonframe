// packages/crm/tests/unit/web-onboarding/byok-resolver.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveByokKeyFromIntegrationsBlob,
  mergeAnthropicKeyIntoIntegrations,
  buildAnthropicKeyHint,
} from "../../../src/lib/web-onboarding/byok-resolver";

describe("resolveByokKeyFromIntegrationsBlob", () => {
  test("returns the plaintext key when integrations.anthropic.apiKey is plaintext", () => {
    const result = resolveByokKeyFromIntegrationsBlob({ anthropic: { apiKey: "sk-ant-plain" } });
    assert.equal(result.key, "sk-ant-plain");
    assert.equal(result.source, "byok");
  });

  test("returns null when integrations is null or undefined", () => {
    assert.deepEqual(resolveByokKeyFromIntegrationsBlob(null), { key: null, source: "missing" });
    assert.deepEqual(resolveByokKeyFromIntegrationsBlob(undefined), { key: null, source: "missing" });
  });

  test("returns null when anthropic.apiKey is an empty string", () => {
    const result = resolveByokKeyFromIntegrationsBlob({ anthropic: { apiKey: "" } });
    assert.equal(result.key, null);
    assert.equal(result.source, "missing");
  });

  test("returns null when the encrypted payload cannot be decrypted", () => {
    // "v1." prefix signals encrypted payload; mangled body will fail decrypt and
    // the resolver swallows the error.
    const result = resolveByokKeyFromIntegrationsBlob({ anthropic: { apiKey: "v1.broken.payload.here" } });
    assert.equal(result.key, null);
    assert.equal(result.source, "undecryptable");
  });
});

describe("mergeAnthropicKeyIntoIntegrations", () => {
  // 2026-05-27 — Pure helper covering the JSONB merge shape that
  // /signup/connect-ai, /settings/integrations/llm, and the inline
  // /clients/new BYOK retry all write to. Same shape must round-trip
  // through resolveByokKeyFromIntegrationsBlob (verified via the
  // round-trip test at the bottom).
  test("creates the anthropic entry when integrations was empty", () => {
    const result = mergeAnthropicKeyIntoIntegrations({}, "v1.enc", "sk-ant-…AAAA", "2026-05-27T00:00:00.000Z");
    assert.deepEqual(result, {
      anthropic: {
        apiKey: "v1.enc",
        hint: "sk-ant-…AAAA",
        savedAt: "2026-05-27T00:00:00.000Z",
      },
    });
  });

  test("treats null/undefined existing blob as empty", () => {
    const r1 = mergeAnthropicKeyIntoIntegrations(null, "v1.x", "h", "t");
    const r2 = mergeAnthropicKeyIntoIntegrations(undefined, "v1.x", "h", "t");
    assert.deepEqual(r1, r2);
    assert.equal((r1.anthropic as { apiKey: string }).apiKey, "v1.x");
  });

  test("preserves unrelated providers (does not stomp openai or other keys)", () => {
    const result = mergeAnthropicKeyIntoIntegrations(
      {
        openai: { apiKey: "v1.oldopenai", hint: "sk-…ZZZZ", savedAt: "2026-01-01" },
        twilio: { phone: "+15551234567" },
      },
      "v1.newanthropic",
      "sk-ant-…BBBB",
      "2026-05-27T00:00:00.000Z",
    );
    assert.equal((result.openai as { apiKey: string }).apiKey, "v1.oldopenai");
    assert.equal((result.twilio as { phone: string }).phone, "+15551234567");
    assert.equal((result.anthropic as { apiKey: string }).apiKey, "v1.newanthropic");
  });

  test("overwrites an existing anthropic key (upsert semantics)", () => {
    const result = mergeAnthropicKeyIntoIntegrations(
      {
        anthropic: { apiKey: "v1.OLD", hint: "sk-ant-…OLD0", savedAt: "2026-01-01" },
      },
      "v1.NEW",
      "sk-ant-…NEW0",
      "2026-05-27T00:00:00.000Z",
    );
    assert.equal((result.anthropic as { apiKey: string }).apiKey, "v1.NEW");
    assert.equal((result.anthropic as { hint: string }).hint, "sk-ant-…NEW0");
    assert.equal((result.anthropic as { savedAt: string }).savedAt, "2026-05-27T00:00:00.000Z");
  });

  test("round-trips: merge result is readable by resolveByokKeyFromIntegrationsBlob", () => {
    // The setter (mergeAnthropicKeyIntoIntegrations) and the reader
    // (resolveByokKeyFromIntegrationsBlob) must agree on the JSONB
    // shape — if they ever drift, /clients/new would silently fail with
    // needs_byok despite a successful save. This test pins the contract.
    const merged = mergeAnthropicKeyIntoIntegrations({}, "sk-ant-plain", "sk-ant-…AAAA", "2026-05-27T00:00:00.000Z");
    // Pass plaintext-shape (no v1. prefix) so the reader returns the value
    // as-is rather than attempting to decrypt.
    const resolved = resolveByokKeyFromIntegrationsBlob(merged);
    assert.equal(resolved.source, "byok");
    assert.equal(resolved.key, "sk-ant-plain");
  });
});

describe("buildAnthropicKeyHint", () => {
  test("formats the last 4 chars with the sk-ant- prefix marker", () => {
    assert.equal(buildAnthropicKeyHint("sk-ant-abc123ZZZZ"), "sk-ant-…ZZZZ");
  });

  test("handles short inputs without throwing (degenerate cases)", () => {
    // Real Anthropic keys are 50+ chars; this is purely a defensive
    // check so a copy-paste fragment doesn't crash the setter.
    assert.equal(buildAnthropicKeyHint("abcd"), "sk-ant-…abcd");
    assert.equal(buildAnthropicKeyHint(""), "sk-ant-…");
  });
});
