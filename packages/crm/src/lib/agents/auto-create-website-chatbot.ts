// 2026-05-22 — shared helper used by the THREE workspace auto-creators
// (workspace v2/complete, create-from-url, create-from-paste) to provision
// the default website-chatbot agent + register its public embed URL.
//
// BUG fix companion to lib/agents/public-turn-status.ts. Before this
// helper, each route inlined the same createAgent + setPublicChatbotEmbed
// dance, and all three passed `status: "test"`. That status made the
// runtime tool stubs no-op (see tools.ts:120 and 291), so every booking
// the public visitor submitted on /w/[slug] was silently dropped.
//
// This helper pins `status: "live"` for the auto-created chatbot. Empty
// FAQ is expected — the eval gate at lib/agents/store.ts:285-303 only
// runs in publishAgent's draft|test|paused → live transitions, NOT
// createAgent, so the up-front "live" status is a clean path that does
// NOT need a `force: true` bypass.
//
// Dependency-injected (createAgent + setPublicChatbotEmbed) so the unit
// test in tests/unit/auto-create-website-chatbot.spec.ts can verify the
// behavior without touching the DB.

import type {
  CreateAgentInput,
  CreateAgentResult,
} from "./store";

export interface AutoCreateChatbotDeps {
  createAgent: (input: CreateAgentInput) => Promise<CreateAgentResult>;
  setPublicChatbotEmbed: (
    orgId: string,
    args: { embedUrl: string; agentId: string },
  ) => Promise<void>;
}

export interface AutoCreateChatbotInput {
  workspaceId: string;
  workspaceSlug: string;
  deps: AutoCreateChatbotDeps;
}

export type AutoCreateChatbotResult =
  | {
      ok: true;
      agentId: string;
      embedUrl: string;
      /** Best-effort embed publish — `true` when the agent was created
       *  but `setPublicChatbotEmbed` threw. The chatbot exists; the
       *  operator can re-run `embed_chatbot_on_workspace_landing`
       *  manually to publish. */
      embedPublishFailed?: boolean;
    }
  | {
      ok: false;
      error: string;
      validationErrors?: string[];
    };

/**
 * Auto-create the website-chatbot agent for a freshly-provisioned
 * workspace and (best-effort) register its embed URL on the
 * organization so the public R landing renders the chat bubble.
 *
 * Returns `{ ok: false }` if the underlying `createAgent` call fails.
 * Returns `{ ok: true, embedPublishFailed: true }` if the agent was
 * created but `setPublicChatbotEmbed` threw — callers can log + ignore.
 */
export async function autoCreateWebsiteChatbot(
  input: AutoCreateChatbotInput,
): Promise<AutoCreateChatbotResult> {
  const { workspaceId, workspaceSlug, deps } = input;

  const result = await deps.createAgent({
    orgId: workspaceId,
    archetype: "website-chatbot",
    channel: "web_chat",
    name: `${workspaceSlug} Chatbot`,
    // Empty FAQ scaffold — operator refines via update_website_chatbot.
    faq: [],
    // 2026-05-22 BUG FIX: was "test" — caused public turn route to write
    // `agent_conversations.status = "test"` which short-circuited the
    // booking + escalation tools (see lib/agents/tools.ts:120 and 291).
    // "live" makes the runtime treat real conversations as real. The
    // operator-sandbox testMode path is now gated on an explicit header
    // (see lib/agents/public-turn-status.ts).
    status: "live",
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      validationErrors: result.validation_errors,
    };
  }

  // Best-effort embed publish. The agent exists either way; embed
  // publishing failure just means the bubble doesn't show on /w/[slug]
  // until manually re-run.
  let embedPublishFailed = false;
  if (result.embedUrl) {
    try {
      await deps.setPublicChatbotEmbed(workspaceId, {
        embedUrl: result.embedUrl,
        agentId: result.agent.id,
      });
    } catch {
      embedPublishFailed = true;
    }
  }

  return {
    ok: true,
    agentId: result.agent.id,
    embedUrl: result.embedUrl,
    embedPublishFailed: embedPublishFailed || undefined,
  };
}
