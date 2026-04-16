import { z } from "zod";
import { getAnthropicClient } from "@/lib/ai/client";
import type { OrgSoul } from "@/lib/soul/types";

export type SoulConversationQuestion = {
  question: string;
  field: string;
};

const soulJourneyStageSchema = z.object({
  name: z.string().min(1),
  duration: z.string().optional(),
  goal: z.string().optional(),
  autoActions: z.array(z.string().min(1)).optional(),
  ongoing: z.boolean().optional(),
});

const soulClientSegmentSchema = z.object({
  name: z.string().min(1),
  needs: z.string().optional(),
  risk: z.string().optional(),
  opportunity: z.string().optional(),
});

const soulKeyMomentSchema = z.object({
  trigger: z.string().min(1),
  importance: z.enum(["critical", "high", "medium"]),
  action: z.string().min(1),
});

const soulGoalMetricSchema = z.object({
  metric: z.string().min(1),
  target: z.number(),
});

const soulServiceSchema = z.object({
  name: z.string().min(1),
  duration: z.string().optional(),
  price: z.number().optional(),
  description: z.string().optional(),
});

const soulPatchSchema = z
  .object({
    journey: z
      .object({
        stages: z.array(soulJourneyStageSchema).min(1),
      })
      .optional(),
    clientIntelligence: z
      .object({
        segments: z.array(soulClientSegmentSchema).optional(),
        keyMoments: z.array(soulKeyMomentSchema).optional(),
      })
      .optional(),
    goals: z
      .object({
        monthly: z.array(soulGoalMetricSchema).optional(),
        dashboardFocus: z
          .object({
            primary: z.string().optional(),
            secondary: z.string().optional(),
            tertiary: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
    ecosystem: z
      .object({
        referralSources: z
          .array(
            z.object({
              name: z.string().min(1),
              relationship: z.string().optional(),
            })
          )
          .optional(),
        differentiators: z.array(z.string().min(1)).optional(),
        competitors: z.array(z.string().min(1)).optional(),
      })
      .optional(),
    services: z.array(soulServiceSchema).optional(),
  })
  .partial();

function extractText(content: Array<{ type: string; text?: string }>) {
  return content
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("\n")
    .trim();
}

function extractFirstJsonObject(input: string) {
  const fenced = input.match(/```json\s*([\s\S]*?)```/i) ?? input.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? input.trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");

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

export async function parseSoulResponse(
  question: string,
  userResponse: string,
  existingSoul: Partial<OrgSoul>
): Promise<{ patch: Partial<OrgSoul>; parsed: boolean }> {
  const trimmedResponse = userResponse.trim();

  if (!trimmedResponse) {
    return { patch: {}, parsed: false };
  }

  const client = getAnthropicClient();

  if (!client) {
    return { patch: {}, parsed: false };
  }

  let completionText = "";

  try {
    const completion = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 2000,
      system: `You are helping configure a business management system.
Parse the user's answer into JSON that matches the soul schema.

Current soul config:
${JSON.stringify(existingSoul)}

Rules:
- Extract concrete details only. Do not invent facts.
- Return only new or updated fields.
- Use clear autoAction strings (example: "Send follow-up email after 48 hours if no booking").
- Convert casual timing into practical durations where possible.
- Return ONLY valid JSON, with no prose.`,
      messages: [
        {
          role: "user",
          content: `Question asked: "${question}"\n\nUser responded: "${trimmedResponse}"\n\nReturn structured JSON patch only.`,
        },
      ],
    });

    completionText = extractText(completion.content as Array<{ type: string; text?: string }>);
  } catch {
    return { patch: {}, parsed: false };
  }

  const text = completionText;
  const parsedJson = extractFirstJsonObject(text);

  if (!parsedJson || typeof parsedJson !== "object") {
    return { patch: {}, parsed: false };
  }

  const validated = soulPatchSchema.safeParse(parsedJson);

  if (!validated.success) {
    return { patch: {}, parsed: false };
  }

  return {
    patch: validated.data as Partial<OrgSoul>,
    parsed: true,
  };
}

export async function generateNextQuestion(
  currentSoul: Partial<OrgSoul>,
  askedQuestions: string[]
): Promise<SoulConversationQuestion | null> {
  const missing: string[] = [];

  if (!currentSoul.journey?.stages?.length) {
    missing.push("journey");
  }

  if (!currentSoul.journey?.stages?.some((stage) => stage.autoActions?.length)) {
    missing.push("timing_and_followups");
  }

  if (!currentSoul.clientIntelligence?.segments?.length) {
    missing.push("client_segments");
  }

  if (!currentSoul.goals?.monthly?.length) {
    missing.push("goals");
  }

  if (!currentSoul.services?.length) {
    missing.push("services");
  }

  const needed = missing.filter((field) => !askedQuestions.includes(field));

  if (needed.length === 0) {
    return null;
  }

  const questionMap: Record<string, string> = {
    journey: "Walk me through what happens from the moment someone first reaches out to you. What are the main steps?",
    timing_and_followups:
      "How quickly do you try to respond when someone reaches out? And what do you do if they go quiet or after you finish working together?",
    client_segments: "Do different types of clients need different things from you? For example, new clients vs long-term ones?",
    goals: "What does a great month look like for you? How many new clients, how much revenue?",
    services: "What services do you offer? Quick rundown — name, how long, and price.",
  };

  const field = needed[0];

  return {
    field,
    question: questionMap[field],
  };
}
