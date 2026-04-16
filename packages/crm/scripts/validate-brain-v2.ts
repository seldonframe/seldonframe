import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { and, eq, gt, sql } from "drizzle-orm";
import { config as loadDotenv } from "dotenv";
import { db } from "@/db";
import { brainEvents, organizations } from "@/db/schema";
import { GET as getBrainHealthRoute } from "@/app/api/internal/brain-health/route";
import { writeEvent } from "@/lib/brain";
import { runDreamCycle } from "@/lib/brain-compiler";
import { exportWorkspaceAsAgentForWorkspace } from "@/lib/ai/export-workspace-as-agent";

const BRAIN_WIKI_ROOT = process.env.BRAIN_WIKI_ROOT?.trim() || "/brain/wiki";
const TEST_WORKSPACE_SLUG = "brain-v2-validation-lab";
const TEST_WORKSPACE_NAME = "Brain V2 Validation Lab";
const TEST_SESSION_ID = "brain-v2-validate-session";
const EXPORT_COMMAND = "export my workspace as portable brain";

type BrainHealthResponse = {
  generatedAt: string;
  windows: {
    last7Days: {
      overallHealthScore: number;
      trends: Record<string, string>;
      feedback: { positiveRatePercent: number; positive: number; negative: number; withFeedback: number };
      dreamCycle: { compressionRatio: number; semanticPromotions: number; personalPromotions: number; runs: number };
      pruning: { pruningSafetyRatio: number; prunedEvents: number; usefulPrunedEvents: number };
      salience: { average: number };
      context: { averageContextChars: number; averageSelectedArticles: number; averageSelectedPersonalInsights: number };
    };
    last30Days: {
      overallHealthScore: number;
      trends: Record<string, string>;
      feedback: { positiveRatePercent: number; positive: number; negative: number; withFeedback: number };
      dreamCycle: { compressionRatio: number; semanticPromotions: number; personalPromotions: number; runs: number };
      pruning: { pruningSafetyRatio: number; prunedEvents: number; usefulPrunedEvents: number };
      salience: { average: number };
      context: { averageContextChars: number; averageSelectedArticles: number; averageSelectedPersonalInsights: number };
    };
  };
};

type SeedPrompt = {
  text: string;
  campaign: string;
  revenueSignal: "high" | "medium";
};

const SEED_PROMPTS: SeedPrompt[] = [
  { text: "Generate product demo video for my new Shopify collection", campaign: "shopify-summer", revenueSignal: "high" },
  { text: "Analyze which of my last 5 videos performed best", campaign: "analytics", revenueSignal: "medium" },
  { text: "Suggest better hooks for ecommerce videos", campaign: "hooks-optimization", revenueSignal: "high" },
  { text: "Create bulk videos for my summer collection", campaign: "shopify-summer", revenueSignal: "high" },
  { text: "Write three conversion-first intros for my skincare bundle", campaign: "hooks-optimization", revenueSignal: "high" },
  { text: "Turn customer testimonials into short UGC ad scripts", campaign: "ugc-optimization", revenueSignal: "medium" },
  { text: "Generate five product launch ad angles for TikTok", campaign: "ad-angles", revenueSignal: "high" },
  { text: "Improve watch-time for my ecommerce product explainer", campaign: "retention", revenueSignal: "medium" },
  { text: "Create a weekly AI video plan for my apparel catalog", campaign: "content-planning", revenueSignal: "medium" },
  { text: "Recommend CTA changes for better Shopify add-to-cart rate", campaign: "cta-optimization", revenueSignal: "high" },
];

const FEEDBACK_EVENTS: Array<{ messageIndex: number; score: -1 | 1 }> = [
  { messageIndex: 0, score: 1 },
  { messageIndex: 1, score: -1 },
  { messageIndex: 2, score: 1 },
  { messageIndex: 3, score: 1 },
  { messageIndex: 5, score: -1 },
  { messageIndex: 7, score: 1 },
];

