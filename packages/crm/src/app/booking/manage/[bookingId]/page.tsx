// 2026-05-18 — Public customer-managed booking page.
//
// Customers land here from a signed URL in their confirmation email
// or SMS: /booking/manage/<bookingId>?token=<signed>. No auth needed —
// the token IS the credential. They can view their booking details
// + cancel + jump to picking a new time.
//
// Security: the token is verified server-side via verifyBookingManageToken
// (HMAC of the bookingId with the platform secret). Invalid / expired /
// tampered tokens render a generic "link is no longer valid" message
// rather than leaking whether the booking exists.

import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { bookings, organizations } from "@/db/schema";
import { verifyBookingManageToken } from "@/lib/bookings/manage-token";
import { getPublicOrgThemeById } from "@/lib/theme/actions";
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";
import { PublicThemeProvider } from "@/components/theme/public-theme-provider";
import { BookingManageView } from "@/components/bookings/booking-manage-view";

export default async function BookingManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ token?: string; cancelled?: string }>;
}) {
  const { bookingId } = await params;
  const { token, cancelled } = await searchParams;

  if (!token || !verifyBookingManageToken(bookingId, token)) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Link no longer valid</h1>
          <p className="text-sm text-slate-600">
            This booking management link has expired or is incorrect. If you need to change
            your appointment, please contact the business directly.
          </p>
        </div>
      </main>
    );
  }

  const [row] = await db
    .select({
      id: bookings.id,
      orgId: bookings.orgId,
      title: bookings.title,
      bookingSlug: bookings.bookingSlug,
      fullName: bookings.fullName,
      email: bookings.email,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      status: bookings.status,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!row) {
    notFound();
  }

  const [orgRow] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      timezone: organizations.timezone,
      soul: organizations.soul,
    })
    .from(organizations)
    .where(eq(organizations.id, row.orgId))
    .limit(1);

  if (!orgRow) {
    notFound();
  }

  const theme = await getPublicOrgThemeById(orgRow.id);
  const effective = await getEffectiveBrandingForWorkspace(orgRow.id).catch(() => null);
  const headerLogoUrl =
    (effective?.is_white_label && effective.logo_url) || theme.logoUrl || null;
  const headerName = effective?.is_white_label
    ? effective.brand_name
    : orgRow.name;

  // Soul phone for the "questions? call us" line.
  const soul = (orgRow.soul ?? {}) as Record<string, unknown>;
  const business = (soul.business && typeof soul.business === "object" ? soul.business : null) as Record<string, unknown> | null;
  const contact = (soul.contact && typeof soul.contact === "object" ? soul.contact : null) as Record<string, unknown> | null;
  const pickStr = (...candidates: unknown[]): string | null => {
    for (const c of candidates) if (typeof c === "string" && c.trim()) return c.trim();
    return null;
  };
  const businessPhone = pickStr(soul.phone, business?.phone, contact?.phone);

  // Force light mode on customer-facing surfaces (Cal.com / Calendly
  // convention).
  const publicTheme = { ...theme, mode: "light" as const };

  return (
    <PublicThemeProvider theme={publicTheme}>
      <main className="light min-h-screen flex flex-col items-center justify-center px-4 py-12" style={{ backgroundColor: "#f8fafc" }}>
        <BookingManageView
          bookingId={row.id}
          token={token}
          title={row.title}
          fullName={row.fullName}
          email={row.email}
          startsAtIso={row.startsAt.toISOString()}
          endsAtIso={row.endsAt.toISOString()}
          status={row.status}
          workspaceTimezone={orgRow.timezone || "UTC"}
          orgSlug={orgRow.slug}
          bookingSlug={row.bookingSlug}
          headerLogoUrl={headerLogoUrl}
          headerName={headerName}
          businessPhone={businessPhone}
          recentlyCancelled={cancelled === "1"}
        />
      </main>
    </PublicThemeProvider>
  );
}
