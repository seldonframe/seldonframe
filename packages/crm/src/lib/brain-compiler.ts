import fs from "fs/promises";
import type { Dirent } from "node:fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gt, inArray, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { brainCompilationRuns, brainEvents } from "@/db/schema";
import { proposeBlockRewrite, type BlockRewriteSuggestion } from "@/lib/brain";
import { getBrainHealthSummary } from "@/lib/brain-health";
import { regenerateBrainManifestForWorkspace } from "@/lib/brain-manifest";

const BRAIN_ROOT = process.env.VERCEL ? "/tmp/brain" : path.join(process.cwd(), ".brain");
const BRAIN_WIKI_ROOT = path.join(BRAIN_ROOT, "wiki");
const WORKSPACES_ROOT = path.join(BRAIN_WIKI_ROOT, "workspaces");
const PERSONAL_ROOT = path.join(BRAIN_WIKI_ROOT, "personal");
const COMPILER_MODEL = process.env.BRAIN_COMPILER_MODEL?.trim() || "claude-haiku-4-5-20251001";
const DREAM_SALIENCE_THRESHOLD = 0.6;

async function ensureBrainDirs() {
  const dirs = [
    BRAIN_ROOT,
    path.join(BRAIN_ROOT, "wiki"),
    path.join(BRAIN_ROOT, "wiki", "workspaces"),
    path.join(BRAIN_ROOT, "wiki", "personal"),
    path.join(BRAIN_ROOT, "wiki", "industries"),
    path.join(BRAIN_ROOT, "wiki", "concepts"),
    path.join(BRAIN_ROOT, "wiki", "insights"),
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

type DreamPromotion = {
  industries: string[];
  concepts: string[];
  insights: string[];
  personalInsights: string[];
  lessons: string[];
  selfRewriteHints: string[];
};

type BrainEventRow = {
  eventId: string;
  workspaceId: string;
  timestamp: Date;
  eventType: string;
  payload: Record<string, unknown>;
  salienceScore: number;
};

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  return new Anthropic({ apiKey });
}

async function getLastSuccessfulRunAt() {
  const [lastRun] = await db
    .select({ runAt: brainCompilationRuns.runAt })
    .from(brainCompilationRuns)
    .where(eq(brainCompilationRuns.status, "success"))
    .orderBy(desc(brainCompilationRuns.runAt))
    .limit(1);

  if (lastRun?.runAt) {
    return lastRun.runAt;
  }

  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

async function getWorkspaceIdsWithNewEvents(since: Date) {
  const rows = await db
    .selectDistinct({ workspaceId: brainEvents.workspaceId })
    .from(brainEvents)
    .where(or(gt(brainEvents.timestamp, since), gt(brainEvents.salienceScore, DREAM_SALIENCE_THRESHOLD)));

  return rows.map((row) => row.workspaceId).filter(Boolean);
}

async function loadWorkspaceEvents(workspaceIds: string[], since: Date) {
  if (workspaceIds.length === 0) {
    return [] as BrainEventRow[];
  }

  return db
    .select({
      eventId: brainEvents.eventId,
      workspaceId: brainEvents.workspaceId,
      timestamp: brainEvents.timestamp,
      eventType: brainEvents.eventType,
      payload: brainEvents.payload,
      salienceScore: brainEvents.salienceScore,
    })
    .from(brainEvents)
    .where(
      and(
        inArray(brainEvents.workspaceId, workspaceIds),
        or(gt(brainEvents.timestamp, since), gt(brainEvents.salienceScore, DREAM_SALIENCE_THRESHOLD))
      )
    );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

function normalizeList(input: unknown, fallbackPrefix: string) {
  if (!Array.isArray(input)) {
    return [] as string[];
  }

  return input
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean)
    .map((entry) => (entry.length > 160 ? `${entry.slice(0, 157)}...` : entry))
    .slice(0, 6)
    .map((entry) => (entry.startsWith(fallbackPrefix) ? entry : entry));
}

function parseDreamPromotion(raw: string): DreamPromotion | null {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  if (!cleaned) {
    return null;
  }

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      industries: normalizeList(parsed.industries, ""),
      concepts: normalizeList(parsed.concepts, ""),
      insights: normalizeList(parsed.insights, ""),
      personalInsights: normalizeList(parsed.personalInsights, ""),
      lessons: normalizeList(parsed.lessons, ""),
      selfRewriteHints: normalizeList(parsed.selfRewriteHints, ""),
    };
  } catch {
    return null;
  }
}

