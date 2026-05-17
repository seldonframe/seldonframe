// packages/crm/src/app/api/v1/web/workspaces/create-from-url/route.ts
//
// PATCHED PER PLAN CORRECTION (2026-05-16): wires the REAL primitives:
//   - enforceWorkspaceLimit from @/lib/billing/limits (existing)
//   - createFullWorkspace from @/lib/workspace/create-full (existing)
//   - getOwnedWorkspaceCount from @/lib/web-onboarding/owned-workspace-count (new)
//   - getOperatorByokAnthropicKey from @/lib/web-onboarding/byok-resolver (new, Phase 2)
//   - extractBusinessFactsFromUrl from @/lib/web-onboarding/web-fetch-extractor (new, Task 6.4)
//
// Inline adapters bridge two small signature gaps between the orchestrator's
// RunDeps contract and the real primitives:
//   1. enforceWorkspaceLimit() in lib/billing/limits.ts also requires `userId`;
//      the adapter closes over the session userId.
//   2. getOperatorByokAnthropicKey() takes `{ orgId }` and returns a richer
//      ByokResolverResult ({ key, source: "byok" | "missing" | "undecryptable" });
//      the adapter narrows it down to `{ key, source: "byok" } | null` so the
//      orchestrator's needs_byok branch fires for all non-byok outcomes.

import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { runCreateFromUrl } from "@/lib/web-onboarding/run-create-from-url";
import { enforceWorkspaceLimit } from "@/lib/billing/limits";
import { createFullWorkspace } from "@/lib/workspace/create-full";
import { getOwnedWorkspaceCount } from "@/lib/web-onboarding/owned-workspace-count";
import { getOperatorByokAnthropicKey } from "@/lib/web-onboarding/byok-resolver";
// 2026-05-17 — marks the OPERATOR's own org as onboarded once their first
// client workspace is successfully created so proxy.ts:261 stops 307'ing
// every authed page request back to /clients/new. See the file header for
// the full story.
import { markOperatorOnboarded } from "@/lib/web-onboarding/mark-operator-onboarded";
// 2026-05-17 — links the freshly-created workspace to the operator so
// it actually shows up in their /clients listing + workspace switcher.
// See lib/workspace/link-workspace-to-operator.ts header.
import { linkWorkspaceToOperator } from "@/lib/workspace/link-workspace-to-operator";
// 2026-05-17 — Auto-create the website-chatbot agent immediately after
// workspace creation so the Ready hub's "Test chatbot →" link points
// at a real /agents/<id>/test page. Replicates the v2/complete pattern.
import { createAgent } from "@/lib/agents/store";
// 2026-05-17 — Seed a contact row in the AGENCY's own CRM representing
// the newly-created client SMB. SeldonFrame becomes the agency's
// business OS too — every client they create lands as a contact in
// their /contacts list. Idempotent, non-fatal.
import { seedClientContactInAgencyCrm } from "@/lib/workspace/seed-client-contact-in-agency";
// 2026-05-16 — swapped from web-fetch-extractor (Anthropic web_fetch tool
// path) to markdown-extractor (server-side fetch -> MD -> LLM). Same
// signature, same SSE events, same error codes. See markdown-extractor.ts
// header for the why.
import { extractBusinessFactsFromUrl } from "@/lib/web-onboarding/markdown-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shared SSE dispatcher used by both GET and POST entry points.
//
// Why two methods: the /clients/new client form opens an `EventSource`
// (browser-native, very small bundle), and EventSource ONLY supports GET
// — it cannot POST a JSON body. Smoke test surfaced this as a 405 when
// the form opened `?url=...` against the original POST-only route. The
// GET path reads the URL from query string. The POST path stays for
// future programmatic callers (curl, future SDKs) that prefer JSON body
// posting; both call the same runCreateFromUrl orchestrator with the same
// RunDeps.
async function dispatchCreateFromUrl(url: unknown): Promise<Response> {
  const session = await auth();

  // The session callback in lib/auth/config.ts exposes `orgId` (NOT
  // `primaryOrgId`). For this route's purposes the user's primary org IS
  // their `orgId` — a 1:1 mapping per the agency-identity-on-user-record
  // model from the spec. Map it across the wire here so the orchestrator's
  // RunDeps contract stays clean.
  const sessionUser = session?.user?.id
    ? {
        id: session.user.id,
        primaryOrgId:
          (session.user as { orgId?: string | null; primaryOrgId?: string | null }).orgId ??
          (session.user as { primaryOrgId?: string | null }).primaryOrgId ??
          null,
      }
    : null;

  const { stream, headers } = await runCreateFromUrl({
    deps: {
      enforceWorkspaceLimit: (args) =>
        enforceWorkspaceLimit({
          userId: sessionUser?.id ?? "",
          primaryOrgId: args.primaryOrgId,
          ownedWorkspaceCount: args.ownedWorkspaceCount,
        }),
      getOwnedWorkspaceCount,
      getOperatorByokAnthropicKey: async (orgId: string) => {
        const result = await getOperatorByokAnthropicKey({ orgId });
        return result.source === "byok" && result.key
          ? { key: result.key, source: "byok" as const }
          : null;
      },
      extractBusinessFactsFromUrl,
      createFullWorkspace,
      markOperatorOnboarded,
      linkWorkspaceToOperator,
      createWebsiteChatbot: async ({ workspaceId, workspaceSlug }) => {
        // Same shape v2/complete uses — status:'test' so the chatbot
        // responds on the test page immediately, name derived from slug.
        return createAgent({
          orgId: workspaceId,
          archetype: "website-chatbot",
          channel: "web_chat",
          name: `${workspaceSlug} Chatbot`,
          faq: [],
          status: "test",
        });
      },
      seedClientContactInAgencyCrm,
      workspaceBaseDomain: process.env.WORKSPACE_BASE_DOMAIN ?? "app.seldonframe.com",
    },
    body: { url },
    sessionUser,
  });

  return new Response(stream, { headers });
}

export async function GET(request: NextRequest): Promise<Response> {
  // EventSource entry point — the /clients/new form opens this from the
  // browser. The URL travels as a query param because EventSource cannot
  // POST a body.
  const url = request.nextUrl.searchParams.get("url");
  return dispatchCreateFromUrl(url);
}

export async function POST(request: Request): Promise<Response> {
  // Programmatic JSON-body entry point — for future SDKs, server-side
  // callers, or non-browser clients that prefer POST + JSON.
  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  return dispatchCreateFromUrl(body.url);
}
