"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organizations, seldonSessions, stripeConnections } from "@/db/schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { canSeldonIt, resolvePlanFromPlanId } from "@/lib/billing/entitlements";
import { assertWritable } from "@/lib/demo/server";
import { getAIClient, getSeldonUsageStats, recordSeldonUsage } from "@/lib/ai/client";
import { writeEvent } from "@/lib/brain";
import { addDomain, checkDomainStatus, hasVercelDomainEnv } from "@/lib/domains/vercel-domains";
import { createLandingPageForSeldonAction } from "@/lib/landing/actions";
import { generatePuckPage } from "@/lib/puck/generate-page";
import { querySoulWiki } from "@/lib/soul-wiki/query";
import { fileSeldonOutputToSoul } from "@/lib/soul-wiki/output-filing";
import { installBlock, updateBlock, type InstallResult, type SeldonBlockType, type UpdateResult } from "@/lib/seldon/block-installer";
import { getPortalSessionForOrg } from "@/lib/portal/auth";
import type { OrgSoul } from "@/lib/soul/types";
import type { OrgTheme } from "@/lib/theme/types";
import type { OrganizationIntegrations } from "@/db/schema";
import type { SeldonSessionMessage } from "@/db/schema/seldon-sessions";

export type SeldonRunResult = {
  entityId?: string;
  blockType?: "form" | "email" | "booking" | "page" | "automation";
  blockId: string;
  blockName: string;
  blockMd: string;
  description?: string;
  summary: string;
  status?: "live" | "draft" | "needs-integration" | "error";
  integrationNote?: string;
  changes?: string;
  fromInventory: boolean;
  installMode: "instant" | "review";
  openPath: string;
  savePath: string;
  publicUrl?: string | null;
  adminUrl?: string;
  editUrl?: string;
};

export type SeldonRunState = {
  ok: boolean;
  action?: "create" | "plan" | "update" | "blueprint";
  error?: string;
  message?: string;
  sessionId?: string;
  suggestions?: string[];
  plan?: {
    title: string;
    totalSteps: number;
    steps: Array<{
      stepNumber: number;
      description: string;
      blockType: "form" | "email" | "booking" | "page" | "automation";
    }>;
  } | null;
  blueprint?: Record<string, unknown>;
  results?: SeldonRunResult[];
};

export type SeldonSessionItem = {
  id: string;
  title: string;
  createdAt: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    createdEntities?: Array<{
      id: string;
      blockType: "form" | "email" | "booking" | "page" | "automation";
      name: string;
      publicUrl: string | null;
      adminUrl: string;
    }>;
    results?: SeldonRunResult[];
  }>;
};

export type SeldonSavedBlock = {
  id: string;
  name: string;
  blockMd: string;
  createdAt: string;
};

function readIntegrations(raw: unknown): OrganizationIntegrations {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  return raw as OrganizationIntegrations;
}

function toSeldonErrorMessage(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Unknown error";
  const normalized = message.toLowerCase();

  if (normalized.includes("anthropic") || normalized.includes("api key") || normalized.includes("authentication")) {
    return "Seldon It could not reach Anthropic. Verify ANTHROPIC_API_KEY and model access.";
  }

  if (normalized.includes("model") || normalized.includes("not found")) {
    return "Seldon It model configuration failed. Check SELDON_MODEL (expected claude-sonnet-4-20250514).";
  }

  if (
    normalized.includes("fetch failed") ||
    normalized.includes("econnreset") ||
    normalized.includes("etimedout") ||
    normalized.includes("network")
  ) {
    return "Seldon It could not reach upstream services. Please retry in a moment.";
  }

  if (normalized.includes("rate") || normalized.includes("quota") || normalized.includes("429")) {
    return "Seldon It is rate-limited right now. Please retry shortly.";
  }

  if (normalized.includes("unauthorized")) {
    return "Unauthorized. Please sign in again.";
  }

  return `Seldon It failed: ${message}`;
}

