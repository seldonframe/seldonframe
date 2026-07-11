// Agent lifecycle slice — Stage 04 "Run": the "Run it once — watch every
// action" server surface.
//
// THIN wiring over the tested, pure `runSupervised` orchestration
// (lib/agents/lifecycle/supervised-run.ts) — mirrors eval-actions.ts's own
// header exactly: guards (org ownership + the Studio BYOK gate), resolves
// the template's real blueprint + the workspace's real Anthropic client,
// wires `runTurn` to `runStatelessAgentTurn` (the SAME template-execution
// seam the eval runner's stateless adapter uses — see stateless-turn.ts),
// and persists the durable `supervised_runs` row.
//
// testMode stays `true` here — NOT a downgrade from "real tools bound":
// the template's actual recorded-workflow actions run through bound
// Composio connector tools (lib/integrations/composio/connector.ts),
// which execute for real regardless of ctx.testMode (they aren't gated by
// it at all — only SF's OWN native write tools, book_appointment /
// escalate_to_human / take_message, are). testMode:true keeps those native
// SF write tools sandboxed (a from-recording template rarely has them —
// compile-agent's filterCapabilitiesForModel strips booking capabilities
// down to escalate_to_human plus whatever the recording itself implies) so
// "Run it once" can never silently book a real appointment or send a real
// escalation as a side effect of watching the recording's REAL actions run.

"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agentTemplates, organizations } from "@/db/schema";
import type { AgentBlueprint } from "@/db/schema/agents";
import { supervisedRuns, type SupervisedRun, type SupervisedRunActionEvent } from "@/db/schema/agent-lifecycle";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { getAIClient } from "@/lib/ai/client";
import { resolveStudioBuildGate, NEEDS_BYOK_MESSAGE } from "./studio-build-gate";
import { runStatelessAgentTurn, type StatelessToolEvent } from "@/lib/agents/stateless-turn";
import {
  runSupervised,
  buildKickoffMessage,
  resolveRunningRunGuard,
  type SupervisedRunDeps,
} from "@/lib/agents/lifecycle/supervised-run";
import { resolveAgentTrigger } from "@/lib/agents/triggers/agent-trigger";

export type StartSupervisedRunResult =
  | { ok: true; runId: string; status: "succeeded" | "failed"; summary: string }
  | {
      ok: false;
      error: "unauthorized" | "template_not_found" | "no_llm_key" | "already_running";
      message?: string;
    };

/** Maps a stateless-turn tool event (phase:start/result, ok?) onto the
 *  persisted `SupervisedRunActionEvent` shape (a single "running"/"ok"/
 *  "error" status) — the two live in different modules (a generic runtime
 *  concern vs. this slice's persisted row shape) so they don't share a type. */
function toActionEvent(now: () => Date, event: StatelessToolEvent): SupervisedRunActionEvent {
  const status: SupervisedRunActionEvent["status"] =
    event.phase === "start" ? "running" : event.ok ? "ok" : "error";
  return { at: now().toISOString(), tool: event.tool, line: event.line, status };
}

/**
 * True iff a FRESH `running` row exists for this org+template. A `running`
 * row older than `STALE_RUNNING_MS` (F1, Wave 1 review) is presumed
 * stranded — the platform killed the function before `finishRun` ever
 * wrote — so it is ignored by the guard AND lazily reconciled to `failed`
 * (org-scoped, same code path) rather than permanently bricking the "Run
 * it once" button.
 */
async function hasRunningRunReal(args: { orgId: string; templateId: string }): Promise<boolean> {
  const [row] = await db
    .select({ id: supervisedRuns.id, startedAt: supervisedRuns.startedAt })
    .from(supervisedRuns)
    .where(
      and(
        eq(supervisedRuns.orgId, args.orgId),
        eq(supervisedRuns.templateId, args.templateId),
        eq(supervisedRuns.status, "running"),
      ),
    )
    .limit(1);

  const decision = resolveRunningRunGuard(row ?? null, new Date());
  if (decision.blocks) return true;

  if (decision.staleRunId) {
    await db
      .update(supervisedRuns)
      .set({ status: "failed", summary: "timed out (stale)", finishedAt: new Date() })
      .where(
        and(
          eq(supervisedRuns.id, decision.staleRunId),
          eq(supervisedRuns.orgId, args.orgId),
          eq(supervisedRuns.status, "running"),
        ),
      );
  }
  return false;
}

