// Marketplace buyer onboarding — TDD for the deployment AI-key resolver (pure).
//
// resolveDeploymentAiKey picks the provider from the surface (phone → openai,
// everything else → anthropic), then prefers the BUILDER's key, fail-softs to the
// platform key, and reports `ready: false` when neither exists.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveDeploymentAiKey,
  providerForSurface,
} from "../../../../src/lib/marketplace/buyer/deployment-ai-key";

test("provider: phone → openai (voice); embed/link/sms/email → anthropic (text)", () => {
  assert.equal(providerForSurface("phone"), "openai");
  assert.equal(providerForSurface("embed"), "anthropic");
  assert.equal(providerForSurface("link"), "anthropic");
  assert.equal(providerForSurface("sms"), "anthropic");
  assert.equal(providerForSurface("email"), "anthropic");
});

test("voice: prefers the builder's OpenAI key over the platform key", () => {
  const r = resolveDeploymentAiKey({
    surface: "phone",
    builderOpenAiKey: "sk-builder",
    platformOpenAiKey: "sk-platform",
  });
  assert.equal(r.provider, "openai");
  assert.equal(r.key, "sk-builder");
  assert.equal(r.source, "builder");
  assert.equal(r.ready, true);
});

test("voice: fails soft to the platform OpenAI key when the builder set none", () => {
  const r = resolveDeploymentAiKey({
    surface: "phone",
    builderOpenAiKey: "",
    platformOpenAiKey: "sk-platform",
  });
  assert.equal(r.key, "sk-platform");
  assert.equal(r.source, "platform");
  assert.equal(r.ready, true);
});

test("voice: NOT ready when neither a builder nor a platform OpenAI key exists", () => {
  const r = resolveDeploymentAiKey({
    surface: "phone",
    builderOpenAiKey: "   ", // whitespace = absent
    platformOpenAiKey: null,
  });
  assert.equal(r.key, null);
  assert.equal(r.source, "none");
  assert.equal(r.ready, false);
});

test("chat: prefers the builder's Anthropic key; OpenAI keys are ignored for text", () => {
  const r = resolveDeploymentAiKey({
    surface: "embed",
    builderAnthropicKey: "sk-ant-builder",
    builderOpenAiKey: "sk-oai-builder", // irrelevant for a text surface
    platformAnthropicKey: "sk-ant-platform",
  });
  assert.equal(r.provider, "anthropic");
  assert.equal(r.key, "sk-ant-builder");
  assert.equal(r.source, "builder");
});

test("chat: fails soft to the platform Anthropic key", () => {
  const r = resolveDeploymentAiKey({
    surface: "embed",
    builderAnthropicKey: null,
    platformAnthropicKey: "sk-ant-platform",
  });
  assert.equal(r.key, "sk-ant-platform");
  assert.equal(r.source, "platform");
  assert.equal(r.ready, true);
});

test("chat: NOT ready when no Anthropic key anywhere (even if an OpenAI key exists)", () => {
  const r = resolveDeploymentAiKey({
    surface: "link",
    builderOpenAiKey: "sk-oai",
    platformOpenAiKey: "sk-oai-platform",
    // no anthropic keys at all
  });
  assert.equal(r.source, "none");
  assert.equal(r.ready, false);
});

test("tolerates all-absent inputs without throwing", () => {
  const r = resolveDeploymentAiKey({ surface: "phone" });
  assert.equal(r.ready, false);
  assert.equal(r.key, null);
});
