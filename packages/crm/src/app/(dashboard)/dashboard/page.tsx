import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import Link from "next/link";
import { DollarSign, Users, CalendarDays, Activity, Plus, ChartLine, MoreHorizontal, BarChart2, ClipboardList, Search, Filter, FileInput, Sparkles, AlertTriangle, AlertCircle, Info, Terminal } from "lucide-react";
import { db } from "@/db";
import { activities, bookings as bookingsTable, contacts as contactsTable, metricsSnapshots, organizations, orgMembers, paymentRecords, pipelines as pipelinesTable, proposalEvents as proposalEventsTable, proposals as proposalsTable, stripeConnections, type OrganizationIntegrations, type PipelineStage } from "@/db/schema";
import type { ProposalEventType } from "@/db/schema/proposal-events";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { isOperatorPortalUserId } from "@/lib/auth/operator-portal-context";
import { OperatorTodaySnapshot } from "@/components/dashboard/operator-today-snapshot";
import { listAppointmentTypes } from "@/lib/bookings/actions";
import { listBookings } from "@/lib/bookings/actions";
import { listContacts } from "@/lib/contacts/actions";
import { listDeals } from "@/lib/deals/actions";
import { listEmailTemplates } from "@/lib/emails/actions";
import { listForms } from "@/lib/forms/actions";
import { listLandingPages } from "@/lib/landing/actions";
import { getSoul } from "@/lib/soul/server";
import { getPersonality } from "@/lib/crm/personality-server";
import type { PersonalityUrgencyIndicator } from "@/lib/crm/personality";
import { getHiddenBlocks } from "@/lib/blocks/visibility-actions";
import { BlockVisibilityToggle } from "@/components/dashboard/block-visibility-toggle";
import { setActiveOrgAction } from "@/lib/billing/orgs";
import { logEvent } from "@/lib/observability/log";
import { DealsCrmSurface } from "@/components/crm/deals-crm-surface";
import { getCrmSurfaceConfig } from "@/lib/crm/view-config";
import { mapDealRowToCrmRecord } from "@/lib/crm/view-models";
import { CreateClientCta } from "@/components/dashboard/create-client-cta";
// SH2-F4 — reused for the simplified-Home inline "Add client workspace"
// button (skips CreateClientCta's usage pill without touching that
// shared component, which is outside this task's touched-files list).
import { enforceWorkspaceLimit } from "@/lib/billing/limits";
import { getOwnedWorkspaceCount } from "@/lib/web-onboarding/owned-workspace-count";
// 2026-07-04 — reused for the claimed-workspace hero's "View your website"
// CTA. Same builder the ready page + create_workspace API responses use, so
// the subdomain URL construction can't drift between surfaces.
import { buildWorkspaceUrls } from "@/lib/billing/anonymous-workspace";
// 2026-07-04 — Task 7 of the win-ladder + SeldonChat plan: renders the
// 4-step activation ladder in both the fresh-claimed hero and the populated
// single-workspace view. isWinLadderOn keeps this entire surface flag-dark
// (zero DB work, byte-identical render) until SF_WIN_LADDER=1.
import { isWinLadderOn, isSimpleHomeOn } from "@/lib/web-build/policy";
// Task 6 (simple-home) — surfaceModules gates the KPI/donut/revenue/deals/
// kanban/blocks sections behind the org's chosen module set when
// SF_SIMPLE_HOME is on. Flag-off (or a null/grandfathered read) keeps every
// section rendering exactly as before — see the `!simplified || …` gates
// below.
import { readEnabledModules } from "@/lib/workspace/surface";
import { resolveLadderInputs, stampLadderEvent } from "@/lib/activation/ladder-server";
import { computeLadderState } from "@/lib/activation/ladder";
import { WinLadder } from "@/components/activation/win-ladder";
// F2 fix (2026-07-05, SH2-F2) — auto-refreshes the ladder's server state
// (nav + ladder recompute) without a manual reload, on OAuth-return,
// SeldonChat tool activity, and tab-visibility-regained.
import { LadderAutoRefresh } from "@/components/activation/ladder-auto-refresh";
// 2026-07-04 — Task 9: step-3 share assets (copy link + QR) slotted into
// the win-ladder's go_live row via WinLadder's shareSlot prop.
import { buildShareAssets } from "@/lib/activation/share";
import { ShareRow } from "@/components/activation/share-row";
// 2026-07-04 — Task 10: step-4 contextual agent picker, slotted into the
// win-ladder's hire_agent row via WinLadder's agentPicksSlot prop.
import { suggestAgentsForIndustry } from "@/lib/activation/suggest-agents";
import { AgentPicks } from "@/components/activation/agent-picks";
import { agentTemplates } from "@/db/schema/agent-templates";

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

// 2026-07-04 — same env-driven base domain the ready page reads, kept in
// sync so a claimed workspace's public links point at the right host in
// every environment (prod vs preview).
const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

// 2026-07-04 — Task 7. Same /book/<org>/<slug> pattern the fresh-claimed
// hero already builds inline (see the comment at its own publicBookingUrl
// local) — proxy.ts's rewrite for that path keys off the org slug in the
// PATH, not the subdomain host, so buildWorkspaceUrls().book would 404
// here. Shared so the populated-dashboard win-ladder card can reuse it
// without re-deriving the same string.
function buildPublicBookingUrl(
  workspace: { slug: string; id: string },
  bookingSlug: string | undefined,
): string {
  if (!bookingSlug) {
    return buildWorkspaceUrls(workspace.slug, WORKSPACE_BASE_DOMAIN, workspace.id).home;
  }
  return `https://${WORKSPACE_BASE_DOMAIN}/book/${workspace.slug}/${bookingSlug}`;
}

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

