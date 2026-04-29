"use server";

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, or, sql } from "drizzle-orm";
import Stripe from "stripe";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { contacts, orgMembers, organizations, users } from "@/db/schema";
import { getOrgFeatures } from "@/lib/billing/features";
import { assertWritable } from "@/lib/demo/server";
import { getPlan } from "@/lib/billing/plans";
import { WORKSPACE_ADDON_MONTHLY_PRICE_ID } from "@/lib/billing/price-ids";
import { getOrgSubscription } from "@/lib/billing/subscription";
import { installSoul, type FrameworkConfig } from "@/lib/soul/install";
import { seedInitialBlocks } from "@/lib/soul-compiler/blocks";
import type { SoulV4 } from "@/lib/soul-compiler/schema";

const FREE_WORKSPACE_ALLOWANCE = 1;

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

  return getBillingUserById(session.user.id);
}

async function getBillingUserById(userId: string) {
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const [dbUser] = await db
    .select({
      id: users.id,
      orgId: users.orgId,
      planId: users.planId,
      stripeSubscriptionId: users.stripeSubscriptionId,
      subscriptionStatus: users.subscriptionStatus,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!dbUser) {
    throw new Error("Unauthorized");
  }

  return dbUser;
}

function hasActiveWorkspaceSubscription(status: string | null | undefined) {
  return status === "active" || status === "trialing";
}

// NOTE: this string is also pattern-matched in two callers:
//   - packages/crm/src/app/api/v1/workspace/create/route.ts (quota error detection)
//   - packages/crm/src/app/orgs/new/page.tsx (UI quota detection)
// Both match on the durable substring "additional workspace requires a paid tier"
// (introduced in claude/pre-launch-polish — was previously coupled to a $9
// dollar amount that no longer matches the live pricing). Keep in sync if you
// change this message.
const WORKSPACE_UPGRADE_REQUIRED_MESSAGE =
  "You've used your free workspace. Each additional workspace requires a paid tier (Starter $49/mo, Operator $99/mo, or Agency $149/mo) and unlocks more Brain intelligence for your OS.";

async function getOwnedWorkspaceCount(userId: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(organizations)
    .where(eq(organizations.ownerId, userId));

  return Number(result?.count ?? 0);
}

async function loadWorkspaceAddonSubscription(
  user: Awaited<ReturnType<typeof getBillingUserById>>,
  orgSubscription?: Awaited<ReturnType<typeof getOrgSubscription>>
) {
  const stripeSubscriptionId = user.stripeSubscriptionId ?? orgSubscription?.stripeSubscriptionId ?? null;
  const billingStatus = user.subscriptionStatus ?? orgSubscription?.status ?? null;

  if (!stripeSubscriptionId || !hasActiveWorkspaceSubscription(billingStatus)) {
    return {
      stripeSubscriptionId,
      active: false,
      quantity: 0,
      itemId: null as string | null,
    };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return {
      stripeSubscriptionId,
      active: true,
      quantity: 1,
      itemId: null as string | null,
    };
  }

  const stripe = new Stripe(secretKey, {
    apiVersion: "2025-08-27.basil",
  });

  try {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    if (!hasActiveWorkspaceSubscription(subscription.status)) {
      return {
        stripeSubscriptionId,
        active: false,
        quantity: 0,
        itemId: null as string | null,
      };
    }

    const workspaceItem = subscription.items.data.find((item) => item.price?.id === WORKSPACE_ADDON_MONTHLY_PRICE_ID) ?? null;

    return {
      stripeSubscriptionId,
      active: Boolean(workspaceItem),
      quantity: workspaceItem?.quantity ?? 0,
      itemId: workspaceItem?.id ?? null,
    };
  } catch {
    return {
      stripeSubscriptionId,
      active: true,
      quantity: 1,
      itemId: null as string | null,
    };
  }
}

async function ensureWorkspaceCreationBillingForUser(user: Awaited<ReturnType<typeof getBillingUserById>>, existingWorkspaces: number) {
  if (existingWorkspaces < FREE_WORKSPACE_ALLOWANCE) {
    return;
  }

  const orgSubscription = await getOrgSubscription(user.orgId);
  const addonSubscription = await loadWorkspaceAddonSubscription(user, orgSubscription);

  if (!addonSubscription.active || !addonSubscription.stripeSubscriptionId) {
    throw new Error(WORKSPACE_UPGRADE_REQUIRED_MESSAGE);
  }

  const requiredAdditionalWorkspaces = Math.max(1, existingWorkspaces + 1 - FREE_WORKSPACE_ALLOWANCE);
  if (addonSubscription.quantity >= requiredAdditionalWorkspaces) {
    return;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey || !addonSubscription.itemId) {
    throw new Error(WORKSPACE_UPGRADE_REQUIRED_MESSAGE);
  }

  const stripe = new Stripe(secretKey, {
    apiVersion: "2025-08-27.basil",
  });

  const subscription = await stripe.subscriptions.retrieve(addonSubscription.stripeSubscriptionId);
  if (!hasActiveWorkspaceSubscription(subscription.status)) {
    throw new Error(WORKSPACE_UPGRADE_REQUIRED_MESSAGE);
  }

  const item = subscription.items.data.find((entry) => entry.id === addonSubscription.itemId && entry.price?.id === WORKSPACE_ADDON_MONTHLY_PRICE_ID);
  if (!item?.id) {
    throw new Error(WORKSPACE_UPGRADE_REQUIRED_MESSAGE);
  }

  const targetQuantity = requiredAdditionalWorkspaces;
  const currentQuantity = item.quantity ?? 1;

  if (currentQuantity !== targetQuantity) {
    await stripe.subscriptionItems.update(item.id, {
      quantity: targetQuantity,
      proration_behavior: "create_prorations",
    });
  }
}

function buildMembershipOrgCondition(membershipOrgIds: string[]) {
  if (membershipOrgIds.length === 0) {
    return sql`false`;
  }

  if (membershipOrgIds.length === 1) {
    return eq(organizations.id, membershipOrgIds[0]);
  }

  return or(...membershipOrgIds.map((orgId) => eq(organizations.id, orgId))) ?? sql`false`;
}

async function logOrgListDiag(tag: string, membershipIds: unknown, extra: Record<string, unknown>) {
  let requestPath = "unknown";
  let host = "unknown";

  try {
    const headerStore = await headers();
    requestPath = headerStore.get("x-pathname") ?? headerStore.get("next-url") ?? "unknown";
    host = headerStore.get("host") ?? "unknown";
  } catch {
    requestPath = "unknown";
    host = "unknown";
  }

  console.error("[ORG-LIST-DIAG]", {
    tag,
    requestPath,
    host,
    pid: process.pid,
    membershipIdsRaw: membershipIds,
    isArray: Array.isArray(membershipIds),
    typeofValue: typeof membershipIds,
    length: Array.isArray(membershipIds) ? membershipIds.length : null,
    ...extra,
  });
}

export async function getWorkspaceLimitStatus() {
  const user = await requireBillingUser();
  const plan = getPlan(user.planId ?? "");
  const orgSubscription = await getOrgSubscription(user.orgId);
  const orgFeatures = getOrgFeatures(orgSubscription.tier ?? "free");
  const ownedWorkspaceCount = await getOwnedWorkspaceCount(user.id);
  const addonSubscription = await loadWorkspaceAddonSubscription(user, orgSubscription);
  const maxOrgs = FREE_WORKSPACE_ALLOWANCE + (addonSubscription.active ? addonSubscription.quantity : 0);
  const canCreate = ownedWorkspaceCount < maxOrgs;

  return {
    plan,
    tier: orgSubscription.tier ?? "free",
    features: orgFeatures,
    currentOrgs: ownedWorkspaceCount,
    maxOrgs,
    canCreate,
  };
}

export async function getWorkspaceLimitStatusForUser(userId: string) {
  const user = await getBillingUserById(userId);
  const plan = getPlan(user.planId ?? "");
  const orgSubscription = await getOrgSubscription(user.orgId);
  const orgFeatures = getOrgFeatures(orgSubscription.tier ?? "free");
  const ownedWorkspaceCount = await getOwnedWorkspaceCount(user.id);
  const addonSubscription = await loadWorkspaceAddonSubscription(user, orgSubscription);
  const maxOrgs = FREE_WORKSPACE_ALLOWANCE + (addonSubscription.active ? addonSubscription.quantity : 0);
  const canCreate = ownedWorkspaceCount < maxOrgs;

  return {
    plan,
    tier: orgSubscription.tier ?? "free",
    features: orgFeatures,
    currentOrgs: ownedWorkspaceCount,
    maxOrgs,
    canCreate,
  };
}

export async function listManagedOrganizations(userId?: string) {
  const user = userId ? await getBillingUserById(userId) : await requireBillingUser();

  const membershipRows = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, user.id));

  const membershipOrgIds = membershipRows.map((row) => row.orgId);

  await logOrgListDiag("listManagedOrganizations", membershipOrgIds, {
    userId: user.id,
    userOrgId: user.orgId,
  });

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
    .where(
      or(
        eq(organizations.parentUserId, user.id),
        eq(organizations.ownerId, user.id),
        eq(organizations.id, user.orgId),
        buildMembershipOrgCondition(membershipOrgIds)
      )
    );

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

