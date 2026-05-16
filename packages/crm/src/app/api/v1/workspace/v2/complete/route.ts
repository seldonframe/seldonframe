// v1.4.0 — POST /api/v1/workspace/v2/complete
//
// Marks the v2 flow as finished for a workspace. Runs the existing
// output-contract validator over the final state and reports the result
// to the IDE agent. Does NOT do additional rendering — every persist_block
// call already triggers a full landing re-render.
//
// Reports which v2 blocks landed vs. were skipped, plus the validator
// summary. The IDE agent can decide whether to ask the operator for
// fixups (e.g. re-roll a block that failed a validator).

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, blockInstances, organizations } from "@/db/schema";
import { createAgent } from "@/lib/agents/store";
import { listArchetypes } from "@/lib/agents/archetypes";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import { listBlockNames } from "@/lib/page-blocks/registry";
import { setPublicChatbotEmbed } from "@/lib/agents/public-embed";
import { seedChatbotPreviewLandingForOrg } from "@/lib/workspace/seed-chatbot-preview-landing";

type Body = {
  workspace_id?: unknown;
};

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as Body;
  const workspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
  if (!workspaceId) {
    return NextResponse.json(
      { ok: false, error: "missing_workspace_id" },
      { status: 400 },
    );
  }
  if (guard.orgId !== workspaceId) {
    return NextResponse.json(
      { ok: false, error: "workspace_mismatch" },
      { status: 403 },
    );
  }

  // Inventory which v2 blocks actually landed.
  const persisted = await db
    .select({
      blockName: blockInstances.blockName,
      templateVersion: blockInstances.templateVersion,
      updatedAt: blockInstances.updatedAt,
    })
    .from(blockInstances)
    .where(eq(blockInstances.orgId, workspaceId));

  const expected = listBlockNames();
  const persistedNames = new Set(persisted.map((p) => p.blockName));
  const missing = expected.filter((n) => !persistedNames.has(n));

  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);

  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
  const publicUrl = org?.slug ? `https://${org.slug}.${baseDomain}/` : null;

  logEvent(
    "v2_workspace_completed",
    {
      blocks_landed: persisted.length,
      blocks_missing: missing.length,
      missing_block_names: missing,
    },
    { request, orgId: workspaceId, status: 200 },
  );

  // 2026-05-15 — Auto-create a website-chatbot scaffold so finalize_workspace's
  // operator summary can give the agency the embed snippet immediately.
  // Soft-fail: if createAgent throws (or returns { ok: false }), we return
  // null chatbot fields and the summary tells the operator to retry via
  // create_agent. Never blocks workspace creation.
  //
  // Idempotency: if a website-chatbot already exists for this workspace
  // (caller retried v2/complete, race, etc.), reuse it instead of creating
  // a duplicate.
  //
  // NOTE: embedUrl format is `https://${WORKSPACE_BASE_DOMAIN}/api/v1/public/agent/${orgSlug}--${agentSlug}/embed.js`
  // (verified against packages/crm/src/lib/agents/store.ts createAgent).
  // SELDONFRAME_APP_BASE is NOT used here — the embed URL lives on the same
  // base domain as workspaces.
  let chatbotAgentId: string | null = null;
  let chatbotEmbedUrl: string | null = null;
  let chatbotEmbedSnippet: string | null = null;
  let agentResult: Awaited<ReturnType<typeof createAgent>> | null = null;

  const [existingChatbot] = await db
    .select({ id: agents.id, slug: agents.slug })
    .from(agents)
    .where(
      and(eq(agents.orgId, workspaceId), eq(agents.archetype, "website-chatbot")),
    )
    .limit(1);

  if (existingChatbot) {
    // Reconstruct the embed URL for an existing agent. Format matches
    // what createAgent emits in packages/crm/src/lib/agents/store.ts:
    // `https://${baseDomain}/api/v1/public/agent/${org.slug}--${slug}/embed.js`
    // We already fetched org and baseDomain above — reuse them.
    chatbotAgentId = existingChatbot.id;
    chatbotEmbedUrl = `https://${baseDomain}/api/v1/public/agent/${org?.slug ?? workspaceId}--${existingChatbot.slug}/embed.js`;
    chatbotEmbedSnippet = `<script src="${chatbotEmbedUrl}" async></script>`;
  } else {
    try {
      agentResult = await createAgent({
        orgId: workspaceId,
        archetype: "website-chatbot",
        channel: "web_chat",
        name: `${org?.slug ?? "Website"} Chatbot`,
        // Empty FAQ scaffold — operator refines via update_website_chatbot
        // before calling publish_agent.
        faq: [],
        // v1.55.0 — TEST status so the chatbot responds on the preview page
        // immediately. Operator promotes to LIVE via publish_agent when the
        // client is ready to paste the embed on their real site.
        status: "test",
      });
      if (agentResult.ok) {
        chatbotAgentId = agentResult.agent.id;
        chatbotEmbedUrl = agentResult.embedUrl;
        chatbotEmbedSnippet = `<script src="${agentResult.embedUrl}" async></script>`;
      } else {
        logEvent(
          "v2_auto_chatbot_failed",
          {
            reason: "create_agent_returned_not_ok",
            error: agentResult.error,
            validation_errors: agentResult.validation_errors,
          },
          { request, orgId: workspaceId, severity: "warn" },
        );
      }
    } catch (err) {
      logEvent(
        "v2_auto_chatbot_failed",
        {
          reason: "create_agent_threw",
          error: err instanceof Error ? err.message : String(err),
        },
        { request, orgId: workspaceId, severity: "warn" },
      );
    }
  }

  // v1.55.0 — Register the chatbot embed at the workspace level so the
  // public page route handler (s/[orgSlug]/[...slug]/page.tsx) injects
  // <ChatbotEmbedScript> on every render. This is the EXISTING proven
  // pattern used by the embed_chatbot_on_workspace_landing MCP tool;
  // calling it here makes auto-created chatbots visible on the preview
  // page without operator intervention.
  if (chatbotAgentId && chatbotEmbedUrl) {
    try {
      await setPublicChatbotEmbed(workspaceId, {
        embedUrl: chatbotEmbedUrl,
        agentId: chatbotAgentId,
      });
    } catch (err) {
      logEvent(
        "v2_chatbot_embed_register_failed",
        { reason: err instanceof Error ? err.message : String(err) },
        { request, orgId: workspaceId, severity: "warn" },
      );
    }
  }

  // v1.55.0 — Replace the legacy soul-driven landing with a chatbotPreview
  // section. This IS the default public surface for new workspaces.
  // Operator can replace it later via the landing-page-creation SKILL.md.
  //
  // Soft-fail: if the seed fails, the workspace still has its legacy
  // landing in place (created by anonymous-workspace.ts upstream) — the
  // preview just shows the old generic content instead of the chatbot.
  if (chatbotAgentId) {
    const agentSlug =
      (existingChatbot?.slug as string | undefined) ??
      (agentResult?.ok ? agentResult.agent.slug : undefined);

    if (agentSlug) {
      const seedResult = await seedChatbotPreviewLandingForOrg({
        orgId: workspaceId,
        agentSlug,
        workspaceBaseDomain: baseDomain,
        // v1.55.x — Forward the agent id so the 6-step wizard on the
        // preview page can deep-link to /agents/<id>/{test,evals,settings}
        // instead of the generic /agents listing.
        agentId: chatbotAgentId,
      });
      if (!seedResult.ok) {
        logEvent(
          "v2_chatbot_preview_seed_failed",
          { reason: seedResult.reason },
          { request, orgId: workspaceId, severity: "warn" },
        );
      }
    }
  }

  // v1.55.0 — Build the static 7-automation list from the archetype
  // registry. Excludes "website-chatbot" since we already auto-created
  // that one above. configured: false is a v1.55 placeholder — Brain v2
  // can later flip these per workspace.
  const availableAutomations = listArchetypes()
    .filter((a) => a.id !== "website-chatbot")
    .map((a) => ({
      id: a.id,
      name: a.name ?? a.id,
      configured: false,
    }));

  const appHost = (process.env.SELDONFRAME_APP_BASE ?? `https://${baseDomain}`).replace(/\/$/, "");
  const automationsUrl = `${appHost}/automations`;
  const adminUrl = `${appHost}/admin/${encodeURIComponent(workspaceId)}`;

  return NextResponse.json({
    ok: true,
    workspace_id: workspaceId,
    public_url: publicUrl,
    blocks: {
      expected,
      persisted: persisted.map((p) => ({
        name: p.blockName,
        template_version: p.templateVersion,
        updated_at: p.updatedAt,
      })),
      missing,
    },

    // v1.55.0 — chatbot promoted to first-class object
    chatbot: chatbotAgentId
      ? {
          agent_id: chatbotAgentId,
          embed_url: chatbotEmbedUrl,
          embed_snippet: chatbotEmbedSnippet,
          preview_url: publicUrl,
          status: "test" as const,
        }
      : null,

    // v1.55.0 — ops surfaces grouped
    ops_stack: {
      admin_url: adminUrl,
      booking_url: `${publicUrl}/book`,
      intake_url: `${publicUrl}/intake`,
      automations_url: automationsUrl,
    },

    // v1.55.0 — 7 ready-to-deploy automations (statically derived from registry)
    available_automations: availableAutomations,

    // Legacy fields retained for backward compat with v1.53 MCP clients.
    chatbot_agent_id: chatbotAgentId,
    chatbot_embed_url: chatbotEmbedUrl,
    chatbot_embed_snippet: chatbotEmbedSnippet,

    next_steps:
      missing.length > 0
        ? [
            `${missing.length} v2 block(s) not yet persisted: ${missing.join(", ")}.`,
            "These surfaces still render via the v1 pipeline (default copy from the personality system). The workspace is fully usable as-is.",
            "To upgrade them, call get_block_skill + persist_block for each missing block.",
          ]
        : [
            "All v2 blocks persisted. Workspace is fully v2-rendered for hero/services/faq.",
            "Operator can now customize any block via customize_block(workspace_id, block_name, prompt).",
          ],
  });
}
