import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillPack } from "@/lib/skill-packs/reader";

const SKILL_PACK_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "skills",
  "system-prompt",
  "scraped-content-framing.md"
);

export type FaqEntry = {
  q: string;
  a: string;
  source?: "extracted" | "synthesized" | "operator" | string;
  sourceUrl?: string;
};

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function classifySource(entry: FaqEntry): "extracted" | "synthesized" | "operator" {
  if (entry.source === "extracted") return "extracted";
  if (entry.source === "synthesized") return "synthesized";
  return "operator"; // covers "operator", undefined, and any unknown value
}

export async function frameFaqForSystemPrompt(faq: FaqEntry[]): Promise<string> {
  if (faq.length === 0) {
    return "";
  }

  const directive = await readSkillPack(SKILL_PACK_PATH);

  const lines: string[] = [];

  for (const entry of faq) {
    const safeQ = escapeXml(entry.q);
    const safeA = escapeXml(entry.a);
    const kind = classifySource(entry);

    if (kind === "extracted") {
      const safeUrl = entry.sourceUrl ? escapeXml(entry.sourceUrl) : "";
      lines.push(`<scraped_faq source="${safeUrl}">\nQ: ${safeQ}\nA: ${safeA}\n</scraped_faq>`);
    } else if (kind === "synthesized") {
      lines.push(`<synthesized_faq from="soul">\nQ: ${safeQ}\nA: ${safeA}\n</synthesized_faq>`);
    } else {
      lines.push(`<operator_faq>\nQ: ${safeQ}\nA: ${safeA}\n</operator_faq>`);
    }
  }

  return `${directive}\n\n${lines.join("\n\n")}`;
}
