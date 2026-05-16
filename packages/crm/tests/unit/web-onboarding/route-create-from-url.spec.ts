// packages/crm/tests/unit/web-onboarding/route-create-from-url.spec.ts
//
// PATCHED PER PLAN CORRECTION (2026-05-16): uses the real createFullWorkspace
// from lib/workspace/create-full.ts (mocked here) instead of the bypassed
// createWorkspaceFromSoulAction. SSE event sequence is fetching →
// extracting → building → done (4 events, atomic build phase).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { runCreateFromUrl } from "../../../src/lib/web-onboarding/run-create-from-url";

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

const validFacts = {
  business_name: "Acme Plumbing",
  city: "Phoenix",
  state: "AZ",
  phone: "(602) 555-0100",
  services: ["Drain cleaning"],
  business_description: "Plumbing in Phoenix.",
};

function baseDeps() {
  return {
    enforceWorkspaceLimit: async () => ({ allowed: true as const, tier: "free" as const }),
    getOwnedWorkspaceCount: async () => 0,
    getOperatorByokAnthropicKey: async () => ({ key: "sk-ant-test", source: "byok" as const }),
    extractBusinessFactsFromUrl: async () => validFacts,
    createFullWorkspace: async () => ({
      status: "ready" as const,
      workspace_id: "org-1",
      slug: "acme-plumbing",
      public_urls: { home: "https://acme-plumbing.app.seldonframe.com", book: "...", intake: "..." },
    }),
    workspaceBaseDomain: "app.seldonframe.com",
  };
}

describe("runCreateFromUrl", () => {
  test("emits 401 then closes when sessionUser is null", async () => {
    const sse = await runCreateFromUrl({ deps: baseDeps(), body: { url: "https://x.com" }, sessionUser: null });
    const text = await readAll(sse.stream);
    assert.match(text, /event: error\n.*"code":401/);
  });

  test("emits 400 when URL is invalid", async () => {
    const sse = await runCreateFromUrl({ deps: baseDeps(), body: { url: "not-a-url" }, sessionUser: { id: "u1", primaryOrgId: "o1" } });
    const text = await readAll(sse.stream);
    assert.match(text, /event: error\n.*"code":400/);
  });

  test("emits 402 with upgradeUrl when at workspace limit", async () => {
    const deps = { ...baseDeps(), enforceWorkspaceLimit: async () => ({ allowed: false as const, tier: "free" as const, reason: "workspace_limit_reached" as const, message: "...", upgradeUrl: "/settings/billing", used: 1, limit: 1 }) };
    const sse = await runCreateFromUrl({ deps, body: { url: "https://x.com" }, sessionUser: { id: "u1", primaryOrgId: "o1" } });
    const text = await readAll(sse.stream);
    assert.match(text, /event: error\n.*"code":402.*upgradeUrl/);
  });

  test("emits 412 with needs_byok when BYOK key is missing", async () => {
    const deps = { ...baseDeps(), getOperatorByokAnthropicKey: async () => null };
    const sse = await runCreateFromUrl({ deps, body: { url: "https://x.com" }, sessionUser: { id: "u1", primaryOrgId: "o1" } });
    const text = await readAll(sse.stream);
    assert.match(text, /event: error\n.*"code":412.*needs_byok/);
  });

  test("emits the success sequence: fetching → extracting → building → done", async () => {
    const sse = await runCreateFromUrl({ deps: baseDeps(), body: { url: "https://acme.com" }, sessionUser: { id: "u1", primaryOrgId: "o1" } });
    const text = await readAll(sse.stream);
    const fetchingIdx = text.indexOf("event: fetching");
    const extractingIdx = text.indexOf("event: extracting");
    const buildingIdx = text.indexOf("event: building");
    const doneIdx = text.indexOf("event: done");
    assert.ok(fetchingIdx >= 0 && extractingIdx > fetchingIdx && buildingIdx > extractingIdx && doneIdx > buildingIdx, "events out of order: " + text);
    assert.match(text, /event: done\n.*"workspaceId":"org-1".*"slug":"acme-plumbing"/);
  });

  test("emits 422 when extraction throws WebFetchError with extraction_failed", async () => {
    const deps = { ...baseDeps(), extractBusinessFactsFromUrl: async () => { const e = new Error("bad output"); (e as any).reason = "extraction_failed"; (e as any).name = "WebFetchError"; throw e; } };
    const sse = await runCreateFromUrl({ deps, body: { url: "https://x.com" }, sessionUser: { id: "u1", primaryOrgId: "o1" } });
    const text = await readAll(sse.stream);
    assert.match(text, /event: error\n.*"code":422.*extraction_failed/);
  });
});
