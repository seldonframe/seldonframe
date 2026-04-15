import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import { brainCompilationRuns, brainEvents } from "@/db/schema";

const BRAIN_WIKI_ROOT = process.env.BRAIN_WIKI_ROOT?.trim() || "/brain/wiki";
const WORKSPACES_ROOT = path.join(BRAIN_WIKI_ROOT, "workspaces");
const COMPILER_MODEL = process.env.BRAIN_COMPILER_MODEL?.trim() || "claude-3-5-haiku-latest";

type BrainEventRow = {
  eventId: string;
  workspaceId: string;
  timestamp: Date;
  eventType: string;
  payload: Record<string, unknown>;
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
    .where(gt(brainEvents.timestamp, since));

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
    })
    .from(brainEvents)
    .where(and(inArray(brainEvents.workspaceId, workspaceIds), gt(brainEvents.timestamp, since)));
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

async function writeWorkspaceWiki(workspaceId: string, events: BrainEventRow[]) {
  const workspaceDir = path.join(WORKSPACES_ROOT, workspaceId);
  await mkdir(workspaceDir, { recursive: true });

  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthlyPath = path.join(workspaceDir, `${monthKey}.md`);
  const summaryPath = path.join(workspaceDir, "summary.md");

  const summary = await compileWorkspaceSummaryWithHaiku(workspaceId, events);
  const rollup = buildMonthlyRollup(events);

  await writeFile(summaryPath, `${summary.trim()}\n`, "utf8");

  let existingRollup = "";
  try {
    existingRollup = await readFile(monthlyPath, "utf8");
  } catch {
    existingRollup = "";
  }

  const nextRollup = existingRollup.trim().length > 0 ? `${existingRollup.trim()}\n\n${rollup.trim()}\n` : rollup;
  await writeFile(monthlyPath, nextRollup, "utf8");

  return [summaryPath, monthlyPath];
}

export async function runBrainCompilationJob() {
  const since = await getLastSuccessfulRunAt();
  const workspaceIds = await getWorkspaceIdsWithNewEvents(since);

  if (workspaceIds.length === 0) {
    await db.insert(brainCompilationRuns).values({
      status: "success",
      eventsProcessed: 0,
      articlesUpdated: [],
    });

    return {
      ok: true,
      since,
      workspacesCompiled: 0,
      eventsProcessed: 0,
      articlesUpdated: [] as string[],
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
  for (const workspaceId of workspaceIds) {
    const workspaceEvents = eventsByWorkspace.get(workspaceId) ?? [];
    if (workspaceEvents.length === 0) {
      continue;
    }

    const generatedPaths = await writeWorkspaceWiki(workspaceId, workspaceEvents);
    articlesUpdated.push(...generatedPaths);
  }

  await db.insert(brainCompilationRuns).values({
    status: "success",
    eventsProcessed: events.length,
    articlesUpdated,
  });

  return {
    ok: true,
    since,
    workspacesCompiled: workspaceIds.length,
    eventsProcessed: events.length,
    articlesUpdated,
  };
}
