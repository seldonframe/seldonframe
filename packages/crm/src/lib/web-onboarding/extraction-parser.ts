// packages/crm/src/lib/web-onboarding/extraction-parser.ts
// Parses the raw text Anthropic emits after the web_fetch tool turn finishes.
// Looks for the first JSON object (optionally fenced) and validates that the
// 6 required keys from REQUIRED_FIELDS_SCHEMA are present + well-typed. Pure
// — no IO, fully unit-testable.
//
// Downstream typed validation happens inside createFullWorkspace's own
// validateInput() — this parser is just the "did we get a usable shape from
// the LLM?" gate.

import type { ExtractedBusinessFacts } from "./extraction-prompt";

export type ExtractionParseResult =
  | { ok: true; data: ExtractedBusinessFacts }
  | { ok: false; reason: "extraction_failed" };

function extractFirstJsonObject(input: string): unknown | null {
  const fenced = input.match(/```json\s*([\s\S]*?)```/i) ?? input.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? input.trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const REQUIRED_KEYS = [
  "business_name",
  "city",
  "state",
  "phone",
  "services",
  "business_description",
] as const;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every(isNonEmptyString);
}

export function parseExtraction(rawText: string): ExtractionParseResult {
  const parsed = extractFirstJsonObject(rawText);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "extraction_failed" };
  }

  const obj = parsed as Record<string, unknown>;

  if ("_error" in obj) {
    return { ok: false, reason: "extraction_failed" };
  }

  // Required field presence + type checks (mirror REQUIRED_FIELDS_SCHEMA).
  for (const key of REQUIRED_KEYS) {
    if (!(key in obj)) {
      return { ok: false, reason: "extraction_failed" };
    }
  }

  if (
    !isNonEmptyString(obj.business_name) ||
    !isNonEmptyString(obj.city) ||
    !isNonEmptyString(obj.state) ||
    !isNonEmptyString(obj.phone) ||
    !isNonEmptyString(obj.business_description) ||
    !isStringArray(obj.services)
  ) {
    return { ok: false, reason: "extraction_failed" };
  }

  // The object is structurally sound. Pass through to createFullWorkspace's
  // own validator for the deeper checks (state-code normalization, phone
  // format, etc.) — we don't duplicate that logic here.
  return { ok: true, data: obj as unknown as ExtractedBusinessFacts };
}
