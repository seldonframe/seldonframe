// 2026-05-17 — Notifications feed (bell icon backend).
//
// First-principles design: rather than add a new `notifications` table
// + trigger writes from every code path that creates a submission /
// booking / eval, this aggregates from the source-of-truth tables
// (intake_submissions, bookings, agent_evals) at read time. Reasons:
//
//   1. Schema cost zero. No migration, no backfill.
//   2. No risk of dual-write skew (notifications row + source row
//      diverging when a code path forgets to insert both).
//   3. localStorage handles "read" state per-user-per-device — fine
//      for an MVP "have I looked at the bell today" UX. If we later
//      want cross-device read state we add a notifications_read table
//      keyed by (user_id, source_type, source_id).
//
// Sources, in order of recency:
//   - intake_submissions  → "New lead from {form name}"
//   - bookings            → "{name} booked {appointment type}"
//                           (status='scheduled', createdAt within window)
//   - agent_evals         → "Eval failure on {agent name}"
//                           (passed=false, ranAt within window)
//
// Scope: only orgs the user has access to (parent_user_id, owner_id,
// org_members, or users.org_id). Same access predicate as
// listManagedOrganizations() so agency operators see notifications
// across all their client workspaces in one feed.
//
// Returned shape is a flat union — the consumer (Bell popover) maps
// `type` to an icon + link. Window: last 14 days, hard cap 20 rows
// across all sources (most-recent-first).

import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agentEvals,
  agents,
  bookings,
  contacts,
  intakeForms,
  intakeSubmissions,
  orgMembers,
  organizations,
  users,
} from "@/db/schema";

const NOTIFICATION_WINDOW_DAYS = 14;
const MAX_NOTIFICATIONS = 20;

/**
 * Unified notification shape. Each item links to where the operator
 * can act on it (the submission row, the booking detail page, or the
 * eval list filtered to the failing run).
 */
export type NotificationItem = {
  /** Stable id of the source row (intake_submissions.id / bookings.id /
   *  agent_evals.id) prefixed with the type so duplicates across types
   *  can't collide in React lists. */
  id: string;
  type: "intake_submission" | "booking" | "agent_eval_failure";
  title: string;
  body: string;
  /** Path to navigate to when the operator clicks the row. The bell
   *  popover wraps each item in an <a href>. */
  href: string;
  /** ISO 8601 timestamp the source row was created at. Used for
   *  ordering AND for the "X minutes/hours ago" display string. */
  createdAt: string;
  /** Workspace name + slug so the operator can tell which client this
   *  came from when looking across multiple workspaces. Slug used for
   *  the workspace flip URL when the operator is on the wrong workspace. */
  workspaceName: string;
  workspaceSlug: string;
};

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns notifications for every workspace the user has access to,
 * most-recent-first, capped at MAX_NOTIFICATIONS. The Bell component
 * filters this into "unread" vs "read" client-side via localStorage.
 *
 * Returns [] for synthetic session ids (admin-token sentinel,
 * operator-portal session id) — those sessions are workspace-scoped
 * and the bell falls back to the no-op state.
 */
