#!/usr/bin/env sh
# Self-host schema provisioning for docker-compose.
#
# Why not `drizzle-kit migrate`? Two reasons:
#   1. drizzle-kit bundles the Neon serverless driver, which only talks to a
#      remote Neon endpoint over WebSocket — it can't reach a local Postgres.
#   2. 44 of the repo's migrations were applied to production out-of-band and
#      are absent from the journal, so a journal-based migrator leaves a fresh
#      database missing schema.
#
# So we apply the CURRENT schema directly instead: `drizzle-kit export` emits
# the full DDL offline (no driver, no journal), and psql loads it over a plain
# TCP connection. Idempotent — if the schema is already present, do nothing.
set -e
cd packages/crm

: "${DATABASE_URL:?DATABASE_URL is required}"

if [ "$(psql "$DATABASE_URL" -tAc "SELECT to_regclass('public.organizations') IS NOT NULL")" = "t" ]; then
  echo "[docker-migrate] schema already present — nothing to do."
  exit 0
fi

echo "[docker-migrate] fresh database — applying current schema…"
node_modules/.bin/drizzle-kit export --dialect=postgresql --schema=./src/db/schema/index.ts > /tmp/schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/schema.sql
echo "[docker-migrate] applied $(grep -c 'CREATE TABLE' /tmp/schema.sql) tables."
