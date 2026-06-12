// Task C — booking-reschedule email skill.
//
// Mirrors booking-confirmation's approach: re-queries booking + contact +
// org to resolve the contact email, business name, and workspace timezone,
// then sends via sendEmailFromApi (same Resend path confirmation uses).
// Returns early (does not throw) when the contact email is missing.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, contacts, organizations } from "@/db/schema";
import { sendEmailFromApi } from "@/lib/emails/api";
import { buildBookingManageUrl } from "@/lib/bookings/manage-token";

const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

function formatLocal(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export async function sendBookingRescheduleEmail(input: {
  orgId: string;
  bookingId: string;
  oldStartsAt: Date;
  newStartsAt: Date;
}): Promise<void> {
  // Re-query booking + contact + org — same pattern as confirmation.
  const [bookingRow] = await db
    .select({
      id: bookings.id,
      title: bookings.title,
      contactId: bookings.contactId,
    })
    .from(bookings)
    .where(and(eq(bookings.id, input.bookingId), eq(bookings.orgId, input.orgId)))
    .limit(1);

  if (!bookingRow) return;
  if (!bookingRow.contactId) return;

  const [contactRow] = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      firstName: contacts.firstName,
    })
    .from(contacts)
    .where(and(eq(contacts.id, bookingRow.contactId), eq(contacts.orgId, input.orgId)))
    .limit(1);

  // No contact email — return early, do not throw.
  if (!contactRow?.email) return;

  const [orgRow] = await db
    .select({
      name: organizations.name,
      timezone: organizations.timezone,
      slug: organizations.slug,
    })
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);

  const businessName = orgRow?.name || "Your provider";
  const tz = orgRow?.timezone || "UTC";

  const oldLocal = formatLocal(input.oldStartsAt, tz);
  const newLocal = formatLocal(input.newStartsAt, tz);

  // Build the same manage URL the confirmation email uses so the customer
  // can cancel or re-book from the reschedule notice.
  const manageUrl = buildBookingManageUrl(
    `https://${WORKSPACE_BASE_DOMAIN}`,
    input.bookingId,
  );

  const subject = `Your ${businessName} appointment time changed`;
  const greeting = contactRow.firstName
    ? `Hi ${contactRow.firstName},`
    : "Hi there,";

  const body = `${greeting}

Your appointment has been moved.

Previous time: ${oldLocal} (${tz})
New time: ${newLocal} (${tz})

To reschedule or cancel, visit: ${manageUrl}

— The team at ${businessName}`;

  await sendEmailFromApi({
    orgId: input.orgId,
    userId: null,
    contactId: contactRow.id,
    toEmail: contactRow.email,
    subject,
    body,
  });
}