function fallbackDreamPromotion(events: BrainEventRow[]): DreamPromotion {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = event.eventType.replace(/[._-]/g, " ");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => `${name} appeared ${count} times`);

  return {
    industries: ranked.slice(0, 2),
    concepts: ranked.slice(0, 3),
    insights: ranked.slice(0, 3),
    personalInsights: ranked.slice(0, 3),
    lessons: ranked.slice(0, 3),
    selfRewriteHints: [],
  };
}

function buildMonthlyRollup(events: BrainEventRow[]) {
  const counts = new Map<string, number>();

  for (const event of events) {
    counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1);
  }

  const lines = ["# Monthly Event Rollup", "", `Total events: ${events.length}`, "", "## Event counts"]; 
  for (const [eventType, count] of counts.entries()) {
    lines.push(`- ${eventType}: ${count}`);
  }

  return `${lines.join("\n")}\n`;
}

async function compileWorkspaceSummaryWithHaiku(workspaceId: string, events: BrainEventRow[]) {
  const client = getAnthropicClient();
  const eventBundle = events
    .slice(-150)
    .map((event) => ({ timestamp: event.timestamp.toISOString(), event_type: event.eventType, payload: event.payload || {} }));

  if (!client) {
    return [
      "---",
      `title: workspace-${workspaceId}-summary`,
      "tags: [workspace, brain, summary]",
      `last_compiled: ${new Date().toISOString()}`,
      "---",
      "",
      "# Workspace Summary",
      "",
      `Events analyzed: ${events.length}`,
      "",
      "## Notes",
      "- Anthropic key not configured; generated fallback summary.",
    ].join("\n");
  }

  const response = await client.messages.create({
    model: COMPILER_MODEL,
    max_tokens: 1200,
    system: "You are the Seldon Brain workspace compiler. Produce concise markdown with YAML frontmatter and Obsidian links when relevant.",
    messages: [
      {
        role: "user",
        content: `Compile a private workspace summary from these anonymized events. Workspace hash: ${workspaceId}.\nReturn markdown only.\n\nEvents:\n${JSON.stringify(eventBundle, null, 2)}`,
      },
    ],
  });

  const text = response.content
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("\n")
    .trim();

  return text || "# Workspace Summary\n\nNo summary generated.";
}

async function compileDreamPromotionWithHaiku(workspaceId: string, events: BrainEventRow[]) {
  const client = getAnthropicClient();
  if (!client) {
    return fallbackDreamPromotion(events);
  }

  const eventBundle = events.slice(-180).map((event) => ({
    timestamp: event.timestamp.toISOString(),
    event_type: event.eventType,
    salience_score: event.salienceScore,
    payload: event.payload,
  }));

  try {
    const response = await client.messages.create({
      model: COMPILER_MODEL,
      max_tokens: 1200,
      system:
        "You are the Seldon Brain dream-cycle engine. Convert anonymized episodic events into compact promotions for semantic and personal memory. Prefer specific, actionable business patterns tied to revenue, conversion, retention, or workflow efficiency. Avoid generic taxonomy labels or broad category names unless the event stream shows repeated, decision-useful evidence. Return strict JSON only.",
      messages: [
        {
          role: "user",
          content: [
            `Workspace hash: ${workspaceId}`,
            "Return JSON with keys: industries, concepts, insights, personalInsights, lessons, selfRewriteHints.",
            "Each key must be an array of short strings. Prioritize high-salience events and recurring patterns.",
            "Do not emit generic labels like 'AI video generation' or 'conversion optimization' unless they are supported by repeated concrete behaviors and phrased as actionable observations.",
            "Favor concise statements that explain what is working, what drives revenue or conversion, and which workflow/context patterns appear most effective.",
            "Events:",
            JSON.stringify(eventBundle, null, 2),
          ].join("\n\n"),
        },
      ],
    });

    const text = response.content
      .map((part) => (part.type === "text" ? part.text ?? "" : ""))
      .join("\n")
      .trim();

    return parseDreamPromotion(text) ?? fallbackDreamPromotion(events);
  } catch {
    return fallbackDreamPromotion(events);
  }
}

