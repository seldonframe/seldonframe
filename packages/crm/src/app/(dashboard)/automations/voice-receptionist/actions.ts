// Stage C2 — server actions for the /automations/voice-receptionist editor.
//
// These mirror the website-chatbot editor's actions (lib/agents/actions.ts:
// saveAgentBlueprintAction + setAgentStatusAction) but for the per-workspace
// voice agent (an `agents` row, archetype 'voice-receptionist'). They reuse the
// SAME canonical primitives — updateAgentBlueprint + publishAgent from
// lib/agents/store.ts — so every save patches agents.blueprint, bumps
// currentVersion, AND writes an agent_versions row (audit/rollback), identical
// to how update_website_chatbot does it. The ONLY differences vs the chatbot
// action:
//   1. the blueprint schema includes `voice` (the TTS voice id) — the chatbot
//      action's schema is .strict() and rejects it.
//   2. a separate action assigns the workspace voice number, which lives at
//      organizations.integrations.twilio.fromNumber (NOT on the blueprint) —
//      patched with the same preserve-other-twilio-fields discipline as
//      lib/integrations/actions.ts updateIntegration.
//
// Auth: getOrgId() — workspace-scoped, same as every dashboard server action.

"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { organizations, type AgentBlueprint, type OrganizationIntegrations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { normalizeVoiceNumber, VOICE_OPTIONS } from "@/lib/agents/voice/card-status";
import { publishAgent, updateAgentBlueprint, type PublishAgentResult } from "@/lib/agents/store";

const FaqRow = z.object({
  q: z.string().min(1),
  a: z.string().min(1),
  // v1.45 (faq-from-url) provenance fields — optional, preserved on round-trip.
  source: z.enum(["extracted", "synthesized", "operator"]).optional(),
  sourceUrl: z.string().url().optional(),
  synthesizedAt: z.string().optional(),
  synthesizedFromSoulVersion: z.number().optional(),
});

const VoiceBlueprintPatchSchema = z
  .object({
    greeting: z.string().max(2000).optional(),
    voice: z.enum(VOICE_OPTIONS).optional(),
    capabilities: z.array(z.string()).optional(),
    faq: z.array(FaqRow).optional(),
  })
  .strict();

export type SaveVoiceBlueprintResult =
  | { ok: true; version: number }
  | { ok: false; error: string };

/**
 * Save the voice agent's greeting / TTS voice / FAQ / tool toggles. Mirrors
 * saveAgentBlueprintAction: validates, then delegates to updateAgentBlueprint
 * (patch blueprint + bump version + write agent_versions row).
 */
export async function saveVoiceBlueprintAction(input: {
  agentId: string;
  patch: Partial<AgentBlueprint>;
  publishNotes?: string;
}): Promise<SaveVoiceBlueprintResult> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const parsed = VoiceBlueprintPatchSchema.safeParse(input.patch);
  if (!parsed.success) {
    return { ok: false, error: `invalid_patch: ${parsed.error.message}` };
  }

  const result = await updateAgentBlueprint({
    agentId: input.agentId,
    orgId,
    patch: parsed.data,
    publishNotes: input.publishNotes,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  revalidatePath("/automations/voice-receptionist");
  revalidatePath("/automations");
  return { ok: true, version: result.version };
}

export type SetVoiceStatusResult = PublishAgentResult;

/**
 * Flip the voice agent Live ⇄ Paused. Mirrors setAgentStatusAction → wraps
 * publishAgent (which emits agent.status_changed). Voice agents have no eval
 * suite yet, so promotions to "live" pass `force:true` to skip the chatbot
 * eval gate (the gate runs the website-chatbot scenario set, irrelevant here).
 */
export async function setVoiceStatusAction(input: {
  agentId: string;
  status: "live" | "paused" | "draft";
}): Promise<SetVoiceStatusResult> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const result = await publishAgent({
    agentId: input.agentId,
    orgId,
    status: input.status,
    // Voice receptionist has no eval scenarios; the eval gate is a
    // website-chatbot concept. Force the transition so Live/Pause is a
    // direct operator control here.
    force: true,
  });
  revalidatePath("/automations/voice-receptionist");
  revalidatePath("/automations");
  return result;
}

const NumberSchema = z.object({
  // Accept loose operator input (spaces, dashes, parens); normalize to E.164.
  fromNumber: z.string().trim().max(40),
});

export type AssignVoiceNumberResult =
  | { ok: true; fromNumber: string }
  | { ok: false; error: string };

/**
 * Assign (or clear) the workspace voice number at
 * organizations.integrations.twilio.fromNumber. The dialed-number resolver
 * (resolveWorkspaceByPhoneNumber) matches inbound calls against this exact
 * field, so setting it is what makes calls route to THIS workspace's agent.
 *
 * Preserves every other twilio sub-field (accountSid / authToken / connected /
 * test) — same merge discipline as lib/integrations/actions.ts updateIntegration
 * so assigning a number never clobbers stored SMS credentials. An empty input
 * clears the number (un-routes the workspace).
 */
export async function assignVoiceNumberAction(input: {
  fromNumber: string;
}): Promise<AssignVoiceNumberResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const parsed = NumberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `invalid_number: ${parsed.error.message}` };
  }

  // Normalize to E.164 (the form the resolver compares against). Empty → clear.
  const norm = normalizeVoiceNumber(parsed.data.fromNumber);
  if (!norm.ok) {
    return { ok: false, error: `invalid_number: ${norm.error}` };
  }
  const normalized = norm.value;

  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return { ok: false, error: "org_not_found" };

  const integrations = ((org.integrations ?? {}) as OrganizationIntegrations) ?? {};
  const existingTwilio = integrations.twilio ?? {
    accountSid: "",
    authToken: "",
    fromNumber: "",
    connected: false,
  };

  const nextIntegrations: OrganizationIntegrations = {
    ...integrations,
    twilio: {
      ...existingTwilio,
      fromNumber: normalized,
    },
  };

  await db
    .update(organizations)
    .set({ integrations: nextIntegrations, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));

  revalidatePath("/automations/voice-receptionist");
  revalidatePath("/automations");
  return { ok: true, fromNumber: normalized };
}
