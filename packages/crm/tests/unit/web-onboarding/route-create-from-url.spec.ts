// packages/crm/tests/unit/web-onboarding/route-create-from-url.spec.ts
//
// 2026-05-17 UPDATE: success sequence is now
//   fetching → extracting → soul_built → chatbot_built → demo_seeded → done
// (6 events). This matches what the UI's PROGRESS_KEYS array listens for —
// previously the backend emitted a single "building" event that the UI
// ignored, so the LIVE BUILD checklist pulsed on "Shaping the personality"
// forever even though the workspace had been created server-side.
//
// Also: on success, markOperatorOnboarded is called with the OPERATOR's
// primaryOrgId so the next request's JWT picks up soulCompletedAt and the
// proxy.ts:261 redirect-to-/clients/new loop is broken.

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
    // 2026-05-17 — new dep added so proxy.ts:261 doesn't bounce the operator
    // back to /clients/new after the first successful workspace creation.
    // Default no-op stub; specific tests assert the call.
    markOperatorOnboarded: async () => {},
    // 2026-05-17 — new dep that links the freshly-created workspace to the
    // operator (ownerId + org_members 'owner' row). Without it the user
    // creates a workspace they can't see. Default no-op stub.
    linkWorkspaceToOperator: async () => ({ ok: true, alreadyOwned: false }),
    // 2026-05-17 — auto-create the website-chatbot agent so the Ready hub
    // can deep-link "Test chatbot →" to a real test page. Stub returns
    // ok:true; production wires createAgent(... archetype:'website-chatbot').
    createWebsiteChatbot: async () => ({ ok: true }),
    // 2026-05-17 — auto-seed a contact in the AGENCY's CRM representing
    // the new client SMB. Stub returns ok:true; production wires
    // seedClientContactInAgencyCrm(... agencyOrgId, clientWorkspaceId, ...).
    seedClientContactInAgencyCrm: async () => ({ ok: true, created: true, contactId: "contact-1" }),
    // 2026-05-17 — auto-seed the soul_sources URL for the new workspace
    // so /settings/soul-wiki shows it on first visit. Stub returns ok:true.
    seedSoulWikiSourceUrl: async () => ({ ok: true, created: true, sourceId: "source-1" }),
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

  test("emits the success sequence: fetching → extracting → soul_built → chatbot_built → demo_seeded → done", async () => {
    const sse = await runCreateFromUrl({ deps: baseDeps(), body: { url: "https://acme.com" }, sessionUser: { id: "u1", primaryOrgId: "o1" } });
    const text = await readAll(sse.stream);
    const fetchingIdx = text.indexOf("event: fetching");
    const extractingIdx = text.indexOf("event: extracting");
    const soulBuiltIdx = text.indexOf("event: soul_built");
    const chatbotBuiltIdx = text.indexOf("event: chatbot_built");
    const demoSeededIdx = text.indexOf("event: demo_seeded");
    const doneIdx = text.indexOf("event: done");
    assert.ok(
      fetchingIdx >= 0 &&
        extractingIdx > fetchingIdx &&
        soulBuiltIdx > extractingIdx &&
        chatbotBuiltIdx > soulBuiltIdx &&
        demoSeededIdx > chatbotBuiltIdx &&
        doneIdx > demoSeededIdx,
      "events out of order: " + text,
    );
    assert.match(text, /event: done\n.*"workspaceId":"org-1".*"slug":"acme-plumbing"/);
    // 2026-05-17 — redirect target now points at the deliverables hub,
    // not the generic /dashboard?ws=<slug> view, so the operator lands
    // on a screen that surfaces public URLs + next steps.
    assert.match(text, /"dashboardUrl":"\/clients\/acme-plumbing\/ready"/);
  });

  test("calls markOperatorOnboarded with both the operator's primaryOrgId AND userId on success", async () => {
    const calls: Array<{ orgId: string; userId?: string }> = [];
    const deps = {
      ...baseDeps(),
      markOperatorOnboarded: async (orgId: string, userId?: string) => {
        calls.push({ orgId, userId });
      },
    };
    const sse = await runCreateFromUrl({ deps, body: { url: "https://acme.com" }, sessionUser: { id: "operator-user-42", primaryOrgId: "operator-org-99" } });
    await readAll(sse.stream);
    assert.deepEqual(
      calls,
      [{ orgId: "operator-org-99", userId: "operator-user-42" }],
      "markOperatorOnboarded should receive BOTH the orgId (for org-level soulCompletedAt + welcomeShown) and userId (for user-level planId='free')",
    );
  });

  test("does NOT call markOperatorOnboarded when createFullWorkspace fails", async () => {
    const calls: Array<{ orgId: string; userId?: string }> = [];
    const deps = {
      ...baseDeps(),
      createFullWorkspace: async () => ({ status: "error" as const, error: { step: "soul", message: "boom" } }),
      markOperatorOnboarded: async (orgId: string, userId?: string) => { calls.push({ orgId, userId }); },
    };
    const sse = await runCreateFromUrl({ deps, body: { url: "https://acme.com" }, sessionUser: { id: "u1", primaryOrgId: "operator-org-99" } });
    await readAll(sse.stream);
    assert.deepEqual(calls, [], "markOperatorOnboarded must not run when workspace creation failed");
  });

  test("calls linkWorkspaceToOperator with the new workspace_id + operator's userId on success", async () => {
    const calls: Array<{ workspaceId: string; userId: string }> = [];
    const deps = {
      ...baseDeps(),
      linkWorkspaceToOperator: async (workspaceId: string, userId: string) => {
        calls.push({ workspaceId, userId });
        return { ok: true, alreadyOwned: false };
      },
    };
    const sse = await runCreateFromUrl({ deps, body: { url: "https://acme.com" }, sessionUser: { id: "operator-user-42", primaryOrgId: "operator-org-99" } });
    await readAll(sse.stream);
    assert.deepEqual(
      calls,
      [{ workspaceId: "org-1", userId: "operator-user-42" }],
      "linkWorkspaceToOperator must be called with the newly-created workspace id + the operator's userId so the new workspace appears in their /clients listing",
    );
  });

  test("does NOT call linkWorkspaceToOperator when createFullWorkspace fails", async () => {
    const calls: Array<{ workspaceId: string; userId: string }> = [];
    const deps = {
      ...baseDeps(),
      createFullWorkspace: async () => ({ status: "error" as const, error: { step: "soul", message: "boom" } }),
      linkWorkspaceToOperator: async (workspaceId: string, userId: string) => {
        calls.push({ workspaceId, userId });
        return { ok: true, alreadyOwned: false };
      },
    };
    const sse = await runCreateFromUrl({ deps, body: { url: "https://acme.com" }, sessionUser: { id: "u1", primaryOrgId: "operator-org-99" } });
    await readAll(sse.stream);
    assert.deepEqual(calls, [], "linkWorkspaceToOperator must not run when workspace creation failed");
  });

  test("emits 422 when extraction throws WebFetchError with extraction_failed", async () => {
    const deps = { ...baseDeps(), extractBusinessFactsFromUrl: async () => { const e = new Error("bad output"); (e as any).reason = "extraction_failed"; (e as any).name = "WebFetchError"; throw e; } };
    const sse = await runCreateFromUrl({ deps, body: { url: "https://x.com" }, sessionUser: { id: "u1", primaryOrgId: "o1" } });
    const text = await readAll(sse.stream);
    assert.match(text, /event: error\n.*"code":422.*extraction_failed/);
  });
});
