"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  organizations,
  proBillingAccounts,
  proProvisioningJobs,
  proTemplates,
  proWhiteLabels,
  users,
} from "@/lib/db/schema";
import { assertWritable } from "@/lib/pro/guards";
import { requireProAuth } from "@/lib/auth/actions";

type Result = { success: boolean; message: string };

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48);
}

function signEnterClientToken(payload: { orgId: string; orgSlug: string }) {
  const encoded = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 5 * 60 * 1000 }), "utf-8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-enter-client")
    .update(encoded)
    .digest("base64url");

  return `${encoded}.${signature}`;
}

export async function listAdminSnapshot() {
  await requireProAuth();

  const [orgRows, templateRows, billingRows, jobs] = await Promise.all([
    db.select().from(organizations).orderBy(desc(organizations.createdAt)).limit(25),
    db.select().from(proTemplates).orderBy(desc(proTemplates.updatedAt)).limit(25),
    db.select().from(proBillingAccounts).orderBy(desc(proBillingAccounts.updatedAt)).limit(25),
    db.select().from(proProvisioningJobs).orderBy(desc(proProvisioningJobs.createdAt)).limit(25),
  ]);

  return { orgRows, templateRows, billingRows, jobs };
}

export async function provisionClientAction(formData: FormData): Promise<Result> {
  await requireProAuth();
  assertWritable();

  const orgName = String(formData.get("orgName") ?? "").trim();
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim().toLowerCase();
  const ownerPassword = String(formData.get("ownerPassword") ?? "").trim();
  const templateKey = String(formData.get("templateKey") ?? "default").trim();

  if (!orgName || !ownerName || !ownerEmail || ownerPassword.length < 8) {
    return { success: false, message: "Provide valid org and owner details." };
  }

  const baseSlug = slugify(orgName) || "workspace";
  const slug = `${baseSlug}-${Math.floor(Math.random() * 10000)}`;

  const [org] = await db
    .insert(organizations)
    .values({
      name: orgName,
      slug,
      plan: "pro",
    })
    .returning({ id: organizations.id, slug: organizations.slug });

  if (!org) {
    return { success: false, message: "Failed to create organization." };
  }

  const passwordHash = await bcrypt.hash(ownerPassword, 12);

  await db.insert(users).values({
    orgId: org.id,
    name: ownerName,
    email: ownerEmail,
    role: "owner",
    passwordHash,
  });

  const [template] = await db.select().from(proTemplates).where(eq(proTemplates.key, templateKey)).limit(1);

  if (template) {
    const config = (template.config ?? {}) as Record<string, unknown>;
    await db
      .update(organizations)
      .set({
        settings: {
          ...(config.settings as Record<string, unknown> | undefined),
        },
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, org.id));
  }

  await db.insert(proProvisioningJobs).values({
    orgId: org.id,
    templateKey,
    status: "completed",
    result: {
      orgSlug: org.slug,
      ownerEmail,
      templateApplied: Boolean(template),
    },
  });

  return { success: true, message: `Provisioned ${orgName} (${org.slug}).` };
}