export async function listManagedOrganizationsForUser(userId: string) {
  const user = await getBillingUserById(userId);

  const membershipRows = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, user.id));

  const membershipOrgIds = membershipRows.map((row) => row.orgId);

  await logOrgListDiag("listManagedOrganizationsForUser", membershipOrgIds, {
    userId: user.id,
    userOrgId: user.orgId,
    inputUserId: userId,
  });

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
    .where(
      or(
        eq(organizations.parentUserId, user.id),
        eq(organizations.ownerId, user.id),
        eq(organizations.id, user.orgId),
        buildMembershipOrgCondition(membershipOrgIds)
      )
    );

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

  const [membership] = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, user.id)))
    .limit(1);

  if (membership?.orgId) {
    const cookieStore = await cookies();
    cookieStore.set("sf_active_org_id", membership.orgId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });

    redirect(redirectTo.startsWith("/") ? redirectTo : "/dashboard");
  }

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

  const limitStatus = await getWorkspaceLimitStatusForUser(user.id);
  if (limitStatus.tier === "free") {
    throw new Error("Pro plan required to create managed organizations");
  }

  if (!limitStatus.canCreate) {
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

  await db.insert(orgMembers).values({
    orgId: org.id,
    userId: user.id,
    role: "owner",
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

type CreateWorkspaceFromSetupInput = {
  businessName: string;
  frameworkId: string;
  generatedFramework?: FrameworkConfig | null;
  location?: string;
  websiteUrl?: string;
  journeyDescription?: string;
  enabledAutomations?: string[];
};

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function mapSoulToFrameworkConfig(soul: SoulV4): FrameworkConfig {
  const bookingConfig = soul.booking_config;

  const bookingTypes = bookingConfig
    ? bookingConfig.services.map((service) => ({
        name: service.name,
        slug: toSlug(service.name) || `service-${randomUUID().slice(0, 8)}`,
        durationMinutes: bookingConfig.default_duration_minutes,
        price: service.price,
        description: service.description,
        bufferBefore: bookingConfig.buffer_minutes,
        bufferAfter: bookingConfig.buffer_minutes,
        maxPerDay: 8,
      }))
    : [];

  const landingHeadline = soul.tagline.trim() || `${soul.business_name} in one place`;

  return {
    id: soul.base_framework,
    name: soul.business_name,
    description: soul.soul_description,
    icon: soul.audience_type === "product" ? "rocket" : "sparkles",
    defaultBusinessName: soul.business_name,
    contactLabel: { singular: "Contact", plural: "Contacts" },
    dealLabel: { singular: "Deal", plural: "Deals" },
    activityLabel: { singular: "Activity", plural: "Activities" },
    voice: {
      tone: soul.audience_type === "product" ? "clear, concise, technical" : "warm, direct, supportive",
      personality: soul.tagline,
    },
    pipeline: soul.pipeline_stages.map((stage, index) => ({
      name: stage.name,
      order: index + 1,
    })),
    bookingTypes,
    emailTemplates: [
      {
        name: "Welcome",
        tag: "welcome",
        subject: `Welcome to ${soul.business_name}`,
        body: `Hi {{firstName}},\n\nWelcome to ${soul.business_name}. ${soul.tagline}`,
      },
      {
        name: "Follow-up",
        tag: "follow_up",
        subject: `Quick follow-up from ${soul.business_name}`,
        body: "Hi {{firstName}},\n\nChecking in to see how we can help.",
      },
    ],
    intakeForm: {
      name: "Client Intake",
      slug: "client-intake",
      fields: soul.intake_form_fields.map((field) => ({
        label: field.label,
        type: field.type,
        required: field.required,
        options: field.options,
      })),
    },
    landingPage: {
      headline: landingHeadline,
      subhead: soul.soul_description,
      cta: soul.audience_type === "product" ? "Join now" : "Book now",
    },
  };
}

type CreateWorkspaceFromSoulInput = {
  soul: SoulV4;
  sourceText?: string;
  pagesUsed?: string[];
};

type CreateWorkspaceFromSoulOptions = {
  userId?: string;
};

export async function createWorkspaceFromSoulAction(input: CreateWorkspaceFromSoulInput, options?: CreateWorkspaceFromSoulOptions) {
  assertWritable();

  const user = options?.userId ? await getBillingUserById(options.userId) : await requireBillingUser();
  const soul = input.soul;
  const businessName = String(soul.business_name ?? "").trim();

  if (!businessName) {
    throw new Error("Business name is required");
  }

  const existingWorkspaces = await getOwnedWorkspaceCount(user.id);
  await ensureWorkspaceCreationBillingForUser(user, existingWorkspaces);

  const baseSlug = slugify(businessName) || `workspace-${randomUUID().slice(0, 8)}`;
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
      settings: {
        soulCompiler: {
          sourceType: (input.pagesUsed?.length ?? 0) > 0 ? "url" : "description",
          pagesUsed: input.pagesUsed ?? [],
          generatedAt: new Date().toISOString(),
        },
      },
    })
    .returning({ id: organizations.id, slug: organizations.slug, name: organizations.name });

  if (!org) {
    throw new Error("Could not create workspace");
  }

  console.info(`Workspace record created successfully with id: ${org.id}, slug: ${org.slug}`);

  await db.insert(orgMembers).values({
    orgId: org.id,
    userId: user.id,
    role: "owner",
  });

  const ownerName = businessName.split(" ")[0] || "";
  const framework = mapSoulToFrameworkConfig(soul);

  await installSoul({
    orgId: org.id,
    frameworkId: framework.id,
    framework,
    answers: {
      ownerName,
      ownerFullName: ownerName,
      businessName,
      journeyDescription: String(input.sourceText ?? ""),
      enabledAutomations: [],
    },
    markCompleted: true,
  });

  await seedInitialBlocks(org.id, soul.base_framework);

  const cookieStore = await cookies();
  cookieStore.set("sf_active_org_id", org.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  return {
    orgId: org.id,
    slug: org.slug,
    name: org.name,
  };
}

export async function createWorkspaceFromSetupAction(input: CreateWorkspaceFromSetupInput) {
  assertWritable();

  const user = await requireBillingUser();
  const businessName = String(input.businessName ?? "").trim();
  const frameworkId = String(input.frameworkId ?? "").trim();
  const generatedFramework = input.generatedFramework ?? null;

  if (!businessName) {
    throw new Error("Business name is required");
  }

  if (!frameworkId) {
    throw new Error("Framework is required");
  }

  const existingWorkspaces = await getOwnedWorkspaceCount(user.id);
  await ensureWorkspaceCreationBillingForUser(user, existingWorkspaces);

  const baseSlug = slugify(businessName) || `workspace-${randomUUID().slice(0, 8)}`;
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
    throw new Error("Could not create workspace");
  }

  await db.insert(orgMembers).values({
    orgId: org.id,
    userId: user.id,
    role: "owner",
  });

  const ownerName = businessName.split(" ")[0] || "";

  await installSoul({
    orgId: org.id,
    frameworkId,
    framework: generatedFramework ?? undefined,
    answers: {
      ownerName,
      ownerFullName: ownerName,
      businessName,
      location: String(input.location ?? ""),
      websiteUrl: String(input.websiteUrl ?? ""),
      journeyDescription: String(input.journeyDescription ?? ""),
      enabledAutomations: Array.isArray(input.enabledAutomations) ? input.enabledAutomations : [],
    },
    markCompleted: true,
  });

  const cookieStore = await cookies();
  cookieStore.set("sf_active_org_id", org.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  return { orgId: org.id };
}

// ─── P0-2: claim-and-upgrade for guest (admin-token) workspaces ────

export type ClaimWorkspaceResult =
  | { ok: true; userId: string; userExisted: boolean }
  | { ok: false; reason: "email_taken" | "workspace_already_claimed" | "workspace_not_found" };

/**
 * Convert a guest (admin-token) workspace into a real account-backed
 * workspace, ahead of a Stripe upgrade.
 *
 * Operators created their workspace via MCP (no signup), got an admin
 * URL with a `wst_…` bearer cookie, and now want to pay. Stripe Checkout
 * needs a real user record (`users.id` foreign key on subscriptions).
 *
 * Flow:
 *   - Verify the org exists + has `ownerId IS NULL` (true for all
 *     `createAnonymousWorkspace` rows).
 *   - If `users.email` is already taken → return `email_taken` so the
 *     caller can ask the operator to sign in instead. Re-using a
 *     stranger's user record would silently merge two unrelated
 *     workspaces into one billing customer.
 *   - Insert a fresh user with `orgId = workspaceId` + the supplied
 *     email + name.
 *   - Set `organizations.ownerId = newUser.id` so dashboard layout +
 *     billing flows recognize the operator as a real account holder.
 *
 * The admin-token cookie keeps working until it expires — operators
 * see no friction during the upgrade. Once they're paying, the next
 * sign-up step (set password / verify email) lands them in a normal
 * NextAuth session and the bearer cookie can be retired.
 */
export async function claimAnonymousWorkspaceForEmail(
  workspaceId: string,
  email: string,
  name?: string
): Promise<ClaimWorkspaceResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !workspaceId) {
    return { ok: false, reason: "workspace_not_found" };
  }

  const [org] = await db
    .select({ id: organizations.id, ownerId: organizations.ownerId, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);

  if (!org) return { ok: false, reason: "workspace_not_found" };
  if (org.ownerId) return { ok: false, reason: "workspace_already_claimed" };

  const [existingUser] = await db
    .select({ id: users.id, orgId: users.orgId })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingUser) {
    // Refuse to silently attach the workspace to an existing account —
    // that's a confused-deputy attack vector if a stranger types a
    // real customer's email into the upgrade form.
    return { ok: false, reason: "email_taken" };
  }

  const displayName = name?.trim() || normalizedEmail.split("@")[0] || "Workspace owner";

  const [createdUser] = await db
    .insert(users)
    .values({
      orgId: workspaceId,
      email: normalizedEmail,
      name: displayName,
      role: "owner",
      // No password yet — operator can set one later via account-recovery
      // flow. Email-verification timestamp stays null.
    })
    .returning({ id: users.id });

  if (!createdUser) {
    return { ok: false, reason: "workspace_not_found" };
  }

  await db
    .update(organizations)
    .set({ ownerId: createdUser.id, updatedAt: new Date() })
    .where(eq(organizations.id, workspaceId));

  return { ok: true, userId: createdUser.id, userExisted: false };
}
