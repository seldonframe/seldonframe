// v1.22.0 — TRUE self-service reschedule slot picker
//
// Customer lands here from the Reschedule button on /customer/<slug>
// or /customer/<slug>/appointments. We render the next 14 days as
// date tabs; the selected date pulls available slots from the
// existing public-booking slot generator (same source of truth as
// /book). Click a slot → atomic UPDATE of the booking via
// rescheduleBookingAction → redirect back to /appointments.
//
// One source of truth: bookings.startsAt is the field that all
// operator surfaces (contact activity, /bookings, /deals) read
// from. After the update, every operator surface shows the new
// time without any extra wiring.

import { and, eq } from "drizzle-orm";
import { notFound as nextNotFound } from "next/navigation";
import { db } from "@/db";
import { bookings, organizations } from "@/db/schema";
import { listPublicBookingSlotsAction } from "@/lib/bookings/actions";
import { requirePortalSessionForOrg } from "@/lib/portal/auth";
import { pickCustomerCopyPack } from "@/lib/customer-portal/copy-packs";
import { CustomerRescheduleClient } from "@/components/customer-portal/customer-reschedule-client";

export default async function CustomerReschedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; bookingId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { orgSlug, bookingId } = await params;
  const sp = await searchParams;
  const session = await requirePortalSessionForOrg(orgSlug);

  // Resolve the booking + verify ownership.
  const [booking] = await db
    .select({
      id: bookings.id,
      title: bookings.title,
      bookingSlug: bookings.bookingSlug,
      startsAt: bookings.startsAt,
      status: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.orgId, session.orgId),
        eq(bookings.contactId, session.contact.id),
      ),
    )
    .limit(1);
  if (!booking) {
    nextNotFound();
  }

  const [orgRow] = await db
    .select({ soul: organizations.soul })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);
  const soul = (orgRow?.soul ?? {}) as { industry?: string };
  const copy = pickCustomerCopyPack(soul.industry ?? null);

  // Default-selected date: first day with availability, or today.
  const today = new Date();
  const defaultDate = sp.date ?? toDateKey(today);
  const slotResult = await listPublicBookingSlotsAction({
    orgSlug,
    bookingSlug: booking.bookingSlug,
    date: defaultDate,
  });

  // Build the next 14 days of date options.
  const dateOptions = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    return {
      key: toDateKey(date),
      label: date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    };
  });

  return (
    <div className="space-y-5">
      <header>
        <h1
          className="text-[22px] font-semibold tracking-tight"
          style={{ color: "#111" }}
        >
          {copy.rescheduleAction}
        </h1>
        <p className="text-[13px]" style={{ color: "#666" }}>
          {booking.title} ·{" "}
          <span style={{ color: "#888" }}>
            currently{" "}
            {new Date(booking.startsAt).toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </p>
      </header>

      <CustomerRescheduleClient
        orgSlug={orgSlug}
        bookingId={booking.id}
        dateOptions={dateOptions}
        initialDate={defaultDate}
        initialSlots={slotResult.slots}
        copyPackBookAnother={copy.bookAnotherAction}
      />
    </div>
  );
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
