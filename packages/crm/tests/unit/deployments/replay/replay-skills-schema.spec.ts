// Deterministic replay — Reelier phase 2c slice 2. replay_skills schema +
// migration 0075 shape checks — mirrors tests/unit/workflow-approvals-schema
// .spec.ts's pattern (Drizzle schemas don't run SQL in unit tests; verify
// the inferred TS shape + cross-check the hand-written migration SQL
// against it, since this repo hand-writes migrations rather than
// drizzle-kit generating them — the two can silently drift).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { replaySkills } from "@/db/schema/replay-skills";
import type { ReplaySkillRow, NewReplaySkillRow, ReplaySkillStatus } from "@/db/schema/replay-skills";
import { agentWorkflowTraces } from "@/db/schema/agent-workflow-traces";

describe("replay_skills — table shape", () => {
  test("exports a Drizzle PgTable", () => {
    assert.equal(typeof replaySkills, "object");
    assert.ok(replaySkills);
  });

  test("columns: identifiers + org/deployment scope", () => {
    assert.ok("id" in replaySkills);
    assert.ok("orgId" in replaySkills);
    assert.ok("deploymentId" in replaySkills);
  });

  test("columns: skill content + lifecycle", () => {
    assert.ok("name" in replaySkills);
    assert.ok("skillMd" in replaySkills);
    assert.ok("status" in replaySkills);
    assert.ok("sourceTraceId" in replaySkills);
    assert.ok("healCount" in replaySkills);
    assert.ok("lastReplayAt" in replaySkills);
    assert.ok("triggerFilter" in replaySkills);
    assert.ok("idempotency" in replaySkills);
    assert.ok("createdAt" in replaySkills);
    assert.ok("updatedAt" in replaySkills);
  });

  test("ReplaySkillStatus has the 3 expected values (draft/enabled/disabled)", () => {
    const all: ReplaySkillStatus[] = ["draft", "enabled", "disabled"];
    assert.equal(all.length, 3);
  });

  test("ReplaySkillRow / NewReplaySkillRow type exports round-trip a draft row", () => {
    const row: ReplaySkillRow = {
      id: "00000000-0000-4000-8000-000000000001",
      orgId: "00000000-0000-4000-8000-000000000002",
      deploymentId: "00000000-0000-4000-8000-000000000003",
      name: "email:dep_1",
      skillMd: "---\nname: x\n---\n",
      status: "draft",
      sourceTraceId: null,
      healCount: 0,
      lastReplayAt: null,
      triggerFilter: null,
      idempotency: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    assert.equal(row.status, "draft");

    const insert: NewReplaySkillRow = {
      orgId: row.orgId,
      deploymentId: row.deploymentId,
      skillMd: row.skillMd,
    };
    assert.equal(insert.deploymentId, row.deploymentId);
  });

  test("triggerFilter round-trips a real filter object (migration 0076)", () => {
    const row: ReplaySkillRow = {
      id: "00000000-0000-4000-8000-000000000001",
      orgId: "00000000-0000-4000-8000-000000000002",
      deploymentId: "00000000-0000-4000-8000-000000000003",
      name: "email:dep_1",
      skillMd: "---\nname: x\n---\n",
      status: "enabled",
      sourceTraceId: null,
      healCount: 0,
      lastReplayAt: null,
      triggerFilter: { senderEndsWith: "@seldonframe.com" },
      idempotency: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    assert.deepEqual(row.triggerFilter, { senderEndsWith: "@seldonframe.com" });
  });

  test("idempotency round-trips a real config object (migration 0077)", () => {
    const row: ReplaySkillRow = {
      id: "00000000-0000-4000-8000-000000000001",
      orgId: "00000000-0000-4000-8000-000000000002",
      deploymentId: "00000000-0000-4000-8000-000000000003",
      name: "email:dep_1",
      skillMd: "---\nname: x\n---\n",
      status: "enabled",
      sourceTraceId: null,
      healCount: 0,
      lastReplayAt: null,
      triggerFilter: null,
      idempotency: { stepN: 3, keyVar: "message_id" },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    assert.deepEqual(row.idempotency, { stepN: 3, keyVar: "message_id" });
  });

  test("barrel re-export wires replay_skills into the db schema bundle", async () => {
    const schemaBarrel = await import("@/db/schema");
    assert.ok(
      "replaySkills" in schemaBarrel,
      "replay_skills must be re-exported via the schema barrel so drizzle config picks it up",
    );
  });
});

describe("agent_workflow_traces — kind column (slice 2 addition)", () => {
  test("kind column exists on the schema", () => {
    assert.ok("kind" in agentWorkflowTraces);
  });
});

describe("migration 0075 — SQL matches the Drizzle schema's constraints", () => {
  const migrationSql = readFileSync(
    path.join(__dirname, "../../../../drizzle/0075_replay_skills.sql"),
    "utf8",
  );

  test("adds agent_workflow_traces.kind with default 'trace'", () => {
    assert.match(migrationSql, /ALTER TABLE "agent_workflow_traces"/);
    assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'trace'/);
  });

  test("creates replay_skills with deployment_id NOT NULL + ON DELETE CASCADE", () => {
    assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS "replay_skills"/);
    assert.match(
      migrationSql,
      /"deployment_id" uuid NOT NULL REFERENCES "deployments"\("id"\) ON DELETE CASCADE/,
    );
  });

  test("creates the partial UNIQUE index enforcing at most one enabled skill per deployment", () => {
    assert.match(
      migrationSql,
      /CREATE UNIQUE INDEX IF NOT EXISTS "replay_skills_one_enabled_per_deployment_idx"\s*\n\s*ON "replay_skills" \("deployment_id"\)\s*\n\s*WHERE "status" = 'enabled'/,
    );
  });

  test("status defaults to 'draft' at the SQL level, matching the schema's compileSkillFromTrace contract (never auto-enabled)", () => {
    assert.match(migrationSql, /"status" text NOT NULL DEFAULT 'draft'/);
  });

  test("source_trace_id references agent_workflow_traces ON DELETE SET NULL", () => {
    assert.match(
      migrationSql,
      /"source_trace_id" uuid REFERENCES "agent_workflow_traces"\("id"\) ON DELETE SET NULL/,
    );
  });
});

describe("migration 0076 — trigger_filter column matches the Drizzle schema", () => {
  const migrationSql = readFileSync(
    path.join(__dirname, "../../../../drizzle/0076_replay_skills_trigger_filter.sql"),
    "utf8",
  );

  test("adds replay_skills.trigger_filter as a nullable jsonb column", () => {
    assert.match(migrationSql, /ALTER TABLE "replay_skills"/);
    assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS "trigger_filter" jsonb;/);
    // Nullable — no NOT NULL on this column (null = no filter is a real,
    // supported state, not a placeholder).
    assert.doesNotMatch(migrationSql, /"trigger_filter" jsonb NOT NULL/);
  });

  test("journal registers 0076 after 0075", () => {
    const journal = JSON.parse(
      readFileSync(path.join(__dirname, "../../../../drizzle/meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ idx: number; tag: string }> };
    const tags = journal.entries.map((e) => e.tag);
    const idx75 = tags.indexOf("0075_replay_skills");
    const idx76 = tags.indexOf("0076_replay_skills_trigger_filter");
    assert.ok(idx75 >= 0, "0075 must be registered");
    assert.ok(idx76 >= 0, "0076 must be registered");
    assert.equal(idx76, idx75 + 1, "0076 must immediately follow 0075");
  });
});

describe("migration 0077 — replay gate v2 (idempotency column + send-claims table)", () => {
  const migrationSql = readFileSync(
    path.join(__dirname, "../../../../drizzle/0077_replay_gate_v2.sql"),
    "utf8",
  );

  test("adds replay_skills.idempotency as a nullable jsonb column", () => {
    assert.match(migrationSql, /ALTER TABLE "replay_skills"/);
    assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS "idempotency" jsonb;/);
    assert.doesNotMatch(migrationSql, /"idempotency" jsonb NOT NULL/);
  });

  test("creates replay_send_claims with skill_id NOT NULL + ON DELETE CASCADE", () => {
    assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS "replay_send_claims"/);
    assert.match(
      migrationSql,
      /"skill_id" uuid NOT NULL REFERENCES "replay_skills"\("id"\) ON DELETE CASCADE/,
    );
  });

  test("creates the UNIQUE index on (skill_id, step_n, idempotency_key) — the double-send lock", () => {
    assert.match(
      migrationSql,
      /CREATE UNIQUE INDEX IF NOT EXISTS "replay_send_claims_skill_step_key_idx"\s*\n\s*ON "replay_send_claims" \("skill_id", "step_n", "idempotency_key"\)/,
    );
  });

  test("outcome defaults to 'unknown' at the SQL level", () => {
    assert.match(migrationSql, /"outcome" text NOT NULL DEFAULT 'unknown'/);
  });

  test("journal registers 0077 after 0076", () => {
    const journal = JSON.parse(
      readFileSync(path.join(__dirname, "../../../../drizzle/meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ idx: number; tag: string }> };
    const tags = journal.entries.map((e) => e.tag);
    const idx76 = tags.indexOf("0076_replay_skills_trigger_filter");
    const idx77 = tags.indexOf("0077_replay_gate_v2");
    assert.ok(idx76 >= 0, "0076 must be registered");
    assert.ok(idx77 >= 0, "0077 must be registered");
    assert.equal(idx77, idx76 + 1, "0077 must immediately follow 0076");
  });
});
