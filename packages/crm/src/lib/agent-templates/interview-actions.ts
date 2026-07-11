// Agent lifecycle slice — Stage 01 "Learned": continue-the-interview editing.
//
// THIN "use server" wrapper: resolves the authed org id + assembles the real
// deps, then delegates to `continueInterviewCore` (lib/recordings/
// continue-interview.ts — a plain, dependency-injected module, unit-tested
// directly with fakes). Kept separate from the core so importing the core
// for tests never drags in this file's `getOrgId`/next-auth import chain
// (mirrors the eval-actions.ts / run-agent-evals.ts split).

"use server";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { recordingSessions, workflowRecordings } from "@/db/schema/recordings";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { findSessionByTemplateId } from "@/lib/recordings/session-store";
import { type InterviewTurn } from "@/lib/recordings/interview";
import { makeAnthropicTraceLlm } from "@/lib/recordings/trace-llm";
import type { FlowModel, WorkflowTrace } from "@/lib/recordings/trace-schema";
import {
  continueInterviewCore,
  type ContinueInterviewResult,
  type PersistableAnswer,
} from "@/lib/recordings/continue-interview";
import { fillComposioBindingTools } from "@/lib/integrations/composio/discover-tools";
import { updateAgentTemplate, type TemplateBlueprintPatch } from "./store";

export type { ContinueInterviewResult } from "@/lib/recordings/continue-interview";

/** Real `listTracedRecordings` — mirrors the compile-agent route's own
 *  traced/trace filter exactly (only recordings that finished tracing feed
 *  the recompiled skill-md/scenarios). */
async function listTracedRecordingsReal(
  sessionId: string,
): Promise<Array<{ label: string | null; trace: WorkflowTrace }>> {
  const rows = await db
    .select()
    .from(workflowRecordings)
    .where(eq(workflowRecordings.sessionId, sessionId));
  return rows
    .filter((r) => r.status === "traced" && r.trace)
    .map((r) => ({ label: r.label, trace: r.trace as WorkflowTrace }));
}

/** Real `persistSession` — appends the interview turns + the answered Q&A
 *  pairs additively (L-03: bound-param `||` jsonb append, never a
 *  read-modify-write of the whole array) and writes the merged flowModel/
 *  openQuestions, mirroring the pre-claim /record interview route's own
 *  write shape exactly. */
async function persistSessionReal(input: {
  sessionId: string;
  model: FlowModel;
  openQuestions: string[];
  message: string;
  reply: string;
  answeredPairs: PersistableAnswer[];
}): Promise<void> {
  const newTurns: InterviewTurn[] = [
    { role: "user", text: input.message },
    { role: "seldon", text: input.reply },
  ];
  const answeredAt = new Date().toISOString();
  const newAnswered = input.answeredPairs.map((p) => ({
    question: p.question ?? null,
    answer: p.answer,
    answeredAt,
  }));

  await db
    .update(recordingSessions)
    .set({
      interviewLog: sql`COALESCE(${recordingSessions.interviewLog}, '[]'::jsonb) || ${JSON.stringify(newTurns)}::jsonb`,
      answeredQuestions: sql`COALESCE(${recordingSessions.answeredQuestions}, '[]'::jsonb) || ${JSON.stringify(newAnswered)}::jsonb`,
      flowModel: input.model,
      openQuestions: input.openQuestions,
      updatedAt: new Date(),
    })
    .where(eq(recordingSessions.id, input.sessionId));
}

/**
 * "Keep teaching" — the Learned stage's continue-the-interview input.
 * Org-guarded (the linked recording session must belong to the caller's
 * org); everything else is `continueInterviewCore` with real deps.
 */
export async function continueInterviewAction(input: {
  templateId: string;
  message: string;
}): Promise<ContinueInterviewResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const templateId = String(input.templateId ?? "").trim();
  const message = String(input.message ?? "").trim();
  if (!templateId || !message) return { ok: false, error: "no_recording_session" };

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "extraction_unavailable" };

  return continueInterviewCore(
    {
      findSession: (id) => findSessionByTemplateId(db, id),
      listTracedRecordings: listTracedRecordingsReal,
      llm: makeAnthropicTraceLlm({ apiKey }),
      updateTemplate: async ({ id, patch }) => {
        const result = await updateAgentTemplate({ id, patch: patch as TemplateBlueprintPatch });
        return { ok: result.ok };
      },
      persistSession: persistSessionReal,
      fillConnectors: async (connectors) =>
        (await fillComposioBindingTools(orgId, connectors)).connectors,
    },
    { orgId, templateId, message },
  );
}
