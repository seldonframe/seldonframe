import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://user:pass@localhost:5432/seldon_frame?sslmode=require";

// Self-hosting escape hatch. In production SeldonFrame runs on Neon, whose
// serverless driver speaks SQL-over-HTTPS to `<host>/sql`. A self-hoster
// pointing DATABASE_URL at a plain Postgres has no such endpoint — so the
// docker-compose stack runs the Neon local HTTP proxy in front of Postgres,
// and this block redirects the driver's fetch to it. Gated on NEON_LOCAL_HOST:
// unset in production, so prod behaviour is byte-identical.
if (process.env.NEON_LOCAL_HOST) {
  const host = process.env.NEON_LOCAL_HOST;
  const port = process.env.NEON_LOCAL_PORT ?? "4444";
  neonConfig.fetchEndpoint = `http://${host}:${port}/sql`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.poolQueryViaFetch = true;
}

const sql = neon(databaseUrl);

export const db = drizzle(sql, { schema, casing: "snake_case" });

export type DbClient = typeof db;
