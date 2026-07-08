// ICP-3 — the Clients screen (the builder's book of deployments).
//
// Lists every client this builder has deployed an agent to: the client name,
// its shared number, and — for each agent running for that client — which
// template it runs, its trigger/type, the surface, the $/mo price, and a status
// badge (draft / active / paused / canceled). These are LITE TENANTS — SMB
// clients who never log into SeldonFrame. Most agents start (and, until the gated
// activation steps ship, stay) `draft`: the number + billing aren't live yet,
// which the badge + the empty-state copy state honestly.
//
// F4: the page GROUPS deployments by client (groupDeploymentsByClient) so a
// client running several agents shows ONE card listing all of them, instead of
// one card per deployment. Each agent is a row with its own status + actions,
// still addressable by its specific deployment id.
//
// F1: an OUTBOUND agent (event/schedule — review-requester, speed-to-lead) never
// books, so its row HIDES the booking-rules panel and shows a small note instead.
//
// Distinct from the main-nav "/clients" (the workspace portfolio) — reconciling
// those two nouns is a later Phase-4 decision; this screen is the Studio's.
//
// Auth + builder resolution: getOrgId() — the operator's org IS the builder org.
//
// Reskin (Claude Design, direction A / "book of business"): a quiet header,
// Clients / Total-MRR / Active-agents KPI tiles, and each client as a calm card
// with an initials avatar, a health pill, and a per-month figure — on the LIVE
// SeldonFrame tokens. RESKIN ONLY: every wired control (activate / pause / cancel
// / portal invite / connect-calendar / configure / review-link) is preserved
// verbatim; the avatar, health, and MRR are pure read-only folds over the
// deployments already loaded.

import Link from "next/link";
import { Users, Phone, Bot, Wallet, Tag, ArrowRight } from "lucide-react";
import { getOrgId, getCurrentUser } from "@/lib/auth/helpers";
import {
  listDeployments,
  groupDeploymentsByClient,
  type ClientGroup,
} from "@/lib/deployments/store";
import {
  formatCentsMonthly,
  formatDeploymentSurface,
  describeOutboundAgent,
} from "@/lib/deployments/margin";
import { resolveBookingPolicy } from "@/lib/agents/booking/booking-policy";
import {
  resolveAgentTrigger,
  triggerLabel,
} from "@/lib/agents/triggers/agent-trigger";
import { getAgencyUsageRollup, usageByOrgId } from "@/lib/billing/usage-rollup";
import { parseUsageCap, evaluateUsageCap, periodKeyUtc } from "@/lib/billing/usage-cap";
import { isAutopayConsoleOn } from "@/lib/web-build/policy";
import { deriveRetainerStatus } from "@/lib/payments/retainer";
import { db } from "@/db";
import { organizations, subscriptions } from "@/db/schema";
import { inArray, desc } from "drizzle-orm";
import { StudioTabs } from "../studio-tabs";
import { DeploymentStatusBadge } from "./status-badge";
import { ClientUsagePanel, UsageTotalsTile } from "./usage-panel";
import { UsageCapEditor, UsageCapBreachBanner } from "./usage-cap-editor";
import { BillingRetainerEditor } from "./billing-retainer-editor";
import {
  ActivateForm,
  ActivateOutboundButton,
  PauseButton,
  PortalInviteButton,
  CancelButton,
  ConnectCalendarButton,
  ConfigureSection,
  ReviewLinkSection,
} from "./activate-form";

export const dynamic = "force-dynamic";