export async function enterClientAction(formData: FormData): Promise<Result> {
  await requireProAuth();

  const orgSlug = String(formData.get("orgSlug") ?? "").trim();

  if (!orgSlug) {
    return { success: false, message: "Organization slug is required." };
  }

  const [org] = await db.select({ id: organizations.id, slug: organizations.slug }).from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);

  if (!org) {
    return { success: false, message: "Organization not found." };
  }

  const token = signEnterClientToken({ orgId: org.id, orgSlug: org.slug });
  const crmUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard?enterClient=${encodeURIComponent(token)}`;

  return { success: true, message: crmUrl };
}

export async function upsertWhiteLabelAction(formData: FormData): Promise<Result> {
  await requireProAuth();
  assertWritable();

  const orgSlug = String(formData.get("orgSlug") ?? "").trim();
  const brandName = String(formData.get("brandName") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;
  const primaryColor = String(formData.get("primaryColor") ?? "").trim() || null;
  const accentColor = String(formData.get("accentColor") ?? "").trim() || null;
  const customDomain = String(formData.get("customDomain") ?? "").trim() || null;

  if (!orgSlug || !brandName) {
    return { success: false, message: "Organization slug and brand name are required." };
  }

  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);

  if (!org) {
    return { success: false, message: "Organization not found." };
  }

  const [existing] = await db.select({ id: proWhiteLabels.id }).from(proWhiteLabels).where(eq(proWhiteLabels.orgId, org.id)).limit(1);

  if (existing) {
    await db
      .update(proWhiteLabels)
      .set({ brandName, logoUrl, primaryColor, accentColor, customDomain, updatedAt: new Date() })
      .where(eq(proWhiteLabels.id, existing.id));
  } else {
    await db.insert(proWhiteLabels).values({ orgId: org.id, brandName, logoUrl, primaryColor, accentColor, customDomain });
  }

  await db
    .update(organizations)
    .set({
      settings: {
        whiteLabel: {
          brandName,
          logoUrl,
          primaryColor,
          accentColor,
          customDomain,
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, org.id));

  return { success: true, message: `Updated white-label for ${orgSlug}.` };
}

export async function saveTemplateAction(formData: FormData): Promise<Result> {
  await requireProAuth();
  assertWritable();

  const key = String(formData.get("key") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const configText = String(formData.get("config") ?? "{}").trim();

  if (!key || !name) {
    return { success: false, message: "Template key and name are required." };
  }

  let config: Record<string, unknown>;

  try {
    config = JSON.parse(configText) as Record<string, unknown>;
  } catch {
    return { success: false, message: "Template config must be valid JSON." };
  }

  const [existing] = await db.select({ id: proTemplates.id }).from(proTemplates).where(eq(proTemplates.key, key)).limit(1);

  if (existing) {
    await db
      .update(proTemplates)
      .set({ name, description, config, updatedAt: new Date() })
      .where(eq(proTemplates.id, existing.id));
  } else {
    await db.insert(proTemplates).values({ key, name, description, config });
  }

  return { success: true, message: `Template ${key} saved.` };
}

export async function updateBillingAction(formData: FormData): Promise<Result> {
  await requireProAuth();
  assertWritable();

  const orgSlug = String(formData.get("orgSlug") ?? "").trim();
  const plan = String(formData.get("plan") ?? "free").trim();
  const status = String(formData.get("status") ?? "inactive").trim();
  const customerId = String(formData.get("customerId") ?? "").trim() || null;
  const subscriptionId = String(formData.get("subscriptionId") ?? "").trim() || null;

  if (!orgSlug) {
    return { success: false, message: "Organization slug is required." };
  }

  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);

  if (!org) {
    return { success: false, message: "Organization not found." };
  }

  const [existing] = await db.select({ id: proBillingAccounts.id }).from(proBillingAccounts).where(eq(proBillingAccounts.orgId, org.id)).limit(1);

  if (existing) {
    await db
      .update(proBillingAccounts)
      .set({ plan, status, customerId, subscriptionId, updatedAt: new Date() })
      .where(eq(proBillingAccounts.id, existing.id));
  } else {
    await db.insert(proBillingAccounts).values({ orgId: org.id, plan, status, customerId, subscriptionId, provider: "stripe" });
  }

  await db.update(organizations).set({ plan, updatedAt: new Date() }).where(eq(organizations.id, org.id));

  return { success: true, message: `Billing updated for ${orgSlug}.` };
}

export async function getWhiteLabelBySlug(orgSlug: string) {
  await requireProAuth();

  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);

  if (!org) {
    return null;
  }

  const [row] = await db.select().from(proWhiteLabels).where(eq(proWhiteLabels.orgId, org.id)).limit(1);
  return row ?? null;
}

export async function getBillingBySlug(orgSlug: string) {
  await requireProAuth();

  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);

  if (!org) {
    return null;
  }

  const [row] = await db.select().from(proBillingAccounts).where(eq(proBillingAccounts.orgId, org.id)).limit(1);
  return row ?? null;
}

export async function listOrganizationsForAdmin() {
  await requireProAuth();
  return db.select().from(organizations).orderBy(desc(organizations.createdAt)).limit(100);
}

export async function listTemplatesForAdmin() {
  await requireProAuth();
  return db.select().from(proTemplates).orderBy(desc(proTemplates.updatedAt)).limit(100);
}

export async function listProvisioningJobsForAdmin() {
  await requireProAuth();
  return db.select().from(proProvisioningJobs).orderBy(desc(proProvisioningJobs.createdAt)).limit(100);
}

export async function listBillingForAdmin() {
  await requireProAuth();
  return db.select().from(proBillingAccounts).orderBy(desc(proBillingAccounts.updatedAt)).limit(100);
}

export async function listWhiteLabelForAdmin() {
  await requireProAuth();
  return db.select().from(proWhiteLabels).orderBy(desc(proWhiteLabels.updatedAt)).limit(100);
}

export async function getOrganizationDetail(orgSlug: string) {
  await requireProAuth();
  const [row] = await db.select().from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);
  return row ?? null;
}

export async function deleteTemplateByKey(key: string): Promise<Result> {
  await requireProAuth();
  assertWritable();

  await db.delete(proTemplates).where(eq(proTemplates.key, key));
  return { success: true, message: `Deleted template ${key}.` };
}

export async function deleteWhiteLabelByOrgSlug(orgSlug: string): Promise<Result> {
  await requireProAuth();
  assertWritable();

  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);

  if (!org) {
    return { success: false, message: "Organization not found." };
  }

  await db.delete(proWhiteLabels).where(eq(proWhiteLabels.orgId, org.id));
  return { success: true, message: `Deleted white-label for ${orgSlug}.` };
}

export async function setTemplateForOrg(orgSlug: string, templateKey: string): Promise<Result> {
  await requireProAuth();
  assertWritable();

  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);
  const [template] = await db.select().from(proTemplates).where(eq(proTemplates.key, templateKey)).limit(1);

  if (!org || !template) {
    return { success: false, message: "Organization or template not found." };
  }

  await db
    .update(organizations)
    .set({
      settings: {
        ...(template.config as Record<string, unknown>),
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, org.id));

  await db.insert(proProvisioningJobs).values({
    orgId: org.id,
    templateKey,
    status: "completed",
    result: {
      appliedTo: orgSlug,
      templateKey,
    },
  });

  return { success: true, message: `Applied template ${templateKey} to ${orgSlug}.` };
}
