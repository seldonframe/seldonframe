// Per-sub-account usage meter (2026-07-08) — Task 3: the daily cap-breach
// sweep. Copies the shape of api/cron/gc-seldonchat-blobs/route.ts: CRON_SECRET
// fail-closed auth, ?dryRun=1, registered in vercel.json alongside the other
// crons. All business logic lives in lib/billing/usage-cap.ts::checkUsageCapBreaches
// (unit-tested with DI fakes, no DB) — this route only wires the real DB reads
// + the real email send.
//
// Spec: docs/superpowers/specs/2026-07-08-subaccount-usage-meter-design.md (D5).
// Schedule: registered in vercel.json at "0 7 * * *" (daily 07:00 UTC).

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { agentConversations, organizations, partnerAgencies } from "@/db/schema";
import { checkUsageCapBreaches, resolveAgencyNotifyTarget, type CapCandidateOrg } from "@/lib/billing/usage-cap";
import { sendUsageCapAlert } from "@/lib/notifications/ops-notifications";

export const runtime = "nodejs";

let warnedMissingSecret = false;

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    if (!warnedMissingSecret) {
      console.warn(
        "[usage-caps] CRON_SECRET is unset — fail-closed, denying all requests. This route reads billing settings and sends emails and must not run unauthenticated."
      );
      warnedMissingSecret = true;
    }
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${configuredSecret}`) {
    return true;
  }

  const cronHeader = request.headers.get("x-cron-secret");
  return cronHeader === configuredSecret;
}

function parseDryRun(request: Request): boolean {
  const url = new URL(request.url);
  const value = url.searchParams.get("dryRun");
  return value === "1" || value === "true";
}

async function listOrgsWithCapSet(): Promise<CapCandidateOrg[]> {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      parentAgencyId: organizations.parentAgencyId,
      settings: organizations.settings,
    })
    .from(organizations)
    .where(sql`${organizations.settings} -> 'usageCap' IS NOT NULL`);

  return rows.map((r) => ({
    orgId: r.id,
    orgName: r.name,
    orgSlug: r.slug,
    parentAgencyId: r.parentAgencyId,
    settings: r.settings,
  }));
}

async function getEstCostCentsForOrg(orgId: string, periodStart: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${agentConversations.llmCostCents}), 0)::int` })
    .from(agentConversations)
    .where(and(eq(agentConversations.orgId, orgId), gte(agentConversations.startedAt, periodStart)));
  return Number(row?.total ?? 0);
}

// Owner-email chain (incl. the workspace-owned-agency fallback) is shared
// with the capped-turn notify path — usage-cap.ts::resolveAgencyNotifyTarget.
async function resolveAgencyOwnerEmail(agencyId: string): Promise<string | null> {
  const target = await resolveAgencyNotifyTarget(agencyId);
  return target?.toEmail ?? null;
}

async function resolveAgencyName(agencyId: string): Promise<string | null> {
  const [agency] = await db
    .select({ name: partnerAgencies.name })
    .from(partnerAgencies)
    .where(eq(partnerAgencies.id, agencyId))
    .limit(1);
  return agency?.name ?? null;
}

async function markNotified(orgId: string, settings: Record<string, unknown>): Promise<void> {
  await db
    .update(organizations)
    .set({ settings, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}

async function run(request: Request) {
  const dryRun = parseDryRun(request);

  return checkUsageCapBreaches(
    {
      listOrgsWithCapSet,
      getEstCostCentsForOrg,
      resolveAgencyOwnerEmail,
      resolveAgencyName,
      sendAlert: async (params) => {
        await sendUsageCapAlert(params);
      },
      markNotified: async (orgId, settings) => {
        await markNotified(orgId, settings);
      },
      now: () => new Date(),
    },
    { dryRun },
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await run(request));
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await run(request));
}
