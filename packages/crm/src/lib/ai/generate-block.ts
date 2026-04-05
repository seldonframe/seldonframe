import { getAnthropicClient } from "@/lib/ai/client";
import { assembleBlockContext } from "@/lib/ai/context";
import { validateMigrationSQL } from "@/lib/db/migration-safety";
import { generateMarketplaceBlockCodeFromBlockMd, type GeneratedBlockCode } from "@/lib/marketplace/actions";
import { db } from "@/db";
import { marketplaceBlocks } from "@/db/schema";
import { and, desc, eq, ilike, or } from "drizzle-orm";

const SELDON_MODEL = process.env.SELDON_MODEL?.trim() || "claude-sonnet-4-20250514";

export type ClarifyingQuestion = {
  id: string;
  question: string;
};

export type ClarifyingQuestionResult = {
  needsClarification: boolean;
  questions: ClarifyingQuestion[];
};

type InventoryCandidate = {
  blockId: string;
  name: string;
  description: string;
  blockMd: string;
  ratingAverage: string | null;
};

export type InventoryMatchResult = {
  match: InventoryCandidate | null;
  score: number;
  reason: string;
};

export type BlockMdBuildResult = {
  blockMd: string;
  summary: string;
  fromInventory: boolean;
  matchScore: number;
  matchedBlockId: string | null;
};

export type PlannedBlockSpec = {
  need: string;
  result: BlockMdBuildResult;
};

export type MigrationExecutionDecision =
  | { mode: "instant"; reason: "safe_sql" | "no_sql" }
  | { mode: "queue_review"; reason: "unsafe_sql" };

const DEFAULT_QUESTIONS: ClarifyingQuestion[] = [
  { id: "goal", question: "What is the primary business outcome this block should drive?" },
  { id: "trigger", question: "What event should trigger this block?" },
  { id: "success", question: "How should we measure success for this block?" },
];

function extractText(content: Array<{ type: string; text?: string }>) {
  return content
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("\n")
    .trim();
}

function extractKeywords(input: string) {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "into",
    "your",
    "you",
    "our",
    "after",
    "before",
    "when",
    "then",
    "have",
    "want",
    "need",
  ]);

  const words = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !stopWords.has(word));

  return Array.from(new Set(words)).slice(0, 8);
}

function fallbackBlockMd(description: string) {
  const title = description.split("\n")[0]?.slice(0, 72) || "Custom Block";

  return `---
name: "${title}"
version: "1.0.0"
author: "Seldon It"
framework: "custom"
requires: ["crm"]
integrations: []
---

## Description
${description}

## Resources Created
- custom_resource: ${title}

## Configuration
\`\`\`json
{
  "resource": {
    "name": "${title}"
  }
}
\`\`\`

## Install
This block installs into an existing SeldonFrame workspace.
Resources are created in the relevant tables.`;
}

