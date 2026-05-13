import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { createByokAnthropicClient } from "./anthropic";
import { readSkillPack } from "@/lib/skill-packs/reader";

const SKILL_PACK_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "skills/sitemap-priority.md"
);

const MODEL = process.env.SOUL_COMPILER_MODEL?.trim() || "claude-sonnet-4-20250514";
const MAX_TOKENS = 2000;
const DEFAULT_LIMIT = 10;

export type RankedUrl = {
  url: string;
  reason: string;
  confidence: number;
};

export type SitemapPriorityArgs = {
  domain: string;
  apiKey: string;
  limit?: number;
  /** Test-only: bypass network fetch for URL list. */
  _testUrls?: string[];
  /** Test-only: inject a mock Anthropic client. */
  _testClient?: Anthropic;
};

const FALLBACK_PATHS = ["/", "/about", "/services", "/faq", "/contact"];

async function fetchUrlList(domain: string): Promise<string[]> {
  const origin = `https://${domain.replace(/\/+$/, "")}`;
  // Try sitemap.xml
  try {
    const res = await fetch(`${origin}/sitemap.xml`, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "SeldonFrame/1.0 (Soul Compiler)" },
    });
    if (res.ok) {
      const text = await res.text();
      const matches = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
      if (matches.length > 0) {
        return matches.slice(0, 50);
      }
    }
  } catch {
    // fall through to fallback
  }
  // Fallback: probe common paths
  return FALLBACK_PATHS.map((p) => `${origin}${p}`);
}

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

function isValidEntry(value: unknown, allowedUrls: Set<string>): value is RankedUrl {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.url !== "string" || !allowedUrls.has(obj.url)) return false;
  if (typeof obj.reason !== "string") return false;
  if (typeof obj.confidence !== "number") return false;
  return true;
}

export async function rankUrlsForFaqRelevance(args: SitemapPriorityArgs): Promise<RankedUrl[]> {
  const limit = args.limit ?? DEFAULT_LIMIT;
  const urls = args._testUrls ?? (await fetchUrlList(args.domain));

  if (urls.length === 0) {
    return [];
  }

  const client = args._testClient ?? createByokAnthropicClient(args.apiKey);
  const promptTemplate = await readSkillPack(SKILL_PACK_PATH);
  const userMessage = promptTemplate
    .replace("{{LIMIT}}", String(limit))
    .replace("{{URL_LIST}}", urls.map((u, i) => `${i + 1}. ${u}`).join("\n"));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = extractText(response.content as Array<{ type: string; text?: string }>);
  const parsed = tryParseJsonArray(text);

  if (!Array.isArray(parsed)) {
    // Fallback: return input URLs with neutral confidence.
    return urls.slice(0, limit).map((url) => ({
      url,
      reason: "fallback: LLM ranking unavailable",
      confidence: 0.5,
    }));
  }

  const allowed = new Set(urls);
  return parsed
    .filter((entry): entry is RankedUrl => isValidEntry(entry, allowed))
    .slice(0, limit);
}
