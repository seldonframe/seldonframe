import Link from "next/link";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import {
  ArrowRight,
  Bell,
  CalendarCheck,
  CloudRain,
  MessageCircle,
  RefreshCw,
  Sparkles,
  Star,
  Sun,
  Zap,
} from "lucide-react";
import { db } from "@/db";
import { workflowRuns } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { listArchetypes } from "@/lib/agents/archetypes";
import { SoulAutomationsOverview } from "@/components/automations/soul-automations-overview";
import { getSoul } from "@/lib/soul/server";
import { organizations, stripeConnections } from "@/db/schema";
import coachingFramework from "@/lib/frameworks/coaching.json";
import agencyFramework from "@/lib/frameworks/agency.json";
import saasFramework from "@/lib/frameworks/saas.json";

/**
 * /automations — WS3 agent catalog (replaces the dead "no suggested
 * automations" empty state).
 *
 * Shows the 6 validated archetypes from `lib/agents/archetypes/` as
 * Twenty-style cards with per-archetype run stats sourced from
 * `workflow_runs` (last-30d count + last-run timestamp). Each card
 * links to /automations/[id]/configure where the operator fills in
 * the archetype's `placeholders` and deploys.
 *
 * Status logic:
 *   - "Live" — ≥1 run in last 30 days (any status)
 *   - "Configured" — 0 recent runs but at least one waiting/running
 *     instance (e.g. agent deployed but no recent triggers)
 *   - "Not configured" — no rows in workflow_runs for this archetype
 *
 * Soul-derived suggestions (the original page's content) move below
 * the catalog as a secondary panel — keeps backward compat with the
 * coaching / agency / saas framework auto-suggest flow.
 */

type ServiceKey = "stripe" | "resend" | "twilio" | "kit" | "google" | "none";

type OverviewAutomation = {
  id: string;
  name: string;
  trigger: string;
  action: string;
  requiresIntegration: ServiceKey;
};

// Per-archetype icon + accent. Keyed by archetype.id so adding a new
// archetype to the registry just needs an entry here. Falls back to
// a neutral icon when missing.
const ARCHETYPE_VISUALS: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  "speed-to-lead": { icon: Zap, tone: "bg-amber-500/10 text-amber-500 dark:text-amber-400" },
  "win-back": { icon: RefreshCw, tone: "bg-violet-500/10 text-violet-500 dark:text-violet-400" },
  "review-requester": { icon: Star, tone: "bg-yellow-500/10 text-yellow-500 dark:text-yellow-400" },
  "daily-digest": { icon: Sun, tone: "bg-orange-500/10 text-orange-500 dark:text-orange-400" },
  "weather-aware-booking": {
    icon: CloudRain,
    tone: "bg-sky-500/10 text-sky-500 dark:text-sky-400",
  },
  "appointment-confirm-sms": {
    icon: CalendarCheck,
    tone: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400",
  },
};

const FALLBACK_VISUAL = {
  icon: Bell,
  tone: "bg-muted text-muted-foreground",
};

