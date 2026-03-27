import Anthropic from "@anthropic-ai/sdk";
import { generateSoulFallback } from "@/lib/soul/fallback";
import type { OrgSoul, SoulWizardInput } from "@/lib/soul/types";

function parseSoulJson(content: string) {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");

  if (start === -1 || end === -1) {
    return null;
  }

  try {
    return JSON.parse(content.slice(start, end + 1)) as OrgSoul;
  } catch {
    return null;
  }
}

export async function generateSoul(input: SoulWizardInput): Promise<OrgSoul> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return generateSoulFallback(input);
  }

  const anthropic = new Anthropic({ apiKey });

  const prompt = `Given this business information, generate a complete CRM configuration as JSON matching the OrgSoul interface.\nInput: ${JSON.stringify(
    input
  )}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n");

    const parsed = parseSoulJson(text);

    if (parsed) {
      return parsed;
    }

    return generateSoulFallback(input);
  } catch {
    return generateSoulFallback(input);
  }
}
