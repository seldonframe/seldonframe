// v1.21.0 — customer-portal overview (rebuilt from first principles)
//
// Pre-1.21 this was a stat grid (Messages / Resources / Viewed
// Resources counts) that meant nothing to the homeowner / patient /
// client. v1.21 rewrites for what end customers actually need:
//
//   1. NEXT APPOINTMENT hero — date, time, who's coming, with
//      Reschedule / Cancel / Get Directions actions
//   2. QUICK CONTACT — tap-to-call + tap-to-email on the business
//      (mobile-first; this is overwhelmingly a phone surface)
//   3. RECENT ACTIVITY — 2-3 most recent items, NOT a stat counter
//   4. INDUSTRY-AWARE COPY via copy-pack — HVAC says "service visit",
//      dental says "appointment", coach says "session" etc.
//
// Pipeline / Resources / Account-stats are dropped from the overview.
// Past appointments live on /appointments. Documents on /documents.
// Messages on /messages. Profile on /account.

import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { landingPages, organizations } from "@/db/schema";
import { listPortalBookings } from "@/lib/portal/actions";
import { requirePortalSessionForOrg } from "@/lib/portal/auth";
import { pickCustomerCopyPack } from "@/lib/customer-portal/copy-packs";

type Booking = Awaited<ReturnType<typeof listPortalBookings>>["upcoming"][number];

