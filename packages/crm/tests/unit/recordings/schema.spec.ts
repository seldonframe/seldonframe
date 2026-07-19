import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { getTableColumns } from "drizzle-orm";
import { recordingSessions, workflowRecordings } from "@/db/schema/recordings";

test("recordingSessions has tokenHash column", () => {
  const cols = getTableColumns(recordingSessions);
  assert.ok(cols.tokenHash, "expected tokenHash column");
});

test("workflowRecordings has slotIndex column", () => {
  const cols = getTableColumns(workflowRecordings);
  assert.ok(cols.slotIndex, "expected slotIndex column");
});

test("migration file 0067_record_to_agent.sql exists", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../../drizzle/0067_record_to_agent.sql",
  );
  assert.ok(fs.existsSync(migrationPath), `expected ${migrationPath} to exist`);
});

test("journal contains tag 0067_record_to_agent exactly once", () => {
  const journalPath = path.resolve(
    __dirname,
    "../../../drizzle/meta/_journal.json",
  );
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const matches = journal.entries.filter(
    (entry: { tag: string }) => entry.tag === "0067_record_to_agent",
  );
  assert.equal(matches.length, 1, "expected exactly one journal entry for 0067_record_to_agent");
});