function parseTierLimitError(message: string) {
  try {
    const parsed = JSON.parse(message) as {
      error?: string;
      limit?: string;
      current?: number;
      tier?: string;
      nextTier?: string | null;
    };

    if (parsed.error !== "upgrade_required") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function buildUpgradeGuidance(limit: string | undefined, tier: string | undefined, nextTier: string | null | undefined) {
  const limitLabel = limit === "landingPages" ? "landing pages" : "current plan limit";
  const tierLabel = tier ? tier[0].toUpperCase() + tier.slice(1) : "Current";
  const nextTierLabel = nextTier ? nextTier[0].toUpperCase() + nextTier.slice(1) : "a higher plan";

  return {
    description: `Upgrade required to continue: ${tierLabel} plan reached ${limitLabel}.`,
    summary: `- Upgrade required: ${tierLabel} reached ${limitLabel}.`,
    integrationNote: `Upgrade to ${nextTierLabel} in Settings → Billing to continue this step.`,
  };
}

type SeldonPlan = {
  title: string;
  totalSteps: number;
  steps: Array<{
    stepNumber: number;
    description: string;
    blockType: SeldonBlockType;
  }>;
};

type SeldonCreateItem = {
  blockType: SeldonBlockType;
  name?: string;
  description?: string;
  params?: Record<string, unknown>;
};

type SeldonUpdateItem = {
  entityId?: string;
  blockType: SeldonBlockType;
  name?: string;
  changeDescription?: string;
  params?: Record<string, unknown>;
};

type ParsedSeldonResponse = {
  action?: "create" | "plan" | "update" | "blueprint";
  message?: string;
  suggestions?: string[];
  plan?: SeldonPlan;
  creates?: SeldonCreateItem[];
  updates?: SeldonUpdateItem[];
  blueprint?: Record<string, unknown>;
};

type SessionEntity = {
  id: string;
  blockType: SeldonBlockType;
  name: string;
  publicUrl: string | null;
  adminUrl: string;
};

function extractText(content: Array<{ type: string; text?: string }>) {
  return content
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("\n")
    .trim();
}

function parseJsonResponse(raw: string): ParsedSeldonResponse | null {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned) as ParsedSeldonResponse;
  } catch {
    return null;
  }
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildPuckPrompt(item: SeldonCreateItem): string {
  if (item.blockType === "form") {
    const fields = Array.isArray(item.params?.fields) ? (item.params?.fields as Array<Record<string, unknown>>) : [];
    const fieldText = fields
      .map((field) => `${String(field.label ?? field.fieldName ?? "Field")} (${String(field.type ?? "text")})`)
      .join(", ");
    const hasScoreSelect = fields.some((field) => String(field.type ?? "") === "score_select");

    return [
      `Create a conversion-focused form page titled \"${item.name ?? "Lead Form"}\".`,
      item.description ? String(item.description) : "",
      "Use a Hero section at the top with the title and short subheadline.",
      `Then add a FormContainer with fields: ${fieldText || "Name (text), Email (email), Message (textarea)"}.`,
      hasScoreSelect ? "This is a scored quiz. Use ScoreSelect for scored fields and preserve points metadata." : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (item.blockType === "page") {
    return [
      `Create a polished landing page titled \"${item.name ?? "Landing Page"}\".`,
      item.description ? String(item.description) : "",
      "Use a strong Hero section, service/value sections, social proof, and a clear CTA.",
      "Compose using available Puck components only.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return `Create a page for: ${item.name ?? "Untitled"}. ${item.description ?? ""}`;
}

function toAction(blockType: SeldonBlockType, data: InstallResult | UpdateResult): SeldonRunResult {
  const summaryLine = data.description?.trim() ? `- ${data.description.trim()}` : "- Generated by Seldon";

  return {
    entityId: data.entityId,
    blockType,
    blockId: `${blockType}-${data.entityId}`,
    blockName: data.name,
    blockMd: "# BLOCK.md\n\nGenerated via Seldon composable flow.",
    description: data.description,
    summary: summaryLine,
    status: data.status,
    integrationNote: "integrationNote" in data ? data.integrationNote : undefined,
    changes: "changes" in data ? data.changes : undefined,
    fromInventory: false,
    installMode: "instant",
    openPath: data.adminUrl,
    savePath: "/seldon",
    publicUrl: data.publicUrl,
    adminUrl: data.adminUrl,
    editUrl: data.editUrl,
  };
}

function collectCreatedEntities(messages: SeldonSessionMessage[]) {
  const entityMap = new Map<string, SessionEntity>();

  for (const message of messages) {
    if (!Array.isArray(message.createdEntities)) {
      continue;
    }

    for (const entity of message.createdEntities) {
      entityMap.set(entity.id, entity);
    }
  }

  return Array.from(entityMap.values());
}

function getActivePlan(messages: SeldonSessionMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const plan = messages[index]?.plan;
    if (plan) {
      return plan;
    }
  }

  return null;
}

function buildSessionContextMessage(createdEntities: SessionEntity[], activePlan: SeldonPlan | null) {
  if (createdEntities.length === 0 && !activePlan) {
    return "";
  }

  let output = "";

  if (createdEntities.length > 0) {
    output += "\n\nENTITIES ALREADY CREATED IN THIS SESSION:\n";
    for (const entity of createdEntities) {
      output += `- ${entity.blockType}: \"${entity.name}\" (id: ${entity.id}, url: ${entity.publicUrl || "N/A"})\n`;
    }
  }

  if (activePlan) {
    output += `\nACTIVE PLAN: \"${activePlan.title}\" - ${activePlan.totalSteps} total steps\n`;
    output += "Remaining steps:\n";
    const completed = createdEntities.length;
    for (const step of activePlan.steps) {
      if (step.stepNumber > completed) {
        output += `- Step ${step.stepNumber}: ${step.description} (${step.blockType})\n`;
      }
    }
  }

  return output;
}

function normalizePlan(raw: ParsedSeldonResponse["plan"]): SeldonPlan | null {
  if (!raw || !Array.isArray(raw.steps) || !raw.title || !raw.totalSteps) {
    return null;
  }

  const steps = raw.steps
    .filter((step): step is SeldonPlan["steps"][number] => Boolean(step?.description && step?.blockType))
    .slice(0, 5)
    .map((step, index) => ({
      stepNumber: Number(step.stepNumber || index + 1),
      description: step.description,
      blockType: step.blockType,
    }));

  if (steps.length === 0) {
    return null;
  }

  return {
    title: raw.title,
    totalSteps: Number(raw.totalSteps || steps.length),
    steps,
  };
}

function extractCustomDomainIntent(input: string) {
  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const hasDomainSignal = /(custom\s+domain|\bdomain\b|\bdns\b|\bcname\b|\ba\s*record\b|\bssl\b|\bvercel\b)/.test(normalized);
  const hasActionSignal = /(\buse\b|\bconnect\b|\bset\b|\bpoint\b|\bmap\b|\battach\b)/.test(normalized);
  if (!hasDomainSignal || !hasActionSignal) {
    return null;
  }

  const matches = normalized.match(/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  const candidate = matches[0]?.replace(/[.,!?;:]+$/, "") ?? "";
  const validDomain = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(candidate);
  return validDomain ? candidate : null;
}

function getDomainErrorMessage(payload: Record<string, unknown>) {
  const error = payload.error;
  if (error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string") {
    return String((error as Record<string, unknown>).message);
  }

  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }

  return "Failed to configure custom domain. Please retry in Settings -> Domain.";
}

function resolveDomainVerified(payload: Record<string, unknown>) {
  const config = payload.config;
  if (config && typeof config === "object" && typeof (config as Record<string, unknown>).misconfigured === "boolean") {
    return !(config as Record<string, unknown>).misconfigured;
  }

  if (typeof payload.verified === "boolean") {
    return payload.verified;
  }

  const verification = Array.isArray(payload.verification)
    ? (payload.verification as Array<Record<string, unknown>>)
    : [];

  return verification.some((item) => String(item?.status ?? "").toLowerCase() === "valid");
}

function resolveDomainStatus(payload: Record<string, unknown>) {
  const config = payload.config;
  if (config && typeof config === "object") {
    const configRecord = config as Record<string, unknown>;
    if (typeof configRecord.misconfigured === "boolean") {
      return configRecord.misconfigured ? "DNS misconfigured" : "DNS configured";
    }
  }

  const verification = Array.isArray(payload.verification)
    ? (payload.verification as Array<Record<string, unknown>>)
    : [];

  const firstStatus = verification
    .map((item) => String(item?.status ?? "").trim())
    .find((status) => status.length > 0);

  return firstStatus || "Pending DNS verification";
}

async function connectCustomDomainForSeldon(orgId: string, inputDomain: string) {
  if (!hasVercelDomainEnv()) {
    return {
      ok: false as const,
      error: "Custom domains require VERCEL_API_TOKEN and VERCEL_PROJECT_ID environment variables. Set them in Vercel project settings.",
    };
  }

  const domain = inputDomain.trim().toLowerCase();
  const addResult = await addDomain(domain);
  if (!addResult.ok) {
    return {
      ok: false as const,
      error: getDomainErrorMessage(addResult.data),
    };
  }

  const statusResult = await checkDomainStatus(domain);
  if (!statusResult.ok) {
    return {
      ok: false as const,
      error: getDomainErrorMessage(statusResult.data),
    };
  }

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return {
      ok: false as const,
      error: "Organization not found.",
    };
  }

  const mergedPayload = { ...addResult.data, ...statusResult.data };
  const verified = resolveDomainVerified(mergedPayload);
  const status = resolveDomainStatus(mergedPayload);
  const settings = ((org.settings ?? {}) as Record<string, unknown>) || {};

  await db
    .update(organizations)
    .set({
      settings: {
        ...settings,
        customDomain: domain,
        domainVerified: verified,
        domainStatus: status,
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  const dnsMessage = typeof addResult.data.message === "string" && addResult.data.message.trim()
    ? addResult.data.message
    : `DNS: Point ${domain} to Vercel (CNAME or A record). SSL auto-provisioned.`;

  return {
    ok: true as const,
    domain,
    verified,
    status,
    dnsMessage,
  };
}

function buildSystemPrompt(_soul: OrgSoul | null, _integrations: OrganizationIntegrations, _wikiContent: string) {
  return `You are Seldon It — the 5-agent customization and intelligence pipeline inside every SeldonFrame workspace.

You are the living layer that turns natural language requests into permanent, scoped changes using the soul, blocks, harness-rules.json, and the Brain wiki.

Distribution channel policy:
- Primary: MCP + Claude Code
- Secondary: OpenClaw (lightweight mobile option)

Core principles (never violate):
- The soul JSON is the single source of truth. Every change must be written back to it.
- Changes are always scoped: builder-level or client-level (never bleed between clients).
- Use the iteration loop: if a request is recurring, codify it into a block or rule permanently.
- After every interaction, write a structured seldon_it_interaction event to the Brain (anonymized at write time per privacy rules).
- End every response with a clear next-step CTA.
- Privacy is non-negotiable: all events are anonymized (email → SHA-256 hash, names → CLIENT-[hash], free-text summarized ≤140 chars). No PII is ever stored. Follow docs/multi-tenant-privacy.md (Multi-Tenant Privacy Strategies v1) exactly.

Two modes (detect automatically from harness-rules.json):
- Builder mode (default): full access to edit soul, blocks, harness-rules, marketplace publishing, custom domains.
- End-Client Customization mode (enabled when harness-rules.json has "end_client_customization": true): restricted to client-scoped changes only for the current client_id.

Daily workflow for any request:
1. Read current soul JSON, harness-rules.json, Brain wiki summary, and existing blocks.
2. If end-client mode is active, confirm client_id and scope all changes to that client only.
3. Analyze the request…
[full workflow from previous prompt remains unchanged]

Output format (always):
- What I understood
- What I changed (or created)
- Scope (builder-level or client_id: XXX)
- Next step for the user
- CTA: “Anything else you’d like me to customize?”

You are the reason the workspace feels alive and personal. Be precise, helpful, and relentless about compounding value through the iteration loop — while protecting every user’s privacy as if it were your own.`;
}

export async function getSeldonPageData() {
  const user = await getCurrentUser();
  const orgId = await getOrgId();

  if (!user?.id || !orgId) {
    return null;
  }

  const plan = resolvePlanFromPlanId(user.planId ?? null);
  const allowed = canSeldonIt(plan);

  const [[org], [stripe]] = await Promise.all([
    db
      .select({ integrations: organizations.integrations, settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1),
    db.select({ id: stripeConnections.id }).from(stripeConnections).where(eq(stripeConnections.orgId, orgId)).limit(1),
  ]);

  const integrations = readIntegrations(org?.integrations);

  const sessionRows = await db
    .select({
      id: seldonSessions.id,
      title: seldonSessions.title,
      messages: seldonSessions.messages,
      createdAt: seldonSessions.createdAt,
    })
    .from(seldonSessions)
    .where(eq(seldonSessions.orgId, orgId))
    .orderBy(desc(seldonSessions.createdAt))
    .limit(20);

  const sessions: SeldonSessionItem[] = sessionRows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    messages: (Array.isArray(row.messages) ? row.messages : []) as SeldonSessionItem["messages"],
  }));

  const settings = ((org?.settings ?? {}) as Record<string, unknown>) || {};
  const rawSavedBlocks = Array.isArray(settings.savedBlocks) ? settings.savedBlocks : [];
  const savedBlocks: SeldonSavedBlock[] = rawSavedBlocks
    .map((entry) => (entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      id: String(entry.id ?? "").trim(),
      name: String(entry.name ?? "").trim(),
      blockMd: String(entry.blockMd ?? "").trim(),
      createdAt: String(entry.createdAt ?? "").trim(),
    }))
    .filter((entry) => entry.id && entry.name && entry.blockMd);

  const usage = await getSeldonUsageStats({ orgId, userId: user.id });

  return {
    allowed,
    planId: user.planId ?? null,
    usage,
    services: {
      stripe: Boolean(stripe),
      resend: Boolean(integrations.resend?.connected),
      twilio: Boolean(integrations.twilio?.connected),
      kit: Boolean(integrations.kit?.connected),
    },
    sessions,
    savedBlocks,
  };
}

export async function saveSeldonBlockAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const blockId = String(formData.get("blockId") ?? "").trim();
  const blockName = String(formData.get("blockName") ?? "").trim();
  const blockMd = String(formData.get("blockMd") ?? "").trim();

  if (!blockId || !blockName || !blockMd) {
    throw new Error("Missing block payload");
  }

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const settings = ((org?.settings ?? {}) as Record<string, unknown>) || {};
  const existing = Array.isArray(settings.savedBlocks) ? (settings.savedBlocks as Array<Record<string, unknown>>) : [];
  const filtered = existing.filter((item) => String(item.id ?? "") !== blockId);

  filtered.unshift({
    id: blockId,
    name: blockName,
    blockMd,
    createdAt: new Date().toISOString(),
  });

  await db
    .update(organizations)
    .set({
      settings: {
        ...settings,
        savedBlocks: filtered.slice(0, 50),
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  revalidatePath("/seldon");
}

export async function disableSeldonBlockAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const blockId = String(formData.get("blockId") ?? "").trim();
  if (!blockId) {
    throw new Error("Block ID is required");
  }

  const [org] = await db
    .select({ enabledBlocks: organizations.enabledBlocks })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  const nextEnabled = (org.enabledBlocks ?? []).filter((entry) => entry !== blockId);
  await db.update(organizations).set({ enabledBlocks: nextEnabled, updatedAt: new Date() }).where(eq(organizations.id, orgId));

  revalidatePath("/seldon");
  revalidatePath(`/marketplace/${blockId}`);
}

export async function runSeldonItAction(_prev: SeldonRunState, formData: FormData): Promise<SeldonRunState> {
  assertWritable();

  const builderMode = String(formData.get("builder_mode") ?? "") === "true";
  const endClientMode = String(formData.get("end_client_mode") ?? "") === "true";
  const orgSlugFromForm = String(formData.get("orgSlug") ?? "").trim();

  let user = await getCurrentUser();
  let orgId = await getOrgId();
  let endClientSession: Awaited<ReturnType<typeof getPortalSessionForOrg>> | null = null;

  if (endClientMode) {
    endClientSession = await getPortalSessionForOrg(orgSlugFromForm);
    if (!endClientSession) {
      return { ok: false, error: "Unauthorized" };
    }

    orgId = endClientSession.orgId;
    user = null;
  }

  if (!orgId || (!endClientMode && !user?.id)) {
    return { ok: false, error: "Unauthorized" };
  }

  const plan = resolvePlanFromPlanId(user?.planId ?? null);
  if (!endClientMode && !canSeldonIt(plan)) {
    return {
      ok: false,
      error: "Upgrade to Cloud Pro to Seldon custom blocks.",
    };
  }

  const rawDescription = String(formData.get("description") ?? "").trim();
  const description = endClientMode && endClientSession
    ? `[END_CLIENT_MODE]\nclient_id: ${endClientSession.contact.id}\n${rawDescription}`
    : builderMode
      ? `[BUILDER_MODE]\n${rawDescription}`
      : rawDescription;
  const resolvedClientId = endClientSession?.contact.id ?? null;
  const requestedCustomDomain = !endClientMode ? extractCustomDomainIntent(rawDescription) : null;
  const sessionIdFromForm = String(formData.get("sessionId") ?? "").trim();

  if (!description) {
    return { ok: false, error: "Describe what you want to build." };
  }

  if (endClientMode && !resolvedClientId) {
    return { ok: false, error: "Client-scoped customization requires a valid client session." };
  }

  const emitBrainEvent = (payload: Record<string, unknown>) => {
    void writeEvent(orgId, "seldon_it_applied", {
      mode: endClientMode ? "end_client" : builderMode ? "builder" : "default",
      client_id: resolvedClientId,
      ...payload,
    });
  };

  try {
    let orgRow:
      | {
          id: string;
          slug: string;
          soul: unknown;
          theme: unknown;
          integrations: unknown;
        }
      | null = null;

    try {
      const [fullOrgRow] = await db
        .select({
          id: organizations.id,
          slug: organizations.slug,
          soul: organizations.soul,
          theme: organizations.theme,
          integrations: organizations.integrations,
        })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      orgRow = fullOrgRow ?? null;
    } catch {
      const [fallbackOrgRow] = await db
        .select({
          id: organizations.id,
          slug: organizations.slug,
          soul: organizations.soul,
        })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      orgRow = fallbackOrgRow
        ? {
            ...fallbackOrgRow,
            theme: null,
            integrations: {},
          }
        : null;
    }

    if (!orgRow?.slug) {
      return { ok: false, error: "Organization not found." };
    }

    const orgSlug = orgRow.slug;
    const soul = (orgRow.soul as OrgSoul | null) ?? null;
    const theme = (orgRow.theme as OrgTheme | null) ?? null;
    const integrations = readIntegrations(orgRow.integrations);

    const [sessionRow] = await db
      .select({ id: seldonSessions.id, messages: seldonSessions.messages })
      .from(seldonSessions)
      .where(eq(seldonSessions.orgId, orgId))
      .orderBy(desc(seldonSessions.createdAt))
      .limit(20);

    const selectedSession = sessionIdFromForm
      ? (await db
          .select({ id: seldonSessions.id, messages: seldonSessions.messages })
          .from(seldonSessions)
          .where(eq(seldonSessions.id, sessionIdFromForm))
          .limit(1))[0]
      : sessionRow;

    const existingMessages = (Array.isArray(selectedSession?.messages) ? selectedSession.messages : []) as SeldonSessionMessage[];
    const sessionEntities = collectCreatedEntities(existingMessages);
    const activePlan = getActivePlan(existingMessages);
    const contextMessage = buildSessionContextMessage(sessionEntities, activePlan);

    if (requestedCustomDomain) {
      const domainResult = await connectCustomDomainForSeldon(orgId, requestedCustomDomain);
      if (!domainResult.ok) {
        emitBrainEvent({
          status: "error",
          reason: "custom_domain_failed",
          domain: requestedCustomDomain,
          detail: domainResult.error,
          query_summary: rawDescription.slice(0, 140),
        });

        return {
          ok: false,
          action: "update",
          error: domainResult.error,
        };
      }

      const message = domainResult.verified
        ? `Done — ${domainResult.domain} is connected and verified. ${domainResult.dnsMessage}`
        : `Done — ${domainResult.domain} is connected. ${domainResult.dnsMessage} Status: ${domainResult.status}.`;

      const results: SeldonRunResult[] = [
        {
          blockId: `custom-domain-${Date.now()}`,
          blockName: `Custom domain: ${domainResult.domain}`,
          blockMd: "# CUSTOM_DOMAIN\n\nConnected via Seldon It domain flow.",
          description: message,
          summary: `- ${message}`,
          status: domainResult.verified ? "live" : "needs-integration",
          integrationNote: domainResult.verified ? undefined : "If DNS was just added, propagation can take up to 48 hours.",
          fromInventory: false,
          installMode: "instant",
          openPath: "/settings/domain",
          savePath: "/settings/domain",
          adminUrl: "/settings/domain",
        },
      ];

      const nextMessages: SeldonSessionMessage[] = [
        ...existingMessages,
        { role: "user", content: description },
        {
          role: "assistant",
          content: message,
          results,
          ...(activePlan ? { plan: activePlan } : {}),
        },
      ];

      let persistedSessionId = selectedSession?.id ?? "";
      if (selectedSession?.id) {
        await db.update(seldonSessions).set({ messages: nextMessages }).where(eq(seldonSessions.id, selectedSession.id));
        persistedSessionId = selectedSession.id;
      } else {
        const [createdSession] = await db
          .insert(seldonSessions)
          .values({
            orgId,
            title: description.slice(0, 120),
            messages: nextMessages,
          })
          .returning({ id: seldonSessions.id });

        persistedSessionId = createdSession?.id ?? "";
      }

      revalidatePath("/settings");
      revalidatePath("/settings/domain");
      emitBrainEvent({
        status: "ok",
        action: "custom_domain_connected",
        domain: domainResult.domain,
        verified: domainResult.verified,
        domain_status: domainResult.status,
        query_summary: rawDescription.slice(0, 140),
      });

      return {
        ok: true,
        action: "update",
        message,
        sessionId: persistedSessionId,
        results,
        plan: activePlan,
      };
    }

    const aiResolution = await getAIClient({ orgId, userId: user?.id ?? null });
    if (!aiResolution.client || aiResolution.provider === "openai") {
      emitBrainEvent({
        status: "error",
        reason: "anthropic_not_configured",
        query_summary: rawDescription.slice(0, 140),
      });
      return {
        ok: false,
        error: "Seldon It AI is not configured. Set ANTHROPIC_API_KEY or connect an Anthropic key.",
      };
    }

    const wikiContent = await querySoulWiki(orgId, description);
    const systemPrompt = buildSystemPrompt(soul, integrations, wikiContent);

    const response = await aiResolution.client.messages.create({
      model: process.env.SELDON_MODEL?.trim() || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        ...(contextMessage
          ? [
              { role: "user" as const, content: `[SESSION CONTEXT]${contextMessage}` },
              { role: "assistant" as const, content: "Understood. I can see what was already created and will reference these entities." },
            ]
          : []),
        { role: "user" as const, content: description },
      ],
    });

    const raw = extractText(response.content as Array<{ type: string; text?: string }>);
    const parsed = parseJsonResponse(raw);

    if (!parsed?.action) {
      emitBrainEvent({
        status: "error",
        reason: "parse_failed",
        query_summary: rawDescription.slice(0, 140),
      });
      return { ok: false, error: "Failed to parse Seldon response.", message: raw };
    }

    const results: SeldonRunResult[] = [];
    const action = parsed.action;
    const normalizedPlan = normalizePlan(parsed.plan) || activePlan;

    if (action === "create" || action === "plan") {
      const creates = Array.isArray(parsed.creates) ? parsed.creates : [];

      for (const item of creates) {
        try {
          if (!endClientMode && (item.blockType === "page" || item.blockType === "form")) {
            const puckPrompt = buildPuckPrompt(item);
            const puckData = await generatePuckPage(puckPrompt, soul, theme);
            const rawName = String(item.name ?? item.params?.name ?? item.params?.title ?? (item.blockType === "form" ? "Lead Form" : "Landing Page"));
            const created = await createLandingPageForSeldonAction({
              title: rawName,
              slug: String(item.params?.slug ?? slugify(rawName || `${item.blockType}-${Date.now()}`)),
              mode: typeof item.params?.mode === "string" ? item.params.mode : "soul-template",
              template: typeof item.params?.template === "string" ? item.params.template : "lead-capture",
              published: true,
              pageType: item.blockType,
              puckData,
            });

            if (!created.id) {
              throw new Error(`${item.blockType} creation failed`);
            }

            const directResult: InstallResult = {
              entityId: created.id,
              type: item.blockType,
              name: created.title,
              description: String(item.description ?? `${item.blockType} created with Puck AI`),
              publicUrl: `/s/${orgSlug}/${created.slug}`,
              adminUrl: "/landing",
              status: created.status === "published" ? "live" : "draft",
              editUrl: `/editor/${created.id}`,
            };

            results.push(toAction(item.blockType, directResult));
            continue;
          }

          const installed = await installBlock(
            orgId,
            orgSlug,
            item.blockType,
            {
              ...(item.params ?? {}),
              ...(item.name ? { name: item.name } : {}),
              ...(item.description ? { description: item.description } : {}),
            },
            soul as OrgSoul,
            theme as OrgTheme,
            integrations,
            resolvedClientId ?? undefined
          );

          results.push(toAction(item.blockType, installed));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Create failed";
          const tierLimitError = parseTierLimitError(message);
          const upgradeGuidance = tierLimitError
            ? buildUpgradeGuidance(tierLimitError.limit, tierLimitError.tier, tierLimitError.nextTier)
            : null;

          results.push({
            blockId: `${item.blockType}-${Date.now()}`,
            blockName: item.name || `${item.blockType} block`,
            blockMd: "# BLOCK.md\n\nGeneration failed.",
            description: upgradeGuidance?.description ?? message,
            summary: upgradeGuidance?.summary ?? `- ${message}`,
            status: upgradeGuidance ? "needs-integration" : "error",
            integrationNote: upgradeGuidance?.integrationNote,
            fromInventory: false,
            installMode: "review",
            openPath: upgradeGuidance ? "/settings/billing" : "/seldon",
            savePath: "/seldon",
            adminUrl: upgradeGuidance ? "/settings/billing" : "/seldon",
          });
        }
      }
    }

    if (action === "update") {
      const updates = Array.isArray(parsed.updates) ? parsed.updates : [];

      for (const item of updates) {
        try {
          const fallback = sessionEntities.find((entity) => entity.blockType === item.blockType);
          const resolvedEntityId = item.entityId && item.entityId !== "ID_FROM_SESSION" ? item.entityId : fallback?.id;

          if (!resolvedEntityId) {
            throw new Error("Could not find entity to update in session");
          }

          const updated = await updateBlock(
            orgId,
            orgSlug,
            resolvedEntityId,
            item.blockType,
            {
              ...(item.params ?? {}),
              changeDescription: item.changeDescription,
            },
            soul as OrgSoul,
            theme as OrgTheme,
            integrations,
            resolvedClientId ?? undefined
          );

          results.push(toAction(item.blockType, updated));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Update failed";
          const tierLimitError = parseTierLimitError(message);
          const upgradeGuidance = tierLimitError
            ? buildUpgradeGuidance(tierLimitError.limit, tierLimitError.tier, tierLimitError.nextTier)
            : null;

          results.push({
            blockId: `${item.blockType}-${Date.now()}`,
            blockName: item.name || `${item.blockType} block`,
            blockMd: "# BLOCK.md\n\nUpdate failed.",
            description: upgradeGuidance?.description ?? message,
            summary: upgradeGuidance?.summary ?? `- ${message}`,
            status: upgradeGuidance ? "needs-integration" : "error",
            integrationNote: upgradeGuidance?.integrationNote,
            changes: upgradeGuidance?.description ?? message,
            fromInventory: false,
            installMode: "review",
            openPath: upgradeGuidance ? "/settings/billing" : "/seldon",
            savePath: "/seldon",
            adminUrl: upgradeGuidance ? "/settings/billing" : "/seldon",
          });
        }
      }
    }

    revalidatePath("/seldon");
    revalidatePath("/marketplace");

    try {
      for (const result of results) {
        if (user?.id) {
          await recordSeldonUsage({
            orgId,
            userId: user.id,
            blockId: result.entityId ?? result.blockId,
            mode: aiResolution.mode,
            model: "claude-sonnet",
          });
        }

        await fileSeldonOutputToSoul({
          orgId,
          userPrompt: description,
          action,
          result,
        });
      }
    } catch {
      // Usage and learning capture are non-critical; do not fail the run.
    }

    const message = parsed.message || (results.length > 0 ? "Done — changes are live." : "Blueprint ready.");

    emitBrainEvent({
      status: "ok",
      action,
      results_count: results.length,
      query_summary: rawDescription.slice(0, 140),
    });

    const createdEntities = results
      .map((result) => {
        if (!result.entityId || !result.blockType || !result.adminUrl) {
          return null;
        }

        return {
          id: result.entityId,
          blockType: result.blockType,
          name: result.blockName,
          publicUrl: result.publicUrl ?? null,
          adminUrl: result.adminUrl,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const nextMessages: SeldonSessionMessage[] = [
      ...existingMessages,
      { role: "user", content: description },
      {
        role: "assistant",
        content: message,
        results,
        createdEntities,
        ...(normalizedPlan ? { plan: normalizedPlan } : {}),
      },
    ];

    let persistedSessionId = selectedSession?.id ?? "";
    if (selectedSession?.id) {
      await db.update(seldonSessions).set({ messages: nextMessages }).where(eq(seldonSessions.id, selectedSession.id));
      persistedSessionId = selectedSession.id;
    } else {
      const [createdSession] = await db
        .insert(seldonSessions)
        .values({
          orgId,
          title: description.slice(0, 120),
          messages: nextMessages,
        })
        .returning({ id: seldonSessions.id });

      persistedSessionId = createdSession?.id ?? "";
    }

    return {
      ok: true,
      action,
      message,
      sessionId: persistedSessionId,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((item): item is string => typeof item === "string") : [],
      plan: normalizedPlan,
      blueprint: parsed.blueprint,
      results,
    };
  } catch (cause) {
    emitBrainEvent({
      status: "error",
      reason: cause instanceof Error ? cause.message : "unknown_error",
      query_summary: rawDescription.slice(0, 140),
    });
    return { ok: false, error: toSeldonErrorMessage(cause) };
  }
}
