// src/db/rls.ts — Postgres RLS Phase 1 context mechanism
// (spec docs/superpowers/specs/2026-07-03-postgres-rls-defense-in-depth-design.md, D1).
//
// Policies on RLS-covered tables key on current_setting('app.org_id', true).
// The existing driver (drizzle-orm/neon-http, src/db/index.ts) does one HTTP
// round-trip per statement with NO session, so `SET LOCAL` has nothing to
// attach to. withOrgRls is the ONE place that opens a real session (the Neon
// WebSocket driver, drizzle-orm/neon-serverless) for RLS-covered code paths:
// it validates orgId as a UUID, opens a transaction, sets the tenant context
// with `SET LOCAL` (via set_config's third arg = true, which scopes the
// setting to the current transaction — it is gone the instant the tx ends,
// so there is no leakage across a pooled connection's next borrower), and
// hands fn a tx-bound drizzle instance.
//
// INERT-WITHOUT-ENV (the SeldonFrame flag pattern — same shape as
// voiceManagedEnabled/SF_VOICE_MANAGED): when DATABASE_URL_APP is unset,
// withOrgRls runs fn against the EXISTING neon-http `db` directly — no pool,
// no transaction, no set_config, byte-identical to pre-Phase-1 behavior.
// Enabling RLS enforcement in prod is a pure env addition in Vercel; no
// migration, deploy, or code change is required at flip-time, and flipping
// it back off (unsetting the var) is an equally instant rollback.
//
// DATABASE_URL stays the service/owner connection string (unchanged,
// BYPASSRLS via the seldonframe_service role) — nothing on that path
// breaks. DATABASE_URL_APP is a SEPARATE, ADDITIVE connection string that
// authenticates as seldonframe_app (RLS enforced, no BYPASSRLS). Both
// roles + both connection strings are provisioned by Max in the Neon
// console (see the runbook in drizzle/0062_wallet_rls.sql's header comment)
// — this file never creates a role or a credential.

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import ws from "ws";
import * as schema from "./schema";
import { db as passthroughDb } from "./index";

// The Neon serverless Pool needs a WebSocket implementation on Node runtimes
// that don't expose a global WebSocket (pre-22). `ws` is already a repo
// dependency (used by the voice realtime client) — reusing it here means
// this works regardless of the exact Node minor version Vercel runs.
neonConfig.webSocketConstructor = ws;

// Driver-agnostic handle. The neon-http default `db` and the
// neon-serverless transaction client parameterize PgDatabase with
// DIFFERENT query-result HKTs; a union of the two collapses drizzle's
// fielded .returning() overload to the zero-arg form (TS2554). Erasing
// the HKT slot keeps full schema-aware query building on both drivers.
export type RlsDb = PgDatabase<any, typeof schema>;

/** Thrown when orgId is not a well-formed UUID. Thrown BEFORE any connection
 *  is opened or any SQL is built — an invalid orgId must never reach a query. */
export class InvalidOrgIdError extends Error {
  readonly code = "INVALID_ORG_ID";
  constructor(orgId: string) {
    super(`withOrgRls: orgId is not a valid UUID: ${JSON.stringify(orgId)}`);
    this.name = "InvalidOrgIdError";
  }
}

// Matches the house idiom in src/app/api/v1/forms/[id]/route.ts:24.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(orgId: string): void {
  if (typeof orgId !== "string" || !UUID_REGEX.test(orgId)) {
    throw new InvalidOrgIdError(orgId);
  }
}

// Lazily constructed — a single Pool is reused across calls when the
// enforced path is active, rather than opening a fresh pool per call.
let enforcedPool: Pool | null = null;

function getEnforcedPool(databaseUrlApp: string): Pool {
  if (!enforcedPool) {
    enforcedPool = new Pool({ connectionString: databaseUrlApp });
  }
  return enforcedPool;
}

/**
 * Run `fn` with tenant context `orgId` established for every RLS-covered
 * query it issues.
 *
 * ENFORCED (DATABASE_URL_APP set): opens a transaction on the Neon
 * WebSocket driver, runs `select set_config('app.org_id', $1, true)` inside
 * that transaction (the `true` third arg = SET LOCAL semantics — scoped to
 * the transaction, gone when it ends), then calls `fn(tx)`. The whole thing
 * is wrapped in the driver's transaction() so a thrown error inside fn rolls
 * back cleanly and the pool connection is released back to the pool either way.
 *
 * INERT (DATABASE_URL_APP unset): calls `fn(passthroughDb)` directly — the
 * exact same `db` every other module in this codebase already imports from
 * `@/db`. No pool is opened, no transaction, no set_config. This is the
 * default in every environment until Max sets the var in Vercel.
 *
 * orgId is validated as a UUID in BOTH paths, before either branch runs —
 * an invalid orgId must never reach a query in the inert path either
 * (defense in depth: the app-layer scoping invariant still applies there).
 */
export async function withOrgRls<T>(
  orgId: string,
  fn: (tx: RlsDb) => Promise<T>,
): Promise<T> {
  assertUuid(orgId);

  const databaseUrlApp = process.env.DATABASE_URL_APP;
  if (!databaseUrlApp) {
    return fn(passthroughDb);
  }

  const pool = getEnforcedPool(databaseUrlApp);
  // IMPORTANT: drizzle(pool, …) round-robins queries across the pool's
  // connections — it does NOT pin every query from one drizzle instance to
  // one physical connection. If we built `tx` from the pool directly, the
  // set_config('app.org_id', …) below could land on connection #1 while
  // fn(tx)'s queries run on connection #2, silently losing the tenant
  // context (SET LOCAL is per-session — it does not exist on any OTHER
  // connection). To guarantee fn's queries see the SAME session the
  // set_config ran on, we check out ONE client from the pool ourselves and
  // build `tx` from THAT client, not from the pool.
  const client = await pool.connect();
  const tx = drizzle(client, { schema, casing: "snake_case" });

  try {
    await client.query("BEGIN");
    await client.query("select set_config('app.org_id', $1, true)", [orgId]);
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
