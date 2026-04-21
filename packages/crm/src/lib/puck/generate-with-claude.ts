import { getAIClient } from "@/lib/ai/client";
import type { OrgSoul } from "@/lib/soul/types";
import type { OrgTheme } from "@/lib/theme/types";
import { puckConfig } from "./config.impl";
import {
  validatePuckPayload,
  sanitizePuckPayload,
  puckIssuesToString,
  type PuckPayload,
  type PuckValidationIssue,
} from "./validator";

// Claude generation path — alternate to the existing Puck Cloud AI
// generator at lib/puck/generate-page.ts. The Claude path exists so
// Phase 7 Agent Synthesis can drive landing-page generation under the
// same auth + BYOK rules as every other Claude-powered block. The
// existing Puck Cloud generator stays for builders who prefer the
// Puck-managed UX.

export type ClaudeGenerateInput = {
  orgId: string;
  prompt: string;
  soul: OrgSoul | null;
  theme: OrgTheme | null;
  existing?: PuckPayload;
};

export type ClaudeGenerateSuccess = {
  ok: true;
  payload: PuckPayload;
  droppedIssues: PuckValidationIssue[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    model: string;
    mode: string;
  };
};

export type ClaudeGenerateFailure = {
  ok: false;
  reason: "no_ai_client" | "claude_error" | "invalid_json" | "invalid_schema";
  detail?: string;
  issues?: PuckValidationIssue[];
  rawResponse?: string;
};

export type ClaudeGenerateResult = ClaudeGenerateSuccess | ClaudeGenerateFailure;

function buildSchemaSummary() {
  const components = puckConfig.components as Record<string, { fields?: Record<string, unknown> } | undefined>;
  const lines: string[] = [];
  for (const [name, component] of Object.entries(components)) {
    if (!component?.fields) continue;
    const fieldDescriptors: string[] = [];
    for (const [fieldName, raw] of Object.entries(component.fields)) {
      const field = raw as { type: string; options?: Array<{ value: string | number }> };
      if (field.type === "select" || field.type === "radio") {
        const allowed = (field.options ?? []).map((o) => JSON.stringify(o.value)).join(" | ");
        fieldDescriptors.push(`${fieldName}: ${allowed}`);
      } else if (field.type === "slot") {
        fieldDescriptors.push(`${fieldName}: slot`);
      } else if (field.type === "array") {
        fieldDescriptors.push(`${fieldName}: array`);
      } else {
        fieldDescriptors.push(`${fieldName}: ${field.type}`);
      }
    }
    lines.push(`- ${name}: { ${fieldDescriptors.join(", ")} }`);
  }
  return lines.join("\n");
}

function buildSoulContext(soul: OrgSoul | null, theme: OrgTheme | null) {
  if (!soul) return "No Soul context available.";
  const lines: string[] = [];
  const s = soul as unknown as Record<string, unknown>;
  if (s.businessName) lines.push(`Business: ${s.businessName}`);
  if (s.industry) lines.push(`Industry: ${s.industry}`);
  if (s.mission) lines.push(`Mission: ${s.mission}`);
  if (s.offer) lines.push(`Offer: ${s.offer}`);
  const voice = s.voice as { style?: string } | undefined;
  if (voice?.style) lines.push(`Voice: ${voice.style}`);
  const services = s.services as Array<{ name: string; duration?: string; price?: number }> | undefined;
  if (Array.isArray(services) && services.length > 0) {
    lines.push(
      `Services: ${services
        .map((svc) => `${svc.name}${svc.duration ? ` (${svc.duration})` : ""}${typeof svc.price === "number" ? ` $${svc.price}` : ""}`)
        .join(", ")}`
    );
  }
  if (theme?.primaryColor) lines.push(`Brand primary color: ${theme.primaryColor}`);
  return lines.join("\n");
}

function parseClaudeJson(text: string): { ok: true; value: unknown } | { ok: false; detail: string } {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return { ok: true, value: JSON.parse(stripped) };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function generatePuckPageWithClaude(input: ClaudeGenerateInput): Promise<ClaudeGenerateResult> {
  const resolution = await getAIClient({ orgId: input.orgId });
  if (!resolution.client) {
    return { ok: false, reason: "no_ai_client" };
  }

  const schemaSummary = buildSchemaSummary();
  const soulContext = buildSoulContext(input.soul, input.theme);
  const existingBlock = input.existing
    ? `\n\nExisting page to revise (keep all props.id values unchanged unless the user asks for structural changes):\n${JSON.stringify(input.existing, null, 2)}`
    : "";

  const system =
    "You are a Puck landing-page generator. Return ONLY a valid Puck JSON payload with the shape { content: [], root: {props:{}}, zones: {} }. Each component item is { type, props: { id, ...fields } }. Zone keys use the shape \"<parentId>:<slotName>\" — for example, the Section component with id \"Section-services\" nests its slot items under zones[\"Section-services:content\"]. Every item needs a unique props.id (e.g., \"Hero-abc123\"). Only use documented components and fields. No markdown fences. No commentary.";

  const userContent = `${input.prompt}

Business context:
${soulContext}

Allowed components and their fields:
${schemaSummary}${existingBlock}`;

  try {
    const response = await resolution.client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: userContent }],
    });

    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    const parsed = parseClaudeJson(text);
    if (!parsed.ok) {
      return {
        ok: false,
        reason: "invalid_json",
        detail: parsed.detail,
        rawResponse: text,
      };
    }

    const validation = validatePuckPayload(parsed.value);
    if (!validation.ok) {
      // Attempt a non-destructive sanitize before giving up — this is
      // the pragmatic choice for a "close enough" Claude output. If
      // sanitization leaves the payload structurally valid, return it
      // with the list of what was dropped so the caller can log + show
      // a diff in the UI.
      if (validation.payload) {
        const { cleaned, dropped } = sanitizePuckPayload(validation.payload);
        const reValidated = validatePuckPayload(cleaned);
        if (reValidated.ok) {
          return {
            ok: true,
            payload: cleaned,
            droppedIssues: [...validation.issues, ...dropped],
            usage: {
              inputTokens: response.usage?.input_tokens ?? 0,
              outputTokens: response.usage?.output_tokens ?? 0,
              model: response.model,
              mode: resolution.mode,
            },
          };
        }
      }
      return {
        ok: false,
        reason: "invalid_schema",
        detail: puckIssuesToString(validation.issues),
        issues: validation.issues,
        rawResponse: text,
      };
    }

    return {
      ok: true,
      payload: validation.payload,
      droppedIssues: [],
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        model: response.model,
        mode: resolution.mode,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: "claude_error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
