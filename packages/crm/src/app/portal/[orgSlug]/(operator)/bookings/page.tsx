// v1.22.0 — operator portal /bookings mirror
//
// Upcoming + past bookings scoped to the operator's workspace.
// Twenty-CRM-style — light mode, status pills, contact links.
// v1.23 will add inline status changes + reschedule from the
// operator side.

import Link from "next/link";
import { and, asc, desc, eq, gte, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { bookings, contacts } from "@/db/schema";
import { requireOperatorSessionForOrg } from "@/lib/operator-portal/auth";

const STATUS_PILLS: Record<string, { bg: string; text: string }> = {
  scheduled: { bg: "#DCFCE7", text: "#166534" },
  confirmed: { bg: "#DCFCE7", text: "#166534" },
  completed: { bg: "#E0E7FF", text: "#3730A3" },
  cancelled: { bg: "#FEE2E2", text: "#991B1B" },
  no_show: { bg: "#FEF3C7", text: "#78350F" },
};

export default async function OperatorPortalBookingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requireOperatorSessionForOrg(orgSlug);

  const now = new Date();

  const [upcoming, past] = await Promise.all([
    db
      .select({
        id: bookings.id,
        title: bookings.title,
        startsAt: bookings.startsAt,
        status: bookings.status,
        notes: bookings.notes,
        contactId: bookings.contactId,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactEmail: contacts.email,
      })
      .from(bookings)
      .leftJoin(contacts, eq(bookings.contactId, contacts.id))
      .where(
        and(
          eq(bookings.orgId, session.orgId),
          ne(bookings.status, "template"),
          gte(bookings.startsAt, now),
        ),
      )
      .orderBy(asc(bookings.startsAt))
      .limit(100),
    db
      .select({
        id: bookings.id,
        title: bookings.title,
        startsAt: bookings.startsAt,
        status: bookings.status,
        notes: bookings.notes,
        contactId: bookings.contactId,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactEmail: contacts.email,
      })
      .from(bookings)
      .leftJoin(contacts, eq(bookings.contactId, contacts.id))
      .where(
        and(
          eq(bookings.orgId, session.orgId),
          ne(bookings.status, "template"),
          lt(bookings.startsAt, now),
        ),
      )
      .orderBy(desc(bookings.startsAt))
      .limit(100),
  ]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className="text-[20px] font-semibold tracking-tight"
            style={{ color: "#111" }}
          >
            Bookings
          </h1>
          <p className="text-[13px]" style={{ color: "#666" }}>
            {upcoming.length} upcoming · {past.length} past
          </p>
        </div>
      </header>

      <BookingsSection
        title="Upcoming"
        rows={upcoming}
        orgSlug={orgSlug}
        emptyMessage="No upcoming bookings."
      />
      <BookingsSection
        title="Past"
        rows={past}
        orgSlug={orgSlug}
        emptyMessage="No past bookings yet."
      />
    </div>
  );
}

type BookingRow = {
  id: string;
  title: string;
  startsAt: Date;
  status: string;
  notes: string | null;
  contactId: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
};

function BookingsSection({
  title,
  rows,
  orgSlug,
  emptyMessage,
}: {
  title: string;
  rows: BookingRow[];
  orgSlug: string;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return (
      <article
        className="px-5 py-4 sm:px-6 sm:py-5"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E5E1",
          borderRadius: "12px",
        }}
      >
        <h2
          className="text-[13px] font-semibold tracking-tight pb-3 mb-3"
          style={{ color: "#111", borderBottom: "1px solid #F0F0EC" }}
        >
          {title}
        </h2>
        <p className="text-[13px]" style={{ color: "#888" }}>
          {emptyMessage}
        </p>
      </article>
    );
  }

  return (
    <article
      className="overflow-hidden"
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid #E5E5E1",
        borderRadius: "12px",
      }}
    >
      <h2
        className="text-[13px] font-semibold tracking-tight px-4 py-3"
        style={{ color: "#111", borderBottom: "1px solid #F0F0EC" }}
      >
        {title}
      </h2>
      <ul>
        {rows.map((row, idx) => {
          const date = new Date(row.startsAt);
          const fullName =
            `${row.contactFirstName ?? ""} ${row.contactLastName ?? ""}`.trim() ||
            row.contactEmail ||
            "Unknown contact";
          const pill = STATUS_PILLS[row.status] ?? {
            bg: "#F3F4F6",
            text: "#4B5563",
          };
          return (
            <li
              key={row.id}
              className="flex items-center gap-3 px-4 py-3 text-[13px]"
              style={{
                borderTop: idx === 0 ? "none" : "1px solid #F0F0EC",
              }}
            >
              <div className="w-24 shrink-0">
                <p className="font-medium" style={{ color: "#111" }}>
                  {date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <p className="text-[11px]" style={{ color: "#888" }}>
                  {date.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate" style={{ color: "#111" }}>
                  {row.title}
                </p>
                {row.contactId ? (
                  <Link
                    href={`/portal/${orgSlug}/contacts/${row.contactId}`}
                    className="text-[11px] hover:underline truncate block"
                    style={{ color: "#666" }}
                  >
                    {fullName}
                  </Link>
                ) : (
                  <p
                    className="text-[11px] truncate"
                    style={{ color: "#888" }}
                  >
                    {fullName}
                  </p>
                )}
              </div>
              <span
                className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
                style={{
                  backgroundColor: pill.bg,
                  color: pill.text,
                  borderRadius: "9999px",
                }}
              >
                {row.status.replace("_", " ")}
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