function UrgencyStrip({ items }: { items: PersonalityUrgencyIndicator[] }) {
  if (items.length === 0) return null;
  const tone = (severity: PersonalityUrgencyIndicator["severity"]) => {
    if (severity === "danger") {
      return { chip: "border-negative/30 bg-negative/10 text-negative", icon: AlertCircle };
    }
    if (severity === "warning") {
      return { chip: "border-caution/30 bg-caution/10 text-caution", icon: AlertTriangle };
    }
    return { chip: "border-border bg-muted/40 text-muted-foreground", icon: Info };
  };
  return (
    <div className="crm-card flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Watch list
      </span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const { chip, icon: Icon } = tone(item.severity);
          return (
            <span
              key={item.key}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${chip}`}
            >
              <Icon className="size-3" />
              {item.label}
            </span>
          );
        })}
      </div>
    </div>
  );
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
  const [user, activeOrgId, contactRows, dealRows, bookingRows, appointmentTypeRows, emailTemplateRows, landingPageRows, intakeFormRows, soul, hiddenBlocks, personality] = await Promise.all([
    getCurrentUser(),
    // 2026-05-17 — use the COOKIE-backed active org id (set by
    // setActiveOrgAction when the operator switches workspaces) rather
    // than user.orgId (their primary). Previously this page used the
    // primary, so the "isSwitchedForDashboard" gate below was always
    // false — operators landed on the all-workspaces grid even after
    // explicitly switching into a client.
    getOrgId(),
    listContacts(),
    listDeals(),
    listBookings(),
    listAppointmentTypes(),
    listEmailTemplates(),
    listLandingPages(),
    listForms(),
    getSoul(),
    getHiddenBlocks(),
    getPersonality(),
  ]);
  const orgId = activeOrgId ?? user?.orgId;

  if (!orgId) {
    return null;
  }

  // v1.25.2 — gate org_members lookup for operator sessions. The
  // synthetic operator user.id (`__sf_operator_portal__:<orgId>`)
  // isn't a valid UUID, so this query crashes with 22P02
  // "invalid input syntax for type uuid" if we run it. Operator
  // sessions are scoped to ONE workspace by design — their
  // membershipOrgIds list is just [their orgId].
  const isOperatorSession = isOperatorPortalUserId(user?.id);

  // Phase 9 — agency dashboard header CTA. Compute workspace-limit
  // decision so the header can render <CreateClientCta> with tier-aware
  // usage badge + at-limit modal trigger. Operator sessions never see
  // the CTA, so skip the lookup for them (and skip when the user.id
  // isn't a real UUID).
  let agencyWorkspaceLimit:
    | { tier: "free" | "growth" | "scale"; used: number; limit: number }
    | null = null;
  if (!isOperatorSession && user?.id) {
    try {
      const ownedWorkspaceCount = await getOwnedWorkspaceCount(user.id);
      const decision = await enforceWorkspaceLimit({
        userId: user.id,
        primaryOrgId: orgId,
        ownedWorkspaceCount,
      });
      // The `limit` field is -1 for unlimited tiers; normalise to
      // POSITIVE_INFINITY so the CTA component's Number.isFinite check
      // does the right thing. When the decision is `allowed: true`
      // (unlimited), there's no `used`/`limit` on the shape, so derive
      // them from the inputs.
      if ("limit" in decision) {
        agencyWorkspaceLimit = {
          tier: decision.tier as "free" | "growth" | "scale",
          used: decision.used,
          limit: decision.limit === -1 ? Number.POSITIVE_INFINITY : decision.limit,
        };
      } else {
        agencyWorkspaceLimit = {
          tier: decision.tier as "free" | "growth" | "scale",
          used: ownedWorkspaceCount,
          limit: Number.POSITIVE_INFINITY,
        };
      }
    } catch (err) {
      // Defensive: a billing-table read shouldn't crash the dashboard.
      // Logging keeps the signal; rendering proceeds without the CTA.
      logEvent("dashboard_cta_limit_lookup_failed", { error: String(err) }, { severity: "warn" });
    }
  }
  const membershipRows = user?.id && !isOperatorSession
    ? await db
        .select({ orgId: orgMembers.orgId })
        .from(orgMembers)
        .where(eq(orgMembers.userId, user.id))
    : isOperatorSession && orgId
      ? [{ orgId }]
      : [];

  const membershipOrgIds = membershipRows.map((row) => row.orgId);
  // Successful read diagnostic — info severity, NOT error.
  logEvent(
    "org_list_diag",
    {
      tag: "dashboard.workspaceRows",
      request_path: "/dashboard",
      pid: process.pid,
      membership_ids_raw: membershipOrgIds,
      is_array: Array.isArray(membershipOrgIds),
      typeof_value: typeof membershipOrgIds,
      length: Array.isArray(membershipOrgIds) ? membershipOrgIds.length : null,
      user_id: user?.id ?? null,
      user_org_id: user?.orgId ?? null,
    },
    { severity: "info" },
  );
  // v1.25.2 — operator sessions have a synthetic non-UUID id, so the
  // ownerId/parentUserId equality clauses crash. Operator sessions
  // are workspace-scoped; just look up the active workspace by orgId.
  const directWorkspaceRows = user?.id
    ? isOperatorSession
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
          .where(eq(organizations.id, orgId))
      : await db
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

  // 2026-05-17 — first-time agency operator early-return.
  //
  // Why: the full dashboard was leading new agency users (zero client
  // workspaces yet) with 9+ empty widgets (pipeline / blocks grid /
  // CSV import row / watch list / 4 KPI cards / lead-source pie chart /
  // revenue flow chart). All zeroes. The "where dreams go to die"
  // anti-pattern from B2B SaaS onboarding research.
  //
  // Replacement: single focused hero with one CTA — "Add your first
  // client → /clients/new" — matching how Linear, Loom, and Postiz
  // handle their first-run experience. Time-to-value drops from
  // "scroll through 9 empty widgets and try to figure out what to do
  // first" to "click the obvious primary CTA."
  //
  // Bonus: short-circuits ~7 expensive DB queries below
  // (workspaceStats, snapshotRows, paymentRows, dealsSurface, etc.)
  // that all return empty results anyway for a 0-workspace user.
  const isFirstTimeAgency = !isOperatorSession && workspaceRows.length === 0;
  if (isFirstTimeAgency) {
    const firstName =
      user?.name?.split(" ").filter(Boolean)[0]?.trim() || "there";
    const greeting = `Good ${timeOfDay()}, ${firstName}`;

    return (
      <main className="animate-page-enter flex-1 overflow-auto w-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-2xl py-10 sm:py-16">
          <div className="space-y-6 sm:space-y-8">
            {/* Eyebrow personalises without burning a full row on the
                generic "Welcome" pattern the research flagged. */}
            <p className="text-sm text-muted-foreground">{greeting} 👋</p>

            <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]">
              Your first client is{" "}
              <span className="text-primary">60 seconds</span> away.
            </h1>

            <p className="text-base text-muted-foreground sm:text-lg">
              Paste their website. We&apos;ll build their CRM, booking page,
              intake form, and AI chatbot in one pass. You&apos;ll have a real
              workspace to show them today.
            </p>

            {/* Single primary CTA — no competing actions above the fold.
                The action verb ("Add your first client") locks the user
                onto a concrete next step rather than browsing for one. */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/clients/new"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-(--shadow-sm) transition-colors hover:bg-primary/90"
              >
                Add your first client →
              </Link>
              <span className="text-xs text-muted-foreground">
                Takes about a minute. Free forever.
              </span>
            </div>

            {/* What-happens-next preview. Three steps mirror the LIVE BUILD
                checklist on /clients/new so the operator knows what's
                coming before they click. No metrics, no charts, no setup
                rows — that all comes later, once they have data. */}
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                {
                  step: "1",
                  title: "Paste a URL",
                  detail: "Their existing site is the source of truth.",
                },
                {
                  step: "2",
                  title: "AI builds it",
                  detail: "CRM, booking, intake, chatbot — all wired up.",
                },
                {
                  step: "3",
                  title: "You customize",
                  detail: "Tweak copy, brand, agents, automations.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="rounded-2xl border border-border/70 bg-card/40 p-4"
                >
                  <p className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                    {item.step}
                  </p>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>

            {/* Subtle bail-out for operators who already know what they're
                doing and want to skip the URL paste. Linked button, not a
                second primary CTA. */}
            <div className="border-t border-border/60 pt-6">
              <p className="text-xs text-muted-foreground">
                Already have client data to import?{" "}
                <Link
                  href="/contacts"
                  className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  Add contacts manually
                </Link>{" "}
                or{" "}
                <Link
                  href="/docs"
                  className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  read the docs
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // 2026-07-04 — claimed-/try-workspace hero.
  //
  // Why this branch exists here (after isFirstTimeAgency, not inside it):
  // isFirstTimeAgency only fires when workspaceRows.length === 0. A user who
  // claimed a /try-built workspace (link-owner sets organizations.ownerId +
  // parentUserId + an orgMembers row) matches this page's directWorkspaceRows
  // query, so workspaceRows.length === 1 and isFirstTimeAgency is FALSE for
  // them — the claimed-workspace scenario never enters that block. This
  // branch is the actual gate for it: fires for a built-but-unused workspace
  // (has a live site via landingPageRows, but zero CRM activity — no
  // contacts, deals, or bookings yet). Any CRM activity means the workspace
  // is no longer "fresh," so the real populated dashboard renders instead.
  // All four row arrays (workspaceRows, landingPageRows, contactRows,
  // dealRows, bookingRows) are already resolved by the top-level Promise.all
  // — no new queries added.
  const activeWorkspace = workspaceRows.find((row) => row.id === orgId);
  // Task 6 (simple-home) — the MCP/Claude-Code banner is developer-tooling
  // guidance meant for SF builders, not the claimed-workspace owner who just
  // wants their business running. `ownerId` is already selected on the
  // directWorkspaceRows/membershipWorkspaceRows queries above, so this is a
  // zero-cost derivation, not a new query.
  const isClaimedOwner = Boolean(
    activeWorkspace?.ownerId && user?.id && activeWorkspace.ownerId === user.id
  );
  const isFreshClaimedWorkspace =
    !isOperatorSession &&
    Boolean(activeWorkspace) &&
    landingPageRows.length > 0 &&
    contactRows.length === 0 &&
    dealRows.length === 0 &&
    bookingRows.length === 0;

  // 2026-07-04 — Task 7. Computed ONCE and shared by both render sites (the
  // fresh-claimed hero below + the populated single-workspace view further
  // down) so the ladder state is never derived twice per request. Flag-off
  // (or operator session, or no active workspace) short-circuits to null
  // before any DB call — zero added query cost in the common case.
  const winLadderOn = isWinLadderOn({ SF_WIN_LADDER: process.env.SF_WIN_LADDER });
  const ladderState =
    winLadderOn && !isOperatorSession && activeWorkspace
      ? await (async () => {
          const inputs = await resolveLadderInputs(activeWorkspace.id);
          const computed = computeLadderState(inputs);
          for (const step of computed.steps) {
            if (step.done) {
              // Fire-and-forget: stampLadderEvent is internally once-only
              // (a no-op write + no capture once already stamped), so
              // calling it for every done step on every render is safe.
              void stampLadderEvent(activeWorkspace.id, step.id).catch(() => {});
            }
          }
          return computed;
        })()
      : null;
  const ladderHrefs = {
    // Hotfix H4a — deep-link into the calendar-only filtered view so the
    // ladder's "connect your calendar" step doesn't dump the operator into
    // the full 8-toolkit grid.
    integrationsUrl: "/integrations?connect=calendar",
    domainUrl: "/settings/domain",
    agentsUrl: "/agents",
  };

  // 2026-07-04 — Task 9. Computed once alongside ladderState (same
  // flag/session/workspace guard) and shared by both render sites below.
  // qrcode encoding is deterministic and cheap; no extra DB call.
  const shareAssets =
    winLadderOn && !isOperatorSession && activeWorkspace
      ? await buildShareAssets({
          siteUrl: buildWorkspaceUrls(activeWorkspace.slug, WORKSPACE_BASE_DOMAIN, activeWorkspace.id).home,
        })
      : null;
  const shareSlot = shareAssets ? <ShareRow siteUrl={shareAssets.siteUrl} qrDataUrl={shareAssets.qrDataUrl} /> : undefined;

  // 2026-07-04 — Task 10. Same flag/session/workspace guard as Task 7/9 above,
  // so a flag-off render does zero added query cost. Industry comes from the
  // soul already loaded above (getSoul()); enabledIds is a cheap one-shot
  // read of this org's agent_templates rows (mirrors ladder-server.ts's
  // defaultExtraAgentCount pattern — a single scoped select, not a new
  // abstraction), checked against each starter's event trigger.
  const agentPicksSlot =
    winLadderOn && !isOperatorSession && activeWorkspace
      ? await (async () => {
          const picks = suggestAgentsForIndustry(soul?.industry ?? null);
          const templateRows = await db
            .select({ blueprint: agentTemplates.blueprint })
            .from(agentTemplates)
            .where(eq(agentTemplates.builderOrgId, activeWorkspace.id));
          const enabledIds = picks
            .filter((pick) =>
              templateRows.some((row) => {
                const blueprint = (row.blueprint ?? {}) as { trigger?: unknown };
                const trigger = blueprint.trigger as { kind?: string; event?: string } | undefined;
                const wantEvent = pick.id === "review-requester" ? "booking.completed" : "lead.created";
                return trigger?.kind === "event" && trigger?.event === wantEvent;
              }),
            )
            .map((pick) => pick.id);
          return <AgentPicks picks={picks} enabledIds={enabledIds} />;
        })()
      : undefined;

  if (isFreshClaimedWorkspace && activeWorkspace) {
    const firstName =
      user?.name?.split(" ").filter(Boolean)[0]?.trim() || "there";
    const greeting = `Good ${timeOfDay()}, ${firstName}`;
    const urls = buildWorkspaceUrls(activeWorkspace.slug, WORKSPACE_BASE_DOMAIN, activeWorkspace.id);
    const bookingSlug = appointmentTypeRows[0]?.bookingSlug;
    const activeIntakeForm =
      intakeFormRows.find((row) => row.isActive) ?? intakeFormRows[0] ?? null;
    const APP_BASE = `https://${WORKSPACE_BASE_DOMAIN}`;
    // Public deep links use the canonical /book/<org>/<slug> +
    // /forms/<org>/<slug> patterns on the app host, same as
    // /clients/[slug]/ready — proxy.ts's rewrite for those paths keys off
    // the org slug in the PATH, not the subdomain host, so the
    // `urls.book`/`urls.intake` subdomain shortcuts 404 here.
    const publicBookingUrl = bookingSlug
      ? `${APP_BASE}/book/${activeWorkspace.slug}/${bookingSlug}`
      : null;
    const publicIntakeUrl = activeIntakeForm
      ? `${APP_BASE}/forms/${activeWorkspace.slug}/${activeIntakeForm.slug}`
      : null;

    return (
      // Top-aligned, full-width — the (dashboard) layout column already pads
      // (px/py 4→8), so no extra padding or vertical centering here (the old
      // max-w-2xl + py-16 wrapper pushed the win ladder below the fold). On
      // lg the ladder sits in a right column so all 4 steps are visible
      // without scrolling; flag-off (ladderState null) the hero spans full
      // width via the conditional grid class.
      <main
        className={`animate-page-enter space-y-5 sm:space-y-6 ${
          ladderState
            ? "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-10 lg:space-y-0"
            : ""
        }`}
      >
        <div className="space-y-4 sm:space-y-5">
          <p className="text-sm text-muted-foreground">{greeting} 👋</p>

          <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
            <span className="text-foreground">{activeWorkspace.name}</span>{" "}
            <span className="text-primary">is live.</span>
          </h1>

          <p className="text-base text-muted-foreground sm:text-lg">
            Your website, booking page, intake form, and AI chatbot are
            already built and published at{" "}
            <span className="font-medium text-foreground">
              {activeWorkspace.slug}.{WORKSPACE_BASE_DOMAIN}
            </span>
            .
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href={urls.home}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-(--shadow-sm) transition-colors hover:bg-primary/90"
            >
              View your website →
            </a>
          </div>

          <div className="grid gap-3 pt-2 sm:grid-cols-3">
            <a
              href={publicBookingUrl ?? urls.home}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-2xl border border-border/70 bg-card/40 p-4 transition-colors hover:bg-card/70"
            >
              <p className="text-sm font-medium text-foreground">Booking page</p>
              <p className="mt-1 text-xs text-muted-foreground">
                See how customers schedule with you.
              </p>
            </a>
            <a
              href={publicIntakeUrl ?? urls.home}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-2xl border border-border/70 bg-card/40 p-4 transition-colors hover:bg-card/70"
            >
              <p className="text-sm font-medium text-foreground">Intake form</p>
              <p className="mt-1 text-xs text-muted-foreground">
                See how leads submit their details.
              </p>
            </a>
            <a
              href={urls.home}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-2xl border border-border/70 bg-card/40 p-4 transition-colors hover:bg-card/70"
            >
              <p className="text-sm font-medium text-foreground">Try your AI receptionist</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Chat with the bubble on your live site.
              </p>
            </a>
          </div>

          {/* Tertiary link — keeps the agency-builder path discoverable
              for owners who also want to build workspaces for others. */}
          <div className="border-t border-border/60 pt-5">
            <p className="text-xs text-muted-foreground">
              <Link
                href="/clients/new"
                className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
              >
                Add another client workspace →
              </Link>
            </p>
          </div>
        </div>

        {/* 2026-07-04 — Task 7 win-ladder card. Only rendered when
            SF_WIN_LADDER is on; ladderState is null flag-off so this
            whole block is a no-op then. */}
        {ladderState ? (
          <div>
            <LadderAutoRefresh />
            <WinLadder
              state={ladderState}
              hrefs={{
                bookingUrl: publicBookingUrl ?? urls.home,
                ...ladderHrefs,
              }}
              shareSlot={shareSlot}
              agentPicksSlot={agentPicksSlot}
            />
          </div>
        ) : null}
      </main>
    );
  }

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

      const paymentMrr = monthlyRevenueRows.reduce((sum, row) => sum + Number(row.amount), 0);

      // 2026-05-21 — Proposal MRR: sum of monthly_price_cents from accepted
      // proposals that point at this workspace. This is the AGENCY's recurring
      // revenue from managing the workspace, distinct from the workspace's own
      // customer-billing revenue (paymentRecords). Both are surfaced as the
      // workspace's MRR — the operator cares about both signals.
      const [proposalMrrRow] = await db
        .select({
          mrrCents: sql<number>`COALESCE(SUM(${proposalsTable.monthlyPriceCents}), 0)::int`,
        })
        .from(proposalsTable)
        .where(
          and(
            eq(proposalsTable.previewWorkspaceId, workspace.id),
            eq(proposalsTable.status, "accepted"),
          ),
        );
      const proposalMrr = Number(proposalMrrRow?.mrrCents ?? 0) / 100;

      const monthlyRevenue = paymentMrr + proposalMrr;

      return {
        orgId: workspace.id,
        contactCount: Number(contactCount?.count ?? 0),
        monthlyRevenue,
        paymentMrr,
        proposalMrr,
      };
    })
  );

  const workspaceStatMap = new Map(workspaceStats.map((row) => [row.orgId, row]));
  const totalWorkspaceContacts = workspaceStats.reduce((sum, row) => sum + row.contactCount, 0);
  const totalWorkspaceRevenue = workspaceStats.reduce((sum, row) => sum + row.monthlyRevenue, 0);

  // ── Agency KPI rollup (all-workspaces view only) ──────────────────────
  // Phase N: queries scoped to user.orgId (the agency's own org).
  const agencyOrgId = user?.orgId ?? orgId;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    agencyMrrRow,
    agencyOpenRow,
    agencyFunnelRow,
    agencyThisWeekRow,
    agencyRecentEvents,
  ] = await Promise.all([
    // totalMrr + payingCount
    db
      .select({
        mrrCents: sql<number>`COALESCE(SUM(${proposalsTable.monthlyPriceCents}), 0)::int`,
        payingCount: sql<number>`COUNT(*)::int`,
      })
      .from(proposalsTable)
      .where(
        and(
          eq(proposalsTable.agencyOrgId, agencyOrgId),
          eq(proposalsTable.status, "accepted"),
        ),
      )
      .then((rows) => rows[0] ?? { mrrCents: 0, payingCount: 0 }),

    // pipelineValue + openProposalsCount
    db
      .select({
        pipelineCents: sql<number>`COALESCE(SUM(${proposalsTable.monthlyPriceCents} * 12 + ${proposalsTable.setupFeeCents}), 0)::int`,
        openCount: sql<number>`COUNT(*)::int`,
      })
      .from(proposalsTable)
      .where(
        and(
          eq(proposalsTable.agencyOrgId, agencyOrgId),
          inArray(proposalsTable.status, ["draft", "sent", "viewed"]),
        ),
      )
      .then((rows) => rows[0] ?? { pipelineCents: 0, openCount: 0 }),

    // funnel: sent / viewed / accepted
    db
      .select({
        sentCount: sql<number>`COUNT(*) FILTER (WHERE ${proposalsTable.sentAt} IS NOT NULL)::int`,
        viewedCount: sql<number>`COUNT(*) FILTER (WHERE ${proposalsTable.firstViewedAt} IS NOT NULL)::int`,
        acceptedCount: sql<number>`COUNT(*) FILTER (WHERE ${proposalsTable.status} = 'accepted')::int`,
      })
      .from(proposalsTable)
      .where(eq(proposalsTable.agencyOrgId, agencyOrgId))
      .then((rows) => rows[0] ?? { sentCount: 0, viewedCount: 0, acceptedCount: 0 }),

    // proposalsThisWeek
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(proposalsTable)
      .where(
        and(
          eq(proposalsTable.agencyOrgId, agencyOrgId),
          gte(proposalsTable.sentAt, sevenDaysAgo),
        ),
      )
      .then((rows) => rows[0]?.count ?? 0),

    // recent activity feed: last 10 events across this agency's proposals
    db
      .select({
        id: proposalEventsTable.id,
        eventType: proposalEventsTable.eventType,
        createdAt: proposalEventsTable.createdAt,
        prospectName: proposalsTable.prospectName,
      })
      .from(proposalEventsTable)
      .innerJoin(proposalsTable, eq(proposalEventsTable.proposalId, proposalsTable.id))
      .where(eq(proposalsTable.agencyOrgId, agencyOrgId))
      .orderBy(desc(proposalEventsTable.createdAt))
      .limit(10),
  ]);

  const totalMrr = Number(agencyMrrRow.mrrCents) / 100;
  const payingCount = Number(agencyMrrRow.payingCount);
  const pipelineValue = Number(agencyOpenRow.pipelineCents) / 100;
  const openProposalsCount = Number(agencyOpenRow.openCount);
  const proposalsThisWeek = Number(agencyThisWeekRow);
  const funnelSent = Number(agencyFunnelRow.sentCount);
  const funnelViewed = Number(agencyFunnelRow.viewedCount);
  const funnelAccepted = Number(agencyFunnelRow.acceptedCount);

  // Top 3 workspaces by proposalMrr
  const topWorkspaces = [...workspaceRows]
    .map((ws) => {
      const stat = workspaceStatMap.get(ws.id);
      return { id: ws.id, name: ws.name, slug: ws.slug, mrr: stat?.proposalMrr ?? 0 };
    })
    .sort((a, b) => b.mrr - a.mrr)
    .slice(0, 3);

  // 2026-05-17 — when the operator has switched INTO a specific client
  // workspace (active orgId !== user's primary orgId), default to the
  // single-workspace view. Previously this defaulted to "all" — operators
  // clicking "Open operator dashboard" from the Ready hub landed on the
  // all-workspaces grid instead of the workspace they just opened.
  // Explicit ?view=all from the operator still overrides.
  const showWorkspaceTabs = workspaceRows.length > 1;
  const isSwitchedForDashboard = Boolean(
    user?.orgId && orgId && user.orgId !== orgId,
  );
  const activeDashboardView = showWorkspaceTabs
    ? params?.view === "workspace"
      ? "workspace"
      : params?.view === "all"
        ? "all"
        : isSwitchedForDashboard
          ? "workspace"
          : "all"
    : "workspace";

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
  // Task 6 (simple-home) — section-gating derivation. Flag-off:
  // simpleHomeOn is false, surfaceModules stays null, simplified stays
  // false, and every `!simplified || …` gate below short-circuits to true
  // (identical to pre-Task-6 render). Flag-on with a grandfathered
  // (null) module read behaves the same way — only an org with an
  // explicit settings.surface.modules array gets `simplified === true`.
  const simpleHomeOn = isSimpleHomeOn({ SF_SIMPLE_HOME: process.env.SF_SIMPLE_HOME });
  const surfaceModules = simpleHomeOn ? readEnabledModules(orgRow?.settings ?? null) : null;
  const simplified = simpleHomeOn && surfaceModules !== null;
  const newsletterConnected = Boolean(integrations.newsletter?.connected || integrations.kit?.connected);
  // May 1, 2026 — Google Calendar integration removed; Cal.diy is the calendar.
  const twilioConnected = Boolean(integrations.twilio?.connected);
  const stripeConnected = Boolean(stripeRow);
  const hasConnectedIntegrations = newsletterConnected || twilioConnected || stripeConnected;
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

  // Personality drives the labels of the four primary metric cards. Values
  // come from the same data sources regardless of vertical (count, status,
  // calendar bucket, revenue); the personality just renames them so an
  // HVAC operator sees "Open Jobs" / "Maintenance Plans" instead of the
  // generic "Total Contacts" / "Active Engagements". When the personality
  // declares fewer than 4 metrics we keep the generic label as fallback.
  const personalityMetrics = personality.dashboard.primaryMetrics;
  const metricLabel = (index: number, fallback: string) =>
    personalityMetrics[index]?.label ?? fallback;

  const stats = [
    {
      label: metricLabel(0, `Total ${contactLabelPlural}`),
      value: contactRows.length.toLocaleString(),
      icon: <Users className="size-3.5 sm:size-[18px] text-primary" />,
      trend: percentChange(contactsThisMonth, contactsPreviousMonth),
      deltaLabel: `${Math.abs(contactsThisMonth - contactsPreviousMonth).toLocaleString()}`,
      accentBorderClass: "border-primary",
      iconBadgeClass: "bg-primary/10",
    },
    {
      label: metricLabel(1, "Active Engagements"),
      value: activeEngagements.toLocaleString(),
      icon: <Activity className="size-3.5 sm:size-[18px] text-caution" />,
      trend: percentChange(activeEngagements, activeEngagementsPrev),
      deltaLabel: `${Math.abs(activeEngagements - activeEngagementsPrev).toLocaleString()}`,
      accentBorderClass: "border-caution",
      iconBadgeClass: "bg-caution/10",
    },
    {
      label: metricLabel(2, "Bookings This Month"),
      value: bookingsThisMonth.toLocaleString(),
      icon: <CalendarDays className="size-3.5 sm:size-[18px] text-[hsl(220_70%_55%)]" />,
      trend: percentChange(bookingsThisMonth, bookingsPreviousMonth),
      deltaLabel: `${Math.abs(bookingsThisMonth - bookingsPreviousMonth).toLocaleString()}`,
      accentBorderClass: "border-[hsl(220_70%_55%)]",
      iconBadgeClass: "bg-[hsl(220_70%_55%_/_0.1)]",
    },
    {
      label: metricLabel(3, "Revenue"),
      value: formatCurrency(monthlyRevenue),
      icon: <DollarSign className="size-3.5 sm:size-[18px] text-positive" />,
      trend: percentChange(monthlyRevenue, previousMonthRevenue),
      deltaLabel: formatCurrency(Math.abs(monthlyRevenue - previousMonthRevenue)),
      accentBorderClass: "border-positive",
      iconBadgeClass: "bg-positive/10",
    },
  ];

  const urgencyIndicators = personality.dashboard.urgencyIndicators;

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
    <main className="animate-page-enter flex-1 overflow-auto w-full space-y-8 p-3 sm:p-4 md:p-6">
      {/* v1.25.3 — Claude Code/MCP hint is for SF technical users.
          Hidden for operator sessions (HVAC owner / dentist /etc.) who
          have no relationship with our developer tooling.
          Phase K — wrapped in a card frame with a Terminal icon.
          Phase N — suppressed for the all-workspaces view, which now has
          its own MCP one-liner inline in the agency KPI rollup header. */}
      {!isOperatorSession && !isClaimedOwner && activeDashboardView !== "all" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card/40 px-4 py-3.5">
          <Terminal className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">
              For the best experience, use Seldon directly from Claude Code with our MCP + Skill.
            </p>
          </div>
          <a
            href="https://docs.seldonframe.com/mcp"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Learn more
          </a>
        </div>
      ) : null}

      {/* Phase N — tab toggle removed. /dashboard = agency KPI rollup.
          /clients = per-workspace grid. No toggle needed. */}

      {activeDashboardView === "all" ? (
        <section className="space-y-8">
          {/* ── Page header ─────────────────────────────────────────────── */}
          <header className="flex items-end justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">Agency dashboard</h1>
              <p className="text-muted-foreground">
                How your agency is performing across all client workspaces.
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/proposals/new" className="crm-button-primary h-10 px-4 text-sm">
                Send proposal
              </Link>
              <Link href="/clients/new" className="crm-button-secondary h-10 px-4 text-sm">
                + Build workspace
              </Link>
            </div>
          </header>

          {/* ── MCP one-liner ────────────────────────────────────────────── */}
          {!isOperatorSession && !isClaimedOwner ? (
            <p className="text-xs text-muted-foreground">
              <Terminal className="inline size-3 mr-1" />
              For the best experience, use Seldon directly from Claude Code with our MCP + Skill.{" "}
              <Link href="https://docs.seldonframe.com/mcp" className="underline" target="_blank">
                Learn more
              </Link>
            </p>
          ) : null}

          {/* ── Hero KPI tiles ────────────────────────────────────────────── */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile label="Total MRR" value={formatCurrency(totalMrr)} suffix="/mo" />
            <KpiTile label="Paying customers" value={payingCount.toLocaleString()} />
            <KpiTile
              label="Pipeline value"
              value={formatCurrency(pipelineValue)}
              sub={`${openProposalsCount} open proposal${openProposalsCount === 1 ? "" : "s"}`}
            />
            <KpiTile
              label="This week"
              value={proposalsThisWeek.toLocaleString()}
              sub="proposals sent"
            />
          </section>

          {/* ── Top 3 workspaces by MRR ─────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-end justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Top workspaces by MRR</h2>
              <Link href="/clients" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
                See all {workspaceRows.length} workspace{workspaceRows.length === 1 ? "" : "s"} →
              </Link>
            </div>
            {topWorkspaces.length === 0 || topWorkspaces.every((ws) => ws.mrr === 0) ? (
              <div className="rounded-2xl border border-border/70 bg-card/40 p-8 text-center space-y-3">
                <p className="text-sm text-muted-foreground">No paying customers yet.</p>
                <Link href="/proposals/new" className="text-sm text-primary underline underline-offset-4">
                  Send your first proposal →
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {topWorkspaces.map((ws) => (
                  <article key={ws.id} className="rounded-2xl border border-border/70 bg-card/40 p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold truncate">{ws.name}</p>
                      <span className="text-xs text-muted-foreground shrink-0">/{ws.slug}</span>
                    </div>
                    <p className="text-2xl font-semibold">
                      {formatCurrency(ws.mrr)}
                      <span className="text-sm text-muted-foreground font-normal"> /mo</span>
                    </p>
                    {/* 2026-05-21 — Click flips active workspace context (same
                        pattern as the /clients cards) so the dashboard
                        subsequently renders THIS workspace's operational view
                        instead of the agency rollup. Returning to the agency
                        view = use the sidebar 'Switch workspace' dropdown. */}
                    <form action={setActiveOrgAction}>
                      <input type="hidden" name="orgId" value={ws.id} />
                      <input type="hidden" name="redirectTo" value={`/clients/${ws.slug}/ready`} />
                      <button
                        type="submit"
                        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                      >
                        Open dashboard →
                      </button>
                    </form>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* ── Recent activity feed ─────────────────────────────────────── */}
          <section className="rounded-2xl border border-border/70 bg-card/40 p-5 space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">Recent activity</h2>
            {agencyRecentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No recent activity. Send a proposal to see it here.</p>
            ) : (
              <ul className="space-y-2">
                {agencyRecentEvents.map((event) => (
                  <li key={event.id} className="flex items-start gap-3 text-sm">
                    <span className="text-xs text-muted-foreground shrink-0 w-20">{agencyFormatRelative(event.createdAt)}</span>
                    <span className="flex-1">{agencyDescribeEvent(event.eventType, event.prospectName)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Mini funnel ──────────────────────────────────────────────── */}
          {funnelSent > 0 ? (
            <section className="rounded-2xl border border-border/70 bg-card/40 p-5 space-y-4">
              <h2 className="text-lg font-semibold tracking-tight">Proposal funnel</h2>
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="rounded-xl border border-border/70 bg-card/60 p-4 text-center min-w-[80px]">
                  <p className="text-2xl font-semibold">{funnelSent}</p>
                  <p className="text-xs text-muted-foreground mt-1">Sent</p>
                </div>
                <span className="text-muted-foreground text-sm">→</span>
                <div className="rounded-xl border border-border/70 bg-card/60 p-4 text-center min-w-[80px]">
                  <p className="text-2xl font-semibold">{funnelViewed}</p>
                  <p className="text-xs text-muted-foreground mt-1">Viewed</p>
                </div>
                <span className="text-muted-foreground text-sm">→</span>
                <div className="rounded-xl border border-border/70 bg-card/60 p-4 text-center min-w-[80px]">
                  <p className="text-2xl font-semibold">{funnelAccepted}</p>
                  <p className="text-xs text-muted-foreground mt-1">Accepted</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-2xl font-semibold text-primary">
                    {funnelSent > 0 ? Math.round((funnelAccepted / funnelSent) * 100) : 0}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">conversion</p>
                </div>
              </div>
            </section>
          ) : null}
        </section>
      ) : (
        <div className="space-y-8">
      {typeof trialDaysRemaining === "number" ? (
        <div className="rounded-2xl border border-primary/25 bg-primary/8 px-4 py-3.5 text-sm text-primary shadow-(--shadow-xs)">
          Trial: {trialDaysRemaining} day{trialDaysRemaining === 1 ? "" : "s"} remaining. Your plan activates on {formatLongDate(trialEndsAt!)}.
        </div>
      ) : null}

      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end sm:gap-8">
        <div className="space-y-1.5 sm:space-y-2">
          <h1 className="text-xl sm:text-[28px] font-semibold leading-tight tracking-tight text-foreground">
            Good {timeOfDay()}, {firstName}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {/* v1.25.3 + v1.29.1 — both audiences get warmer, more
                concrete copy. SF builders' "calm workspace overview"
                was vague; "what's happening today" is what people
                actually want to know. */}
            {isOperatorSession
              ? "Here's what's happening at your business today."
              : "Here's what's happening across your workspace today."}
          </p>
        </div>

        {/* v1.25.3 — "Create New Client OS" is an SF-agency action
            (creating a new white-label client workspace). Operator
            sessions never need it; their workspace is fixed.
            Phase 9 — replaced the old `/orgs/new` link with the
            tier-aware <CreateClientCta>, which shows the usage badge
            + opens UpgradeModal when the operator is at their limit. */}
        {!isOperatorSession && agencyWorkspaceLimit ? (
          <div className="ml-auto">
            {simplified ? (
              // SH2-F4 — simplified Home hides the "N / M workspaces"
              // usage pill (setup-sprawl chrome) but keeps the Add client
              // workspace button. CreateClientCta itself is out of this
              // task's touched-files list, so rather than reach into its
              // internal DOM with a CSS hack, the under-limit case is
              // rendered inline here with the same href/label/variant
              // CreateClientCta already uses for that case. The at-limit
              // upgrade-modal branch isn't reachable in the common
              // single-workspace-simplified case; non-simplified keeps
              // the full tier-aware component unchanged.
              <Link href="/clients/new" className="crm-button-primary h-9 px-4 text-xs sm:text-sm">
                Add client workspace
              </Link>
            ) : (
              <CreateClientCta
                tier={agencyWorkspaceLimit.tier}
                used={agencyWorkspaceLimit.used}
                limit={agencyWorkspaceLimit.limit}
              />
            )}
          </div>
        ) : null}
      </header>

      {/* 2026-07-04 — Task 7 win-ladder card. Renders in the populated
          single-workspace view too (not just the fresh-claimed hero) while
          state.completedCount < 4, so the ladder doesn't vanish the moment
          the first contact/deal/booking arrives. Shares the one ladderState
          computed above the branch split — no extra query here. */}
      {ladderState && ladderState.completedCount < 4 && activeWorkspace ? (
        <>
          <LadderAutoRefresh />
          <WinLadder
            state={ladderState}
            hrefs={{
              bookingUrl: buildPublicBookingUrl(activeWorkspace, appointmentTypeRows[0]?.bookingSlug),
              ...ladderHrefs,
            }}
            shareSlot={shareSlot}
            agentPicksSlot={agentPicksSlot}
          />
        </>
      ) : null}

      {/* v1.25.4 — operator "Today" snapshot widget. Replaces the v1.25.3
          gap (where SF "Newly installed blocks" used to live for agency
          ops) with operator-actionable counts: today's bookings, unread
          messages, stuck deals, week trend. */}
      {isOperatorSession && orgId ? (
        <OperatorTodaySnapshot orgId={orgId} />
      ) : null}

      {/* v1.25.3 — "Newly installed blocks" is the SF agency's
          build-time view of what they just shipped to a client
          workspace. The HVAC owner doesn't have a build-time —
          their workspace was already configured before they got
          access. Hide for operator sessions. */}
      {!isOperatorSession && !simplified && (bookingTemplateRow || defaultIntakeForm || pipelineStages.length > 0) && (
        <section className="crm-card space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-foreground" />
                <h2 className="text-base sm:text-lg font-semibold">Just added to your workspace</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Share these pages or open them to make changes.
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

      {/* SH2-F4 — the kanban embed never renders on Home when simplified:
          it's a full widget duplicate of the Customers module's own
          pipeline view, one click away via nav. Flag-off/non-simplified
          keeps the original `!simplified` fallback (byte-identical). */}
      {showPipelineEmbed &&
      dealsSurface &&
      kanbanPipelineView &&
      !simplified ? (
        <section className="crm-card space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BarChart2 className="size-4 text-foreground" />
                <h2 className="text-base sm:text-lg font-semibold">Pipeline</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {/* v1.25.3 — operator sessions get plain English; the
                    BLOCK.md jargon is for SF builders configuring the
                    pipeline schema. */}
                {isOperatorSession
                  ? "Drag deals between stages to update their status."
                  : "Drag deals between stages — totals update as you go."}
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

      {!simplified ? (
      <section className="crm-card space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-semibold">Your features</h2>
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
            // 2026-05-17 — Pages tile removed from the dashboard quick-
            // setup grid. SF isn't a landing builder anymore.
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
                  <p className="text-xs font-medium text-muted-foreground">Hidden features</p>
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
      ) : null}

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
      ) : !hasConnectedIntegrations && !simplified ? (
        // SH2-F4 — "Connect your existing tools" is setup sprawl on a
        // simplified Home; Stripe connect belongs to the Money module
        // journey instead. Flag-off/non-simplified is unchanged.
        <section className="crm-card space-y-5">
          <div>
            <h2 className="text-base sm:text-lg font-semibold">Connect your existing tools</h2>
            <p className="text-sm text-muted-foreground">Connect the tools you already use so your blocks stay in sync.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/settings/integrations" className="crm-button-primary h-9 px-4 text-xs sm:text-sm">Connect Newsletter Provider</Link>
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

      {!simplified ? <UrgencyStrip items={urgencyIndicators} /> : null}

      {!simplified || activeEngagements > 0 || monthlyRevenue > 0 || hasRevenueHistory ? (
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
      ) : null}

      <div className="flex flex-col xl:flex-row gap-4 sm:gap-6">
        {!simplified || totalLeadSources > 0 ? (
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
        ) : null}

        {!simplified || hasRevenueHistory ? (
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
        ) : null}
      </div>

      {/* SH2-F4 — when simplified AND deals exist, the full table is
          replaced by a one-line summary linking into the Customers module
          (same "one fact, one place" principle as the kanban embed above).
          Flag-off/non-simplified renders the original table unchanged. */}
      {simplified ? (
        opportunityRows.length > 0 ? (
          <article className="crm-card flex items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
            <span className="text-sm text-foreground">
              {opportunityRows.length} active deal{opportunityRows.length === 1 ? "" : "s"}
            </span>
            <Link href="/deals" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
              View all →
            </Link>
          </article>
        ) : null
      ) : (
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
      )}

      {upcomingSessionRows.length > 0 ? (
        <article className="crm-card">
          <div className="mb-3 flex items-center justify-between gap-3">
            {/* SH2-F4 — "Upcoming bookings" is owner language (flag-
                independent copy fix; renders in both simplified and
                non-simplified modes). */}
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Upcoming bookings</p>
            {simplified ? (
              <Link href="/bookings" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                See all →
              </Link>
            ) : null}
          </div>
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
        </div>
      )}

      {/* 2026-05-18 — "Ask Seldon" floating CTA removed. Power users
          customize via Claude Code + SF MCP tools directly; non-tech
          operators don't actually use the in-dashboard chat. Less
          floating UI = cleaner view. */}

    </main>
  );
}

// ── Agency KPI rollup helpers ─────────────────────────────────────────────

function KpiTile({
  label,
  value,
  suffix,
  sub,
}: {
  label: string;
  value: string;
  suffix?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/40 p-5 space-y-1">
      <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">{label}</p>
      <p className="text-3xl font-semibold tracking-tight">
        {value}
        {suffix && <span className="text-base text-muted-foreground font-normal">{suffix}</span>}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function agencyFormatRelative(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

function agencyDescribeEvent(eventType: string, prospectName: string): string {
  switch (eventType as ProposalEventType) {
    case "created": return `New proposal drafted for ${prospectName}`;
    case "sent": return `Proposal sent to ${prospectName}`;
    case "viewed": return `${prospectName} viewed the proposal`;
    case "accepted": return `${prospectName} accepted the proposal 🎉`;
    case "declined": return `${prospectName} declined the proposal`;
    case "checkout_started": return `${prospectName} started checkout`;
    case "checkout_success": return `Payment received from ${prospectName}`;
    case "checkout_canceled": return `${prospectName} canceled checkout`;
    case "workspace_activated": return `Workspace activated for ${prospectName}`;
    case "expired": return `Proposal expired for ${prospectName}`;
    default: return `${eventType} — ${prospectName}`;
  }
}
