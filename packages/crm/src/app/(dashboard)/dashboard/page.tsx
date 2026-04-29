import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import Link from "next/link";
import { DollarSign, Users, CalendarDays, Activity, Plus, ChartLine, MoreHorizontal, BarChart2, ClipboardList, Search, Filter, FileInput, Sparkles } from "lucide-react";
import { db } from "@/db";
import { activities, bookings as bookingsTable, contacts as contactsTable, metricsSnapshots, organizations, orgMembers, paymentRecords, pipelines as pipelinesTable, stripeConnections, type OrganizationIntegrations, type PipelineStage } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/helpers";
import { listAppointmentTypes } from "@/lib/bookings/actions";
import { listBookings } from "@/lib/bookings/actions";
import { listContacts } from "@/lib/contacts/actions";
import { listDeals } from "@/lib/deals/actions";
import { listEmailTemplates } from "@/lib/emails/actions";
import { listForms } from "@/lib/forms/actions";
import { listLandingPages } from "@/lib/landing/actions";
import { getSoul } from "@/lib/soul/server";
import { getHiddenBlocks } from "@/lib/blocks/visibility-actions";
import { BlockVisibilityToggle } from "@/components/dashboard/block-visibility-toggle";
import { setActiveOrgAction } from "@/lib/billing/orgs";
import { DealsCrmSurface } from "@/components/crm/deals-crm-surface";
import { getCrmSurfaceConfig } from "@/lib/crm/view-config";
import { mapDealRowToCrmRecord } from "@/lib/crm/view-models";

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

function formatFrameworkLabel(soulId: string | null) {
  if (!soulId) {
    return "Custom";
  }

  return soulId.charAt(0).toUpperCase() + soulId.slice(1);
}

