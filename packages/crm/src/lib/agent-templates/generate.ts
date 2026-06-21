// ICP-3 — AI-assisted agent generator (pure logic, no "use server").
//
// Converts a single English sentence of intent into a TemplateBlueprintPatch
// via an LLM call. Dependency-injected so the unit tests run with a canned
// fake LLM — no real network, no Anthropic key required.
//
// Surface contract:
//   buildGeneratePrompt   → pure prompt builder (Task 3)
//   parseGeneratedDraft   → parse + validate + allow-list filter (Task 4)
//   generateDraft         → orchestrator that calls the LLM + retries (Task 5)
//
// Server action wiring lives in actions.ts ("use server"). This file must NOT
// be "use server" — scripts/check-use-server.sh enforces this.

import { z } from "zod";
import type { TemplateBlueprintPatch } from "./store";

// ─── surface type ─────────────────────────────────────────────────────────────

export type AgentSurfaceInput = "voice" | "chat";

// ─── Task 3: house-style prompt builder ───────────────────────────────────────
//
// HOUSE_RULES: the key behavioral invariants every generated agent must embed.
//
// Sourced from the same principles as:
//   - lib/agents/skills/voice-receptionist/sdr.ts (voice SDR playbook)
//   - lib/agents/skills/website-chatbot/hard-rules.ts (HARD_RULES_SKILL)
//
// These should converge with the runtime's skill text as the skills system
// matures — the runtime embeds these rules at inference time via the skill
// registry; the generator embeds them into the GENERATED customSkillMd so
// the template's prose persona already reflects them. This prevents a gap
// where a builder's generated agent looks good in the preview but behaves
// differently once deployed, since the generator-side and runtime-side rules
// are both derived from the same source of truth.

const HOUSE_RULES = `SeldonFrame agent rules (always apply):
- Never state a firm price. If asked about price, call get_quote_range (if available) and say a human confirms the final number.
- Before booking, read back the full appointment details (name, service, date, time) and get explicit confirmation.
- If you cannot help or the caller asks for a human, use escalate_to_human or take_message — never invent an answer.
- Only state facts present in the FAQ/knowledge or returned by a tool. Do not hallucinate hours, policies, or availability.
- Be warm, concise, and natural.`;

export type BuildGeneratePromptInput = {
  intent: string;
  surface: AgentSurfaceInput;
  allowedCapabilities: string[];
  businessName?: string;
};

/**
 * Build the system + user prompt pair for the generate-agent LLM call.
 * Pure — no I/O, no side effects.
 */
export function buildGeneratePrompt(
  input: BuildGeneratePromptInput,
): { system: string; user: string } {
  const surfaceLine =
    input.surface === "voice"
      ? "This is a VOICE phone agent — short spoken turns, no markdown, confirm by voice."
      : "This is a WEB CHAT agent — concise text, may use light formatting.";

  const system = [
    `You are SeldonFrame's agent designer. Produce a production-ready agent configuration.`,
    surfaceLine,
    // A generated config is a REUSABLE TEMPLATE sold to many businesses, not a
    // one-off for a single named client. Write the persona for the business
    // TYPE generically (e.g. "You are the receptionist for an HVAC company")
    // and never invent or assume a specific business name — the real client
    // name is filled in at deploy time. Using a fixed name here would make
    // every deployment wrongly identify as that one business.
    `Write the persona generically for the kind of business in the intent (e.g. "You are the receptionist for an HVAC company"). Do NOT invent or assume a specific company name — a real business name is substituted in when the template is deployed to a client.`,
    HOUSE_RULES,
    `Available tools (choose only what the intent needs): ${input.allowedCapabilities.join(", ")}`,
    `Return ONLY valid JSON matching:`,
    `{"greeting": string, "customSkillMd": string, "capabilities": string[], "faq": {"q": string,"a": string}[], "quoteRanges": {"service":string,"low":number,"high":number}[]}`,
    `- customSkillMd: the agent's persona + playbook prose, embedding the house rules above.`,
    `- capabilities: a subset of the available tools.`,
    `- faq/quoteRanges: [] if unknown.`,
  ].join("\n\n");

  const user = `Business: ${input.businessName ?? "(unnamed)"}\nWhat the agent should do:\n${input.intent}`;

  return { system, user };
}