export async function getNotificationFeed(
  userId: string | null | undefined,
  userOrgId: string | null | undefined,
): Promise<NotificationItem[]> {
  if (!userId || !UUID_SHAPE.test(userId)) {
    return [];
  }

  // Same access predicate as listManagedOrganizations() —
  // parent_user_id, owner_id, org_members membership, or the user's
  // primary org. This is the right set of workspaces for an "all my
  // workspaces" notification feed.
  const membershipRows = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, userId));
  const membershipOrgIds = membershipRows.map((row) => row.orgId);

  const orConditions = [
    eq(organizations.parentUserId, userId),
    eq(organizations.ownerId, userId),
  ];
  if (membershipOrgIds.length > 0) {
    orConditions.push(inArray(organizations.id, membershipOrgIds));
  }
  if (userOrgId && UUID_SHAPE.test(userOrgId)) {
    orConditions.push(eq(organizations.id, userOrgId));
  }

  const orgRows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
    })
    .from(organizations)
    .where(or(...orConditions));

  if (orgRows.length === 0) {
    return [];
  }

  const orgIds = orgRows.map((row) => row.id);
  const orgById = new Map(orgRows.map((row) => [row.id, row]));

  const windowStart = new Date(Date.now() - NOTIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // ─── Source 1: intake submissions ──────────────────────────────
  const submissionRows = await db
    .select({
      id: intakeSubmissions.id,
      orgId: intakeSubmissions.orgId,
      formId: intakeSubmissions.formId,
      formName: intakeForms.name,
      formSlug: intakeForms.slug,
      data: intakeSubmissions.data,
      createdAt: intakeSubmissions.createdAt,
    })
    .from(intakeSubmissions)
    .leftJoin(intakeForms, eq(intakeForms.id, intakeSubmissions.formId))
    .where(
      and(
        inArray(intakeSubmissions.orgId, orgIds),
        gte(intakeSubmissions.createdAt, windowStart),
      ),
    )
    .orderBy(desc(intakeSubmissions.createdAt))
    .limit(MAX_NOTIFICATIONS);

  // ─── Source 2: bookings (real scheduled appointments) ──────────
  // Excludes templates (status='template') and anything cancelled.
  const bookingRows = await db
    .select({
      id: bookings.id,
      orgId: bookings.orgId,
      title: bookings.title,
      fullName: bookings.fullName,
      email: bookings.email,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      startsAt: bookings.startsAt,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .leftJoin(contacts, eq(contacts.id, bookings.contactId))
    .where(
      and(
        inArray(bookings.orgId, orgIds),
        eq(bookings.status, "scheduled"),
        gte(bookings.createdAt, windowStart),
      ),
    )
    .orderBy(desc(bookings.createdAt))
    .limit(MAX_NOTIFICATIONS);

  // ─── Source 3: failed agent evals ──────────────────────────────
  // Operator probably wants to know when their chatbot starts failing
  // its test suite (something they changed broke it, or a new pricing
  // fact slipped in that the agent can't quote).
  const evalRows = await db
    .select({
      id: agentEvals.id,
      orgId: agents.orgId,
      agentName: agents.name,
      agentId: agentEvals.agentId,
      scenarioId: agentEvals.scenarioId,
      error: agentEvals.error,
      ranAt: agentEvals.ranAt,
    })
    .from(agentEvals)
    .innerJoin(agents, eq(agents.id, agentEvals.agentId))
    .where(
      and(
        inArray(agents.orgId, orgIds),
        eq(agentEvals.passed, false),
        gte(agentEvals.ranAt, windowStart),
      ),
    )
    .orderBy(desc(agentEvals.ranAt))
    .limit(MAX_NOTIFICATIONS);

  // ─── Merge ────────────────────────────────────────────────────
  const items: NotificationItem[] = [];

  for (const row of submissionRows) {
    const org = orgById.get(row.orgId);
    if (!org) continue;
    const submitterName =
      pickName(row.data) ?? pickEmail(row.data) ?? "Someone";
    items.push({
      id: `intake_submission:${row.id}`,
      type: "intake_submission",
      title: `New lead from ${row.formName ?? "intake form"}`,
      body: `${submitterName} submitted ${row.formName ?? "the form"}`,
      href: row.formId ? `/forms/${row.formId}` : "/forms",
      createdAt: row.createdAt.toISOString(),
      workspaceName: org.name,
      workspaceSlug: org.slug,
    });
  }

  for (const row of bookingRows) {
    const org = orgById.get(row.orgId);
    if (!org) continue;
    const guestName =
      row.fullName ||
      [row.contactFirstName, row.contactLastName].filter(Boolean).join(" ").trim() ||
      row.email ||
      "Someone";
    items.push({
      id: `booking:${row.id}`,
      type: "booking",
      title: `${guestName} booked ${row.title}`,
      body: formatBookingTime(row.startsAt),
      href: "/bookings",
      createdAt: row.createdAt.toISOString(),
      workspaceName: org.name,
      workspaceSlug: org.slug,
    });
  }

  for (const row of evalRows) {
    const org = orgById.get(row.orgId);
    if (!org) continue;
    items.push({
      id: `agent_eval_failure:${row.id}`,
      type: "agent_eval_failure",
      title: `Eval failure on ${row.agentName}`,
      body: row.error
        ? truncate(row.error, 80)
        : `Scenario "${row.scenarioId}" did not pass`,
      href: `/agents/${row.agentId}/evals`,
      createdAt: row.ranAt.toISOString(),
      workspaceName: org.name,
      workspaceSlug: org.slug,
    });
  }

  return items
    .sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)))
    .slice(0, MAX_NOTIFICATIONS);
}

