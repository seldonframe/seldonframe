import Anthropic from "@anthropic-ai/sdk";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations, seldonUsage, users } from "@/db/schema";
import { decryptValue } from "@/lib/encryption";

export type AIClientMode = "byok" | "included" | "metered";

export type OrganizationAiIntegrations = {
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
  // April 30, 2026 — pricing migration. Map current + legacy tier ids
  // to monthly Seldon It quotas. Free + grandfathered "starter" are
  // capped low (50/mo); Growth gets 500/mo; Scale + grandfathered
  // pro/pro_3/pro_5/pro_10/pro_20 are unlimited.
  if (!planId) return 50;
  const id = planId.toLowerCase();

  if (id === "free") return 50;
  if (id === "starter" || id === "cloud_starter" || id === "cloud-starter") return 50;
  if (id === "growth") return 500;
  if (id === "cloud_pro" || id === "cloud-pro") return 500; // grandfather
  if (id === "scale") return Number.POSITIVE_INFINITY;
  if (id.startsWith("pro_") || id.startsWith("pro-")) return Number.POSITIVE_INFINITY;
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

/**
 * Lightweight key-resolution diagnostic for UI surfaces (e.g. the agent test
 * sandbox at /agents/<id>/test). Mirrors the resolution order in `getAIClient`
 * — BYOK first, then the platform env-var fallback — without instantiating an
 * Anthropic client or querying usage tables.
 *
 * Why this exists: the dashboard previously read `org.integrations.anthropic.apiKey`
 * directly and showed "No Anthropic API key configured" when no BYOK key was
 * stored, even though production turns succeeded via the platform fallback.
 * That mismatch confused operators and obscured the real failure mode
 * (`llm_credit_exhausted` when the platform key hits its quota).
 *
 * Returns:
 *   - mode: "byok" if the org has a decryptable BYOK key
 *           "platform" if no BYOK but `process.env.ANTHROPIC_API_KEY` is set
 *           "none" if no key is resolvable from any source
 *   - hasKey: convenience boolean; true if mode !== "none"
 *   - provider: "anthropic" | "openai" | null — which BYOK key resolved
 */
export type AgentKeyStatus = {
  hasKey: boolean;
  mode: "byok" | "platform" | "none";
  provider: "anthropic" | "openai" | null;
};

/**
 * Pure resolution helper. Inputs:
 *   - integrations: org.integrations JSONB (or {})
 *   - hasPlatformKey: whether process.env.ANTHROPIC_API_KEY is set
 *   - decrypt: function that turns a stored value (possibly v1.<ciphertext>)
 *              into a usable plaintext key, or "" if it fails to decrypt
 *
 * Extracted so the resolution order can be unit-tested without DB / env.
 */
export function resolveAgentKeyStatusFromInputs(
  integrations: OrganizationAiIntegrations,
  hasPlatformKey: boolean,
  decrypt: (value: string | undefined) => string,
): AgentKeyStatus {
  if (decrypt(integrations.anthropic?.apiKey)) {
    return { hasKey: true, mode: "byok", provider: "anthropic" };
  }

  if (decrypt(integrations.openai?.apiKey)) {
    return { hasKey: true, mode: "byok", provider: "openai" };
  }

  if (hasPlatformKey) {
    return { hasKey: true, mode: "platform", provider: null };
  }

  return { hasKey: false, mode: "none", provider: null };
}

export async function resolveAgentKeyStatus(orgId: string): Promise<AgentKeyStatus> {
  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  return resolveAgentKeyStatusFromInputs(
    readOrgAiIntegrations(org?.integrations),
    Boolean(process.env.ANTHROPIC_API_KEY),
    decryptIfNeeded,
  );
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