async function appendSection(filePath: string, sectionTitle: string, lines: string[]) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let existing = "";
  try {
    existing = await fs.readFile(filePath, "utf8");
  } catch {
    existing = "";
  }

  const section = [
    `## ${sectionTitle}`,
    ...lines.map((line) => `- ${line}`),
    "",
  ].join("\n");

  const next = existing.trim().length > 0 ? `${existing.trim()}\n\n${section}` : `# Brain Notes\n\n${section}`;
  await fs.writeFile(filePath, `${next.trim()}\n`, "utf8");
}

async function promoteToSemanticLayer(workspaceId: string, promotion: DreamPromotion) {
  const updatedPaths: string[] = [];
  const now = new Date().toISOString();

  const categories: Array<{ folder: "industries" | "concepts" | "insights"; items: string[] }> = [
    { folder: "industries", items: promotion.industries },
    { folder: "concepts", items: promotion.concepts },
    { folder: "insights", items: promotion.insights },
  ];

  for (const category of categories) {
    for (const item of category.items.slice(0, 3)) {
      const slug = slugify(item) || `${category.folder}-${Date.now()}`;
      const filePath = path.join(BRAIN_WIKI_ROOT, category.folder, `${slug}.md`);
      await appendSection(filePath, `Dream Cycle ${now}`, [`workspace: ${workspaceId}`, item]);
      updatedPaths.push(filePath);
    }
  }

  return updatedPaths;
}

async function promoteToPersonalLayer(workspaceId: string, promotion: DreamPromotion) {
  const workspacePersonalDir = path.join(PERSONAL_ROOT, workspaceId);
  await fs.mkdir(workspacePersonalDir, { recursive: true });

  const dayKey = new Date().toISOString().slice(0, 10);
  const personalPath = path.join(workspacePersonalDir, `dream-${dayKey}.md`);
  const lines = [...promotion.personalInsights.slice(0, 5), ...promotion.lessons.slice(0, 5)];

  if (lines.length === 0) {
    return null;
  }

  await appendSection(personalPath, `Dream Cycle ${new Date().toISOString()}`, lines);
  return personalPath;
}

async function collectFilesNamed(rootDir: string, targetName: string, limit = 200) {
  const output: string[] = [];
  const queue = [rootDir];

  while (queue.length > 0 && output.length < limit) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    let entries: Dirent<string>[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true, encoding: "utf8" });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (output.length >= limit) {
        break;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name === targetName) {
        output.push(fullPath);
      }
    }
  }

  return output;
}

function formatEventPatternSummary(events: BrainEventRow[]) {
  const highSalienceEvents = events
    .filter((event) => event.salienceScore >= DREAM_SALIENCE_THRESHOLD)
    .sort((a, b) => b.salienceScore - a.salienceScore)
    .slice(0, 3)
    .map((event) => `${event.eventType} (salience=${event.salienceScore.toFixed(2)})`);

  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1);
  }

  const recurringPatterns = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([eventType, count]) => `${eventType} x${count}`);

  const eventSummary = highSalienceEvents.length > 0 ? highSalienceEvents.join(", ") : "no events crossed salience threshold";
  const patternSummary = recurringPatterns.length > 0 ? recurringPatterns.join(", ") : "no recurring pattern detected";

  return { eventSummary, patternSummary };
}

function deriveBlockName(blockPath: string) {
  const parentDir = path.basename(path.dirname(blockPath)).trim();
  if (parentDir) {
    return parentDir;
  }

  return path.basename(blockPath, path.extname(blockPath));
}

