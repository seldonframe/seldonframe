"use server";

import crypto from "node:crypto";
import { and, desc, eq, isNull, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { contacts, organizations, portalAccessCodes } from "@/db/schema";
import { emitSeldonEvent } from "@/lib/events/bus";
import { assertWritable } from "@/lib/demo/server";
import { PORTAL_SESSION_COOKIE, signPortalSession, verifyPortalSession } from "./session";

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function getOrgBySlug(orgSlug: string) {
  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);
  return org ?? null;
}

export async function requestPortalAccessCodeAction(orgSlug: string, email: string) {
  assertWritable();

  const org = await getOrgBySlug(orgSlug);

  if (!org) {
    throw new Error("Organization not found");
  }

  const [contact] = await db
    .select({ id: contacts.id, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.orgId, org.id), eq(contacts.email, email)))
    .limit(1);

  if (!contact?.id) {
    throw new Error("Contact not found");
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

  return {
    success: true,
    codePreview: process.env.NODE_ENV === "production" ? undefined : code,
  };
}

export async function verifyPortalAccessCodeAction(orgSlug: string, email: string, code: string) {
  assertWritable();

  const org = await getOrgBySlug(orgSlug);

  if (!org) {
    throw new Error("Organization not found");
  }

  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, org.id), eq(contacts.email, email)))
    .limit(1);

  if (!contact?.id) {
    throw new Error("Contact not found");
  }

  const [record] = await db
    .select()
    .from(portalAccessCodes)
    .where(
      and(
        eq(portalAccessCodes.orgId, org.id),
        eq(portalAccessCodes.contactId, contact.id),
        eq(portalAccessCodes.email, email),
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

  const cookieStore = await cookies();
  cookieStore.set(PORTAL_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  await emitSeldonEvent("portal.login", { contactId: contact.id });

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

  redirect(`/portal/${orgSlug}/login`);
}

export async function getPortalSessionForOrg(orgSlug: string) {
  const org = await getOrgBySlug(orgSlug);

  if (!org) {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
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
  };
}

export async function requirePortalSessionForOrg(orgSlug: string) {
  const session = await getPortalSessionForOrg(orgSlug);

  if (!session) {
    redirect(`/portal/${orgSlug}/login`);
  }

  return session;
}
