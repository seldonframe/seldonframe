import { getFrameworkConfig } from "@/lib/config";
import type { OrgSoul, SoulWizardInput } from "@/lib/soul/types";
import { soulTemplates } from "@/lib/soul/templates";

function pluralize(label: string) {
  return label.endsWith("s") ? label : `${label}s`;
}

function makeAiContext(input: SoulWizardInput, soul: OrgSoul) {
  return `${input.businessName} is a ${input.industry} business offering ${input.offerType}. They serve ${input.clientDescription}. Their process is: ${input.processDescription}. Priorities are ${soul.priorities.join(", ")}. Write in a ${soul.voice.style} tone and avoid ${soul.voice.avoidWords.join(", ")}.`;
}

export function generateSoulFallback(input: SoulWizardInput): OrgSoul {
  const frameworkConfig = getFrameworkConfig();
  const industryKey = input.industry.toLowerCase().replace(/\s+/g, "-") as keyof typeof soulTemplates;
  const template = soulTemplates[industryKey] ?? soulTemplates.default;
  const clientLabel = input.clientLabel || template.entityLabels?.contact.singular || frameworkConfig.entities.contact.singular;

  const soul: OrgSoul = {
    businessName: input.businessName,
    businessDescription: input.businessDescription,
    industry: input.industry,
    offerType: input.offerType,
    entityLabels: {
      contact: {
        singular: clientLabel,
        plural: pluralize(clientLabel),
      },
      deal: template.entityLabels?.deal ?? { singular: frameworkConfig.entities.deal.singular, plural: frameworkConfig.entities.deal.plural },
      activity: template.entityLabels?.activity ?? {
        singular: frameworkConfig.entities.activity.singular,
        plural: frameworkConfig.entities.activity.plural,
      },
      pipeline: template.entityLabels?.pipeline ?? {
        singular: frameworkConfig.entities.pipeline.singular,
        plural: frameworkConfig.entities.pipeline.plural,
      },
      intakeForm: template.entityLabels?.intakeForm ?? { singular: "Intake Form", plural: "Intake Forms" },
    },
    pipeline: {
      name: template.pipeline?.name ?? frameworkConfig.defaultPipeline.name,
      stages: input.stages.length
        ? input.stages.map((name, index) => ({
            name,
            color: ["#6366f1", "#8b5cf6", "#a855f7", "#22c55e", "#ef4444"][index % 5],
            probability: Math.min(100, Math.max(0, Math.round((index / Math.max(1, input.stages.length - 1)) * 100))),
          }))
        : (template.pipeline?.stages ?? frameworkConfig.defaultPipeline.stages),
    },
    suggestedFields: {
      contact: template.suggestedFields?.contact ?? frameworkConfig.defaultCustomFields.contact,
      deal: template.suggestedFields?.deal ?? frameworkConfig.defaultCustomFields.deal,
    },
    contactStatuses:
      template.contactStatuses ??
      frameworkConfig.contactStatuses.map((status, index) => ({
        value: status,
        label: status.replaceAll("_", " "),
        color: ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#0ea5e9", "#8b5cf6"][index % 6],
      })),
    voice: {
      style: input.communicationStyle,
      vocabulary: input.vocabulary,
      avoidWords: input.avoidWords,
      samplePhrases: [
        `Hi ${clientLabel}, thanks for reaching out to ${input.businessName}.`,
        "Let’s align on your goals and next steps.",
      ],
    },
    priorities: input.priorities,
    aiContext: "",
    suggestedIntakeForm: {
      name: `${clientLabel} Intake`,
      fields: [
        { key: "name", label: "Full Name", type: "text", required: true },
        { key: "email", label: "Email", type: "email", required: true },
        { key: "goal", label: "Primary Goal", type: "textarea", required: false },
      ],
    },
    branding: template.branding ?? {
      primaryColor: "234 89% 74%",
      accentColor: "262 83% 70%",
      mood: "minimal",
    },
    rawInput: {
      processDescription: input.processDescription,
      painPoint: input.painPoint,
      clientDescription: input.clientDescription,
    },
  };

  soul.aiContext = makeAiContext(input, soul);

  return soul;
}