export default async function StudioClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string }>;
}) {
  // The calendar-connect callback bounces back here with ?calendar=connected|error
  // (the pill state already reflects success; this is a one-line confirmation).
  const { calendar } = await searchParams;
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <section className="animate-page-enter space-y-4">
        <StudioTabs />
        <h1 className="text-page-title">Clients</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to see your clients.
        </p>
      </section>
    );
  }

  const deployments = await listDeployments(orgId);
  // F4: one card per client (groups all the client's agents), most-recent first.
  const clients = groupDeploymentsByClient(deployments);

  // Portfolio totals for the KPI strip — pure folds over the grouped clients.
  const totals = summarizeClientTotals(clients);

  // Per-sub-account usage meter (2026-07-08, D1/D3): ONE grouped rollup query
  // for the whole book, keyed by the agency OWNER's userId (not orgId — the
  // counted-sub-account rule keys off partner_agencies.owner_user_id). Never
  // blocks the page: a signed-in operator with no user record (synthetic
  // admin-token/operator-portal sessions) simply sees no usage panel.
  const currentUser = await getCurrentUser();
  const usageRollup = currentUser?.id
    ? await getAgencyUsageRollup(currentUser.id)
    : { perOrg: [], totals: { conversations: 0, tokensIn: 0, tokensOut: 0, estCostCents: 0, voiceSpendCents: 0 } };
  const usageByOrg = usageByOrgId(usageRollup);
  const hasUsage = usageRollup.perOrg.length > 0;

  // Caps (Task 3, D4/D5): ONE query for every counted client org's settings —
  // no N+1. Parsed + breach-evaluated per org against this period's estimated
  // cost (already loaded above via usageByOrg).
  const countedOrgIds = usageRollup.perOrg.map((r) => r.orgId);
  const capRows =
    countedOrgIds.length > 0
      ? await db
          .select({ id: organizations.id, settings: organizations.settings })
          .from(organizations)
          .where(inArray(organizations.id, countedOrgIds))
      : [];
  const periodKey = periodKeyUtc();
  const capByOrg = new Map(
    capRows.map((row) => [row.id, parseUsageCap(row.settings)] as const),
  );

  // Autopay console (2026-07-08, Task 2) — flag-gated. Off → the editor is
  // absent entirely (pinned by a test) and this query never runs.
  const autopayConsoleOn = isAutopayConsoleOn({ SF_AUTOPAY_CONSOLE: process.env.SF_AUTOPAY_CONSOLE });
  const retainerStatusByOrg = new Map<string, ReturnType<typeof deriveRetainerStatus>>();
  if (autopayConsoleOn) {
    const clientOrgIds = clients
      .map((g) => g.clientOrgId)
      .filter((id): id is string => Boolean(id));
    if (clientOrgIds.length > 0) {
      const subRows = await db
        .select({ orgId: subscriptions.orgId, status: subscriptions.status, createdAt: subscriptions.createdAt })
        .from(subscriptions)
        .where(inArray(subscriptions.orgId, clientOrgIds))
        .orderBy(desc(subscriptions.createdAt));
      // Keep only the MOST RECENT subscription row per org (orderBy above
      // means the first occurrence per orgId in iteration order is the latest).
      const seen = new Set<string>();
      for (const row of subRows) {
        if (seen.has(row.orgId)) continue;
        seen.add(row.orgId);
        retainerStatusByOrg.set(row.orgId, deriveRetainerStatus({ subscription: { status: row.status } }));
      }
      for (const orgId of clientOrgIds) {
        if (!retainerStatusByOrg.has(orgId)) retainerStatusByOrg.set(orgId, "none");
      }
    }
  }

  return (
    <section className="animate-page-enter space-y-6">
      <StudioTabs />

      {calendar === "connected" && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          ✓ Calendar connected — the agent now books into the client&apos;s calendar.
        </p>
      )}
      {calendar === "error" && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-2 text-sm text-rose-600 dark:text-rose-400">
          Calendar connection failed — try again.
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-page-title">Clients</h1>
          <p className="text-label text-muted-foreground">
            Who you serve and whether their agents are healthy. They never log in
            — this is your book of business.
          </p>
        </div>
        {clients.length > 0 && (
          <Link href="/studio/agents" className="crm-button-secondary h-10 px-4 text-sm">
            Deploy an agent
          </Link>
        )}
      </div>

      {clients.length === 0 ? (
        <article className="rounded-2xl border border-border bg-card p-8 text-center shadow-(--shadow-xs)">
          <div className="mx-auto max-w-md space-y-4">
            <span
              className="mx-auto inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"
              aria-hidden
            >
              <Users className="size-6" />
            </span>
            <h2 className="text-lg font-semibold text-foreground">
              No clients yet — deploy an agent.
            </h2>
            <p className="text-sm text-muted-foreground">
              Build an agent once, then deploy it to a client. Each client you
              deploy to shows up here with its plan and status.
            </p>
            <div className="flex justify-center pt-2">
              <Link href="/studio/agents" className="crm-button-primary h-10 px-5 text-sm">
                Go to Agents
              </Link>
            </div>
          </div>
        </article>
      ) : (
        <>
          {/* ── Portfolio KPI strip: Clients · Total MRR · Active agents (+ Usage) ── */}
          <div className={`grid grid-cols-1 gap-3 sm:grid-cols-3 ${hasUsage ? "lg:grid-cols-4" : ""}`}>
            <ClientKpiTile
              label="Clients"
              value={totals.clientCount.toLocaleString("en-US")}
              icon={<Users className="size-[22px]" />}
              tone="primary"
            />
            <ClientKpiTile
              label="Total MRR · active"
              value={formatCentsMonthly(totals.mrrCents)}
              icon={<Wallet className="size-[22px]" />}
              tone="positive"
            />
            <ClientKpiTile
              label="Active agents"
              value={totals.activeAgents.toLocaleString("en-US")}
              icon={<Bot className="size-[22px]" />}
              tone="neutral"
            />
            {hasUsage && <UsageTotalsTile totals={usageRollup.totals} />}
          </div>

          <div className="space-y-4">
            {clients.map((client) => {
              const health = clientHealth(client);
              const mrrCents = clientMrrCents(client);
              return (
                <article
                  key={client.clientKey}
                  className="overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-xs)"
                >
                  {/* ── Client header: avatar + name + agent count + number, health
                      pill, and the client's per-month figure — shown ONCE ──── */}
                  <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary"
                        aria-hidden
                      >
                        {clientInitials(client.clientName)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-card-title truncate text-foreground">
                            {client.clientName}
                          </p>
                          {/* ICP-3 (Vertical): the client's industry from its Soul,
                              shown as a calm hairline chip. Fail-soft "—" when the
                              client has no workspace/industry yet. */}
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            <Tag className="size-2.5" aria-hidden />
                            {client.clientVertical ?? "—"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {client.agents.length === 1
                            ? "1 agent"
                            : `${client.agents.length} agents`}
                          {client.number && (
                            <>
                              {" • "}
                              <Phone className="mb-0.5 mr-0.5 inline size-3" />
                              {client.number}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-5">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${health.text}`}
                      >
                        <span
                          className={`size-[7px] rounded-full ${health.dot}`}
                          aria-hidden
                        />
                        {health.label}
                      </span>
                      {mrrCents > 0 && (
                        <div className="text-right">
                          <div className="font-mono text-lg font-semibold tracking-tight text-foreground">
                            {formatCentsMonthly(mrrCents)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            per month
                          </div>
                        </div>
                      )}
                    </div>
                  </header>

                  {/* ── Each agent: a row with its own status + actions ─────────── */}
                  <ul className="divide-y divide-border">
                    {client.agents.map((d) => {
                      const trigger = resolveAgentTrigger(
                        d.templateTrigger as Parameters<typeof resolveAgentTrigger>[0],
                        d.surface,
                      );
                      // A review-requester agent — the one that needs the client's
                      // Google review link. Detected by skill (trigger event
                      // booking.completed), matching the runtime's skillForEvent.
                      const isReviewRequester =
                        trigger.kind === "event" &&
                        trigger.event === "booking.completed";
                      return (
                        <li key={d.id} className="px-5 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium leading-tight text-foreground">
                                {d.templateName ?? "Agent"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {triggerLabel(trigger)} •{" "}
                                {formatDeploymentSurface(d.surface)} •{" "}
                                {formatCentsMonthly(d.priceCents)}
                              </p>
                              <div className="mt-2">
                                <DeploymentStatusBadge status={d.status} />
                              </div>
                            </div>

                            {/* Per-agent activation / pause / cancel — addressed to
                                THIS deployment id. The decider is needsNumber, NOT
                                isOutbound: a PURE-outbound agent (review/social/digest)
                                shares the client's number, so it gets a one-click
                                no-phone activate. An agent that needs its own line —
                                an inbound receptionist OR a missed-call agent
                                (event-triggered but it forwards-in + texts-back) —
                                goes through the get-a-number flow so it owns a line. */}
                            {d.status === "draft" &&
                              (d.needsNumber ? (
                                <ActivateForm
                                  deploymentId={d.id}
                                  contactPhone={d.clientContact?.phone ?? null}
                                />
                              ) : (
                                <ActivateOutboundButton deploymentId={d.id} />
                              ))}
                            {d.status === "active" && (
                              <div className="flex flex-wrap items-start justify-end gap-2">
                                {/* Connect the client's external calendar — only for
                                    api_mcp bookings (native / external_link never book
                                    externally). */}
                                {d.bookingMode === "api_mcp" && (
                                  <ConnectCalendarButton
                                    deploymentId={d.id}
                                    connected={Boolean(d.calendarRef?.accountId)}
                                  />
                                )}
                                <PortalInviteButton
                                  deploymentId={d.id}
                                  clientOrgId={d.clientOrgId}
                                  portalInvitedAt={
                                    d.portalInvitedAt
                                      ? d.portalInvitedAt.toISOString()
                                      : null
                                  }
                                />
                                <PauseButton deploymentId={d.id} phoneNumber={d.phoneNumber} />
                                <CancelButton deploymentId={d.id} phoneNumber={d.phoneNumber} />
                              </div>
                            )}
                            {d.status === "paused" && (
                              <div className="flex flex-wrap items-start justify-end gap-2">
                                {d.bookingMode === "api_mcp" && (
                                  <ConnectCalendarButton
                                    deploymentId={d.id}
                                    connected={Boolean(d.calendarRef?.accountId)}
                                  />
                                )}
                                <CancelButton deploymentId={d.id} phoneNumber={d.phoneNumber} />
                              </div>
                            )}
                          </div>

                          {/* F1 — an OUTBOUND (event/schedule) agent shows a small note
                              instead of booking rules. The copy reflects what THIS
                              agent actually does (books / posts / sends), derived from
                              its blueprint — never the old hard-coded "doesn't take
                              bookings", which was wrong for an agent wired to book. Its
                              per-client Google review link — the single most important
                              field for a review-requester to fire — stays surfaced
                              INLINE here (with an edit affordance, or a warning when
                              unset), never hidden behind the Configure disclosure below. */}
                          {d.isOutbound && (
                            <>
                              <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
                                {describeOutboundAgent({
                                  books: d.agentBooks,
                                  posts: d.agentPosts,
                                })}
                              </p>
                              {isReviewRequester && (
                                <ReviewLinkSection
                                  deploymentId={d.id}
                                  initial={d.customization ?? null}
                                />
                              )}
                            </>
                          )}

                          {/* R3 — ONE "Configure" affordance per agent row: a collapsed
                              disclosure that edits THIS deployment's per-client settings
                              inline (no page leave), plus an "Edit agent template →" link
                              for template-level config. Each flag scopes what the panel
                              shows:
                                • customization (greeting / voice / review link / business
                                  info) — agents that SPEAK (phone / embed / link); the
                                  text-only surfaces (sms / email) + OUTBOUND agents don't
                                  get a spoken persona;
                                • booking rules — agents that BOOK (native / api_mcp /
                                  cal_com); external_link hands booking to the client's own
                                  page (no rules) and OUTBOUND never books.
                              The booking-rules editor is seeded with the EFFECTIVE policy
                              (deployment override ?? system defaults; the template default
                              + workspace tz aren't on this list query, and the resolver
                              fills them safely). Every control is keyed to d.id, so the
                              grouped agents on one client card never cross saves. */}
                          <ConfigureSection
                            deploymentId={d.id}
                            agentTemplateId={d.agentTemplateId}
                            showCustomization={
                              !d.isOutbound &&
                              (d.surface === "phone" ||
                                d.surface === "embed" ||
                                d.surface === "link")
                            }
                            customization={d.customization ?? null}
                            showBookingRules={
                              !d.isOutbound && d.bookingMode !== "external_link"
                            }
                            bookingPolicy={resolveBookingPolicy(
                              d.bookingPolicy ?? null,
                              null,
                              undefined,
                            )}
                          />
                        </li>
                      );
                    })}
                  </ul>

                  {/* Per-sub-account usage meter (D3) — the client's rolled-up AI
                      usage this month, omitted when unprovisioned/zero-activity. */}
                  <ClientUsagePanel row={client.clientOrgId ? usageByOrg.get(client.clientOrgId) : undefined} />

                  {/* Usage cap (D4/D5) — breach banner (only when the resolved cap is
                      crossed this period) + the collapsible cap editor. Both keyed off
                      the provisioned clientOrgId; omitted entirely for un-activated
                      drafts (nothing to cap yet). */}
                  {client.clientOrgId &&
                    (() => {
                      const cap = capByOrg.get(client.clientOrgId) ?? null;
                      const usageRow = usageByOrg.get(client.clientOrgId);
                      const evaluation = evaluateUsageCap({
                        cap,
                        estCostCents: usageRow?.estCostCents ?? 0,
                        periodKey,
                      });
                      return (
                        <>
                          {evaluation.breached && cap && (
                            <UsageCapBreachBanner
                              estCostCents={usageRow?.estCostCents ?? 0}
                              capCents={cap.monthlyEstCostCentsCap}
                              mode={cap.mode}
                            />
                          )}
                          <UsageCapEditor clientOrgId={client.clientOrgId} initial={cap} />
                        </>
                      );
                    })()}

                  {/* Autopay console (2026-07-08, Task 2) — flag-gated "Billing &
                      retainer" editor. Status is derived server-side
                      (deriveRetainerStatus) from the stored subscriptions row;
                      never a Stripe call to render. */}
                  {autopayConsoleOn && client.clientOrgId && (
                    <BillingRetainerEditor
                      clientOrgId={client.clientOrgId}
                      status={retainerStatusByOrg.get(client.clientOrgId) ?? "none"}
                    />
                  )}

                  {/* ── Card footer: Deploy another agent + Open client. The
                      grouped client now carries its workspace slug (joined from
                      organizations on clientOrgId), so "Open client →" links to
                      the agency-side workspace hub at /clients/<slug>/ready — the
                      SAME destination the sidebar/topbar workspace switcher uses
                      when flipping into a client workspace. Shown only once the
                      client has a provisioned workspace (slug present); an
                      un-activated draft client omits it (nothing to open yet). ── */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
                    <Link
                      href="/studio/agents"
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm font-medium text-primary transition-colors hover:border-primary/60 hover:bg-primary/5"
                    >
                      <Bot className="size-4" />
                      Deploy another agent
                    </Link>
                    {client.clientSlug && (
                      <Link
                        href={`/clients/${client.clientSlug}/ready`}
                        className="crm-pressable inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                      >
                        Open client
                        <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

/** A calm KPI tile for the portfolio strip: a soft-tinted icon chip beside a big
 *  mono figure + label. Pure presentation. */
function ClientKpiTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "primary" | "positive" | "neutral";
}) {
  const toneChip =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "positive"
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : "bg-muted text-muted-foreground";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-(--shadow-xs)">
      <span
        className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl ${toneChip}`}
        aria-hidden
      >
        {icon}
      </span>
      <div>
        <div className="font-mono text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

/** Up-to-two-letter initials from the client name (e.g. "Valley Air" → "VA").
 *  Falls back to "•" for an empty name. Pure. */
function clientInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "•";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Sum of this client's ACTIVE deployments' monthly price (cents). Mirrors the
 *  revenue primitive's "only active counts" rule. Pure. */
function clientMrrCents(client: ClientGroup): number {
  return client.agents.reduce(
    (sum, d) => (d.status === "active" ? sum + (d.priceCents || 0) : sum),
    0,
  );
}

/** A client's roll-up health from its agents' statuses, mapped to the live
 *  semantic tokens. Any paused/canceled → amber "Attention"; any draft (not yet
 *  live) → primary "Setup"; otherwise "Live" green; no agents → muted. Pure. */
function clientHealth(client: ClientGroup): {
  label: string;
  text: string;
  dot: string;
} {
  const statuses = client.agents.map((d) => d.status);
  if (statuses.length === 0) {
    return {
      label: "Idle",
      text: "text-muted-foreground",
      dot: "bg-muted-foreground/50",
    };
  }
  if (statuses.some((s) => s === "paused" || s === "canceled")) {
    return {
      label: "Attention",
      text: "text-amber-600 dark:text-amber-400",
      dot: "bg-amber-500",
    };
  }
  if (statuses.some((s) => s === "draft")) {
    return { label: "Setup", text: "text-primary", dot: "bg-primary" };
  }
  return {
    label: "Live",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  };
}

/** Portfolio roll-ups for the KPI strip: client count, summed active MRR, and the
 *  count of active agents across all clients. Pure folds. */
function summarizeClientTotals(clients: ClientGroup[]): {
  clientCount: number;
  mrrCents: number;
  activeAgents: number;
} {
  let mrrCents = 0;
  let activeAgents = 0;
  for (const c of clients) {
    for (const d of c.agents) {
      if (d.status === "active") {
        activeAgents += 1;
        mrrCents += d.priceCents || 0;
      }
    }
  }
  return { clientCount: clients.length, mrrCents, activeAgents };
}
