// BlockSpec — the structured intermediate form between NL intent
// (PR 2) and template rendering (PR 1 C2+). A deterministic
// generator's input; the skill's LLM layer produces it from NL.
//
// Shipped in SLICE 2 PR 1 Commit 1 per audit §3.2.
//
// Design:
//   - Authoring-side shape only. No references to Zod `.args` as a
//     schema object — BlockSpec carries lightweight structural
//     descriptors (name/type/nullable/required) that the template
//     engine renders into Zod source code in the generated
//     `.tools.ts`. Keeping BlockSpec JSON-friendly means PR 2's NL
//     layer can hand off a plain object without any runtime-wiring
//     coupling.
//   - Cross-reference checks (e.g., a tool's `emits` references
//     events declared in this spec's `produces`) are SUPERREFINES
//     on the root schema, not per-field refinements. Collects all
//     issues in one parse rather than short-circuiting on the
//     first.
//
// Helpers exported alongside the schema handle the rote transforms
// the template engine will need (slug → PascalCase for type names,
// slug → UPPER_SNAKE for const exports, etc.). Pure functions, easy
// to unit-test, no imports from the rest of the scaffolding module.

import { z } from "zod";

// ---------------------------------------------------------------------
// Identifier shapes
// ---------------------------------------------------------------------

const BLOCK_SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const HANDLER_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const FULLY_QUALIFIED_EVENT_PATTERN =
  /^[a-z][a-z0-9-]*:[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

// Core block slugs already in the tree — the scaffold refuses to
// generate a block with any of these names. Verified at HEAD 2026-04-23.
const RESERVED_SLUGS = new Set([
  "crm",
  "caldiy-booking",
  "email",
  "sms",
  "payments",
  "formbricks-intake",
  "landing-pages",
]);

export function isValidBlockSlug(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (RESERVED_SLUGS.has(value)) return false;
  return BLOCK_SLUG_PATTERN.test(value);
}

export function isValidToolName(value: unknown): value is string {
  return typeof value === "string" && TOOL_NAME_PATTERN.test(value);
}

export function isValidHandlerName(value: unknown): value is string {
  return typeof value === "string" && HANDLER_NAME_PATTERN.test(value);
}

// ---------------------------------------------------------------------
// Naming transforms
// ---------------------------------------------------------------------

/** `client-satisfaction` → `CLIENT_SATISFACTION`. */
export function slugToConstName(slug: string): string {
  return slug.replace(/-/g, "_").toUpperCase();
}

/** `client-satisfaction` → `ClientSatisfaction`. */
export function slugToPascalCase(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join("");
}

/** Split `caldiy-booking:booking.created` → `booking.created`. */
export function stripBlockSlugPrefix(fullyQualified: string): string | null {
  const colon = fullyQualified.indexOf(":");
  if (colon === -1) return null;
  return fullyQualified.slice(colon + 1);
}

// ---------------------------------------------------------------------
// Zod schemas — primitives
// ---------------------------------------------------------------------

// Primitive field types the scaffold can render into Zod source.
// Extending this set is additive — keep it tight on purpose; new
// types require new renderer branches in the template engine (C2+).
const FieldTypeSchema = z.enum(["string", "number", "boolean", "integer"]);

const EventFieldSchema = z.object({
  name: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/, {
    message: "Event field name must be a lowerCamelCase identifier",
  }),
  type: FieldTypeSchema,
  nullable: z.boolean().default(false),
});

const ToolArgFieldSchema = z.object({
  name: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/, {
    message: "Tool arg name must be a lowerCamelCase identifier",
  }),
  type: FieldTypeSchema,
  nullable: z.boolean().default(false),
  required: z.boolean().default(true),
});

// ---------------------------------------------------------------------
// Zod schemas — structural
// ---------------------------------------------------------------------

const ProducesEventSchema = z.object({
  name: z.string().regex(EVENT_NAME_PATTERN, {
    message: 'Event name must be "namespace.verb[.subverb]" lowercase (e.g., "note.created")',
  }),
  fields: z.array(EventFieldSchema).default([]),
});

const ConsumesEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("event"),
    event: z.string().regex(EVENT_NAME_PATTERN, {
      message: 'Consumed event must be "namespace.verb[.subverb]" lowercase',
    }),
  }),
  z.object({
    kind: z.literal("soul_field"),
    soul_field: z.string().min(1),
    type: z.string().min(1),
  }),
  z.object({
    kind: z.literal("trigger_payload"),
    trigger_payload: z.record(z.string().min(1), z.unknown()),
  }),
]);

