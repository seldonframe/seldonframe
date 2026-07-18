// Deterministic replay — Reelier phase 2c slice 2. compileSkillFromTrace:
// org-scoped lookup + reelier's OWN compile()/renderSkillMd() round-trip
// against a realistic stored-records fixture (create_note -> get_note, with
// a dataflow bind between them). Verifies (a) the org/deployment-scoped
// lookup never leaks a trace from a different org/deployment, (b) the
// compiled skill always starts status:'draft', and (c) the shape adapter
// (toReelierRecords) preserves enough structure for reelier's dataflow
// recovery to actually find the create_note -> get_note bind.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  compileSkillFromTrace,
  toReelierRecords,
  type CompileSkillFromTraceDeps,
} from "@/lib/deployments/replay/compile";
import { parseSkill } from "@seldonframe/reelier/skill";
import {
  makeMetaRecord,
  makeNoteRecord,
  makeCallRecord,
  makeResultRecord,
  type TraceRecord,
} from "@/lib/deployments/replay/trace-format";

const ORG = "org_1";
const DEPLOYMENT = "dep_1";
const TRACE_ID = "trace_1";

/** create_note("hello") -> {noteId: "n_42"}; get_note({noteId: "n_42"}) ->
 *  {found: true} — a realistic two-step trace with a dataflow dependency
 *  (get_note's arg is the value create_note's result produced). */
function fixtureRecords(): TraceRecord[] {
  return [
    makeMetaRecord({ name: "email:dep_1", startedAt: "2026-07-17T00:00:00.000Z", wrapped: ["gmail"] }),
    makeNoteRecord({ seq: 1, ts: "2026-07-17T00:00:00.100Z", text: "Creating a note for this email" }),
    makeCallRecord({ seq: 2, i: 0, ts: "2026-07-17T00:00:00.200Z", tool: "create_note", args: { body: "hello" } }),
    makeResultRecord({ seq: 3, i: 0, ok: true, ms: 12, body: { noteId: "n_42" } }),
    makeNoteRecord({ seq: 4, ts: "2026-07-17T00:00:00.300Z", text: "Confirming the note was written" }),
    makeCallRecord({ seq: 5, i: 1, ts: "2026-07-17T00:00:00.400Z", tool: "get_note", args: { noteId: "n_42" } }),
    makeResultRecord({ seq: 6, i: 1, ok: true, ms: 8, body: { found: true } }),
  ];
}