export default async function CustomerPortalOverview({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requirePortalSessionForOrg(orgSlug);

  // Parallel data load. Bookings are scoped to session.contact.id by
  // listPortalBookings; we also need the org's soul (industry copy
  // pack) and the workspace blueprint (tap-to-call phone).
  const [bookingsResult, orgRow, blueprintRow] = await Promise.all([
    listPortalBookings(orgSlug),
    db
      .select({
        id: organizations.id,
        name: organizations.name,
        soul: organizations.soul,
      })
      .from(organizations)
      .where(eq(organizations.id, session.orgId))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select({ blueprint: landingPages.blueprintJson })
      .from(landingPages)
      .where(eq(landingPages.orgId, session.orgId))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  const soul = (orgRow?.soul ?? {}) as { industry?: string };
  const copy = pickCustomerCopyPack(soul.industry ?? null);
  const orgName = orgRow?.name ?? "Your business";

  const blueprint = (blueprintRow?.blueprint ?? null) as
    | { workspace?: { contact?: { phone?: string; email?: string } } }
    | null;
  const businessPhone = blueprint?.workspace?.contact?.phone ?? null;
  const businessEmail = blueprint?.workspace?.contact?.email ?? null;

  const next = bookingsResult.upcoming[0] ?? null;
  const recentPast = bookingsResult.past.slice(0, 3);
  const customerName =
    `${session.contact.firstName ?? ""} ${session.contact.lastName ?? ""}`.trim() ||
    session.contact.email ||
    "there";

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p
          className="text-[12px] uppercase tracking-wide"
          style={{ color: "#888" }}
        >
          {copy.welcomeHeading}
        </p>
        <h1
          className="text-[24px] sm:text-[28px] font-semibold tracking-tight"
          style={{ color: "#111" }}
        >
          Hi, {customerName}
        </h1>
        <p className="text-[14px]" style={{ color: "#666" }}>
          {copy.welcomeSubtext}
        </p>
      </header>

      {next ? (
        <NextAppointmentHero
          booking={next}
          orgSlug={orgSlug}
          copyPack={copy}
        />
      ) : (
        <NextAppointmentEmpty orgSlug={orgSlug} copyPack={copy} />
      )}

      <QuickContactCard
        orgName={orgName}
        phone={businessPhone}
        email={businessEmail}
      />

      {recentPast.length > 0 ? (
        <RecentActivitySection
          rows={recentPast}
          orgSlug={orgSlug}
          copyPackPastHeading={copy.pastHeading}
        />
      ) : null}
    </div>
  );
}

// ─── components ──────────────────────────────────────────────────────────

function NextAppointmentHero({
  booking,
  orgSlug,
  copyPack,
}: {
  booking: Booking;
  orgSlug: string;
  copyPack: ReturnType<typeof pickCustomerCopyPack>;
}) {
  const startsAt = new Date(booking.startsAt);
  const dateLine = startsAt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeLine = startsAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const isCancellable =
    booking.status === "scheduled" || booking.status === "confirmed";
  return (
    <article
      data-customer-next-appointment-hero=""
      className="px-6 py-6 sm:px-8 sm:py-7"
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid #E5E5E1",
        borderRadius: "14px",
      }}
    >
      <p
        className="text-[11px] uppercase tracking-wide"
        style={{ color: "#888" }}
      >
        {copyPack.nextHeading}
      </p>
      <h2
        className="mt-2 text-[22px] sm:text-[26px] font-semibold tracking-tight"
        style={{ color: "#111" }}
      >
        {booking.title}
      </h2>
      <p
        className="mt-3 text-[15px]"
        style={{ color: "#444" }}
      >
        {dateLine} <span style={{ color: "#999" }}>·</span> {timeLine}
      </p>
      {booking.notes ? (
        <p
          className="mt-3 text-[14px] whitespace-pre-line"
          style={{ color: "#666" }}
        >
          {booking.notes}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link
          href={`/customer/${orgSlug}/appointments`}
          className="inline-flex h-9 items-center px-4 text-[13px] font-semibold"
          style={{
            backgroundColor: "#111",
            color: "#FFFFFF",
            borderRadius: "8px",
            border: "1px solid #111",
          }}
        >
          View details
        </Link>
        {isCancellable ? (
          <Link
            href={`/customer/${orgSlug}/appointments?reschedule=${booking.id}`}
            className="inline-flex h-9 items-center px-4 text-[13px] font-medium"
            style={{
              backgroundColor: "#FFFFFF",
              color: "#111",
              borderRadius: "8px",
              border: "1px solid #E5E5E1",
            }}
          >
            {copyPack.rescheduleAction}
          </Link>
        ) : null}
        {isCancellable ? (
          <Link
            href={`/customer/${orgSlug}/appointments?cancel=${booking.id}`}
            className="inline-flex h-9 items-center px-4 text-[13px] font-medium"
            style={{
              backgroundColor: "#FFFFFF",
              color: "#666",
              borderRadius: "8px",
              border: "1px solid #E5E5E1",
            }}
          >
            {copyPack.cancelAction}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function NextAppointmentEmpty({
  orgSlug,
  copyPack,
}: {
  orgSlug: string;
  copyPack: ReturnType<typeof pickCustomerCopyPack>;
}) {
  return (
    <article
      className="px-6 py-7 sm:px-8 text-center"
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px dashed #E5E5E1",
        borderRadius: "14px",
      }}
    >
      <p
        className="text-[11px] uppercase tracking-wide"
        style={{ color: "#888" }}
      >
        {copyPack.nextHeading}
      </p>
      <p
        className="mt-2 text-[15px]"
        style={{ color: "#666" }}
      >
        {copyPack.noUpcomingMessage}
      </p>
      <Link
        href={`/book/${orgSlug}`}
        className="mt-4 inline-flex h-9 items-center px-4 text-[13px] font-semibold"
        style={{
          backgroundColor: "#111",
          color: "#FFFFFF",
          borderRadius: "8px",
          border: "1px solid #111",
        }}
      >
        {copyPack.bookAnotherAction}
      </Link>
    </article>
  );
}

function QuickContactCard({
  orgName,
  phone,
  email,
}: {
  orgName: string;
  phone: string | null;
  email: string | null;
}) {
  if (!phone && !email) return null;
  return (
    <article
      data-customer-quick-contact=""
      className="px-5 py-4 sm:px-6 sm:py-5"
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid #E5E5E1",
        borderRadius: "12px",
      }}
    >
      <h3
        className="text-[13px] font-semibold tracking-tight"
        style={{ color: "#111" }}
      >
        Reach {orgName}
      </h3>
      <p className="text-[12px]" style={{ color: "#888" }}>
        Tap to call or email — straight from here.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="inline-flex h-10 items-center gap-2 px-4 text-[13px] font-semibold"
            style={{
              backgroundColor: "#111",
              color: "#FFFFFF",
              borderRadius: "8px",
              border: "1px solid #111",
            }}
          >
            <span aria-hidden>{"☎"}</span>
            <span>Call {phone}</span>
          </a>
        ) : null}
        {email ? (
          <a
            href={`mailto:${email}`}
            className="inline-flex h-10 items-center gap-2 px-4 text-[13px] font-medium"
            style={{
              backgroundColor: "#FFFFFF",
              color: "#111",
              borderRadius: "8px",
              border: "1px solid #E5E5E1",
            }}
          >
            <span aria-hidden>{"✉"}</span>
            <span>Email us</span>
          </a>
        ) : null}
      </div>
    </article>
  );
}

function RecentActivitySection({
  rows,
  orgSlug,
  copyPackPastHeading,
}: {
  rows: Booking[];
  orgSlug: string;
  copyPackPastHeading: string;
}) {
  return (
    <section
      className="px-5 py-4 sm:px-6 sm:py-5"
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid #E5E5E1",
        borderRadius: "12px",
      }}
    >
      <header className="flex items-center justify-between pb-3 mb-3"
        style={{ borderBottom: "1px solid #F0F0EC" }}>
        <h3
          className="text-[13px] font-semibold tracking-tight"
          style={{ color: "#111" }}
        >
          {copyPackPastHeading}
        </h3>
        <Link
          href={`/customer/${orgSlug}/appointments`}
          className="text-[12px] underline"
          style={{ color: "#666" }}
        >
          View all
        </Link>
      </header>
      <ul className="space-y-1.5">
        {rows.map((row) => {
          const startsAt = new Date(row.startsAt);
          return (
            <li
              key={row.id}
              className="flex items-center justify-between px-2 py-2 text-[13px]"
              style={{ borderRadius: "6px" }}
            >
              <span style={{ color: "#111" }}>{row.title}</span>
              <span className="text-[12px]" style={{ color: "#888" }}>
                {startsAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
