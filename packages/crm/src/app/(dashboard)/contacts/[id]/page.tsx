import { and, desc, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Mail, Phone } from "lucide-react";
import { db } from "@/db";
import { activities, bookings, contacts, deals, organizations, portalDocuments } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getLabels } from "@/lib/soul/labels";
import { getContactRevenue } from "@/lib/payments/actions";
import { checkPortalPlanGate } from "@/lib/portal/plan-gate";
import {
  ContactRecordDetail,
  type ActivityRow,
  type BookingRow,
  type DealRow,
  type ContactDetail,
} from "@/components/contacts/contact-record-detail";
import type { DocumentRow } from "@/components/contacts/contact-documents-tab";

/**
 * /contacts/[id] — full Twenty-style record detail page.
 *
 * Replaces the previous narrow "contact profile + activity timeline"
 * card layout with a proper record-page experience: large header
 * (avatar + name + stage badge + quick actions), tab bar (Overview /
 * Activity / Deals / Emails / Bookings / Notes), Overview default.
 *
 * Data is server-loaded in one parallel batch and passed through to
 * the client component which owns the tab state, inline-edit
 * interactions, and the slide-out → full-page handoff parity.
 *
 * Tab scope shipped this turn: Overview + Activity (the 80% of
 * operator time per the WS2.1 spec). Deals / Emails / Bookings /
 * Notes tabs render their data but the richer editor surfaces
 * (compose email, +link deal, note editor) ship in the next turn —
 * the data fetches are wired here so adding the editor surfaces is
 * pure client-side work.
 */

type SearchParams = Promise<{ tab?: string }>;

