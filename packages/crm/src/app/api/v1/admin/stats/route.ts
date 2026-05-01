// May 1, 2026 — Measurement Layer 1: admin stats endpoint.
//
// Single read-only JSON endpoint returning the cross-workspace
// metrics that matter pre-launch and through the first 100 users.
// Protected by SELDONFRAME_ADMIN_EMAIL — only the configured admin
// email can hit it. Falls back to maximehoule100@gmail.com when env
// is unset (so local dev works without extra config).
//
// Curl-friendly. Run from a browser logged in as the admin, or from
// CI with a session cookie. The visual /admin/stats page can come
// later (build at 100+ workspaces when trend analysis matters).
//
// Layered queries:
//   - Workspace metrics: counts, by-plan distribution, today / week
//     creation, 7-day active definition (any contact created in
//     the workspace in the last 7 days).
//   - Cross-workspace totals: contacts, deals, pipeline value, agent
//     runs this month.
//   - Today's funnel: intake submissions, bookings.
//
// Performance: every query runs in parallel via Promise.all. The
// expensive ones are bound by indexes that already exist
// (organizations.created_at idx + workflow_runs_org_created_idx).

import { NextResponse } from "next/server";
import { and, count, gte, ne, sum } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  bookings,
  contacts,
  deals,
  formSubmissions,
  organizations,
  seldonframeEvents,
  workflowRuns,
} from "@/db/schema";

function getAdminEmail(): string {
  return (
    process.env.SELDONFRAME_ADMIN_EMAIL?.trim() ||
    "maximehoule100@gmail.com"
  );
}

export async function GET() {
  const session = await auth();
  const sessionEmail = session?.user?.email?.toLowerCase().trim() ?? null;
  const adminEmail = getAdminEmail().toLowerCase();

  if (!sessionEmail || sessionEmail !== adminEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalWorkspacesRow,
    workspacesByPlanRows,
    totalContactsRow,
    totalDealsRow,
    totalDealValueRow,
    agentRunsMonthRow,
    createdTodayRow,
    createdWeekRow,
    activeWorkspacesRows,
    intakeTodayRow,
    bookingsTodayRow,
    eventsTodayRows,
  ] = await Promise.all([
    db.select({ c: count() }).from(organizations),
    db
      .select({ plan: organizations.plan, c: count() })
      .from(organizations)
      .groupBy(organizations.plan),
    db.select({ c: count() }).from(contacts),
    db.select({ c: count() }).from(deals),
    db
      .select({ total: sum(deals.value) })
      .from(deals)
      .where(ne(deals.stage, "lost")),
    db
      .select({ c: count() })
      .from(workflowRuns)
      .where(gte(workflowRuns.createdAt, monthStart)),
    db
      .select({ c: count() })
      .from(organizations)
      .where(gte(organizations.createdAt, todayStart)),
    db
      .select({ c: count() })
      .from(organizations)
      .where(gte(organizations.createdAt, weekAgo)),
    // Active = any contact created in the workspace in the last 7
    // days (cheap proxy for "the workspace is being used"). This
    // matches the spec; a richer definition (contact || booking ||
    // deal-update || agent-run in last 7d) can replace this once
    // the spec itself catches up.
    db
      .selectDistinct({ orgId: contacts.orgId })
      .from(contacts)
      .where(gte(contacts.createdAt, weekAgo)),
    db
      .select({ c: count() })
      .from(formSubmissions)
      .where(gte(formSubmissions.createdAt, todayStart)),
    db
      .select({ c: count() })
      .from(bookings)
      .where(
        and(
          gte(bookings.createdAt, todayStart),
          ne(bookings.status, "template")
        )
      ),
    // Today's product-event roll-up (Layer 2). Funnel-at-a-glance
    // sliced by event name so we can spot regressions in real time.
    db
      .select({
        event: seldonframeEvents.event,
        c: count(),
      })
      .from(seldonframeEvents)
      .where(gte(seldonframeEvents.createdAt, todayStart))
      .groupBy(seldonframeEvents.event),
  ]);

  const eventsToday: Record<string, number> = {};
  for (const row of eventsTodayRows) {
    eventsToday[row.event] = Number(row.c ?? 0);
  }

  const workspacesByPlan: Record<string, number> = {};
  for (const row of workspacesByPlanRows) {
    workspacesByPlan[row.plan ?? "free"] = Number(row.c ?? 0);
  }

  // The deals.value column is decimal(...). Postgres returns it as a
  // string; we convert to a number so the JSON consumer doesn't have
  // to. Pipeline value is reported in dollars (the column's unit) —
  // multiply by 100 if a downstream consumer needs cents.
  const totalPipelineValueDollars = Number(totalDealValueRow[0]?.total ?? 0);

  return NextResponse.json({
    timestamp: now.toISOString(),

    // Workspace metrics
    total_workspaces: Number(totalWorkspacesRow[0]?.c ?? 0),
    workspaces_by_plan: workspacesByPlan,
    workspaces_created_today: Number(createdTodayRow[0]?.c ?? 0),
    workspaces_created_this_week: Number(createdWeekRow[0]?.c ?? 0),
    active_workspaces_7d: activeWorkspacesRows.length,

    // Cross-workspace totals
    total_contacts_all_workspaces: Number(totalContactsRow[0]?.c ?? 0),
    total_deals: Number(totalDealsRow[0]?.c ?? 0),
    total_pipeline_value_dollars: totalPipelineValueDollars,
    total_pipeline_value_cents: Math.round(totalPipelineValueDollars * 100),
    total_agent_runs_this_month: Number(agentRunsMonthRow[0]?.c ?? 0),

    // Today's activity
    intake_submissions_today: Number(intakeTodayRow[0]?.c ?? 0),
    bookings_today: Number(bookingsTodayRow[0]?.c ?? 0),

    // Layer 2 product-event roll-up (today)
    events_today: eventsToday,
  });
}

// Keep this route off the static prerender. The data it returns is
// always live counts.
export const dynamic = "force-dynamic";
