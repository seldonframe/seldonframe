import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { brainEvents } from "@/db/schema";

export type BrainEventType =
  | "workspace_created"
  | "pipeline_stage_advanced"
  | "form_submitted"
  | "booking_created"
  | "booking_completed"
  | "payment_received"
  | "custom_block_applied"
  | "seldon_it_applied"
  | "openclaw_scope_denied"
  | "vertical_pack_generated"
  | "vertical_pack_installed"
  | "caldiy_block_configured"
  | "formbricks_block_configured";

export type BlockRewriteSuggestion = {
  original_snippet: string;
  suggested_improvement: string;
  reason: string;
  confidence_score: number;
  expected_impact: string;
  risk_level: "low" | "medium" | "high";
};

const PII_FIELD_NAMES = new Set(["email", "phone", "name", "full_name", "first_name", "last_name"]);
const FREE_TEXT_FIELDS = new Set(["description", "notes", "message", "content", "query_summary", "prompt", "query"]);
const HASHED_IDENTIFIER_FIELDS = new Set(["client_id", "clientid", "contact_id", "contactid", "person_id", "personid", "user_id", "userid"]);
const SALIENCE_MODEL = process.env.BRAIN_SALIENCE_MODEL?.trim() || "claude-haiku-4-5-20251001";
const BLOCK_REWRITE_RISK_LEVELS = new Set<BlockRewriteSuggestion["risk_level"]>(["low", "medium", "high"]);

function sanitizeSuggestionText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return "";
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function normalizeSuggestionConfidence(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (numeric < 0 || numeric > 1) {
    return null;
  }

  return Math.round(numeric * 1000) / 1000;
}

function normalizeBlockRewriteSuggestion(input: unknown): BlockRewriteSuggestion | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  const originalSnippet = sanitizeSuggestionText(record.original_snippet, 1800);
  const suggestedImprovement = sanitizeSuggestionText(record.suggested_improvement, 2400);
  const reason = sanitizeSuggestionText(record.reason, 1800);
  const expectedImpact = sanitizeSuggestionText(record.expected_impact, 240);
  const confidenceScore = normalizeSuggestionConfidence(record.confidence_score);
  const riskLevel = typeof record.risk_level === "string" ? record.risk_level.trim().toLowerCase() : "";

  if (!originalSnippet || !suggestedImprovement || !reason || !expectedImpact) {
    return null;
  }

  if (!reason.match(/(event|pattern|salience|score|recurr|spike|drop)/i)) {
    return null;
  }

  if (confidenceScore === null) {
    return null;
  }

  if (!BLOCK_REWRITE_RISK_LEVELS.has(riskLevel as BlockRewriteSuggestion["risk_level"])) {
    return null;
  }

  return {
    original_snippet: originalSnippet,
    suggested_improvement: suggestedImprovement,
    reason,
    confidence_score: confidenceScore,
    expected_impact: expectedImpact,
    risk_level: riskLevel as BlockRewriteSuggestion["risk_level"],
  };
}

