// packages/crm/src/lib/payments/portal-billing.ts
//
// Autopay console (2026-07-08) — Task 3: the client portal Billing section's
// data access. Scoped STRICTLY by (session.orgId, session.contactId) — the
// portal session precedent (lib/portal/actions.ts::listPortalDocuments)
// scopes every query by both, never orgId alone. A client can NEVER see
// another org's (or another contact's) payment_records rows.
//
// Card summary is brand/last4 ONLY, read from contacts.customFields.billing
// — the SAME field the Connect webhook's createDealOnAcceptance already
// writes (packages/crm/src/lib/proposals/create-deal-on-acceptance.ts). No
// raw card data ever touches this file.

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, paymentRecords } from "@/db/schema";

export type PortalPaymentRow = {
  id: string;
  amount: string;
  currency: string;
  status: string;
  sourceBlock: string;
  createdAt: Date;
  metadata: Record<string, unknown>;
};

export type PortalBillingCard = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

export type PortalBillingDeps = {
  listPaymentRecordsForContact: (orgId: string, contactId: string) => Promise<PortalPaymentRow[]>;
  getContactBillingCard: (orgId: string, contactId: string) => Promise<PortalBillingCard | null>;
};

export type PortalBillingData = {
  payments: PortalPaymentRow[];
  card: PortalBillingCard | null;
};

/** Pure orchestration over the DI'd scoped reads — never widens the scope
 *  passed in. The caller (the portal page) is responsible for obtaining
 *  `{ orgId, contactId }` from `requirePortalSessionForOrg`, never from a
 *  route param or body. */
export async function resolvePortalBillingData(
  session: { orgId: string; contactId: string },
  deps: PortalBillingDeps,
): Promise<PortalBillingData> {
  const [payments, card] = await Promise.all([
    deps.listPaymentRecordsForContact(session.orgId, session.contactId),
    deps.getContactBillingCard(session.orgId, session.contactId),
  ]);
  return { payments, card };
}

async function listPaymentRecordsForContactReal(orgId: string, contactId: string): Promise<PortalPaymentRow[]> {
  const rows = await db
    .select({
      id: paymentRecords.id,
      amount: paymentRecords.amount,
      currency: paymentRecords.currency,
      status: paymentRecords.status,
      sourceBlock: paymentRecords.sourceBlock,
      createdAt: paymentRecords.createdAt,
      metadata: paymentRecords.metadata,
    })
    .from(paymentRecords)
    .where(and(eq(paymentRecords.orgId, orgId), eq(paymentRecords.contactId, contactId)))
    .orderBy(desc(paymentRecords.createdAt));
  return rows as PortalPaymentRow[];
}

/** Tolerant parse of customFields.billing.card — malformed/absent → null.
 *  Never throws (mirrors parseUsageCap's tolerant-parse convention). */
function parseBillingCard(customFields: unknown): PortalBillingCard | null {
  if (!customFields || typeof customFields !== "object") return null;
  const billing = (customFields as Record<string, unknown>).billing;
  if (!billing || typeof billing !== "object") return null;
  const card = (billing as Record<string, unknown>).card;
  if (!card || typeof card !== "object") return null;
  const c = card as Record<string, unknown>;
  if (typeof c.brand !== "string" || typeof c.last4 !== "string") return null;
  if (typeof c.expMonth !== "number" || typeof c.expYear !== "number") return null;
  return { brand: c.brand, last4: c.last4, expMonth: c.expMonth, expYear: c.expYear };
}

async function getContactBillingCardReal(orgId: string, contactId: string): Promise<PortalBillingCard | null> {
  const [row] = await db
    .select({ customFields: contacts.customFields })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);
  if (!row) return null;
  return parseBillingCard(row.customFields);
}

export function defaultPortalBillingDeps(): PortalBillingDeps {
  return {
    listPaymentRecordsForContact: listPaymentRecordsForContactReal,
    getContactBillingCard: getContactBillingCardReal,
  };
}

/** Production entry point — the portal Billing page calls this with the
 *  session it already got from requirePortalSessionForOrg. */
export async function getPortalBillingData(session: { orgId: string; contactId: string }): Promise<PortalBillingData> {
  return resolvePortalBillingData(session, defaultPortalBillingDeps());
}
