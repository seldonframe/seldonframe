// packages/crm/src/lib/payments/portal-billing.ts
//
// Autopay console (2026-07-08) — Task 3: the client portal Billing section's
// data access.
//
// Money-severity review fix (BLOCKING #1, 2026-07-08): payment_records and
// contacts.customFields.billing are written under the AGENCY org
// (lib/proposals/create-deal-on-acceptance.ts + lib/payments/retainer.ts's
// insertPaymentRecordReal both write orgId = agencyOrgId) — but the
// /customer/[orgSlug] portal session's orgId is the CLIENT org. The FIRST
// version of this file scoped reads by `session.orgId` directly, which
// always returned zero rows for a live retainer (the classic
// Optimistic-Path bug: it looked correct in isolation, wrong end-to-end).
//
// The fix: resolve the SAME shared join
// (lib/payments/retainer.ts::resolveRetainerLinkForClientOrg) that
// updateRetainerCardAction already used correctly, so history, card, and
// update-card all agree on which org owns the rows. clientOrgId ->
// {agencyOrgId, contactId} -> read payment_records + card under THOSE ids.
// No proposal for this client org (or no agency-side contact resolved) ->
// empty state, NEVER a cross-org fallback.

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, paymentRecords } from "@/db/schema";
import { resolveRetainerLinkForClientOrg, defaultRetainerLinkDeps, type RetainerLink } from "@/lib/payments/retainer";

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
  /** clientOrgId -> the shared retainer join. Null = no retainer attached
   *  for this client org (empty state). MUST be the same resolver
   *  update-card uses — never re-derived independently. */
  resolveRetainerLink: (clientOrgId: string) => Promise<RetainerLink | null>;
  /** Scoped by the AGENCY org + the AGENCY-SIDE contact id (from the link),
   *  never the client org. */
  listPaymentRecordsForContact: (agencyOrgId: string, agencyContactId: string) => Promise<PortalPaymentRow[]>;
  getContactBillingCard: (agencyOrgId: string, agencyContactId: string) => Promise<PortalBillingCard | null>;
};

export type PortalBillingData = {
  payments: PortalPaymentRow[];
  card: PortalBillingCard | null;
};

/** Pure orchestration: resolve the CLIENT org's retainer link to the
 *  AGENCY-side org+contact, then read scoped by THOSE ids. Never widens the
 *  scope, never falls back to the client org directly. A client org with no
 *  retainer link (or a link with no resolved agency-side contact) gets the
 *  empty state — the scoped reads are never even called (nothing to scope
 *  by), so a DI fake that would happily return data is provably unreachable. */
export async function resolvePortalBillingData(
  clientOrgId: string,
  deps: PortalBillingDeps,
): Promise<PortalBillingData> {
  const link = await deps.resolveRetainerLink(clientOrgId);
  if (!link || !link.contactId) {
    return { payments: [], card: null };
  }

  const [payments, card] = await Promise.all([
    deps.listPaymentRecordsForContact(link.agencyOrgId, link.contactId),
    deps.getContactBillingCard(link.agencyOrgId, link.contactId),
  ]);
  return { payments, card };
}

async function listPaymentRecordsForContactReal(agencyOrgId: string, agencyContactId: string): Promise<PortalPaymentRow[]> {
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
    .where(and(eq(paymentRecords.orgId, agencyOrgId), eq(paymentRecords.contactId, agencyContactId)))
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

async function getContactBillingCardReal(agencyOrgId: string, agencyContactId: string): Promise<PortalBillingCard | null> {
  const [row] = await db
    .select({ customFields: contacts.customFields })
    .from(contacts)
    .where(and(eq(contacts.orgId, agencyOrgId), eq(contacts.id, agencyContactId)))
    .limit(1);
  if (!row) return null;
  return parseBillingCard(row.customFields);
}

export function defaultPortalBillingDeps(): PortalBillingDeps {
  return {
    resolveRetainerLink: (clientOrgId) => resolveRetainerLinkForClientOrg(clientOrgId, defaultRetainerLinkDeps()),
    listPaymentRecordsForContact: listPaymentRecordsForContactReal,
    getContactBillingCard: getContactBillingCardReal,
  };
}

/** Production entry point — the portal Billing page calls this with the
 *  CLIENT org id from requirePortalSessionForOrg (session.orgId). The join
 *  to the agency-side org+contact happens INSIDE this function — the caller
 *  never passes an agency org id directly. */
export async function getPortalBillingData(clientOrgId: string): Promise<PortalBillingData> {
  return resolvePortalBillingData(clientOrgId, defaultPortalBillingDeps());
}
