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
    enforceWorkspaceLimit: async () => ({ allowed: true as const, tier: "workspace" as const }),
    getOwnedWorkspaceCount: async () => 0,
    // 2026-06-18 — MANAGED AI (BYOK gate removed). Resolver returns a key
    // (operator BYOK or platform). Specific tests override to null.
    resolveExtractionKey: async () => ({ key: "sk-ant-test" }),
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
    // 2026-05-18 — seed default outbound message triggers (messaging
    // plan v2, slice 2). Stub no-ops; production wires
    // seedDefaultOutboundTriggers(orgId).
    seedDefaultOutboundTriggers: async () => undefined,
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
    const deps = { ...baseDeps(), enforceWorkspaceLimit: async () => ({ allowed: false as const, tier: "workspace" as const, reason: "workspace_limit_reached" as const, message: "...", upgradeUrl: "/settings/billing", used: 1, limit: 1 }) };
    const sse = await runCreateFromUrl({ deps, body: { url: "https://x.com" }, sessionUser: { id: "u1", primaryOrgId: "o1" } });
    const text = await readAll(sse.stream);
    assert.match(text, /event: error\n.*"code":402.*upgradeUrl/);
  });

  // 2026-06-18 — BYOK gate removed (managed AI). When no key is
  // resolvable anywhere we now emit a non-BYOK extraction_unavailable
  // error (503), NOT the old needs_byok 412.
  test("emits 503 extraction_unavailable when no managed/BYOK key resolves", async () => {
    const deps = { ...baseDeps(), resolveExtractionKey: async () => null };
    const sse = await runCreateFromUrl({ deps, body: { url: "https://x.com" }, sessionUser: { id: "u1", primaryOrgId: "o1" } });
    const text = await readAll(sse.stream);
    assert.match(text, /event: error\n.*"code":503.*extraction_unavailable/);
    assert.ok(!text.includes("needs_byok"), "the removed BYOK gate must not fire");
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

  // 2026-07-14 — extraction-failed honesty fix. The extraction_failed 422
  // is a PERMANENT condition for that URL (no phone/name/location found on
  // the site at all) — retrying is futile, so the SSE payload must carry an
  // honest `message` the client can show instead of "Something broke on our
  // end. Give it another try." Other reasons are untouched.
  test("extraction_failed 422 carries a `message` explaining what's missing", async () => {
    const deps = { ...baseDeps(), extractBusinessFactsFromUrl: async () => { const e = new Error("bad output"); (e as any).reason = "extraction_failed"; (e as any).name = "WebFetchError"; throw e; } };
    const sse = await runCreateFromUrl({ deps, body: { url: "https://x.com" }, sessionUser: { id: "u1", primaryOrgId: "o1" } });
    const text = await readAll(sse.stream);
    assert.match(text, /event: error\n.*"code":422.*"reason":"extraction_failed".*"message":"/);
  });

  // 2026-07-16 — credits_exhausted honesty fix (same class as the
  // extraction_failed fix above). Out-of-credits is non-retryable from the
  // visitor's side: retrying can never succeed until credits are added, so
  // the payload must carry an honest `message` instead of letting the UI
  // fall back to "Something broke on our end. Give it another try."
  test("credits_exhausted 422 carries an honest non-retryable `message`", async () => {
    const deps = { ...baseDeps(), extractBusinessFactsFromUrl: async () => { const e = new Error("credit balance too low"); (e as any).reason = "credits_exhausted"; (e as any).name = "WebFetchError"; throw e; } };
    const sse = await runCreateFromUrl({ deps, body: { url: "https://x.com" }, sessionUser: { id: "u1", primaryOrgId: "o1" } });
    const text = await readAll(sse.stream);
    assert.match(text, /event: error\n.*"code":422.*"reason":"credits_exhausted".*"message":"/);
    assert.match(text, /out of credits/i, "the message must say credits ran out, not a generic failure");
  });

  test("a different reason (e.g. anthropic_unauthorized) carries no `message`", async () => {
    const deps = { ...baseDeps(), extractBusinessFactsFromUrl: async () => { const e = new Error("bad key"); (e as any).reason = "anthropic_unauthorized"; (e as any).name = "WebFetchError"; throw e; } };
    const sse = await runCreateFromUrl({ deps, body: { url: "https://x.com" }, sessionUser: { id: "u1", primaryOrgId: "o1" } });
    const text = await readAll(sse.stream);
    assert.match(text, /event: error\n.*"code":422.*"reason":"anthropic_unauthorized"/);
    assert.ok(!text.includes('"message"'), "non-extraction_failed reasons must not carry a message");
  });
});

// 2026-06-23 — Deploy-CTA → instantiate-the-clicked-agent wiring. The
// orchestration contract (the route wires the real resolveStarterId →
// instantiateStarter behind deps.instantiateStarterAgent; the pure mapping is
// covered in seo/agent-pages.spec.ts):
//   - when body.canonicalAgent is set, fork that agent into the NEW workspace
//     (builderOrgId === the new workspace_id, the buyer's org)
//   - when absent, NEVER call it (normal first-run is untouched)
//   - when createFullWorkspace fails, NEVER call it (no workspace to fork into)
//   - SOFT-FAIL: a throwing instantiation must NOT block/fail the build — the
//     success sequence (…→ done) still completes.
describe("runCreateFromUrl — SEO Deploy-CTA agent instantiation", () => {
  test("instantiates the clicked agent into the NEW workspace's org when a slug is passed", async () => {
    const calls: Array<{ builderOrgId: string; canonicalAgent: string }> = [];
    const deps = {
      ...baseDeps(),
      instantiateStarterAgent: async (args: { builderOrgId: string; canonicalAgent: string }) => {
        calls.push(args);
        return { ok: true, id: "tmpl-7", starterId: "ai-phone-receptionist" };
      },
    };
    const sse = await runCreateFromUrl({
      deps,
      body: { url: "https://acme.com", canonicalAgent: "ai-phone-receptionist" },
      sessionUser: { id: "u1", primaryOrgId: "operator-org-99" },
    });
    const text = await readAll(sse.stream);
    assert.deepEqual(
      calls,
      [{ builderOrgId: "org-1", canonicalAgent: "ai-phone-receptionist" }],
      "must fork the clicked agent into the freshly-built workspace's org (org-1), NOT the operator's agency org",
    );
    // The build still completes normally.
    assert.match(text, /event: done\n/);
  });

  test("does NOT instantiate any agent when no canonicalAgent slug was passed", async () => {
    let called = false;
    const deps = {
      ...baseDeps(),
      instantiateStarterAgent: async () => {
        called = true;
        return { ok: true };
      },
    };
    const sse = await runCreateFromUrl({
      deps,
      body: { url: "https://acme.com" },
      sessionUser: { id: "u1", primaryOrgId: "o1" },
    });
    await readAll(sse.stream);
    assert.equal(called, false, "the magic first-run build must not fork an agent when none was requested");
  });

  test("does NOT instantiate the agent when createFullWorkspace fails", async () => {
    let called = false;
    const deps = {
      ...baseDeps(),
      createFullWorkspace: async () => ({ status: "error" as const, error: { step: "soul", message: "boom" } }),
      instantiateStarterAgent: async () => {
        called = true;
        return { ok: true };
      },
    };
    const sse = await runCreateFromUrl({
      deps,
      body: { url: "https://acme.com", canonicalAgent: "ai-phone-receptionist" },
      sessionUser: { id: "u1", primaryOrgId: "o1" },
    });
    await readAll(sse.stream);
    assert.equal(called, false, "no workspace was created, so there is nothing to fork into");
  });

  test("SOFT-FAIL: an instantiation that throws does NOT block or fail the build", async () => {
    const deps = {
      ...baseDeps(),
      instantiateStarterAgent: async () => {
        throw new Error("template store unavailable");
      },
    };
    const sse = await runCreateFromUrl({
      deps,
      body: { url: "https://acme.com", canonicalAgent: "ai-phone-receptionist" },
      sessionUser: { id: "u1", primaryOrgId: "o1" },
    });
    const text = await readAll(sse.stream);
    // The build completes cleanly — done fires, no error event.
    assert.match(text, /event: done\n.*"workspaceId":"org-1"/, "the build must still finish despite the fork failing");
    assert.ok(!/event: error/.test(text), "a fork failure must not surface as a build error");
  });
});