function extractOriginalSnippet(content: string) {
  const lines = content.split(/\r?\n/);
  const matchIndex = lines.findIndex((line) => /self_improve\s*:\s*true/i.test(line));

  if (matchIndex >= 0) {
    const start = Math.max(0, matchIndex - 4);
    const end = Math.min(lines.length, matchIndex + 6);
    return lines.slice(start, end).join("\n").trim();
  }

  return lines.slice(0, 12).join("\n").trim();
}

function buildRawRewriteSuggestion(
  blockName: string,
  blockContent: string,
  promotion: DreamPromotion,
  workspaceEvents: BrainEventRow[]
) {
  const { eventSummary, patternSummary } = formatEventPatternSummary(workspaceEvents);
  const hint = promotion.selfRewriteHints[0]?.trim() || "Clarify promise, target persona, and measurable success criteria in this block.";
  const confidence = Math.min(
    0.95,
    Math.max(
      0.45,
      0.45 +
        (promotion.selfRewriteHints.length > 0 ? 0.2 : 0) +
        (workspaceEvents.some((event) => event.salienceScore >= DREAM_SALIENCE_THRESHOLD) ? 0.2 : 0) +
        (workspaceEvents.length >= 8 ? 0.1 : 0)
    )
  );

  const riskLevel: BlockRewriteSuggestion["risk_level"] =
    confidence >= 0.8 ? "low" : confidence >= 0.62 ? "medium" : "high";

  return {
    original_snippet: extractOriginalSnippet(blockContent),
    suggested_improvement: `For ${blockName}, ${hint}`,
    reason: `High-salience event evidence: ${eventSummary}. Recurring pattern evidence: ${patternSummary}.`,
    confidence_score: Math.round(confidence * 1000) / 1000,
    expected_impact: `Improve ${blockName} skill outcomes by aligning block messaging with high-salience behavior patterns.`,
    risk_level: riskLevel,
  };
}

function formatRewriteSuggestionMarkdown(
  blockName: string,
  blockPath: string,
  workspaceId: string,
  suggestion: BlockRewriteSuggestion
) {
  return [
    "# Rewrite Suggestion",
    "",
    `block_name: ${blockName}`,
    `workspace_hash: ${workspaceId}`,
    `generated_at: ${new Date().toISOString()}`,
    `source_block: ${blockPath}`,
    "",
    "## original_snippet",
    "```md",
    suggestion.original_snippet,
    "```",
    "",
    "## suggested_improvement",
    suggestion.suggested_improvement,
    "",
    "## reason",
    suggestion.reason,
    "",
    "## confidence_score",
    String(suggestion.confidence_score),
    "",
    "## expected_impact",
    suggestion.expected_impact,
    "",
    "## risk_level",
    suggestion.risk_level,
    "",
  ].join("\n");
}

async function triggerSelfRewriteHooks(workspaceId: string, promotion: DreamPromotion, workspaceEvents: BrainEventRow[]) {
  const roots = [
    path.join(process.cwd(), "openclaw", "skills"),
    path.join(process.cwd(), "packages", "crm"),
  ];

  const matchingBlocks: Array<{ blockPath: string; blockContent: string }> = [];
  for (const root of roots) {
    const blockFiles = await collectFilesNamed(root, "BLOCK.md", 120);
    for (const blockPath of blockFiles) {
      try {
        const content = await fs.readFile(blockPath, "utf8");
        if (/self_improve\s*:\s*true/i.test(content)) {
          matchingBlocks.push({ blockPath, blockContent: content });
        }
      } catch {
        continue;
      }
    }
  }

  const rewriteSuggestionPaths: string[] = [];
  const dateKey = new Date().toISOString().slice(0, 10);
  const rewriteSuggestionDir = path.join(PERSONAL_ROOT, workspaceId, "rewrite-suggestions");
  await fs.mkdir(rewriteSuggestionDir, { recursive: true });

  for (const match of matchingBlocks) {
    const blockName = deriveBlockName(match.blockPath);
    const rawSuggestion = buildRawRewriteSuggestion(blockName, match.blockContent, promotion, workspaceEvents);
    const structuredSuggestion = proposeBlockRewrite(blockName, rawSuggestion);
    if (!structuredSuggestion) {
      continue;
    }

    const fileName = `${slugify(blockName) || "block"}-${dateKey}.md`;
    const suggestionPath = path.join(rewriteSuggestionDir, fileName);
    const suggestionContent = formatRewriteSuggestionMarkdown(blockName, match.blockPath, workspaceId, structuredSuggestion);
    await fs.writeFile(suggestionPath, `${suggestionContent.trim()}\n`, "utf8");
    rewriteSuggestionPaths.push(suggestionPath);
  }

  if (matchingBlocks.length > 0) {
    console.info("[brain-dream-cycle] self-rewrite proposals generated", {
      workspaceId,
      blockCount: matchingBlocks.length,
      proposalsWritten: rewriteSuggestionPaths.length,
      hints: promotion.selfRewriteHints.slice(0, 5),
      blocks: matchingBlocks.slice(0, 10).map((match) => match.blockPath),
    });
  }

  return {
    proposalsGenerated: rewriteSuggestionPaths.length,
    proposalPaths: rewriteSuggestionPaths,
  };
}

