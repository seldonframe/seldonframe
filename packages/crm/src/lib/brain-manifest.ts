import { createHash } from "node:crypto";
import fs from "fs/promises";
import type { Dirent } from "node:fs";
import path from "path";

const BRAIN_ROOT = path.join(process.cwd(), "brain");
const BRAIN_WIKI_ROOT = path.join(BRAIN_ROOT, "wiki");
const WORKSPACES_ROOT = path.join(BRAIN_WIKI_ROOT, "workspaces");
const PERSONAL_ROOT = path.join(BRAIN_WIKI_ROOT, "personal");
const SEMANTIC_DIRS = ["industries", "concepts", "insights"];
const MAX_RELEVANT_ARTICLES = 6;
const MAX_PERSONAL_INSIGHTS = 5;

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

type BrainManifestEvent = {
  eventType: string;
  payload: Record<string, unknown>;
  salienceScore?: number;
};

export type BrainManifest = {
  workspaceId: string;
  lastUpdated: string;
  semanticTags: string[];
  personalInsights: string[];
  relevantArticles: string[];
};

function toSha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildTagSalienceMap(events: BrainManifestEvent[]) {
  const tagScores = new Map<string, number[]>();

  for (const event of events) {
    const salience = typeof event.salienceScore === "number" ? Math.max(0, Math.min(1, event.salienceScore)) : 0.5;
    const sourceStrings: string[] = [event.eventType.replace(/[._-]/g, " ")];
    collectStringValues(event.payload, sourceStrings);

    for (const source of sourceStrings) {
      for (const token of tokenize(source)) {
        const existing = tagScores.get(token) ?? [];
        existing.push(salience);
        tagScores.set(token, existing);
      }
    }
  }

  const normalized = new Map<string, number>();
  for (const [tag, scores] of tagScores.entries()) {
    normalized.set(tag, Math.round(average(scores) * 1000) / 1000);
  }

  return normalized;
}