const ToolSchema = z.object({
  name: z.string().regex(TOOL_NAME_PATTERN, {
    message: "Tool name must be lowercase snake_case (e.g., create_note)",
  }),
  description: z.string().min(1),
  args: z.array(ToolArgFieldSchema).default([]),
  returns: z.array(ToolArgFieldSchema).default([]),
  emits: z.array(z.string().regex(EVENT_NAME_PATTERN)).default([]),
});

const SubscriptionSchema = z.object({
  event: z.string().regex(FULLY_QUALIFIED_EVENT_PATTERN, {
    message: 'Subscription event must be "<block-slug>:<event.name>"',
  }),
  handlerName: z.string().regex(HANDLER_NAME_PATTERN, {
    message: "Handler name must be lowerCamelCase",
  }),
  description: z.string().min(1),
  idempotencyKey: z.string().min(1).default("{{id}}"),
});

// ---------------------------------------------------------------------
// Entity schemas (SLICE 4a PR 2 C5 — scaffold → UI bridge)
// ---------------------------------------------------------------------
//
// Optional. When a block declares an entity, the scaffold emits
// `blocks/<slug>/admin/<entityName>.schema.ts` + `admin/<pluralSlug>.page.tsx`
// wired to <BlockListPage>. Backward-compat: omitted entities → no
// admin files, same output shape as pre-4a scaffold.

const EntityFieldSchema = z.object({
  name: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/, {
    message: "Entity field name must be lowerCamelCase",
  }),
  type: FieldTypeSchema,
  nullable: z.boolean().default(false),
  required: z.boolean().default(true),
});

const EntitySchema = z.object({
  name: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/, {
    message: "Entity name must be lowerCamelCase singular (e.g., note, ticket)",
  }),
  pluralSlug: z.string().regex(BLOCK_SLUG_PATTERN, {
    message: "Entity pluralSlug must be kebab-case (e.g., notes, tickets)",
  }),
  fields: z.array(EntityFieldSchema).min(1, {
    message: "Entity must declare at least one field",
  }),
});

// ---------------------------------------------------------------------
// Root BlockSpec schema with cross-references
// ---------------------------------------------------------------------

export const BlockSpecSchema = z
  .object({
    slug: z
      .string()
      .regex(BLOCK_SLUG_PATTERN, {
        message: "Block slug must be kebab-case lowercase (e.g., notes, client-satisfaction)",
      })
      .refine((s) => !RESERVED_SLUGS.has(s), {
        message:
          "Block slug collides with an existing core block — choose a different name",
      }),
    title: z.string().min(1),
    description: z.string().min(1),
    triggerPhrases: z.array(z.string().min(1)).default([]),
    frameworks: z.array(z.string().min(1)).default(["universal"]),
    produces: z.array(ProducesEventSchema).default([]),
    consumes: z.array(ConsumesEntrySchema).default([]),
    tools: z.array(ToolSchema).default([]),
    subscriptions: z.array(SubscriptionSchema).default([]),
    entities: z.array(EntitySchema).default([]),
  })
  .superRefine((spec, ctx) => {
    // Cross-ref: every tool's `emits` must reference a declared event.
    const producedEvents = new Set(spec.produces.map((e) => e.name));
    spec.tools.forEach((tool, toolIdx) => {
      tool.emits.forEach((emittedEvent, emitIdx) => {
        if (!producedEvents.has(emittedEvent)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["tools", toolIdx, "emits", emitIdx],
            message: `Tool "${tool.name}" emits "${emittedEvent}" which is not in the spec's produces list. Declare it under produces first.`,
          });
        }
      });
    });

    // Cross-ref: every subscription's handler name must be unique
    // (avoids register-all-handlers collisions).
    const handlerNames = new Set<string>();
    spec.subscriptions.forEach((sub, subIdx) => {
      if (handlerNames.has(sub.handlerName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["subscriptions", subIdx, "handlerName"],
          message: `Duplicate handler name "${sub.handlerName}" in this spec`,
        });
      }
      handlerNames.add(sub.handlerName);
    });
  });

export type BlockSpec = z.infer<typeof BlockSpecSchema>;
export type BlockSpecEvent = z.infer<typeof ProducesEventSchema>;
export type BlockSpecTool = z.infer<typeof ToolSchema>;
export type BlockSpecSubscription = z.infer<typeof SubscriptionSchema>;
export type BlockSpecFieldType = z.infer<typeof FieldTypeSchema>;
export type BlockSpecArgField = z.infer<typeof ToolArgFieldSchema>;
export type BlockSpecEntity = z.infer<typeof EntitySchema>;
export type BlockSpecEntityField = z.infer<typeof EntityFieldSchema>;
