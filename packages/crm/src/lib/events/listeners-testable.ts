// Dependency-injectable version of registerCrmEventListeners for unit tests.
//
// Production code (listeners.ts) imports DB modules and the dispatcher at
// the top of the file, making it impossible to mock with node:test's built-in
// framework (no jest.mock() equivalent). This module exposes a factory that
// accepts all dependencies as arguments so tests can inject stubs without
// touching the DB.
//
// Usage in tests:
//   import { registerListenersWithDeps, type ListenerDeps } from
//     "../../src/lib/events/listeners-testable";
//
// NOT used in production — production code uses listeners.ts directly.

import type { SeldonEventBus } from "@seldonframe/core/events";
import type { AgentDispatchInput, AgentDispatchResult } from "@/lib/agents/dispatcher";

export type ListenerDeps = {
  // DB resolvers
  resolveOrgIdForFormId: (formId: string) => Promise<string | null>;
  resolveOrgIdForBookingId: (bookingId: string) => Promise<string | null>;
  resolveOrgIdForPhoneNumber: (toNumber: string) => Promise<string | null>;

  // Dispatcher
  dispatchEventToDeployedAgents: (input: AgentDispatchInput) => Promise<AgentDispatchResult>;

  // Side effects (stubbed in tests)
  sendTriggeredEmailsForContactEvent: (args: { eventType: string; contactId: string }) => Promise<void>;
  sendWelcomeEmailForContact: (contactId: string) => Promise<void>;
  syncContactToNewsletter: (args: { contactId: string }) => Promise<void>;
  trackTelemetryEvent: (event: string, data: Record<string, unknown>) => void;
  dispatchOutboundMessagesForEvent: (args: {
    orgId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
  cancelScheduledSendsForBooking: (orgId: string, bookingId: string) => Promise<void>;
  buildChangePlan: (answers: Record<string, unknown>) => { summaries: string[] };
  sendNewSignupAlert: (args: {
    email: string;
    userId: string;
    createdAt: Date;
    source: string;
  }) => Promise<void>;
};

/**
 * Registers all CRM event listeners on the provided bus using injectable
 * dependencies. Mirrors the logic of registerCrmEventListeners in listeners.ts
 * exactly — any change to listeners.ts must be reflected here.
 *
 * Returns an unregister function that removes all handlers.
 */
export function registerListenersWithDeps(
  bus: SeldonEventBus,
  deps: ListenerDeps,
): () => void {
  const unsubscribers: (() => void)[] = [];

  const off = (fn: () => void) => unsubscribers.push(fn);

  off(bus.onAny(async (event) => {
    const maybeContactId = (event.data as Record<string, unknown> | null)?.contactId;
    if (typeof maybeContactId === "string" && maybeContactId) {
      await deps.sendTriggeredEmailsForContactEvent({
        eventType: event.type,
        contactId: maybeContactId,
      });
    }
  }));

  off(bus.on("contact.created", async (event) => {
    await deps.sendWelcomeEmailForContact(event.data.contactId);
    void deps.syncContactToNewsletter({ contactId: event.data.contactId }).catch(() => undefined);
    deps.trackTelemetryEvent("churn_signal", {
      industry: "unknown",
      days_inactive: 0,
      last_action: "contact_created",
      churned_30d: false,
    });
  }));

  off(bus.on("deal.stage_changed", async (event) => {
    deps.trackTelemetryEvent("pipeline_stage_used", {
      industry: "unknown",
      stage_name: event.data.to,
      conversion_rate: 0,
    });
  }));

  off(bus.on("form.submitted", async (event) => {
    deps.trackTelemetryEvent("landing_performance", {
      industry: "unknown",
      section_types: ["form"],
      conversion_rate: 1,
    });

    const formId = event.data.formId;
    const formOrgId = await deps.resolveOrgIdForFormId(formId).catch(() => null);
    if (formOrgId) {
      try {
        await deps.dispatchEventToDeployedAgents({
          orgId: formOrgId,
          triggerEventType: "form.submitted",
          triggerEventId: null,
          triggerPayload: event.data as Record<string, unknown>,
          matcherPlaceholder: "$formId",
          matcherValue: formId,
        });
      } catch (err) {
        console.warn(`[listeners-testable] dispatchEventToDeployedAgents form.submitted failed:`, err);
      }

      try {
        await deps.dispatchOutboundMessagesForEvent({
          orgId: formOrgId,
          eventType: "form.submitted",
          payload: event.data as Record<string, unknown>,
        });
      } catch (err) {
        console.warn(`[listeners-testable] dispatchOutboundMessagesForEvent form.submitted failed:`, err);
      }
    }
  }));

  off(bus.on("booking.created", async (event) => {
    deps.trackTelemetryEvent("booking_performance", {
      industry: "unknown",
      type: "created",
      no_show_rate: 0,
      conversion_rate: 1,
    });

    const data = event.data as Record<string, unknown>;
    const bookingId =
      (typeof data.bookingId === "string" && data.bookingId) ||
      (typeof data.appointmentId === "string" && data.appointmentId) ||
      "";
    const apptTypeId =
      typeof data.appointmentTypeId === "string" ? data.appointmentTypeId : null;
    const bookingOrgId = await deps.resolveOrgIdForBookingId(bookingId).catch(() => null);
    if (bookingOrgId) {
      try {
        await deps.dispatchEventToDeployedAgents({
          orgId: bookingOrgId,
          triggerEventType: "booking.created",
          triggerEventId: null,
          triggerPayload: data,
          matcherPlaceholder: "$appointmentTypeId",
          matcherValue: apptTypeId,
        });
      } catch (err) {
        console.warn(`[listeners-testable] dispatchEventToDeployedAgents booking.created failed:`, err);
      }

      try {
        await deps.dispatchOutboundMessagesForEvent({
          orgId: bookingOrgId,
          eventType: "booking.created",
          payload: data,
        });
      } catch (err) {
        console.warn(`[listeners-testable] dispatchOutboundMessagesForEvent booking.created failed:`, err);
      }
    }
  }));

  off(bus.on("booking.completed", async (event) => {
    deps.trackTelemetryEvent("booking_performance", {
      industry: "unknown",
      type: "completed",
      no_show_rate: 0,
      conversion_rate: 1,
    });

    void deps.syncContactToNewsletter({ contactId: event.data.contactId }).catch(() => undefined);

    // 2026-06-09 — wire booking.completed to deployed agents (review-requester
    // archetype trigger). orgId resolved from appointmentId via booking lookup.
    const data = event.data as Record<string, unknown>;
    const appointmentId =
      typeof data.appointmentId === "string" ? data.appointmentId : "";
    const completedOrgId = await deps.resolveOrgIdForBookingId(appointmentId).catch(() => null);
    if (completedOrgId) {
      try {
        await deps.dispatchEventToDeployedAgents({
          orgId: completedOrgId,
          triggerEventType: "booking.completed",
          triggerEventId: null,
          triggerPayload: data,
          matcherPlaceholder: null,
          matcherValue: null,
        });
      } catch (err) {
        console.warn(`[listeners-testable] dispatchEventToDeployedAgents booking.completed failed:`, err);
      }
    }
  }));

  off(bus.on("booking.cancelled", async (event) => {
    deps.trackTelemetryEvent("booking_performance", {
      industry: "unknown",
      type: "cancelled",
      no_show_rate: 0,
      conversion_rate: 0,
    });

    const data = event.data as Record<string, unknown>;
    const appointmentId =
      typeof data.appointmentId === "string" ? data.appointmentId : "";
    const cancelOrgId = await deps.resolveOrgIdForBookingId(appointmentId).catch(() => null);
    if (cancelOrgId) {
      try {
        await deps.dispatchOutboundMessagesForEvent({
          orgId: cancelOrgId,
          eventType: "booking.cancelled",
          payload: data,
        });
      } catch (err) {
        console.warn(`[listeners-testable] dispatchOutboundMessagesForEvent booking.cancelled failed:`, err);
      }

      const bookingIdForCancel =
        typeof data.bookingId === "string"
          ? data.bookingId
          : typeof data.appointmentId === "string"
            ? data.appointmentId
            : "";
      if (bookingIdForCancel) {
        try {
          await deps.cancelScheduledSendsForBooking(cancelOrgId, bookingIdForCancel);
        } catch (err) {
          console.warn(`[listeners-testable] cancelScheduledSendsForBooking failed:`, err);
        }
      }
    }
  }));

  off(bus.on("call.missed", async (event) => {
    // 2026-06-09 — wire call.missed to deployed agents (missed-call-text-back
    // archetype trigger). orgId is NOT on the typed event data payload (bus
    // design — see listeners.ts comment). We resolve it from the toNumber
    // field, which is the agency's Twilio number — the same resolution path
    // used by the voice webhook itself (resolveWorkspaceByPhoneNumber).
    // No resource matcher needed: missed-call archetypes are not filtered by
    // a sub-resource (unlike booking.created → $appointmentTypeId or
    // form.submitted → $formId). Any deployed missed-call-text-back agent
    // for the org fires on any missed call.
    const data = event.data as Record<string, unknown>;
    const toNumber = typeof data.toNumber === "string" ? data.toNumber : "";
    const callOrgId = await deps.resolveOrgIdForPhoneNumber(toNumber).catch(() => null);
    if (callOrgId) {
      try {
        await deps.dispatchEventToDeployedAgents({
          orgId: callOrgId,
          triggerEventType: "call.missed",
          triggerEventId: null,
          triggerPayload: data,
          matcherPlaceholder: null,
          matcherValue: null,
        });
      } catch (err) {
        console.warn(`[listeners-testable] dispatchEventToDeployedAgents call.missed failed:`, err);
      }
    }
  }));

  return () => {
    for (const unsub of unsubscribers) unsub();
  };
}
