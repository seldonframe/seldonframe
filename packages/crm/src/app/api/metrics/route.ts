import { and, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, intakeForms, landingPages, organizations } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aggregate first-run-chain metrics. Read-only, on-demand (no precomputed
// rollup). At <10k orgs the aggregate query time is negligible; revisit if
// this grows large enough to need a materialized view.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` or `x-cron-secret` header —
// matches the pattern used by `/api/cron/*` routes, which is what operators
// already have access to.

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${configuredSecret}`) return true;

  const cronHeader = request.headers.get("x-cron-secret");
  return cronHeader === configuredSecret;
}

type Window = { label: string; since: Date };

function resolveWindow(request: Request): Window {
  const url = new URL(request.url);
  const raw = url.searchParams.get("window")?.trim() || "30d";
  const days = raw === "7d" ? 7 : raw === "90d" ? 90 : 30;
  return {
    label: `last_${days}d`,
    since: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
  };
}

async function workspaceMetrics(since: Date) {
  const [created] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(organizations)
    .where(gte(organizations.createdAt, since));

  const [createdAnonymous] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(organizations)
    .where(
      and(gte(organizations.createdAt, since), isNull(organizations.ownerId))
    );

  // Anonymous workspaces that have since been claimed (ownerId NOT NULL and
  // parentUserId set at or after createdAt). A claimed-anonymous workspace is
  // one created without an owner then linked later. The proxy: createdAt in
  // window AND ownerId IS NOT NULL AND createdAt < updatedAt (claim updates
  // updatedAt). This slightly over-counts if other updates happened, but
  // under-counts only if claim was synchronous with creation — rare.
  const [claimed] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(organizations)
    .where(
      and(
        gte(organizations.createdAt, since),
        isNotNull(organizations.ownerId),
        sql`${organizations.updatedAt} > ${organizations.createdAt}`
      )
    );

  const createdTotal = created?.n ?? 0;
  const createdAnon = createdAnonymous?.n ?? 0;
  const claimedCount = claimed?.n ?? 0;
  const claimRate =
    createdAnon > 0 ? Number((claimedCount / createdAnon).toFixed(3)) : 0;

  return {
    created: createdTotal,
    created_anonymous: createdAnon,
    claimed: claimedCount,
    claim_rate: claimRate,
  };
}

async function blockMetrics(since: Date) {
  // Block installs live on organizations.enabledBlocks (text[]). We can't
  // directly count "installs per window" from that alone; we approximate by
  // counting orgs that have the block enabled AND were updated in the window.
  const [caldiy] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(organizations)
    .where(
      and(
        gte(organizations.updatedAt, since),
        sql`'caldiy-booking' = ANY(${organizations.enabledBlocks})`
      )
    );

  const [formbricks] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(organizations)
    .where(
      and(
        gte(organizations.updatedAt, since),
        sql`'formbricks-intake' = ANY(${organizations.enabledBlocks})`
      )
    );

  return {
    caldiy_installs: caldiy?.n ?? 0,
    formbricks_installs: formbricks?.n ?? 0,
  };
}

async function customizerMetrics(since: Date) {
  // Customizer calls don't have their own event table yet. We approximate
  // "landing updated" by counting landing_pages rows with source='mcp-typed'
  // updated in the window, and "intake customized" similarly for intake_forms
  // updated in the window (intake doesn't have a source tag yet but all
  // non-default edits are typed-customizer writes). Bookings customizer edits
  // the template row — count bookings of status='template' updated in window.
  const [landing] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(landingPages)
    .where(
      and(gte(landingPages.updatedAt, since), eq(landingPages.source, "mcp-typed"))
    );

  const [intake] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(intakeForms)
    .where(gte(intakeForms.updatedAt, since));

  const [booking] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(
      and(gte(bookings.updatedAt, since), eq(bookings.status, "template"))
    );

  return {
    landing_updates: landing?.n ?? 0,
    intake_customizes: intake?.n ?? 0,
    booking_configures: booking?.n ?? 0,
  };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const window = resolveWindow(request);

  const [workspaces, blocks, customizers] = await Promise.all([
    workspaceMetrics(window.since),
    blockMetrics(window.since),
    customizerMetrics(window.since),
  ]);

  return NextResponse.json({
    ok: true,
    window: window.label,
    since: window.since.toISOString(),
    at: new Date().toISOString(),
    workspaces,
    blocks,
    customizers,
  });
}
