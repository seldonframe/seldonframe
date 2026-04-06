import { generate } from "@puckeditor/cloud-client";
import type { Config } from "@puckeditor/core";
import { DEFAULT_ORG_THEME, type OrgTheme } from "@/lib/theme/types";
import type { OrgSoul } from "@/lib/soul/types";

const puckAiConfig = {
  components: {
    Hero: {
      fields: {
        headline: { type: "text" },
        subheadline: { type: "text" },
        ctaText: { type: "text" },
        ctaLink: { type: "text" },
      },
    },
    FormContainer: {
      fields: {
        formName: { type: "text" },
        submitButtonText: { type: "text" },
        successMessage: { type: "text" },
      },
    },
    TextInput: { fields: { label: { type: "text" }, fieldName: { type: "text" }, placeholder: { type: "text" } } },
    EmailInput: { fields: { label: { type: "text" }, fieldName: { type: "text" } } },
    TextAreaInput: { fields: { label: { type: "text" }, fieldName: { type: "text" }, rows: { type: "number" } } },
    SelectInput: { fields: { label: { type: "text" }, fieldName: { type: "text" }, options: { type: "array" } } },
    ScoreSelect: { fields: { label: { type: "text" }, fieldName: { type: "text" }, options: { type: "array" } } },
    ServiceCard: { fields: { name: { type: "text" }, description: { type: "text" } } },
    TestimonialCard: { fields: { quote: { type: "text" }, authorName: { type: "text" } } },
    FAQ: { fields: { items: { type: "array" } } },
    QuizResults: {
      fields: {
        threshold: { type: "number" },
        qualifiedHeadline: { type: "text" },
        unqualifiedHeadline: { type: "text" },
      },
    },
  },
} as unknown as Config;

export async function generatePuckPage(
  prompt: string,
  soul: OrgSoul | null,
  theme: OrgTheme | null,
  existingData?: Record<string, unknown>
) {
  const apiKey = process.env.PUCK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("PUCK_API_KEY is missing. Set it in your environment before using Puck AI generation.");
  }

  const context = buildBusinessContext(soul, theme ?? DEFAULT_ORG_THEME);

  const result = await generate({
    prompt,
    config: puckAiConfig,
    context,
    ...(existingData ? { data: existingData } : {}),
    apiKey,
  });

  if (!result || typeof result !== "object") {
    throw new Error("Puck AI returned an invalid page payload.");
  }

  return result as Record<string, unknown>;
}

function buildBusinessContext(soul: OrgSoul | null, theme: OrgTheme): string {
  const parts: string[] = [];

  if (soul?.businessName) {
    parts.push(`Business name: ${soul.businessName}.`);
  }

  if (soul?.industry) {
    parts.push(`Industry: ${soul.industry}.`);
  }

  if (soul?.voice?.style) {
    parts.push(`Brand voice: ${soul.voice.style}.`);
  }

  if (Array.isArray(soul?.services) && soul.services.length > 0) {
    const serviceList = soul.services
      .map((service) => `${service.name}${service.duration ? ` (${service.duration})` : ""}${typeof service.price === "number" ? `, $${service.price}` : ""}`)
      .join(", ");
    parts.push(`Services offered: ${serviceList}.`);
  }

  if (soul?.entityLabels) {
    parts.push(
      `Terminology: Call contacts "${soul.entityLabels.contact?.plural || "Contacts"}". Call deals "${soul.entityLabels.deal?.plural || "Deals"}".`
    );
  }

  if (Array.isArray(soul?.journey?.stages) && soul.journey.stages.length > 0) {
    parts.push(`Client pipeline stages: ${soul.journey.stages.map((stage) => stage.name).join(" -> ")}.`);
  }

  if (soul?.customContext) {
    parts.push(`Additional context: ${soul.customContext}`);
  }

  parts.push(`Design: Use the brand primary color ${theme.primaryColor}. The style is ${theme.mode} mode with ${theme.borderRadius} corners.`);

  return parts.join("\n");
}
