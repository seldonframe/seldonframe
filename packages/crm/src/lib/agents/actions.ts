// v1.27.0 — server actions for the in-app agent dashboard.
//
// These wrap the same primitives the MCP tools call (updateAgentBlueprint,
// publishAgent, runEvalSuite) so SF clients can edit without leaving the
// dashboard. Auth: getOrgId() — workspace-scoped.

"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  agentConversations,
  agents,
  type AgentBlueprint,
} from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import {
  publishAgent,
  updateAgentBlueprint,
  type PublishAgentResult,
} from "./store";
import { runEvalSuite, type EvalRunSummary } from "./eval-runner";
import { connectorBindingsSchema } from "./mcp/connectors";

const FaqRow = z.object({
  q: z.string().min(1),
  a: z.string().min(1),
  // v1.45 (faq-from-url) — provenance fields, all optional for
  // backward compatibility with operator-only FAQ payloads.
  source: z.enum(["extracted", "synthesized", "operator"]).optional(),
  sourceUrl: z.string().url().optional(),
  synthesizedAt: z.string().optional(),
  synthesizedFromSoulVersion: z.number().optional(),
});
const PricingFactRow = z.object({
  label: z.string().min(1),
  amount: z.number().nonnegative(),
  currency: z.string().min(1).max(8),
});

const BlueprintPatchSchema = z
  .object({
    greeting: z.string().max(2000).optional(),
    capabilities: z.array(z.string()).optional(),
    faq: z.array(FaqRow).optional(),
    pricingFacts: z.array(PricingFactRow).optional(),
    toneOverrides: z
      .object({
        warmth: z.number().min(0).max(1).optional(),
        formality: z.number().min(0).max(1).optional(),
      })
      .optional(),
    // 2026-05-17 — operator-supplied SKILL.md override. Capped at 8k
    // chars (~2k tokens) so a runaway operator can't blow up the
    // system prompt. Empty string clears the override.
    customSkillMd: z.string().max(8000).optional(),
    // 2026-06-22 — MCP connector bindings (external tools). The schema
    // (defined in the pure mcp/connectors.ts module so it stays importable
    // here without a "use server" export violation) validates kind /
    // serviceName / enabledTools, requires HTTPS for BYO endpoints, and
    // bounds the array + per-binding tool counts.
    connectors: connectorBindingsSchema.optional(),
  })
  .strict();

export type SaveBlueprintResult =
  | { ok: true; version: number }
  | { ok: false; error: string };

export async function saveAgentBlueprintAction(input: {
  agentId: string;
  patch: Partial<AgentBlueprint>;
  publishNotes?: string;
}): Promise<SaveBlueprintResult> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const parsed = BlueprintPatchSchema.safeParse(input.patch);
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
  revalidatePath(`/agents/${input.agentId}`, "layout");
  return { ok: true, version: result.version };
}

// ─── publish ────────────────────────────────────────────────────────────

export type PublishStatusResult = PublishAgentResult;

export async function setAgentStatusAction(input: {
  agentId: string;
  status: "draft" | "test" | "live" | "paused";
  force?: boolean;
}): Promise<PublishStatusResult> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const result = await publishAgent({
    agentId: input.agentId,
    orgId,
    status: input.status,
    force: input.force,
  });
  revalidatePath(`/agents/${input.agentId}`, "layout");
  revalidatePath(`/agents`);
  return result;
}

// ─── run evals ──────────────────────────────────────────────────────────

export type RunEvalsResult =
  | { ok: true; summary: EvalRunSummary }
  | { ok: false; error: string };

export async function runEvalsAction(input: {
  agentId: string;
}): Promise<RunEvalsResult> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const result = await runEvalSuite({ agentId: input.agentId, orgId });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/agents/${input.agentId}/evals`);
  return { ok: true, summary: result.summary };
}

// ─── conversation quality marking ───────────────────────────────────────

const QualityMarkSchema = z.object({
  conversationId: z.string().uuid(),
  quality: z.enum(["good", "bad"]).nullable(),
  notes: z.string().max(2000).optional(),
});

export async function markConversationQualityAction(input: {
  conversationId: string;
  quality: "good" | "bad" | null;
  notes?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const parsed = QualityMarkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `invalid_input: ${parsed.error.message}` };
  }

  const [conv] = await db
    .select({
      id: agentConversations.id,
      orgId: agentConversations.orgId,
      agentId: agentConversations.agentId,
    })
    .from(agentConversations)
    .where(
      and(
        eq(agentConversations.id, parsed.data.conversationId),
        eq(agentConversations.orgId, orgId),
      ),
    )
    .limit(1);
  if (!conv) return { ok: false, error: "conversation_not_found" };

  await db
    .update(agentConversations)
    .set({
      operatorQuality: parsed.data.quality,
      operatorNotes: parsed.data.notes ?? null,
    })
    .where(eq(agentConversations.id, parsed.data.conversationId));

  revalidatePath(`/agents/${conv.agentId}/conversations`);
  return { ok: true };
}

// keep an unused import alive when there are no usages elsewhere
const _touchAgents = agents;
void _touchAgents;
