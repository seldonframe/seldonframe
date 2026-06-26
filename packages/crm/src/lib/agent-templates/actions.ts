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
  capabilitiesForSurface,
  type AgentSurface,
  type AgentTemplateType,
  type TemplateBlueprintPatch,
} from "./store";
import { TemplateBlueprintPatchSchema } from "./schema";
import {
  resolveAgentTrigger,
  type AgentTrigger,
} from "@/lib/agents/triggers/agent-trigger";
import { generateDraft } from "./generate";
import {
  instantiateStarter,
  buildDefaultInstantiateDeps,
} from "./starter-pack";
import { resolveStudioBuildGate, NEEDS_BYOK_MESSAGE } from "./studio-build-gate";

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

export type CreateTemplateFromStarterResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * One-click fork a curated STARTER_TEMPLATES seed into a builder-OWNED
 * agent_template: create a template of the starter's type, then apply its seed
 * blueprint via the same blueprint-save path the editor uses. The Studio routes
 * the builder straight to /studio/agents/[id] to edit → test → deploy → resell.
 *
 * Thin auth shell: assertWritable + the org guard, then delegate to the pure,
 * DI'd instantiateStarter (unit-tested in instantiate-starter.spec.ts) wired to
 * the real createAgentTemplate + updateAgentTemplate. Additive reuse — no new
 * write path, no migration.
 */
export async function createTemplateFromStarterAction(input: {
  starterId: string;
}): Promise<CreateTemplateFromStarterResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const result = await instantiateStarter(
    { builderOrgId: orgId, starterId: input.starterId },
    buildDefaultInstantiateDeps(),
  );

  if (result.ok) {
    revalidatePath("/studio/agents");
    revalidatePath("/agents");
  }
  return result;
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

  // Normalize the (deliberately loose) zod `trigger` into a strict, valid
  // AgentTrigger before persisting: resolveAgentTrigger clamps any malformed
  // shape (wrong channel-for-kind, blank event/cron) to the safe inbound
  // default, so the blueprint never stores a trigger the runtime can't honor.
  // When `trigger` is absent we leave the patch untouched (partial save).
  //
  // `verify` / `guardrails` (agent-loop L2/L3) are also intentionally LOOSE in the
  // zod schema (passthrough checks; every field optional) — the runtime engines
  // (verifyOutput / evaluateGuardrails) are fully defensive about shape — so they
  // cross into the strict blueprint types via a cast, exactly like `trigger`. A
  // `null` is preserved (not cast away): it's the editor's "clear this override"
  // signal that mergeTemplateBlueprint deletes so the per-skill default reapplies.
  const { trigger, verify, guardrails, ...rest } = parsed.data;
  const patch: TemplateBlueprintPatch = { ...rest };
  if (trigger !== undefined) {
    // The zod `trigger` is intentionally loose (channel: string); the resolver
    // strictly re-parses an unknown shape into a valid union.
    patch.trigger = resolveAgentTrigger(trigger as Partial<AgentTrigger>);
  }
  if (verify !== undefined) {
    patch.verify = verify as TemplateBlueprintPatch["verify"];
  }
  if (guardrails !== undefined) {
    patch.guardrails = guardrails as TemplateBlueprintPatch["guardrails"];
  }

  const result = await updateAgentTemplate({
    id: input.templateId,
    patch,
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
// TemplateBlueprintPatch via a real Anthropic call. This is the unbounded-COGS
// Studio BUILD work, so it is gated on the operator having their OWN key
// (mode === "byok") — NOT merely on a usable client existing. An operator who
// skipped BYOK at signup is on the platform key (mode "included"/"metered"),
// which powers the free first workspace + its embedded chatbot but is NOT
// burned on arbitrary agent building; they get a friendly "Add your key →"
// prompt instead. See studio-build-gate.ts for the rule + rationale.

const GEN_MODEL =
  process.env.ANTHROPIC_AGENT_MODEL?.trim() || "claude-sonnet-4-5-20250929";

export type GenerateAgentDraftResult =
  | { ok: true; patch: TemplateBlueprintPatch }
  | {
      ok: false;
      error: "unauthorized" | "needs_byok" | "generation_failed";
      message?: string;
    };

/**
 * Generate a TemplateBlueprintPatch from a builder's English description of
 * what their agent should do. Requires the operator's OWN Anthropic key
 * (BYOK). Returns needs_byok (with a friendly message) when the org is on
 * the platform allowance instead — the first workspace stays free, but
 * building agents to resell needs a key.
 */
export async function generateAgentDraftAction(input: {
  prompt: string;
  // Canonical surface union (voice | chat | sms | email). The Studio UI sends
  // voice | chat today; the generator treats any non-voice surface as text.
  surface: AgentSurface;
}): Promise<GenerateAgentDraftResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  // Guard: empty prompt has no useful intent to generate from.
  const intent = (input.prompt ?? "").trim();
  if (!intent) return { ok: false, error: "generation_failed" };

  // BYOK gate: only the operator's own key may drive Studio agent building.
  // (getAIClient still returns a platform client on the included/metered
  // allowance — that's reserved for the first-workspace magic, not this.)
  const { client, mode } = await getAIClient({ orgId });
  const gate = resolveStudioBuildGate(mode);
  if (!gate.ok || !client) {
    return { ok: false, error: "needs_byok", message: NEEDS_BYOK_MESSAGE };
  }

  const result = await generateDraft(
    {
      intent,
      surface: input.surface,
      // Surface-scoped allow-list so a voice agent is never offered chat-only
      // tools (provide_faq_answer) and a chat agent never gets voice-only ones
      // (get_quote_range). Was ALL_TEMPLATE_CAPABILITIES (the voice+chat union).
      allowedCapabilities: capabilitiesForSurface(input.surface),
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
