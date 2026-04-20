import fs from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import type { CrmRecord } from "@/components/crm/types";
import { db } from "@/db";
import { brainEvents } from "@/db/schema";
import { getBrainHealthSummary } from "@/lib/brain-health";
import { parseBlockMd, replaceBlockMdSection } from "@/lib/blocks/block-md";
import { buildProgressiveBrainContext, hashWorkspaceId } from "@/lib/brain-manifest";

const BRAIN_ROOT = process.env.VERCEL ? "/tmp/brain" : path.join(process.cwd(), ".brain");
const WORKSPACES_ROOT = path.join(BRAIN_ROOT, "wiki", "workspaces");

export type BrainInsightConfig = {
  enabled: boolean;
  title: string;
  maxSignals: number;
};

export type BrainRecordInsight = {
  title: string;
  summary: string;
  signals: string[];
  tags: string[];
  references: string[];
  trend?: string;
  generatedAt: string;
};

type RelevantBrainEvent = {
  eventType: string;
  payload: Record<string, unknown>;
  salienceScore: number;
  timestamp: Date;
};

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeBoolean(value: string | undefined, fallback: boolean) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true" || normalized === "yes" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "no" || normalized === "0") {
    return false;
  }
  return fallback;
}

function normalizeNumber(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function buildDefaultBrainIntelligenceSection(title = "Brain Summary") {
  return `## Intelligence\n\n- enabled: true\n- title: ${title}\n- maxSignals: 4`;
}

export function parseBrainInsightConfig(blockMd: string) {
  const parsed = parseBlockMd(blockMd);
  const section = parsed.sections.intelligence ?? "";
  const config: BrainInsightConfig = {
    enabled: true,
    title: "Brain Summary",
    maxSignals: 4,
  };

  for (const rawLine of section.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("- ")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(2, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === "enabled") {
      config.enabled = normalizeBoolean(value, config.enabled);
      continue;
    }

    if (key === "title" && value) {
      config.title = value;
      continue;
    }

    if (key === "maxsignals") {
      config.maxSignals = normalizeNumber(value, config.maxSignals);
    }
  }

  return config;
}

export function upsertBrainIntelligenceSection(blockMd: string, params?: Partial<BrainInsightConfig>) {
  const nextConfig = {
    ...parseBrainInsightConfig(blockMd),
    ...params,
  } satisfies BrainInsightConfig;

  return replaceBlockMdSection(
    blockMd,
    "Intelligence",
    [`- enabled: ${nextConfig.enabled ? "true" : "false"}`, `- title: ${nextConfig.title}`, `- maxSignals: ${nextConfig.maxSignals}`].join("\n")
  );
}

function collectRecordStrings(record: CrmRecord) {
  const values = Object.values(record.values ?? {})
    .flatMap((value) => {
      if (typeof value === "string") {
        return [value];
      }
      if (typeof value === "number" || typeof value === "boolean") {
        return [String(value)];
      }
      if (Array.isArray(value)) {
        return value.map((item) => String(item));
      }
      return [] as string[];
    })
    .filter(Boolean)
    .slice(0, 24);

  return [
    record.title ?? "",
    record.subtitle ?? "",
    ...(record.badges ?? []),
    ...(record.relationships?.flatMap((relationship) => [relationship.label, relationship.subtitle ?? ""]) ?? []),
    ...(record.linkedRecordGroups?.flatMap((group) => [group.label, ...group.records.flatMap((linked) => [linked.label, linked.subtitle ?? ""])]) ?? []),
    ...(record.timeline?.flatMap((item) => [item.title, item.body ?? ""]) ?? []),
    ...values,
  ]
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function scoreOverlap(candidate: string, keywords: Set<string>) {
  if (keywords.size === 0) {
    return 0;
  }

  return tokenize(candidate).reduce((score, token) => score + (keywords.has(token) ? 1 : 0), 0);
}

function humanizeEventType(value: string) {
  return value.replace(/[._-]/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function matchesIdentifier(candidate: unknown, id: string) {
  const raw = String(candidate ?? "").trim();
  if (!raw) {
    return false;
  }

  return raw === id || raw === hashWorkspaceId(id);
}

function summarizeEvent(event: RelevantBrainEvent, endClientMode: boolean) {
  const objectSlug = typeof event.payload.objectSlug === "string" ? event.payload.objectSlug : "";
  const field = typeof event.payload.field === "string" ? event.payload.field : "";
  const toValue = typeof event.payload.to === "string" || typeof event.payload.to === "number" ? String(event.payload.to) : "";
  const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(event.timestamp);
  const salience = Math.round(event.salienceScore * 100);

  if (field && toValue) {
    return `${when}: ${humanizeEventType(event.eventType)} moved ${field} to ${toValue}${endClientMode ? "" : ` (salience ${salience})`}.`;
  }

  if (objectSlug) {
    return `${when}: ${humanizeEventType(event.eventType)} for ${objectSlug}${endClientMode ? "" : ` (salience ${salience})`}.`;
  }

  return `${when}: ${humanizeEventType(event.eventType)}${endClientMode ? "" : ` (salience ${salience})`}.`;
}

async function readWorkspaceSummarySnippet(workspaceId: string) {
  const workspaceHash = hashWorkspaceId(workspaceId);
  const summaryPath = path.join(WORKSPACES_ROOT, workspaceHash, "summary.md");

  try {
    const content = await fs.readFile(summaryPath, "utf8");
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("---") && !line.startsWith("title:") && !line.startsWith("tags:") && !line.startsWith("last_compiled:"));
    return lines.slice(0, 3).join(" ").trim();
  } catch {
    return "";
  }
}

async function loadRelevantEvents(params: {
  workspaceId: string;
  recordId: string;
  objectSlug?: string;
  eventPrefixes: string[];
}) {
  const workspaceHash = hashWorkspaceId(params.workspaceId);
  const rows = await db
    .select({
      eventType: brainEvents.eventType,
      payload: brainEvents.payload,
      salienceScore: brainEvents.salienceScore,
      timestamp: brainEvents.timestamp,
    })
    .from(brainEvents)
    .where(eq(brainEvents.workspaceId, workspaceHash))
    .orderBy(desc(brainEvents.timestamp))
    .limit(180);

  return rows
    .map((row) => ({
      eventType: row.eventType,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      salienceScore: typeof row.salienceScore === "number" ? row.salienceScore : 0.5,
      timestamp: row.timestamp,
    }))
    .filter((row) => {
      const payload = row.payload;
      if (matchesIdentifier(payload.recordId, params.recordId) || matchesIdentifier(payload.dealId, params.recordId) || matchesIdentifier(payload.contactId, params.recordId)) {
        return true;
      }

      if (params.objectSlug && typeof payload.objectSlug === "string" && payload.objectSlug === params.objectSlug) {
        return true;
      }

      return params.eventPrefixes.some((prefix) => row.eventType.startsWith(prefix));
    })
    .sort((left, right) => right.salienceScore - left.salienceScore || right.timestamp.getTime() - left.timestamp.getTime())
    .slice(0, 5);
}

export async function getBrainInsightForRecord(params: {
  workspaceId: string;
  blockMd: string;
  entityLabel: string;
  record: CrmRecord;
  objectSlug?: string;
  endClientMode?: boolean;
}) {
  const config = parseBrainInsightConfig(params.blockMd);
  if (!config.enabled) {
    return null;
  }

  const recordStrings = collectRecordStrings(params.record);
  const prompt = [params.entityLabel, params.record.title ?? "", params.record.subtitle ?? "", ...recordStrings.slice(0, 16)].join(" ").trim();
  const keywords = new Set(tokenize(prompt));
  const progressive = await buildProgressiveBrainContext(params.workspaceId, prompt || params.entityLabel);
  const summarySnippet = await readWorkspaceSummarySnippet(params.workspaceId);
  const health = params.endClientMode
    ? null
    : await getBrainHealthSummary().catch(() => null);
  const eventPrefixes = [params.entityLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".", params.objectSlug ? `${params.objectSlug}.` : ""].filter(Boolean);
  const relevantEvents = await loadRelevantEvents({
    workspaceId: params.workspaceId,
    recordId: params.record.id,
    objectSlug: params.objectSlug,
    eventPrefixes,
  });

  const manifest = progressive.manifest;
  const matchedTags = (manifest?.semanticTags ?? [])
    .map((tag) => ({ tag, score: scoreOverlap(tag, keywords) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.tag.localeCompare(right.tag))
    .map((entry) => entry.tag);
  const tags = dedupe(matchedTags.length > 0 ? matchedTags : (manifest?.semanticTags ?? []).slice(0, 4)).slice(0, 4);

  const matchedInsights = (manifest?.personalInsights ?? [])
    .map((insight) => ({ insight, score: scoreOverlap(insight, keywords) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.insight.localeCompare(right.insight))
    .map((entry) => entry.insight);
  const selectedInsights = dedupe(matchedInsights.length > 0 ? matchedInsights : (manifest?.personalInsights ?? []).slice(0, 2)).slice(0, 2);

  const summary = relevantEvents.length > 0
    ? `Brain is seeing the strongest signal around ${humanizeEventType(relevantEvents[0].eventType).toLowerCase()} for this ${params.entityLabel.toLowerCase()}.`
    : selectedInsights[0]
      ? selectedInsights[0]
      : summarySnippet || `Brain is collecting patterns for this ${params.entityLabel.toLowerCase()} as new high-salience activity arrives.`;

  const signals = dedupe([
    ...selectedInsights,
    ...relevantEvents.map((event) => summarizeEvent(event, Boolean(params.endClientMode))),
    !params.endClientMode && summarySnippet ? summarySnippet : "",
  ]).slice(0, config.maxSignals);

  const references = params.endClientMode ? [] : dedupe((manifest?.relevantArticles ?? []).slice(0, 2));
  const trend = params.endClientMode || !health
    ? undefined
    : `Dream cycle health ${health.windows.last7Days.overallHealthScore} (${health.windows.last7Days.trends.overallHealthScore}); salience avg ${health.windows.last7Days.salience.average}; semantic promotions ${health.windows.last7Days.dreamCycle.semanticPromotions}.`;

  return {
    title: config.title,
    summary,
    signals,
    tags,
    references,
    trend,
    generatedAt: new Date().toISOString(),
  } satisfies BrainRecordInsight;
}