async function pruneLowSalienceEventsOlderThan90Days() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const deletedRows = await db
    .delete(brainEvents)
    .where(and(lt(brainEvents.timestamp, cutoff), lt(brainEvents.salienceScore, DREAM_SALIENCE_THRESHOLD)))
    .returning({ eventId: brainEvents.eventId, feedbackScore: brainEvents.feedbackScore });

  const usefulDeletedCount = deletedRows.filter((row) => (row.feedbackScore ?? 0) > 0).length;

  return {
    cutoff,
    deletedCount: deletedRows.length,
    usefulDeletedCount,
  };
}

async function writeWorkspaceWiki(workspaceId: string, events: BrainEventRow[]) {
  await ensureBrainDirs();
  const workspaceDir = path.join(WORKSPACES_ROOT, workspaceId);
  await fs.mkdir(workspaceDir, { recursive: true });

  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthlyPath = path.join(workspaceDir, `${monthKey}.md`);
  const summaryPath = path.join(workspaceDir, "summary.md");

  const summary = await compileWorkspaceSummaryWithHaiku(workspaceId, events);
  const rollup = buildMonthlyRollup(events);

  await fs.writeFile(summaryPath, `${summary.trim()}\n`, "utf8");

  let existingRollup = "";
  try {
    existingRollup = await fs.readFile(monthlyPath, "utf8");
  } catch {
    existingRollup = "";
  }

  const nextRollup = existingRollup.trim().length > 0 ? `${existingRollup.trim()}\n\n${rollup.trim()}\n` : rollup;
  await fs.writeFile(monthlyPath, nextRollup, "utf8");

  return [summaryPath, monthlyPath];
}

