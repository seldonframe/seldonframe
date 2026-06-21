// ICP-3 (task 1.2) — server actions for the Agent Builder's TEST panel.
//
// `testAgentTemplateTurn` runs ONE sandboxed chat turn against a template's
// agent brain so the builder can sanity-check persona + FAQ + tools BEFORE they
// deploy or sell it. It is:
//   - org-guarded — the template must belong to the operator's org (mirrors
//     saveAgentTemplateBlueprintAction's builderOrgId === orgId check).
//   - IDENTITY-NEUTRAL — a template is a REUSABLE agent the builder sells to
//     OTHER businesses; it is NOT the builder's own front office. So the test
//     turn must NOT adopt the builder's business identity. We pass
//     `soul: null` (do not leak the builder workspace's industry/services/
//     business-facts into the prompt) and a neutral `orgName: "your business"`
//     placeholder instead of the builder org's real name. Otherwise an HVAC
//     template tested from the "Seldon Studio" workspace would answer as Seldon
//     Studio (its persona line + soul-derived "About this business" / "Services"
//     / "Business facts" sections in lib/agents/prompt.ts come from orgName +
//     soul). With both neutralized, the tested agent is driven purely by the
//     template's own blueprint (customSkillMd persona + FAQ + pricingFacts +
//     quote ranges) — exactly what a deployed client would get. orgId / orgSlug
//     / timezone are still real (the read-only availability tool + temporal
//     grounding need a workspace + clock; harmless for a sandbox demo).
//   - sandboxed — runs through the SAME agent runtime building blocks the live
//     chatbot/voice agent uses (composeSystemPrompt + the tool registry, via
//     runStatelessAgentTurn) with testMode=true, so every write tool
//     (book_appointment / escalate_to_human / take_message) returns a synthetic
//     result and writes NOTHING. No real bookings, no Twilio, no deployment.
//   - NON-persisting — it does NOT create an agentConversations row or any
//     agentTurns rows (unlike executeTurn). The chat history lives only in the
//     client component for the duration of the test. Nothing is written to the
//     database by a test turn.
//
// LLM key: resolved from the builder ORG's configured key via getAIClient (BYOK
// anthropic first, then the platform fallback). The agent runtime is
// Anthropic-only, so if getAIClient yields no Anthropic client (no key, or an
// OpenAI-only BYOK key), we return { ok:false, error:"no_llm_key" } and the UI
// prompts the builder to add a key in Settings.
//
// "use server" — only async exports here (types live inline / in stateless-turn).

"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { getAIClient } from "@/lib/ai/client";
import {
  runStatelessAgentTurn,
  type StatelessChatMessage,
  type StatelessToolCall,
} from "@/lib/agents/stateless-turn";
import type { AgentBlueprint } from "@/db/schema/agents";
import { getAgentTemplate } from "./store";

// Hard cap on the messages we accept from the client — a test sandbox never
// needs a long history, and it bounds the prompt sent to Anthropic.
const MAX_TEST_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 4000;

export type TestAgentTemplateTurnResult =
  | { ok: true; reply: string; toolCalls: StatelessToolCall[] }
  | {
      ok: false;
      error: "unauthorized" | "template_not_found" | "no_llm_key" | "bad_input" | "runtime_error";
      message?: string;
    };

/**
 * Run ONE sandboxed test turn against an agent template's brain. The client
 * passes the full chat history (plain user/assistant text); we build the agent
 * context from the template's blueprint (NOT the builder's own business soul/
 * name — see the file header) plus the workspace timezone, and run a single
 * non-persisting, testMode turn. Returns the assistant reply + any tool calls
 * (so the UI can note "checked availability").
 */
