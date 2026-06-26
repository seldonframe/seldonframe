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

import Link from "next/link";
import { Users, Phone } from "lucide-react";
import { getOrgId } from "@/lib/auth/helpers";
import { listDeployments, groupDeploymentsByClient } from "@/lib/deployments/store";
import {
  formatCentsMonthly,
  formatDeploymentSurface,
} from "@/lib/deployments/margin";
import { resolveBookingPolicy } from "@/lib/agents/booking/booking-policy";
import {
  resolveAgentTrigger,
  triggerLabel,
} from "@/lib/agents/triggers/agent-trigger";
import { StudioTabs } from "../studio-tabs";
import { DeploymentStatusBadge } from "./status-badge";
import {
  ActivateForm,
  ActivateOutboundButton,
  PauseButton,
  PortalInviteButton,
  CancelButton,
  ConnectCalendarButton,
  BookingRulesSection,
  CustomizationSection,
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

  return (
    <section className="animate-page-enter space-y-5">
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
          <p className="text-label text-[hsl(var(--color-text-secondary))]">
            Every client you&apos;ve deployed an agent to. They never log in —
            this is your book of business.
          </p>
        </div>
        {clients.length > 0 && (
          <Link href="/studio/agents" className="crm-button-secondary h-10 px-4 text-sm">
            Deploy an agent
          </Link>
        )}
      </div>

      {clients.length === 0 ? (
        <article className="rounded-xl border bg-card p-8 text-center">
          <div className="mx-auto max-w-md space-y-4">
            <span
              className="mx-auto inline-flex size-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
              aria-hidden
            >
              <Users className="size-6" />
            </span>
            <h2 className="text-lg font-semibold">No clients yet — deploy an agent.</h2>
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
        <div className="space-y-3">
          {clients.map((client) => (
            <article key={client.clientKey} className="rounded-xl border bg-card p-5">
              {/* ── Client header: name + shared number, shown ONCE ─────────── */}
              <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
                <div className="min-w-0">
                  <p className="text-card-title truncate">{client.clientName}</p>
                  <p className="text-sm text-muted-foreground">
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
              </header>

              {/* ── Each agent: a row with its own status + actions ─────────── */}
              <ul className="divide-y">
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
                    <li key={d.id} className="py-4 first:pt-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium leading-tight">
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
                            THIS deployment id. Outbound agents (event/schedule)
                            share the client's number, so they get a one-click
                            no-phone activate instead of the get-a-number flow
                            (which would collide with the client's receptionist
                            line). */}
                        {d.status === "draft" &&
                          (d.isOutbound ? (
                            <ActivateOutboundButton deploymentId={d.id} />
                          ) : (
                            <ActivateForm
                              deploymentId={d.id}
                              contactPhone={d.clientContact?.phone ?? null}
                            />
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

                      {/* F1 — booking rules ONLY for agents that BOOK. An OUTBOUND
                          agent (event/schedule) never books, so we hide the panel
                          and show a small note instead. external_link hands the
                          booking off to the client's own page (also no rules). For
                          everyone else: the per-client booking-rules panel, seeded
                          with the EFFECTIVE policy (deployment override ?? system
                          defaults; the template default + workspace tz aren't
                          fetched on this list query, and the resolver fills them
                          safely). */}
                      {d.isOutbound ? (
                        <>
                          <p className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">
                            This agent doesn&apos;t take bookings — it sends on an event.
                          </p>
                          {/* The per-client Google review link — the single most
                              important field for a review-requester to fire. Shown
                              inline with an edit affordance (or a warning when
                              unset). Seeded with the deployment's stored
                              customization (null = none yet). */}
                          {isReviewRequester && (
                            <ReviewLinkSection
                              deploymentId={d.id}
                              initial={d.customization ?? null}
                            />
                          )}
                        </>
                      ) : (
                        d.bookingMode !== "external_link" && (
                          <BookingRulesSection
                            deploymentId={d.id}
                            initialPolicy={resolveBookingPolicy(
                              d.bookingPolicy ?? null,
                              null,
                              undefined,
                            )}
                          />
                        )
                      )}

                      {/* Per-agent customization — greeting / TTS voice / business
                          info, for every agent that SPEAKS: a conversational
                          surface (phone / embed / link). The text-only surfaces
                          (sms / email) don't get a spoken persona here, and neither
                          do OUTBOUND agents (event/schedule — they compose a
                          message, not a live voice). Seed with the deployment's
                          stored customization (null = no override → template
                          defaults). */}
                      {!d.isOutbound &&
                        (d.surface === "phone" ||
                          d.surface === "embed" ||
                          d.surface === "link") && (
                          <CustomizationSection
                            deploymentId={d.id}
                            initial={d.customization ?? null}
                          />
                        )}
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