function normalizePathSlashes(value: string) {
  return value.replace(/\\/g, "/");
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function dedupe(values: string[]) {
  return Array.from(new Set(values));
}

function average(numbers: number[]) {
  if (numbers.length === 0) {
    return 0;
  }

  const total = numbers.reduce((sum, value) => sum + value, 0);
  return total / numbers.length;
}

function scorePathByTags(filePath: string, tags: Set<string>) {
  const normalized = filePath.toLowerCase();
  let score = 0;

  for (const tag of tags) {
    if (normalized.includes(tag)) {
      score += 1;
    }
  }

  return score;
}

function collectStringValues(value: unknown, output: string[], depth = 0) {
  if (depth > 3 || output.length >= 200) {
    return;
  }

  if (typeof value === "string") {
    output.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringValues(item, output, depth + 1);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    output.push(key);
    collectStringValues(nestedValue, output, depth + 1);
  }
}

async function collectMarkdownFiles(rootDir: string, limit = 300) {
  const files: string[] = [];
  const queue = [rootDir];

  while (queue.length > 0 && files.length < limit) {
    const nextDir = queue.shift();
    if (!nextDir) {
      break;
    }

    let entries: Dirent<string>[];
    try {
      entries = await fs.readdir(nextDir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (files.length >= limit) {
        break;
      }

      const fullPath = path.join(nextDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (entry.name.toLowerCase().endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

async function readSnippet(filePath: string, maxChars = 1200) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.trim().slice(0, maxChars);
  } catch {
    return "";
  }
}

function toRelativeBrainPath(absolutePath: string) {
  const relative = path.relative(BRAIN_WIKI_ROOT, absolutePath);
  return normalizePathSlashes(relative);
}

function toAbsoluteBrainPath(relativePath: string) {
  return path.join(BRAIN_WIKI_ROOT, relativePath);
}

function pickTopSemanticTags(events: BrainManifestEvent[], maxTags = 8) {
  const frequency = new Map<string, number>();
  const blockedTokens = new Set([
    "seldon",
    "brain",
    "workspace",
    "summary",
    "status",
    "action",
    "query",
    "reason",
    "mode",
    "result",
    "results",
    "event",
    "events",
    "default",
    "builder",
    "client",
    "custom",
    "connected",
    "error",
    "true",
    "false",
  ]);

  for (const event of events) {
    const sourceStrings: string[] = [event.eventType.replace(/[._-]/g, " ")];
    collectStringValues(event.payload, sourceStrings);
    const salienceWeight = typeof event.salienceScore === "number" ? Math.max(0.1, event.salienceScore) : 0.5;

    for (const source of sourceStrings) {
      for (const token of tokenize(source)) {
        if (blockedTokens.has(token)) {
          continue;
        }

        frequency.set(token, (frequency.get(token) ?? 0) + salienceWeight);
      }
    }
  }

  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTags)
    .map(([token]) => token);
}

async function buildRelevantSemanticArticles(tags: string[], tagSalienceMap: Map<string, number>) {
  const semanticFiles: string[] = [];

  for (const semanticDir of SEMANTIC_DIRS) {
    const fullDir = path.join(BRAIN_WIKI_ROOT, semanticDir);
    const files = await collectMarkdownFiles(fullDir, 120);
    semanticFiles.push(...files);
  }

  if (semanticFiles.length === 0) {
    return [] as string[];
  }

  const tagSet = new Set(tags);
  const scored = semanticFiles
    .map((absolutePath) => {
      const relativePath = toRelativeBrainPath(absolutePath);
      const tagMatchScore = scorePathByTags(relativePath, tagSet);
      const matchedTagSalience = tags.filter((tag) => relativePath.toLowerCase().includes(tag)).map((tag) => tagSalienceMap.get(tag) ?? 0.5);
      const salienceScore = average(matchedTagSalience);

      return {
        relativePath,
        score: tagMatchScore + salienceScore,
      };
    })
    .sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath));

  const positiveMatches = scored.filter((item) => item.score > 0).map((item) => item.relativePath);
  if (positiveMatches.length > 0) {
    return positiveMatches.slice(0, MAX_RELEVANT_ARTICLES);
  }

  return scored.slice(0, Math.min(3, scored.length)).map((item) => item.relativePath);
}

async function buildPersonalInsights(workspaceHash: string, tags: string[], tagSalienceMap: Map<string, number>) {
  const personalDir = path.join(PERSONAL_ROOT, workspaceHash);
  const files = await collectMarkdownFiles(personalDir, 40);

  if (files.length === 0) {
    return [] as string[];
  }

  const tagSet = new Set(tags);
  const insights: Array<{ text: string; score: number }> = [];

  for (const filePath of files) {
    const snippet = await readSnippet(filePath, 400);
    if (!snippet) {
      continue;
    }

    const lines = snippet
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const firstMeaningfulLine =
      lines.find((line) => !line.startsWith("#") && !line.startsWith("---")) ?? lines[0] ?? snippet.slice(0, 160);

    const normalizedLine = firstMeaningfulLine.replace(/^[-*]\s*/, "").slice(0, 180);
    if (!normalizedLine) {
      continue;
    }

    const matchedTags = tags.filter((tag) => normalizedLine.toLowerCase().includes(tag));
    const tagScore = scorePathByTags(normalizedLine, tagSet);
    const salienceScore = average(matchedTags.map((tag) => tagSalienceMap.get(tag) ?? 0.45));
    const combinedScore = tagScore + salienceScore;

    if (combinedScore > 0 || insights.length < 3) {
      insights.push({ text: normalizedLine, score: combinedScore });
    }
  }

  return dedupe(
    insights
      .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text))
      .map((insight) => insight.text)
  ).slice(0, MAX_PERSONAL_INSIGHTS);
}

async function resolveManifest(workspaceHash: string) {
  await ensureBrainDirs();
  const manifestPath = path.join(WORKSPACES_ROOT, workspaceHash, "brain-manifest.json");

  try {
    const content = await fs.readFile(manifestPath, "utf8");
    const parsed = JSON.parse(content) as BrainManifest;

    if (!parsed || typeof parsed !== "object") {
      return { manifestPath, manifest: null };
    }

    return {
      manifestPath,
      manifest: {
        workspaceId: String(parsed.workspaceId ?? workspaceHash),
        lastUpdated: String(parsed.lastUpdated ?? ""),
        semanticTags: Array.isArray(parsed.semanticTags) ? parsed.semanticTags.map(String) : [],
        personalInsights: Array.isArray(parsed.personalInsights) ? parsed.personalInsights.map(String) : [],
        relevantArticles: Array.isArray(parsed.relevantArticles) ? parsed.relevantArticles.map(String) : [],
      } as BrainManifest,
    };
  } catch {
    return { manifestPath, manifest: null };
  }
}

export function hashWorkspaceId(workspaceId: string) {
  return toSha256(workspaceId);
}

export async function readBrainManifestForWorkspace(workspaceId: string, options?: { workspaceIdIsHashed?: boolean }) {
  await ensureBrainDirs();
  const workspaceHash = options?.workspaceIdIsHashed ? workspaceId : hashWorkspaceId(workspaceId);
  const { manifest } = await resolveManifest(workspaceHash);
  return manifest;
}

