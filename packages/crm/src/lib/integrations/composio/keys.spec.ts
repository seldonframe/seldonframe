// TDD for the pure Composio key resolver. Mirrors the resolution order of the
// AI client (BYO secret wins, else platform env, else none) so an operator can
// override the platform Composio key per-workspace exactly like the LLM key.

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveComposioKeyFromInputs } from "./keys";

test("BYO key wins over platform key", () => {
  const r = resolveComposioKeyFromInputs("byo-123", "platform-456");
  assert.deepEqual(r, { apiKey: "byo-123", source: "byo" });
});

test("BYO key wins even when platform is null", () => {
  const r = resolveComposioKeyFromInputs("byo-123", null);
  assert.deepEqual(r, { apiKey: "byo-123", source: "byo" });
});

test("falls back to platform key when no BYO key", () => {
  const r = resolveComposioKeyFromInputs(null, "platform-456");
  assert.deepEqual(r, { apiKey: "platform-456", source: "platform" });
});

test("returns none when neither key is present", () => {
  const r = resolveComposioKeyFromInputs(null, null);
  assert.deepEqual(r, { apiKey: null, source: "none" });
});

test("treats empty/whitespace BYO as absent (falls through to platform)", () => {
  assert.deepEqual(resolveComposioKeyFromInputs("", "platform-456"), {
    apiKey: "platform-456",
    source: "platform",
  });
  assert.deepEqual(resolveComposioKeyFromInputs("   ", "platform-456"), {
    apiKey: "platform-456",
    source: "platform",
  });
});

test("treats empty/whitespace platform as absent (→ none)", () => {
  assert.deepEqual(resolveComposioKeyFromInputs(null, ""), {
    apiKey: null,
    source: "none",
  });
  assert.deepEqual(resolveComposioKeyFromInputs("  ", "  "), {
    apiKey: null,
    source: "none",
  });
});

test("trims the resolved key", () => {
  assert.deepEqual(resolveComposioKeyFromInputs("  byo-123  ", null), {
    apiKey: "byo-123",
    source: "byo",
  });
  assert.deepEqual(resolveComposioKeyFromInputs(null, "  platform-456 "), {
    apiKey: "platform-456",
    source: "platform",
  });
});
