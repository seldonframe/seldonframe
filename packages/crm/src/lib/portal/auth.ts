"use server";

import crypto from "node:crypto";
import { and, desc, eq, isNull, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { contacts, organizations, portalAccessCodes } from "@/db/schema";
import { emitSeldonEvent } from "@/lib/events/bus";
import { assertWritable } from "@/lib/demo/server";
import { trackEvent } from "@/lib/analytics/track";
import { PORTAL_SESSION_COOKIE, signPortalSession, verifyPortalSession } from "./session";
import { checkPortalPlanGate } from "./plan-gate";
import {
  sendPortalAccessCodeEmail,
  pickFromAddress as pickPortalAccessCodeFromAddress,
} from "@/lib/emails/portal-access-code";
import { findDemoContactForOrg } from "@/lib/workspace/seed-demo-portal";

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function getOrgBySlug(orgSlug: string) {
  // v1.16.1 — also pull `name` so the portal-access-code email can
  // address the customer with the workspace's brand name ("Sign in
  // to Cypress & Pine HVAC") rather than a generic subject.
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);
  return org ?? null;
}

function getAppOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000"
  );
}

async function setPortalSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(PORTAL_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

async function resolvePortalSessionByToken(orgSlug: string, token: string | null | undefined) {
  const org = await getOrgBySlug(orgSlug);

  if (!org) {
    return null;
  }

  const session = verifyPortalSession(token);

  if (!session || session.orgId !== org.id) {
    return null;
  }

  const [contact] = await db
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.orgId, org.id), eq(contacts.id, session.contactId)))
    .limit(1);

  if (!contact) {
    return null;
  }

  return {
    orgId: org.id,
    orgSlug,
    contact,
    token,
  };
}

