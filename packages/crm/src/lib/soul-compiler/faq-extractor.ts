import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { createByokAnthropicClient } from "./anthropic";
import { readSkillPack } from "@/lib/skill-packs/reader";

const SKILL_PACK_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "skills/faq-extraction.md"
);

const MODEL = process.env.SOUL_COMPILER_MODEL?.trim() || "claude-sonnet-4-20250514";
const MAX_TOKENS = 4000;

// XML tag patterns we strip from extracted Q&A content. Defense-in-depth
// against scraped-content injection that escapes the runtime framing layer.
const XML_TAG_STRIP = /<\/?(?:scraped_faq|synthesized_faq|operator_faq|system|human|assistant)[^>]*>/gi;

export type ExtractedFaq = {
  q: string;
  a: string;
  sourceUrl: string;
};

export type ExtractorArgs = {
  markdownByUrl: Record<string, string>;
  apiKey: string;
  /** Test-only: inject a mock Anthropic-shaped client. */
  _testClient?: Anthropic;
};

function buildSourceMarkdown(markdownByUrl: Record<string, string>): string {
  return Object.entries(markdownByUrl)
    .map(([url, md]) => `=== SOURCE: ${url} ===\n${md}`)
    .join("\n\n");
}

function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("\n")
    .trim();
}

function tryParseJson(text: string): unknown {
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

function stripTags(input: string): string {
  return input.replace(XML_TAG_STRIP, "").trim();
}

function isValidEntry(value: unknown, allowedUrls: Set<string>): value is ExtractedFaq {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.q !== "string" || obj.q.length < 3) return false;
  if (typeof obj.a !== "string" || obj.a.length < 3) return false;
  if (typeof obj.sourceUrl !== "string") return false;
  if (!allowedUrls.has(obj.sourceUrl)) return false;
  return true;
}

export async function extractFaqsFromMarkdown(args: ExtractorArgs): Promise<ExtractedFaq[]> {
  if (Object.keys(args.markdownByUrl).length === 0) {
    return [];
  }

  const client = args._testClient ?? createByokAnthropicClient(args.apiKey);
  const promptTemplate = await readSkillPack(SKILL_PACK_PATH);
  const sourceMarkdown = buildSourceMarkdown(args.markdownByUrl);
  const userMessage = promptTemplate.replace("{{MARKDOWN}}", sourceMarkdown);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = extractText(response.content as Array<{ type: string; text?: string }>);
  const parsed = tryParseJson(text);

  if (!Array.isArray(parsed)) {
    return [];
  }

  const allowedUrls = new Set(Object.keys(args.markdownByUrl));
  const valid = parsed.filter((entry): entry is ExtractedFaq => isValidEntry(entry, allowedUrls));

  return valid.map((entry) => ({
    q: stripTags(entry.q),
    a: stripTags(entry.a),
    sourceUrl: entry.sourceUrl,
  }));
}