function toSha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadEnvironment() {
  const cwd = process.cwd();
  const parent = path.resolve(cwd, "..");
  const grandParent = path.resolve(cwd, "..", "..");
  const candidates = [
    path.join(cwd, ".env.local"),
    path.join(cwd, ".env"),
    path.join(parent, ".env.local"),
    path.join(parent, ".env"),
    path.join(grandParent, ".env.local"),
    path.join(grandParent, ".env"),
    path.join(cwd, "packages", "crm", ".env"),
    path.join(cwd, "packages", "crm", ".env.local"),
  ];

  const deduped = Array.from(new Set(candidates));
  for (const envPath of deduped) {
    loadDotenv({ path: envPath, override: false });
  }
}

async function resolveOrCreateWorkspace() {
  const explicitWorkspaceId = process.env.BRAIN_TEST_WORKSPACE_ID?.trim();
  if (explicitWorkspaceId) {
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, soul: organizations.soul })
      .from(organizations)
      .where(eq(organizations.id, explicitWorkspaceId))
      .limit(1);

    if (org) {
      return org;
    }
  }

  const [existingOrg] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, soul: organizations.soul })
    .from(organizations)
    .where(eq(organizations.slug, TEST_WORKSPACE_SLUG))
    .limit(1);

  if (existingOrg) {
    return existingOrg;
  }

  const [createdOrg] = await db
    .insert(organizations)
    .values({
      name: TEST_WORKSPACE_NAME,
      slug: TEST_WORKSPACE_SLUG,
      plan: "pro",
    })
    .returning({ id: organizations.id, name: organizations.name, slug: organizations.slug, soul: organizations.soul });

  if (!createdOrg) {
    throw new Error("Could not create validation workspace.");
  }

  return createdOrg;
}

async function waitForSeedWrites(workspaceId: string, expectedMinimumCount: number, startAt: Date) {
  const workspaceHash = toSha256(workspaceId);

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(brainEvents)
      .where(and(eq(brainEvents.workspaceId, workspaceHash), gt(brainEvents.timestamp, startAt)));

    const count = Number(row?.count ?? 0);
    if (count >= expectedMinimumCount) {
      return count;
    }

    await sleep(400);
  }

  const [fallbackRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(brainEvents)
    .where(and(eq(brainEvents.workspaceId, workspaceHash), gt(brainEvents.timestamp, startAt)));

  return Number(fallbackRow?.count ?? 0);
}

async function seedValidationEvents(workspaceId: string) {
  const seededMessageIds: string[] = [];

  for (let index = 0; index < SEED_PROMPTS.length; index += 1) {
    const prompt = SEED_PROMPTS[index];
    const messageId = `brain-v2-validate-msg-${index + 1}`;
    seededMessageIds.push(messageId);

    await writeEvent(workspaceId, "seldon_it_applied", {
      mode: "builder",
      action: "update",
      query_summary: prompt.text,
      pipeline: "ai_video_ecommerce",
      campaign: prompt.campaign,
      revenue_signal: prompt.revenueSignal,
      results_count: 1 + (index % 4),
      context_source: index % 2 === 0 ? "manifest" : "fallback",
      context_chars: 1000 + index * 120,
      context_selected_articles: 2 + (index % 3),
      context_selected_personal_insights: 1 + (index % 2),
      feedback_for_session_id: TEST_SESSION_ID,
      feedback_for_message_id: messageId,
    });
  }

  for (const feedback of FEEDBACK_EVENTS) {
    const messageId = seededMessageIds[feedback.messageIndex];
    await writeEvent(workspaceId, "seldon_it_applied", {
      mode: "builder",
      action: "feedback",
      feedback_score: feedback.score,
      feedback_for_session_id: TEST_SESSION_ID,
      feedback_for_message_id: messageId,
      query_summary: `Feedback for ${messageId}`,
    });
  }

  return {
    seededPrompts: SEED_PROMPTS.length,
    seededFeedback: FEEDBACK_EVENTS.length,
    seededMessageIds,
  };
}

