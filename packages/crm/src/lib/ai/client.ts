import Anthropic from "@anthropic-ai/sdk";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations, seldonUsage, users } from "@/db/schema";
import { decryptValue } from "@/lib/encryption";

export type AIClientMode = "byok" | "included" | "metered";

type OrganizationAiIntegrations = {
  anthropic?: { apiKey?: string };
  openai?: { apiKey?: string };
};

export type AIClientResolution = {
  client: Anthropic | null;
  mode: AIClientMode;
  provider: "anthropic" | "openai" | "platform";
  includedUsed: number;
  includedLimit: number;
  planId: string | null;
};

function readOrgAiIntegrations(raw: unknown): OrganizationAiIntegrations {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  return raw as OrganizationAiIntegrations;
}

function decryptIfNeeded(value: string | undefined) {
  if (!value) {
    return "";
  }

  if (!value.startsWith("v1.")) {
    return value;
  }

  try {
    return decryptValue(value);
  } catch {
    return "";
  }
}

function getIncludedSeldonLimit(planId: string | null) {
  if (!planId || planId === "free" || planId === "starter") {
    return 50;
  }

  if (planId === "cloud_pro" || planId === "cloud-pro") {
    return 500;
  }

  if (planId.startsWith("pro_") || planId.startsWith("pro-")) {
    return Number.POSITIVE_INFINITY;
  }

  return 50;
}

function getCurrentMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

async function getMonthlyIncludedUsage(orgId: string) {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(seldonUsage)
    .where(and(eq(seldonUsage.orgId, orgId), eq(seldonUsage.mode, "included"), gte(seldonUsage.createdAt, getCurrentMonthStart())));

  return Number(row?.value ?? 0);
}

async function resolvePlanIdForOrg(params: { orgId: string; userId?: string | null }) {
  if (params.userId) {
    const [userRow] = await db
      .select({ planId: users.planId })
      .from(users)
      .where(and(eq(users.id, params.userId), eq(users.orgId, params.orgId)))
      .limit(1);

    if (userRow) {
      return userRow.planId ?? null;
    }
  }

  const [ownerRow] = await db
    .select({ planId: users.planId })
    .from(users)
    .where(and(eq(users.orgId, params.orgId), eq(users.role, "owner")))
    .limit(1);

  return ownerRow?.planId ?? null;
}

export async function getAIClient(params: { orgId: string; userId?: string | null }): Promise<AIClientResolution> {
  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, params.orgId))
    .limit(1);

  const integrations = readOrgAiIntegrations(org?.integrations);
  const anthropicByokKey = decryptIfNeeded(integrations.anthropic?.apiKey);

  if (anthropicByokKey) {
    return {
      client: new Anthropic({ apiKey: anthropicByokKey }),
      mode: "byok",
      provider: "anthropic",
      includedUsed: 0,
      includedLimit: Number.POSITIVE_INFINITY,
      planId: await resolvePlanIdForOrg(params),
    };
  }

  const openAiByokKey = decryptIfNeeded(integrations.openai?.apiKey);

  if (openAiByokKey) {
    return {
      client: null,
      mode: "byok",
      provider: "openai",
      includedUsed: 0,
      includedLimit: Number.POSITIVE_INFINITY,
      planId: await resolvePlanIdForOrg(params),
    };
  }

  const platformApiKey = process.env.ANTHROPIC_API_KEY;
  const planId = await resolvePlanIdForOrg(params);
  const includedLimit = getIncludedSeldonLimit(planId);
  const includedUsed = await getMonthlyIncludedUsage(params.orgId);
  const mode: AIClientMode = Number.isFinite(includedLimit) && includedUsed >= includedLimit ? "metered" : "included";

  return {
    client: platformApiKey ? new Anthropic({ apiKey: platformApiKey }) : null,
    mode,
    provider: "platform",
    includedUsed,
    includedLimit,
    planId,
  };
}

export type SeldonUsageStats = {
  includedUsed: number;
  includedLimit: number;
  meteredUsed: number;
  byokUsed: number;
  totalThisMonth: number;
  mode: AIClientMode;
};

export async function getSeldonUsageStats(params: { orgId: string; userId?: string | null }): Promise<SeldonUsageStats> {
  const monthStart = getCurrentMonthStart();

  const rows = await db
    .select({
      mode: seldonUsage.mode,
      count: sql<number>`count(*)::int`,
    })
    .from(seldonUsage)
    .where(and(eq(seldonUsage.orgId, params.orgId), gte(seldonUsage.createdAt, monthStart)))
    .groupBy(seldonUsage.mode);

  let includedUsed = 0;
  let meteredUsed = 0;
  let byokUsed = 0;

  for (const row of rows) {
    const count = Number(row.count ?? 0);
    if (row.mode === "included") includedUsed = count;
    else if (row.mode === "metered") meteredUsed = count;
    else if (row.mode === "byok") byokUsed = count;
  }

  const planId = await resolvePlanIdForOrg(params);
  const includedLimit = getIncludedSeldonLimit(planId);
  const resolution = await getAIClient(params);

  return {
    includedUsed,
    includedLimit,
    meteredUsed,
    byokUsed,
    totalThisMonth: includedUsed + meteredUsed + byokUsed,
    mode: resolution.mode,
  };
}

export async function recordSeldonUsage(params: {
  orgId: string;
  userId: string;
  blockId?: string | null;
  mode: AIClientMode;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCost?: string;
  billedAmount?: string;
}) {
  await db.insert(seldonUsage).values({
    orgId: params.orgId,
    userId: params.userId,
    blockId: params.blockId ?? null,
    mode: params.mode,
    model: params.model ?? null,
    inputTokens: params.inputTokens ?? null,
    outputTokens: params.outputTokens ?? null,
    estimatedCost: params.estimatedCost ?? "0",
    billedAmount: params.billedAmount ?? "0",
  });
}

export function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new Anthropic({ apiKey });
}
