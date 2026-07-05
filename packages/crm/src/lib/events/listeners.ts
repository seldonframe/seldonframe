import { eq } from "drizzle-orm";
import { getSeldonEventBus } from "@seldonframe/core/events";
import { getCoreRuntimeConfig } from "@seldonframe/core/config";
import { configureTelemetry, trackTelemetryEvent } from "@seldonframe/core/telemetry";
import { db } from "@/db";
import { bookings, changePlans, intakeForms, intakeSubmissions, onboardingLinks } from "@/db/schema";
import { dispatchEventToDeployedAgents } from "@/lib/agents/dispatcher";
// 2026-06-25 — unified agent model P1 (T4): event-triggered OUTBOUND agents.
// review-requester ← booking.completed, speed-to-lead ← lead.created. The
// orchestrator is pure-ish + DI'd; buildRunEventAgentDeps supplies the real
// agent_templates lookup + the existing sendSms/sendEmail seam.
import { runEventAgent, type RunEventAgentResult } from "@/lib/agents/triggers/run-event-agent";
import { buildRunEventAgentDeps } from "@/lib/agents/triggers/run-event-agent-deps";
import { sendTriggeredEmailsForContactEvent, sendWelcomeEmailForContact } from "@/lib/emails/actions";
import { syncContactToNewsletter } from "@/lib/integrations/newsletter-sync";
// 2026-05-18 — Outbound messaging dispatch (plan v2, slice 2).
import { dispatchOutboundMessagesForEvent } from "@/lib/messaging/dispatch";
// 2026-06-21 — ICS-push: emit an .ics calendar invite on booking.created.
import { sendBookingCalendarInvite } from "@/lib/calendar/booking-invite";
// Task 8 — push new bookings into the org's OWN connected Google/Outlook
// calendar (Composio, org-level connection). Fail-soft; fire-and-forget.
import { pushBookingToConnectedCalendar } from "@/lib/integrations/calendar-push";
// 2026-05-18 — Slice 6: cancel pending scheduled sends (e.g. 24h
// reminders) when their target booking is cancelled.
import { cancelScheduledSendsForBooking } from "@/lib/messaging/schedule";
// 2026-06-04 — Onboarding T12: persist change plan on onboarding submission.
import { buildChangePlan } from "@/lib/onboarding/change-plan";
import { sendNewSignupAlert } from "@/lib/notifications/ops-notifications";
// 2026-06-09 — call.missed orgId resolution via Twilio number lookup.
import { resolveWorkspaceByPhoneNumber } from "@/lib/agents/voice/resolve-workspace-by-number";

/**
 * The SeldonEvent typed schema doesn't include orgId on form.submitted /
 * booking.created payloads — orgId is metadata passed into emitSeldonEvent
 * for workflow_event_log persistence but doesn't propagate to in-memory
 * bus listeners. To dispatch to deployed agents we need the orgId; we
 * resolve it from the form / booking id with a small indexed query.
 * This is fast (covered indexes) and runs only when there's at least
 * one matching event subscriber.
 */
async function resolveOrgIdForFormId(formId: string): Promise<string | null> {
  if (!formId) return null;
  const [row] = await db
    .select({ orgId: intakeForms.orgId })
    .from(intakeForms)
    .where(eq(intakeForms.id, formId))
    .limit(1);
  return row?.orgId ?? null;
}

