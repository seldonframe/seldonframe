// Deterministic replay — Reelier phase 2c, slice 2. compileSkillFromTrace:
// read one org-scoped `agent_workflow_traces` row (kind:'trace', slice 1's
// raw material) and compile it into a `replay_skills` row (status:'draft')
// via @seldonframe/reelier's OWN compiler (compile()/renderSkillMd() —
// deterministic, zero LLM calls, per the package's own design notes).
//
// NEVER auto-enables: every compiled skill starts `status: 'draft'` —
// enabling is a human act (for now via SQL/ops; no UI in this slice). This
// mirrors the never-fail-compile precedent (agent_action_drafts: a compiled
// artifact PREPARES work it may not execute without review).
//
// Org-scoped: the trace lookup is WHERE org_id = $orgId AND deployment_id =
// $deploymentId AND id = $traceId — a caller can never compile a trace that
// belongs to a different org OR a different deployment than the one it
// asked for (L-04 security invariant).
//
// SHAPE ADAPTER: reelier's compile() expects each `result` record's `body`
// to be an MCP CallToolResult ({content:[{type:"text",text}], isError}) —
// that's the shape ITS OWN recorder (an MCP proxy) produces. Our recorder
// (./recorder.ts) wraps SF's native tool execute() results directly (a raw
// JS value, already redacted/capped by trace-format.ts) — a different shape
// by construction (we never proxy MCP). toReelierRecords() below bridges
// that gap the same way the L0 replay tool bridge does for the reverse
// direction (replay-before-llm.ts): wrap our raw body as reelier's own
// mcp-tool.js would have produced it, so compile()'s dataflow recovery
// (JSON.parse(obs.body)) works exactly as it does on a reelier-native trace.

import { compile, renderSkillMd } from "@seldonframe/reelier/compile";
import type { ReelierCompileResult } from "@seldonframe/reelier/compile";
import type { ReelierTraceRecord } from "@seldonframe/reelier/trace";
import type { TraceRecord } from "./trace-format";
import type { NewReplaySkillRow, ReplaySkillRow } from "@/db/schema/replay-skills";

/** Adapt our TraceRecord[] into reelier's own trace-record shape for
 *  compile(): identical for meta/note/call records (our TraceRecord type
 *  was built to match reelier's record contract exactly — see
 *  trace-format.ts's header comment); only `result.body` differs, wrapped
 *  here into the MCP CallToolResult shape compile()'s
 *  mcpResultToObservation() expects. Pure; never throws (JSON.stringify of
 *  an already-capped/redacted value can only fail on a circular structure,
 *  which capTraceBody already ruled out before this ever reaches storage —
 *  still guarded defensively). */
export function toReelierRecords(records: TraceRecord[]): ReelierTraceRecord[] {
  return records.map((r): ReelierTraceRecord => {
    if (r.t !== "result") return r;
    let text: string;
    try {
      text = JSON.stringify(r.body ?? null) ?? "null";
    } catch {
      text = JSON.stringify({ error: "unserializable trace body" });
    }
    return {
      t: "result",
      seq: r.seq,
      i: r.i,
      ok: r.ok,
      ms: r.ms,
      body: { content: [{ type: "text", text }], isError: !r.ok },
    };
  });
}

export type CompileSkillFromTraceResult = {
  skillRow: ReplaySkillRow;
  compiled: ReelierCompileResult;
};

/** Injectable I/O — defaults to real `@/db` reads/writes (kept out of the
 *  top-level import graph so this module stays test-friendly). */
export type CompileSkillFromTraceDeps = {
  loadTrace?: (
    orgId: string,
    deploymentId: string,
    traceId: string,
  ) => Promise<{ id: string; records: TraceRecord[] } | null>;
  insertSkill?: (row: NewReplaySkillRow) => Promise<ReplaySkillRow>;
};

async function defaultLoadTrace(
  orgId: string,
  deploymentId: string,
  traceId: string,
): Promise<{ id: string; records: TraceRecord[] } | null> {
  const { db } = await import("@/db");
  const { agentWorkflowTraces } = await import("@/db/schema/agent-workflow-traces");
  const { and, eq } = await import("drizzle-orm");
  const [row] = await db
    .select({ id: agentWorkflowTraces.id, records: agentWorkflowTraces.records })
    .from(agentWorkflowTraces)
    .where(
      and(
        eq(agentWorkflowTraces.id, traceId),
        eq(agentWorkflowTraces.orgId, orgId),
        eq(agentWorkflowTraces.deploymentId, deploymentId),
      ),
    )
    .limit(1);
  if (!row) return null;
  // A 'trace' row's records are always a TraceRecord[] (never a RunRecord —
  // that shape only exists on kind:'replay-run' rows, which this lookup
  // doesn't filter for by kind but SHOULD never be passed a replay-run id in
  // practice; a caller compiling a replay-run id will just get a compile()
  // that finds no calls, an honest empty/near-empty skill rather than a
  // crash — Array.isArray guards the cast).
  const records = Array.isArray(row.records) ? (row.records as TraceRecord[]) : [];
  return { id: row.id, records };
}

async function defaultInsertSkill(row: NewReplaySkillRow): Promise<ReplaySkillRow> {
  const { db } = await import("@/db");
  const { replaySkills } = await import("@/db/schema/replay-skills");
  const [inserted] = await db.insert(replaySkills).values(row).returning();
  return inserted;
}

/**
 * Compile one org-scoped trace into a draft replay_skills row. Returns
 * `null` when the trace isn't found (wrong id, or belongs to a different
 * org/deployment — the org-scoped WHERE clause makes these indistinguishable
 * on purpose, mirroring every other org-scoped lookup in this codebase: a
 * caller never learns whether a resource exists in ANOTHER org). Throws on a
 * genuine compile/insert failure — unlike the recorder/persist modules, this
 * is a synchronous, human-triggered action (not an observation hook riding
 * along a live agent turn), so fail-LOUD is correct here: a caller (ops
 * script / future admin action) needs to know compilation failed rather than
 * silently getting nothing.
 */
export async function compileSkillFromTrace(
  orgId: string,
  deploymentId: string,
  traceId: string,
  deps?: CompileSkillFromTraceDeps,
): Promise<CompileSkillFromTraceResult | null> {
  const loadTrace = deps?.loadTrace ?? defaultLoadTrace;
  const insertSkill = deps?.insertSkill ?? defaultInsertSkill;

  const trace = await loadTrace(orgId, deploymentId, traceId);
  if (!trace) return null;

  const reelierRecords = toReelierRecords(trace.records);
  const compiled = compile(reelierRecords);
  const skillMd = renderSkillMd(compiled, `trace:${traceId}`);

  const row: NewReplaySkillRow = {
    orgId,
    deploymentId,
    name: compiled.name,
    skillMd,
    status: "draft",
    sourceTraceId: trace.id,
  };

  const skillRow = await insertSkill(row);
  return { skillRow, compiled };
}
