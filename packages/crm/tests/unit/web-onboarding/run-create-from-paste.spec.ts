// packages/crm/tests/unit/web-onboarding/run-create-from-paste.spec.ts
//
// 2026-07-16 — created for the credits_exhausted honesty fix. The paste
// orchestrator mirrors run-create-from-url.ts (which has full coverage in
// route-create-from-url.spec.ts); this spec covers only the paste path's
// 422 payload contract — the seam that had drifted: run-create-from-url
// emitted an honest `message` for credits_exhausted while the paste path
// still emitted a bare `{reason}`, so /clients/new's paste tab showed
// "We couldn't read that site" for an out-of-credits Anthropic key.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { runCreateFromPaste } from "../../../src/lib/web-onboarding/run-create-from-paste";

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

const pastedText =
  "Acme Plumbing in Phoenix, AZ. Drain cleaning and water heaters. Call (602) 555-0100.";

function baseDeps() {
  return {
    enforceWorkspaceLimit: async () => ({ allowed: true as const, tier: "workspace" as const }),
    getOwnedWorkspaceCount: async () => 0,
    resolveExtractionKey: async () => ({ key: "sk-ant-test" }),
    extractBusinessFactsFromPaste: async () => validFacts,
    createFullWorkspace: async () => ({
      status: "ready" as const,
      workspace_id: "org-1",
      slug: "acme-plumbing",
      public_urls: { home: "https://acme-plumbing.app.seldonframe.com", book: "...", intake: "..." },
    }),
    markOperatorOnboarded: async () => {},
    linkWorkspaceToOperator: async () => ({ ok: true, alreadyOwned: false }),
    createWebsiteChatbot: async () => ({ ok: true }),
    seedClientContactInAgencyCrm: async () => ({ ok: true, created: true, contactId: "contact-1" }),
    seedDefaultOutboundTriggers: async () => undefined,
    workspaceBaseDomain: "app.seldonframe.com",
  };
}

function throwingExtractor(reason: string) {
  return async () => {
    const e = new Error("extractor blew up");
    (e as any).reason = reason;
    (e as any).name = "WebFetchError";
    throw e;
  };
}

describe("runCreateFromPaste — 422 payload contract", () => {
  test("credits_exhausted 422 carries an honest non-retryable `message`", async () => {
    const deps = { ...baseDeps(), extractBusinessFactsFromPaste: throwingExtractor("credits_exhausted") };
    const sse = await runCreateFromPaste({
      deps,
      body: { text: pastedText },
      sessionUser: { id: "u1", primaryOrgId: "o1" },
    });
    const text = await readAll(sse.stream);
    assert.match(text, /event: error\n.*"code":422.*"reason":"credits_exhausted".*"message":"/);
    assert.match(text, /out of credits/i, "the message must say credits ran out, not a generic failure");
  });

  test("other 422 reasons (e.g. anthropic_unauthorized) carry no `message`", async () => {
    const deps = { ...baseDeps(), extractBusinessFactsFromPaste: throwingExtractor("anthropic_unauthorized") };
    const sse = await runCreateFromPaste({
      deps,
      body: { text: pastedText },
      sessionUser: { id: "u1", primaryOrgId: "o1" },
    });
    const text = await readAll(sse.stream);
    assert.match(text, /event: error\n.*"code":422.*"reason":"anthropic_unauthorized"/);
    assert.ok(!text.includes('"message"'), "non-credits reasons must stay bare on the paste path");
  });
});
