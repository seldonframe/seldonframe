// logServiceStubOnBookingComplete — subscription handler scaffolded 2026-04-23.
//
// Intent: When a booking completes, log a stub service event tied to the contact's default vehicle so the tech can fill in details afterward.
//
// TODO (scaffold-default): implement the handler body. The runtime
// (lib/subscriptions/dispatcher.ts cron sweep) invokes this with:
//   - event: SubscriptionEvent — { type, data, orgId, eventLogId, emittedAt }
//   - ctx:   SubscriptionHandlerContext — { orgId, log }
// Return void or Promise<void>. Throw to trigger retry (audit §4.7).

import type { SubscriptionEvent, SubscriptionHandler, SubscriptionHandlerContext } from "@/lib/subscriptions/dispatcher";
import { registerSubscriptionHandler } from "@/lib/subscriptions/handler-registry";

export const logServiceStubOnBookingComplete: SubscriptionHandler = async (
  event: SubscriptionEvent,
  ctx: SubscriptionHandlerContext,
): Promise<void> => {
  // TODO (scaffold-default): implement
  ctx.log("logServiceStubOnBookingComplete invoked", { eventLogId: event.eventLogId, eventType: event.type });
};

registerSubscriptionHandler("logServiceStubOnBookingComplete", logServiceStubOnBookingComplete);
