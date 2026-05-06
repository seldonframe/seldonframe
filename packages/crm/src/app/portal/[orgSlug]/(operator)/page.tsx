// v1.20.0 — operator portal dashboard (mirror of /dashboard scoped to orgSlug)
//
// Twenty-CRM-style overview: 4 stat cards (contacts, deals,
// upcoming bookings, recent activity), one recent-activity feed.
// Light mode neutral palette. Workspace theme primaryColor accents
// the active stat / hover states.
//
// v1.21 will add /portal/<orgSlug>/contacts, /deals, /bookings as
// full table mirrors. For v1.20 the dashboard mirror is enough to
// prove the architecture: auth + agency-branded chrome + Twenty
// aesthetic + scoped data loading via orgId-from-session.

import { and, count, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { activities, bookings, contacts, deals } from "@/db/schema";
import { requireOperatorSessionForOrg } from "@/lib/operator-portal/auth";

export default async function OperatorPortalDashboard({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requireOperatorSessionForOrg(orgSlug);
  const orgId = session.orgId;
  const now = new Date();

  // Parallel data load. All queries scoped to session.orgId so
  // orgSlug tampering can't read another workspace's data.
  const [
    contactsCount,
    activeDealsCount,
    upcomingBookingsCount,
    recentActivities,
  ] = await Promise.all([
    db
      .select({ c: count() })
      .from(contacts)
      .where(eq(contacts.orgId, orgId))
      .then((r) => Number(r[0]?.c ?? 0)),
    db
      .select({ c: count() })
      .from(deals)
      .where(eq(deals.orgId, orgId))
      .then((r) => Number(r[0]?.c ?? 0)),
    db
      .select({ c: count() })
      .from(bookings)
      .where(and(eq(bookings.orgId, orgId), gte(bookings.startsAt, now)))
      .then((r) => Number(r[0]?.c ?? 0)),
    db
      .select({
        id: activities.id,
        type: activities.type,
        subject: activities.subject,
        createdAt: activities.createdAt,
      })
      .from(activities)
      .where(eq(activities.orgId, orgId))
      .orderBy(desc(activities.createdAt))
      .limit(8),
  ]);

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-1">
        <h1
          className="text-[20px] font-semibold tracking-tight"
          style={{ color: "#111" }}
        >
          Dashboard
        </h1>
        <p className="text-[13px]" style={{ color: "#666" }}>
          Your workspace at a glance.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Contacts" value={contactsCount} />
        <StatCard label="Active deals" value={activeDealsCount} />
        <StatCard label="Upcoming bookings" value={upcomingBookingsCount} />
        <StatCard
          label="Recent activity"
          value={recentActivities.length}
          subtle="last 8"
        />
      </div>

      <section
        className="px-5 py-4"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E5E1",
          borderRadius: "10px",
        }}
      >
        <header className="flex items-center justify-between pb-3 mb-3"
          style={{ borderBottom: "1px solid #F0F0EC" }}>
          <h2
            className="text-[14px] font-semibold tracking-tight"
            style={{ color: "#111" }}
          >
            Recent activity
          </h2>
          <span className="text-[11px]" style={{ color: "#999" }}>
            v1.21 — full activity feed
          </span>
        </header>
        {recentActivities.length === 0 ? (
          <p className="text-[13px]" style={{ color: "#888" }}>
            No activity yet. Bookings, deals, and contact updates will appear
            here as they happen.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {recentActivities.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between px-2 py-2 text-[13px]"
                style={{ borderRadius: "6px" }}
              >
                <span style={{ color: "#111" }}>
                  {row.subject ?? row.type ?? "Activity"}
                </span>
                <span className="text-[11px]" style={{ color: "#888" }}>
                  {formatRelative(row.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="px-5 py-4"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E5E1",
          borderRadius: "10px",
        }}
      >
        <header className="pb-2 mb-2">
          <h2
            className="text-[14px] font-semibold tracking-tight"
            style={{ color: "#111" }}
          >
            Coming in v1.21
          </h2>
        </header>
        <ul className="grid gap-1.5 sm:grid-cols-2 text-[13px]"
          style={{ color: "#444" }}>
          <li>
            <span className="font-medium" style={{ color: "#111" }}>
              Contacts
            </span>{" "}
            — full table view scoped to your workspace
          </li>
          <li>
            <span className="font-medium" style={{ color: "#111" }}>
              Deals
            </span>{" "}
            — pipeline kanban
          </li>
          <li>
            <span className="font-medium" style={{ color: "#111" }}>
              Bookings
            </span>{" "}
            — calendar + upcoming jobs
          </li>
          <li>
            <span className="font-medium" style={{ color: "#111" }}>
              Agency support sessions
            </span>{" "}
            — your provider can sign in to help (audit-logged)
          </li>
        </ul>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtle,
}: {
  label: string;
  value: number;
  subtle?: string;
}) {
  return (
    <article
      className="px-5 py-4"
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid #E5E5E1",
        borderRadius: "10px",
      }}
    >
      <p
        className="text-[11px] uppercase tracking-wide"
        style={{ color: "#888" }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-[24px] font-semibold tracking-tight"
        style={{ color: "#111" }}
      >
        {value}
      </p>
      {subtle ? (
        <p className="text-[11px]" style={{ color: "#999" }}>
          {subtle}
        </p>
      ) : null}
    </article>
  );
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
