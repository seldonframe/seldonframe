// "Make it fit anybody" — the REAL LLM-backed `GeneralizationLlm` (Task 2).
//
// Mirrors evals/score-llm.ts's shape byte-for-byte: an injectable `getClient`
// (defaults to getAnthropicClient — null when no key, which here means "no
// proposals" rather than a silent empty pass, see below), a model id read at
// call time, and a strict JSON-only system prompt whose output is parsed
// DEFENSIVELY. Unlike the eval grader this does NOT fail soft to an empty
// result on a parse/network error — `proposeTemplateGeneralization` (the pure
// core) treats a thrown/`null` LLM result as an EXPLICIT error the operator
// must see (Optimistic Path rule: a failed generalization pass must never
// look identical to "no personal details found").

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/ai/client";
import type { GeneralizationLlm, ProposedSubstitution } from "./generalize";

export const DEFAULT_GENERALIZATION_MODEL = "claude-haiku-4-5";

const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = [
  "You read an AI agent's persona/skill instructions (customSkillMd) and find PERSONAL or ORG-SPECIFIC literals that would leak the AUTHOR's own identity into someone else's deployment of this template — a personal email address, a personal name used informally, a specific phone number, an org-specific phrase like a first name greeting ('yo max check this out'), a specific street address, or similar.",
  "For EACH such literal, propose a substitution: a snake_case `token` (lowercase letters/digits/underscore only, 2-40 chars) that names what the value REPRESENTS (e.g. \"contact_email\", \"business_name\", \"owner_first_name\"), the EXACT literal `currentValue` as it appears verbatim in the text (character-for-character — this will be used for an exact-string replace), a one-sentence `description` of what a deploying client should fill in, and a plausible `example` value.",
  "Do NOT propose a substitution for generic, non-identifying prose (tone instructions, generic FAQ content, generic booking rules) — only literals that are SPECIFIC to this one author/org.",
  'Return ONLY a JSON array of the shape: [{"token": string, "currentValue": string, "description": string, "example": string}, ...]. An empty array `[]` is a valid, complete answer when nothing personal was found.',
  "Do not include any prose, explanation, or markdown fences outside the JSON array. Output JSON only.",
].join("\n");

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function isValidRow(v: unknown): v is ProposedSubstitution {
  if (!v || typeof v !== "object") return false;
  const row = v as Record<string, unknown>;
  return (
    typeof row.token === "string" &&
    /^[a-z0-9_]{2,40}$/.test(row.token) &&
    typeof row.currentValue === "string" &&
    row.currentValue.trim().length > 0 &&
    typeof row.description === "string" &&
    typeof row.example === "string"
  );
}

/** Parse the model's raw text into a clean `ProposedSubstitution[]`, or `null`
 *  if the output isn't a clean JSON array of valid rows. Never throws. */
export function parseGeneralizationResponse(raw: string): ProposedSubstitution[] | null {
  if (typeof raw !== "string") return null;
  const stripped = stripFences(raw);
  if (!stripped) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  if (!parsed.every(isValidRow)) return null;
  return parsed;
}

/**
 * Build the real Haiku-backed `GeneralizationLlm`. `getClient` is the DI seam
 * (defaults to getAnthropicClient); tests inject a fake. No key configured →
 * returns `null` (the pure core's `proposeTemplateGeneralization` turns any
 * non-array result into an explicit `malformed_llm_output` error — never a
 * silently-empty proposals list, since "no key" and "nothing personal found"
 * must not look the same to the operator).
 */
export function makeGeneralizationLlm(
  deps: { getClient?: () => Anthropic | null } = {},
): GeneralizationLlm {
  const getClient = deps.getClient ?? getAnthropicClient;

  return async ({ customSkillMd }): Promise<ProposedSubstitution[] | null> => {
    const client = getClient();
    if (!client) return null;

    const model = process.env.ANTHROPIC_EVAL_MODEL?.trim() || DEFAULT_GENERALIZATION_MODEL;

    const resp = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: customSkillMd }],
    });

    const out = resp.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return parseGeneralizationResponse(out);
  };
}
