import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { DollarSign, Users, CalendarDays, Activity, ChevronDown, Plus, Download } from "lucide-react";
import { db } from "@/db";
import { activities, metricsSnapshots, organizations, paymentRecords } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/helpers";
import { listBookings } from "@/lib/bookings/actions";
import { listContacts } from "@/lib/contacts/actions";
import { listDeals } from "@/lib/deals/actions";
import { getSoul } from "@/lib/soul/server";
import { skipSoulDeepenerAction } from "@/lib/soul/actions";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/content.tsx
    - main: "flex-1 overflow-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-background w-full"
  - templates/dashboard-2/components/dashboard/welcome-section.tsx
    - header: "flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6"
    - title: "text-lg sm:text-[22px] font-semibold leading-relaxed"
    - subtitle: "text-sm sm:text-base text-muted-foreground"
  - templates/dashboard-2/components/dashboard/stats-cards.tsx
    - grid: "grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 p-3 sm:p-4 lg:p-6 rounded-xl border bg-card"
    - stat shell: "flex items-start" + "flex-1 space-y-2 sm:space-y-4 lg:space-y-6"
    - label row: "flex items-center gap-1 sm:gap-1.5 text-muted-foreground"
    - label text: "text-[10px] sm:text-xs lg:text-sm font-medium truncate"
    - value: "text-lg sm:text-xl lg:text-[28px] font-semibold leading-tight tracking-tight"
    - trend row: "flex flex-wrap items-center gap-1 sm:gap-2 text-[10px] sm:text-xs lg:text-sm font-medium"
*/

function toUtcDate(value: string | Date) {
  if (value instanceof Date) {
    return value;
  }

  return new Date(`${value}T00:00:00.000Z`);
}

function timeOfDay() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "morning";
  }

  if (hour < 18) {
    return "afternoon";
  }

  return "evening";
}

function formatCurrency(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

function formatLongDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(value);
}

function TrendText({ value }: { value: number }) {
  const rounded = Math.round(value);
  const isPositive = rounded >= 0;

  return (
    <span className={isPositive ? "text-emerald-600" : "text-red-600"}>
      {isPositive ? "+" : ""}
      {rounded}%
    </span>
  );
}

function StatCard({ label, value, icon, trendPercent }: { label: string; value: string; icon: React.ReactNode; trendPercent: number }) {
  return (
    <article className="flex items-start">
      <div className="flex-1 space-y-2 sm:space-y-4 lg:space-y-6">
        <div className="flex items-center gap-1 sm:gap-1.5 text-muted-foreground">
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-muted/70">{icon}</span>
          <span className="text-[10px] sm:text-xs lg:text-sm font-medium truncate">{label}</span>
        </div>
        <p className="text-lg sm:text-xl lg:text-[28px] font-semibold leading-tight tracking-tight">{value}</p>
        <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-[10px] sm:text-xs lg:text-sm font-medium">
          <TrendText value={trendPercent} />
          <span className="text-muted-foreground hidden sm:inline">vs Last Months</span>
        </div>
      </div>
    </article>
  );
}

function percentChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

