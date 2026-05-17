// 2026-05-17 — When an agency operator creates a new client workspace,
// auto-insert a contact row in the AGENCY's own CRM representing the
// new SMB (Rain Pros, Seattle Heating, etc.). The agency's /contacts
// list then reflects every client they manage — SeldonFrame becomes a
// real business OS for the agency, not just a tool to manage clients'
// workspaces in isolation.
//
// Idempotency: keyed on (agencyOrgId, clientWorkspaceId) via the
// custom_fields.client_workspace_id field. If a contact row already
// exists for this workspace, we skip. Operators can freely rename /
// re-tag / convert to a deal after — we only insert; never overwrite.
//
// Non-fatal: failures are logged and swallowed. The workspace creation
// flow shouldn't break because the agency's contact-side seeding hit a
// duplicate-email constraint or similar.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";

export interface SeedClientContactInput {
  /** The agency operator's primary org id — where the contact lands. */
  agencyOrgId: string;
  /** The newly-created client workspace's id (used for idempotency
   *  matching in custom_fields.client_workspace_id). */
  clientWorkspaceId: string;
  /** The client workspace's slug — surfaced in custom_fields so the
   *  agency can deep-link from the contact detail page back to the
   *  workspace's Ready hub. */
  clientWorkspaceSlug: string;
  /** Business name from the URL extraction — used as the contact's
   *  firstName (treating the business as a single "person-shaped"
   *  contact row, the same shape /contacts already renders). */
  businessName: string;
  /** Optional contact channels from extraction. */
  email?: string | null;
  phone?: string | null;
  /** Source URL — useful operator context, stored as the contact's
   *  `source` so the agency knows which URL produced the workspace. */
  sourceUrl?: string | null;
}

export type SeedClientContactResult =
  | { ok: true; created: true; contactId: string }
  | { ok: true; created: false; reason: "already_seeded" }
  | { ok: false; reason: string };

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function seedClientContactInAgencyCrm(
  input: SeedClientContactInput,
): Promise<SeedClientContactResult> {
  if (!UUID_SHAPE.test(input.agencyOrgId)) {
    // Operator likely has a synthesised user id (admin-token /
    // operator-portal session) without a real agency org — nothing
    // to seed.
    return { ok: false, reason: "invalid_agency_org_id" };
  }
  if (!UUID_SHAPE.test(input.clientWorkspaceId)) {
    return { ok: false, reason: "invalid_client_workspace_id" };
  }
  const businessName = input.businessName?.trim();
  if (!businessName) {
    return { ok: false, reason: "missing_business_name" };
  }

  // Idempotency: skip if we've already seeded a contact for this
  // (agency, client_workspace_id) pair. Match against the JSONB
  // custom_fields column — cheap because contacts.org_id is in the
  // index and we further filter by JSONB equality.
  const existing = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, input.agencyOrgId),
        sql`${contacts.customFields} ->> 'client_workspace_id' = ${input.clientWorkspaceId}`,
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return { ok: true, created: false, reason: "already_seeded" };
  }

  try {
    const [inserted] = await db
      .insert(contacts)
      .values({
        orgId: input.agencyOrgId,
        firstName: businessName,
        lastName: null,
        // Use email + phone if extraction surfaced them — pretend the
        // SMB is reachable via these channels (same default the
        // operator would have entered manually).
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        company: businessName,
        status: "lead",
        source: input.sourceUrl?.trim() || "client_workspace_created",
        tags: ["client-workspace"],
        customFields: {
          client_workspace_id: input.clientWorkspaceId,
          client_workspace_slug: input.clientWorkspaceSlug,
          seeded_at: new Date().toISOString(),
        },
      })
      .returning({ id: contacts.id });
    if (!inserted?.id) {
      return { ok: false, reason: "insert_returned_no_row" };
    }
    return { ok: true, created: true, contactId: inserted.id };
  } catch (err) {
    // Most likely: contacts_org_lower_email_uniq violated because the
    // agency already has a contact with this email. Treat as a soft
    // already-seeded — the contact exists in the agency CRM, just not
    // tagged with our client_workspace_id.
    if (err instanceof Error && err.message.includes("contacts_org_lower_email_uniq")) {
      return { ok: true, created: false, reason: "already_seeded" };
    }
    return { ok: false, reason: err instanceof Error ? err.message : "unknown" };
  }
}
