// packages/crm/src/lib/marketplace/taste/ground-business.ts
//
// Taste mode — ground_on_my_business. REUSES the platform's existing pieces,
// never reimplements them: assertPublicHttpUrl (lib/security/ssrf-guard — the
// same guard analyze-url and soul-wiki ingest use), htmlToMarkdown (soul-wiki),
// and the analyze-url extraction SHAPE (one messages.create + no-LLM fallback,
// see app/api/v1/public/analyze-url/route.ts:305-420) — pinned to the haiku
// tier with a 20K-char input cap because the SELLER pays (design §1.1, D3).
// The flagship platform-key guard applies here exactly as in taste-turn.ts.

import type Anthropic from "@anthropic-ai/sdk";
import { assertPublicHttpUrl, fetchPublicUrlSafe } from "@/lib/security/ssrf-guard";
import { htmlToMarkdown } from "@/lib/soul-wiki/ingest";
import { getAIClient } from "@/lib/ai/client";
import type { TasteGrounding } from "@/db/schema/agent-taste-sessions";
import { truncateGroundingToCap } from "./taste-session-store";
import { TASTE_MODEL, TASTE_EXTRACT_MAX_TOKENS, TASTE_EXTRACT_INPUT_CHARS } from "./taste-policy";

export type GroundOutcome =
  | { ok: true; grounding: TasteGrounding }
  | { ok: false; code: "blocked_url" | "fetch_failed" | "no_taste_key"; message: string };

export type GroundDeps = {
  /** REAL: assertPublicHttpUrl. Throws on private/blocked targets. */
  assertUrl: (rawUrl: string) => Promise<{ url: URL; ip: string }>;
  /** REAL: fetch with the analyze-url conventions (UA + 10s timeout) →
   *  htmlToMarkdown → char cap. DI'd so specs never touch the network. */
  fetchPage: (safeUrl: string) => Promise<{ markdown: string; title: string }>;
  /** Same seam + guard as taste-turn (seller pays for grounding too). */
  getClient: (args: { orgId: string }) => Promise<{ client: Anthropic | null; provider: string }>;
  flagshipOrgIds: Set<string>;
};

export const REAL_GROUND_DEPS: Omit<GroundDeps, "flagshipOrgIds"> = {
  assertUrl: (raw) => assertPublicHttpUrl(raw),
  fetchPage: async (safeUrl) => {
    const response = await fetchPublicUrlSafe(safeUrl, {
      headers: { "User-Agent": "SeldonFrame/1.0 (Business Analysis)" },
      signal: AbortSignal.timeout(10_000),
    });
    const html = await response.text();
    const markdown = htmlToMarkdown(html).slice(0, TASTE_EXTRACT_INPUT_CHARS);
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
    return { markdown, title };
  },
  getClient: (args) => getAIClient({ orgId: args.orgId }),
};

const EXTRACT_SYSTEM =
  `Extract the business behind this website as compact JSON with keys: ` +
  `businessName, industry, tagline, description, services (array of strings), ` +
  `voiceTone, idealClient. Only include what the page supports. JSON only.`;

export async function groundOnBusiness(
  input: { url: string; creatorOrgId: string },
  deps: GroundDeps,
): Promise<GroundOutcome> {
  // 1) SSRF gate FIRST — never fetch an unvetted URL.
  let safeUrl: URL;
  try {
    safeUrl = (await deps.assertUrl(input.url)).url;
  } catch {
    return { ok: false, code: "blocked_url", message: "That URL can't be fetched. Use a public https:// website." };
  }

  // 2) Fetch + convert (existing conventions, DI'd).
  let page: { markdown: string; title: string };
  try {
    page = await deps.fetchPage(safeUrl.toString());
  } catch {
    return { ok: false, code: "fetch_failed", message: "Couldn't fetch that site. Check the URL and try again." };
  }

  // 3) Key resolution — the flagship guard applies to grounding spend too.
  const resolution = await deps.getClient({ orgId: input.creatorOrgId });
  if (resolution.provider === "platform" && !deps.flagshipOrgIds.has(input.creatorOrgId)) {
    return { ok: false, code: "no_taste_key", message: "Free tasting isn't available for this agent right now." };
  }
  if (!resolution.client) {
    return { ok: false, code: "no_taste_key", message: "Free tasting isn't available for this agent right now." };
  }

  const sourceDomain = safeUrl.hostname;

  // 4) One capped haiku extraction; NO-LLM fallback on any failure (mirrors
  //    fallbackBusinessData's spirit in analyze-url).
  let extracted: Partial<TasteGrounding> = {};
  try {
    const msg = await resolution.client.messages.create({
      model: TASTE_MODEL,
      max_tokens: TASTE_EXTRACT_MAX_TOKENS,
      system: EXTRACT_SYSTEM,
      messages: [{ role: "user", content: page.markdown.slice(0, TASTE_EXTRACT_INPUT_CHARS) }],
    });
    const text =
      msg.content.find(
        (b): b is Anthropic.Messages.TextBlock => b.type === "text",
      )?.text ?? "";
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      extracted = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Partial<TasteGrounding>;
    }
  } catch {
    extracted = {};
  }

  const grounding = truncateGroundingToCap({
    businessName: (extracted.businessName || page.title || sourceDomain).toString(),
    industry: extracted.industry,
    tagline: extracted.tagline,
    description: extracted.description || page.markdown.slice(0, 300),
    services: Array.isArray(extracted.services) ? extracted.services.map(String) : undefined,
    voiceTone: extracted.voiceTone,
    idealClient: extracted.idealClient,
    sourceDomain,
  });

  return { ok: true, grounding };
}
