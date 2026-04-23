// First real subscription adopter — CRM logs a system activity on
// the contact whenever a booking.created event fires.
//
// Shipped in SLICE 1 PR 2 C6+C7 (merged adopter + integration) per
// audit §3.3 canonical example. Demonstrates the subscription
// primitive end-to-end:
//   - CRM BLOCK.md declares the subscription
//   - install-time reconciler creates a registry row (C4)
//   - emitSeldonEvent("booking.created", ...) enqueues a delivery (C2)
//   - cron tick claims + invokes THIS handler (C3)
//   - activity row lands on the contact timeline
//
// Coexistence note: the existing Cal.diy booking flow
// (lib/bookings/actions.ts) already writes a "meeting" activity
// inline when a booking is created. THIS subscription writes a
// separate "booking_created" system activity that records the event
// itself (not the meeting). Cleaning up the inline write is a
// follow-up once all blocks adopt subscriptions — premature to rip
// it out in PR 2.
//
// Userid handling: activities.user_id is NOT NULL (FK to users).
// System-triggered handlers have no user context, so we attribute
// the activity to the first user in the workspace — same pattern
// as the inline booking write. If no user exists, the handler
// logs a warning and returns without writing.

import { eq } from "drizzle-orm";
import { db as productionDb, type DbClient } from "@/db";
import { activities, users } from "@/db/schema";
import type { SubscriptionEvent, SubscriptionHandler, SubscriptionHandlerContext } from "@/lib/subscriptions/dispatcher";
import { registerSubscriptionHandler } from "@/lib/subscriptions/handler-registry";

type BookingCreatedData = { appointmentId: string; contactId: string };

/**
 * Factory that produces the handler bound to a DbClient — lets the
 * integration test inject an in-memory fake without touching the
 * production wiring. The default export binds to the real db.
 */
export function makeLogActivityOnBookingCreate(db: DbClient): SubscriptionHandler {
  return async (event: SubscriptionEvent, ctx: SubscriptionHandlerContext): Promise<void> => {
    if (event.type !== "booking.created") {
      // Defensive: handler only invoked for booking.created by the
      // dispatcher; this branch is for the makeHandler direct caller.
      return;
    }
    const data = event.data as Partial<BookingCreatedData>;
    if (!data.contactId || !data.appointmentId) {
      ctx.log("skipping — missing contactId or appointmentId", { data });
      return;
    }

    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.orgId, event.orgId))
      .limit(1);

    if (!owner?.id) {
      ctx.log("skipping — no user found in workspace to attribute the activity", {
        orgId: event.orgId,
      });
      return;
    }

    await db.insert(activities).values({
      orgId: event.orgId,
      userId: owner.id,
      contactId: data.contactId,
      type: "booking_created",
      subject: "Booking created (via subscription)",
      body: null,
      metadata: {
        appointmentId: data.appointmentId,
        source: "subscription:logActivityOnBookingCreate",
        eventLogId: event.eventLogId,
      },
    });
  };
}

// Production binding + side-effect registration with the dispatcher.
// Imported by lib/subscriptions/register-all-handlers.ts so the cron
// route boot populates the global handler map.
const productionHandler = makeLogActivityOnBookingCreate(productionDb);
registerSubscriptionHandler("logActivityOnBookingCreate", productionHandler);

export { productionHandler as logActivityOnBookingCreate };
