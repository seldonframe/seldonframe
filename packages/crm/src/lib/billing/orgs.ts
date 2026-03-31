"use server";

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { contacts, organizations, users } from "@/db/schema";
import { assertWritable } from "@/lib/demo/server";
import { getPlan } from "@/lib/billing/plans";
import { installSoul } from "@/lib/soul/install";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

async function requireBillingUser() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const [dbUser] = await db
    .select({
      id: users.id,
      orgId: users.orgId,
      planId: users.planId,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!dbUser) {
    throw new Error("Unauthorized");
  }

  return dbUser;
}

export async function listManagedOrganizations() {
  const user = await requireBillingUser();

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      soulId: organizations.soulId,
      parentUserId: organizations.parentUserId,
      ownerId: organizations.ownerId,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .where(or(eq(organizations.parentUserId, user.id), eq(organizations.ownerId, user.id), eq(organizations.id, user.orgId)));

  if (rows.length === 0) {
    return [];
  }

  const counts = await Promise.all(
    rows.map(async (org) => {
      const [contactCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(contacts)
        .where(eq(contacts.orgId, org.id));

      return {
        orgId: org.id,
        count: contactCount ? Number(contactCount.count) : 0,
      };
    })
  );

  const countMap = new Map(counts.map((row) => [row.orgId, row.count]));

  return rows
    .map((org) => ({
      ...org,
      contactCount: countMap.get(org.id) ?? 0,
    }))
    .sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)));
}

export async function setActiveOrgAction(formData: FormData) {
  const user = await requireBillingUser();
  const orgId = String(formData.get("orgId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard");

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, orgId),
        or(eq(organizations.parentUserId, user.id), eq(organizations.ownerId, user.id), eq(organizations.id, user.orgId))
      )
    )
    .limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  const cookieStore = await cookies();
  cookieStore.set("sf_active_org_id", org.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(redirectTo.startsWith("/") ? redirectTo : "/dashboard");
}

export async function createManagedOrganizationAction(formData: FormData) {
  assertWritable();

  const user = await requireBillingUser();
  const businessName = String(formData.get("businessName") ?? "").trim();
  const soulId = String(formData.get("soulId") ?? "coach").trim() || "coach";
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim();

  if (!businessName) {
    throw new Error("Business name is required");
  }

  const plan = getPlan(user.planId ?? "");

  if (!plan || plan.type !== "pro") {
    throw new Error("Pro plan required to create managed organizations");
  }

  const managedOrgs = await listManagedOrganizations();
  if (plan.limits.maxOrgs > 0 && managedOrgs.length >= plan.limits.maxOrgs) {
    throw new Error("Organization limit reached for current plan");
  }

  const baseSlug = slugify(businessName) || `client-${randomUUID().slice(0, 8)}`;
  let slug = baseSlug;

  for (let index = 0; index < 8; index += 1) {
    const [existing] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!existing) {
      break;
    }

    slug = `${baseSlug}-${Math.floor(Math.random() * 10000)}`;
  }

  const [org] = await db
    .insert(organizations)
    .values({
      name: businessName,
      slug,
      ownerId: user.id,
      parentUserId: user.id,
      plan: "pro",
    })
    .returning({ id: organizations.id });

  if (!org) {
    throw new Error("Could not create organization");
  }

  await installSoul({
    orgId: org.id,
    soulId,
    markCompleted: true,
  });

  if (ownerEmail) {
    const tempPassword = randomUUID();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const [owner] = await db
      .insert(users)
      .values({
        orgId: org.id,
        name: ownerName || businessName,
        email: ownerEmail,
        role: "owner",
        passwordHash,
      })
      .returning({ id: users.id });

    if (owner?.id) {
      await db.update(organizations).set({ ownerId: owner.id, updatedAt: new Date() }).where(eq(organizations.id, org.id));
    }
  }

  const cookieStore = await cookies();
  cookieStore.set("sf_active_org_id", org.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/dashboard");
}
