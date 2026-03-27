"use server";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { cloudProvisioningJobs, organizations, users } from "@/lib/db/schema";
import { assertWritable } from "@/lib/cloud/guards";
import { getCloudSessionCookieName, signCloudSession, verifyCloudSession } from "./session";

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48);
}

async function setCloudSession(params: { userId: string; orgId: string; orgSlug: string; email: string; tier: "free" | "pro" | "enterprise" }) {
  const token = signCloudSession({
    ...params,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  const cookieStore = await cookies();
  cookieStore.set(getCloudSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function signupCloudAction(formData: FormData) {
  assertWritable();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "").trim();
  const orgName = String(formData.get("orgName") ?? "").trim();

  if (!name || !email || !orgName || password.length < 8) {
    throw new Error("Invalid signup details");
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    throw new Error("An account with this email already exists");
  }

  const slug = `${slugify(orgName) || "workspace"}-${Math.floor(Math.random() * 10000)}`;

  const [org] = await db
    .insert(organizations)
    .values({
      name: orgName,
      slug,
      plan: "free",
      settings: {
        cloud: {
          provisionedAt: new Date().toISOString(),
        },
      },
    })
    .returning({ id: organizations.id, slug: organizations.slug, plan: organizations.plan });

  if (!org) {
    throw new Error("Failed to create organization");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(users)
    .values({
      orgId: org.id,
      name,
      email,
      role: "owner",
      passwordHash,
    })
    .returning({ id: users.id });

  await db.insert(cloudProvisioningJobs).values({
    orgId: org.id,
    status: "completed",
    template: "default",
    result: {
      orgSlug: org.slug,
      ownerEmail: email,
    },
  });

  if (!user) {
    throw new Error("Failed to create user");
  }

  await setCloudSession({
    userId: user.id,
    orgId: org.id,
    orgSlug: org.slug,
    email,
    tier: (org.plan as "free" | "pro" | "enterprise") ?? "free",
  });

  redirect("/onboarding/soul");
}

export async function loginCloudAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "").trim();

  if (!email || !password) {
    throw new Error("Invalid login details");
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user?.passwordHash) {
    throw new Error("Invalid credentials");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) {
    throw new Error("Invalid credentials");
  }

  const [org] = await db.select({ id: organizations.id, slug: organizations.slug, plan: organizations.plan }).from(organizations).where(eq(organizations.id, user.orgId)).limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  await setCloudSession({
    userId: user.id,
    orgId: org.id,
    orgSlug: org.slug,
    email: user.email,
    tier: (org.plan as "free" | "pro" | "enterprise") ?? "free",
  });

  if (!((await db.select({ soulCompletedAt: organizations.soulCompletedAt }).from(organizations).where(eq(organizations.id, org.id)).limit(1))[0]?.soulCompletedAt)) {
    redirect("/onboarding/soul");
  }

  redirect("/dashboard");
}

export async function logoutCloudAction() {
  const cookieStore = await cookies();
  cookieStore.set(getCloudSessionCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  redirect("/login");
}

export async function requireCloudAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getCloudSessionCookieName())?.value;
  const session = verifyCloudSession(token);

  if (!session) {
    redirect("/login");
  }

  return session as NonNullable<typeof session>;
}

export async function requireCloudAuthForOrg(orgSlug: string) {
  const session = await requireCloudAuth();

  if (session.orgSlug !== orgSlug) {
    redirect("/dashboard");
  }

  return session;
}

export async function requireSoulCompleted() {
  const session = await requireCloudAuth();
  const [org] = await db
    .select({ soulCompletedAt: organizations.soulCompletedAt })
    .from(organizations)
    .where(and(eq(organizations.id, session.orgId), eq(organizations.slug, session.orgSlug)))
    .limit(1);

  if (!org?.soulCompletedAt) {
    redirect("/onboarding/soul");
  }

  return session;
}
