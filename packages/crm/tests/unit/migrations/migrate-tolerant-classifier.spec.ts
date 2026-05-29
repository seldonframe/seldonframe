import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyMigrateError, extractPgCode, SAFE_SKIP_PG_CODES } from "../../../scripts/migrate-tolerant.mjs";

// ── classifyMigrateError ────────────────────────────────────────────────────

test("classifyMigrateError: 42701 (column already exists) → safe-skip", () => {
  // This is the 0019_silky_viper case: re-running ADD COLUMN
  // stripe_payment_method_id after an out-of-band apply.
  assert.equal(classifyMigrateError("42701"), "safe-skip");
});

test("classifyMigrateError: 42P07 (relation already exists) → safe-skip", () => {
  assert.equal(classifyMigrateError("42P07"), "safe-skip");
});

test("classifyMigrateError: 42710 (duplicate object) → safe-skip", () => {
  // The 0054 unique-constraint re-add case.
  assert.equal(classifyMigrateError("42710"), "safe-skip");
});

test("classifyMigrateError: 23505 (unique violation, tracker re-insert) → safe-skip", () => {
  assert.equal(classifyMigrateError("23505"), "safe-skip");
});

test("classifyMigrateError: a made-up 42xyz-style syntax error → fatal", () => {
  // A genuine SQL error MUST break the build, not slip through.
  assert.equal(classifyMigrateError("42601"), "fatal"); // syntax_error
  assert.equal(classifyMigrateError("42P01"), "fatal"); // undefined_table
  assert.equal(classifyMigrateError("42703"), "fatal"); // undefined_column
});

test("classifyMigrateError: connection errors (class 08) → fatal", () => {
  assert.equal(classifyMigrateError("08006"), "fatal"); // connection_failure
  assert.equal(classifyMigrateError("08001"), "fatal"); // unable to connect
});

test("classifyMigrateError: missing/empty code → fatal", () => {
  assert.equal(classifyMigrateError(undefined), "fatal");
  assert.equal(classifyMigrateError(null), "fatal");
  assert.equal(classifyMigrateError(""), "fatal");
});

test("classifyMigrateError: an unknown code is fatal (forgive only the known)", () => {
  assert.equal(classifyMigrateError("99999"), "fatal");
  assert.equal(classifyMigrateError("XX000"), "fatal"); // internal_error
});

test("SAFE_SKIP_PG_CODES is the documented allowlist", () => {
  // Guard against accidental broadening of what we swallow.
  for (const code of ["42701", "42P07", "42710"]) {
    assert.ok(SAFE_SKIP_PG_CODES.has(code), `${code} should be a safe-skip code`);
  }
  for (const code of ["42601", "42P01", "08006"]) {
    assert.ok(!SAFE_SKIP_PG_CODES.has(code), `${code} must NOT be a safe-skip code`);
  }
});

// ── extractPgCode ───────────────────────────────────────────────────────────

test("extractPgCode: pulls a labeled `code: '42701'`", () => {
  const out = "PostgresError: column already exists\n  code: '42701'\n  at ...";
  assert.equal(extractPgCode(out), "42701");
});

test("extractPgCode: pulls a JSON-style \"code\":\"42P07\"", () => {
  const out = '{"severity":"ERROR","code":"42P07","message":"relation exists"}';
  assert.equal(extractPgCode(out), "42P07");
});

test("extractPgCode: pulls a bare SQLSTATE token", () => {
  const out = "error: relation already exists (SQLSTATE 42P07)";
  assert.equal(extractPgCode(out), "42P07");
});

test("extractPgCode: returns null when no code is present", () => {
  assert.equal(extractPgCode("some generic failure with no sqlstate"), null);
  assert.equal(extractPgCode(""), null);
});

test("end-to-end intent: a 42701 build output classifies safe-skip", () => {
  const out = "drizzle-kit migrate\nPostgresError: column \"stripe_payment_method_id\" of relation \"users\" already exists\n  code: '42701'";
  assert.equal(classifyMigrateError(extractPgCode(out)), "safe-skip");
});

test("end-to-end intent: a 42P01 build output classifies fatal", () => {
  const out = "drizzle-kit migrate\nPostgresError: relation \"nonexistent\" does not exist\n  code: '42P01'";
  assert.equal(classifyMigrateError(extractPgCode(out)), "fatal");
});
