import Link from "next/link";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import {
  ArrowRight,
  Bell,
  CalendarCheck,
  CloudRain,
  MessageCircle,
  Phone,
  RefreshCw,
  Star,
  Sun,
  Zap,
} from "lucide-react";
import { db } from "@/db";
import { agents, workflowRuns, type OrganizationIntegrations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getArchetype, listArchetypes } from "@/lib/agents/archetypes";
import { resolveVoiceCardStatus, type VoiceCardStatus } from "@/lib/agents/voice/card-status";
import type { AgentConfig } from "@/lib/agents/configure-actions";
import { SoulAutomationsOverview } from "@/components/automations/soul-automations-overview";
import { TwoDoorsCard } from "@/components/automations/two-doors-card";
import { YourAgentsStrip } from "@/components/automations/your-agents-strip";
import { loadDeployedAgentsForStrip } from "@/lib/agent-receipts/store";
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

  // Agent truth slice (Task 3) — org-scoped deployed-agent strip. Reuses the
  // agent-receipts store's getDeploymentLiveStatus shape (never a second
  // status-deriving implementation) for the live dot + trigger-kind chip.
  const deployedAgentRows = orgId ? await loadDeployedAgentsForStrip(orgId) : [];

  // Soul-suggestion data + agent configs (the latter drives card status).
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

  // Per-archetype saved config map. Drives the status badge: not
  // configured / incomplete / ready / live / paused. The status
  // resolution is shared with the archetype card so the badge says
  // what's actually true (per the operator audit — previous version
  // showed "Not configured" even after saving).
  const orgSettings = (org?.settings ?? {}) as Record<string, unknown>;
  const agentConfigs =
    orgSettings.agentConfigs && typeof orgSettings.agentConfigs === "object"
      ? (orgSettings.agentConfigs as Record<string, AgentConfig>)
      : {};

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

  // Coerce SQL aggregate timestamps to Date instances before they
  // hit the rendering path. Drizzle's `sql<Date | null>` type
  // annotation is a TypeScript-only hint — Neon's HTTP driver
  // returns the aggregate (`max(created_at)`) as a raw ISO string
  // because there's no column-type lookup for ad-hoc SQL exprs.
  // Without this coercion, `relativeFromNow(value)` calls
  // `value.getTime()` on a string at render time and the catalog
  // page returns 500. The pre-dispatcher catalog never hit this
  // path because lastRun was always null (no workflow_runs rows
  // for any org); the dispatcher creating its first run is what
  // unmasked the bug.
  const toDate = (value: Date | string | null | undefined): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const statsByArchetype = new Map<
    string,
    { last30d: number; lastRun: Date | null; everRan: boolean }
  >();
  for (const row of everRanRows) {
    statsByArchetype.set(row.archetypeId, {
      last30d: 0,
      lastRun: toDate(row.lastRun as Date | string | null),
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
      lastRun: toDate(row.lastRun as Date | string | null) ?? existing.lastRun,
    });
  }

  const archetypes = listArchetypes();

  // Voice Receptionist card status. The voice agent is an `agents` row
  // (archetype 'voice-receptionist'), NOT a settings.agentConfigs automation,
  // so its status comes from the row's `status` + whether a Twilio number is
  // assigned (no number = calls can't route to it). We do NOT get-or-create
  // here — the catalog is read-only; the row is lazily created when the
  // operator opens the editor (or on the first inbound call).
  const [voiceAgentRow] = orgId
    ? await db
        .select({ status: agents.status })
        .from(agents)
        .where(and(eq(agents.orgId, orgId), eq(agents.archetype, "voice-receptionist")))
        .limit(1)
    : [];
  const voiceIntegrations = (org?.integrations ?? {}) as OrganizationIntegrations;
  const voiceHasNumber = Boolean(voiceIntegrations.twilio?.fromNumber?.trim());
  const voiceCardStatus = resolveVoiceCardStatus({
    agentStatus: voiceAgentRow?.status ?? null,
    hasNumber: voiceHasNumber,
  });

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
    // May 1, 2026 — Google Calendar removed; Cal.diy IS the calendar.
    // Keep field present for downstream type compat; always false.
    google: false,
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
          Set up rules that run on their own — like sending a follow-up email
          when a booking comes in, or texting a reminder before a service call.
          Pick a template below to get started.
        </p>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Available templates
          </h2>
          <span className="text-xs text-muted-foreground">
            {archetypes.length} {archetypes.length === 1 ? "template" : "templates"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {/* Voice Receptionist — a per-workspace `agents` row (channel
              'voice'), NOT a settings.agentConfigs automation, so it links to
              its OWN editor route (not /automations/[id]/configure) and derives
              status from the agent row + assigned number. Same card chrome as
              the archetype cards above. */}
          <Link
            href="/automations/voice-receptionist"
            className="group flex flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground transition-all hover:border-primary/40 hover:shadow-(--shadow-card)"
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className="inline-flex size-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
                aria-hidden
              >
                <Phone className="size-4" />
              </span>
              <VoiceStatusBadge status={voiceCardStatus} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                Voice Receptionist
              </h3>
              <p className="line-clamp-3 text-xs text-muted-foreground">
                An AI receptionist that answers calls to your voice number —
                books appointments, answers FAQ, and hands off to a person when
                needed.
              </p>
            </div>
            <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
              <span>
                {voiceHasNumber ? "Number assigned" : "No number yet"}
              </span>
              <span className="inline-flex items-center gap-1 text-foreground transition-transform group-hover:translate-x-0.5">
                Configure
                <ArrowRight className="size-3" />
              </span>
            </div>
          </Link>

          {archetypes.map((archetype) => {
            const visuals = ARCHETYPE_VISUALS[archetype.id] ?? FALLBACK_VISUAL;
            const Icon = visuals.icon;
            const stats = statsByArchetype.get(archetype.id);
            const config = agentConfigs[archetype.id] ?? null;
            const status = resolveCatalogStatus(archetype.id, config, stats);
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

          {/* Agent truth slice (2026-07-16, Task 2) — the "Custom Workflow —
              COMING SOON" card was navigation dishonesty: the custom path
              already exists (describe-by-default in Studio, or record
              yourself once). Replaced with a real, enabled two-doors card. */}
          <TwoDoorsCard />
        </div>
      </div>

      {/* Agent truth slice (Task 3, P4-lite) — "where are my agents"
          (Max's live-run finding: "i don't see the agents for zen in
          /automations"). A compact, org-scoped strip of every DEPLOYED agent
          — NOT the full /automations↔agents fold-in (that stays the named
          roadmap item). */}
      <YourAgentsStrip rows={deployedAgentRows} />

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

type CatalogStatus = "not_configured" | "incomplete" | "ready" | "live" | "paused";

/**
 * Status resolution per the operator-audit lifecycle spec:
 *   - No config row at all → "Not configured" (gray dot)
 *   - Config exists but required user-input placeholders are empty
 *     → "Incomplete" (amber dot)
 *   - Config exists, all required fields filled, deployedAt is null
 *     OR pausedAt is set → "Ready to deploy" / "Paused"
 *   - Config exists + deployedAt set + pausedAt null → "Live" (green
 *     dot, last-run timestamp)
 *
 * Required-field check matches the validation in saveAgentConfigAction
 * — only `kind: "user_input"` placeholders are required; soul_copy
 * placeholders are filled by Claude during synthesis.
 */
function resolveCatalogStatus(
  archetypeId: string,
  config: AgentConfig | null,
  _stats: { last30d: number; lastRun: Date | null; everRan: boolean } | undefined
): CatalogStatus {
  if (!config) return "not_configured";

  const archetype = getArchetype(archetypeId);
  if (archetype) {
    for (const [key, meta] of Object.entries(archetype.placeholders)) {
      if (meta.kind !== "user_input") continue;
      const value = config.placeholders?.[key];
      if (!value || !value.trim()) return "incomplete";
    }
  }

  if (config.deployedAt && !config.pausedAt) return "live";
  if (config.pausedAt) return "paused";
  return "ready";
}

/**
 * Voice Receptionist card badge. Distinct from StatusBadge because the voice
 * agent has its own status vocabulary (resolveVoiceCardStatus): it can be
 * "no_number" (agent exists but no Twilio number assigned → calls can't route)
 * which the run-based archetype lifecycle has no equivalent for. Visual chrome
 * matches StatusBadge so the card reads consistently in the grid.
 */
function VoiceStatusBadge({ status }: { status: VoiceCardStatus }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Live
      </span>
    );
  }
  if (status === "paused") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-400 ring-1 ring-inset ring-zinc-500/20">
        <span className="size-1.5 rounded-full bg-zinc-500" />
        Paused
      </span>
    );
  }
  if (status === "no_number") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20">
        <span className="size-1.5 rounded-full bg-amber-500" />
        Needs a number
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20">
        <span className="size-1.5 rounded-full bg-amber-500/60" />
        Draft
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

function StatusBadge({
  status,
  runs,
}: {
  status: CatalogStatus;
  runs: number;
}) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
        {runs > 0 ? `Live · ${runs} ${runs === 1 ? "run" : "runs"}/30d` : "Live"}
      </span>
    );
  }
  if (status === "paused") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-400 ring-1 ring-inset ring-zinc-500/20">
        <span className="size-1.5 rounded-full bg-zinc-500" />
        Paused
      </span>
    );
  }
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20">
        <span className="size-1.5 rounded-full bg-amber-500" />
        Ready to deploy
      </span>
    );
  }
  if (status === "incomplete") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20">
        <span className="size-1.5 rounded-full bg-amber-500/60" />
        Incomplete
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

function relativeFromNow(value: Date | string) {
  // Defense in depth — accept either a real Date or an ISO string.
  // The catalog query's `toDate` helper already coerces, but
  // hardening here prevents a future caller from hitting the
  // same `.getTime is not a function` SSR 500.
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}
