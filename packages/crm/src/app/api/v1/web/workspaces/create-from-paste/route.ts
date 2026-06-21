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
// 2026-05-22 — auto-publish chatbot embed URL to organizations.settings.chatbot
// so the public R landing renders the chatbot bubble without operator
// intervention. Same pattern as v2/complete + create-from-url.
import { setPublicChatbotEmbed } from "@/lib/agents/public-embed";
// 2026-05-22 — shared helper used by all three auto-creator routes;
// pins status="live" on the auto-created chatbot. See the helper file
// header for the bug story.
import { autoCreateWebsiteChatbot } from "@/lib/agents/auto-create-website-chatbot";
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
async function dispatchCreateFromPaste(text: unknown, landingTemplate?: unknown, themeMode?: unknown): Promise<Response> {
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
      // 2026-06-18 — MANAGED AI (BYOK gate removed). Operator BYOK if
      // present, else the platform-managed key. Null only when neither
      // exists → orchestrator surfaces a non-BYOK error.
      resolveExtractionKey: async (orgId: string | null) => {
        if (orgId) {
          const result = await getOperatorByokAnthropicKey({ orgId });
          if (result.source === "byok" && result.key) {
            return { key: result.key };
          }
        }
        const platformKey = process.env.ANTHROPIC_API_KEY?.trim();
        return platformKey ? { key: platformKey } : null;
      },
      extractBusinessFactsFromPaste,
      createFullWorkspace,
      markOperatorOnboarded,
      linkWorkspaceToOperator,
      createWebsiteChatbot: async ({ workspaceId, workspaceSlug }) => {
        // 2026-05-22 — delegated to the shared autoCreateWebsiteChatbot
        // helper. Pins status="live" so the public turn route doesn't
        // short-circuit booking + escalation tools for real customers.
        // See lib/agents/auto-create-website-chatbot.ts for the bug
        // story.
        const result = await autoCreateWebsiteChatbot({
          workspaceId,
          workspaceSlug,
          deps: { createAgent, setPublicChatbotEmbed },
        });
        if (result.ok && result.embedPublishFailed) {
          console.warn(
            JSON.stringify({
              event: "auto_chatbot_embed_publish_failed",
              workspace_id: workspaceId,
            }),
          );
        }
        return result;
      },
      seedClientContactInAgencyCrm,
      seedDefaultOutboundTriggers,
      workspaceBaseDomain: process.env.WORKSPACE_BASE_DOMAIN ?? "app.seldonframe.com",
    },
    body: {
      text,
      landingTemplate: typeof landingTemplate === "string" ? landingTemplate : undefined,
      themeMode: typeof themeMode === "string" ? themeMode : undefined,
    },
    sessionUser,
  });

  return new Response(stream, { headers });
}

export async function GET(request: NextRequest): Promise<Response> {
  // EventSource entry point — the /clients/new form opens this from the
  // browser. The pasted text travels as a query param because EventSource
  // cannot POST a body.
  const text = request.nextUrl.searchParams.get("text");
  const template = request.nextUrl.searchParams.get("template");
  // Operator's pre-build light/dark mode pick ("light" | "dark"; omitted /
  // "auto" → resolveThemeMode picks by archetype default).
  const mode = request.nextUrl.searchParams.get("mode") ?? undefined;
  return dispatchCreateFromPaste(text, template, mode);
}

export async function POST(request: Request): Promise<Response> {
  // Programmatic JSON-body entry point.
  const body = (await request.json().catch(() => ({}))) as { text?: unknown; template?: unknown; mode?: unknown };
  return dispatchCreateFromPaste(body.text, body.template, body.mode);
}
