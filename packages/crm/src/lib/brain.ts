import { createHash } from "node:crypto";
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
  | "seldon_it_applied";

const PII_FIELD_NAMES = new Set(["email", "phone", "name", "full_name", "first_name", "last_name"]);
const FREE_TEXT_FIELDS = new Set(["description", "notes", "message", "content", "query_summary", "prompt", "query"]);

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
  const normalizedKey = key.toLowerCase();

  if (typeof value === "string") {
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

export function writeEvent(workspaceId: string, eventType: BrainEventType, payload: Record<string, unknown>): Promise<void> {
  try {
    const workspaceHash = toSha256(workspaceId);
    const anonymizedPayload = anonymizePayload(payload);

    void db
      .insert(brainEvents)
      .values({
        workspaceId: workspaceHash,
        eventType,
        payload: anonymizedPayload,
        anonymized: true,
      })
      .catch((error) => {
        console.error("[BRAIN_WRITE_EVENT_FAILED]", error);
      });
  } catch (error) {
    console.error("[BRAIN_WRITE_EVENT_FATAL]", error);
  }

  return Promise.resolve();
}
