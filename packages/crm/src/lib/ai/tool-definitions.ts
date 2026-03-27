export type ClaudeToolDefinition = {
  type: "custom";
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

export const customizationToolDefinitions: ClaudeToolDefinition[] = [
  {
    type: "custom",
    name: "analyze_business_model",
    description: "Analyze business type, offer, and ICP assumptions before customization.",
    input_schema: {
      type: "object",
      properties: {
        industry: { type: "string" },
        offerType: { type: "string" },
        clientType: { type: "string" },
      },
      required: ["industry", "offerType"],
      additionalProperties: false,
    },
  },
  {
    type: "custom",
    name: "customize_entity_labels",
    description: "Propose CRM entity naming customization based on business context.",
    input_schema: {
      type: "object",
      properties: {
        contactSingular: { type: "string" },
        contactPlural: { type: "string" },
        dealSingular: { type: "string" },
        dealPlural: { type: "string" },
      },
      required: ["contactSingular", "contactPlural", "dealSingular", "dealPlural"],
      additionalProperties: false,
    },
  },
  {
    type: "custom",
    name: "propose_pipeline_stages",
    description: "Propose or revise pipeline stages and rough probabilities.",
    input_schema: {
      type: "object",
      properties: {
        stages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              probability: { type: "number" },
            },
            required: ["name", "probability"],
            additionalProperties: false,
          },
        },
      },
      required: ["stages"],
      additionalProperties: false,
    },
  },
  {
    type: "custom",
    name: "customize_voice_profile",
    description: "Refine communication style and vocabulary guidance.",
    input_schema: {
      type: "object",
      properties: {
        style: { type: "string" },
        vocabulary: { type: "array", items: { type: "string" } },
        avoidWords: { type: "array", items: { type: "string" } },
      },
      required: ["style"],
      additionalProperties: false,
    },
  },
  {
    type: "custom",
    name: "define_ai_automation_plan",
    description: "Generate AI automation suggestions across CRM blocks.",
    input_schema: {
      type: "object",
      properties: {
        automations: { type: "array", items: { type: "string" } },
      },
      required: ["automations"],
      additionalProperties: false,
    },
  },
  {
    type: "custom",
    name: "finalize_customization_recommendation",
    description: "Return final recommendations and migration-safe rollout sequence.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        rolloutSteps: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "rolloutSteps"],
      additionalProperties: false,
    },
  },
];