function fakeDeps(records: TraceRecord[]): CompileSkillFromTraceDeps & {
  insertedRows: unknown[];
} {
  const insertedRows: unknown[] = [];
  return {
    insertedRows,
    loadTrace: async (orgId, deploymentId, traceId) => {
      if (orgId !== ORG || deploymentId !== DEPLOYMENT || traceId !== TRACE_ID) return null;
      return { id: traceId, records };
    },
    insertSkill: async (row) => {
      insertedRows.push(row);
      return {
        id: "skill_1",
        orgId: row.orgId,
        deploymentId: row.deploymentId,
        name: row.name ?? null,
        skillMd: row.skillMd,
        status: row.status ?? "draft",
        sourceTraceId: row.sourceTraceId ?? null,
        healCount: 0,
        lastReplayAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never;
    },
  };
}

describe("toReelierRecords — shape adapter", () => {
  test("wraps a result body into the MCP CallToolResult shape compile() expects", () => {
    const out = toReelierRecords([
      makeResultRecord({ seq: 0, i: 0, ok: true, ms: 1, body: { noteId: "n_42" } }),
    ]);
    const rec = out[0] as { t: "result"; body: { content: Array<{ type: string; text: string }>; isError: boolean } };
    assert.equal(rec.t, "result");
    assert.equal(rec.body.isError, false);
    assert.equal(rec.body.content[0].type, "text");
    assert.deepEqual(JSON.parse(rec.body.content[0].text), { noteId: "n_42" });
  });

  test("a failed result sets isError true", () => {
    const out = toReelierRecords([
      makeResultRecord({ seq: 0, i: 0, ok: false, ms: 1, body: { error: "boom" } }),
    ]);
    const rec = out[0] as { body: { isError: boolean } };
    assert.equal(rec.body.isError, true);
  });

  test("meta/note/call records pass through unchanged", () => {
    const meta = makeMetaRecord({ name: "n", startedAt: "t", wrapped: [] });
    const note = makeNoteRecord({ seq: 1, ts: "t", text: "hi" });
    const call = makeCallRecord({ seq: 2, i: 0, ts: "t", tool: "x", args: {} });
    const out = toReelierRecords([meta, note, call]);
    assert.deepEqual(out, [meta, note, call]);
  });
});

describe("compileSkillFromTrace — org-scoped lookup", () => {
  test("returns null when the trace belongs to a different org", async () => {
    const deps = fakeDeps(fixtureRecords());
    const result = await compileSkillFromTrace("org_OTHER", DEPLOYMENT, TRACE_ID, deps);
    assert.equal(result, null);
    assert.equal(deps.insertedRows.length, 0);
  });

  test("returns null when the trace belongs to a different deployment", async () => {
    const deps = fakeDeps(fixtureRecords());
    const result = await compileSkillFromTrace(ORG, "dep_OTHER", TRACE_ID, deps);
    assert.equal(result, null);
  });

  test("returns null for an unknown trace id", async () => {
    const deps = fakeDeps(fixtureRecords());
    const result = await compileSkillFromTrace(ORG, DEPLOYMENT, "trace_UNKNOWN", deps);
    assert.equal(result, null);
  });
});

describe("compileSkillFromTrace — round-trip against a realistic fixture", () => {
  test("compiles a draft skill whose SKILL.md round-trips through reelier's OWN parseSkill", async () => {
    const deps = fakeDeps(fixtureRecords());
    const result = await compileSkillFromTrace(ORG, DEPLOYMENT, TRACE_ID, deps);
    assert.ok(result);
    assert.equal(result!.skillRow.status, "draft");
    assert.equal(result!.skillRow.sourceTraceId, TRACE_ID);
    assert.equal(deps.insertedRows.length, 1);

    // The real reelier parser must accept our compiler's own output verbatim.
    const parsed = parseSkill(result!.skillRow.skillMd);
    assert.equal(parsed.steps.length, 2);
    assert.equal(parsed.steps[0].actionTool, "create_note");
    assert.equal(parsed.steps[1].actionTool, "get_note");
  });

  test("recovers the create_note -> get_note dataflow bind (noteId)", async () => {
    const deps = fakeDeps(fixtureRecords());
    const result = await compileSkillFromTrace(ORG, DEPLOYMENT, TRACE_ID, deps);
    assert.ok(result);
    const step1 = result!.compiled.steps[0];
    const step2 = result!.compiled.steps[1];
    // Step 1 (create_note) gets a bind extracting json.noteId from its own
    // result, PLUS the "is set" assert reelier's compiler always pairs with
    // a fresh bind.
    assert.ok(step1.binds.some((b) => b.includes("json.noteId")));
    assert.ok(step1.asserts.some((a) => a.includes("json.noteId is set")));
    // Step 2 (get_note)'s literal "n_42" arg is replaced with the bound
    // variable — never the baked-in literal — so replay always uses the
    // FRESH value produced at run time.
    const argsJson = JSON.stringify(step2.args);
    assert.ok(!argsJson.includes("n_42"));
    assert.ok(/\{\{\w+\}\}/.test(argsJson));
  });

  test("both steps get a success assert (status == 200) since both results were ok", async () => {
    const deps = fakeDeps(fixtureRecords());
    const result = await compileSkillFromTrace(ORG, DEPLOYMENT, TRACE_ID, deps);
    for (const step of result!.compiled.steps) {
      assert.ok(step.asserts.some((a) => a === "status == 200"));
    }
  });
});
