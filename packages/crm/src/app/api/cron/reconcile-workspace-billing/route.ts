// /api/cron/reconcile-workspace-billing — nightly per-active-workspace
// billing reconcile (Phase 4, 2026-06-18 pricing migration).
//
// The Agency tier bills $10/mo per LIVE client workspace beyond the 10
// included. The live-sync hooks (landing publish/unpublish + workspace
// archive/delete) push that quantity in real time, but they're
// best-effort fire-and-forget — a missed hook, a Stripe blip, or a
// workspace published via a path we don't instrument would leave the
// overage quantity stale. This cron is the SAFETY NET: every night it
// recomputes max(0, activeWorkspaces − includedWorkspaces) for every
// Agency org and pushes the corrected quantity to Stripe.
//
// Idempotent: syncAgencyWorkspaceQuantity SKIPS the Stripe call when the
// quantity is unchanged (compares the target against the last-synced
// quantity stored on organizations.subscription), so a steady-state run
// makes zero Stripe writes.
//
// Auth: mirrors /api/cron/report-contact-usage + /api/cron/automations —
// Authorization: Bearer <CRON_SECRET> OR x-cron-secret header. When
// CRON_SECRET is unset (local/dev), the route is open (same as the
// other crons).
//
// Schedule: registered in vercel.json at "30 2 * * *" (daily 02:30 UTC),
// just after report-contact-usage (02:00) so the two billing sweeps
// don't double up DB load.

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { syncAgencyWorkspaceQuantity } from "@/lib/billing/workspace-billing";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) return true;
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${configuredSecret}`) return true;
  const cronHeader = request.headers.get("x-cron-secret");
  return cronHeader === configuredSecret;
}

async function run() {
  const startedAt = Date.now();

  // Every org whose subscription is tier=agency AND carries an active
  // Stripe subscription id. Filter in SQL on the jsonb fields so we don't
  // pull every org. (syncAgencyWorkspaceQuantity re-validates the gate
  // defensively, so a slightly-stale filter is harmless.)
  const agencyOrgs = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
    })
    .from(organizations)
    .where(
      sql`(${organizations.subscription}->>'tier') = 'agency' AND (${organizations.subscription}->>'stripeSubscriptionId') IS NOT NULL`
    );

  let created = 0;
  let updated = 0;
  let noop = 0;
  let skipped = 0;
  let failed = 0;
  const adjustments: Array<{ orgId: string; slug: string | null; action: string; quantity: number }> = [];

  for (const org of agencyOrgs) {
    try {
      const result = await syncAgencyWorkspaceQuantity(org.id);
      switch (result.action) {
        case "created":
          created += 1;
          break;
        case "updated":
          updated += 1;
          break;
        case "noop":
          noop += 1;
          break;
        case "skipped":
          skipped += 1;
          break;
        case "error":
          failed += 1;
          break;
      }
      if (result.action === "created" || result.action === "updated") {
        adjustments.push({
          orgId: org.id,
          slug: org.slug ?? null,
          action: result.action,
          quantity: result.quantity,
        });
      }
    } catch (err) {
      // syncAgencyWorkspaceQuantity already swallows Stripe errors, but
      // guard the loop so one bad org never aborts the whole sweep.
      failed += 1;
      console.error(
        "[cron.reconcile-workspace-billing] failed for org",
        {
          orgId: org.id,
          error: err instanceof Error ? err.message : String(err),
        }
      );
    }
  }

  return {
    ok: true,
    tickMs: Date.now() - startedAt,
    scanned: agencyOrgs.length,
    created,
    updated,
    noop,
    skipped,
    failed,
    // First 50 quantity adjustments surfaced for quick eyeballing in
    // Vercel function logs; trimmed to stay under the log size cap.
    adjustments: adjustments.slice(0, 50),
  };
}

// Vercel cron scheduler hits the route via GET by default; also accept
// POST so the dashboard "Run now" button + manual curl probes work.
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