function summarizeBlockMd(blockMd: string) {
  const lines = blockMd
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("-") || line.startsWith("###"))
    .slice(0, 4)
    .map((line) => line.replace(/^###\s*/, ""));

  return lines.length > 0 ? lines.join("\n") : "- Generated BLOCK.md ready for review";
}

function parseJsonResponse<T>(raw: string): T | null {
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

function toQuestionId(input: string, idx: number) {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  return normalized || `question-${idx + 1}`;
}

export async function generateClarifyingQuestions(input: {
  description: string;
  businessContext?: string;
}): Promise<ClarifyingQuestionResult> {
  const description = input.description.trim();

  if (!description) {
    return {
      needsClarification: true,
      questions: DEFAULT_QUESTIONS,
    };
  }

  const client = getAnthropicClient();

  if (!client) {
    return {
      needsClarification: description.length < 120,
      questions: description.length < 120 ? DEFAULT_QUESTIONS : [],
    };
  }

  const response = await client.messages.create({
    model: SELDON_MODEL,
    max_tokens: 700,
    messages: [
      {
        role: "user",
        content: `You help prepare a software block spec for generation. Decide whether clarification is needed before generation and return concise questions.

Return ONLY valid JSON in this exact shape:
{
  "needsClarification": boolean,
  "questions": ["question 1", "question 2"]
}

Rules:
- Ask 0 to 5 questions.
- Ask questions only when missing information would produce poor results.
- Prefer concrete implementation details: trigger, audience, timing, integrations, constraints, and success metric.
- Keep each question under 16 words.

Business context (optional):
${input.businessContext ?? "not provided"}

User request:
${description}`,
      },
    ],
  });

  const text = extractText(response.content as Array<{ type: string; text?: string }>);
  const parsed = parseJsonResponse<{ needsClarification?: boolean; questions?: unknown }>(text);

  const rawQuestions = Array.isArray(parsed?.questions)
    ? parsed?.questions.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];

  const normalizedQuestions = rawQuestions.slice(0, 5).map((question, idx) => ({
    id: toQuestionId(question, idx),
    question: question.trim(),
  }));

  const needsClarification = Boolean(parsed?.needsClarification) && normalizedQuestions.length > 0;

  return {
    needsClarification,
    questions: needsClarification ? normalizedQuestions : [],
  };
}

export function mergeClarifyingAnswers(input: {
  description: string;
  answers: Array<{ question: string; answer: string }>;
}) {
  const cleanedAnswers = input.answers
    .map((item) => ({ question: item.question.trim(), answer: item.answer.trim() }))
    .filter((item) => item.question.length > 0 && item.answer.length > 0);

  if (cleanedAnswers.length === 0) {
    return input.description.trim();
  }

  const appendix = cleanedAnswers.map((item) => `- ${item.question}: ${item.answer}`).join("\n");

  return `${input.description.trim()}\n\nClarifications:\n${appendix}`;
}

export async function decomposeRequest(description: string, enrichedDescription?: string): Promise<string[]> {
  const source = (enrichedDescription || description).trim();

  if (!source) {
    return [];
  }

  const client = getAnthropicClient();

  if (!client) {
    return [source.slice(0, 500)];
  }

  const response = await client.messages.create({
    model: SELDON_MODEL,
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: `Break this request into block-sized units.\n\nWhen the user asks for multiple connected things (e.g., "build me an onboarding flow with intake form, welcome sequence, and booking page"), create ALL of them in a single response. List each created resource separately in the output. Connect them to each other — the form feeds the CRM, the CRM triggers the email sequence, the booking link goes in the email.\n\nReturn ONLY JSON:\n{ "blocks": ["piece 1", "piece 2"] }\n\nRules:\n- 1 to 8 pieces\n- each piece must be independently useful\n- each piece should be 1 sentence\n- preserve connected flow order when request describes a funnel\n- prefer practical implementation language\n\nRequest:\n${source}`,
      },
    ],
  });

  const parsed = parseJsonResponse<{ blocks?: unknown }>(extractText(response.content as Array<{ type: string; text?: string }>));
  const blocks = Array.isArray(parsed?.blocks)
    ? parsed.blocks.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];

  return blocks.slice(0, 8).map((block) => block.slice(0, 240));
}

