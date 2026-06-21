// ICP-3 — server actions for the Agent Builder (Agents Studio).
//
// Wraps the lib/agent-templates/store.ts primitives (createAgentTemplate +
// updateAgentTemplate) so the Studio UI can create + configure templates without
// leaving the dashboard. Mirrors lib/agents/actions.ts: resolve the operator's
// org from session via getOrgId(), validate the patch with a zod schema that
// lives in a plain sibling module, then delegate to the store.
//
// "use server" — only async exports here (types/consts live in schema.ts and
// store.ts). generateAgentDraftAction is the LLM call that converts a single
// English sentence of intent into a TemplateBlueprintPatch.

"use server";

import { revalidatePath } from "next/cache";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { getAIClient } from "@/lib/ai/client";
import {
  createAgentTemplate,
  getAgentTemplate,
  updateAgentTemplate,
  ALL_TEMPLATE_CAPABILITIES,
  type AgentTemplateType,
  type TemplateBlueprintPatch,
} from "./store";
import { TemplateBlueprintPatchSchema } from "./schema";
import { generateDraft } from "./generate";

export type CreateAgentTemplateResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Create a new agent template owned by the current operator's org (the
 * builder). v1 only offers voice_receptionist. Returns the new id so the Studio
 * can route the builder straight to /agents/[id] (the editor).
 */
export async function createAgentTemplateAction(input: {
  name: string;
  type?: AgentTemplateType;
}): Promise<CreateAgentTemplateResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const name = (input.name ?? "").trim();
  if (name.length < 2) return { ok: false, error: "name must be at least 2 chars" };

  try {
    const template = await createAgentTemplate({
      builderOrgId: orgId,
      name,
      // v1 ships voice_receptionist only.
      type: input.type ?? "voice_receptionist",
    });
    revalidatePath("/agents");
    return { ok: true, id: template.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "create_failed",
    };
  }
}

export type SaveTemplateBlueprintResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Save the template's blueprint (greeting / persona script / FAQ / voice /
 * tools). Validates the patch against the allow-list, verifies the template
 * belongs to the current operator's org (the ownership guard — mirrors
 * updateAgentBlueprint's `eq(agents.orgId, orgId)` check), then merge-patches.
 */
export async function saveAgentTemplateBlueprintAction(input: {
  templateId: string;
  patch: unknown;
}): Promise<SaveTemplateBlueprintResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const parsed = TemplateBlueprintPatchSchema.safeParse(input.patch);
  if (!parsed.success) {
    return { ok: false, error: `invalid_patch: ${parsed.error.message}` };
  }

  // Ownership guard: only the builder that owns the template may edit it.
  const existing = await getAgentTemplate(input.templateId);
  if (!existing || existing.builderOrgId !== orgId) {
    return { ok: false, error: "template_not_found" };
  }

  const result = await updateAgentTemplate({
    id: input.templateId,
    patch: parsed.data,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/agents/${input.templateId}`);
  revalidatePath("/agents");
  return { ok: true };
}

// ─── generateAgentDraftAction ─────────────────────────────────────────────────
//
// Converts a single English sentence of builder intent into a
// TemplateBlueprintPatch via a real Anthropic call (BYOK anthropic first,
// then platform fallback — same resolution order as testAgentTemplateTurn
// in test-actions.ts line 87). The pure LLM logic lives in generate.ts (DI'd
// so it's unit-testable without a key); this action wires the real client.

const GEN_MODEL =
  process.env.ANTHROPIC_AGENT_MODEL?.trim() || "claude-sonnet-4-5-20250929";

export type GenerateAgentDraftResult =
  | { ok: true; patch: TemplateBlueprintPatch }
  | { ok: false; error: "unauthorized" | "needs_key" | "generation_failed" };

/**
 * Generate a TemplateBlueprintPatch from a builder's English description of
 * what their agent should do. Requires a configured LLM key (BYOK or
 * platform). Returns needs_key if no usable key is available.
 */
export async function generateAgentDraftAction(input: {
  prompt: string;
  surface: "voice" | "chat";
}): Promise<GenerateAgentDraftResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  // Guard: empty prompt has no useful intent to generate from.
  const intent = (input.prompt ?? "").trim();
  if (!intent) return { ok: false, error: "generation_failed" };

  const { client } = await getAIClient({ orgId });
  if (!client) return { ok: false, error: "needs_key" };

  const result = await generateDraft(
    {
      intent,
      surface: input.surface,
      allowedCapabilities: ALL_TEMPLATE_CAPABILITIES,
    },
    {
      complete: async ({ system, user }) => {
        const resp = await client.messages.create({
          model: GEN_MODEL,
          max_tokens: 2048,
          system,
          messages: [{ role: "user", content: user }],
        });
        return resp.content
          .filter(
            (b): b is Extract<typeof b, { type: "text" }> => b.type === "text",
          )
          .map((b) => b.text)
          .join("\n");
      },
    },
  );

  return result.ok
    ? { ok: true, patch: result.patch }
    : { ok: false, error: "generation_failed" };
}
