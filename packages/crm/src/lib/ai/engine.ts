import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages/messages";
import { getAnthropicClient } from "@/lib/ai/client";
import { customizationToolDefinitions } from "./tool-definitions";

type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

function isToolUseBlock(value: unknown): value is ToolUseBlock {
  if (!value || typeof value !== "object") {
    return false;
  }

  const block = value as Record<string, unknown>;
  return block.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string";
}

function executeCustomizationTool(name: string, input: Record<string, unknown>) {
  switch (name) {
    case "analyze_business_model":
      return {
        insight: "Business model analyzed",
        recommendations: [
          `Industry focus: ${String(input.industry ?? "unknown")}`,
          `Offer type: ${String(input.offerType ?? "unknown")}`,
          `Client type: ${String(input.clientType ?? "mixed")}`,
        ],
      };
    case "customize_entity_labels":
      return {
        labels: {
          contact: { singular: input.contactSingular, plural: input.contactPlural },
          deal: { singular: input.dealSingular, plural: input.dealPlural },
        },
      };
    case "propose_pipeline_stages":
      return {
        stages: Array.isArray(input.stages) ? input.stages : [],
      };
    case "customize_voice_profile":
      return {
        voice: {
          style: input.style,
          vocabulary: Array.isArray(input.vocabulary) ? input.vocabulary : [],
          avoidWords: Array.isArray(input.avoidWords) ? input.avoidWords : [],
        },
      };
    case "define_ai_automation_plan":
      return {
        automations: Array.isArray(input.automations) ? input.automations : [],
      };
    case "finalize_customization_recommendation":
      return {
        summary: String(input.summary ?? "No summary provided"),
        rolloutSteps: Array.isArray(input.rolloutSteps) ? input.rolloutSteps : [],
      };
    default:
      return { message: `No executor for tool ${name}` };
  }
}

function extractText(content: Array<{ type: string; text?: string }>) {
  return content
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("\n")
    .trim();
}

export async function runClaudeWithCustomizationTools(prompt: string) {
  const client = getAnthropicClient();

  if (!client) {
    return { configured: false, message: "AI is not configured. Add ANTHROPIC_API_KEY to enable this feature." };
  }

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-latest",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
    tools: customizationToolDefinitions,
  });

  const toolUses = (response.content as unknown[]).filter(isToolUseBlock);

  if (toolUses.length === 0) {
    return {
      configured: true,
      message: extractText(response.content as Array<{ type: string; text?: string }>),
    };
  }

  const toolResults: ContentBlockParam[] = toolUses.map((toolUse) => {
    const result = executeCustomizationTool(toolUse.name, toolUse.input ?? {});

    return {
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: JSON.stringify(result),
    } as ContentBlockParam;
  });

  const followup = await client.messages.create({
    model: "claude-3-5-sonnet-latest",
    max_tokens: 1200,
    messages: [
      { role: "user", content: prompt },
      { role: "assistant", content: response.content as unknown as ContentBlockParam[] },
      { role: "user", content: toolResults },
    ],
  });

  return {
    configured: true,
    message: extractText(followup.content as Array<{ type: string; text?: string }>),
    toolCalls: toolUses.map((toolUse) => toolUse.name),
  };
}