async function scoreInventoryMatch(params: {
  need: string;
  candidates: InventoryCandidate[];
}): Promise<{ bestIndex: number; score: number; reason: string } | null> {
  if (params.candidates.length === 0) {
    return null;
  }

  const client = getAnthropicClient();

  if (!client) {
    const normalized = params.need.toLowerCase();
    const scores = params.candidates.map((candidate, index) => {
      const haystack = `${candidate.name} ${candidate.description} ${candidate.blockMd}`.toLowerCase();
      const overlap = extractKeywords(normalized).filter((kw) => haystack.includes(kw)).length;
      const score = Math.min(0.95, overlap / 6);
      return { index, score };
    });

    const best = [...scores].sort((a, b) => b.score - a.score)[0];
    return best ? { bestIndex: best.index, score: best.score, reason: "keyword overlap fallback" } : null;
  }

  const response = await client.messages.create({
    model: SELDON_MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Pick the best matching inventory block for this need and score relevance from 0.0 to 1.0.\n\nReturn ONLY JSON:\n{ "bestIndex": 0, "score": 0.85, "reason": "..." }\n\nNeed:\n${params.need}\n\nCandidates:\n${params.candidates
          .map((candidate, index) => `${index}: ${candidate.name} — ${candidate.description}`)
          .join("\n")}`,
      },
    ],
  });

  const parsed = parseJsonResponse<{ bestIndex?: unknown; score?: unknown; reason?: unknown }>(
    extractText(response.content as Array<{ type: string; text?: string }>)
  );

  const bestIndex = typeof parsed?.bestIndex === "number" ? parsed.bestIndex : -1;
  const score = typeof parsed?.score === "number" ? parsed.score : 0;
  const reason = typeof parsed?.reason === "string" ? parsed.reason : "ai-scored";

  if (bestIndex < 0 || bestIndex >= params.candidates.length) {
    return null;
  }

  return { bestIndex, score: Math.max(0, Math.min(1, score)), reason };
}

export async function searchInventory(blockNeed: string): Promise<InventoryMatchResult> {
  const keywords = extractKeywords(blockNeed);

  const keywordFilters = keywords.flatMap((keyword) => [
    ilike(marketplaceBlocks.name, `%${keyword}%`),
    ilike(marketplaceBlocks.description, `%${keyword}%`),
    ilike(marketplaceBlocks.blockMd, `%${keyword}%`),
  ]);

  const rows = await db
    .select({
      blockId: marketplaceBlocks.blockId,
      name: marketplaceBlocks.name,
      description: marketplaceBlocks.description,
      blockMd: marketplaceBlocks.blockMd,
      ratingAverage: marketplaceBlocks.ratingAverage,
    })
    .from(marketplaceBlocks)
    .where(
      and(
        eq(marketplaceBlocks.generationStatus, "published"),
        keywordFilters.length > 0 ? or(...keywordFilters) : undefined
      )
    )
    .orderBy(desc(marketplaceBlocks.ratingAverage), desc(marketplaceBlocks.installCount))
    .limit(5);

  if (rows.length === 0) {
    return { match: null, score: 0, reason: "no candidates" };
  }

  const scored = await scoreInventoryMatch({
    need: blockNeed,
    candidates: rows,
  });

  if (!scored) {
    return { match: null, score: 0, reason: "unable to score candidates" };
  }

  const match = scored.score >= 0.7 ? rows[scored.bestIndex] : null;

  return {
    match,
    score: scored.score,
    reason: scored.reason,
  };
}

export async function descriptionToBlockMd(orgId: string, description: string): Promise<{ blockMd: string; summary: string }> {
  const context = await assembleBlockContext(orgId);
  const source = description.trim();

  if (!source) {
    const blockMd = fallbackBlockMd("Build a useful custom block.");
    return { blockMd, summary: summarizeBlockMd(blockMd) };
  }

  const client = getAnthropicClient();

  if (!client) {
    const blockMd = fallbackBlockMd(source);
    return { blockMd, summary: summarizeBlockMd(blockMd) };
  }

  const response = await client.messages.create({
    model: SELDON_MODEL,
    max_tokens: 6000,
    system: `You are creating a BLOCK.md specification for SeldonFrame. Output only valid BLOCK.md content and keep it concise (max 180 lines).\n\nWhen the user asks for multiple connected things (e.g., "build me an onboarding flow with intake form, welcome sequence, and booking page"), create ALL of them in a single response. List each created resource separately in the output. Connect them to each other — the form feeds the CRM, the CRM triggers the email sequence, the booking link goes in the email.\n\nAlways use this exact structure:\n---\nname: "[Block Name]"\nversion: "1.0.0"\nauthor: "[Author]"\nframework: "[framework]"\nrequires: ["crm"]\nintegrations: []\n---\n\n## Description\n[3-5 sentence description]\n\n## Resources Created\n- [resource_type]: [resource name] ([details])\n\n## Configuration\n\`\`\`json\n{\n  "resource": {}\n}\n\`\`\`\n\n## Install\nThis block installs into an existing SeldonFrame workspace.\nResources are created in the relevant tables.\n\nRules:\n- Use services only if connected in context\n- Include explicit connected flow relationships when multiple resources are created\n- Keep event names lowercase entity.action\n- Make the output previewable and reusable as a portable BLOCK.md package\n\n${context}`,
    messages: [{ role: "user", content: source }],
  });

  const blockMd = extractText(response.content as Array<{ type: string; text?: string }>) || fallbackBlockMd(source);

  const summaryResponse = await client.messages.create({
    model: SELDON_MODEL,
    max_tokens: 280,
    messages: [
      {
        role: "user",
        content: `Summarize this BLOCK.md in 3-4 bullets under 15 words each.\n\n${blockMd}`,
      },
    ],
  });

  const summary = extractText(summaryResponse.content as Array<{ type: string; text?: string }>) || summarizeBlockMd(blockMd);

  return { blockMd, summary };
}