export async function runDreamCycle() {
  await ensureBrainDirs();

  const since = await getLastSuccessfulRunAt();
  const workspaceIds = await getWorkspaceIdsWithNewEvents(since);
  const pruneResult = await pruneLowSalienceEventsOlderThan90Days();

  if (workspaceIds.length === 0) {
    const runArtifacts: string[] = [
      `meta://dream-cycle/pruned_events=${pruneResult.deletedCount}`,
      `meta://dream-cycle/pruned_useful_events=${pruneResult.usefulDeletedCount}`,
      "meta://dream-cycle/semantic_promotions=0",
      "meta://dream-cycle/personal_promotions=0",
      "meta://dream-cycle/self_rewrite_intents=0",
    ];

    await db.insert(brainCompilationRuns).values({
      status: "success",
      eventsProcessed: 0,
      articlesUpdated: runArtifacts,
    });

    return {
      ok: true,
      mode: "dream_cycle",
      since,
      workspacesCompiled: 0,
      eventsProcessed: 0,
      articlesUpdated: runArtifacts,
      semanticPromotions: 0,
      personalPromotions: 0,
      manifestsUpdated: 0,
      selfRewriteIntents: 0,
      prunedEvents: pruneResult.deletedCount,
      prunedUsefulEvents: pruneResult.usefulDeletedCount,
    };
  }

  const events = await loadWorkspaceEvents(workspaceIds, since);
  const eventsByWorkspace = new Map<string, BrainEventRow[]>();

  for (const event of events) {
    const existing = eventsByWorkspace.get(event.workspaceId) ?? [];
    existing.push(event);
    eventsByWorkspace.set(event.workspaceId, existing);
  }

  const articlesUpdated: string[] = [];
  let semanticPromotions = 0;
  let personalPromotions = 0;
  let manifestsUpdated = 0;
  let selfRewriteIntents = 0;

  for (const workspaceId of workspaceIds) {
    const workspaceEvents = eventsByWorkspace.get(workspaceId) ?? [];
    if (workspaceEvents.length === 0) {
      continue;
    }

    const generatedPaths = await writeWorkspaceWiki(workspaceId, workspaceEvents);
    articlesUpdated.push(...generatedPaths);

    const promotion = await compileDreamPromotionWithHaiku(workspaceId, workspaceEvents);
    const semanticPaths = await promoteToSemanticLayer(workspaceId, promotion);
    articlesUpdated.push(...semanticPaths);
    semanticPromotions += semanticPaths.length;

    const personalPath = await promoteToPersonalLayer(workspaceId, promotion);
    if (personalPath) {
      articlesUpdated.push(personalPath);
      personalPromotions += 1;
    }

    const rewriteResult = await triggerSelfRewriteHooks(workspaceId, promotion, workspaceEvents);
    selfRewriteIntents += rewriteResult.proposalsGenerated;
    articlesUpdated.push(...rewriteResult.proposalPaths);

    const manifestResult = await regenerateBrainManifestForWorkspace({
      workspaceId,
      events: workspaceEvents.map((event) => ({
        eventType: event.eventType,
        payload: event.payload,
        salienceScore: event.salienceScore,
      })),
      workspaceIdIsHashed: true,
    });

    articlesUpdated.push(manifestResult.manifestPath);
    manifestsUpdated += 1;

    console.info("[brain-dream-cycle] workspace promotion complete", {
      workspaceId,
      eventsProcessed: workspaceEvents.length,
      semanticPromotions: semanticPaths.length,
      personalPromoted: Boolean(personalPath),
      manifestUpdated: true,
      rewriteIntents: rewriteResult.proposalsGenerated,
    });
  }

  await db.insert(brainCompilationRuns).values({
    status: "success",
    eventsProcessed: events.length,
    articlesUpdated: [
      ...articlesUpdated,
      `meta://dream-cycle/semantic_promotions=${semanticPromotions}`,
      `meta://dream-cycle/personal_promotions=${personalPromotions}`,
      `meta://dream-cycle/manifests_updated=${manifestsUpdated}`,
      `meta://dream-cycle/self_rewrite_intents=${selfRewriteIntents}`,
      `meta://dream-cycle/pruned_events=${pruneResult.deletedCount}`,
      `meta://dream-cycle/pruned_useful_events=${pruneResult.usefulDeletedCount}`,
    ],
  });

  try {
    const health = await getBrainHealthSummary();
    console.info("[brain-dream-cycle] overall health", {
      last7DaysOverallHealthScore: health.windows.last7Days.overallHealthScore,
      last30DaysOverallHealthScore: health.windows.last30Days.overallHealthScore,
      last7DayTrend: health.windows.last7Days.trends.overallHealthScore,
      last30DayTrend: health.windows.last30Days.trends.overallHealthScore,
    });
  } catch (error) {
    console.error("[brain-dream-cycle] health summary unavailable", error);
  }

  return {
    ok: true,
    mode: "dream_cycle",
    since,
    workspacesCompiled: workspaceIds.length,
    eventsProcessed: events.length,
    articlesUpdated,
    semanticPromotions,
    personalPromotions,
    manifestsUpdated,
    selfRewriteIntents,
    prunedEvents: pruneResult.deletedCount,
    prunedUsefulEvents: pruneResult.usefulDeletedCount,
  };
}

export async function runBrainCompilationJob() {
  return runDreamCycle();
}