async function resolveOrgIdForBookingId(bookingId: string): Promise<string | null> {
  if (!bookingId) return null;
  const [row] = await db
    .select({ orgId: bookings.orgId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row?.orgId ?? null;
}

/**
 * 2026-06-26 — Agent loop-memory (State), T4. Make an event-agent run TRACEABLE
 * in logs: there's no workflow_runs row for the event-agent path (that's the
 * archetype dispatcher), so the durable record is the Brain note + this line.
 * runEventAgent's return summary now carries the recalled/recorded loop-memory;
 * we log it (counts, not full bodies) so an operator/engineer can see, for a
 * fired booking.completed/lead.created, that the agent acted and what it
 * remembered + wrote. Only logs when an agent actually matched (matched > 0) to
 * keep the no-op common case quiet. Never throws — logging must not break the
 * bus handler.
 */
function logEventAgentRun(
  eventType: string,
  orgId: string,
  contactId: string | null,
  result: RunEventAgentResult,
): void {
  if (result.matched === 0) return;
  try {
    console.info(
      JSON.stringify({
        action: "event_agent.run",
        eventType,
        orgId,
        contactId,
        matched: result.matched,
        sent: result.sent,
        skipped: result.skipped,
        throttled: result.throttled,
        // 2026-06-26 — Outbound-UX Bundle F2: how many sends were enqueued for a
        // later due time (the agent's configured send delay) rather than sent now.
        scheduled: result.scheduled,
        // 2026-06-26 — L2 Verify (T3): how many sends the verify gate BLOCKED
        // (composed body failed its rubric). The `verify_blocked` reason is in
        // the Brain note; this is the greppable count.
        blocked: result.blocked,
        failed: result.failed,
        // Loop-memory observability: counts + the stable `kind` tags so the line
        // is greppable without dumping message bodies. Absent when no memory
        // store was wired (the summary omits `memory`).
        memory: result.memory
          ? {
              recalled: result.memory.recalled.length,
              recorded: result.memory.recorded.length,
              recordedKinds: result.memory.recorded.map((e) => e.kind),
            }
          : null,
      }),
    );
  } catch {
    // best-effort logging — never break the handler.
  }
}

let listenersRegistered = false;

export function registerCrmEventListeners() {
  if (listenersRegistered) {
    return;
  }

  const bus = getSeldonEventBus();
  const runtimeConfig = getCoreRuntimeConfig();
  configureTelemetry(runtimeConfig.telemetry);

  bus.onAny(async (event) => {
    const maybeContactId = (event.data as Record<string, unknown> | null)?.contactId;

    if (typeof maybeContactId === "string" && maybeContactId) {
      await sendTriggeredEmailsForContactEvent({
        eventType: event.type,
        contactId: maybeContactId,
      });
    }

  });

  bus.on("contact.created", async (event) => {
    console.log(JSON.stringify({ action: "event.contact.created", ...event }));

    await sendWelcomeEmailForContact(event.data.contactId);
    void syncContactToNewsletter({ contactId: event.data.contactId }).catch(() => {
      return;
    });

    trackTelemetryEvent("churn_signal", {
      industry: "unknown",
      days_inactive: 0,
      last_action: "contact_created",
      churned_30d: false,
    });
  });

  bus.on("deal.stage_changed", async (event) => {
    console.log(JSON.stringify({ action: "event.deal.stage_changed", ...event }));

    trackTelemetryEvent("pipeline_stage_used", {
      industry: "unknown",
      stage_name: event.data.to,
      conversion_rate: 0,
    });
  });

  bus.on("form.submitted", async (event) => {
    console.log(JSON.stringify({ action: "event.form.submitted", ...event }));

    trackTelemetryEvent("landing_performance", {
      industry: "unknown",
      section_types: ["form"],
      conversion_rate: 1,
    });

    // WS3.1.4 — fan out to deployed agents listening for form.submitted
    // events. The dispatcher filters by configured `$formId` so only
    // agents wired to THIS form fire. orgId isn't on the typed event
    // payload (bus design), so we resolve it from the form id.
    //
    // 2026-05-18 (later) — switched from fire-and-forget
    // `void .then().catch()` to await. In Vercel serverless, the
    // function returns once this handler returns, and any pending
    // promises die with the worker before they finish. The previous
    // pattern silently produced no auto-reply emails / SMS for
    // intake submissions. Same fix applied to booking.created +
    // booking.cancelled below.
    const formId = event.data.formId;
    const formOrgId = await resolveOrgIdForFormId(formId).catch(() => null);
    if (formOrgId) {
      try {
        await dispatchEventToDeployedAgents({
          orgId: formOrgId,
          triggerEventType: "form.submitted",
          triggerEventId: null,
          triggerPayload: event.data as Record<string, unknown>,
          matcherPlaceholder: "$formId",
          matcherValue: formId,
        });
      } catch (err) {
        console.warn(
          `[listeners] dispatchEventToDeployedAgents form.submitted failed:`,
          err,
        );
      }

      // 2026-05-18 — Slice 7 — outbound messaging dispatch for
      // form.submitted (intake auto-reply email + SMS). Non-fatal.
      try {
        await dispatchOutboundMessagesForEvent({
          orgId: formOrgId,
          eventType: "form.submitted",
          payload: event.data as Record<string, unknown>,
        });
      } catch (err) {
        console.warn(
          `[listeners] dispatchOutboundMessagesForEvent form.submitted failed:`,
          err,
        );
      }

      // 2026-06-04 — Onboarding T12: if this is the workspace's
      // onboarding intake form (slug === "onboarding"), build a
      // ChangePlan from the answers and persist it for agency review.
      // Also flip onboardingLinks.status → "submitted" and notify ops.
      // Non-fatal — a failure here must never break other listeners or
      // the submission response.
      try {
        // Resolve the form slug to decide whether to act.
        const [formRow] = await db
          .select({ slug: intakeForms.slug })
          .from(intakeForms)
          .where(eq(intakeForms.id, formId))
          .limit(1);

        if (formRow?.slug === "onboarding") {
          const eventData = event.data as Record<string, unknown>;

          // Load submission answers. Prefer the payload's `data` field
          // if present (avoids an extra query); otherwise fetch from the
          // intake_submissions table via submissionId.
          let answers: Record<string, unknown> | null = null;

          if (
            eventData.data !== undefined &&
            eventData.data !== null &&
            typeof eventData.data === "object" &&
            !Array.isArray(eventData.data)
          ) {
            answers = eventData.data as Record<string, unknown>;
          } else if (typeof eventData.submissionId === "string" && eventData.submissionId) {
            const [subRow] = await db
              .select({ data: intakeSubmissions.data })
              .from(intakeSubmissions)
              .where(eq(intakeSubmissions.id, eventData.submissionId))
              .limit(1);
            answers = subRow?.data ?? null;
          } else {
            // Fall back: query the most recent submission for this form
            // in this org (best-effort when submissionId isn't on payload).
            const [latestRow] = await db
              .select({ data: intakeSubmissions.data })
              .from(intakeSubmissions)
              .where(eq(intakeSubmissions.formId, formId))
              .limit(1);
            answers = latestRow?.data ?? null;
          }

          if (answers) {
            // Build the structured change plan.
            const plan = buildChangePlan(answers);

            const submissionId =
              typeof eventData.submissionId === "string" ? eventData.submissionId : null;

            // Persist the change plan row.
            await db.insert(changePlans).values({
              orgId: formOrgId,
              ...(submissionId ? { submissionId } : {}),
              plan: plan as unknown as Record<string, unknown>,
              status: "pending_review",
            });

            // Flip the matching onboardingLinks row to "submitted".
            await db
              .update(onboardingLinks)
              .set({ status: "submitted", submittedAt: new Date() })
              .where(eq(onboardingLinks.orgId, formOrgId));

            // Notify ops — reuse the new-signup alert channel (same
            // Resend pipeline, same recipient resolution). We signal
            // an onboarding submission via the source field.
            const businessName =
              typeof answers["business_name"] === "string"
                ? answers["business_name"]
                : formOrgId;
            await sendNewSignupAlert({
              email: typeof answers["email"] === "string" ? answers["email"] : "(no email in answers)",
              userId: formOrgId,
              createdAt: new Date(),
              source: `onboarding_intake:${businessName} — ${plan.summaries.length} change(s): ${plan.summaries.slice(0, 2).join("; ")}`,
            });

            console.log(
              JSON.stringify({
                action: "onboarding.change_plan_persisted",
                orgId: formOrgId,
                submissionId,
                planSummaries: plan.summaries,
              }),
            );
          } else {
            console.warn(
              JSON.stringify({
                action: "onboarding.change_plan_skipped",
                reason: "no_answers_resolved",
                orgId: formOrgId,
                formId,
              }),
            );
          }
        }
      } catch (err) {
        console.warn(
          JSON.stringify({
            action: "onboarding.change_plan_failed",
            orgId: formOrgId,
            formId,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  });

  bus.on("booking.created", async (event) => {
    console.log(JSON.stringify({ action: "event.booking.created", ...event }));

    trackTelemetryEvent("booking_performance", {
      industry: "unknown",
      type: "created",
      no_show_rate: 0,
      conversion_rate: 1,
    });

    // WS3.1.4 — fan out to deployed agents listening for booking.created.
    // Matcher: appointmentTypeId — agents are configured per booking
    // type so a workspace with multiple types can wire different
    // agents to each. orgId resolved from the booking row.
    //
    // 2026-05-18 (later) — AWAITED (was fire-and-forget). In Vercel
    // serverless the handler's return ends the worker, killing any
    // pending dispatch promises. The operator-reported "booked a job,
    // no email" bug was THIS — compose-template / lazy-seed / etc.
    // were all correct, the dispatch just never ran to completion
    // because emitSeldonEvent's Promise.allSettled resolved before
    // the inner .then() chain finished.
    //
    // 2026-05-18 (even later) — payload key mismatch was ALSO blocking
    // dispatch. submitPublicBookingAction emits booking.created with
    // payload {appointmentId, contactId} (per lib/bookings/actions.ts
    // line ~1483). Reading data.bookingId returned undefined, so
    // resolveOrgIdForBookingId('') returned null and the whole if()
    // block silently no-op'd. Read BOTH keys so we cover all emit
    // sites: appointmentId is the public-submit shape; bookingId is
    // the agency/admin create shape.
    const data = event.data as Record<string, unknown>;
    const bookingId =
      (typeof data.bookingId === "string" && data.bookingId) ||
      (typeof data.appointmentId === "string" && data.appointmentId) ||
      "";
    const apptTypeId =
      typeof data.appointmentTypeId === "string" ? data.appointmentTypeId : null;
    const bookingOrgId = await resolveOrgIdForBookingId(bookingId).catch(() => null);
    if (bookingOrgId) {
      // M2 latency fix (2026-07-05) — these three used to run serially
      // (awaited one after another), each doing its own DB reads + an
      // outbound network call (agent dispatch / LLM-composed email /
      // Resend .ics sends). None of them depends on another's OUTPUT:
      //   - dispatchEventToDeployedAgents reads static agentConfigs off
      //     `organizations.settings` and (if matched) sends via its own
      //     seam — it does not read/write outbound_message_sends.
      //   - dispatchOutboundMessagesForEvent reads outbound_message_triggers
      //     + composes/sends its own confirmation email/SMS — independent
      //     of the agent dispatch and of the .ics invite.
      //   - sendBookingCalendarInvite loads the booking/org/owner rows
      //     itself and sends two DEDICATED .ics emails — independent of
      //     both of the above (by design, per its own file header: "leaves
      //     the existing confirmation/SMS path byte-for-byte untouched").
      // All three already catch-and-warn independently (failure isolation
      // was already per-step); running them concurrently via
      // Promise.allSettled preserves that isolation while turning ~3x
      // serial network-bound awaits into 1x wall-clock cost.
      const [agentDispatchResult, outboundDispatchResult, calendarInviteResult] =
        await Promise.allSettled([
          dispatchEventToDeployedAgents({
            orgId: bookingOrgId,
            triggerEventType: "booking.created",
            triggerEventId: null,
            triggerPayload: data,
            matcherPlaceholder: "$appointmentTypeId",
            matcherValue: apptTypeId,
          }),
          dispatchOutboundMessagesForEvent({
            orgId: bookingOrgId,
            eventType: "booking.created",
            payload: data,
          }),
          sendBookingCalendarInvite({
            orgId: bookingOrgId,
            bookingId,
          }),
        ]);

      if (agentDispatchResult.status === "rejected") {
        console.warn(
          `[listeners] dispatchEventToDeployedAgents booking.created failed:`,
          agentDispatchResult.reason,
        );
      }
      if (outboundDispatchResult.status === "rejected") {
        console.warn(
          `[listeners] dispatchOutboundMessagesForEvent booking.created failed:`,
          outboundDispatchResult.reason,
        );
      }
      if (calendarInviteResult.status === "rejected") {
        // Belt-and-suspenders — the function is already soft-fail internally.
        console.warn(
          `[listeners] sendBookingCalendarInvite booking.created failed:`,
          calendarInviteResult.reason,
        );
      }

      // Task 8 — fire-and-forget push into the org's own connected Google/
      // Outlook calendar (Composio, org-level). pushBookingToConnectedCalendar
      // is already fail-soft internally (never throws); this void/.catch is
      // belt-and-suspenders so a bug there can NEVER block or fail this
      // handler. Non-blocking: we do not await it.
      void pushBookingToConnectedCalendar({
        orgId: bookingOrgId,
        bookingId,
      }).catch((err) => {
        console.warn(
          `[listeners] pushBookingToConnectedCalendar booking.created failed:`,
          err,
        );
      });
    }
  });

  bus.on("booking.completed", async (event) => {
    console.log(JSON.stringify({ action: "event.booking.completed", ...event }));

    trackTelemetryEvent("booking_performance", {
      industry: "unknown",
      type: "completed",
      no_show_rate: 0,
      conversion_rate: 1,
    });

    void syncContactToNewsletter({ contactId: event.data.contactId }).catch(() => {
      return;
    });

    // 2026-06-09 — fan out to deployed agents listening for booking.completed
    // (review-requester archetype trigger). No resource matcher: unlike
    // booking.created (filtered by $appointmentTypeId), the review-requester
    // fires on any completed booking for the org — the operator configures one
    // review agent per workspace, not per appointment type.
    // orgId resolved from appointmentId via the bookings table, same pattern
    // as booking.cancelled above.
    const data = event.data as Record<string, unknown>;
    const appointmentId =
      typeof data.appointmentId === "string" ? data.appointmentId : "";
    const completedOrgId = await resolveOrgIdForBookingId(appointmentId).catch(() => null);
    if (completedOrgId) {
      try {
        await dispatchEventToDeployedAgents({
          orgId: completedOrgId,
          triggerEventType: "booking.completed",
          triggerEventId: null,
          triggerPayload: data,
          matcherPlaceholder: null,
          matcherValue: null,
        });
      } catch (err) {
        console.warn(
          `[listeners] dispatchEventToDeployedAgents booking.completed failed:`,
          err,
        );
      }

      // 2026-06-25 — unified agent model P1 (T4): run any EVENT-TRIGGERED
      // agent_templates wired to booking.completed (the review-requester). This
      // is the new Trigger × Skill × Channel path (distinct from the archetype
      // dispatcher above): it composes the pure review ask + sends via the
      // existing outbound seam, throttled one-per-contact. Non-fatal — never
      // throws (it's inside the bus handler).
      try {
        const contactId =
          typeof data.contactId === "string" ? data.contactId : null;
        const eventAgentResult = await runEventAgent(
          {
            type: "booking.completed",
            orgId: completedOrgId,
            contactId,
            payload: data,
          },
          buildRunEventAgentDeps(completedOrgId),
        );
        logEventAgentRun("booking.completed", completedOrgId, contactId, eventAgentResult);
      } catch (err) {
        console.warn(`[listeners] runEventAgent booking.completed failed:`, err);
      }
    }
  });

  // 2026-06-25 — unified agent model P1 (T4): speed-to-lead.
  //
  // `lead.created` is emitted at the lead-capture source (intake form submit /
  // landing lead capture — see lib/forms/actions.ts) right after the existing
  // form.submitted emit. It carries { contactId } and is THE canonical "a new
  // lead arrived" slug the builder's KNOWN_EVENTS picker exposes. Here we run any
  // event-triggered agent wired to it (the speed-to-lead instant acknowledgement)
  // via the same orchestrator + outbound seam as the review-requester above.
  //
  // orgId is NOT on the in-memory bus payload (bus design — emit options carry it
  // for durable logging only), so the emit at the source includes it in the data
  // as `orgId` for this listener. Non-fatal.
  bus.on("lead.created", async (event) => {
    console.log(JSON.stringify({ action: "event.lead.created", ...event }));

    const data = event.data as Record<string, unknown>;
    const orgId = typeof data.orgId === "string" ? data.orgId : "";
    const contactId = typeof data.contactId === "string" ? data.contactId : null;
    if (!orgId) return;

    try {
      const eventAgentResult = await runEventAgent(
        { type: "lead.created", orgId, contactId, payload: data },
        buildRunEventAgentDeps(orgId),
      );
      logEventAgentRun("lead.created", orgId, contactId, eventAgentResult);
    } catch (err) {
      console.warn(`[listeners] runEventAgent lead.created failed:`, err);
    }
  });

  bus.on("booking.cancelled", async (event) => {
    console.log(JSON.stringify({ action: "event.booking.cancelled", ...event }));

    trackTelemetryEvent("booking_performance", {
      industry: "unknown",
      type: "cancelled",
      no_show_rate: 0,
      conversion_rate: 0,
    });

    // 2026-05-18 — Slice 7 — outbound messaging dispatch for
    // booking.cancelled (booking-cancellation email by default).
    // Payload only carries appointmentId + contactId; dispatcher
    // resolves the rest via render-vars from the contact + workspace
    // soul. orgId arrives on the meta of the event.
    //
    // 2026-05-18 (later) — AWAITED (was fire-and-forget). See
    // booking.created above for context — Vercel serverless kills
    // the worker once the handler returns, so void .then() chains
    // never finished running.
    const data = event.data as Record<string, unknown>;
    const appointmentId =
      typeof data.appointmentId === "string" ? data.appointmentId : "";
    const cancelOrgId = await resolveOrgIdForBookingId(appointmentId).catch(() => null);
    if (cancelOrgId) {
      try {
        await dispatchOutboundMessagesForEvent({
          orgId: cancelOrgId,
          eventType: "booking.cancelled",
          payload: data,
        });
      } catch (err) {
        console.warn(
          `[listeners] dispatchOutboundMessagesForEvent booking.cancelled failed:`,
          err,
        );
      }

      // 2026-05-18 — Slice 6: cancel pending scheduled sends targeted
      // at this booking (e.g. the 24h reminder). Without this hook the
      // reminder would still fire post-cancellation.
      const bookingIdForCancel =
        typeof data.bookingId === "string"
          ? data.bookingId
          : typeof data.appointmentId === "string"
            ? data.appointmentId
            : "";
      if (bookingIdForCancel) {
        try {
          await cancelScheduledSendsForBooking(cancelOrgId, bookingIdForCancel);
        } catch (err) {
          console.warn(
            `[listeners] cancelScheduledSendsForBooking failed:`,
            err,
          );
        }
      }
    }
  });

  // 2026-06-09 — Missed-Call-Text-Back archetype trigger.
  //
  // The Twilio voice webhook emits call.missed with
  //   { callSid, contactId, fromNumber, toNumber, status, durationSeconds }
  // orgId is NOT on the typed event data payload (bus design — the
  // SeldonEventBus only carries the typed payload, not the emit options.orgId
  // context used for durable logging). We resolve orgId from toNumber, which
  // is the agency's Twilio number — the same resolution path used by the voice
  // webhook itself (resolveWorkspaceByPhoneNumber). This is an indexed DB
  // query (all org integrations) — acceptable given how infrequently calls
  // arrive vs. the value of firing the text-back.
  //
  // No resource matcher: the missed-call-text-back archetype fires on any
  // missed call for the org. Operators configure one agent per workspace, not
  // per phone number (V1 design; per-number routing is a V1.1 concern).
  bus.on("call.missed", async (event) => {
    console.log(JSON.stringify({ action: "event.call.missed", ...event }));

    const data = event.data as Record<string, unknown>;
    const toNumber = typeof data.toNumber === "string" ? data.toNumber : "";
    const callOrgId = await resolveWorkspaceByPhoneNumber(toNumber).catch(() => null);
    if (callOrgId) {
      try {
        await dispatchEventToDeployedAgents({
          orgId: callOrgId,
          triggerEventType: "call.missed",
          triggerEventId: null,
          triggerPayload: data,
          matcherPlaceholder: null,
          matcherValue: null,
        });
      } catch (err) {
        console.warn(
          `[listeners] dispatchEventToDeployedAgents call.missed failed:`,
          err,
        );
      }
    }
  });

  bus.on("booking.no_show", async (event) => {
    console.log(JSON.stringify({ action: "event.booking.no_show", ...event }));

    trackTelemetryEvent("booking_performance", {
      industry: "unknown",
      type: "no_show",
      no_show_rate: 1,
      conversion_rate: 0,
    });
  });

  bus.on("landing.visited", async (event) => {
    console.log(JSON.stringify({ action: "event.landing.visited", ...event }));

    trackTelemetryEvent("landing_performance", {
      industry: "unknown",
      section_types: ["visit"],
      conversion_rate: 0,
    });
  });

  bus.on("landing.converted", async (event) => {
    console.log(JSON.stringify({ action: "event.landing.converted", ...event }));

    trackTelemetryEvent("landing_performance", {
      industry: "unknown",
      section_types: ["conversion"],
      conversion_rate: 1,
    });
  });

  bus.on("email.sent", async (event) => {
    console.log(JSON.stringify({ action: "event.email.sent", ...event }));

    trackTelemetryEvent("email_performance", {
      industry: "unknown",
      email_type: "sent",
      open_rate: 0,
      click_rate: 0,
    });
  });

  bus.on("email.opened", async (event) => {
    console.log(JSON.stringify({ action: "event.email.opened", ...event }));

    trackTelemetryEvent("email_performance", {
      industry: "unknown",
      email_type: "opened",
      open_rate: 1,
      click_rate: 0,
    });
  });

  bus.on("email.clicked", async (event) => {
    console.log(JSON.stringify({ action: "event.email.clicked", ...event }));

    trackTelemetryEvent("email_performance", {
      industry: "unknown",
      email_type: "clicked",
      open_rate: 1,
      click_rate: 1,
    });
  });

  bus.on("portal.login", async (event) => {
    console.log(JSON.stringify({ action: "event.portal.login", ...event }));

    trackTelemetryEvent("churn_signal", {
      industry: "unknown",
      days_inactive: 0,
      last_action: "portal_login",
      churned_30d: false,
    });
  });

  bus.on("portal.message_sent", async (event) => {
    console.log(JSON.stringify({ action: "event.portal.message_sent", ...event }));

    trackTelemetryEvent("churn_signal", {
      industry: "unknown",
      days_inactive: 0,
      last_action: "portal_message_sent",
      churned_30d: false,
    });
  });

  bus.on("portal.resource_viewed", async (event) => {
    console.log(JSON.stringify({ action: "event.portal.resource_viewed", ...event }));

    trackTelemetryEvent("churn_signal", {
      industry: "unknown",
      days_inactive: 0,
      last_action: "portal_resource_viewed",
      churned_30d: false,
    });
  });

  // 2026-06-23 — Composio inbound-trigger bridge. The Composio webhook
  // (app/api/webhooks/composio/route.ts) verifies the signature, maps the V3
  // payload to a `composio.<toolkit>.<event>` SeldonEvent, and emits it. Here we
  // catch every such event and fan it out to the deployed archetype agents whose
  // specTemplate.trigger.event matches — exactly like the booking.created bridge,
  // but the event types are dynamic (composio.gmail.new_message, …) so we match
  // on the `composio.` prefix via onAny rather than a fixed bus.on.
  //
  // orgId can't ride the in-memory bus's emit-options, so the mapper embeds it in
  // `data._composio.orgId` (see lib/integrations/composio/webhook.ts). The matcher
  // is permissive (null) — composio triggers carry no natural resource-id like an
  // appointmentTypeId, so any deployed agent listening for the event fires.
  bus.onAny(async (event) => {
    if (!event.type.startsWith("composio.")) return;

    const data = (event.data ?? {}) as Record<string, unknown>;
    const composioMeta =
      (data._composio as Record<string, unknown> | undefined) ?? {};
    const orgId =
      typeof composioMeta.orgId === "string" ? composioMeta.orgId : null;
    if (!orgId) {
      console.warn(
        JSON.stringify({ action: "event.composio.no_org", type: event.type }),
      );
      return;
    }

    console.log(
      JSON.stringify({ action: "event.composio.dispatch", type: event.type, orgId }),
    );

    try {
      await dispatchEventToDeployedAgents({
        orgId,
        triggerEventType: event.type,
        triggerEventId: null,
        triggerPayload: data,
        // Permissive match: composio triggers have no resource-id matcher.
        matcherPlaceholder: null,
        matcherValue: null,
      });
    } catch (err) {
      console.warn(
        `[listeners] dispatchEventToDeployedAgents ${event.type} failed:`,
        err,
      );
    }
  });

  listenersRegistered = true;
}
