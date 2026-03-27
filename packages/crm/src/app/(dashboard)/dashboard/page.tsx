import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { CheckCircle2, Circle, Clock3 } from "lucide-react";
import { db } from "@/db";
import { activities, bookings, contacts, deals, metricsSnapshots } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { TrendChartCard } from "@/components/dashboard/widgets/trend-chart-card";

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}

function toUtcDate(value: string | Date) {
  if (value instanceof Date) {
    return value;
  }

  return new Date(`${value}T00:00:00.000Z`);
}

function percentChange(current: number, previous: number) {
  if (!previous) {
    return current === 0 ? 0 : 100;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

export default async function DashboardPage() {
  const orgId = await getOrgId();

  if (!orgId) {
    return null;
  }

  const [contactRows, dealRows, activityRows, taskRows, bookingRows, snapshotRowsRaw] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.orgId, orgId)),
    db.select().from(deals).where(eq(deals.orgId, orgId)),
    db.select().from(activities).where(eq(activities.orgId, orgId)).orderBy(desc(activities.createdAt)).limit(20),
    db
      .select()
      .from(activities)
      .where(and(eq(activities.orgId, orgId), eq(activities.type, "task")))
      .orderBy(desc(activities.createdAt))
      .limit(20),
    db
      .select()
      .from(bookings)
      .where(eq(bookings.orgId, orgId))
      .orderBy(desc(bookings.startsAt))
      .limit(8),
    db.select().from(metricsSnapshots).where(eq(metricsSnapshots.orgId, orgId)).orderBy(asc(metricsSnapshots.date)).limit(90),
  ]);

  const contactById = new Map(contactRows.map((contact) => [contact.id, contact]));
  const snapshotRows = snapshotRowsRaw.map((row) => ({ ...row, dateObj: toUtcDate(row.date) }));

  const trendRows = snapshotRows.slice(-30).map((row) => {
    const day = row.dateObj.getUTCDate();
    return {
      label: `${monthLabel(row.dateObj)} ${day}`,
      pipelineValue: Number(row.pipelineValue),
      winRate: Number(row.winRate) * 100,
      emailEngagement: Number(row.emailOpenRate) * 100,
      revenueTotal: Number(row.revenueTotal),
    };
  });

  const latestSnapshot = snapshotRows.at(-1);
  const latestMonthKey = latestSnapshot ? dateKey(latestSnapshot.dateObj) : null;
  const previousMonthKey = latestSnapshot
    ? dateKey(new Date(Date.UTC(latestSnapshot.dateObj.getUTCFullYear(), latestSnapshot.dateObj.getUTCMonth() - 1, 1)))
    : null;

  const currentMonthRows = latestMonthKey ? snapshotRows.filter((row) => dateKey(row.dateObj) === latestMonthKey) : [];
  const previousMonthRows = previousMonthKey ? snapshotRows.filter((row) => dateKey(row.dateObj) === previousMonthKey) : [];

  const currentPipeline = Number(currentMonthRows.at(-1)?.pipelineValue ?? 0);
  const previousPipeline = Number(previousMonthRows.at(-1)?.pipelineValue ?? 0);
  const currentWinRate = Number(currentMonthRows.at(-1)?.winRate ?? 0) * 100;
  const previousWinRate = Number(previousMonthRows.at(-1)?.winRate ?? 0) * 100;
  const currentEmailOpen = Number(currentMonthRows.at(-1)?.emailOpenRate ?? 0) * 100;
  const previousEmailOpen = Number(previousMonthRows.at(-1)?.emailOpenRate ?? 0) * 100;
  const currentRevenue = Number(currentMonthRows.at(-1)?.revenueTotal ?? 0);
  const previousRevenue = Number(previousMonthRows.at(-1)?.revenueTotal ?? 0);

  const pipelineDelta = percentChange(currentPipeline, previousPipeline);
  const winRateDelta = percentChange(currentWinRate, previousWinRate);
  const emailDelta = percentChange(currentEmailOpen, previousEmailOpen);
  const revenueDelta = percentChange(currentRevenue, previousRevenue);

  const statCards = [
    { label: "Pipeline Value", value: `$${Math.round(currentPipeline).toLocaleString()}`, delta: pipelineDelta },
    { label: "Win Rate", value: `${currentWinRate.toFixed(1)}%`, delta: winRateDelta },
    { label: "Email Open Rate", value: `${currentEmailOpen.toFixed(1)}%`, delta: emailDelta },
    { label: "Revenue", value: `$${Math.round(currentRevenue).toLocaleString()}`, delta: revenueDelta },
  ];

  const newLeads = contactRows.filter((row) => row.status.toLowerCase().includes("lead")).length;
  const dealsWon = dealRows.filter((row) => row.probability === 100 || row.stage.toLowerCase().includes("won")).length;
  const weekThreshold = new Date();
  weekThreshold.setDate(weekThreshold.getDate() - 7);
  const dealsThisWeek = dealRows.filter((row) => new Date(row.createdAt) >= weekThreshold).length;

  const opportunityRows = [...dealRows]
    .sort((a, b) => Number(b.value) - Number(a.value))
    .slice(0, 5)
    .map((deal) => ({
      id: deal.id,
      title: deal.title,
      contact: contactById.get(deal.contactId),
      value: Number(deal.value),
      stage: deal.stage,
    }));

  const upcomingBookingRows = bookingRows
    .filter((item) => item.status === "scheduled")
    .slice(0, 4);

  return (
    <section className="animate-page-enter space-y-4">
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-3">
          <TrendChartCard
            title="Pipeline Value Over Time"
            mode="line"
            compactYAxis
            valuePrefix="$"
            data={trendRows.map((item) => ({ label: item.label, value: item.pipelineValue }))}
          />
        </div>

        <div className="xl:col-span-3">
          <TrendChartCard
            title="Win Rate Over Time"
            mode="line"
            valueSuffix="%"
            data={trendRows.map((item) => ({ label: item.label, value: item.winRate }))}
          />
        </div>

        <div className="xl:col-span-3">
          <TrendChartCard
            title="Email Engagement Over Time"
            mode="line"
            valueSuffix="%"
            data={trendRows.map((item) => ({ label: item.label, value: item.emailEngagement }))}
          />
        </div>

        <div className="xl:col-span-3">
          <TrendChartCard
            title="Revenue Over Time"
            mode="area"
            compactYAxis
            valuePrefix="$"
            data={trendRows.map((item) => ({ label: item.label, value: item.revenueTotal }))}
          />
        </div>

        <article className="crm-card xl:col-span-3">
          <h3 className="text-[16px] font-semibold">CRM Activity Overview</h3>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {statCards.map((item) => (
              <div key={item.label} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] p-3">
                <p className="text-[11px] uppercase tracking-[0.08em] text-[hsl(var(--color-text-muted))]">{item.label}</p>
                <p className="mt-1 text-[24px] font-semibold leading-none text-foreground">{item.value}</p>
                <span className={`mt-2 inline-flex rounded-md px-2 py-1 text-xs font-medium ${item.delta >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>
                  You&apos;re {item.delta >= 0 ? "up" : "down"} {Math.abs(item.delta).toFixed(0)}% this month
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-[hsl(var(--color-text-muted))]">
            <p>New Leads: <span className="font-medium text-foreground">{newLeads}</span></p>
            <p>Deals Won: <span className="font-medium text-foreground">{dealsWon}</span></p>
            <p>Deals This Week: <span className="font-medium text-foreground">{dealsThisWeek}</span></p>
            <p>Total Contacts: <span className="font-medium text-foreground">{contactRows.length}</span></p>
          </div>
        </article>

        <article className="crm-card xl:col-span-4">
          <h3 className="mb-3 text-[16px] font-semibold">Recent Activity</h3>
          {activityRows.length === 0 ? (
            <p className="text-label text-[hsl(var(--color-text-secondary))]">No recent activity.</p>
          ) : (
            <ul className="space-y-2">
              {activityRows.slice(0, 6).map((item) => {
                const linkedContact = item.contactId ? contactById.get(item.contactId) : null;
                const name = linkedContact ? `${linkedContact.firstName} ${linkedContact.lastName ?? ""}`.trim() : "Contact";
                const initials = name.charAt(0).toUpperCase();
                return (
                  <li key={item.id} className="crm-table-row flex items-center gap-3 rounded-md px-2 py-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.14)] text-xs font-semibold text-primary">
                      {initials}
                    </span>
                    <div className="min-w-0 flex-1 text-label">
                      <p className="truncate text-foreground">{item.subject ?? `${item.type} action`}</p>
                      <p className="truncate text-[hsl(var(--color-text-secondary))]">{name}</p>
                    </div>
                    <span className="text-xs text-[hsl(var(--color-text-muted))]">{new Date(item.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </article>

        <article className="crm-card xl:col-span-5">
          <h3 className="mb-3 text-[16px] font-semibold">Top Opportunities</h3>
          {opportunityRows.length === 0 ? (
            <p className="text-label text-[hsl(var(--color-text-secondary))]">No opportunities yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-[0.08em] text-[hsl(var(--color-text-muted))]">
                <tr>
                  <th className="pb-2">Contact</th>
                  <th className="pb-2">Company</th>
                  <th className="pb-2">Deal Value</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {opportunityRows.map((row) => {
                  const contactName = row.contact ? `${row.contact.firstName} ${row.contact.lastName ?? ""}`.trim() : row.title;
                  const stage = row.stage.toLowerCase();
                  const badgeClass = stage.includes("discovery")
                    ? "bg-[hsl(var(--secondary)/0.18)] text-[hsl(var(--secondary))]"
                    : "bg-[hsl(var(--primary)/0.18)] text-[hsl(var(--primary))]";

                  return (
                    <tr key={row.id} className="crm-table-row">
                      <td className="py-2">
                        <Link href={`/deals/${row.id}`} className="font-medium text-foreground hover:text-primary">
                          {contactName}
                        </Link>
                      </td>
                      <td className="py-2 text-[hsl(var(--color-text-secondary))]">{row.contact?.company || "—"}</td>
                      <td className="py-2 text-data">${row.value.toLocaleString()}</td>
                      <td className="py-2">
                        <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${badgeClass}`}>{row.stage}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </article>

        <article className="crm-card xl:col-span-3">
          <h3 className="mb-3 text-[16px] font-semibold">Upcoming Tasks</h3>
          {taskRows.length === 0 ? (
            <p className="text-label text-[hsl(var(--color-text-secondary))]">No tasks scheduled.</p>
          ) : (
            <ul className="space-y-2">
              {taskRows.slice(0, 5).map((task, index) => (
                <li key={task.id} className="crm-table-row flex items-center gap-2 rounded-md px-2 py-2">
                  {index % 2 === 0 ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-[hsl(var(--color-text-muted))]" />}
                  <span className="flex-1 text-label text-foreground">{task.subject ?? "Untitled task"}</span>
                  <span className="text-xs text-[hsl(var(--secondary))]">
                    {task.scheduledAt ? new Date(task.scheduledAt).toLocaleDateString() : "No due date"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="crm-card xl:col-span-2">
          <h3 className="mb-3 text-[16px] font-semibold">Upcoming Bookings</h3>
          {upcomingBookingRows.length === 0 ? (
            <p className="text-label text-[hsl(var(--color-text-secondary))]">No bookings yet.</p>
          ) : (
            <ul className="space-y-2">
              {upcomingBookingRows.map((booking) => {
                const linkedContact = booking.contactId ? contactById.get(booking.contactId) : null;
                const person = linkedContact ? `${linkedContact.firstName} ${linkedContact.lastName ?? ""}`.trim() : "Contact";
                const at = booking.startsAt;
                return (
                  <li key={booking.id} className="crm-table-row rounded-md px-2 py-2 text-label">
                    <p className="flex items-center gap-1 text-foreground">
                      <Clock3 className="h-3.5 w-3.5 text-[hsl(var(--color-text-muted))]" />
                      {new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </p>
                    <p className="text-xs text-[hsl(var(--color-text-secondary))]">{new Date(at).toLocaleDateString()} • {person}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </article>

        <article className="crm-card xl:col-span-2">
          <h3 className="mb-3 text-[16px] font-semibold">Quick Actions</h3>
          <div className="grid gap-2">
            <Link href="/contacts" className="crm-button-primary h-9 px-3 text-sm">New Contact</Link>
            <Link href="/deals" className="h-9 rounded-md border border-[hsl(var(--secondary)/0.45)] bg-[hsl(var(--secondary)/0.18)] px-3 text-center text-sm font-medium leading-9 text-[hsl(var(--secondary))]">
              New Deal
            </Link>
            <button type="button" className="h-9 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] px-3 text-sm font-medium text-foreground">
              Schedule Meeting
            </button>
            <button type="button" className="h-9 rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm font-medium text-[hsl(var(--color-text-secondary))]">
              Outline
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
