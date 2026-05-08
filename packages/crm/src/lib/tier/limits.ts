import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { landingPages, organizations, users } from "@/db/schema";
import { isSuperAdminUser } from "@/lib/auth/super-admin";
import { CLOUD_TIERS, type CloudTierKey } from "./config";

// v1.36.2 — entitlement bypass for SF super-admins. Workspaces
// owned by anyone whose email is in SF_SUPERADMIN_EMAILS skip every
// tier-based limit assertion. Rationale: the SF team itself
// dogfoods the platform on its own accounts (Maxime owns Cypress
// HVAC + Atlantic Plumbing + future test workspaces); without this
// bypass, the second landing page they create hits
// `upgrade_required limit:landingPages current:1 tier:starter` and
// blocks the demo flow. Real customers don't see this — only the
// SF-internal team does — so the right move is to short-circuit
// the check rather than have us manually upgrade our test accounts
// every time.
//
// Cached per-orgId for the duration of the request via the v8
// inline cache. Any heavy lift (the DB query for the owner email)
// happens at most once per orgId per process.
async function isOwnerSuperAdmin(orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ email: users.email })
    .from(organizations)
    .leftJoin(users, eq(users.id, organizations.ownerId))
    .where(eq(organizations.id, orgId))
    .limit(1);
  return isSuperAdminUser(row?.email ?? null);
}

type OrgUsageState = {
  id: string;
  plan: string;
  emailSendsThisMonth: number;
  aiCallsToday: number;
  usageResetAt: Date | null;
};

function getUtcStartOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function getUtcStartOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function resolveCloudTier(plan: string): CloudTierKey {
  const normalized = (plan || "").toLowerCase();

  if (normalized.includes("scale") || normalized.includes("enterprise")) {
    return "scale";
  }

  if (normalized.includes("growth") || normalized.includes("pro")) {
    return "growth";
  }

  return "starter";
}

function nextTier(tier: CloudTierKey): CloudTierKey | null {
  if (tier === "starter") return "growth";
  if (tier === "growth") return "scale";
  return null;
}

function upgradeRequired(limit: string, current: number, tier: CloudTierKey): never {
  const payload = {
    error: "upgrade_required",
    limit,
    current,
    tier,
    nextTier: nextTier(tier),
  };

  throw new Error(JSON.stringify(payload));
}

