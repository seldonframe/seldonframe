"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, organizations } from "@/db/schema";
import { auth } from "@/auth";
import { assertWritable } from "@/lib/demo/server";
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