async function createRunReal(args: { orgId: string; templateId: string }): Promise<{ id: string }> {
  const [row] = await db
    .insert(supervisedRuns)
    .values({ orgId: args.orgId, templateId: args.templateId, status: "running", actionLog: [] })
    .returning({ id: supervisedRuns.id });
  return { id: row.id };
}

async function appendActionEventReal(runId: string, event: SupervisedRunActionEvent): Promise<void> {
  // L-03: bound-param jsonb `||` append (single-element array, wrapped in
  // its own JSON array) — never a read-modify-write of the whole column.
  // Best-effort live stream; a failure here is swallowed by runSupervised's
  // caller (the .catch in supervised-run.ts) and never affects the run's
  // final outcome (finishRunReal below always writes the full, authoritative
  // actionLog regardless).
  await db
    .update(supervisedRuns)
    .set({
      actionLog: sql`COALESCE(${supervisedRuns.actionLog}, '[]'::jsonb) || ${JSON.stringify([event])}::jsonb`,
    })
    .where(eq(supervisedRuns.id, runId));
}

async function finishRunReal(
  runId: string,
  result: { status: "succeeded" | "failed"; summary: string; actionLog: SupervisedRunActionEvent[] },
): Promise<void> {
  await db
    .update(supervisedRuns)
    .set({
      status: result.status,
      summary: result.summary,
      actionLog: result.actionLog,
      finishedAt: new Date(),
    })
    .where(eq(supervisedRuns.id, runId));
}

/**
 * "Run it once — watch every action." Org-guarded, BYOK-gated (mirrors
 * runAgentEvalsAction exactly — money-safe: this is unbounded-COGS real-tool
 * execution, so it requires the operator's OWN key). Resolves the template's
 * real blueprint + a neutral workspace context, wires runStatelessAgentTurn
 * as the `runTurn` dep (testMode:true — see file header), and delegates to
 * runSupervised.
 */
export async function startSupervisedRunAction(templateId: string): Promise<StartSupervisedRunResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const [template] = await db
    .select()
    .from(agentTemplates)
    .where(and(eq(agentTemplates.id, templateId), eq(agentTemplates.builderOrgId, orgId)))
    .limit(1);
  if (!template) return { ok: false, error: "template_not_found" };

  const resolution = await getAIClient({ orgId });
  const gate = resolveStudioBuildGate(resolution.mode);
  if (!gate.ok || !resolution.client) {
    return { ok: false, error: "no_llm_key", message: NEEDS_BYOK_MESSAGE };
  }
  const client = resolution.client;

  const [org] = await db
    .select({ slug: organizations.slug, timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return { ok: false, error: "unauthorized" };

  const blueprint = (template.blueprint ?? {}) as AgentBlueprint;
  const trigger = resolveAgentTrigger(blueprint.trigger);
  const kickoffMessage = buildKickoffMessage(trigger);

  const deps: SupervisedRunDeps = {
    hasRunningRun: hasRunningRunReal,
    createRun: createRunReal,
    runTurn: async ({ message, onToolEvent }) => {
      const result = await runStatelessAgentTurn({
        orgId,
        orgSlug: org.slug,
        orgName: "your business",
        soul: null,
        timezone: org.timezone ?? "UTC",
        blueprint,
        messages: [{ role: "user", content: message }],
        testMode: true,
        client,
        onToolEvent: (event) => onToolEvent(toActionEvent(() => new Date(), event)),
      });
      if (!result.ok) return { ok: false, reason: result.reason };
      return { ok: true, reply: result.reply };
    },
    appendActionEvent: appendActionEventReal,
    finishRun: finishRunReal,
  };

  const result = await runSupervised(deps, { orgId, templateId, kickoffMessage });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, runId: result.runId, status: result.status, summary: result.summary };
}

export type GetSupervisedRunResult =
  | { ok: true; run: SupervisedRun }
  | { ok: false; error: "unauthorized" | "not_found" };

/** Org-scoped poll read for the live action log — the Run stage's ~1.5s
 *  poll while `status === "running"`. */
export async function getSupervisedRunAction(runId: string): Promise<GetSupervisedRunResult> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const [run] = await db
    .select()
    .from(supervisedRuns)
    .where(and(eq(supervisedRuns.id, runId), eq(supervisedRuns.orgId, orgId)))
    .orderBy(desc(supervisedRuns.startedAt))
    .limit(1);
  if (!run) return { ok: false, error: "not_found" };
  return { ok: true, run };
}
