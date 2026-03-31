import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Clock3, DollarSign, Users, Zap } from "lucide-react";
import { db } from "@/db";
import { activities, bookings, emails, intakeForms, landingPages, metricsSnapshots, organizations, paymentRecords, pipelines } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/helpers";
import { listBookings } from "@/lib/bookings/actions";
import { listContacts } from "@/lib/contacts/actions";
import { listDeals } from "@/lib/deals/actions";
import { getSoul } from "@/lib/soul/server";
import { RevenueChartCard } from "@/components/dashboard/widgets/revenue-chart-card";

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

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) {
    return null;
  }

  const width = 30;
  const height = 16;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point - min) / span) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function StatCard({ label, value, icon, trendPoints }: { label: string; value: string; icon: React.ReactNode; trendPoints: number[] }) {
  return (
    <article className="glass-card rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.12)] text-primary">{icon}</span>
      </div>
      <p className="text-xs font-medium uppercase tracking-widest text-[hsl(var(--muted-foreground))]">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-3xl font-semibold text-foreground">{value}</p>
        <Sparkline points={trendPoints} />
      </div>
    </article>
  );
}

export default async function DashboardPage() {
  const [user, contactRows, dealRows, bookingRows, soul] = await Promise.all([getCurrentUser(), listContacts(), listDeals(), listBookings(), getSoul()]);
  const orgId = user?.orgId;

  if (!orgId) {
    return null;
  }

  const [snapshotRowsRaw, activityRows, appointmentTypeRows, landingRows, sentEmailRows, paymentRows, intakeFormRows, defaultPipeline, orgRow] = await Promise.all([
    db.select().from(metricsSnapshots).where(eq(metricsSnapshots.orgId, orgId)).orderBy(asc(metricsSnapshots.date)).limit(180),
    db.select().from(activities).where(eq(activities.orgId, orgId)).orderBy(desc(activities.createdAt)).limit(20),
    db
      .select()
      .from(bookings)
      .where(and(eq(bookings.orgId, orgId), eq(bookings.status, "template")))
      .orderBy(desc(bookings.createdAt))
      .limit(10),
    db
      .select()
      .from(landingPages)
      .where(eq(landingPages.orgId, orgId))
      .orderBy(desc(landingPages.createdAt))
      .limit(10),
    db
      .select({ id: emails.id })
      .from(emails)
      .where(and(eq(emails.orgId, orgId), eq(emails.status, "sent")))
      .limit(10),
    db
      .select({ amount: paymentRecords.amount })
      .from(paymentRecords)
      .where(eq(paymentRecords.orgId, orgId)),
    db
      .select({ id: intakeForms.id })
      .from(intakeForms)
      .where(eq(intakeForms.orgId, orgId))
      .limit(10),
    db
      .select({ id: pipelines.id })
      .from(pipelines)
      .where(and(eq(pipelines.orgId, orgId), eq(pipelines.isDefault, true)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
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
  const dealLabelSingular = soul?.entityLabels?.deal?.singular || "Deal";
  const setupComplete = Boolean(orgRow?.soulId) || Number(orgRow?.soulContentGenerated ?? 0) > 0;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const isNewUser = (orgRow ? new Date(orgRow.createdAt) >= sevenDaysAgo : false) || contactRows.length < 5;
  const setupGuideItems = [
    { href: "/setup", label: "Complete Setup Wizard", done: setupComplete },
    { href: "/deals", label: "Review Generated Pipeline", done: setupComplete && Boolean(defaultPipeline) },
    { href: "/landing", label: "Review Generated Landing Page", done: setupComplete && landingRows.length > 0 },
    { href: "/bookings", label: "Review Generated Booking Type", done: setupComplete && appointmentTypeRows.length > 0 },
    { href: "/forms", label: "Review Generated Intake Form", done: setupComplete && intakeFormRows.length > 0 },
    { href: "/settings", label: "Connect Email", done: sentEmailRows.length > 0 },
    { href: "/contacts", label: `Create First ${contactLabelSingular}`, done: contactRows.length > 0 },
    { href: "/deals", label: `Create First ${dealLabelSingular}`, done: dealRows.length > 0 },
  ];
  const completedChecklistCount = setupGuideItems.filter((item) => item.done).length;

  const today = new Date();
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

  const weekThreshold = new Date(today);
  weekThreshold.setDate(weekThreshold.getDate() - 7);
  const newClientsThisWeek = contactRows.filter((row) => new Date(row.createdAt) >= weekThreshold).length;

  const firstName = user?.name?.split(" ").filter(Boolean)[0] || "there";
  const trialEndsAt = user?.trialEndsAt ? new Date(user.trialEndsAt) : null;
  const isTrialing = user?.subscriptionStatus === "trialing";
  const trialDaysRemaining =
    isTrialing && trialEndsAt && Number.isFinite(trialEndsAt.getTime())
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

  const weeklyRevenueRows = snapshotRows.slice(-12).map((row) => {
    return {
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(row.dateObj),
      value: Number(row.revenueTotal),
    };
  });

  const pipelineValue = dealRows.reduce((sum, row) => sum + Number(row.value), 0);
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

  const pipelineTrend = snapshotRows.slice(-7).map((row) => Number(row.pipelineValue));
  const winRateTrend = snapshotRows.slice(-7).map((row) => Number(row.winRate) * 100);
  const revenueTrend = snapshotRows.slice(-7).map((row) => Number(row.revenueTotal));
  const contactsTrend = snapshotRows.slice(-7).map((row) => Number(row.contactsTotal));

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
    <section className="animate-page-enter space-y-6">
      {typeof trialDaysRemaining === "number" ? (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          Trial: {trialDaysRemaining} day{trialDaysRemaining === 1 ? "" : "s"} remaining. Your plan activates on {formatLongDate(trialEndsAt!)}.
        </div>
      ) : null}

      <header className="space-y-2">
        <h1 className="text-3xl font-light tracking-tight text-foreground">
          Good {timeOfDay()}, <span className="font-semibold">{firstName}</span>
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{formatLongDate(today)}</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          <span className="text-primary">{sessionsToday}</span> sessions today · <span className="text-primary">{followUpsDue}</span> follow-ups due · <span className="text-primary">{newClientsThisWeek}</span> new {contactLabelPlural.toLowerCase()} this week
        </p>
      </header>

      {isNewUser ? (
        <div className="grid gap-4 lg:grid-cols-12">
          <article className="glass-card rounded-2xl border-l-2 border-l-primary p-6 lg:col-span-7">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Setup Guide</p>
                <h2 className="mt-1 text-2xl font-light tracking-tight text-foreground">Launch your CRM with confidence</h2>
              </div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">{completedChecklistCount} of {setupGuideItems.length} steps complete</p>
            </div>

            <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted)/0.5)]">
              <div className="h-full rounded-full bg-primary shadow-glass-teal" style={{ width: `${(completedChecklistCount / setupGuideItems.length) * 100}%` }} />
            </div>

            <ul className="space-y-3">
              {setupGuideItems.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className={`flex items-center justify-between rounded-xl border p-4 transition ${
                      item.done ? "border-primary/25 bg-primary/10" : "border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] hover:border-[hsl(var(--border))]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {item.done ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />}
                      <span className={`text-sm ${item.done ? "text-[hsl(var(--muted-foreground))] line-through" : "text-foreground"}`}>{item.label}</span>
                    </div>
                    {!item.done ? <ArrowRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </article>

          <div className="space-y-4 lg:col-span-5">
            <article className="glass-card rounded-2xl p-6">
              <p className="text-xs font-medium uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Quick Actions</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Link href="/contacts" className="glass-card rounded-xl p-4 text-sm text-foreground hover:text-foreground">
                  Add {contactLabelSingular}
                </Link>
                <Link href="/deals" className="glass-card rounded-xl p-4 text-sm text-foreground hover:text-foreground">
                  Create {dealLabelSingular}
                </Link>
                <Link href="/bookings" className="glass-card rounded-xl p-4 text-sm text-foreground hover:text-foreground">
                  Share Booking Page
                </Link>
              </div>
            </article>

            <article className="glass-card rounded-2xl p-6">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Recent Activity</p>
              {activityRows.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Activities will appear here as you work</p>
              ) : (
                <ul className="space-y-2">
                  {activityRows.slice(0, 5).map((item) => {
                    const linkedContact = item.contactId ? contactById.get(item.contactId) : null;
                    const name = linkedContact ? `${linkedContact.firstName} ${linkedContact.lastName ?? ""}`.trim() : contactLabelSingular;
                    return (
                      <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--border))] px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-foreground">{item.subject ?? `${item.type} activity`}</p>
                          <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{name}</p>
                        </div>
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">{new Date(item.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={`Total ${contactLabelPlural}`}
              value={contactRows.length.toLocaleString()}
              icon={<Users className="h-4 w-4" />}
              trendPoints={contactsTrend}
            />
            <StatCard
              label="Pipeline Value"
              value={formatCurrency(pipelineValue)}
              icon={<DollarSign className="h-4 w-4" />}
              trendPoints={pipelineTrend}
            />
            <StatCard
              label="Win Rate"
              value={`${winRate.toFixed(1)}%`}
              icon={<Zap className="h-4 w-4" />}
              trendPoints={winRateTrend}
            />
            <StatCard
              label="Revenue"
              value={formatCurrency(revenueTotal)}
              icon={<DollarSign className="h-4 w-4" />}
              trendPoints={revenueTrend}
            />
          </div>

          {weeklyRevenueRows.length > 0 ? (
            <RevenueChartCard
              title="Revenue Over Time"
              data={weeklyRevenueRows}
              ranges={["30 days", "6 months", "12 months"]}
            />
          ) : null}

          {opportunityRows.length > 0 || upcomingSessionRows.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {opportunityRows.length > 0 ? (
                <article className="glass-card rounded-2xl p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Top Opportunities</p>
                    <Link href="/deals" className="text-sm text-primary hover:underline">
                      View All →
                    </Link>
                  </div>

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                        <th className="py-2">Contact</th>
                        <th className="py-2">Value</th>
                        <th className="py-2">Stage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opportunityRows.map((row) => {
                        const contactName = row.contact ? `${row.contact.firstName} ${row.contact.lastName ?? ""}`.trim() : row.title;
                        return (
                          <tr key={row.id} className="group min-h-[52px] hover:bg-[hsl(var(--muted)/0.35)]">
                            <td className="py-3 text-sm text-foreground">
                              <Link href={`/deals/${row.id}`} className="hover:text-primary">
                                {contactName}
                              </Link>
                            </td>
                            <td className="py-3 text-sm text-foreground">${row.value.toLocaleString()}</td>
                            <td className="py-3">
                              <span className="inline-flex rounded-md border border-[hsl(var(--border))] px-2 py-1 text-xs text-[hsl(var(--muted-foreground))]">{row.stage}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </article>
              ) : null}

              {upcomingSessionRows.length > 0 ? (
                <article className="glass-card rounded-2xl p-6">
                  <p className="mb-4 text-xs font-medium uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Upcoming Sessions</p>
                  <ul className="space-y-3">
                    {upcomingSessionRows.map((booking) => {
                      const linkedContact = booking.contactId ? contactById.get(booking.contactId) : null;
                      const person = linkedContact ? `${linkedContact.firstName} ${linkedContact.lastName ?? ""}`.trim() : contactLabelSingular;
                      const startsAt = new Date(booking.startsAt);
                      return (
                        <li key={booking.id} className="rounded-xl border border-[hsl(var(--border))] p-3 hover:bg-[hsl(var(--muted)/0.35)]">
                          <p className="flex items-center gap-2 text-sm text-foreground">
                            <Clock3 className="h-4 w-4 text-primary" />
                            <span className="text-primary">{startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                            <span className="text-[hsl(var(--muted-foreground))]">· {person}</span>
                          </p>
                          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{startsAt.toLocaleDateString([], { month: "short", day: "numeric" })} · {booking.title}</p>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ) : null}
            </div>
          ) : null}
        </>
      )}

    </section>
  );
}