function getWorkspaceInitials(name: string) {
  const parts = name.split(" ").filter(Boolean).slice(0, 2);
  if (parts.length === 0) {
    return "WS";
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function getWorkspaceStatus(isActive: boolean, contactCount: number) {
  if (isActive) {
    return "Active workspace";
  }

  if (contactCount > 0) {
    return "Live with clients";
  }

  return "Ready to launch";
}

function TrendText({ value }: { value: number }) {
  const rounded = Math.round(value);
  const isPositive = rounded > 0;
  const isNegative = rounded < 0;
  const textClass = isPositive ? "text-positive" : isNegative ? "text-negative" : "text-caution";
  const symbol = isPositive ? "↑" : isNegative ? "↓" : "→";

  return (
    <span className={textClass}>
      {symbol} {Math.abs(rounded)}%
    </span>
  );
}

function stageBadgeClass(stage: string) {
  const value = stage.toLowerCase();

  if (/churn|lost|closed lost/.test(value)) {
    return "border-negative/20 bg-negative/10 text-negative";
  }

  if (/enrolled|active|converted|won|closed won|retainer/.test(value)) {
    return "border-positive/20 bg-positive/10 text-positive";
  }

  if (/completed|alumni|done/.test(value)) {
    return "border-border bg-muted/50 text-muted-foreground";
  }

  if (/discovery|proposal|qualified|negotiation|review|handoff|strategy/.test(value)) {
    return "border-caution/20 bg-caution/10 text-caution";
  }

  if (/inquiry|lead|signed up|new/.test(value)) {
    return "border-[hsl(220_70%_55%_/_0.2)] bg-[hsl(220_70%_55%_/_0.1)] text-[hsl(220_70%_45%)]";
  }

  return "border-border bg-muted/50 text-muted-foreground";
}

function StatCard({
  label,
  value,
  icon,
  trendPercent,
  deltaLabel,
  accentBorderClass,
  iconBadgeClass,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  trendPercent: number;
  deltaLabel: string;
  accentBorderClass: string;
  iconBadgeClass: string;
}) {
  return (
    <article className={`flex items-start rounded-lg border-t-2 pt-3 ${accentBorderClass}`}>
      <div className="flex-1 space-y-2 sm:space-y-4 lg:space-y-6">
        <div className="flex items-center gap-1 sm:gap-1.5 text-muted-foreground">
          <span className={`inline-flex size-6 items-center justify-center rounded-md ${iconBadgeClass}`}>{icon}</span>
          <span className="text-[10px] sm:text-xs lg:text-sm font-medium truncate">{label}</span>
        </div>
        <p className="text-lg sm:text-xl lg:text-[28px] font-semibold leading-tight tracking-tight">{value}</p>
        <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-[10px] sm:text-xs lg:text-sm font-medium">
          <span className="inline-flex items-center gap-0.5">
            <TrendText value={trendPercent} />
            <span className="hidden sm:inline text-inherit">({deltaLabel})</span>
          </span>
          <span className="text-muted-foreground hidden sm:inline">vs last month</span>
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string; workspace?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;

  // `?workspace=<id>` redirects through /switch-workspace so the active-org
  // cookie is set before the layout reads it. Handles bookmarked admin URLs
  // that bypass /switch-workspace directly.
  if (params?.workspace) {
    const { redirect } = await import("next/navigation");
    redirect(
      `/switch-workspace?to=${encodeURIComponent(params.workspace)}&next=/dashboard`
    );
  }
  const [user, contactRows, dealRows, bookingRows, appointmentTypeRows, emailTemplateRows, landingPageRows, intakeFormRows, soul, hiddenBlocks] = await Promise.all([
    getCurrentUser(),
    listContacts(),
    listDeals(),
    listBookings(),
    listAppointmentTypes(),
    listEmailTemplates(),
    listLandingPages(),
    listForms(),
    getSoul(),
    getHiddenBlocks(),
  ]);
  const orgId = user?.orgId;

  if (!orgId) {
    return null;
  }

  const membershipRows = user?.id
    ? await db
        .select({ orgId: orgMembers.orgId })
        .from(orgMembers)
        .where(eq(orgMembers.userId, user.id))
    : [];

  const membershipOrgIds = membershipRows.map((row) => row.orgId);
  console.error("[ORG-LIST-DIAG]", {
    tag: "dashboard.workspaceRows",
    requestPath: "/dashboard",
    host: "unknown",
    pid: process.pid,
    membershipIdsRaw: membershipOrgIds,
    isArray: Array.isArray(membershipOrgIds),
    typeofValue: typeof membershipOrgIds,
    length: Array.isArray(membershipOrgIds) ? membershipOrgIds.length : null,
    userId: user?.id ?? null,
    userOrgId: user?.orgId ?? null,
  });
  const directWorkspaceRows = user?.id
    ? await db
        .select({
          id: organizations.id,
          name: organizations.name,
          soulId: organizations.soulId,
          slug: organizations.slug,
          ownerId: organizations.ownerId,
          parentUserId: organizations.parentUserId,
        })
        .from(organizations)
        .where(
          or(
            eq(organizations.ownerId, user.id),
            eq(organizations.parentUserId, user.id),
            eq(organizations.id, user.orgId)
          )
        )
    : [];

  const membershipWorkspaceRows = user?.id
    ? (
        await Promise.all(
          membershipOrgIds.map((membershipOrgId) =>
            db
              .select({
                id: organizations.id,
                name: organizations.name,
                soulId: organizations.soulId,
                slug: organizations.slug,
                ownerId: organizations.ownerId,
                parentUserId: organizations.parentUserId,
              })
              .from(organizations)
              .where(eq(organizations.id, membershipOrgId))
              .limit(1)
          )
        )
      ).flat()
    : [];

  const workspaceRows = Array.from(new Map([...directWorkspaceRows, ...membershipWorkspaceRows].map((row) => [row.id, row])).values());

  const workspaceStats = await Promise.all(
    workspaceRows.map(async (workspace) => {
      const [contactCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(contactsTable)
        .where(eq(contactsTable.orgId, workspace.id));

      const monthlyRevenueRows = await db
        .select({ amount: paymentRecords.amount })
        .from(paymentRecords)
        .where(eq(paymentRecords.orgId, workspace.id));

      const monthlyRevenue = monthlyRevenueRows.reduce((sum, row) => sum + Number(row.amount), 0);

      return {
        orgId: workspace.id,
        contactCount: Number(contactCount?.count ?? 0),
        monthlyRevenue,
      };
    })
  );

  const workspaceStatMap = new Map(workspaceStats.map((row) => [row.orgId, row]));
  const totalWorkspaceContacts = workspaceStats.reduce((sum, row) => sum + row.contactCount, 0);
  const totalWorkspaceRevenue = workspaceStats.reduce((sum, row) => sum + row.monthlyRevenue, 0);

  const showWorkspaceTabs = workspaceRows.length > 1;
  const activeDashboardView = showWorkspaceTabs ? (params?.view === "workspace" ? "workspace" : "all") : "workspace";

  const [snapshotRowsRaw, activityRows, paymentRows, orgRow, stripeRow, bookingTemplateRow, defaultPipelineRow, dealsSurface] = await Promise.all([
    db.select().from(metricsSnapshots).where(eq(metricsSnapshots.orgId, orgId)).orderBy(asc(metricsSnapshots.date)).limit(180),
    db.select().from(activities).where(eq(activities.orgId, orgId)).orderBy(desc(activities.createdAt)).limit(20),
    db
      .select({ amount: paymentRecords.amount, createdAt: paymentRecords.createdAt })
      .from(paymentRecords)
      .where(eq(paymentRecords.orgId, orgId)),
    db
      .select({ slug: organizations.slug, settings: organizations.settings, integrations: organizations.integrations })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({ id: stripeConnections.id })
      .from(stripeConnections)
      .where(eq(stripeConnections.orgId, orgId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    // Booking template row (filtered out by listBookings, which only returns
    // real scheduled bookings). We need the template for the preview card.
    db
      .select({
        id: bookingsTable.id,
        title: bookingsTable.title,
        bookingSlug: bookingsTable.bookingSlug,
        metadata: bookingsTable.metadata,
        createdAt: bookingsTable.createdAt,
      })
      .from(bookingsTable)
      .where(
        and(eq(bookingsTable.orgId, orgId), eq(bookingsTable.status, "template"))
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        stages: pipelinesTable.stages,
        name: pipelinesTable.name,
      })
      .from(pipelinesTable)
      .where(
        and(eq(pipelinesTable.orgId, orgId), eq(pipelinesTable.isDefault, true))
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    // Schema-driven deals surface config — gives us the BLOCK.md + scoped
    // overrides the kanban renderer reads from. Sourced the same way as
    // /deals/pipeline so the dashboard preview stays in lockstep with the
    // full kanban surface (no drift in view metadata).
    getCrmSurfaceConfig({ orgId, entity: "deals", clientId: null }).catch(
      () => null
    ),
  ]);

  const contactById = new Map(contactRows.map((contact) => [contact.id, contact]));
  const snapshotRows = snapshotRowsRaw.map((row) => ({ ...row, dateObj: toUtcDate(row.date) }));
  const contactLabelSingular = soul?.entityLabels?.contact?.singular || "Contact";
  const contactLabelPlural = soul?.entityLabels?.contact?.plural || "Contacts";
  const integrations = ((orgRow?.integrations ?? {}) as OrganizationIntegrations) || {};
  const settings = ((orgRow?.settings ?? {}) as Record<string, unknown>) || {};
  const enabledAutomations = Array.isArray(settings.enabledAutomations) ? settings.enabledAutomations.filter((item): item is string => typeof item === "string") : [];
  const newsletterConnected = Boolean(integrations.newsletter?.connected || integrations.kit?.connected);
  const googleConnected = Boolean(integrations.google?.calendarConnected);
  const twilioConnected = Boolean(integrations.twilio?.connected);
  const stripeConnected = Boolean(stripeRow);
  const hasConnectedIntegrations = newsletterConnected || googleConnected || twilioConnected || stripeConnected;
  const bookingLinkSlug = appointmentTypeRows[0]?.bookingSlug || "default";
  const bookingPublicPath = orgRow?.slug ? `/book/${orgRow.slug}/${bookingLinkSlug}` : "/book";
  const bookingShared = appointmentTypeRows.length > 0 && bookingRows.length > 0;

  // === Newly installed blocks strip ===
  // Highlights freshly seeded blocks (booking template, intake form, deal
  // pipeline) on first visit so the workspace doesn't look empty when nothing
  // has been booked / submitted / closed yet. Each card pulls live row data
  // and the "New" pill flips on for 7 days from createdAt — long enough that
  // a builder coming back tomorrow still sees the upgrade narrative, short
  // enough that established workspaces aren't shouting "new" forever.
  const NEW_BADGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const isFresh = (createdAt: Date | string | null | undefined) => {
    if (!createdAt) return false;
    const ts = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
    return Number.isFinite(ts) && Date.now() - ts < NEW_BADGE_WINDOW_MS;
  };

  const defaultIntakeForm =
    intakeFormRows.find((row) => row.slug === "intake") ?? intakeFormRows[0] ?? null;

  const bookingTemplateMeta =
    (bookingTemplateRow?.metadata ?? null) as
      | { durationMinutes?: number; appointmentDescription?: string; theme?: string }
      | null;

  const bookingPreviewPath = orgRow?.slug
    ? `/book/${orgRow.slug}/${bookingTemplateRow?.bookingSlug ?? "default"}`
    : null;
  const intakePreviewPath = orgRow?.slug
    ? `/forms/${orgRow.slug}/${defaultIntakeForm?.slug ?? "intake"}`
    : null;

  // Pipeline visualization: count deals + sum value per stage. Uses the
  // default pipeline's declared stage list (not just stages observed in deals)
  // so an empty pipeline still renders the columns the builder will fill in.
  const pipelineStages: PipelineStage[] = defaultPipelineRow?.stages ?? [];
  const dealsByStage = new Map<string, { count: number; value: number }>();
  for (const stage of pipelineStages) {
    dealsByStage.set(stage.name, { count: 0, value: 0 });
  }
  for (const deal of dealRows) {
    const bucket = dealsByStage.get(deal.stage) ?? { count: 0, value: 0 };
    bucket.count += 1;
    bucket.value += Number(deal.value);
    dealsByStage.set(deal.stage, bucket);
  }
  const maxStageCount = Math.max(1, ...Array.from(dealsByStage.values()).map((b) => b.count));
  const totalDealValue = dealRows.reduce((sum, d) => sum + Number(d.value), 0);

  const intakeFieldList = Array.isArray(defaultIntakeForm?.fields)
    ? (defaultIntakeForm!.fields as Array<{ key: string; label: string }>)
    : [];

  // === Pipeline kanban embed ===
  // Same data path as /deals/pipeline — schema-driven blockMd + scoped
  // overrides + adapter-mapped CrmRecord[] — so the dashboard preview can't
  // drift from the full surface. Stage colors come from the pipeline schema.
  const stageColorMap = Object.fromEntries(
    pipelineStages.filter((stage) => Boolean(stage.color)).map((stage) => [stage.name, stage.color])
  );
  const stageProbabilityMap = Object.fromEntries(
    pipelineStages.map((stage) => [stage.name, stage.probability])
  );
  const contactNameById = new Map(
    contactRows.map((contact) => [
      contact.id,
      `${contact.firstName} ${contact.lastName ?? ""}`.trim() || contactLabelSingular,
    ])
  );
  const dealCrmRecords = dealRows.map((deal) =>
    mapDealRowToCrmRecord({
      row: deal,
      contactName: contactNameById.get(deal.contactId) || contactLabelSingular,
      href: `/deals/${deal.id}`,
    })
  );
  // Resolve the kanban view defined for the pipeline route. If the BLOCK.md
  // doesn't expose one we just hide the embed rather than render an empty box.
  const kanbanPipelineView = dealsSurface?.parsed.views.find(
    (candidate) => candidate.type === "kanban" && candidate.route === "/deals/pipeline"
  );
  const showPipelineEmbed = Boolean(dealsSurface && kanbanPipelineView);
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

  // Greeting target — fall back through, in order:
  //   1. The operator's actual first name (regular NextAuth users)
  //   2. The active workspace's name (admin-token sessions, or anyone
  //      whose user.name is the synthetic "Workspace Admin" placeholder)
  //   3. "there" as a last-resort neutral default
  // Pre-launch bug: admin-token sessions had user.name = "Workspace Admin",
  // which split[0] = "Workspace" — so the greeting read "Good afternoon,
  // Workspace". Now we detect that placeholder and substitute the
  // workspace's real name.
  const activeWorkspaceName =
    workspaceRows.find((row) => row.id === orgId)?.name ?? null;
  const rawFirstName = user?.name?.split(" ").filter(Boolean)[0] ?? "";
  const firstName =
    rawFirstName && rawFirstName !== "Workspace"
      ? rawFirstName
      : activeWorkspaceName || "there";
  const trialEndsAt = user?.trialEndsAt ? new Date(user.trialEndsAt) : null;
  const isTrialing = user?.subscriptionStatus === "trialing";
  const trialDaysRemaining =
    isTrialing && trialEndsAt && Number.isFinite(trialEndsAt.getTime())
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

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

  const revenueFlowData = snapshotRows.slice(-6).map((row, index, all) => {
    const current = Number(row.revenueTotal);
    const previous = index > 0 ? Number(all[index - 1]?.revenueTotal ?? current * 0.8) : current * 0.8;
    return {
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(row.dateObj),
      thisYear: current,
      prevYear: previous,
    };
  });

  const hasRevenueHistory = revenueFlowData.length > 1;
  const revenueSeries = hasRevenueHistory
    ? revenueFlowData
    : [{ label: "Now", thisYear: Math.max(monthlyRevenue || revenueTotal || 1, 1), prevYear: 0 }];
  const revenueMax = Math.max(...revenueSeries.flatMap((item) => [item.thisYear, item.prevYear]), 1);
  const totalRevenueForCard = revenueSeries.reduce((sum, item) => sum + item.thisYear, 0);
  const topTick = Math.max(60, Math.ceil(revenueMax / 10000) * 10);
  const yTicks = [topTick, Math.round(topTick * 0.75), Math.round(topTick * 0.5), Math.round(topTick * 0.25), 0];

  const leadSourceBuckets = [
    { name: "Calls", count: activityRows.filter((row) => row.type === "call").length, color: "#35b9e9" },
    { name: "Emails", count: activityRows.filter((row) => row.type === "email").length, color: "#6e3ff3" },
    { name: "Meetings", count: activityRows.filter((row) => row.type === "meeting").length, color: "#375dfb" },
    { name: "Tasks", count: activityRows.filter((row) => row.type === "task").length, color: "#e255f2" },
  ];

  const totalLeadSources = leadSourceBuckets.reduce((sum, row) => sum + row.count, 0);
  let donutOffset = 0;
  const donutStops =
    totalLeadSources > 0
      ? leadSourceBuckets
          .map((row) => {
            const start = donutOffset;
            donutOffset += (row.count / totalLeadSources) * 100;
            return `${row.color} ${start.toFixed(2)}% ${donutOffset.toFixed(2)}%`;
          })
          .join(", ")
      : "var(--muted) 0% 100%";

  const stats = [
    {
      label: `Total ${contactLabelPlural}`,
      value: contactRows.length.toLocaleString(),
      icon: <Users className="size-3.5 sm:size-[18px] text-primary" />,
      trend: percentChange(contactsThisMonth, contactsPreviousMonth),
      deltaLabel: `${Math.abs(contactsThisMonth - contactsPreviousMonth).toLocaleString()}`,
      accentBorderClass: "border-primary",
      iconBadgeClass: "bg-primary/10",
    },
    {
      label: "Active Engagements",
      value: activeEngagements.toLocaleString(),
      icon: <Activity className="size-3.5 sm:size-[18px] text-caution" />,
      trend: percentChange(activeEngagements, activeEngagementsPrev),
      deltaLabel: `${Math.abs(activeEngagements - activeEngagementsPrev).toLocaleString()}`,
      accentBorderClass: "border-caution",
      iconBadgeClass: "bg-caution/10",
    },
    {
      label: "Bookings This Month",
      value: bookingsThisMonth.toLocaleString(),
      icon: <CalendarDays className="size-3.5 sm:size-[18px] text-[hsl(220_70%_55%)]" />,
      trend: percentChange(bookingsThisMonth, bookingsPreviousMonth),
      deltaLabel: `${Math.abs(bookingsThisMonth - bookingsPreviousMonth).toLocaleString()}`,
      accentBorderClass: "border-[hsl(220_70%_55%)]",
      iconBadgeClass: "bg-[hsl(220_70%_55%_/_0.1)]",
    },
    {
      label: "Revenue",
      value: formatCurrency(monthlyRevenue),
      icon: <DollarSign className="size-3.5 sm:size-[18px] text-positive" />,
      trend: percentChange(monthlyRevenue, previousMonthRevenue),
      deltaLabel: formatCurrency(Math.abs(monthlyRevenue - previousMonthRevenue)),
      accentBorderClass: "border-positive",
      iconBadgeClass: "bg-positive/10",
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
    <main className="animate-page-enter flex-1 overflow-auto w-full space-y-5 p-3 sm:space-y-6 sm:p-4 md:p-6">
      <div className="rounded-2xl border border-border/80 bg-background/30 px-4 py-3 text-sm text-muted-foreground">
        For the best experience, use Seldon directly from Claude Code with our MCP + Skill.
      </div>

      {showWorkspaceTabs ? (
        <div className="inline-flex items-center rounded-xl border border-border/80 bg-card/75 p-1 shadow-(--shadow-xs)">
          <Link
            href="/dashboard?view=workspace"
            className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors sm:text-sm ${
              activeDashboardView === "workspace" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            Active Workspace
          </Link>
          <Link
            href="/dashboard?view=all"
            className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors sm:text-sm ${
              activeDashboardView === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            All Workspaces
          </Link>
        </div>
      ) : null}

      {activeDashboardView === "all" ? (
        <section className="crm-card space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-semibold">Your Client Workspaces</h2>
              <p className="text-sm text-muted-foreground">A calm overview of every client workspace.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/orgs/new" className="crm-button-secondary h-9 px-4 text-xs sm:text-sm">
                Create New Client OS
              </Link>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {workspaceRows.map((workspace) => {
              const stat = workspaceStatMap.get(workspace.id);
              const isActiveWorkspace = workspace.id === orgId;

              return (
                <article key={workspace.id} className="rounded-2xl border border-border/80 bg-background/35 p-5 shadow-(--shadow-xs)">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-card text-sm font-semibold text-foreground">
                        {getWorkspaceInitials(workspace.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{workspace.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{formatFrameworkLabel(workspace.soulId)} OS · /{workspace.slug}</p>
                      </div>
                    </div>
                    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${isActiveWorkspace ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground"}`}>
                      {getWorkspaceStatus(isActiveWorkspace, stat?.contactCount ?? 0)}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-border/70 bg-card/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Clients</p>
                      <p className="mt-1 text-base font-semibold text-foreground">{(stat?.contactCount ?? 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-card/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Revenue</p>
                      <p className="mt-1 text-base font-semibold text-foreground">{formatCurrency(stat?.monthlyRevenue ?? 0)}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={setActiveOrgAction}>
                      <input type="hidden" name="orgId" value={workspace.id} />
                      <input type="hidden" name="redirectTo" value="/dashboard?view=workspace" />
                      <button type="submit" className="crm-button-secondary h-9 px-4 text-xs sm:text-sm">
                        Open dashboard
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>

          <p className="text-sm text-muted-foreground">
            Totals: <span className="text-foreground font-medium">{workspaceRows.length} workspaces</span> · {" "}
            <span className="text-foreground font-medium">{totalWorkspaceContacts.toLocaleString()} clients</span> · {" "}
            <span className="text-foreground font-medium">{formatCurrency(totalWorkspaceRevenue)}/mo revenue</span>
          </p>
        </section>
      ) : (
        <>
      {typeof trialDaysRemaining === "number" ? (
        <div className="rounded-2xl border border-primary/25 bg-primary/8 px-4 py-3.5 text-sm text-primary shadow-(--shadow-xs)">
          Trial: {trialDaysRemaining} day{trialDaysRemaining === 1 ? "" : "s"} remaining. Your plan activates on {formatLongDate(trialEndsAt!)}.
        </div>
      ) : null}

      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end sm:gap-8">
        <div className="space-y-2 sm:space-y-4">
          <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">
            Good {timeOfDay()}, {firstName}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            This is your calm workspace overview.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/orgs/new" className="crm-button-secondary h-8 gap-2 px-3 text-xs sm:h-9 sm:gap-3 sm:text-sm">
            <Plus className="size-3 sm:size-4" />
            <span>Create New Client OS</span>
          </Link>
        </div>
      </header>

      {(bookingTemplateRow || defaultIntakeForm || pipelineStages.length > 0) && (
        <section className="crm-card space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-foreground" />
                <h2 className="text-base sm:text-lg font-semibold">Newly installed blocks</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Live previews of what just shipped into this workspace. Share the public links or jump into the admin to customize.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Cal.diy booking preview */}
            {bookingTemplateRow ? (
              <div className="rounded-2xl border border-border/80 bg-background/35 p-4 space-y-3 transition-all hover:border-border hover:bg-accent/35">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-muted-foreground" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Booking</span>
                  </div>
                  {isFresh(bookingTemplateRow.createdAt) && (
                    <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background">
                      New
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">{bookingTemplateRow.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {bookingTemplateMeta?.durationMinutes ? `${bookingTemplateMeta.durationMinutes}-minute slot` : "Default availability"}
                    {bookingTemplateMeta?.theme ? ` · ${bookingTemplateMeta.theme} theme` : ""}
                  </p>
                  {bookingTemplateMeta?.appointmentDescription && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{bookingTemplateMeta.appointmentDescription}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {bookingPreviewPath && (
                    <Link href={bookingPreviewPath} target="_blank" rel="noopener noreferrer" className="crm-button-primary h-8 px-3 text-xs">
                      View public page
                    </Link>
                  )}
                  <Link href="/bookings" className="crm-button-secondary h-8 px-3 text-xs">Open admin</Link>
                </div>
              </div>
            ) : null}

            {/* Formbricks intake preview */}
            {defaultIntakeForm ? (
              <div className="rounded-2xl border border-border/80 bg-background/35 p-4 space-y-3 transition-all hover:border-border hover:bg-accent/35">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileInput className="size-4 text-muted-foreground" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Intake form</span>
                  </div>
                  {isFresh(defaultIntakeForm.createdAt) && (
                    <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background">
                      New
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <p className="text-base font-semibold text-foreground">{defaultIntakeForm.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {intakeFieldList.length} {intakeFieldList.length === 1 ? "field" : "fields"} configured
                  </p>
                  {intakeFieldList.length > 0 && (
                    <ul className="space-y-0.5 pt-0.5">
                      {intakeFieldList.slice(0, 3).map((field) => (
                        <li key={field.key} className="text-xs text-muted-foreground">· {field.label}</li>
                      ))}
                      {intakeFieldList.length > 3 && (
                        <li className="text-xs text-muted-foreground/70">+ {intakeFieldList.length - 3} more</li>
                      )}
                    </ul>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {intakePreviewPath && (
                    <Link href={intakePreviewPath} target="_blank" rel="noopener noreferrer" className="crm-button-primary h-8 px-3 text-xs">
                      View public page
                    </Link>
                  )}
                  <Link href="/forms" className="crm-button-secondary h-8 px-3 text-xs">Open admin</Link>
                </div>
              </div>
            ) : null}

            {/* CRM pipeline visualization */}
            {pipelineStages.length > 0 ? (
              <div className="rounded-2xl border border-border/80 bg-background/35 p-4 space-y-3 transition-all hover:border-border hover:bg-accent/35">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="size-4 text-muted-foreground" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pipeline</span>
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {dealRows.length} {dealRows.length === 1 ? "deal" : "deals"} · {formatCurrency(totalDealValue)}
                  </span>
                </div>
                <div className="space-y-2">
                  {pipelineStages.slice(0, 5).map((stage) => {
                    const bucket = dealsByStage.get(stage.name) ?? { count: 0, value: 0 };
                    const widthPct = Math.round((bucket.count / maxStageCount) * 100);
                    return (
                      <div key={stage.name} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="font-medium truncate">{stage.name}</span>
                          <span className="tabular-nums">{bucket.count}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-foreground/70"
                            style={{ width: `${Math.max(widthPct, bucket.count > 0 ? 6 : 0)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link href="/deals" className="crm-button-secondary h-8 px-3 text-xs">Open pipeline →</Link>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      )}

      {showPipelineEmbed && dealsSurface && kanbanPipelineView ? (
        <section className="crm-card space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BarChart2 className="size-4 text-foreground" />
                <h2 className="text-base sm:text-lg font-semibold">Pipeline</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Live kanban from BLOCK.md view metadata — stage colors, WIP limits, and lane totals all come from the pipeline schema.
              </p>
            </div>
            <Link
              href="/deals/pipeline"
              className="crm-button-secondary h-8 shrink-0 px-3 text-xs"
            >
              Open full kanban →
            </Link>
          </div>
          {/* Constrain height so the embed doesn't dominate the dashboard. The
              kanban itself is horizontally scrollable for >4 lanes. */}
          <div className="max-h-[520px] overflow-auto">
            <DealsCrmSurface
              blockMd={dealsSurface.blockMd}
              records={dealCrmRecords}
              stageProbabilities={stageProbabilityMap}
              stageColors={stageColorMap}
              scopedOverride={dealsSurface.scopedOverride}
              route="/deals/pipeline"
              viewName={kanbanPipelineView.name}
              readOnly
            />
          </div>
        </section>
      ) : null}

      <section className="crm-card space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-semibold">Your Blocks</h2>
        </div>
        {(() => {
          const allBlocks = [
            {
              slug: "bookings",
              name: "Booking",
              href: "/bookings",
              status: appointmentTypeRows.length > 0 ? "Active" : "Not set up",
              detail: `${appointmentTypeRows.length} types`,
              customizePrompt: "Customize my booking experience with a pre-call questionnaire and timezone-aware availability rules.",
            },
            {
              slug: "contacts",
              name: contactLabelPlural,
              href: "/contacts",
              status: "Active",
              detail: `${contactRows.length} records`,
              customizePrompt: "Customize my contacts workspace with custom fields and a smart enrichment flow for new records.",
            },
            {
              slug: "email",
              name: "Email",
              href: "/emails",
              status: emailTemplateRows.length > 0 ? "Active" : "Not set up",
              detail: `${emailTemplateRows.length} templates`,
              customizePrompt: "Customize my email templates with brand voice, conditional sections, and better follow-up timing.",
            },
            {
              slug: "pages",
              name: "Pages",
              href: "/landing",
              status: landingPageRows.length > 0 ? "Active" : "Not set up",
              detail: `${landingPageRows.length} pages`,
              customizePrompt: "Customize my landing pages with testimonials, comparison sections, and stronger conversion CTA blocks.",
            },
            {
              slug: "forms",
              name: "Forms",
              href: "/forms",
              status: intakeFormRows.length > 0 ? "Active" : "Not set up",
              detail: `${intakeFormRows.length} forms`,
              customizePrompt: "Customize my forms with branching logic and a cleaner intake flow based on user answers.",
            },
            {
              slug: "automations",
              name: "Automations",
              href: "/automations",
              status: enabledAutomations.length > 0 ? "Active" : "Not set up",
              detail: `${enabledAutomations.length} enabled`,
              customizePrompt: "Customize my automations with plain-language workflows and smarter follow-up actions.",
            },
            {
              slug: "payments",
              name: "Payments",
              href: "/settings/integrations",
              status: stripeConnected ? "Connected externally" : "Not set up",
              detail: stripeConnected ? "Stripe connected" : "Connect Stripe",
              customizePrompt: "Customize my payments setup with installment plans and clearer billing reminders.",
            },
            {
              slug: "seldon",
              name: "Seldon It",
              href: "/seldon",
              status: "Active",
              detail: "Build anything",
              customizePrompt: "Help me customize a block in my workspace and map the exact implementation steps.",
            },
          ];
          const hiddenSet = new Set(hiddenBlocks);
          const visibleBlocks = allBlocks.filter((b) => b.slug !== "seldon" && !hiddenSet.has(b.slug));
          const hiddenBlockItems = allBlocks.filter((b) => b.slug !== "seldon" && hiddenSet.has(b.slug));
          return (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {visibleBlocks.map((block) => (
                  <div key={block.slug} className="group relative space-y-1.5 rounded-2xl border border-border/80 bg-background/35 p-4 transition-all hover:border-border hover:bg-accent/35 hover:shadow-(--shadow-xs)">
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <BlockVisibilityToggle slug={block.slug} hidden={false} />
                    </div>
                    <Link href={block.href}>
                      <p className="text-sm font-medium text-foreground">{block.name}</p>
                      <p className="text-xs text-muted-foreground">{block.status}</p>
                      <p className="text-xs text-muted-foreground">{block.detail}</p>
                    </Link>
                  </div>
                ))}
              </div>
              {hiddenBlockItems.length > 0 ? (
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-medium text-muted-foreground">Hidden blocks</p>
                  <div className="flex flex-wrap gap-2">
                    {hiddenBlockItems.map((block) => (
                      <div key={block.slug} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border/80 bg-background/30 px-2.5 py-1.5 text-xs text-muted-foreground">
                        <span>{block.name}</span>
                        <BlockVisibilityToggle slug={block.slug} hidden={true} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          );
        })()}
      </section>

      {contactRows.length === 0 ? (
        <section className="crm-card space-y-5">
          <div>
            <h2 className="text-base sm:text-lg font-semibold">Bring your clients into SeldonFrame</h2>
            <p className="text-sm text-muted-foreground">Import existing clients, sync from another CRM, or add one manually.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/contacts?import=csv" className="crm-button-primary h-9 px-4 text-xs sm:text-sm">Upload CSV</Link>
            <button type="button" disabled className="crm-button-secondary h-9 px-4 text-xs sm:text-sm opacity-60">Connect HubSpot (soon)</button>
            <Link href="/contacts" className="crm-button-secondary h-9 px-4 text-xs sm:text-sm">Add one manually</Link>
            <Link href="/dashboard" className="crm-button-ghost h-9 px-3 text-xs sm:text-sm">Skip — I don&apos;t have clients yet</Link>
          </div>
        </section>
      ) : !hasConnectedIntegrations ? (
        <section className="crm-card space-y-5">
          <div>
            <h2 className="text-base sm:text-lg font-semibold">Connect your existing tools</h2>
            <p className="text-sm text-muted-foreground">Connect the tools you already use so your blocks stay in sync.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/settings/integrations" className="crm-button-primary h-9 px-4 text-xs sm:text-sm">Connect Google Calendar</Link>
            <Link href="/settings/integrations" className="crm-button-secondary h-9 px-4 text-xs sm:text-sm">Connect Newsletter Provider</Link>
            <Link href="/settings/integrations" className="crm-button-secondary h-9 px-4 text-xs sm:text-sm">Connect Stripe</Link>
            <Link href="/dashboard" className="crm-button-ghost h-9 px-3 text-xs sm:text-sm">I&apos;ll set these up later</Link>
          </div>
        </section>
      ) : !bookingShared ? (
        <section className="crm-card space-y-5">
          <div>
            <h2 className="text-base sm:text-lg font-semibold">Share your booking page</h2>
            <p className="text-sm text-muted-foreground">Your booking page is live. Share it to start getting appointments.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={bookingPublicPath} className="crm-button-primary h-9 px-4 text-xs sm:text-sm">Copy booking link</Link>
            <Link href={bookingPublicPath} className="crm-button-secondary h-9 px-4 text-xs sm:text-sm">Preview →</Link>
          </div>
        </section>
      ) : null}

      <div className="crm-card grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:gap-5 sm:p-5 xl:grid-cols-4 xl:gap-6 xl:p-6">
        {stats.map((stat, index) => (
          <div key={stat.label} className="flex items-start">
            <StatCard
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
              trendPercent={stat.trend}
              deltaLabel={stat.deltaLabel}
              accentBorderClass={stat.accentBorderClass}
              iconBadgeClass={stat.iconBadgeClass}
            />
            {index < stats.length - 1 ? <div className="hidden lg:block w-px h-full bg-border mx-4 xl:mx-6" /> : null}
          </div>
        ))}
      </div>

      <div className="flex flex-col xl:flex-row gap-4 sm:gap-6">
        <article className="crm-card flex w-full flex-col gap-4 xl:w-[410px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <button type="button" className="crm-button-secondary size-8 p-0">
                <ChartLine className="size-4 sm:size-[18px] text-muted-foreground" />
              </button>
              <span className="text-sm sm:text-base font-medium">Lead Sources</span>
            </div>
            <button type="button" className="crm-button-ghost size-8 p-0">
              <MoreHorizontal className="size-4 text-muted-foreground" />
            </button>
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

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Last 30 days</span>
          </div>
        </article>

        <article className="crm-card min-w-0 flex-1 flex-col gap-4 sm:gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <button type="button" className="crm-button-secondary size-8 p-0">
                <BarChart2 className="size-4 sm:size-[18px] text-muted-foreground" />
              </button>
              <span className="text-sm sm:text-base font-medium">Revenue Flow</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-[#6e3ff3]" />This Year</span>
                <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-[#e255f2]" />Prev Year</span>
              </div>
              <button type="button" className="crm-button-ghost size-8 p-0">
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-10 flex-1 min-h-0">
            <div className="flex flex-col gap-4 w-full lg:w-[200px] xl:w-[220px] shrink-0">
              <div className="space-y-2 sm:space-y-4">
                <p className="text-xl sm:text-2xl lg:text-[28px] font-semibold leading-tight tracking-tight">{formatCurrency(totalRevenueForCard)}</p>
                <p className="text-xs sm:text-sm text-muted-foreground">Total Revenue (Last 6 Months)</p>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/40 p-3 sm:p-4 space-y-3 sm:space-y-4">
                <p className="text-xs sm:text-sm font-semibold">🏆 Best Performing Month</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">
                  {hasRevenueHistory
                    ? `Top recent revenue snapshot hits ${formatCurrency(revenueMax)} with strong month-over-month carry.`
                    : "Start tracking to see insights from monthly revenue trends."}
                </p>
              </div>
            </div>

            <div className="flex-1 h-[220px] min-w-0">
              <div className="flex h-full gap-3">
                <div className="w-10 h-full flex flex-col justify-between text-[10px] text-muted-foreground">
                  {yTicks.map((tick) => (
                    <span key={tick}>${tick}k</span>
                  ))}
                </div>
                <div className="relative flex-1 h-full">
                  <div className="absolute inset-0 flex flex-col justify-between">
                    {yTicks.map((tick) => (
                      <div key={`grid-${tick}`} className="border-t border-border/70" />
                    ))}
                  </div>
                  <div className={`relative z-10 flex h-full items-end gap-2 sm:gap-3 px-1 ${hasRevenueHistory ? "" : "justify-center"}`}>
                    {revenueSeries.map((item, index) => {
                      const thisHeight = Math.max(8, (item.thisYear / revenueMax) * 100);
                      const prevHeight = Math.max(8, (item.prevYear / revenueMax) * 100);
                      return (
                        <div key={`${item.label}-${index}`} className={`flex h-full ${hasRevenueHistory ? "flex-1" : "w-[72px]"} flex-col justify-end gap-2 min-w-0`}>
                          <div className="flex items-end justify-center gap-1.5 h-full">
                            <div className="w-3 rounded-t-[4px] bg-[#6e3ff3]" style={{ height: `${thisHeight}%` }} />
                            {hasRevenueHistory ? <div className="w-3 rounded-t-[4px] bg-[#e255f2]" style={{ height: `${prevHeight}%` }} /> : null}
                          </div>
                          <p className="truncate text-[10px] text-center text-muted-foreground">{item.label}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {!hasRevenueHistory ? <p className="mt-2 text-center text-xs text-muted-foreground">No historical data yet</p> : null}
            </div>
          </div>
        </article>
      </div>

      <article className="crm-card overflow-hidden p-0">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-2.5 flex-1">
            <button type="button" className="crm-button-secondary size-8 p-0">
              <ClipboardList className="size-4 sm:size-[18px] text-muted-foreground" />
            </button>
            <span className="text-sm sm:text-base font-medium">Active Deals</span>
            <span className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[10px] sm:text-xs text-muted-foreground">
              {opportunityRows.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 sm:size-5 text-muted-foreground" />
              <input placeholder="Search..." className="crm-input h-8 w-full pl-9 pr-3 text-sm sm:h-9 sm:w-[160px] sm:pl-10 lg:w-[200px]" />
            </label>
            <button type="button" className="crm-button-secondary h-8 gap-1.5 px-3 text-xs sm:h-9 sm:gap-2 sm:text-sm">
              <Filter className="size-3.5 sm:size-4" />
              <span>Filter</span>
            </button>
            <button type="button" className="crm-button-secondary h-8 gap-1.5 px-3 text-xs sm:h-9 sm:gap-2 sm:text-sm">
              <FileInput className="size-3.5 sm:size-4" />
              <span>Import</span>
            </button>
            <Link href="/deals" className="text-sm text-muted-foreground hover:text-foreground px-1">
              View all
            </Link>
          </div>
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
                  <td colSpan={4} className="py-8 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <p className="text-sm text-muted-foreground">No active deals yet.</p>
                      <Link href="/deals" className="crm-button-primary h-9 px-3 text-sm">
                        Create your first engagement
                      </Link>
                    </div>
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
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${stageBadgeClass(row.stage)}`}>
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
        <article className="crm-card">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Upcoming Sessions</p>
          <ul className="space-y-2">
            {upcomingSessionRows.slice(0, 3).map((booking) => {
              const linkedContact = booking.contactId ? contactById.get(booking.contactId) : null;
              const person = linkedContact ? `${linkedContact.firstName} ${linkedContact.lastName ?? ""}`.trim() : contactLabelSingular;
              return (
                <li key={booking.id} className="flex items-center justify-between rounded-xl border border-border/80 bg-background/35 px-4 py-3 text-sm">
                  <span className="text-foreground">{booking.title}</span>
                  <span className="text-muted-foreground">{person}</span>
                </li>
              );
            })}
          </ul>
        </article>
      ) : null}
        </>
      )}

      <Link
        href="/seldon?prompt=Help%20me%20improve%20this%20client%20workspace%2C%20tell%20me%20the%20next%20best%20action%2C%20and%20start%20building%20it."
        className="fixed bottom-5 right-5 z-20 inline-flex h-12 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-(--shadow-dropdown) transition hover:opacity-95"
      >
        Ask Seldon
      </Link>

    </main>
  );
}
