import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { soulWiki } from "@/db/schema";

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  return new Anthropic({ apiKey });
}

export async function querySoulWiki(orgId: string, userPrompt: string, maxTokens = 3000): Promise<string> {
  const articles = await db
    .select({ title: soulWiki.title, content: soulWiki.content })
    .from(soulWiki)
    .where(eq(soulWiki.orgId, orgId));

  if (articles.length === 0) {
    return "";
  }

  const wikiContent = articles.map((article) => `## ${article.title}\n${article.content}`).join("\n\n---\n\n");
  const estimatedTokens = wikiContent.split(/\s+/).filter(Boolean).length * 1.3;

  if (estimatedTokens <= maxTokens) {
    return wikiContent;
  }

  const client = getAnthropicClient();
  if (!client) {
    return wikiContent.slice(0, Math.max(1000, maxTokens * 4));
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system:
        "You are a knowledge retriever. Given a user prompt and a wiki, extract ONLY the sections relevant to fulfilling the prompt. Return relevant content as-is, preserving wording. Do not summarize or paraphrase.",
      messages: [
        {
          role: "user",
          content: `User prompt: "${userPrompt}"\n\nFull wiki:\n${wikiContent}\n\nReturn only the relevant sections:`,
        },
      ],
    });

    if (!("content" in response) || !Array.isArray(response.content)) {
      return wikiContent.slice(0, Math.max(1000, maxTokens * 4));
    }

    const text = response.content
      .map((part: { type: string; text?: string }) => (part.type === "text" ? part.text ?? "" : ""))
      .join("\n")
      .trim();

    return text || wikiContent.slice(0, Math.max(1000, maxTokens * 4));
  } catch {
    return wikiContent.slice(0, Math.max(1000, maxTokens * 4));
  }
}