export async function regenerateBrainManifestForWorkspace(params: {
  workspaceId: string;
  events?: BrainManifestEvent[];
  workspaceIdIsHashed?: boolean;
}) {
  await ensureBrainDirs();
  const workspaceHash = params.workspaceIdIsHashed ? params.workspaceId : hashWorkspaceId(params.workspaceId);
  const events = Array.isArray(params.events) ? params.events : [];
  const { manifestPath, manifest: existingManifest } = await resolveManifest(workspaceHash);

  const derivedTags = pickTopSemanticTags(events);
  const tagSalienceMap = buildTagSalienceMap(events);
  const semanticTags = dedupe([...(existingManifest?.semanticTags ?? []), ...derivedTags]).slice(0, 12);

  const relevantSemanticArticles = await buildRelevantSemanticArticles(semanticTags, tagSalienceMap);
  const defaultWorkspaceSummaryPath = `workspaces/${workspaceHash}/summary.md`;
  const relevantArticles = dedupe([
    ...relevantSemanticArticles,
    ...(existingManifest?.relevantArticles ?? []),
    defaultWorkspaceSummaryPath,
  ]).slice(0, MAX_RELEVANT_ARTICLES);

  const personalInsights = await buildPersonalInsights(workspaceHash, semanticTags, tagSalienceMap);

  const manifest: BrainManifest = {
    workspaceId: workspaceHash,
    lastUpdated: new Date().toISOString(),
    semanticTags,
    personalInsights,
    relevantArticles,
  };

  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  if (events.length > 0) {
    const topEventSalience = events
      .map((event) => (typeof event.salienceScore === "number" ? event.salienceScore : 0.5))
      .sort((a, b) => b - a)
      .slice(0, 3);

    console.info("[brain-manifest] salience-ranked selection", {
      workspaceId: workspaceHash,
      eventsProcessed: events.length,
      topEventSalience,
      selectedArticles: relevantArticles,
      selectedInsights: personalInsights,
    });
  }

  return { manifestPath, manifest };
}

export async function buildProgressiveBrainContext(workspaceId: string, userPrompt: string) {
  await ensureBrainDirs();
  let manifest = await readBrainManifestForWorkspace(workspaceId);
  if (!manifest) {
    const regenerated = await regenerateBrainManifestForWorkspace({ workspaceId });
    manifest = regenerated.manifest;
  }

  if (!manifest) {
    return {
      manifest: null,
      context: "",
      stats: {
        source: "none" as const,
        selectedArticles: 0,
        selectedPersonalInsights: 0,
        contextChars: 0,
      },
    };
  }

  const promptTags = new Set(tokenize(userPrompt));
  const manifestTags = new Set(manifest.semanticTags.map((tag) => tag.toLowerCase()));
  const combinedTags = new Set([...promptTags, ...manifestTags]);

  const rankedArticles = manifest.relevantArticles
    .map((relativePath) => ({
      relativePath,
      score: scorePathByTags(relativePath, combinedTags),
    }))
    .sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath))
    .slice(0, 4);

  const fallbackArticles = manifest.relevantArticles
    .filter((relativePath) => !rankedArticles.some((article) => article.relativePath === relativePath))
    .slice(0, 4);

  const articleBlocks: string[] = [];
  for (const article of rankedArticles) {
    const absolutePath = toAbsoluteBrainPath(article.relativePath);
    const snippet = await readSnippet(absolutePath, 1000);
    if (!snippet) {
      continue;
    }

    articleBlocks.push(`### ${article.relativePath}\n${snippet}`);
  }

  if (articleBlocks.length === 0) {
    for (const relativePath of fallbackArticles) {
      const absolutePath = toAbsoluteBrainPath(relativePath);
      const snippet = await readSnippet(absolutePath, 1000);
      if (!snippet) {
        continue;
      }

      articleBlocks.push(`### ${relativePath}\n${snippet}`);

      if (articleBlocks.length >= 3) {
        break;
      }
    }
  }

  let selectedInsights = manifest.personalInsights
    .filter((insight) => {
      if (combinedTags.size === 0) {
        return true;
      }

      return scorePathByTags(insight, combinedTags) > 0;
    })
    .slice(0, 5);

  if (selectedInsights.length === 0) {
    selectedInsights = manifest.personalInsights.slice(0, 3);
  }

  const sections: string[] = [];
  if (manifest.semanticTags.length > 0) {
    sections.push(`Manifest tags: ${manifest.semanticTags.slice(0, 12).join(", ")}`);
  }

  if (articleBlocks.length > 0) {
    sections.push("Relevant semantic articles:\n" + articleBlocks.join("\n\n"));
  }

  if (selectedInsights.length > 0) {
    sections.push("Personal insights:\n" + selectedInsights.map((insight) => `- ${insight}`).join("\n"));
  }

  const context = sections.join("\n\n").trim();

  return {
    manifest,
    context,
    stats: {
      source: "manifest" as const,
      selectedArticles: articleBlocks.length,
      selectedPersonalInsights: selectedInsights.length,
      contextChars: context.length,
    },
  };
}