function clampSalience(value: number) {
  if (!Number.isFinite(value)) {
    return 0.5;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return Math.round(value * 1000) / 1000;
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  return new Anthropic({ apiKey });
}

function calculateHeuristicSalience(eventType: string, payload: Record<string, unknown>) {
  const normalizedType = eventType.toLowerCase();
  let score = 0.35;

  if (normalizedType.includes("payment") || normalizedType.includes("checkout") || normalizedType.includes("invoice")) {
    score += 0.35;
  }

  if (normalizedType.includes("booking") || normalizedType.includes("form_submitted")) {
    score += 0.2;
  }

  if (normalizedType.includes("error") || String(payload.status ?? "").toLowerCase() === "error") {
    score += 0.2;
  }

  if (typeof payload.revenue === "number" || typeof payload.amount === "number") {
    score += 0.15;
  }

  const summary = payload.query_summary;
  if (summary && typeof summary === "object" && typeof (summary as Record<string, unknown>).char_count === "number") {
    const charCount = (summary as Record<string, unknown>).char_count as number;
    if (charCount > 100) {
      score += 0.05;
    }
  }

  return clampSalience(score);
}

export async function calculateSalienceScore(eventType: string, payload: Record<string, unknown>): Promise<number> {
  const client = getAnthropicClient();
  const heuristic = calculateHeuristicSalience(eventType, payload);

  if (!client) {
    return heuristic;
  }

  try {
    const response = await client.messages.create({
      model: SALIENCE_MODEL,
      max_tokens: 12,
      temperature: 0,
      system:
        "You score business event salience from 0 to 1. Consider business impact, rarity, recency, revenue correlation, and emotional weight for service businesses. Return only a raw decimal number like 0.742.",
      messages: [
        {
          role: "user",
          content: `event_type: ${eventType}\npayload: ${JSON.stringify(payload).slice(0, 1200)}\nscore:`,
        },
      ],
    });

    const text = response.content
      .map((part) => (part.type === "text" ? part.text ?? "" : ""))
      .join("\n")
      .trim();

    const parsed = Number.parseFloat(text.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(parsed)) {
      return heuristic;
    }

    return clampSalience(parsed);
  } catch {
    return heuristic;
  }
}

function toSha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function summarizeFreeText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { summary: "", char_count: 0, field_type: "free_text" as const };
  }

  return {
    summary: trimmed.slice(0, 140),
    char_count: trimmed.length,
    field_type: "free_text" as const,
  };
}

function anonymizeValue(key: string, value: unknown): unknown {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "");

  if (typeof value === "string") {
    if (HASHED_IDENTIFIER_FIELDS.has(normalizedKey) || normalizedKey === "id" || normalizedKey.endsWith("_id")) {
      return toSha256(value);
    }

    if (PII_FIELD_NAMES.has(normalizedKey)) {
      return `CLIENT-${toSha256(value).slice(0, 12)}`;
    }

    if (normalizedKey.includes("email")) {
      return toSha256(value);
    }

    if (FREE_TEXT_FIELDS.has(normalizedKey)) {
      return summarizeFreeText(value);
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => anonymizeValue(key, item));
  }

  if (value && typeof value === "object") {
    return anonymizePayload(value as Record<string, unknown>);
  }

  return value;
}

function anonymizePayload(payload: Record<string, unknown>) {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    output[key] = anonymizeValue(key, value);
  }

  return output;
}

function normalizeFeedbackScore(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value > 0) {
    return 1;
  }

  if (value < 0) {
    return -1;
  }

  return 0;
}

export function writeEvent(workspaceId: string, eventType: BrainEventType, payload: Record<string, unknown>): Promise<void> {
  try {
    const workspaceHash = toSha256(workspaceId);
    const normalizedFeedbackScore = normalizeFeedbackScore(payload.feedback_score);
    const anonymizedPayload = anonymizePayload(payload);

    void (async () => {
      const salienceScore = await calculateSalienceScore(eventType, anonymizedPayload);

      await db.insert(brainEvents).values({
        workspaceId: workspaceHash,
        eventType,
        payload: anonymizedPayload,
        salienceScore,
        feedbackScore: normalizedFeedbackScore,
        anonymized: true,
      });

      console.info("[brain] event salience scored", {
        eventType,
        workspaceId: workspaceHash,
        salienceScore,
        feedbackScore: normalizedFeedbackScore,
      });
    })().catch((error) => {
      console.error("[BRAIN_WRITE_EVENT_FAILED]", error);
    });
  } catch (error) {
    console.error("[BRAIN_WRITE_EVENT_FATAL]", error);
  }

  return Promise.resolve();
}

export function proposeBlockRewrite(blockName: string, suggestion: object): BlockRewriteSuggestion | null {
  const normalizedName = String(blockName || "").trim();
  if (!normalizedName) {
    console.warn("[brain] rewrite proposal rejected: missing block name");
    return null;
  }

  const normalizedSuggestion = normalizeBlockRewriteSuggestion(suggestion);
  if (!normalizedSuggestion) {
    console.warn("[brain] rewrite proposal rejected: invalid schema", { blockName: normalizedName });
    return null;
  }

  console.info("[brain] rewrite proposal created", {
    blockName: normalizedName,
    confidenceScore: normalizedSuggestion.confidence_score,
    riskLevel: normalizedSuggestion.risk_level,
  });

  return normalizedSuggestion;
}
