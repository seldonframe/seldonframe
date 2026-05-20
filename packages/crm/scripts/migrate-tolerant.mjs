#!/usr/bin/env node
// packages/crm/scripts/migrate-tolerant.mjs
//
// 2026-05-20 — Tolerant wrapper around `drizzle-kit migrate` for Vercel builds.
//
// Why this exists: production DB migrations are applied out-of-band via the
// Neon MCP (prepare_database_migration + complete_database_migration). The
// drizzle journal + __drizzle_migrations tracker can drift from reality when
// migrations are applied that way — for example, when 0049_proposals.sql is
// committed to a feature branch and applied to prod via Neon MCP, but main
// still doesn't know about it.
//
// On the next Vercel build, `drizzle-kit migrate` sees the drift and errors
// trying to re-apply migrations whose tables already exist. The build dies.
// That's the wrong tradeoff: schema is healthy in prod, but the deploy fails.
//
// This wrapper:
//   1. Skips when DATABASE_URL is missing (matches the prior behavior).
//   2. Runs `drizzle-kit migrate` and captures its exit code.
//   3. On non-zero exit, logs the stderr clearly and exits 0 anyway so the
//      Vercel build proceeds. Migration failures are surfaced loudly in the
//      build log; operators investigate via Neon MCP, not by re-deploying.
//
// This is intentionally a soft-fail. If you want strict mode (fail the deploy
// on migration errors), set `MIGRATION_STRICT=1` in env.

import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.log("[migrate-tolerant] DATABASE_URL not set — skipping");
  process.exit(0);
}

console.log("[migrate-tolerant] running drizzle-kit migrate");
const result = spawnSync("drizzle-kit", ["migrate"], {
  stdio: "inherit",
  shell: true,
});

if (result.status === 0) {
  console.log("[migrate-tolerant] migrations applied cleanly");
  process.exit(0);
}

const strict = process.env.MIGRATION_STRICT === "1";

if (strict) {
  console.error(
    `[migrate-tolerant] STRICT mode: drizzle-kit migrate failed with exit ${result.status}. Failing the build.`,
  );
  process.exit(result.status ?? 1);
}

console.warn(
  `[migrate-tolerant] drizzle-kit migrate exited ${result.status}. ` +
    `Continuing build anyway because migrations may have been applied ` +
    `out-of-band via Neon MCP. If this build is broken at runtime, run ` +
    `the failing migration manually via Neon MCP and verify __drizzle_migrations.`,
);
process.exit(0);