// ─── Task 4: parse + validate + allow-list filter ─────────────────────────────

/** Strip leading/trailing ```json ... ``` or ``` ... ``` code fences. */
function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/** Permissive zod shape for what the LLM may return. */
const RawDraft = z.object({
  greeting: z.string().optional(),
  customSkillMd: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  faq: z
    .array(z.object({ q: z.string(), a: z.string() }).passthrough())
    .optional(),
  quoteRanges: z
    .array(
      z.object({ service: z.string(), low: z.number(), high: z.number() }).passthrough(),
    )
    .optional(),
});

export type ParseGeneratedDraftInput = {
  allowedCapabilities: string[];
};

export type ParseGeneratedDraftResult =
  | { ok: true; patch: TemplateBlueprintPatch }
  | { ok: false; error: "unparseable" | "invalid_shape" };

/**
 * Parse the raw LLM output into a TemplateBlueprintPatch.
 * - Strips code fences
 * - JSON.parse
 * - Zod-validates a permissive RawDraft shape
 * - Filters capabilities to the allow-list
 * - Maps to TemplateBlueprintPatch (only present keys)
 */
export function parseGeneratedDraft(
  raw: string,
  input: ParseGeneratedDraftInput,
): ParseGeneratedDraftResult {
  const stripped = stripFences(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { ok: false, error: "unparseable" };
  }

  const result = RawDraft.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: "invalid_shape" };
  }

  const draft = result.data;
  const allowSet = new Set(input.allowedCapabilities);

  // Build the patch with only present keys (undefined fields are skipped so
  // mergeTemplateBlueprint won't clobber existing blueprint values).
  const patch: TemplateBlueprintPatch = {};

  if (draft.greeting !== undefined) patch.greeting = draft.greeting;
  if (draft.customSkillMd !== undefined) patch.customSkillMd = draft.customSkillMd;
  if (draft.faq !== undefined) {
    patch.faq = draft.faq.map((row) => ({ q: row.q, a: row.a }));
  }
  if (draft.capabilities !== undefined) {
    // Filter to the allow-list — the LLM may hallucinate non-existent tools.
    patch.capabilities = draft.capabilities.filter((c) => allowSet.has(c));
  }
  if (draft.quoteRanges !== undefined) {
    patch.quoteRanges = draft.quoteRanges.map((r) => ({
      service: r.service,
      low: r.low,
      high: r.high,
    }));
  }

  return { ok: true, patch };
}

// ─── Task 5: generate orchestrator (DI'd) ────────────────────────────────────

/** Injectable LLM completion dependency. */
export type GenerateDeps = {
  complete: (args: { system: string; user: string }) => Promise<string>;
};

export type GenerateDraftInput = {
  intent: string;
  surface: AgentSurfaceInput;
  allowedCapabilities: string[];
  businessName?: string;
};

export type GenerateDraftResult =
  | { ok: true; patch: TemplateBlueprintPatch }
  | { ok: false; error: "generation_failed" };

/**
 * Orchestrator: build prompt → call LLM → parse. Retries once on parse
 * failure, then returns generation_failed.
 */
export async function generateDraft(
  input: GenerateDraftInput,
  deps: GenerateDeps,
): Promise<GenerateDraftResult> {
  const prompt = buildGeneratePrompt(input);
  const allowedCapabilities = input.allowedCapabilities;

  // Attempt 1
  let raw: string;
  try {
    raw = await deps.complete(prompt);
  } catch {
    return { ok: false, error: "generation_failed" };
  }

  const first = parseGeneratedDraft(raw, { allowedCapabilities });
  if (first.ok) return { ok: true, patch: first.patch };

  // Retry once on parse failure
  let raw2: string;
  try {
    raw2 = await deps.complete(prompt);
  } catch {
    return { ok: false, error: "generation_failed" };
  }

  const second = parseGeneratedDraft(raw2, { allowedCapabilities });
  if (second.ok) return { ok: true, patch: second.patch };

  return { ok: false, error: "generation_failed" };
}
