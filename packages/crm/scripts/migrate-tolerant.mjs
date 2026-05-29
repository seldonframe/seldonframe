#!/usr/bin/env node
// packages/crm/scripts/migrate-tolerant.mjs
//
// 2026-05-20 — Tolerant wrapper around `drizzle-kit migrate` for Vercel builds.
// 2026-05-29 — Made LOUD. Previously this swallowed ALL errors and exited 0,
//   which is what let two migrations reach prod silently (0019_silky_viper /
//   users.stripe_payment_method_id, and 0055_users_onboarding_completed_at).
//   The build log even said "migrations applied cleanly" because, from
//   drizzle's view, nothing new was in the journal to apply.
//
// ── The tradeoff this script manages
//
// Production migrations are sometimes applied out-of-band via the Neon MCP
// (scripts/apply-prod-migrations.mjs applies SQL directly, without writing to
// __drizzle_migrations). The journal + tracker can therefore drift from
// reality. When that happens, `drizzle-kit migrate` may try to re-apply a
// migration whose table/column already exists and error with e.g. 42701
// "column already exists". That kind of error is SAFE: the schema already has
// the thing. Failing the deploy on it would be the wrong call.
//
// But "the thing already exists" is the ONLY class of error that's safe to
// swallow. A migration that errors for a real reason (bad SQL, missing
// referenced table, a typo) MUST break the deploy — otherwise it ships broken
// schema and 500s authenticated requests, which is exactly what happened
// twice. So:
//
//   • Idempotent / already-applied errors (42701 column exists, 42P07 relation
//     exists, 42710 duplicate object, 42712 dup alias, 42723 dup function,
//     23505 unique violation on a tracker re-insert) → SAFE-SKIP: warn, continue.
//   • Everything else, including connection failures → FATAL: fail the build.
//
// Log lines are deliberately greppable:
//   [migrate-tolerant] SAFE-SKIP: <code> <message>
//   [migrate-tolerant] FATAL:    <code> <message>
//
// Escape hatch: MIGRATION_STRICT=1 forces even SAFE-SKIP classes to fail
// (useful when you want a hard guarantee the journal/tracker are in sync).

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Postgres SQLSTATE codes that mean "the schema already has this" — safe to
// skip during an idempotent re-run after an out-of-band Neon MCP apply.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
export const SAFE_SKIP_PG_CODES = new Set([
  "42701", // duplicate_column        — ALTER TABLE ADD COLUMN, already exists
  "42P07", // duplicate_table         — CREATE TABLE, relation already exists
  "42710", // duplicate_object        — ADD CONSTRAINT / CREATE TYPE, exists
  "42712", // duplicate_alias
  "42723", // duplicate_function
  "42P06", // duplicate_schema        — CREATE SCHEMA, already exists
  "42P16", // invalid_table_definition (e.g. multiple primary keys re-add)
  "23505", // unique_violation        — re-inserting an existing tracker row
]);

// Postgres SQLSTATE class 08 = connection exceptions. Environmental, not a
// schema problem — these should fail loudly (a deploy with no DB connection
// must not silently "succeed" with un-applied migrations).
function isConnectionError(code) {
  return typeof code === "string" && code.startsWith("08");
}

/**
 * Pure classifier — extracted so it's unit-testable without running a real
 * migration. Maps a Postgres SQLSTATE code to a disposition.
 *
 *   "safe-skip" → the schema already has the object; warn and continue.
 *   "fatal"     → a genuine failure (bad SQL, missing dep, connection error,
 *                 or an unknown/undefined code); break the build.
 *
 * Unknown codes are FATAL on purpose: we only forgive errors we've explicitly
 * recognized as idempotent re-runs. Forgiving-by-default is what caused the
 * outages this script exists to prevent.
 *
 * @param {string|undefined|null} code - Postgres SQLSTATE (e.g. "42701")
 * @returns {"safe-skip"|"fatal"}
 */
export function classifyMigrateError(code) {
  if (!code) return "fatal";
  if (isConnectionError(code)) return "fatal";
  if (SAFE_SKIP_PG_CODES.has(code)) return "safe-skip";
  return "fatal";
}

/**
 * Extract a Postgres SQLSTATE code from drizzle-kit's combined stdout+stderr.
 * drizzle-kit surfaces the underlying pg error; the code shows up as
 * `code: '42701'`, `"code":"42701"`, or a bare 5-char SQLSTATE token. We scan
 * for the first plausible code so the classifier can decide.
 *
 * @param {string} output
 * @returns {string|null}
 */
export function extractPgCode(output) {
  if (!output) return null;
  // `code: '42701'` or code: "42701" or "code":"42701"
  const labeled = output.match(/code['"]?\s*[:=]\s*['"]?([0-9A-Z]{5})\b/);
  if (labeled) return labeled[1];
  // A bare SQLSTATE: 5 chars, digits + uppercase letters, at least one letter
  // OR all digits, e.g. 42701, 42P07, 23505, 08006. Avoid matching plain
  // 5-digit years/ids by requiring it to look like a SQLSTATE class we list
  // OR contain a letter.
  const bare = output.match(/\b(\d{2}[0-9A-Z]{3})\b/);
  if (bare) return bare[1];
  return null;
}

function runMigrate() {
  if (!process.env.DATABASE_URL) {
    console.log("[migrate-tolerant] DATABASE_URL not set — skipping");
    process.exit(0);
  }

  console.log("[migrate-tolerant] running drizzle-kit migrate");
  // Capture output (not inherit) so we can classify the error. We echo it back
  // so the build log still shows drizzle's full output.
  const result = spawnSync("drizzle-kit", ["migrate"], {
    encoding: "utf8",
    shell: true,
  });

  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status === 0) {
    console.log("[migrate-tolerant] migrations applied cleanly");
    process.exit(0);
  }

  const strict = process.env.MIGRATION_STRICT === "1";
  const code = extractPgCode(combined);
  const disposition = classifyMigrateError(code);
  const codeStr = code ?? "(no SQLSTATE found)";
  // Best-effort one-line message for the log.
  const msgLine =
    combined
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /error|fail|exist|violat/i.test(l)) ?? `drizzle-kit migrate exited ${result.status}`;

  if (disposition === "safe-skip" && !strict) {
    console.warn(`[migrate-tolerant] SAFE-SKIP: ${codeStr} ${msgLine}`);
    console.warn(
      "[migrate-tolerant] This error means the schema already has the object — " +
        "expected after an out-of-band Neon MCP apply. Continuing the build.",
    );
    process.exit(0);
  }

  if (disposition === "safe-skip" && strict) {
    console.error(`[migrate-tolerant] FATAL (MIGRATION_STRICT=1): ${codeStr} ${msgLine}`);
    console.error(
      "[migrate-tolerant] Would normally SAFE-SKIP, but strict mode forbids drift. " +
        "Reconcile the journal/__drizzle_migrations before deploying.",
    );
    process.exit(result.status ?? 1);
  }

  // disposition === "fatal"
  console.error(`[migrate-tolerant] FATAL: ${codeStr} ${msgLine}`);
  console.error(
    "[migrate-tolerant] This is NOT an idempotent re-run — a migration errored " +
      "for a real reason (or the DB was unreachable). FAILING THE BUILD so broken " +
      "schema never reaches production. Investigate the SQL above; do not just " +
      "re-deploy.",
  );
  process.exit(result.status && result.status !== 0 ? result.status : 1);
}

// Only run when invoked directly, not when imported by tests (importing must
// have no side effects — otherwise the top-level process.exit kills the test
// runner mid-suite).
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) runMigrate();
