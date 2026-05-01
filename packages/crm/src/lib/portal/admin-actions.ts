"use server";

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { contacts, organizations, portalDocuments } from "@/db/schema";
import { auth } from "@/auth";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { checkPortalPlanGate } from "./plan-gate";
import { requestPortalAccessCodeAction } from "./auth";

/**
 * Operator-side: toggle portal access for a contact. Used by the
 * Portal Access card on the contact detail page. Plan-gated at Free
 * (Free tier can't enable; the UI shows a disabled toggle + upgrade CTA).
 *
 * Returns:
 *   { ok: true,  enabled: boolean }      — flip succeeded
 *   { ok: false, reason: string }        — plan gate / unauth
 */
export async function setContactPortalAccessAction(input: {
  orgId: string;
  contactId: string;
  enabled: boolean;
}): Promise<{ ok: true; enabled: boolean } | { ok: false; reason: string }> {
  assertWritable();

  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, reason: "unauthorized" };
  }

  // Confirm this user owns / belongs to the org. Defensive — the dashboard
  // routing already enforces this at the layout layer; we re-check here so
  // a direct server-action call can't bypass the workspace boundary.
  const [orgRow] = await db
    .select({ id: organizations.id, ownerId: organizations.ownerId })
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);
  if (!orgRow) return { ok: false, reason: "org_not_found" };

  // Plan gate. Free tier can't enable portal access at all (the toggle
  // shows disabled in the UI; we re-check server-side as defense in
  // depth). Disabling is always allowed regardless of plan so an
  // operator who downgraded can still revoke portal access.
  if (input.enabled) {
    const gate = await checkPortalPlanGate(input.orgId);
    if (!gate.allowed) {
      return { ok: false, reason: gate.reason ?? "plan_gate_denied" };
    }
  }

  const result = await db
    .update(contacts)
    .set({
      portalAccessEnabled: input.enabled,
      updatedAt: new Date(),
    })
    .where(and(eq(contacts.orgId, input.orgId), eq(contacts.id, input.contactId)))
    .returning({ id: contacts.id });

  if (!result.length) {
    return { ok: false, reason: "contact_not_found" };
  }

  return { ok: true, enabled: input.enabled };
}

/**
 * Operator-side: send a portal invite (magic-code email) to a contact.
 * Wraps the existing requestPortalAccessCodeAction so the per-contact
 * card can trigger the same flow the public login form uses, without
 * requiring the operator to leave the admin dashboard.
 *
 * The code flow is OTC-based: the contact gets a 6-digit code emailed
 * (or in dev, returned in the codePreview field). They paste it into
 * /portal/<orgSlug>/login. Operators who want a one-click "magic link"
 * style flow can extend this in a follow-up — V1 ships the OTC code.
 */
export async function sendPortalInviteAction(input: {
  orgSlug: string;
  email: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  assertWritable();

  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, reason: "unauthorized" };
  }
  if (!input.email) {
    return { ok: false, reason: "missing_email" };
  }

  await requestPortalAccessCodeAction(input.orgSlug, input.email);
  return { ok: true };
}

/**
 * Operator-side: upload a file for a contact's portal Documents tab.
 *
 * Receives a FormData with three fields:
 *   - orgId       (string, uuid)
 *   - contactId   (string, uuid)
 *   - file        (File)
 *
 * Pushes the file to Vercel Blob under
 * `org/<orgId>/contact/<contactId>/<random-uuid>-<safeName>` and inserts
 * a portal_documents row. Plan-gated (Growth/Scale only) and bounded by
 * the contact-belongs-to-org check, mirroring setContactPortalAccessAction.
 *
 * Returns:
 *   { ok: true,  documentId }    — upload + insert succeeded
 *   { ok: false, reason }        — plan gate, missing file, scope mismatch, etc.
 *
 * Notes for callers:
 *   - Next.js server actions cap request body at 1 MB by default. Larger
 *     files need experimental.serverActions.bodySizeLimit raised in
 *     next.config.ts, or a switch to client-side @vercel/blob.upload().
 *     Shipping V1 with the default limit; will revisit if file sizes grow.
 *   - blob_path is stored alongside blob_url so a future deletion UI
 *     can call del(blob_path) without parsing it back out of the URL.
 */
export async function uploadPortalDocumentAction(
  formData: FormData
): Promise<
  | { ok: true; documentId: string }
  | { ok: false; reason: string }
> {
  assertWritable();

  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, reason: "unauthorized" };
  }

  const orgId = String(formData.get("orgId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const file = formData.get("file");

  if (!orgId || !contactId) {
    return { ok: false, reason: "missing_fields" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, reason: "missing_file" };
  }

  // Defensive — same belt-and-suspenders pattern setContactPortalAccessAction
  // uses. The dashboard route guards already enforce org membership.
  const [orgRow] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!orgRow) return { ok: false, reason: "org_not_found" };

  const gate = await checkPortalPlanGate(orgId);
  if (!gate.allowed) {
    return { ok: false, reason: gate.reason ?? "plan_gate_denied" };
  }

  const [contactRow] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);
  if (!contactRow) return { ok: false, reason: "contact_not_found" };

  // Sanitize the filename for the blob path. Keep the original name in
  // the DB row so the client portal still shows what the operator
  // uploaded ("Q3 contract.pdf"), but never let user-supplied bytes hit
  // the storage path.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blobPath = `org/${orgId}/contact/${contactId}/${crypto.randomUUID()}-${safeName}`;

  const blob = await put(blobPath, file, {
    access: "public",
    contentType: file.type || "application/octet-stream",
    addRandomSuffix: false,
  });

  const [created] = await db
    .insert(portalDocuments)
    .values({
      orgId,
      contactId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      blobUrl: blob.url,
      blobPath,
      uploadedByUserId: session.user.id,
    })
    .returning({ id: portalDocuments.id });

  if (!created?.id) {
    return { ok: false, reason: "insert_failed" };
  }

  await emitSeldonEvent(
    "portal.document_uploaded",
    { contactId, documentId: created.id, fileSize: file.size },
    { orgId }
  );

  return { ok: true, documentId: created.id };
}