async function customizeInventoryBlockMd(params: {
  orgId: string;
  blockNeed: string;
  inventory: InventoryCandidate;
}): Promise<{ blockMd: string; summary: string }> {
  const context = await assembleBlockContext(params.orgId);
  const client = getAnthropicClient();

  if (!client) {
    return {
      blockMd: params.inventory.blockMd,
      summary: "- Reused an inventory block with minimal customization",
    };
  }

  const response = await client.messages.create({
    model: SELDON_MODEL,
    max_tokens: 3500,
    system: `Customize an existing BLOCK.md with minimal diffs. Preserve structure and reliability. Keep output under 150 lines. Output only BLOCK.md.\n\n${context}`,
    messages: [
      {
        role: "user",
        content: `Existing BLOCK.md:\n\n${params.inventory.blockMd}\n\nNeed:\n${params.blockNeed}`,
      },
    ],
  });

  const blockMd = extractText(response.content as Array<{ type: string; text?: string }>) || params.inventory.blockMd;
  return { blockMd, summary: summarizeBlockMd(blockMd) };
}

export async function buildBlockMdForNeed(orgId: string, blockNeed: string): Promise<BlockMdBuildResult> {
  const inventory = await searchInventory(blockNeed);

  if (inventory.match && inventory.score >= 0.7) {
    const customized = await customizeInventoryBlockMd({
      orgId,
      blockNeed,
      inventory: inventory.match,
    });

    return {
      blockMd: customized.blockMd,
      summary: customized.summary,
      fromInventory: true,
      matchScore: inventory.score,
      matchedBlockId: inventory.match.blockId,
    };
  }

  const fresh = await descriptionToBlockMd(orgId, blockNeed);
  return {
    blockMd: fresh.blockMd,
    summary: fresh.summary,
    fromInventory: false,
    matchScore: inventory.score,
    matchedBlockId: null,
  };
}

export async function planBlockMds(input: {
  orgId: string;
  description: string;
  enrichedDescription?: string;
}) {
  const needs = await decomposeRequest(input.description, input.enrichedDescription);
  const effectiveNeeds = needs.length > 0 ? needs : [input.enrichedDescription || input.description];

  const planned: PlannedBlockSpec[] = [];
  for (const need of effectiveNeeds.slice(0, 8)) {
    const result = await buildBlockMdForNeed(input.orgId, need);
    planned.push({ need, result });
  }

  return planned;
}

export async function blockMdToCode(input: {
  orgId: string;
  blockId: string;
  blockMd: string;
  blockName?: string;
  blockDescription?: string;
}): Promise<GeneratedBlockCode> {
  return generateMarketplaceBlockCodeFromBlockMd({
    blockId: input.blockId,
    blockMd: input.blockMd,
    blockName: input.blockName,
    blockDescription: input.blockDescription,
  });
}

export function decideMigrationExecution(migrationSQL: string | null | undefined): MigrationExecutionDecision {
  const sql = (migrationSQL ?? "").trim();

  if (!sql) {
    return { mode: "instant", reason: "no_sql" };
  }

  return validateMigrationSQL(sql)
    ? { mode: "instant", reason: "safe_sql" }
    : { mode: "queue_review", reason: "unsafe_sql" };
}
