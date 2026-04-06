import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, soulSources, soulWiki } from "@/db/schema";

type WikiCategory = {
  slug: string;
  title: string;
  description: string;
};

type SourceRow = {
  id: string;
  type: string;
  title: string | null;
  rawContent: string;
};

type WikiRow = {
  id: string;
  slug: string;
  sourceIds: string[];
  content: string;
};

const WIKI_CATEGORIES: WikiCategory[] = [
  { slug: "identity", title: "Business Identity", description: "Who the business is, what they do, their mission, their story" },
  { slug: "services", title: "Services & Offerings", description: "What they sell, pricing, packages, delivery method" },
  { slug: "voice", title: "Voice & Language", description: "How the business talks - specific phrases, tone, vocabulary, what they never say" },
  { slug: "client-stories", title: "Client Stories & Results", description: "Testimonials, case studies, transformations, specific outcomes" },
  { slug: "faq", title: "Common Questions", description: "Questions prospects and clients frequently ask, with the business's actual answers" },
  { slug: "philosophy", title: "Philosophy & Approach", description: "Their methodology, beliefs about their craft, what makes them different" },
  { slug: "audience", title: "Ideal Client Profile", description: "Who they serve best, who they don't serve, qualification criteria" },
  { slug: "differentiators", title: "Differentiators", description: "What sets them apart from competitors, unique mechanisms, proprietary frameworks" },
];

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  return new Anthropic({ apiKey });
}

function buildRawBundle(sources: SourceRow[]) {
  return sources
    .map((source) => `--- SOURCE: ${source.title || "Untitled"} (${source.type}) ---\n${source.rawContent}\n--- END SOURCE ---`)
    .join("\n\n");
}

function extractResponseText(response: Awaited<ReturnType<Anthropic["messages"]["create"]>>) {
  if (!("content" in response) || !Array.isArray(response.content)) {
    return "";
  }

  return response.content
    .map((part: { type: string; text?: string }) => (part.type === "text" ? part.text ?? "" : ""))
    .join("\n");
}

export async function compileSoulWiki(orgId: string) {
  const sources = await db
    .select({ id: soulSources.id, type: soulSources.type, title: soulSources.title, rawContent: soulSources.rawContent })
    .from(soulSources)
    .where(eq(soulSources.orgId, orgId));

  if (sources.length === 0) {
    return;
  }

  const [org] = await db
    .select({ soul: organizations.soul })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const client = getAnthropicClient();
  if (!client) {
    return;
  }

  const rawBundle = buildRawBundle(sources);

  for (const category of WIKI_CATEGORIES) {
    const article = await compileArticle(client, category, rawBundle, org?.soul);

    if (!article || article.trim().length < 50) {
      continue;
    }

    await db
      .insert(soulWiki)
      .values({
        orgId,
        slug: category.slug,
        title: category.title,
        category: category.slug,
        content: article,
        sourceIds: sources.map((source) => source.id),
        lastCompiledAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [soulWiki.orgId, soulWiki.slug],
        set: {
          content: article,
          sourceIds: sources.map((source) => source.id),
          lastCompiledAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  await db
    .update(soulSources)
    .set({ status: "compiled", updatedAt: new Date() })
    .where(eq(soulSources.orgId, orgId));
}

async function compileArticle(client: Anthropic, category: WikiCategory, rawBundle: string, soul: unknown) {
  const soulRecord = soul && typeof soul === "object" ? (soul as Record<string, unknown>) : null;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: `You are a business knowledge compiler. Your job is to read raw source material about a business and compile a specific wiki article from it.

Rules:
- Extract ONLY information relevant to the requested category
- Use the business's ACTUAL words, phrases, and tone - don't paraphrase into generic corporate language
- Include specific details: names, numbers, prices, timeframes, locations
- If the raw material doesn't contain information for this category, return ONLY the text "INSUFFICIENT_DATA"
- Write in third person ("The business offers..." not "We offer...")
- Use markdown formatting: headers, bullet points, bold for key terms
- Keep the article focused and factual - no fluff, no filler
- If there are direct quotes from the business owner or clients, preserve them exactly

Business name: ${String(soulRecord?.businessName ?? "Unknown")}
Industry: ${String(soulRecord?.industry ?? "Unknown")}`,
    messages: [
      {
        role: "user",
        content: `Compile a wiki article for the category: "${category.title}"

Category description: ${category.description}

Here is all the raw source material about this business:

${rawBundle}

Write the "${category.title}" article now. Use only information from the sources above. If there isn't enough information for this category, respond with only "INSUFFICIENT_DATA".`,
      },
    ],
  });

  const text = extractResponseText(response).trim();
  if (!text || text.includes("INSUFFICIENT_DATA")) {
    return "";
  }

  return text;
}

export async function incrementalCompile(orgId: string, newSourceId: string) {
  const [newSource] = await db
    .select({ id: soulSources.id, type: soulSources.type, title: soulSources.title, rawContent: soulSources.rawContent })
    .from(soulSources)
    .where(and(eq(soulSources.orgId, orgId), eq(soulSources.id, newSourceId)))
    .limit(1);

  if (!newSource) {
    return;
  }

  const existingArticles = await db
    .select({ id: soulWiki.id, slug: soulWiki.slug, sourceIds: soulWiki.sourceIds, content: soulWiki.content })
    .from(soulWiki)
    .where(eq(soulWiki.orgId, orgId));

  const [org] = await db
    .select({ soul: organizations.soul })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const client = getAnthropicClient();
  if (!client) {
    return;
  }

  for (const category of WIKI_CATEGORIES) {
    const existing = existingArticles.find((article) => article.slug === category.slug) as WikiRow | undefined;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: `You are a wiki editor. You have an existing article and new source material. Update the article if the new material adds relevant information. If nothing new is relevant, return the existing article unchanged.

Rules:
- Preserve ALL existing content that is still accurate
- ADD new information from the source where relevant
- Use the business's actual language
- Return the FULL updated article, not just the changes
- If the new source adds nothing to this category, return the existing article exactly as-is`,
      messages: [
        {
          role: "user",
          content: `Category: "${category.title}" - ${category.description}

Business context:
${JSON.stringify(org?.soul ?? {}, null, 2)}

EXISTING ARTICLE:
${existing?.content || "(No existing article yet)"}

NEW SOURCE MATERIAL:
--- SOURCE: ${newSource.title || "Untitled"} (${newSource.type}) ---
${newSource.rawContent}
--- END SOURCE ---

Return the updated article:`,
        },
      ],
    });

    const updatedContent = extractResponseText(response).trim();

    if (!updatedContent || updatedContent.length < 50) {
      continue;
    }

    const sourceIds = Array.from(new Set([...(Array.isArray(existing?.sourceIds) ? existing.sourceIds : []), newSource.id]));

    await db
      .insert(soulWiki)
      .values({
        orgId,
        slug: category.slug,
        title: category.title,
        category: category.slug,
        content: updatedContent,
        sourceIds,
        lastCompiledAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [soulWiki.orgId, soulWiki.slug],
        set: {
          content: updatedContent,
          sourceIds,
          lastCompiledAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  await db
    .update(soulSources)
    .set({ status: "compiled", updatedAt: new Date() })
    .where(eq(soulSources.id, newSource.id));
}

export { WIKI_CATEGORIES };