function extractInsightSnippet(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#") && !line.startsWith("---"));

  const line = lines[0] ?? "(no insight extracted)";
  return line.length > 180 ? `${line.slice(0, 177)}...` : line;
}

async function collectRecentMarkdownFiles(rootDir: string, limit = 80) {
  const files: Array<{ absolutePath: string; modifiedAtMs: number }> = [];
  const queue = [rootDir];

  while (queue.length > 0 && files.length < limit) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    let entries: Dirent<string>[];
    try {
      entries = await readdir(current, { withFileTypes: true, encoding: "utf8" });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (files.length >= limit) {
        break;
      }

      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }

      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
        continue;
      }

      try {
        const details = await stat(absolutePath);
        files.push({ absolutePath, modifiedAtMs: details.mtimeMs });
      } catch {
        continue;
      }
    }
  }

  return files.sort((a, b) => b.modifiedAtMs - a.modifiedAtMs);
}

async function buildSignalNoiseTemplate(workspaceHash: string) {
  const candidateRoots = [
    path.join(BRAIN_WIKI_ROOT, "insights"),
    path.join(BRAIN_WIKI_ROOT, "concepts"),
    path.join(BRAIN_WIKI_ROOT, "industries"),
    path.join(BRAIN_WIKI_ROOT, "personal", workspaceHash),
  ];

  const candidates = (await Promise.all(candidateRoots.map((root) => collectRecentMarkdownFiles(root, 30)))).flat();
  const latest = candidates.slice(0, 5);

  const template: Array<{
    sourceFile: string;
    promotedInsight: string;
    rating: "signal" | "noise" | "needs-review";
    reviewNotes: string;
  }> = [];

  for (const item of latest) {
    try {
      const content = await readFile(item.absolutePath, "utf8");
      template.push({
        sourceFile: item.absolutePath.replace(/\\/g, "/"),
        promotedInsight: extractInsightSnippet(content),
        rating: "needs-review",
        reviewNotes: "Template: Is this specific, actionable, and tied to recurring/high-salience behavior?",
      });
    } catch {
      continue;
    }
  }

  return template;
}

async function countFilesRecursive(rootDir: string) {
  const queue = [rootDir];
  let count = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    let entries: Dirent<string>[];
    try {
      entries = await readdir(current, { withFileTypes: true, encoding: "utf8" });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile()) {
        count += 1;
      }
    }
  }

  return count;
}

