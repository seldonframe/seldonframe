import { z } from "zod";

/**
 * Soul V4 Schema - Source of truth for the SeldonFrame soul compiler
 * Matches locked Soul Extraction Prompt v4 and test suite exactly.
 */

export const audienceTypeSchema = z.enum(["service", "product"]);

export const baseFrameworkSchema = z.enum([
  "coaching",
  "agency",
  "consulting",
  "f1-landing-waitlist",
  "f2-saas-launch",
]);

export const routingResultSchema = z
  .object({
    audience_type: audienceTypeSchema,
    base_framework: baseFrameworkSchema,
    business_name: z.string().min(1),
    tagline: z.string().min(1),
    split_recommendation: z.boolean(),
  })
  .strict();

export const pipelineStageSchema = z
  .object({
    name: z.string(),
    description: z.string(),
  })
  .strict();

export const intakeFieldTypeSchema = z.enum([
  "text",
  "email",
  "select",
  "textarea",
  "number",
  "date",
  "checkbox",
]);

export const intakeFormFieldSchema = z
  .object({
    field_id: z.string(),
    label: z.string(),
    type: intakeFieldTypeSchema,
    options: z.array(z.string()).optional(),
    required: z.boolean(),
    edge_case_note: z.string().optional(),
  })
  .strict();

export const bookingServiceSchema = z
  .object({
    name: z.string().min(1),
    price: z.number(),
    description: z.string().min(1),
  })
  .strict();

export const bookingConfigSchema = z
  .object({
    enabled: z.boolean(),
    default_duration_minutes: z.number(),
    buffer_minutes: z.number(),
    services: z.array(bookingServiceSchema),
  })
  .strict();

export const pricingTierSchema = z
  .object({
    name: z.string().min(1),
    price_per_unit: z.number().optional(),
    price_per_1k_tokens: z.number().optional(),
    description: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (typeof value.price_per_unit !== "number" && typeof value.price_per_1k_tokens !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tiers must include price_per_unit or price_per_1k_tokens",
      });
    }
  });

export const pricingConfigSchema = z
  .object({
    enabled: z.boolean(),
    model: z.enum(["usage_based", "waitlist", "fixed"]),
    tiers: z.array(pricingTierSchema),
  })
  .strict();

export const intelligenceHookSchema = z
  .object({
    metric: z.string(),
    description: z.string(),
    trigger: z.enum(["daily", "weekly", "monthly"]),
    format: z.enum(["percentage", "currency", "count", "trend"]),
    alert_threshold: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

export const ucpCapabilitiesSchema = z
  .object({
    checkout: z.boolean(),
    booking: z.boolean(),
    catalog: z.boolean(),
    cart: z.boolean(),
  })
  .strict();

export const soulV4Schema = z
  .object({
    business_name: z.string(),
    audience_type: audienceTypeSchema,
    base_framework: baseFrameworkSchema,
    tagline: z.string(),
    soul_description: z.string(),
    pipeline_stages: z.array(pipelineStageSchema).min(4).max(7),
    intake_form_fields: z.array(intakeFormFieldSchema),
    booking_config: z.union([bookingConfigSchema, z.null()]).optional(),
    pricing_config: z.union([pricingConfigSchema, z.null()]).optional(),
    landing_page_sections: z.array(z.string()),
    intelligence_hooks: z.array(intelligenceHookSchema),
    ucp_capabilities: ucpCapabilitiesSchema,
    custom_blocks: z.array(z.string()),
    split_recommendation: z.boolean(),
    custom_domain_suggestion: z.union([z.string(), z.null()]).optional(),
    framework_version: z.string().default("v4"),
    framework_creator: z.union([z.string(), z.null()]).default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.audience_type === "service") {
      if (!value.booking_config) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["booking_config"],
          message: "booking_config must be provided for service audience_type",
        });
      }

      if (value.pricing_config !== null && typeof value.pricing_config !== "undefined") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pricing_config"],
          message: "pricing_config must be null for service audience_type",
        });
      }
    }

    if (value.audience_type === "product") {
      if (!value.pricing_config) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pricing_config"],
          message: "pricing_config must be provided for product audience_type",
        });
      }

      if (value.booking_config !== null && typeof value.booking_config !== "undefined") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["booking_config"],
          message: "booking_config must be null for product audience_type",
        });
      }
    }
  });

export type RoutingResult = z.infer<typeof routingResultSchema>;
export type SoulV4 = z.infer<typeof soulV4Schema>;
