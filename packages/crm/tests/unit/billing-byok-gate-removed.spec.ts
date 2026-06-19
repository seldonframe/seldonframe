// Phase 1 — the BYOK 412 gate is removed.
//
// Pre-change: runCreateFromUrl emitted `error { reason: "needs_byok" }`
// (HTTP 412) whenever the operator org had no Anthropic key on file,
// forcing every operator to paste their own key before the URL→workspace
// flow would run. The new model is MANAGED AI for all paid tiers: the
// route supplies a key (operator BYOK if present, else the platform key)
// and the orchestrator never gates on BYOK.
//
// This spec drives the orchestrator with injected deps and reads the SSE
// stream as text, asserting:
//   1. with a resolvable extraction key, the flow proceeds (fetching →
//      … → done) and NEVER emits needs_byok.
//   2. with NO key resolvable anywhere, it fails with a non-BYOK
//      `extraction_unavailable` error — not the old needs_byok 412.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { runCreateFromUrl, type RunDeps } from "@/lib/web-onboarding/run-create-from-url";

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

function baseDeps(overrides: Partial<RunDeps> = {}): RunDeps {
  const noop = async () => undefined;
  return {
    enforceWorkspaceLimit: async () => ({ allowed: true, tier: "workspace" }),
    getOwnedWorkspaceCount: async () => 0,
    // New managed-AI seam: resolves a key (operator BYOK or platform).
    resolveExtractionKey: async () => ({ key: "sk-ant-managed-platform" }),
    extractBusinessFactsFromUrl: async () =>
      ({ business_name: "Acme", business_description: "x", services: [] }) as never,
    createFullWorkspace: async () =>
      ({ status: "ready", workspace_id: "ws-1", slug: "acme" }) as never,
    markOperatorOnboarded: noop,
    linkWorkspaceToOperator: noop,
    createWebsiteChatbot: noop,
    seedClientContactInAgencyCrm: noop,
    seedSoulWikiSourceUrl: noop,
    seedDefaultOutboundTriggers: noop,
    workspaceBaseDomain: "app.seldonframe.com",
    ...overrides,
  };
}

describe("BYOK gate removed — managed AI proceeds without operator key", () => {
  test("never emits needs_byok when an extraction key is resolvable", async () => {
    const { stream } = await runCreateFromUrl({
      deps: baseDeps(),
      body: { url: "https://acme.com" },
      sessionUser: { id: "u1", primaryOrgId: "org-1" },
    });
    const text = await readStream(stream);
    assert.ok(!text.includes("needs_byok"), "must not emit the removed needs_byok gate");
    assert.ok(text.includes("event: fetching"), "should proceed to fetching");
    assert.ok(text.includes("event: done"), "should reach done");
  });

  test("proceeds even when the operator has no primaryOrgId (platform key path)", async () => {
    const { stream } = await runCreateFromUrl({
      deps: baseDeps(),
      body: { url: "https://acme.com" },
      sessionUser: { id: "u1", primaryOrgId: null },
    });
    const text = await readStream(stream);
    assert.ok(!text.includes("needs_byok"));
    assert.ok(text.includes("event: done"));
  });
});

describe("BYOK gate removed — no key anywhere yields a non-BYOK error", () => {
  test("emits extraction_unavailable (not needs_byok) when no key resolves", async () => {
    const { stream } = await runCreateFromUrl({
      deps: baseDeps({ resolveExtractionKey: async () => null }),
      body: { url: "https://acme.com" },
      sessionUser: { id: "u1", primaryOrgId: "org-1" },
    });
    const text = await readStream(stream);
    assert.ok(!text.includes("needs_byok"), "must not fall back to the removed BYOK gate");
    assert.ok(
      text.includes("extraction_unavailable"),
      "should surface a managed-AI-unavailable error instead",
    );
  });
});