export default async function DashboardPage() {
  async function skipDeepSetupFormAction() {
    "use server";

    await skipSoulDeepenerAction();
  }

  const [user, contactRows, dealRows, bookingRows, soul] = await Promise.all([getCurrentUser(), listContacts(), listDeals(), listBookings(), getSoul()]);
  const orgId = user?.orgId;

  if (!orgId) {
    return null;
  }

  const [snapshotRowsRaw, activityRows, paymentRows, orgRow] = await Promise.all([
    db.select().from(metricsSnapshots).where(eq(metricsSnapshots.orgId, orgId)).orderBy(asc(metricsSnapshots.date)).limit(180),
    db.select().from(activities).where(eq(activities.orgId, orgId)).orderBy(desc(activities.createdAt)).limit(20),
    db
      .select({ amount: paymentRecords.amount, createdAt: paymentRecords.createdAt })
      .from(paymentRecords)
      .where(eq(paymentRecords.orgId, orgId)),
    db
      .select({ createdAt: organizations.createdAt, soulId: organizations.soulId, soulContentGenerated: organizations.soulContentGenerated })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const contactById = new Map(contactRows.map((contact) => [contact.id, contact]));
  const snapshotRows = snapshotRowsRaw.map((row) => ({ ...row, dateObj: toUtcDate(row.date) }));
  const contactLabelSingular = soul?.entityLabels?.contact?.singular || "Contact";
  const contactLabelPlural = soul?.entityLabels?.contact?.plural || "Contacts";
  const setupComplete = Boolean(orgRow?.soulId) || Number(orgRow?.soulContentGenerated ?? 0) > 0;
  const deepSetupPending = setupComplete && !soul?.deepSetup?.completedAt && !soul?.deepSetup?.skippedAt;

  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const endOfTomorrow = new Date(startOfTomorrow);
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);

  const sessionsToday = bookingRows.filter((item) => {
    const startsAt = new Date(item.startsAt);
    return startsAt >= startOfToday && startsAt < startOfTomorrow;
  }).length;

  const followUpsDue = activityRows.filter((task) => {
    if (task.type !== "task" || task.completedAt) {
      return false;
    }

    if (!task.scheduledAt) {
      return false;
    }

    return new Date(task.scheduledAt) <= today;
  }).length;

  const monthThreshold = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  const firstName = user?.name?.split(" ").filter(Boolean)[0] || "there";
  const trialEndsAt = user?.trialEndsAt ? new Date(user.trialEndsAt) : null;
  const isTrialing = user?.subscriptionStatus === "trialing";
  const trialDaysRemaining =
    isTrialing && trialEndsAt && Number.isFinite(trialEndsAt.getTime())
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

  const closedDeals = dealRows.filter((row) => {
    const stage = row.stage.toLowerCase();
    return stage.includes("won") || stage.includes("lost") || row.probability === 100;
  });
  const wonDeals = dealRows.filter((row) => {
    const stage = row.stage.toLowerCase();
    return stage.includes("won") || row.probability === 100;
  });
  const winRate = closedDeals.length > 0 ? (wonDeals.length / closedDeals.length) * 100 : 0;
  const revenueTotal = paymentRows.reduce((sum, row) => sum + Number(row.amount), 0);
  const monthlyRevenue = paymentRows
    .filter((row) => new Date(row.createdAt) >= startOfMonth)
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const previousMonthRevenue = paymentRows
    .filter((row) => {
      const createdAt = new Date(row.createdAt);
      return createdAt >= monthThreshold && createdAt < startOfMonth;
    })
    .reduce((sum, row) => sum + Number(row.amount), 0);

  const contactsThisMonth = contactRows.filter((row) => new Date(row.createdAt) >= startOfMonth).length;
  const contactsPreviousMonth = contactRows.filter((row) => {
    const createdAt = new Date(row.createdAt);
    return createdAt >= monthThreshold && createdAt < startOfMonth;
  }).length;

  const bookingsThisMonth = bookingRows.filter((row) => new Date(row.createdAt) >= startOfMonth).length;
  const bookingsPreviousMonth = bookingRows.filter((row) => {
    const createdAt = new Date(row.createdAt);
    return createdAt >= monthThreshold && createdAt < startOfMonth;
  }).length;

  const activeEngagements = activityRows.filter((row) => row.type !== "task" || !row.completedAt).length;
  const activeEngagementsPrev = Math.max(1, activityRows.length - activeEngagements);

  const revenueFlowData = snapshotRows
    .slice(-6)
    .map((row) => ({
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(row.dateObj),
      value: Number(row.revenueTotal),
    }));

  const leadSourceBuckets = [
    { name: "Calls", count: activityRows.filter((row) => row.type === "call").length, color: "#35b9e9" },
    { name: "Emails", count: activityRows.filter((row) => row.type === "email").length, color: "#6e3ff3" },
    { name: "Meetings", count: activityRows.filter((row) => row.type === "meeting").length, color: "#375dfb" },
    { name: "Tasks", count: activityRows.filter((row) => row.type === "task").length, color: "#e255f2" },
  ].map((row) => ({ ...row, count: row.count || 1 }));

  const totalLeadSources = leadSourceBuckets.reduce((sum, row) => sum + row.count, 0);
  let donutOffset = 0;
  const donutStops = leadSourceBuckets
    .map((row) => {
      const start = donutOffset;
      donutOffset += (row.count / totalLeadSources) * 100;
      return `${row.color} ${start.toFixed(2)}% ${donutOffset.toFixed(2)}%`;
    })
    .join(", ");

  const stats = [
    {
      label: `Total ${contactLabelPlural}`,
      value: contactRows.length.toLocaleString(),
      icon: <Users className="size-3.5 sm:size-[18px]" />,
      trend: percentChange(contactsThisMonth, contactsPreviousMonth),
    },
    {
      label: "Active Engagements",
      value: activeEngagements.toLocaleString(),
      icon: <Activity className="size-3.5 sm:size-[18px]" />,
      trend: percentChange(activeEngagements, activeEngagementsPrev),
    },
    {
      label: "Bookings This Month",
      value: bookingsThisMonth.toLocaleString(),
      icon: <CalendarDays className="size-3.5 sm:size-[18px]" />,
      trend: percentChange(bookingsThisMonth, bookingsPreviousMonth),
    },
    {
      label: "Revenue",
      value: formatCurrency(monthlyRevenue),
      icon: <DollarSign className="size-3.5 sm:size-[18px]" />,
      trend: percentChange(monthlyRevenue, previousMonthRevenue),
    },
  ];

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

  const upcomingSessionRows = bookingRows.filter((item) => {
    if (item.status !== "scheduled") {
      return false;
    }

    const startsAt = new Date(item.startsAt);
    return startsAt >= startOfToday && startsAt < endOfTomorrow;
  });

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      {typeof trialDaysRemaining === "number" ? (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          Trial: {trialDaysRemaining} day{trialDaysRemaining === 1 ? "" : "s"} remaining. Your plan activates on {formatLongDate(trialEndsAt!)}.
        </div>
      ) : null}

      {deepSetupPending ? (
        <article className="rounded-xl border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Optional Deep Setup</p>
          <h2 className="mt-2 text-xl font-semibold text-foreground">Your business is set up. Want to unlock automations?</h2>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            Tell us how your client journey works and we&apos;ll translate it into a deeper soul profile.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link href="/dashboard/soul-deepener" className="crm-button-primary h-10 px-4">
              Set Up Automations
            </Link>
            <form action={skipDeepSetupFormAction}>
              <button type="submit" className="crm-button-secondary h-10 px-4">
                Maybe Later
              </button>
            </form>
          </div>
        </article>
      ) : null}

      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6">
        <div className="space-y-2 sm:space-y-5">
          <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">
            Good {timeOfDay()}, {firstName}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Today: <span className="text-foreground font-medium">{sessionsToday} sessions</span>,{" "}
            <span className="text-foreground font-medium">{followUpsDue} follow-ups due</span>
          </p>
          <p className="text-xs text-muted-foreground">{formatLongDate(today)}</p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button type="button" className="inline-flex items-center gap-2 sm:gap-3 h-8 sm:h-9 rounded-md border border-border bg-background px-3 text-xs sm:text-sm">
            <span className="hidden xs:inline">Import/Export</span>
            <span className="xs:hidden">
              <Download className="size-4" />
            </span>
            <ChevronDown className="size-3 sm:size-4 text-muted-foreground" />
          </button>
          <Link href="/contacts" className="inline-flex items-center gap-2 sm:gap-3 h-8 sm:h-9 rounded-md bg-linear-to-b from-foreground to-foreground/90 px-3 text-xs sm:text-sm text-background">
            <Plus className="size-3 sm:size-4" />
            <span className="hidden xs:inline">Create New</span>
            <span className="xs:hidden">New</span>
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 p-3 sm:p-4 lg:p-6 rounded-xl border bg-card">
        {stats.map((stat, index) => (
          <div key={stat.label} className="flex items-start">
            <StatCard label={stat.label} value={stat.value} icon={stat.icon} trendPercent={stat.trend} />
            {index < stats.length - 1 ? <div className="hidden lg:block w-px h-full bg-border mx-4 xl:mx-6" /> : null}
          </div>
        ))}
      </div>

      <div className="flex flex-col xl:flex-row gap-4 sm:gap-6">
        <article className="flex flex-col gap-4 p-6 rounded-xl border bg-card w-full xl:w-[410px]">
          <div className="flex items-center justify-between">
            <span className="text-sm sm:text-base font-medium">Lead Sources</span>
            <span className="text-xs text-muted-foreground">30 days</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <div className="relative shrink-0 size-[220px]">
              <div
                className="absolute inset-0 rounded-full"
                style={{ background: `conic-gradient(${donutStops})` }}
              />
              <div className="absolute inset-[30%] rounded-full bg-card" />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg sm:text-xl font-semibold">{totalLeadSources.toLocaleString()}</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">Total Leads</span>
              </div>
            </div>

            <div className="flex-1 w-full grid grid-cols-2 sm:grid-cols-1 gap-2 sm:gap-4">
              {leadSourceBuckets.map((item) => (
                <div key={item.name} className="flex items-center gap-2 sm:gap-2.5">
                  <div className="w-1 h-4 sm:h-5 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="flex-1 text-xs sm:text-sm text-muted-foreground truncate">{item.name}</span>
                  <span className="text-xs sm:text-sm font-semibold tabular-nums">{item.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="flex-1 flex flex-col gap-4 sm:gap-6 p-6 rounded-xl border bg-card min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm sm:text-base font-medium">Revenue Flow</span>
            <span className="text-xs text-muted-foreground">Last 6 snapshots</span>
          </div>

          <div className="h-[220px] w-full flex gap-3">
            <div className="w-10 h-full flex flex-col justify-between text-[10px] text-muted-foreground">
              {[100, 75, 50, 25, 0].map((tick) => (
                <span key={tick}>${tick}k</span>
              ))}
            </div>
            <div className="flex-1 flex h-full items-end gap-2 sm:gap-3">
              {(revenueFlowData.length > 0 ? revenueFlowData : [{ label: "Now", value: monthlyRevenue || revenueTotal }]).map((item, index, all) => {
                const max = Math.max(...all.map((row) => row.value), 1);
                const barHeight = Math.max(12, (item.value / max) * 100);
                return (
                  <div key={`${item.label}-${index}`} className="flex h-full w-[34px] flex-col justify-end gap-2">
                    <div className="h-full rounded-md bg-muted/40 flex items-end">
                      <div className="w-full rounded-t-md bg-primary/70" style={{ height: `${barHeight}%` }} />
                    </div>
                    <p className="truncate text-[10px] text-muted-foreground">{item.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </article>
      </div>

      <article className="rounded-xl border bg-card">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:px-6 sm:py-3.5">
          <div className="flex items-center gap-2 sm:gap-2.5 flex-1">
            <span className="text-sm sm:text-base font-medium">Active Deals</span>
            <span className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[10px] sm:text-xs text-muted-foreground">
              {opportunityRows.length}
            </span>
          </div>
          <Link href="/deals" className="text-sm text-muted-foreground hover:text-foreground">
            View all
          </Link>
        </div>

        <div className="overflow-x-auto px-3 sm:px-6 pb-4">
          <table className="w-full min-w-[680px]">
            <thead>
              <tr className="bg-muted/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="py-2.5 px-3">Deal</th>
                <th className="py-2.5 px-3">Contact</th>
                <th className="py-2.5 px-3">Stage</th>
                <th className="py-2.5 px-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {opportunityRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No active deals yet.
                  </td>
                </tr>
              ) : (
                opportunityRows.map((row) => {
                  const contactName = row.contact ? `${row.contact.firstName} ${row.contact.lastName ?? ""}`.trim() : contactLabelSingular;
                  return (
                    <tr key={row.id} className="text-sm hover:bg-muted/50">
                      <td className="py-3 px-3 text-foreground">
                        <Link href={`/deals/${row.id}`} className="hover:underline">
                          {row.title}
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground">{contactName}</td>
                      <td className="py-3 px-3">
                        <span className="inline-flex rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          {row.stage}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-foreground">${row.value.toLocaleString()}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </article>

      {upcomingSessionRows.length > 0 ? (
        <article className="rounded-xl border bg-card p-4 sm:p-6">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Upcoming Sessions</p>
          <ul className="space-y-2">
            {upcomingSessionRows.slice(0, 3).map((booking) => {
              const linkedContact = booking.contactId ? contactById.get(booking.contactId) : null;
              const person = linkedContact ? `${linkedContact.firstName} ${linkedContact.lastName ?? ""}`.trim() : contactLabelSingular;
              return (
                <li key={booking.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="text-foreground">{booking.title}</span>
                  <span className="text-muted-foreground">{person}</span>
                </li>
              );
            })}
          </ul>
        </article>
      ) : null}

    </section>
  );
}
