"use server";

// Task 10 of the win-ladder + SeldonChat plan (Phase B, step 4). Split into
// its own "use server" file (scripts/check-use-server.sh's rule: a "use
// server" file may export ONLY async functions) mirroring share-actions.ts.
//
// enableStarterAgentAction one-click-creates a workspace event-triggered
// agent for one of the two P1 starters (review-requester / speed-to-lead),
// via the SAME agent_templates rail lib/agents/triggers/run-event-agent-deps.ts
// already reads at fire time (findEventAgents queries
// `agentTemplates.builderOrgId = orgId` directly — a template row IS the
// live agent config for a workspace's own org, no separate deployment join).
// This reuses createAgentTemplate + updateAgentTemplate (the SAME primitives
// the Studio starter-pack's instantiateStarter uses), NOT the starter-pack's
// STARTER_TEMPLATES catalog/UI — the builder-tier product is a separate
// concern from this workspace-tier one-click picker.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { agentTemplates } from "@/db/schema/agent-templates";
import { getOrgId } from "@/lib/auth/helpers";
import { createAgentTemplate, updateAgentTemplate } from "@/lib/agent-templates/store";
import type { AgentPickId } from "@/lib/activation/suggest-agents";
import type { AgentTrigger } from "@/lib/agents/triggers/agent-trigger";

const ALLOWED_PICK_IDS: ReadonlySet<AgentPickId> = new Set(["review-requester", "speed-to-lead"]);

const STARTER_CONFIG: Record<
  AgentPickId,
  { name: string; greeting: string; trigger: Extract<AgentTrigger, { kind: "event" }> }
> = {
  "review-requester": {
    name: "Review Requester",
    greeting: "Thanks again for choosing us — we'd love your feedback!",
    trigger: { kind: "event", event: "booking.completed", channel: "sms" },
  },
  "speed-to-lead": {
    name: "Speed-to-Lead Responder",
    greeting: "Thanks for reaching out — we got your message and we'll be in touch shortly!",
    trigger: { kind: "event", event: "lead.created", channel: "sms" },
  },
};

export type EnableStarterAgentResult =
  | { ok: true; alreadyEnabled: boolean }
  | { ok: false; error: string };

/**
 * One-click-create the workspace's event-triggered agent for `pickId`.
 * Idempotent: if an agent_template with this skill's event trigger already
 * exists for the org, it's a no-op success (alreadyEnabled:true) rather than
 * creating a duplicate. Does NOT stamp the hire_agent ladder event directly —
 * revalidatePath("/dashboard") below is enough: the dashboard render loop's
 * own stampLadderEvent call fires the funnel event once computeLadderState
 * actually sees extraAgentCount flip the step to done (same philosophy as the
 * T9 fix — the render loop is the single place a step's completion event
 * fires, never the action that merely causes it).
 */
export async function enableStarterAgentAction(
  pickId: string,
): Promise<EnableStarterAgentResult> {
  if (!ALLOWED_PICK_IDS.has(pickId as AgentPickId)) {
    return { ok: false, error: "unknown_pick" };
  }
  const pick = pickId as AgentPickId;

  const orgId = await getOrgId();
  if (!orgId) {
    return { ok: false, error: "no_active_workspace" };
  }

  const config = STARTER_CONFIG[pick];

  // Idempotency: does this org already have an agent_template whose trigger
  // fires on this skill's event? Load the org's templates and check in-memory
  // (mirrors findEventAgents' own resolveAgentTrigger read) rather than a
  // second bespoke query shape.
  const existingRows = await db
    .select({ blueprint: agentTemplates.blueprint })
    .from(agentTemplates)
    .where(eq(agentTemplates.builderOrgId, orgId));

  const alreadyEnabled = existingRows.some((row) => {
    const blueprint = (row.blueprint ?? {}) as { trigger?: unknown };
    const trigger = blueprint.trigger as { kind?: string; event?: string } | undefined;
    return trigger?.kind === "event" && trigger?.event === config.trigger.event;
  });

  if (!alreadyEnabled) {
    const created = await createAgentTemplate({
      builderOrgId: orgId,
      name: config.name,
      type: "chat_assistant",
    });

    const saved = await updateAgentTemplate({
      id: created.id,
      patch: {
        trigger: config.trigger,
        greeting: config.greeting,
        capabilities: ["escalate_to_human"],
      },
    });

    if (!saved.ok) {
      // createAgentTemplate's row has no trigger yet — the idempotency probe
      // above only matches trigger-bearing rows, so leaving it in place would
      // orphan a trigger-less template that a retry can never find, and the
      // NEXT click would insert a duplicate on top of it. Best-effort cleanup:
      // if this delete also fails, we still report the original error (the
      // orphan is a rare, non-money-safety-relevant leftover row, not worth
      // masking the real failure over).
      await db
        .delete(agentTemplates)
        .where(eq(agentTemplates.id, created.id))
        .catch(() => {});
      return { ok: false, error: saved.error };
    }
  }

  revalidatePath("/dashboard");

  return { ok: true, alreadyEnabled };
}