export async function requestPortalAccessCodeAction(orgSlug: string, rawEmail: string) {
  assertWritable();

  // v1.19 — normalize email at action entry. Customers type with
  // arbitrary casing ("Gmail.com" vs "gmail.com") and pre-1.19 the
  // case-sensitive lookup silently no-op'd. Per RFC 5321 the local-
  // part is technically case-sensitive but virtually no provider
  // enforces that and our intended UX is "type your email, get the
  // code." Lowercase + trim once here, use the normalized form
  // through the rest of the action.
  const email = (rawEmail ?? "").trim().toLowerCase();
  const emailDomain = email.split("@")[1] ?? null;

  const org = await getOrgBySlug(orgSlug);

  if (!org) {
    // Don't leak which orgs exist via timing or error shape, but
    // DO log structured so ops can diagnose "no email arrived"
    // reports in one log line. v1.19 — observability addition.
    console.warn(
      `[portal-access-code] silent_no_op: org_not_found org_slug=${orgSlug} email_domain=${emailDomain}`,
    );
    return { success: true };
  }

  // May 1, 2026 — workspace plan gate. Free tier doesn't get the
  // portal. We silently no-op (return success) so guessing emails
  // doesn't leak which workspaces have the portal enabled.
  const planGate = await checkPortalPlanGate(org.id);
  if (!planGate.allowed) {
    console.warn(
      `[portal-access-code] silent_no_op: plan_gate_denied org_id=${org.id} tier=${planGate.tier} reason=${planGate.reason ?? "no_reason"}`,
    );
    return { success: true };
  }

  // v1.19 — case-insensitive contact lookup. Email is already
  // lowercased; we lower() the stored email at compare time so
  // legacy rows with mixed casing also match.
  const [contact] = await db
    .select({
      id: contacts.id,
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

  // May 1, 2026 — silent no-op when:
  //   (a) the email isn't a known contact (don't leak existence)
  //   (b) the contact exists but the operator hasn't enabled portal
  //       access (don't leak that the contact is "on file but locked")
  // Both cases return success: true so a malicious actor can't
  // distinguish between them. v1.19 — log distinct paths so ops can
  // tell them apart in production logs.
  if (!contact?.id) {
    console.warn(
      `[portal-access-code] silent_no_op: contact_not_found org_id=${org.id} email_domain=${emailDomain}`,
    );
    return { success: true };
  }
  if (!contact.portalAccessEnabled) {
    console.warn(
      `[portal-access-code] silent_no_op: portal_access_disabled org_id=${org.id} contact_id=${contact.id}`,
    );
    return { success: true };
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 15 * 60_000);

  await db.insert(portalAccessCodes).values({
    orgId: org.id,
    contactId: contact.id,
    email,
    codeHash: hashCode(code),
    expiresAt,
  });

  // v1.16.1 — actually deliver the code via email. Pre-v1.16.1 the
  // code was generated + persisted but never sent — customers got
  // "no email arrived" with no error. Fire-and-forget so the action
  // returns quickly even if Resend is slow; we log failures for ops.
  // Best-effort: any send failure is logged but doesn't change the
  // success response (still don't leak existence via timing/error).
  //
  // v1.18.0 — agency-branded sender + template. When the workspace
  // is attached to an active agency with a verified sender, the
  // email goes FROM the agency's domain + carries the agency's logo
  // / brand name in the template. Falls back to SF defaults when no
  // active agency is attached or the sender hasn't verified.
  try {
    const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
    if (!apiKey) {
      console.warn(
        "[portal-access-code] RESEND_API_KEY not set — code persisted but not emailed",
      );
    } else {
      const { getEffectiveBrandingForWorkspace } = await import(
        "@/lib/partner-agencies/branding"
      );
      const branding = await getEffectiveBrandingForWorkspace(org.id);
      const fromAddress =
        branding.sender_email_address
          ? `${branding.brand_name} <${branding.sender_email_address}>`
          : pickPortalAccessCodeFromAddress(process.env);
      const sendResult = await sendPortalAccessCodeEmail(
        {
          email,
          workspaceName: org.name,
          code,
          expiresInMinutes: 15,
          // v1.18 — pass the agency's brand name so the email subject
          // + footer say the agency's name when applicable. Defaults
          // to "<workspaceName> on SeldonFrame" when no agency.
          brandName: branding.is_white_label ? branding.brand_name : null,
          logoUrl: branding.is_white_label ? branding.logo_url : null,
          supportUrl: branding.support_url,
        },
        { apiKey, fromAddress },
      );
      if (!sendResult.ok) {
        console.error(
          `[portal-access-code] send failed: ${sendResult.status} ${sendResult.error}`,
        );
      }
    }
  } catch (err) {
    console.error(
      `[portal-access-code] unexpected send error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    success: true,
    codePreview: process.env.NODE_ENV === "production" ? undefined : code,
  };
}

export async function verifyPortalAccessCodeAction(orgSlug: string, rawEmail: string, code: string) {
  assertWritable();

  // v1.19 — same case-insensitive normalization as
  // requestPortalAccessCodeAction. Customer types email at /verify
  // with whatever casing they want; we match by lower(email).
  const email = (rawEmail ?? "").trim().toLowerCase();

  const org = await getOrgBySlug(orgSlug);

  if (!org) {
    throw new Error("Organization not found");
  }

  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, org.id),
        sql`lower(${contacts.email}) = ${email}`,
      ),
    )
    .limit(1);

  if (!contact?.id) {
    throw new Error("Contact not found");
  }

  // v1.19 — codes were stored with the lowercased email at request
  // time, so equality match works without a lower() wrapper here.
  // We DO match by contact_id which is already a strict UUID match,
  // so the email check is redundant for the same contact — kept as
  // defense in depth.
  const [record] = await db
    .select()
    .from(portalAccessCodes)
    .where(
      and(
        eq(portalAccessCodes.orgId, org.id),
        eq(portalAccessCodes.contactId, contact.id),
        sql`lower(${portalAccessCodes.email}) = ${email}`,
        isNull(portalAccessCodes.usedAt),
        gt(portalAccessCodes.expiresAt, new Date())
      )
    )
    .orderBy(desc(portalAccessCodes.createdAt))
    .limit(1);

  if (!record || record.codeHash !== hashCode(code)) {
    throw new Error("Invalid access code");
  }

  await db
    .update(portalAccessCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(portalAccessCodes.orgId, org.id), eq(portalAccessCodes.id, record.id)));

  const token = signPortalSession({
    orgId: org.id,
    contactId: contact.id,
    email,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  await setPortalSessionCookie(token);

  // May 1, 2026 — touch portal_last_login_at so the admin contact
  // detail page can show "Last seen: 3 days ago".
  await db
    .update(contacts)
    .set({ portalLastLoginAt: new Date() })
    .where(eq(contacts.id, contact.id));

  await emitSeldonEvent("portal.login", { contactId: contact.id }, { orgId: org.id });

  // May 1, 2026 — Measurement Layer 2. OTC verify path.
  trackEvent(
    "portal_login",
    { login_method: "otc_code" },
    { orgId: org.id, contactId: contact.id }
  );

  return { success: true };
}

export async function clearPortalSessionAction(orgSlug: string) {
  const cookieStore = await cookies();
  cookieStore.set(PORTAL_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  redirect(`/customer/${orgSlug}/login`);
}

export async function getPortalSessionForOrg(orgSlug: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  return resolvePortalSessionByToken(orgSlug, token);
}

export async function getPortalSessionForToken(orgSlug: string, token: string) {
  return resolvePortalSessionByToken(orgSlug, token);
}

export async function createPortalMagicLink(input: {
  orgSlug: string;
  contactId: string;
  expiresInMinutes?: number;
  redirectTo?: string;
}) {
  const org = await getOrgBySlug(input.orgSlug);

  if (!org) {
    throw new Error("Organization not found");
  }

  const [contact] = await db
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.orgId, org.id), eq(contacts.id, input.contactId)))
    .limit(1);

  if (!contact?.id || !contact.email) {
    throw new Error("Contact must have an email to receive a magic link");
  }

  const expiresAt = new Date(Date.now() + (input.expiresInMinutes ?? 30) * 60_000);
  const token = signPortalSession({
    orgId: org.id,
    contactId: contact.id,
    email: contact.email,
    exp: expiresAt.getTime(),
  });

  const url = new URL(`/customer/${input.orgSlug}/magic`, getAppOrigin());
  url.searchParams.set("token", token);
  if (input.redirectTo?.trim()) {
    url.searchParams.set("redirect", input.redirectTo.trim());
  }

  return {
    token,
    inviteUrl: url.toString(),
    expiresAt: expiresAt.toISOString(),
    contact: {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
    },
  };
}

export async function establishPortalMagicSession(input: {
  orgSlug: string;
  token: string;
  redirectTo?: string | null;
}) {
  const session = await resolvePortalSessionByToken(input.orgSlug, input.token);

  if (!session) {
    throw new Error("Invalid or expired portal magic link");
  }

  const refreshToken = signPortalSession({
    orgId: session.orgId,
    contactId: session.contact.id,
    email: session.contact.email ?? "",
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  await setPortalSessionCookie(refreshToken);
  await emitSeldonEvent("portal.login", { contactId: session.contact.id }, { orgId: session.orgId });

  // May 1, 2026 — Measurement Layer 2. Magic-link verify path.
  trackEvent(
    "portal_login",
    { login_method: "magic_link" },
    { orgId: session.orgId, contactId: session.contact.id }
  );

  return {
    orgSlug: session.orgSlug,
    redirectTo: input.redirectTo?.trim() || `/customer/${session.orgSlug}?onboarding=1`,
    contact: session.contact,
  };
}

export async function requirePortalSessionForOrg(orgSlug: string) {
  const session = await getPortalSessionForOrg(orgSlug);

  if (!session) {
    redirect(`/customer/${orgSlug}/login`);
  }

  return session;
}

/** v1.55.x — Demo-login session establishment for the one-click
 *  /customer/<slug>/demo route. Resolves the workspace by slug, finds
 *  the seeded "__demo__" contact, signs a 7-day portal session, sets
 *  the cookie, and emits the same `portal.login` events the magic-link
 *  path emits (with login_method="demo" for analytics segmentation).
 *
 *  Returns { ok: true, redirectTo: "/customer/<slug>" } on success.
 *  Returns { ok: false, reason } when the org is unknown or no demo
 *  contact exists (the route handler decides whether to 404 or fall
 *  back to /login). NEVER throws — operator-pasted demo links must
 *  fail gracefully into the magic-link path so they're still useful
 *  even when the seed soft-failed at workspace creation. */
export async function establishPortalDemoSession(input: {
  orgSlug: string;
}): Promise<
  | { ok: true; orgSlug: string; orgId: string; contactId: string; redirectTo: string }
  | { ok: false; reason: "org_not_found" | "no_demo_contact" }
> {
  const org = await getOrgBySlug(input.orgSlug);

  if (!org) {
    return { ok: false, reason: "org_not_found" };
  }

  const demoContact = await findDemoContactForOrg(org.id);

  if (!demoContact?.id) {
    return { ok: false, reason: "no_demo_contact" };
  }

  const token = signPortalSession({
    orgId: org.id,
    contactId: demoContact.id,
    email: demoContact.email ?? `demo+${input.orgSlug}@example.com`,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  await setPortalSessionCookie(token);

  await emitSeldonEvent("portal.login", { contactId: demoContact.id }, { orgId: org.id });

  // v1.55.x — Measurement Layer 2: demo-login path. Same event name
  // as the magic-link verify path, with login_method="demo" so the
  // ops dashboards can split "real customer logins" from "operator
  // pasting the demo URL at a prospect." Critical for measuring the
  // "/demo URL pasted → live conversation" funnel.
  trackEvent(
    "portal_login",
    { login_method: "demo" },
    { orgId: org.id, contactId: demoContact.id }
  );

  return {
    ok: true,
    orgSlug: input.orgSlug,
    orgId: org.id,
    contactId: demoContact.id,
    redirectTo: `/customer/${input.orgSlug}/`,
  };
}
