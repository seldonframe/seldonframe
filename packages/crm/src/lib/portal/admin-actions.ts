"use server";

import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { contacts, organizations, portalDocuments } from "@/db/schema";
import { auth } from "@/auth";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { checkPortalPlanGate } from "./plan-gate";
import { createPortalMagicLink } from "./auth";
import {
  pickFromAddress,
  sendPortalInviteMagicLinkEmail,
} from "@/lib/emails/portal-invite-magic-link";
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";

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
 * Operator-side: send a portal invite to a contact.
 *
 * v1.20.1 — switched from 6-digit code to MAGIC LINK. Pre-1.20.1 the
 * contact got an email containing just "your code is 712420" with NO
 * clickable URL — they had to know to navigate to /customer/<slug>/login
 * themselves. v1.20.1 sends a one-click magic link bound to their
 * contactId; click in inbox → land signed-in at /customer/<slug>.
 *
 * The 6-digit code self-service flow is unchanged for customers who
 * navigate directly to /customer/<slug>/login (no invite email): they
 * type their email, get a code, type the code. That path covers
 * customers who lost the invite email.
 *
 * Branding: when the workspace is under an active partner agency, the
 * email's footer + sender substitute the agency's brand (same defense-
 * in-depth as the access-code email).
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
  const email = (input.email ?? "").trim().toLowerCase();
  if (!email) {
    return { ok: false, reason: "missing_email" };
  }

  // Resolve the org + the contact (case-insensitive email match per
  // v1.19) so we can mint the magic link bound to the right contactId.
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.slug, input.orgSlug))
    .limit(1);
  if (!org) {
    // Silent no-op for security parity with the access-code path —
    // don't leak which orgs exist via timing or error shape.
    console.warn(
      `[portal-invite-magic-link] silent_no_op: org_not_found org_slug=${input.orgSlug} email_domain=${email.split("@")[1] ?? "(no_domain)"}`,
    );
    return { ok: true };
  }

  const planGate = await checkPortalPlanGate(org.id);
  if (!planGate.allowed) {
    console.warn(
      `[portal-invite-magic-link] silent_no_op: plan_gate_denied org_id=${org.id} reason=${planGate.reason ?? "no_reason"}`,
    );
    return { ok: true };
  }

  const [contact] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      email: contacts.email,
      portalAccessEnabled: contacts.portalAccessEnabled,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, org.id),
        sql`lower(${contacts.email}) = ${email}`,
      ),
    )
    .limit(1);
  if (!contact?.id) {
    console.warn(
      `[portal-invite-magic-link] silent_no_op: contact_not_found org_id=${org.id} email_domain=${email.split("@")[1] ?? "(no_domain)"}`,
    );
    return { ok: true };
  }
  if (!contact.portalAccessEnabled) {
    console.warn(
      `[portal-invite-magic-link] silent_no_op: portal_access_disabled org_id=${org.id} contact_id=${contact.id}`,
    );
    return { ok: true };
  }

  // Mint a bound magic link via the existing portal primitive.
  const link = await createPortalMagicLink({
    orgSlug: input.orgSlug,
    contactId: contact.id,
    expiresInMinutes: 30,
  });

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      `[portal-invite-magic-link] silent_no_op: resend_not_configured org_id=${org.id} contact_id=${contact.id}`,
    );
    return { ok: true };
  }

  const branding = await getEffectiveBrandingForWorkspace(org.id);
  const fromAddress = pickFromAddress(process.env);

  const send = await sendPortalInviteMagicLinkEmail(
    {
      email: contact.email ?? email,
      workspaceName: org.name ?? input.orgSlug,
      inviteUrl: link.inviteUrl,
      expiresInMinutes: 30,
      firstName: contact.firstName ?? null,
      brandName: branding?.is_white_label ? branding.brand_name : null,
      logoUrl: branding?.logo_url ?? null,
      supportUrl: branding?.is_white_label ? branding.support_url : null,
    },
    { apiKey, fromAddress },
  );

  if (!send.ok) {
    console.error(
      `[portal-invite-magic-link] send_failed org_id=${org.id} contact_id=${contact.id} status=${send.status} error=${send.error}`,
    );
    // Surface to caller so the UI can show "couldn't send" instead
    // of a misleading success ✓.
    return { ok: false, reason: "email_send_failed" };
  }

  await emitSeldonEvent(
    "portal.invite_magic_link_sent",
    { contactId: contact.id, email_domain: email.split("@")[1] ?? "(no_domain)" },
    { orgId: org.id },
  );

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
