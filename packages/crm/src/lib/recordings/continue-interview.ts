// Agent lifecycle slice — Stage 01 "Learned": continue-the-interview
// orchestration. Plain, dependency-injected module (NOT "use server" — kept
// separate from the thin action wrapper in
// lib/agent-templates/interview-actions.ts precisely so this file can be
// unit-tested with plain fakes without dragging in that file's `getOrgId`
// import chain, mirroring the eval-actions.ts / run-agent-evals.ts split).
//
// `continueInterviewCore` reuses the exact pre-claim interview machinery: it
// loads the recording session that produced the template
// (findSessionByTemplateId — there is no `recordingProvenance.sessionId`
// field on the template itself; the session→template link is
// `recordingSessions.agentTemplateId`, set by the compile-agent route, and
// looked up in the OTHER direction here), runs one `interviewTurn`, and —
// ONLY when the merge actually applied — recompiles the template in place
// via the SAME `flowModelToBundle` + `updateAgentTemplate` path the
// compile-agent route uses (identity/name preserved: updateAgentTemplate
// merge-patches the blueprint only, never touches name/slug).
//
// Never-lies: the reply may claim an update ONLY when both the merge applied
// AND the recompile write persisted. `applied:false` (or a failed recompile
// write) never touches the session or the template.

import type { RecordingSession } from "@/db/schema/recordings";
import { interviewTurn, type InterviewTurn } from "./interview";
import { flowModelToBundle } from "./compile-agent";
import type { FlowModel, TraceLlm, WorkflowTrace } from "./trace-schema";

export type ContinueInterviewResult =
  | { ok: true; reply: string; applied: boolean; openQuestions: string[] }
  | {
      ok: false;
      error:
        | "unauthorized"
        | "no_recording_session"
        | "no_flow_model"
        | "interview_failed"
        | "update_failed"
        | "extraction_unavailable";
    };

/** A Q&A pair as persisted to `recording_sessions.answered_questions` —
 *  `question` is null for a direct (non-decomposed) merge, where the
 *  operator's message answered the open-questions set as a whole. */
export type PersistableAnswer = { question: string | null; answer: string };

export type TemplateBlueprintPatchLike = Record<string, unknown>;

export type ContinueInterviewDeps = {
  findSession: (templateId: string) => Promise<RecordingSession | null>;
  listTracedRecordings: (sessionId: string) => Promise<Array<{ label: string | null; trace: WorkflowTrace }>>;
  llm: TraceLlm;
  updateTemplate: (input: { id: string; patch: TemplateBlueprintPatchLike }) => Promise<{ ok: boolean }>;
  persistSession: (input: {
    sessionId: string;
    model: FlowModel;
    openQuestions: string[];
    message: string;
    reply: string;
    answeredPairs: PersistableAnswer[];
  }) => Promise<void>;
};

/**
 * Pure(-ish) orchestration, every I/O injected — no DB, no network in tests.
 * See the file header for the never-lies contract this implements.
 */
export async function continueInterviewCore(
  deps: ContinueInterviewDeps,
  input: { orgId: string; templateId: string; message: string },
): Promise<ContinueInterviewResult> {
  const session = await deps.findSession(input.templateId);
  if (!session) return { ok: false, error: "no_recording_session" };
  if (session.orgId !== input.orgId) return { ok: false, error: "unauthorized" };

  const flowModel = session.flowModel as FlowModel | null;
  if (!flowModel) return { ok: false, error: "no_flow_model" };

  const interviewLog = Array.isArray(session.interviewLog) ? (session.interviewLog as InterviewTurn[]) : [];

  const result = await interviewTurn({
    model: flowModel,
    interviewLog,
    message: input.message,
    llm: deps.llm,
  });
  if (!result.ok) return { ok: false, error: "interview_failed" };

  if (!result.applied) {
    // Fail-soft, honest: nothing merged, so nothing recompiles and nothing
    // is persisted — the operator's turn is surfaced but never claimed as
    // applied (never-lies).
    return { ok: true, reply: result.reply, applied: false, openQuestions: result.openQuestions };
  }

  const recordings = await deps.listTracedRecordings(session.id);
  const { bundle } = flowModelToBundle({ model: result.model, recordings });

  const updated = await deps.updateTemplate({
    id: input.templateId,
    patch: bundle.blueprint as unknown as TemplateBlueprintPatchLike,
  });
  if (!updated.ok) {
    // The merge applied but the recompile write failed — never claim the
    // update landed (never-lies). Session is left untouched too, so a retry
    // starts from the same known-good state.
    return { ok: false, error: "update_failed" };
  }

  const answeredPairs: PersistableAnswer[] =
    result.appliedPairs && result.appliedPairs.length > 0
      ? result.appliedPairs.map((p) => ({ question: p.question, answer: p.answer }))
      : [{ question: null, answer: input.message }];

  await deps.persistSession({
    sessionId: session.id,
    model: result.model,
    openQuestions: result.openQuestions,
    message: input.message,
    reply: result.reply,
    answeredPairs,
  });

  return { ok: true, reply: result.reply, applied: true, openQuestions: result.openQuestions };
}
