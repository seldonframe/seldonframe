// /api/cron/report-contact-usage — nightly snapshot of contact counts
//
// April 30, 2026 — usage-based billing rollout. The Stripe contacts
// meter (`seldonframe_contacts`) uses LAST aggregation, so we fire a
// meter event per workspace per night with the current contact count.
// Stripe stores the latest value and bills against it on the
// subscription's billing window.
//
// Scope:
//   - Walk every org with a Stripe customer id (= every paid workspace).
//   - For each, query the current contact count from our DB.
//   - Emit one meter event with the snapshot value.
//   - Best-effort: failures log + continue. The next night picks up.
//
// Schedule: 02:00 UTC daily (configured in vercel.json). Runs after
// the metrics-snapshot cron so we don't double-up DB load on the
// /admin dashboard ingest path.

import { NextResponse } from "next/server";
import { isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { reportContactCount } from "@/lib/billing/meters";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) return true;
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${configuredSecret}`) return true;
  const cronHeader = request.headers.get("x-cron-secret");
  return cronHeader === configuredSecret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  // Pull every org that's claimed under a Stripe customer. The query
  // filters on subscription->>'stripeCustomerId' being set; we don't
  // know which paid tier they're on but reportContactCount handles
  // the no-customer case defensively.
  const orgs = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      // Subscription is jsonb; extract the customer id via SQL so we
      // can filter for non-null without pulling every row.
      stripeCustomerId: sql<string | null>`(${organizations.subscription}->>'stripeCustomerId')`,
    })
    .from(organizations)
    .where(isNotNull(sql`(${organizations.subscription}->>'stripeCustomerId')`));

  let reported = 0;
  let skipped = 0;
  let failed = 0;
  const counts: Array<{ orgId: string; slug: string | null; count: number }> = [];

  for (const org of orgs) {
    if (!org.stripeCustomerId) {
      skipped += 1;
      continue;
    }
    try {
      const result = await reportContactCount(org.id);
      counts.push({ orgId: org.id, slug: org.slug ?? null, count: result.count });
      if (result.reported) {
        reported += 1;
      } else {
        skipped += 1;
      }
    } catch (err) {
      failed += 1;
      console.error("[cron.report-contact-usage] failed for org", {
        orgId: org.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    tickMs: Date.now() - startedAt,
    scanned: orgs.length,
    reported,
    skipped,
    failed,
    // First 50 counts surfaced for quick eyeballing in Vercel function
    // logs. Trimmed to keep the response under the log size cap.
    samples: counts.slice(0, 50),
  });
}
