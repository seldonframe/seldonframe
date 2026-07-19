// Email-agent slice (Part A3) — the REAL, DB/Composio/Anthropic-backed
// VoiceIngestDeps, shared by both trigger points (deploy-time auto-ingest in
// deploy-to-self-actions.ts, and the manual refreshVoiceProfileAction in
// integrations/actions.ts) so the distill prompt + Composio/Brain wiring
// lives in exactly ONE place. Mirrors the split every other lib/agents/
// triggers/*-deps.ts file uses: the orchestrator (ingest-sent-mail.ts) stays
// pure + injectable; this file is the only place that touches Composio /
// Anthropic / the Brain store.
//
// Plain lib module (NOT "use server") — safe to import from any "use server"
// action or server component.

import type { SentEmailSample, VoiceIngestDeps } from "./ingest-sent-mail";

/** ONE LLM call that distills sample sent emails into a compact markdown
 *  style profile. Never receives full bodies (the caller already truncated
 *  each sample to <=500 chars). Throws on any client/LLM failure —
 *  ingestSentMailVoiceProfile maps that to {ok:false, reason:"distill_failed"}. */
async function distillVoiceProfile(
  orgId: string,
  emails: SentEmailSample[],
): Promise<string> {
  const { getAIClient } = await import("@/lib/ai/client");
  const { client } = await getAIClient({ orgId });
  if (!client) throw new Error("no_llm_key");

  const samplesText = emails
    .slice(0, 20)
    .map((e, i) => `${i + 1}. Subject: ${e.subject}\n   ${e.snippet}`)
    .join("\n\n");

  const res = await client.messages.create({
    model: process.env.ANTHROPIC_AGENT_MODEL?.trim() || "claude-sonnet-4-5-20250929",
    max_tokens: 600,
    system:
      "You distill an operator's writing voice from sample sent emails into a compact markdown style profile for another AI to imitate when drafting emails on their behalf. " +
      "Cover: tone, typical opening, typical closing, sentence length, formatting habits, dos/don'ts. Include 2-3 example fragments, each AT MOST two sentences. " +
      "Output ONLY the markdown profile, at most 40 lines. Never quote a full email body — fragments only.",
    messages: [
      {
        role: "user",
        content: `Sample sent emails (subject + snippet):\n\n${samplesText}`,
      },
    ],
  });

  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text" || !text.text.trim()) {
    throw new Error("empty_distill_response");
  }
  return text.text.trim();
}

/** Build the production VoiceIngestDeps for an org: Composio Gmail fetch
 *  (via the SAME SDK executor generic composio tool calls use), the distill
 *  call above, and a Brain store upsert. Lazy imports keep this off the
 *  eager module graph for callers that never ingest. */
export function buildVoiceIngestDeps(orgId: string): VoiceIngestDeps {
  return {
    callTool: async (slug, args) => {
      const { defaultComposioWrapDeps } = await import(
        "@/lib/integrations/composio/connector"
      );
      const { executeTool } = await defaultComposioWrapDeps();
      return executeTool(orgId, slug, args);
    },
    distill: (emails) => distillVoiceProfile(orgId, emails),
    writeNote: async (path, body, metadata) => {
      const { writeBrainNote } = await import("@/lib/brain/store");
      await writeBrainNote({ orgId, scope: "workspace", path, body, metadata });
    },
  };
}