export default async function ContactRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <section className="animate-page-enter space-y-3 p-4 sm:p-6">
        <h1 className="text-lg font-semibold">Client</h1>
        <p className="text-sm text-muted-foreground">No active workspace.</p>
      </section>
    );
  }

  const labels = await getLabels();

  // May 1, 2026 — Client Portal V1: pull the org slug + plan-gate
  // result alongside the contact so the OverviewTab aside can render
  // the Portal Access card without a second client-side fetch.
  const [contact, activityRows, dealRows, bookingRows, documentRows, revenue, orgRow, portalGate] =
    await Promise.all([
    db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.id, id)))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select({
        id: activities.id,
        type: activities.type,
        subject: activities.subject,
        body: activities.body,
        metadata: activities.metadata,
        scheduledAt: activities.scheduledAt,
        completedAt: activities.completedAt,
        createdAt: activities.createdAt,
      })
      .from(activities)
      .where(and(eq(activities.orgId, orgId), eq(activities.contactId, id)))
      .orderBy(desc(activities.createdAt))
      .limit(200),
    db
      .select({
        id: deals.id,
        title: deals.title,
        stage: deals.stage,
        value: deals.value,
        probability: deals.probability,
        createdAt: deals.createdAt,
        updatedAt: deals.updatedAt,
      })
      .from(deals)
      .where(and(eq(deals.orgId, orgId), eq(deals.contactId, id)))
      .orderBy(desc(deals.createdAt)),
    db
      .select({
        id: bookings.id,
        title: bookings.title,
        bookingSlug: bookings.bookingSlug,
        status: bookings.status,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        meetingUrl: bookings.meetingUrl,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.orgId, orgId),
          eq(bookings.contactId, id),
          ne(bookings.status, "template")
        )
      )
      .orderBy(desc(bookings.startsAt)),
    db
      .select({
        id: portalDocuments.id,
        fileName: portalDocuments.fileName,
        fileSize: portalDocuments.fileSize,
        mimeType: portalDocuments.mimeType,
        blobUrl: portalDocuments.blobUrl,
        downloadCount: portalDocuments.downloadCount,
        viewedAt: portalDocuments.viewedAt,
        createdAt: portalDocuments.createdAt,
      })
      .from(portalDocuments)
      .where(and(eq(portalDocuments.orgId, orgId), eq(portalDocuments.contactId, id)))
      .orderBy(desc(portalDocuments.createdAt)),
    getContactRevenue(id).catch(() => 0),
    db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)
      .then((r) => r[0] ?? null),
    checkPortalPlanGate(orgId).catch(() => ({
      allowed: false,
      tier: "free",
      reason: "plan_check_failed",
    })),
  ]);

  if (!contact) notFound();

  const portalLastLogin = (contact as { portalLastLoginAt?: Date | string | null })
    .portalLastLoginAt;

  const detail: ContactDetail = {
    id: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName ?? null,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
    company: (contact as { company?: string | null }).company ?? null,
    title: (contact as { title?: string | null }).title ?? null,
    status: contact.status,
    source: contact.source ?? null,
    score: contact.score ?? 0,
    revenue: Number(revenue ?? 0),
    createdAt:
      contact.createdAt instanceof Date
        ? contact.createdAt.toISOString()
        : String(contact.createdAt),
    updatedAt:
      contact.updatedAt instanceof Date
        ? contact.updatedAt.toISOString()
        : String(contact.updatedAt),
    portalAccessEnabled:
      (contact as { portalAccessEnabled?: boolean }).portalAccessEnabled ?? false,
    portalLastLoginAt:
      portalLastLogin instanceof Date
        ? portalLastLogin.toISOString()
        : portalLastLogin
          ? String(portalLastLogin)
          : null,
  };

  const activityRowsForClient: ActivityRow[] = activityRows.map((a) => ({
    id: a.id,
    type: a.type,
    subject: a.subject,
    body: a.body,
    metadata: (a.metadata as Record<string, unknown> | null) ?? null,
    scheduledAt: a.scheduledAt instanceof Date ? a.scheduledAt.toISOString() : null,
    completedAt: a.completedAt instanceof Date ? a.completedAt.toISOString() : null,
    createdAt:
      a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
  }));

  const dealRowsForClient: DealRow[] = dealRows.map((d) => ({
    id: d.id,
    title: d.title,
    stage: d.stage,
    value: String(d.value),
    probability: d.probability,
    createdAt:
      d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    updatedAt:
      d.updatedAt instanceof Date ? d.updatedAt.toISOString() : String(d.updatedAt),
  }));

  const documentRowsForClient: DocumentRow[] = documentRows.map((d) => ({
    id: d.id,
    fileName: d.fileName,
    fileSize: Number(d.fileSize),
    mimeType: d.mimeType,
    blobUrl: d.blobUrl,
    downloadCount: d.downloadCount,
    viewedAt:
      d.viewedAt instanceof Date ? d.viewedAt.toISOString() : null,
    createdAt:
      d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
  }));

  const bookingRowsForClient: BookingRow[] = bookingRows.map((b) => ({
    id: b.id,
    title: b.title,
    bookingSlug: b.bookingSlug,
    status: b.status,
    startsAt:
      b.startsAt instanceof Date ? b.startsAt.toISOString() : String(b.startsAt),
    endsAt: b.endsAt instanceof Date ? b.endsAt.toISOString() : null,
    meetingUrl: b.meetingUrl ?? null,
    createdAt:
      b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt),
  }));

  const validTabs = ["overview", "activity", "deals", "emails", "bookings", "documents", "notes"] as const;
  const initialTab: NonNullable<ContactDetail["tab"]> =
    sp?.tab && (validTabs as readonly string[]).includes(sp.tab)
      ? (sp.tab as NonNullable<ContactDetail["tab"]>)
      : "overview";

  return (
    <main className="animate-page-enter flex-1 overflow-auto bg-background w-full">
      <div className="border-b bg-background/60 px-4 sm:px-6 lg:px-8 pt-4 pb-1">
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3" />
          Back to {labels.contact.plural}
        </Link>
      </div>

      <ContactRecordDetail
        contact={detail}
        activity={activityRowsForClient}
        deals={dealRowsForClient}
        bookings={bookingRowsForClient}
        documents={documentRowsForClient}
        contactLabelSingular={labels.contact.singular}
        contactLabelPlural={labels.contact.plural}
        dealLabelPlural={labels.deal.plural}
        initialTab={initialTab}
        orgId={orgId}
        orgSlug={orgRow?.slug ?? null}
        portalGate={{
          allowed: portalGate.allowed,
          reason: portalGate.reason ?? null,
        }}
        appOrigin={
          process.env.NEXT_PUBLIC_APP_URL?.trim() ||
          process.env.NEXTAUTH_URL?.trim() ||
          process.env.APP_URL?.trim() ||
          null
        }
      />
    </main>
  );
}