export default async function AutomationsPage() {
  const [soul, orgId] = await Promise.all([getSoul(), getOrgId()]);

  // Soul-suggestion data (kept for the secondary panel).
  const [org, stripe] = orgId
    ? await Promise.all([
        db
          .select({ integrations: organizations.integrations, settings: organizations.settings })
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
      ])
    : [null, null];

  // Per-archetype run stats. One indexed query — workflow_runs has
  // (orgId, archetypeId) covered.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const runStatsRows = orgId
    ? await db
        .select({
          archetypeId: workflowRuns.archetypeId,
          last30d: count(),
          lastRun: sql<Date | null>`max(${workflowRuns.createdAt})`,
        })
        .from(workflowRuns)
        .where(and(eq(workflowRuns.orgId, orgId), gte(workflowRuns.createdAt, thirtyDaysAgo)))
        .groupBy(workflowRuns.archetypeId)
    : [];

  // Also pull the most-recent run per archetype overall (to show a
  // "Configured" state for archetypes that ran before but not in 30d).
  const everRanRows = orgId
    ? await db
        .selectDistinctOn([workflowRuns.archetypeId], {
          archetypeId: workflowRuns.archetypeId,
          lastRun: workflowRuns.createdAt,
        })
        .from(workflowRuns)
        .where(eq(workflowRuns.orgId, orgId))
        .orderBy(workflowRuns.archetypeId, desc(workflowRuns.createdAt))
    : [];

  const statsByArchetype = new Map<
    string,
    { last30d: number; lastRun: Date | null; everRan: boolean }
  >();
  for (const row of everRanRows) {
    statsByArchetype.set(row.archetypeId, {
      last30d: 0,
      lastRun: row.lastRun ?? null,
      everRan: true,
    });
  }
  for (const row of runStatsRows) {
    const existing = statsByArchetype.get(row.archetypeId) ?? {
      last30d: 0,
      lastRun: null,
      everRan: true,
    };
    statsByArchetype.set(row.archetypeId, {
      ...existing,
      last30d: row.last30d,
      lastRun: row.lastRun ?? existing.lastRun,
    });
  }

  const archetypes = listArchetypes();

  // Soul suggestions (legacy panel, kept compact below the catalog).
  const frameworks = {
    coaching: coachingFramework,
    agency: agencyFramework,
    saas: saasFramework,
  } as const;
  const frameworkId = (soul?.industry ?? "") as keyof typeof frameworks;
  const framework = frameworks[frameworkId];
  const integrations = {
    stripe: Boolean(stripe?.id),
    resend: Boolean(org?.integrations?.resend?.connected),
    twilio: Boolean(org?.integrations?.twilio?.connected),
    kit: Boolean(org?.integrations?.kit?.connected),
    google: Boolean(org?.integrations?.google?.calendarConnected),
  };
  const suggestions: OverviewAutomation[] = (framework?.automationSuggestions ?? []).map(
    (item) => ({
      id: item.id,
      name: item.name,
      trigger: item.trigger,
      action: item.action,
      requiresIntegration: (item.requiresIntegration as ServiceKey) ?? "none",
    })
  );
  const enabledAutomationIds = new Set<string>(
    Array.isArray(org?.settings?.enabledAutomations)
      ? (org?.settings?.enabledAutomations as string[])
      : []
  );
  const activeAutomations = suggestions.filter((item) => enabledAutomationIds.has(item.id));
  const availableAutomations = suggestions.filter((item) => !enabledAutomationIds.has(item.id));
  const soulActions = (soul?.journey?.stages ?? []).flatMap((stage) =>
    (stage.autoActions ?? []).map((action) => ({ stage: stage.name, action }))
  );

  return (
    <section className="animate-page-enter space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold tracking-tight leading-relaxed text-foreground">
          Automations
        </h1>
        <p className="mt-1 text-sm sm:text-base text-muted-foreground">
          Build, test, and deploy AI agents for this workspace. Each agent responds to a
          trigger (form submission, booking, SMS reply, schedule) and runs with your LLM key.
        </p>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Agent catalog
          </h2>
          <span className="text-xs text-muted-foreground">
            {archetypes.length} archetypes
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {archetypes.map((archetype) => {
            const visuals = ARCHETYPE_VISUALS[archetype.id] ?? FALLBACK_VISUAL;
            const Icon = visuals.icon;
            const stats = statsByArchetype.get(archetype.id);
            const status: "live" | "configured" | "idle" = stats?.last30d
              ? "live"
              : stats?.everRan
                ? "configured"
                : "idle";
            const lastRunLabel = stats?.lastRun ? relativeFromNow(stats.lastRun) : null;
            return (
              <Link
                key={archetype.id}
                href={`/automations/${archetype.id}/configure`}
                className="group flex flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground transition-all hover:border-primary/40 hover:shadow-(--shadow-card)"
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`inline-flex size-9 items-center justify-center rounded-lg ${visuals.tone}`}
                    aria-hidden
                  >
                    <Icon className="size-4" />
                  </span>
                  <StatusBadge status={status} runs={stats?.last30d ?? 0} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">
                    {archetype.name}
                  </h3>
                  <p className="line-clamp-3 text-xs text-muted-foreground">
                    {archetype.description}
                  </p>
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                  <span>
                    {lastRunLabel ? `Last run ${lastRunLabel}` : "Never run"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-foreground transition-transform group-hover:translate-x-0.5">
                    Configure
                    <ArrowRight className="size-3" />
                  </span>
                </div>
              </Link>
            );
          })}

          {/* Custom Agent placeholder — the WS3 spec calls for 6 cards
              including a Custom slot. Disabled for now; the synthesis
              path for fully-custom triggers is V1.1. */}
          <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/10 p-5 opacity-70">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Coming soon
              </span>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                Custom Agent
              </h3>
              <p className="line-clamp-3 text-xs text-muted-foreground">
                Build a custom agent with your own triggers, prompts, and actions. Available
                in the next release — for now use the typed archetypes above.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Soul-derived suggestions — secondary, collapsed disclosure */}
      {(activeAutomations.length > 0 ||
        availableAutomations.length > 0 ||
        soulActions.length > 0) ? (
        <details className="rounded-xl border bg-card p-5">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="size-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">
                  Soul-suggested automations
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {activeAutomations.length} active · {availableAutomations.length} available
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Toggleable rules sourced from your industry framework. Use these for
              deterministic per-event behavior; use the agent catalog above for AI-driven
              workflows that reason across steps.
            </p>
          </summary>
          <div className="mt-4">
            <SoulAutomationsOverview
              activeAutomations={activeAutomations}
              availableAutomations={availableAutomations}
              inferredActions={soulActions}
              integrations={integrations}
            />
          </div>
        </details>
      ) : null}
    </section>
  );
}

function StatusBadge({ status, runs }: { status: "live" | "configured" | "idle"; runs: number }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Live · {runs} {runs === 1 ? "run" : "runs"}/30d
      </span>
    );
  }
  if (status === "configured") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20">
        <span className="size-1.5 rounded-full bg-amber-500" />
        Configured
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border">
      <span className="size-1.5 rounded-full bg-muted-foreground/60" />
      Not configured
    </span>
  );
}

function relativeFromNow(value: Date) {
  const diff = Date.now() - value.getTime();
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(value);
}