async function validateExportStructure(exportDir: string, zipPath: string) {
  const requiredRelativePaths = [
    "memory/episodic/high-salience-events.json",
    "skills/brain-manifest.json",
    "protocols/harness-rules.json",
    "protocols/privacy-rules.json",
    "SOUL.md",
    "README.md",
  ];

  const missing: string[] = [];
  for (const relativePath of requiredRelativePaths) {
    try {
      await access(path.join(exportDir, relativePath));
    } catch {
      missing.push(relativePath);
    }
  }

  const [zipStats, fileCount] = await Promise.all([stat(zipPath), countFilesRecursive(exportDir)]);

  return {
    ok: missing.length === 0,
    missing,
    fileCount,
    zipSizeBytes: zipStats.size,
  };
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = unitIndex === 0 ? 0 : value < 10 ? 2 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

async function main() {
  loadEnvironment();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Load .env before running validation.");
  }

  const startedAt = new Date();
  const workspace = await resolveOrCreateWorkspace();
  const workspaceHash = toSha256(workspace.id);

  console.info("[brain-v2-validate] workspace", {
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    workspaceHash,
  });

  const seeded = await seedValidationEvents(workspace.id);
  const observedSeedCount = await waitForSeedWrites(workspace.id, seeded.seededPrompts + seeded.seededFeedback, startedAt);

  const dreamCycle = await runDreamCycle();

  const healthResponse = await getBrainHealthRoute(new Request("http://localhost/api/internal/brain-health"));
  if (!healthResponse.ok) {
    throw new Error(`Brain health endpoint failed with status ${healthResponse.status}`);
  }

  const healthSummary = (await healthResponse.json()) as BrainHealthResponse;

  console.info("[brain-v2-validate] command trigger", { command: EXPORT_COMMAND });
  const exportResult = await exportWorkspaceAsAgentForWorkspace({
    workspaceId: workspace.id,
    orgName: workspace.name,
    orgSlug: workspace.slug,
    orgSoul: workspace.soul,
  });

  const exportCheck = await validateExportStructure(exportResult.exportDir, exportResult.zipPath);
  const signalNoiseTemplate = await buildSignalNoiseTemplate(workspaceHash);

  const summaryReport = {
    runAt: new Date().toISOString(),
    workspace: {
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      workspaceHash,
    },
    seeded: {
      prompts: seeded.seededPrompts,
      feedbackEvents: seeded.seededFeedback,
      observedSeedCount,
      promptExamples: SEED_PROMPTS.map((item) => item.text),
      feedbackPattern: FEEDBACK_EVENTS,
    },
    dreamCycle,
    export: {
      command: EXPORT_COMMAND,
      zipPath: exportResult.zipPath,
      exportDir: exportResult.exportDir,
      actionFileCount: exportResult.fileCount,
      validationFileCount: exportCheck.fileCount,
      zipSizeBytes: exportResult.zipSizeBytes,
      zipSizeLabel: formatBytes(exportResult.zipSizeBytes),
      structureOk: exportCheck.ok,
      missingRequiredPaths: exportCheck.missing,
    },
    signalNoiseTemplate,
  };

  console.log("\n=== BRAIN V2 VALIDATION: HEALTH JSON ===");
  console.log(JSON.stringify(healthSummary, null, 2));

  console.log("\n=== BRAIN V2 VALIDATION: SUMMARY REPORT ===");
  console.log(JSON.stringify(summaryReport, null, 2));

  console.log("\n=== HUMAN-READABLE SUMMARY ===");
  console.log(`Workspace: ${workspace.slug} (${workspaceHash.slice(0, 12)}...)`);
  console.log(`Seeded events: ${seeded.seededPrompts} prompts + ${seeded.seededFeedback} feedback (${observedSeedCount} observed)`);
  console.log(`Health score (7d): ${healthSummary.windows.last7Days.overallHealthScore}`);
  console.log(`Health score (30d): ${healthSummary.windows.last30Days.overallHealthScore}`);
  console.log(`Feedback positive % (7d): ${healthSummary.windows.last7Days.feedback.positiveRatePercent}`);
  console.log(`Dream compression ratio (7d): ${healthSummary.windows.last7Days.dreamCycle.compressionRatio}`);
  console.log(`Pruning safety ratio (7d): ${healthSummary.windows.last7Days.pruning.pruningSafetyRatio}`);
  console.log(`Export ZIP: ${exportResult.zipPath}`);
  console.log(`Export size: ${formatBytes(exportResult.zipSizeBytes)} (${exportResult.zipSizeBytes} bytes)`);
  console.log(`Export file count: ${exportCheck.fileCount}`);
  console.log(`Export structure valid: ${exportCheck.ok ? "yes" : "no"}`);

  if (signalNoiseTemplate.length > 0) {
    console.log("Signal vs noise review template:");
    for (const [index, row] of signalNoiseTemplate.entries()) {
      console.log(`  ${index + 1}. [${row.rating}] ${row.promotedInsight}`);
      console.log(`     Source: ${row.sourceFile}`);
      console.log(`     Notes: ${row.reviewNotes}`);
    }
  }
}

main().catch((error) => {
  console.error("[validate-brain-v2] failed", error);
  process.exit(1);
});
