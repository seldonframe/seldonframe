"use server";

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { brainEvents, organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { hashWorkspaceId } from "@/lib/brain-manifest";
import { assertWritable } from "@/lib/demo/server";

const BRAIN_WIKI_ROOT = process.env.BRAIN_WIKI_ROOT?.trim() || "/brain/wiki";
const WORKSPACES_ROOT = path.join(BRAIN_WIKI_ROOT, "workspaces");
const PERSONAL_ROOT = path.join(BRAIN_WIKI_ROOT, "personal");
const EXPORT_ROOT = path.join(process.cwd(), ".cache", "agent-exports");
const DREAM_SALIENCE_THRESHOLD = 0.6;
const MAX_EVENTS = 150;
const MAX_SEMANTIC_FILES = 200;
const MAX_PERSONAL_FILES = 120;
const MAX_BLOCK_FILES = 220;

export type PortableAgentExportResult = {
  ok: boolean;
  workspaceId: string;
  workspaceHash: string;
  exportDir: string;
  zipPath: string;
  zipSizeBytes: number;
  generatedAt: string;
  fileCount: number;
  warning?: string;
};

type ZipEntry = {
  filePath: string;
  data: Buffer;
};

function normalizeSlashes(value: string) {
  return value.replace(/\\/g, "/");
}

function isHashedWorkspaceId(value: string) {
  return /^[a-f0-9]{64}$/i.test(value.trim());
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
      entries = await readdir(current, { withFileTypes: true, encoding: "utf8" });
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

async function collectMarkdownFiles(rootDir: string, limit = 200) {
  const output: string[] = [];
  const queue = [rootDir];

  while (queue.length > 0 && output.length < limit) {
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
      if (output.length >= limit) {
        break;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        output.push(fullPath);
      }
    }
  }

  return output;
}

async function writeAgentFile(agentRoot: string, relativePath: string, content: string) {
  const fullPath = path.join(agentRoot, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf8");
}

function resolveHarnessRulesPath() {
  const candidates = [
    path.join(process.cwd(), "harness-rules.json"),
    path.join(process.cwd(), "packages", "crm", "harness-rules.json"),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

async function readHarnessRules() {
  const harnessPath = resolveHarnessRulesPath();
  if (!harnessPath) {
    return {} as Record<string, unknown>;
  }

  try {
    const raw = await readFile(harnessPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

function buildPrivacyRulesExcerpt() {
  return {
    source: "SeldonFrame Privacy Policy (April 2026)",
    highlights: [
      "We do NOT sell workspace data to third parties.",
      "We do NOT use business or client data to train AI models.",
      "Payment details are processed by Stripe; card numbers are not stored by SeldonFrame.",
      "Data is encrypted in transit and sensitive credentials are encrypted at rest.",
      "Users can export data and request deletion of associated data.",
    ],
  };
}

function buildSoulStub(org: { name: string; slug: string; soul: unknown }) {
  const soul = org.soul && typeof org.soul === "object" ? (org.soul as Record<string, unknown>) : {};
  const voice = typeof soul.voice === "string" ? soul.voice : "Not specified";
  const archetype = typeof soul.archetype === "string" ? soul.archetype : "Not specified";
  const promise = typeof soul.promise === "string" ? soul.promise : "Not specified";

  return [
    "# SOUL.md",
    "",
    "## Identity Summary",
    `- Organization: ${org.name}`,
    `- Slug: ${org.slug}`,
    `- Voice: ${voice}`,
    `- Archetype: ${archetype}`,
    `- Core Promise: ${promise}`,
    "",
    "## Notes",
    "- This file is a portable stub for MCP-compatible harnesses.",
    "- Importing back into SeldonFrame should merge with canonical org soul settings.",
    "",
  ].join("\n");
}

function buildReadme(params: {
  workspaceHash: string;
  generatedAt: string;
  semanticCount: number;
  personalCount: number;
  blockCount: number;
  eventCount: number;
}) {
  return [
    "# Portable Brain Export (.agent)",
    "",
    "This archive contains a portable workspace brain package designed for MCP-compatible harnesses (Claude Code, Cursor, Windsurf, and similar).",
    "",
    "## Included",
    "- `memory/episodic/`: recent high-salience events",
    "- `memory/semantic/`: semantic wiki articles",
    "- `memory/personal/`: personal dream notes + rewrite suggestions",
    "- `skills/`: BLOCK.md files + `brain-manifest.json`",
    "- `protocols/`: harness rules + privacy excerpt",
    "- `SOUL.md`: workspace identity stub",
    "",
    "## Import (Current Status)",
    "- Full import flow is not enabled yet.",
    "- Use the included files directly in your MCP harness as local context.",
    "- Future SeldonFrame import should restore these folders under the canonical brain paths.",
    "",
    "## Metadata",
    `- Workspace hash: ${params.workspaceHash}`,
    `- Generated at: ${params.generatedAt}`,
    `- Episodic events: ${params.eventCount}`,
    `- Semantic files: ${params.semanticCount}`,
    `- Personal files: ${params.personalCount}`,
    `- Skill BLOCK files: ${params.blockCount}`,
    "",
  ].join("\n");
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = buildCrc32Table();

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDateTime(date: Date) {
  const year = Math.max(1980, date.getUTCFullYear());
  const dosTime = ((date.getUTCHours() & 0x1f) << 11) | ((date.getUTCMinutes() & 0x3f) << 5) | ((Math.floor(date.getUTCSeconds() / 2)) & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | (((date.getUTCMonth() + 1) & 0x0f) << 5) | (date.getUTCDate() & 0x1f);
  return { dosTime, dosDate };
}

function createZipBuffer(entries: ZipEntry[]) {
  const now = zipDateTime(new Date());
  const fileParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(normalizeSlashes(entry.filePath), "utf8");
    const data = entry.data;
    const entryCrc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(now.dosTime, 10);
    localHeader.writeUInt16LE(now.dosDate, 12);
    localHeader.writeUInt32LE(entryCrc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    fileParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(now.dosTime, 12);
    centralHeader.writeUInt16LE(now.dosDate, 14);
    centralHeader.writeUInt32LE(entryCrc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirSize, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...fileParts, ...centralParts, endRecord]);
}

async function collectAllFiles(rootDir: string) {
  const files: string[] = [];
  const queue = [rootDir];

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
        files.push(fullPath);
      }
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

export async function exportWorkspaceAsAgentAction(input?: { workspaceId?: string | null }): Promise<PortableAgentExportResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const requestedWorkspaceId = String(input?.workspaceId ?? "").trim();
  const workspaceId = requestedWorkspaceId || orgId;
  const workspaceHash = isHashedWorkspaceId(workspaceId) ? workspaceId : hashWorkspaceId(workspaceId);

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, soul: organizations.soul })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const exportBaseDir = path.join(EXPORT_ROOT, `${workspaceHash}-${runStamp}`);
  const agentRoot = path.join(exportBaseDir, ".agent");
  const zipPath = path.join(exportBaseDir, `${workspaceHash}.agent.zip`);
  await mkdir(agentRoot, { recursive: true });

  const [events, harnessRules] = await Promise.all([
    db
      .select({
        eventId: brainEvents.eventId,
        eventType: brainEvents.eventType,
        salienceScore: brainEvents.salienceScore,
        timestamp: brainEvents.timestamp,
        payload: brainEvents.payload,
      })
      .from(brainEvents)
      .where(and(eq(brainEvents.workspaceId, workspaceHash), gt(brainEvents.salienceScore, DREAM_SALIENCE_THRESHOLD)))
      .orderBy(desc(brainEvents.timestamp))
      .limit(MAX_EVENTS),
    readHarnessRules(),
  ]);

  await writeAgentFile(
    agentRoot,
    "memory/episodic/high-salience-events.json",
    `${JSON.stringify(
      events.map((event) => ({
        eventId: event.eventId,
        eventType: event.eventType,
        salienceScore: event.salienceScore,
        timestamp: event.timestamp?.toISOString?.() ?? String(event.timestamp),
        payload: event.payload,
      })),
      null,
      2
    )}\n`
  );

  const semanticFiles: string[] = [];
  for (const category of ["industries", "concepts", "insights"] as const) {
    const categoryRoot = path.join(BRAIN_WIKI_ROOT, category);
    const files = await collectMarkdownFiles(categoryRoot, Math.floor(MAX_SEMANTIC_FILES / 3));
    for (const filePath of files) {
      try {
        const content = await readFile(filePath, "utf8");
        const relative = normalizeSlashes(path.relative(categoryRoot, filePath));
        await writeAgentFile(agentRoot, `memory/semantic/${category}/${relative}`, content);
        semanticFiles.push(filePath);
      } catch {
        continue;
      }
    }
  }

  const personalRoot = path.join(PERSONAL_ROOT, workspaceHash);
  const personalFiles = await collectMarkdownFiles(personalRoot, MAX_PERSONAL_FILES);
  for (const filePath of personalFiles) {
    try {
      const content = await readFile(filePath, "utf8");
      const relative = normalizeSlashes(path.relative(personalRoot, filePath));
      await writeAgentFile(agentRoot, `memory/personal/${relative}`, content);
    } catch {
      continue;
    }
  }

  const skillsRoots = [
    path.join(process.cwd(), "openclaw", "skills"),
    path.join(process.cwd(), "packages", "crm"),
  ];

  const blockFiles: Array<{ root: string; blockPath: string }> = [];
  for (const root of skillsRoots) {
    const files = await collectFilesNamed(root, "BLOCK.md", Math.floor(MAX_BLOCK_FILES / skillsRoots.length));
    for (const blockPath of files) {
      blockFiles.push({ root, blockPath });
    }
  }

  for (const block of blockFiles) {
    try {
      const content = await readFile(block.blockPath, "utf8");
      const relative = normalizeSlashes(path.relative(block.root, block.blockPath));
      const rootLabel = path.basename(block.root) || "root";
      await writeAgentFile(agentRoot, `skills/blocks/${rootLabel}/${relative}`, content);
    } catch {
      continue;
    }
  }

  const manifestSourcePath = path.join(WORKSPACES_ROOT, workspaceHash, "brain-manifest.json");
  try {
    const manifest = await readFile(manifestSourcePath, "utf8");
    await writeAgentFile(agentRoot, "skills/brain-manifest.json", manifest);
  } catch {
    await writeAgentFile(
      agentRoot,
      "skills/brain-manifest.json",
      `${JSON.stringify(
        {
          workspaceId: workspaceHash,
          generatedAt: new Date().toISOString(),
          note: "No workspace manifest found at export time.",
        },
        null,
        2
      )}\n`
    );
  }

  await writeAgentFile(agentRoot, "protocols/harness-rules.json", `${JSON.stringify(harnessRules, null, 2)}\n`);
  await writeAgentFile(agentRoot, "protocols/privacy-rules.json", `${JSON.stringify(buildPrivacyRulesExcerpt(), null, 2)}\n`);
  await writeAgentFile(agentRoot, "SOUL.md", buildSoulStub({ name: org.name, slug: org.slug, soul: org.soul }));

  const readme = buildReadme({
    workspaceHash,
    generatedAt: new Date().toISOString(),
    semanticCount: semanticFiles.length,
    personalCount: personalFiles.length,
    blockCount: blockFiles.length,
    eventCount: events.length,
  });
  await writeAgentFile(agentRoot, "README.md", readme);

  const allFiles = await collectAllFiles(agentRoot);
  const zipEntries: ZipEntry[] = [];
  for (const filePath of allFiles) {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      continue;
    }

    const data = await readFile(filePath);
    const relative = normalizeSlashes(path.relative(agentRoot, filePath));
    zipEntries.push({ filePath: `.agent/${relative}`, data });
  }

  const zipBuffer = createZipBuffer(zipEntries);
  await mkdir(path.dirname(zipPath), { recursive: true });
  await writeFile(zipPath, zipBuffer);

  return {
    ok: true,
    workspaceId,
    workspaceHash,
    exportDir: agentRoot,
    zipPath,
    zipSizeBytes: zipBuffer.length,
    generatedAt: new Date().toISOString(),
    fileCount: zipEntries.length,
    warning: zipEntries.length === 0 ? "No files were written to the export." : undefined,
  };
}

export async function importWorkspaceFromAgentStubAction() {
  return {
    ok: false as const,
    message: "Import from .agent is not implemented yet. This is a placeholder for Phase 3 follow-up.",
  };
}
