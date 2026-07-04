import { and, isNull, lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { deleteExpiredTasteSessions } from "@/lib/marketplace/taste/taste-session-store";
import { webUngatedGcCutoff } from "@/lib/web-build/gc-cutoffs";
import { WEB_UNGATED_ORIGIN } from "@/lib/web-build/policy";

export const runtime = "nodejs";

// Deletes anonymous workspaces (ownerId IS NULL) that have not been claimed
// within 30 days. Cascading FKs on 26 child tables clean up all related rows
// automatically — confirmed by schema audit. No manual child deletion needed.
//
// Auth: mirrors the pattern used by /api/cron/automations and /api/cron/brain-compile
// (Authorization: Bearer <CRON_SECRET> OR x-cron-secret header).
//
// Schedule: registered in vercel.json at "0 4 * * *" (daily 04:00 UTC),
// offset from brain-compile at 03:00 to avoid concurrent DB pressure.

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${configuredSecret}`) {
    return true;
  }

  const cronHeader = request.headers.get("x-cron-secret");
  return cronHeader === configuredSecret;
}

async function run() {
  const cutoff = new Date(Date.now() - TTL_MS);

  const deleted = await db
    .delete(organizations)
    .where(
      and(isNull(organizations.ownerId), lt(organizations.createdAt, cutoff))
    )
    .returning({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      createdAt: organizations.createdAt,
    });

  // Structured per-deletion audit log — one line per row so the JSON is easy
  // to grep in Vercel logs and ingest into a dashboard later.
  for (const row of deleted) {
    console.info(
      JSON.stringify({
        event: "orphan_workspace_deleted",
        at: new Date().toISOString(),
        org_id: row.id,
        slug: row.slug,
        name: row.name,
        created_at: row.createdAt.toISOString(),
        cutoff: cutoff.toISOString(),
      })
    );
  }

  // Second pass: tighter 7-day GC for unclaimed web_ungated workspaces.
  // These are more ephemeral (anonymous one-click builds) and should not
  // accumulate as long as general orphans.
  const webUngatedCutoff = webUngatedGcCutoff(new Date());
  const webUngatedDeleted = await db
    .delete(organizations)
    .where(
      and(
        isNull(organizations.ownerId),
        lt(organizations.createdAt, webUngatedCutoff),
        sql`${organizations.settings} ->> 'origin' = ${WEB_UNGATED_ORIGIN}`
      )
    )
    .returning({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      createdAt: organizations.createdAt,
    });

  for (const row of webUngatedDeleted) {
    console.info(
      JSON.stringify({
        event: "web_ungated_workspace_gc",
        at: new Date().toISOString(),
        org_id: row.id,
        slug: row.slug,
        name: row.name,
        created_at: row.createdAt.toISOString(),
        cutoff: webUngatedCutoff.toISOString(),
      })
    );
  }

  console.info(
    JSON.stringify({
      event: "orphan_workspace_ttl_completed",
      at: new Date().toISOString(),
      deleted_count: deleted.length,
      web_ungated_deleted_count: webUngatedDeleted.length,
      cutoff: cutoff.toISOString(),
      web_ungated_cutoff: webUngatedCutoff.toISOString(),
    })
  );

  // Taste mode hygiene sweep (design D9) — piggybacked on this existing
  // TTL-cleanup cron rather than a new schedule. Correctness never depends on
  // this: getTasteSession independently checks expires_at on every read, so a
  // sweep failure only delays row deletion, never causes a stale grounding to
  // be served past its TTL.
  try {
    await deleteExpiredTasteSessions(new Date());
  } catch (err) {
    console.error(
      `[cron/orphan-workspace-ttl] taste_session_sweep_error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return {
    ok: true,
    deleted_count: deleted.length,
    web_ungated_deleted_count: webUngatedDeleted.length,
    cutoff: cutoff.toISOString(),
    web_ungated_cutoff: webUngatedCutoff.toISOString(),
    deleted_ids: deleted.map((d) => d.id),
    web_ungated_deleted_ids: webUngatedDeleted.map((d) => d.id),
  };
}

// Vercel cron scheduler hits the route via GET by default; also accept POST
// so the Vercel dashboard "Run now" button and manual curl probes work.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await run());
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await run());
}
