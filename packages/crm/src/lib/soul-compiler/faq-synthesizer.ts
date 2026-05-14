import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { createByokAnthropicClient } from "./anthropic";
import { readSkillPack } from "@/lib/skill-packs/reader";
import type { SoulV4 } from "./schema";

const SKILL_PACK_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "skills/faq-synthesis.md"
);

const MODEL = process.env.SOUL_COMPILER_MODEL?.trim() || "claude-sonnet-4-20250514";
const MAX_TOKENS = 4000;

export type SynthesizedFaq = {
  q: string;
  a: string;
};

export type SynthesizerArgs = {
  soul: SoulV4;
  apiKey: string;
  targetCount: number;
  existingFaqs?: Array<{ q: string; a: string }>;
  _testClient?: Anthropic;
};

function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("\n")
    .trim();
}

function tryParseJsonArray(text: string): unknown {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("[");
    const end = candidate.lastIndexOf("]");
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

function isValid(entry: unknown): entry is SynthesizedFaq {
  if (!entry || typeof entry !== "object") return false;
  const obj = entry as Record<string, unknown>;
  return (
    typeof obj.q === "string" &&
    obj.q.length >= 3 &&
    typeof obj.a === "string" &&
    obj.a.length >= 3
  );
}

function formatExistingFaqs(existingFaqs?: Array<{ q: string; a: string }>): string {
  if (!existingFaqs || existingFaqs.length === 0) {
    return "(none — generate from scratch)";
  }
  return existingFaqs.map((f, i) => `${i + 1}. Q: ${f.q}\n   A: ${f.a}`).join("\n");
}

export async function synthesizeFaqsFromSoul(args: SynthesizerArgs): Promise<SynthesizedFaq[]> {
  if (args.targetCount <= 0) {
    return [];
  }

  const client = args._testClient ?? createByokAnthropicClient(args.apiKey);
  const promptTemplate = await readSkillPack(SKILL_PACK_PATH);
  const userMessage = promptTemplate
    .replace("{{TARGET_COUNT}}", String(args.targetCount))
    .replace("{{SOUL_JSON}}", JSON.stringify(args.soul, null, 2))
    .replace("{{EXISTING_FAQS}}", formatExistingFaqs(args.existingFaqs));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = extractText(response.content as Array<{ type: string; text?: string }>);
  const parsed = tryParseJsonArray(text);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter(isValid)
    .slice(0, args.targetCount)
    .map((entry) => ({ q: entry.q, a: entry.a }));
}
