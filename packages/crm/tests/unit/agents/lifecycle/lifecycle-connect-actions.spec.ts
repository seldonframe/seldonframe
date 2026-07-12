// Agent lifecycle slice — connectLifecycleToolkitAction (Wave 2 review, F8).
//
// The Connected stage's "Connect" button minted a Composio connect link for
// ANY templateId the caller passed, without verifying it belongs to the
// caller's org — the same org-guarded template lookup every other template
// action (e.g. startSupervisedRunAction) already performs was missing here.
// DI'd per this repo's convention (mirrors set-booking-policy.spec.ts /
// seller-actions.spec's resolvePublishGuard) so it's testable without a
// live DB/session.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  connectLifecycleToolkitAction,
  type ConnectLifecycleToolkitDeps,
} from "../../../../src/lib/agent-templates/lifecycle-connect-actions";

const ORG_ID = "org-1";
const TEMPLATE_ID = "tmpl-1";
const TOOLKIT = "gmail";

function baseDeps(over: Partial<ConnectLifecycleToolkitDeps> = {}): ConnectLifecycleToolkitDeps {
  return {
    getOrgId: async () => ORG_ID,
    getCurrentUser: async () => ({ id: "user-1" }),
    loadTemplate: async () => ({ id: TEMPLATE_ID }),
    createConnectLink: (async () => ({ redirectUrl: "https://connect.composio.dev/abc" })) as ConnectLifecycleToolkitDeps["createConnectLink"],
    ...over,
  };
}

describe("connectLifecycleToolkitAction", () => {
  test("unauthorized when there is no logged-in org", async () => {
    let linkMinted = false;
    const result = await connectLifecycleToolkitAction(
      { templateId: TEMPLATE_ID, toolkit: TOOLKIT },
      baseDeps({
        getOrgId: async () => null,
        createConnectLink: (async () => {
          linkMinted = true;
          return { redirectUrl: "https://connect.composio.dev/abc" };
        }) as ConnectLifecycleToolkitDeps["createConnectLink"],
      }),
    );
    assert.deepEqual(result, { ok: false, error: "unauthorized" });
    assert.equal(linkMinted, false);
  });

  test("F8: a templateId belonging to ANOTHER org -> template_not_found, no link minted", async () => {
    let linkMinted = false;
    let loadTemplateCalledWith: { templateId: string; orgId: string } | null = null;
    const result = await connectLifecycleToolkitAction(
      { templateId: "someone-elses-template", toolkit: TOOLKIT },
      baseDeps({
        loadTemplate: async (args) => {
          loadTemplateCalledWith = args;
          return null; // the org-guarded query found nothing for THIS org
        },
        createConnectLink: (async () => {
          linkMinted = true;
          return { redirectUrl: "https://connect.composio.dev/abc" };
        }) as ConnectLifecycleToolkitDeps["createConnectLink"],
      }),
    );
    assert.deepEqual(result, { ok: false, error: "template_not_found" });
    assert.equal(linkMinted, false, "the connect link must never be minted for an unresolved template");
    assert.deepEqual(loadTemplateCalledWith, { templateId: "someone-elses-template", orgId: ORG_ID });
  });

  test("blank templateId -> template_not_found, no link minted, no DB lookup attempted", async () => {
    let loadTemplateCalls = 0;
    const result = await connectLifecycleToolkitAction(
      { templateId: "   ", toolkit: TOOLKIT },
      baseDeps({
        loadTemplate: async () => {
          loadTemplateCalls += 1;
          return null;
        },
      }),
    );
    assert.deepEqual(result, { ok: false, error: "template_not_found" });
    assert.equal(loadTemplateCalls, 0);
  });

  test("unknown toolkit -> unknown_toolkit (checked AFTER the org-guard, still no link minted)", async () => {
    let linkMinted = false;
    const result = await connectLifecycleToolkitAction(
      { templateId: TEMPLATE_ID, toolkit: "not_a_real_toolkit" },
      baseDeps({
        createConnectLink: (async () => {
          linkMinted = true;
          return { redirectUrl: "https://connect.composio.dev/abc" };
        }) as ConnectLifecycleToolkitDeps["createConnectLink"],
      }),
    );
    assert.deepEqual(result, { ok: false, error: "unknown_toolkit" });
    assert.equal(linkMinted, false);
  });

  test("happy path: own template + known toolkit -> mints the redirect link", async () => {
    const result = await connectLifecycleToolkitAction(
      { templateId: TEMPLATE_ID, toolkit: TOOLKIT },
      baseDeps(),
    );
    assert.deepEqual(result, { ok: true, redirectUrl: "https://connect.composio.dev/abc" });
  });

  test("default mode (popup): callback targets the minimal /integrations/connected route, never the agent page", async () => {
    let calledCallbackUrl: string | null = null;
    await connectLifecycleToolkitAction(
      { templateId: TEMPLATE_ID, toolkit: TOOLKIT },
      baseDeps({
        createConnectLink: (async (_orgId, _toolkit, callbackUrl) => {
          calledCallbackUrl = callbackUrl;
          return { redirectUrl: "https://connect.composio.dev/abc" };
        }) as ConnectLifecycleToolkitDeps["createConnectLink"],
      }),
    );
    assert.equal(calledCallbackUrl, "https://app.seldonframe.com/integrations/connected?popup=1&toolkit=gmail");
  });

  test("mode: redirect with a trusted same-origin /studio returnTo -> uses it as the callback", async () => {
    let calledCallbackUrl: string | null = null;
    await connectLifecycleToolkitAction(
      {
        templateId: TEMPLATE_ID,
        toolkit: TOOLKIT,
        mode: "redirect",
        returnTo: "https://app.seldonframe.com/studio/agents/tmpl-1?stage=connected",
      },
      baseDeps({
        createConnectLink: (async (_orgId, _toolkit, callbackUrl) => {
          calledCallbackUrl = callbackUrl;
          return { redirectUrl: "https://connect.composio.dev/abc" };
        }) as ConnectLifecycleToolkitDeps["createConnectLink"],
      }),
    );
    assert.equal(calledCallbackUrl, "https://app.seldonframe.com/studio/agents/tmpl-1?stage=connected");
  });

  test("mode: redirect with an untrusted returnTo -> falls back to the standard #lc-connected return, never an open redirect", async () => {
    let calledCallbackUrl: string | null = null;
    await connectLifecycleToolkitAction(
      {
        templateId: TEMPLATE_ID,
        toolkit: TOOLKIT,
        mode: "redirect",
        returnTo: "https://evil.example.com/whatever",
      },
      baseDeps({
        createConnectLink: (async (_orgId, _toolkit, callbackUrl) => {
          calledCallbackUrl = callbackUrl;
          return { redirectUrl: "https://connect.composio.dev/abc" };
        }) as ConnectLifecycleToolkitDeps["createConnectLink"],
      }),
    );
    assert.equal(calledCallbackUrl, "https://app.seldonframe.com/studio/agents/tmpl-1?connected=gmail#lc-connected");
  });

  test("composio not configured -> composio_not_configured", async () => {
    const result = await connectLifecycleToolkitAction(
      { templateId: TEMPLATE_ID, toolkit: TOOLKIT },
      baseDeps({
        createConnectLink: (async () => ({ redirectUrl: null })) as unknown as ConnectLifecycleToolkitDeps["createConnectLink"],
      }),
    );
    assert.deepEqual(result, { ok: false, error: "composio_not_configured" });
  });
});
