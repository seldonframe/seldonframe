import { db } from "@/db";
import { soulSources } from "@/db/schema";
import { incrementalCompile } from "@/lib/soul-wiki/compile";

type FiledResult = {
  entityId?: string;
  blockType?: "form" | "email" | "booking" | "page" | "automation";
  blockName: string;
  status?: "live" | "draft" | "needs-integration" | "error";
  description?: string;
  summary: string;
  publicUrl?: string | null;
  adminUrl?: string;
};

type FileOutputInput = {
  orgId: string;
  userPrompt: string;
  action: "create" | "plan" | "update" | "blueprint";
  result: FiledResult;
};

const MAX_PROMPT_LENGTH = 1500;
const MAX_SUMMARY_LENGTH = 4000;
const MAX_DESCRIPTION_LENGTH = 2000;

export async function fileSeldonOutputToSoul(input: FileOutputInput) {
  if (!input.result.blockType) {
    return;
  }

  if (input.result.status === "error") {
    return;
  }

  const prompt = truncate(input.userPrompt, MAX_PROMPT_LENGTH);
  const description = truncate(input.result.description ?? "", MAX_DESCRIPTION_LENGTH);
  const summary = truncate(input.result.summary, MAX_SUMMARY_LENGTH);
  const title = `Output: ${input.result.blockType} · ${input.result.blockName}`;

  const rawContent = [
    `Output Type: ${input.result.blockType}`,
    `Action: ${input.action}`,
    `Name: ${input.result.blockName}`,
    `Status: ${input.result.status ?? "unknown"}`,
    input.result.publicUrl ? `Public URL: ${input.result.publicUrl}` : "",
    input.result.adminUrl ? `Admin URL: ${input.result.adminUrl}` : "",
    "",
    "User Request:",
    prompt,
    "",
    "Result Description:",
    description || "(none)",
    "",
    "Result Summary:",
    summary,
  ]
    .filter(Boolean)
    .join("\n");

  const [source] = await db
    .insert(soulSources)
    .values({
      orgId: input.orgId,
      type: "output",
      title,
      sourceUrl: input.result.publicUrl ?? null,
      rawContent,
      metadata: {
        action: input.action,
        blockType: input.result.blockType,
        blockName: input.result.blockName,
        entityId: input.result.entityId ?? null,
        source: "seldon-output",
      },
      status: "pending",
    })
    .returning({ id: soulSources.id });

  if (!source?.id) {
    return;
  }

  void incrementalCompile(input.orgId, source.id).catch(() => {
    return;
  });
}

function truncate(value: string, max: number) {
  const text = String(value ?? "").trim();
  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, Math.max(0, max - 3))}...`;
}
