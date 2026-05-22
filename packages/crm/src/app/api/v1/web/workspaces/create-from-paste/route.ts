// packages/crm/src/app/api/v1/web/workspaces/create-from-paste/route.ts
//
// Phase Q — SSE route for the "no website" paste-based workspace creation.
//
// Mirrors create-from-url/route.ts exactly. Differences:
//   - Uses runCreateFromPaste orchestrator + RunPasteDeps
//   - GET reads "text" query param (not "url")
//   - POST reads body.text (not body.url)
//   - extractBusinessFactsFromPaste (paste-extractor.ts) instead of
//     extractBusinessFactsFromUrl (markdown-extractor.ts)

import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { runCreateFromPaste } from "@/lib/web-onboarding/run-create-from-paste";
import { enforceWorkspaceLimit } from "@/lib/billing/limits";
import { createFullWorkspace } from "@/lib/workspace/create-full";
import { getOwnedWorkspaceCount } from "@/lib/web-onboarding/owned-workspace-count";
import { getOperatorByokAnthropicKey } from "@/lib/web-onboarding/byok-resolver";
import { markOperatorOnboarded } from "@/lib/web-onboarding/mark-operator-onboarded";
import { linkWorkspaceToOperator } from "@/lib/workspace/link-workspace-to-operator";
import { createAgent } from "@/lib/agents/store";
import { seedClientContactInAgencyCrm } from "@/lib/workspace/seed-client-contact-in-agency";
import { seedDefaultOutboundTriggers } from "@/lib/messaging/seed-default-triggers";
import { extractBusinessFactsFromPaste } from "@/lib/web-onboarding/paste-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shared SSE dispatcher used by both GET and POST entry points.
//
// GET: EventSource-compatible (browser EventSource only supports GET).
//      Reads "text" as a query param.
// POST: Programmatic callers — reads body.text as JSON.
async function dispatchCreateFromPaste(text: unknown): Promise<Response> {
  const session = await auth();

  const sessionUser = session?.user?.id
    ? {
        id: session.user.id,
        primaryOrgId:
          (session.user as { orgId?: string | null; primaryOrgId?: string | null }).orgId ??
          (session.user as { primaryOrgId?: string | null }).primaryOrgId ??
          null,
      }
    : null;

  const { stream, headers } = await runCreateFromPaste({
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
      extractBusinessFactsFromPaste,
      createFullWorkspace,
      markOperatorOnboarded,
      linkWorkspaceToOperator,
      createWebsiteChatbot: async ({ workspaceId, workspaceSlug }) => {
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
      seedDefaultOutboundTriggers,
      workspaceBaseDomain: process.env.WORKSPACE_BASE_DOMAIN ?? "app.seldonframe.com",
    },
    body: { text },
    sessionUser,
  });

  return new Response(stream, { headers });
}

export async function GET(request: NextRequest): Promise<Response> {
  // EventSource entry point — the /clients/new form opens this from the
  // browser. The pasted text travels as a query param because EventSource
  // cannot POST a body.
  const text = request.nextUrl.searchParams.get("text");
  return dispatchCreateFromPaste(text);
}

export async function POST(request: Request): Promise<Response> {
  // Programmatic JSON-body entry point.
  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  return dispatchCreateFromPaste(body.text);
}