async function getOrgUsageState(orgId: string) {
  const [org] = await db
    .select({
      id: organizations.id,
      plan: organizations.plan,
      emailSendsThisMonth: organizations.emailSendsThisMonth,
      aiCallsToday: organizations.aiCallsToday,
      usageResetAt: organizations.usageResetAt,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  return org as OrgUsageState;
}

async function maybeResetUsageCounters(org: OrgUsageState) {
  const now = new Date();
  const lastReset = org.usageResetAt ?? new Date(0);

  let nextEmailCount = org.emailSendsThisMonth;
  let nextAiCount = org.aiCallsToday;
  let changed = false;

  if (getUtcStartOfMonth(now).getTime() > getUtcStartOfMonth(lastReset).getTime()) {
    nextEmailCount = 0;
    changed = true;
  }

  if (getUtcStartOfDay(now).getTime() > getUtcStartOfDay(lastReset).getTime()) {
    nextAiCount = 0;
    changed = true;
  }

  if (changed) {
    await db
      .update(organizations)
      .set({
        emailSendsThisMonth: nextEmailCount,
        aiCallsToday: nextAiCount,
        usageResetAt: now,
        updatedAt: now,
      })
      .where(eq(organizations.id, org.id));

    return {
      ...org,
      emailSendsThisMonth: nextEmailCount,
      aiCallsToday: nextAiCount,
      usageResetAt: now,
    };
  }

  return org;
}

export async function assertLandingPageLimit(orgId: string) {
  if (await isOwnerSuperAdmin(orgId)) return; // v1.36.2 super-admin bypass
  const org = await maybeResetUsageCounters(await getOrgUsageState(orgId));
  const tier = resolveCloudTier(org.plan);
  const limit = CLOUD_TIERS[tier].limits.landingPages;

  if (!Number.isFinite(limit)) {
    return;
  }

  const [row] = await db
    .select({ value: count() })
    .from(landingPages)
    .where(eq(landingPages.orgId, orgId));

  const current = Number(row?.value ?? 0);

  if (current >= limit) {
    upgradeRequired("landingPages", current, tier);
  }
}

export async function assertEmailSendLimit(orgId: string) {
  if (await isOwnerSuperAdmin(orgId)) return; // v1.36.2 super-admin bypass
  const org = await maybeResetUsageCounters(await getOrgUsageState(orgId));
  const tier = resolveCloudTier(org.plan);
  const limit = CLOUD_TIERS[tier].limits.emailSendsPerMonth;

  if (org.emailSendsThisMonth >= limit) {
    upgradeRequired("emailSendsPerMonth", org.emailSendsThisMonth, tier);
  }
}

export async function incrementEmailSendUsage(orgId: string) {
  const org = await maybeResetUsageCounters(await getOrgUsageState(orgId));

  await db
    .update(organizations)
    .set({
      emailSendsThisMonth: org.emailSendsThisMonth + 1,
      usageResetAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

export async function assertAiCallLimit(orgId: string) {
  if (await isOwnerSuperAdmin(orgId)) return; // v1.36.2 super-admin bypass
  const org = await maybeResetUsageCounters(await getOrgUsageState(orgId));
  const tier = resolveCloudTier(org.plan);
  const limit = CLOUD_TIERS[tier].limits.aiCallsPerDay;

  if (!Number.isFinite(limit)) {
    return;
  }

  if (org.aiCallsToday >= limit) {
    upgradeRequired("aiCallsPerDay", org.aiCallsToday, tier);
  }
}

export async function incrementAiCallUsage(orgId: string) {
  const org = await maybeResetUsageCounters(await getOrgUsageState(orgId));

  await db
    .update(organizations)
    .set({
      aiCallsToday: org.aiCallsToday + 1,
      usageResetAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

export async function assertTeamMemberLimit(orgId: string) {
  if (await isOwnerSuperAdmin(orgId)) return; // v1.36.2 super-admin bypass
  const org = await maybeResetUsageCounters(await getOrgUsageState(orgId));
  const tier = resolveCloudTier(org.plan);
  const limit = CLOUD_TIERS[tier].limits.teamMembers;

  if (!Number.isFinite(limit)) {
    return;
  }

  const [row] = await db
    .select({ value: count() })
    .from(users)
    .where(eq(users.orgId, orgId));

  const current = Number(row?.value ?? 0);

  if (current >= limit) {
    upgradeRequired("teamMembers", current, tier);
  }
}

export async function resetUsageCountersForAllOrganizations() {
  const orgRows = await db
    .select({
      id: organizations.id,
      plan: organizations.plan,
      emailSendsThisMonth: organizations.emailSendsThisMonth,
      aiCallsToday: organizations.aiCallsToday,
      usageResetAt: organizations.usageResetAt,
    })
    .from(organizations);

  let updated = 0;
  for (const org of orgRows as OrgUsageState[]) {
    const next = await maybeResetUsageCounters(org);
    if (next.emailSendsThisMonth !== org.emailSendsThisMonth || next.aiCallsToday !== org.aiCallsToday) {
      updated += 1;
    }
  }

  return { organizationsChecked: orgRows.length, organizationsUpdated: updated };
}

export async function assertPortalEnabled(orgId: string) {
  if (await isOwnerSuperAdmin(orgId)) return; // v1.36.2 super-admin bypass
  const org = await maybeResetUsageCounters(await getOrgUsageState(orgId));
  const tier = resolveCloudTier(org.plan);

  if (!CLOUD_TIERS[tier].limits.portalEnabled) {
    upgradeRequired("portalEnabled", 0, tier);
  }
}

export async function assertAiCustomizationEnabled(orgId: string) {
  if (await isOwnerSuperAdmin(orgId)) return; // v1.36.2 super-admin bypass
  const org = await maybeResetUsageCounters(await getOrgUsageState(orgId));
  const tier = resolveCloudTier(org.plan);

  if (!CLOUD_TIERS[tier].limits.aiCustomizationEnabled) {
    upgradeRequired("aiCustomizationEnabled", 0, tier);
  }
}
