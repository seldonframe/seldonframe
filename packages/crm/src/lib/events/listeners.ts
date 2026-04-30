import { eq } from "drizzle-orm";
import { getSeldonEventBus } from "@seldonframe/core/events";
import { getCoreRuntimeConfig } from "@seldonframe/core/config";
import { configureTelemetry, trackTelemetryEvent } from "@seldonframe/core/telemetry";
import { db } from "@/db";
import { bookings, intakeForms } from "@/db/schema";
import { dispatchEventToDeployedAgents } from "@/lib/agents/dispatcher";
import { sendTriggeredEmailsForContactEvent, sendWelcomeEmailForContact } from "@/lib/emails/actions";
import { syncContactToNewsletter } from "@/lib/integrations/newsletter-sync";

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
    const formId = event.data.formId;
    void resolveOrgIdForFormId(formId)
      .then((orgId) => {
        if (!orgId) return;
        return dispatchEventToDeployedAgents({
          orgId,
          triggerEventType: "form.submitted",
          triggerEventId: null,
          triggerPayload: event.data as Record<string, unknown>,
          matcherPlaceholder: "$formId",
          matcherValue: formId,
        });
      })
      .catch((err) =>
        console.warn(
          `[listeners] dispatchEventToDeployedAgents form.submitted failed:`,
          err
        )
      );
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
    const data = event.data as Record<string, unknown>;
    const bookingId = typeof data.bookingId === "string" ? data.bookingId : "";
    const apptTypeId =
      typeof data.appointmentTypeId === "string" ? data.appointmentTypeId : null;
    void resolveOrgIdForBookingId(bookingId)
      .then((orgId) => {
        if (!orgId) return;
        return dispatchEventToDeployedAgents({
          orgId,
          triggerEventType: "booking.created",
          triggerEventId: null,
          triggerPayload: data,
          matcherPlaceholder: "$appointmentTypeId",
          matcherValue: apptTypeId,
        });
      })
      .catch((err) =>
        console.warn(
          `[listeners] dispatchEventToDeployedAgents booking.created failed:`,
          err
        )
      );
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
  });

  bus.on("booking.cancelled", async (event) => {
    console.log(JSON.stringify({ action: "event.booking.cancelled", ...event }));

    trackTelemetryEvent("booking_performance", {
      industry: "unknown",
      type: "cancelled",
      no_show_rate: 0,
      conversion_rate: 0,
    });
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

  listenersRegistered = true;
}
