// ============================================================================
// v1.15.0 — portal: per-customer DB resolvers
// ============================================================================
//
// Each resolver is a small auth-scoped query: takes BOTH orgId AND
// contactId, returns the data shape the renderer's customer.* embed
// expects. Both args are REQUIRED — no resolver should ever be called
// with one alone. This is the security boundary; all per-customer data
// access goes through these functions.
//
// The resolvers are individually small + auditable. If a future bug
// leaks data across customers, the audit lives in this file.
//
// Pure-time formatting (date display, currency display) is co-located
// here so the render context that downstream consumers receive is
// presentation-ready. The renderer doesn't need to know anything about
// dates or currencies.

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, contacts, deals, portalDocuments } from "@/db/schema";
import type { CustomerData } from "./customer-context";

// ─── customer.contact_info ─────────────────────────────────────────────────

export async function fetchCustomerContact(
  orgId: string,
  contactId: string,
): Promise<CustomerData["customer"] | null> {
  if (!orgId || !contactId) return null;

  const [row] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
    })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    first_name: row.firstName ?? "",
    last_name: row.lastName ?? "",
    email: row.email ?? "",
    phone: row.phone,
  };
}

// ─── customer.next_appointment ─────────────────────────────────────────────

export async function fetchNextAppointment(
  orgId: string,
  contactId: string,
  workspaceTimezone: string = "UTC",
): Promise<CustomerData["next_appointment"]> {
  if (!orgId || !contactId) return null;

  const now = new Date();
  const [row] = await db
    .select({
      id: bookings.id,
      title: bookings.title,
      startsAt: bookings.startsAt,
      metadata: bookings.metadata,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, orgId),
        eq(bookings.contactId, contactId),
        eq(bookings.status, "scheduled"),
        gte(bookings.startsAt, now),
      ),
    )
    .orderBy(bookings.startsAt)
    .limit(1);
  if (!row || !row.startsAt) return null;

  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const locationKind =
    typeof meta.locationKind === "string" ? (meta.locationKind as string) : "";
  const locationLabel =
    locationKind === "on-site-customer"
      ? "On-site at your location"
      : locationKind === "on-site-business"
        ? "At our location"
        : locationKind === "phone"
          ? "Phone call"
          : locationKind === "video"
            ? "Video call"
            : "";

  return {
    id: row.id,
    title: row.title ?? "Appointment",
    starts_at_iso: row.startsAt.toISOString(),
    starts_at_display: formatDateTimeForCustomer(row.startsAt, workspaceTimezone),
    location_summary: locationLabel,
  };
}

// ─── customer.recent_appointments ──────────────────────────────────────────

export async function fetchRecentAppointments(
  orgId: string,
  contactId: string,
  workspaceTimezone: string = "UTC",
  limit: number = 5,
): Promise<CustomerData["recent_appointments"]> {
  if (!orgId || !contactId) return [];

  const now = new Date();
  const rows = await db
    .select({
      id: bookings.id,
      title: bookings.title,
      startsAt: bookings.startsAt,
      status: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, orgId),
        eq(bookings.contactId, contactId),
        sql`${bookings.startsAt} <= ${now}`,
      ),
    )
    .orderBy(desc(bookings.startsAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    title: r.title ?? "Appointment",
    starts_at_display: r.startsAt
      ? formatDateForCustomer(r.startsAt, workspaceTimezone)
      : "",
    status: r.status ?? "completed",
  }));
}

// ─── customer.documents ────────────────────────────────────────────────────

export async function fetchCustomerDocuments(
  orgId: string,
  contactId: string,
  workspaceTimezone: string = "UTC",
  limit: number = 25,
): Promise<CustomerData["documents"]> {
  if (!orgId || !contactId) return [];

  const rows = await db
    .select({
      id: portalDocuments.id,
      fileName: portalDocuments.fileName,
      blobUrl: portalDocuments.blobUrl,
      createdAt: portalDocuments.createdAt,
    })
    .from(portalDocuments)
    .where(
      and(
        eq(portalDocuments.orgId, orgId),
        eq(portalDocuments.contactId, contactId),
      ),
    )
    .orderBy(desc(portalDocuments.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    file_name: r.fileName,
    blob_url: r.blobUrl,
    uploaded_at_display: formatDateForCustomer(r.createdAt, workspaceTimezone),
  }));
}

// ─── customer.deals ────────────────────────────────────────────────────────

export async function fetchCustomerDeals(
  orgId: string,
  contactId: string,
  limit: number = 10,
): Promise<CustomerData["deals"]> {
  if (!orgId || !contactId) return [];

  const rows = await db
    .select({
      id: deals.id,
      title: deals.title,
      stage: deals.stage,
      value: deals.value,
      currency: deals.currency,
    })
    .from(deals)
    .where(and(eq(deals.orgId, orgId), eq(deals.contactId, contactId)))
    .orderBy(desc(deals.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    stage: r.stage,
    value_display: formatCurrency(r.value, r.currency),
  }));
}

// ─── formatting helpers (pure) ─────────────────────────────────────────────

function formatDateTimeForCustomer(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function formatDateForCustomer(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function formatCurrency(rawValue: string, currency: string): string {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return rawValue;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(0)}`;
  }
}