export async function testAgentTemplateTurn(input: {
  templateId: string;
  messages: StatelessChatMessage[];
}): Promise<TestAgentTemplateTurnResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  // Sanitize + bound the incoming history.
  const messages = sanitizeMessages(input.messages);
  if (messages.length === 0) {
    return { ok: false, error: "bad_input", message: "No message to send." };
  }

  // Ownership guard: only the builder that owns the template may test it.
  const template = await getAgentTemplate(input.templateId);
  if (!template || template.builderOrgId !== orgId) {
    return { ok: false, error: "template_not_found" };
  }

  // Resolve the org's LLM client (BYOK anthropic → platform fallback). The
  // agent runtime is Anthropic-only; a null client means no usable key.
  const resolution = await getAIClient({ orgId });
  if (!resolution.client) {
    return { ok: false, error: "no_llm_key" };
  }

  // Load only the workspace context a TEMPLATE test legitimately needs: slug
  // (read-only availability tool) + timezone (temporal grounding). We do NOT
  // load name/soul — a template is identity-neutral (see the file header), so
  // the builder's own business identity must not flow into the prompt.
  const [org] = await db
    .select({
      slug: organizations.slug,
      timezone: organizations.timezone,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return { ok: false, error: "unauthorized" };

  const result = await runStatelessAgentTurn({
    orgId,
    orgSlug: org.slug,
    // Neutral placeholder — NOT the builder org's name. The template's own
    // customSkillMd persona is what actually drives identity; this is just the
    // {orgName} fallback in the persona line ("the receptionist for your
    // business"). See the file header for why we don't pass org.name.
    orgName: "your business",
    // Do NOT pass the builder workspace's soul — it would inject Seldon Studio's
    // industry/services/business-facts into the template test. A deployed client
    // gets ITS OWN soul; a sandbox test gets none.
    soul: null,
    timezone: org.timezone ?? "UTC",
    blueprint: (template.blueprint ?? {}) as AgentBlueprint,
    messages,
    testMode: true,
    client: resolution.client,
  });

  if (!result.ok) {
    return { ok: false, error: "runtime_error", message: result.message };
  }

  return { ok: true, reply: result.reply, toolCalls: result.toolCalls };
}

/** Drop malformed entries, trim oversized content, keep only the most recent
 *  MAX_TEST_MESSAGES. Pure-ish (no IO). */
function sanitizeMessages(
  raw: StatelessChatMessage[] | undefined,
): StatelessChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: StatelessChatMessage[] = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const content = typeof m.content === "string" ? m.content.trim() : "";
    if (!content) continue;
    cleaned.push({ role: m.role, content: content.slice(0, MAX_MESSAGE_CHARS) });
  }
  return cleaned.slice(-MAX_TEST_MESSAGES);
}

export type MarkAgentTemplateTestedResult =
  | { ok: true; status: "tested" }
  | { ok: false; error: "unauthorized" | "template_not_found" | "update_failed" };

/**
 * Manually flip a template draft→tested (org-guarded). v1 is a manual gate —
 * the builder clicks "Mark as tested" once they're satisfied with the sandbox.
 * Idempotent: a template already 'tested' (or 'published') stays as-is and
 * returns ok. Only 'draft' is promoted.
 */
export async function markAgentTemplateTestedAction(input: {
  templateId: string;
}): Promise<MarkAgentTemplateTestedResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const template = await getAgentTemplate(input.templateId);
  if (!template || template.builderOrgId !== orgId) {
    return { ok: false, error: "template_not_found" };
  }

  // Already tested/published — no-op success (don't downgrade published).
  if (template.status !== "draft") {
    revalidatePath(`/studio/agents/${input.templateId}`);
    return { ok: true, status: "tested" };
  }

  const { agentTemplates } = await import("@/db/schema/agent-templates");
  const [updated] = await db
    .update(agentTemplates)
    .set({ status: "tested", updatedAt: new Date() })
    .where(eq(agentTemplates.id, input.templateId))
    .returning({ id: agentTemplates.id });

  if (!updated) return { ok: false, error: "update_failed" };

  revalidatePath(`/studio/agents/${input.templateId}`);
  revalidatePath("/studio/agents");
  return { ok: true, status: "tested" };
}
