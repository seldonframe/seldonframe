// v1.40.7 — workspace-level chatbot embed URL.
//
// When an operator publishes a website-chatbot agent and asks to add it
// to their landing page, we store the agent's embed.js URL on the
// organization. The public page layout (/s/ + /l/ routes) reads it and
// injects `<script src=… async></script>` near </body>, so the chat
// bubble appears on every page of the workspace's public surface
// without any per-section editing.
//
// Storage location: `organizations.settings.chatbot.embedUrl` +
// `organizations.settings.chatbot.agentId`. Settings is already a
// flexible JSONB column with no typed schema; we accept that and
// validate at the read boundary. agentId is stored alongside so a
// future "remove chatbot" UX knows which agent the workspace was
// pointing at.
//
// One workspace = one chatbot embed at a time. Setting it again
// overwrites. Removing it clears both fields. The bubble's
// position/styling is owned by the embed.js script itself; we just
// load it.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema/organizations";

interface ChatbotEmbedRecord {
  embedUrl: string;
  agentId: string;
}

function readChatbotRecord(
  settings: Record<string, unknown> | null | undefined,
): ChatbotEmbedRecord | null {
  if (!settings || typeof settings !== "object") return null;
  const chatbot = (settings as Record<string, unknown>).chatbot;
  if (!chatbot || typeof chatbot !== "object") return null;
  const record = chatbot as Record<string, unknown>;
  const embedUrl = typeof record.embedUrl === "string" ? record.embedUrl.trim() : "";
  const agentId = typeof record.agentId === "string" ? record.agentId.trim() : "";
  if (!embedUrl || !agentId) return null;
  // Defense-in-depth: only allow https URLs to avoid storing a malformed
  // / spoofed value that injects arbitrary script. The MCP tool only
  // ever writes URLs derived from `process.env.WORKSPACE_BASE_DOMAIN`,
  // so this is belt + suspenders.
  if (!/^https:\/\//i.test(embedUrl)) return null;
  return { embedUrl, agentId };
}

/**
 * Read the workspace's published chatbot embed URL. Used by the public
 * page layout to decide whether to inject the script tag. Returns null
 * when no chatbot is configured (the page renders normally without a
 * bubble). Never throws — DB errors degrade to "no chatbot" so a
 * transient query failure doesn't break public page rendering.
 */
export async function getPublicChatbotEmbed(
  orgId: string,
): Promise<ChatbotEmbedRecord | null> {
  let row: { settings: Record<string, unknown> | null } | undefined;
  try {
    [row] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
  } catch {
    return null;
  }
  return readChatbotRecord(row?.settings ?? null);
}

/**
 * Persist the chatbot embed URL for a workspace. Called by the
 * `embed_chatbot_on_workspace_landing` MCP tool after the operator
 * asks to add the chatbot to their page. Merges into the existing
 * settings JSONB so other settings keys are preserved.
 */
export async function setPublicChatbotEmbed(
  orgId: string,
  record: ChatbotEmbedRecord,
): Promise<void> {
  const [current] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const currentSettings: Record<string, unknown> =
    (current?.settings as Record<string, unknown>) ?? {};
  const next: Record<string, unknown> = {
    ...currentSettings,
    chatbot: record,
  };
  await db
    .update(organizations)
    .set({ settings: next })
    .where(eq(organizations.id, orgId));
}

/** Remove the chatbot embed for a workspace (no-op if not set). */
export async function clearPublicChatbotEmbed(orgId: string): Promise<void> {
  const [current] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!current?.settings || typeof current.settings !== "object") return;
  const next = { ...(current.settings as Record<string, unknown>) };
  delete next.chatbot;
  await db
    .update(organizations)
    .set({ settings: next })
    .where(eq(organizations.id, orgId));
}