/** Quick stat fetch — same access predicate but only counts, used to
 *  pre-compute "any new since last_seen" on the server so the bell
 *  doesn't flash empty before hydration. Cheaper than full feed. */
export async function getNotificationLatestTimestamp(
  userId: string | null | undefined,
  userOrgId: string | null | undefined,
): Promise<string | null> {
  if (!userId || !UUID_SHAPE.test(userId)) return null;

  const membershipRows = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, userId));
  const membershipOrgIds = membershipRows.map((row) => row.orgId);

  const orConditions = [
    eq(organizations.parentUserId, userId),
    eq(organizations.ownerId, userId),
  ];
  if (membershipOrgIds.length > 0) {
    orConditions.push(inArray(organizations.id, membershipOrgIds));
  }
  if (userOrgId && UUID_SHAPE.test(userOrgId)) {
    orConditions.push(eq(organizations.id, userOrgId));
  }

  const orgRows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(or(...orConditions));
  if (orgRows.length === 0) return null;
  const orgIds = orgRows.map((row) => row.id);

  const [maxSubmission, maxBooking, maxEval] = await Promise.all([
    db
      .select({ ts: sql<Date | null>`max(${intakeSubmissions.createdAt})` })
      .from(intakeSubmissions)
      .where(inArray(intakeSubmissions.orgId, orgIds))
      .then((rows) => rows[0]?.ts ?? null),
    db
      .select({ ts: sql<Date | null>`max(${bookings.createdAt})` })
      .from(bookings)
      .where(
        and(inArray(bookings.orgId, orgIds), eq(bookings.status, "scheduled")),
      )
      .then((rows) => rows[0]?.ts ?? null),
    db
      .select({ ts: sql<Date | null>`max(${agentEvals.ranAt})` })
      .from(agentEvals)
      .innerJoin(agents, eq(agents.id, agentEvals.agentId))
      .where(
        and(inArray(agents.orgId, orgIds), eq(agentEvals.passed, false)),
      )
      .then((rows) => rows[0]?.ts ?? null),
  ]);

  const candidates = [maxSubmission, maxBooking, maxEval]
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());
  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates)).toISOString();
}

// ─── Small helpers ──────────────────────────────────────────────

function pickName(data: Record<string, unknown> | null | undefined): string | null {
  if (!data || typeof data !== "object") return null;
  const candidates = ["name", "full_name", "fullName", "first_name", "firstName"];
  for (const key of candidates) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  // Try first + last
  const first = (data as Record<string, unknown>)["first_name"] ?? (data as Record<string, unknown>)["firstName"];
  const last = (data as Record<string, unknown>)["last_name"] ?? (data as Record<string, unknown>)["lastName"];
  if (typeof first === "string" || typeof last === "string") {
    return [first, last].filter((v) => typeof v === "string" && (v as string).trim().length > 0).join(" ").trim();
  }
  return null;
}

function pickEmail(data: Record<string, unknown> | null | undefined): string | null {
  if (!data || typeof data !== "object") return null;
  const candidates = ["email", "email_address", "emailAddress"];
  for (const key of candidates) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === "string" && value.includes("@")) return value;
  }
  return null;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function formatBookingTime(startsAt: Date): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(startsAt);
  } catch {
    return startsAt.toISOString();
  }
}
