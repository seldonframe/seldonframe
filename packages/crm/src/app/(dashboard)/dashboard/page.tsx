import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Clock3, DollarSign, Users, Zap } from "lucide-react";
import { db } from "@/db";
import { activities, bookings, emails, landingPages, metricsSnapshots, paymentRecords } from "@/db/schema";
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

function percentChange(current: number, previous: number) {
  if (!previous) {
    return null;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
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
      <p className="text-xs font-medium uppercase tracking-widest text-white/40">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-3xl font-semibold text-white">{value}</p>
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

  const [snapshotRowsRaw, taskRows, appointmentTypeRows, landingRows, sentEmailRows, paymentRows] = await Promise.all([
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
  ]);

  const contactById = new Map(contactRows.map((contact) => [contact.id, contact]));
  const snapshotRows = snapshotRowsRaw.map((row) => ({ ...row, dateObj: toUtcDate(row.date) }));
  const contactLabelSingular = soul?.entityLabels?.contact?.singular || "Contact";
  const contactLabelPlural = soul?.entityLabels?.contact?.plural || "Contacts";
  const dealLabelSingular = soul?.entityLabels?.deal?.singular || "Deal";

  const isNewUser = contactRows.length < 5 && dealRows.length < 3;
  const completedChecklistCount = [
    contactRows.length > 0,
    dealRows.length > 0,
    appointmentTypeRows.length > 0,
    landingRows.length > 0,
    sentEmailRows.length > 0,
  ].filter(Boolean).length;

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

  const followUpsDue = taskRows.filter((task) => {
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

  const trendRows = snapshotRows.slice(-30).map((row) => ({
    label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(row.dateObj),
    revenueTotal: Number(row.revenueTotal),
  }));

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

  const latestSnapshot = snapshotRows.at(-1);
  const previousSnapshot = snapshotRows.length > 1 ? snapshotRows[snapshotRows.length - 2] : null;
  const pipelineDelta = latestSnapshot && previousSnapshot ? percentChange(Number(latestSnapshot.pipelineValue), Number(previousSnapshot.pipelineValue)) : null;
  const winRateDelta = latestSnapshot && previousSnapshot ? percentChange(Number(latestSnapshot.winRate) * 100, Number(previousSnapshot.winRate) * 100) : null;
  const revenueDelta = latestSnapshot && previousSnapshot ? percentChange(Number(latestSnapshot.revenueTotal), Number(previousSnapshot.revenueTotal)) : null;

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
      <header className="space-y-2">
        <h1 className="text-3xl font-light tracking-tight text-white">
          Good {timeOfDay()}, <span className="font-semibold">{firstName}</span>
        </h1>
        <p className="text-sm text-white/40">
          <span className="text-primary">{sessionsToday}</span> sessions today · <span className="text-primary">{followUpsDue}</span> follow-ups due · <span className="text-primary">{newClientsThisWeek}</span> new {contactLabelPlural.toLowerCase()} this week
        </p>
      </header>

      {isNewUser ? (
        <div className="grid gap-4 lg:grid-cols-12">
          <article className="glass-card rounded-2xl p-6 lg:col-span-7">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-white/50">Getting Started</p>
                <h2 className="mt-1 text-2xl font-light tracking-tight text-white">Let&apos;s set up your practice</h2>
              </div>
              <p className="text-sm text-white/70">{completedChecklistCount} of 5 steps complete</p>
            </div>

            <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-primary shadow-glass-teal" style={{ width: `${(completedChecklistCount / 5) * 100}%` }} />
            </div>

            <ul className="space-y-3">
              {[
                { href: "/contacts", label: `Add your first ${contactLabelSingular}`, done: contactRows.length > 0 },
                { href: "/deals", label: `Create your first ${dealLabelSingular}`, done: dealRows.length > 0 },
                { href: "/bookings", label: "Set up your Booking page", done: appointmentTypeRows.length > 0 },
                { href: "/landing", label: "Create a Landing page", done: landingRows.length > 0 },
                { href: "/emails", label: "Send your first email", done: sentEmailRows.length > 0 },
              ].map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className={`flex items-center justify-between rounded-xl border p-4 transition ${
                      item.done ? "border-primary/25 bg-primary/10" : "border-white/10 bg-white/2 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {item.done ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-white/50" />}
                      <span className={`text-sm ${item.done ? "text-white/55 line-through" : "text-white/85"}`}>{item.label}</span>
                    </div>
                    {!item.done ? <ArrowRight className="h-4 w-4 text-white/60" /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </article>

          <div className="space-y-4 lg:col-span-5">
            <article className="glass-card rounded-2xl p-6">
              <p className="text-xs font-medium uppercase tracking-widest text-white/50">Quick Actions</p>
              <div className="mt-4 grid gap-3">
                <Link href="/contacts" className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-[hsl(var(--primary-foreground))] shadow-glass-teal">
                  Add {contactLabelSingular}
                </Link>
                <Link href="/deals" className="inline-flex h-11 items-center justify-center rounded-lg border border-white/10 bg-transparent px-6 text-sm font-medium text-primary hover:bg-white/5">
                  Create {dealLabelSingular}
                </Link>
                <Link href="/bookings" className="inline-flex h-11 items-center justify-center rounded-lg border border-white/10 bg-transparent px-6 text-sm font-medium text-primary hover:bg-white/5">
                  Share Booking Link
                </Link>
              </div>
            </article>

            <article className="flex min-h-40 items-center justify-center rounded-2xl border-2 border-dashed border-white/10 p-6 text-center">
              <p className="text-sm text-white/30">Your activity timeline will come alive as you work</p>
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
                    <p className="text-xs font-medium uppercase tracking-widest text-white/50">Top Opportunities</p>
                    <Link href="/deals" className="text-sm text-primary hover:underline">
                      View All →
                    </Link>
                  </div>

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-medium uppercase tracking-wider text-white/40">
                        <th className="py-2">Contact</th>
                        <th className="py-2">Value</th>
                        <th className="py-2">Stage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opportunityRows.map((row) => {
                        const contactName = row.contact ? `${row.contact.firstName} ${row.contact.lastName ?? ""}`.trim() : row.title;
                        return (
                          <tr key={row.id} className="group min-h-[52px] hover:bg-white/5">
                            <td className="py-3 text-sm text-white/80">
                              <Link href={`/deals/${row.id}`} className="hover:text-primary">
                                {contactName}
                              </Link>
                            </td>
                            <td className="py-3 text-sm text-white/80">${row.value.toLocaleString()}</td>
                            <td className="py-3">
                              <span className="inline-flex rounded-md border border-white/10 px-2 py-1 text-xs text-white/70">{row.stage}</span>
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
                  <p className="mb-4 text-xs font-medium uppercase tracking-widest text-white/50">Upcoming Sessions</p>
                  <ul className="space-y-3">
                    {upcomingSessionRows.map((booking) => {
                      const linkedContact = booking.contactId ? contactById.get(booking.contactId) : null;
                      const person = linkedContact ? `${linkedContact.firstName} ${linkedContact.lastName ?? ""}`.trim() : contactLabelSingular;
                      const startsAt = new Date(booking.startsAt);
                      return (
                        <li key={booking.id} className="rounded-xl border border-white/10 p-3 hover:bg-white/5">
                          <p className="flex items-center gap-2 text-sm text-white">
                            <Clock3 className="h-4 w-4 text-primary" />
                            <span className="text-primary">{startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                            <span className="text-white/60">· {person}</span>
                          </p>
                          <p className="mt-1 text-xs text-white/50">{startsAt.toLocaleDateString([], { month: "short", day: "numeric" })} · {booking.title}</p>
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

      <div className="hidden">
        {pipelineDelta}
        {winRateDelta}
        {revenueDelta}
        {trendRows.length}
      </div>
    </section>
  );
}
