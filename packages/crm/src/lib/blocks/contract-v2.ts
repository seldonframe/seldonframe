// Composition Contract v2 — block-side primitives for typed tool inputs
// (§2.a) and typed block I/O (§2.c) per tasks/step-2b-1-contract-v2-
// audit.md. Shipped in Scope 3 Step 2b.1 PR 1 (C3).
//
// Authoring vs. BLOCK.md parse shape
// ----------------------------------
// Two shapes coexist:
//
// 1. Authoring side — `<block>.tools.ts` (e.g., crm.tools.ts). Blocks
//    declare tool args/returns as Zod schemas directly, giving compile-
//    time type-checking + runtime validation. The `ToolDefinition`
//    type below captures the authoring-time contract.
//
// 2. BLOCK.md parse side — `## Composition Contract` under the v2 shape.
//    Between `<!-- TOOLS:START -->` / `<!-- TOOLS:END -->` markers,
//    the BLOCK.md carries the EMITTED JSON Schema output of the Zod
//    schemas (rendered by the emit step in C6 via z.toJSONSchema()).
//    `ToolEntrySchema` validates what a parser reads from a v2 BLOCK.md;
//    `args` and `returns` are JSON-Schema-shaped payloads treated as
//    opaque records here — the downstream agent-spec validator (PR 2)
//    parses them against Zod for type-level checking.
//
// Kept deliberately thin: this module only defines schemas for the
// contract-level metadata (tool name, description, emits, produces
// entries, consumes entries). Per-tool argument shapes live in each
// block's own `.tools.ts`; soul-field value typing lives in PR 2's
// agent-spec validator (it has to walk interpolation paths). 2e will
// extend `TypedConsumesEntrySchema` with external-state variants.

import { z } from "zod";

// ---------------------------------------------------------------------
// Event-name primitive. Matches existing `eventNamePattern` used in
// validateCompositionContract (block-md.ts:812) so v1-style string
// `produces: [event.name, ...]` entries and v2-typed `produces: - event:
// event.name` entries validate against the same shape constraint.
// ---------------------------------------------------------------------

// Accepts two-or-more dot-separated lowercase segments. `contact.created`
// (2 segments) and `conversation.turn.received` (3 segments) both pass.
export const EventNameSchema = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, {
  message: 'Event name must be "namespace.verb[.subverb]" lowercase (e.g., "contact.created" or "conversation.turn.received")',
});

// ---------------------------------------------------------------------
// Typed produces entry (§2.c). A block's `produces:` list in v2 shape
// is a list of these. Only `event` is supported today; 2c's await_event
// work may add more variants (e.g., an async-resolved produce), and 2e
// may add external-state signatures. Keep it tight for now.
// ---------------------------------------------------------------------

export const TypedProducesEntrySchema = z.object({
  event: EventNameSchema,
});

export type TypedProducesEntry = z.infer<typeof TypedProducesEntrySchema>;

// ---------------------------------------------------------------------
// Soul-field value type. Described as a string because soul-field types
// can be simple primitives ("string", "number") OR composite shapes
// ("Array<{ key: string; label: string }>"). PR 2's agent-spec validator
// does the real structural walk when it type-checks an interpolation;
// here we just ensure the type description is non-empty.
// ---------------------------------------------------------------------

export const SoulFieldTypeDescriptorSchema = z.string().min(1, {
  message: "Soul-field type descriptor must be non-empty",
});

export type SoulFieldTypeDescriptor = z.infer<typeof SoulFieldTypeDescriptorSchema>;

// ---------------------------------------------------------------------
// Trigger-payload field spec — one entry in a trigger_payload object.
// Narrower than soul-field types because trigger payloads land from the
// event bus with known primitive shapes (contact-id uuids, emails,
// numbers). `format` optionally carries a validator hint (uuid, email,
// date-time, etc.) that PR 2's agent-spec validator uses when walking
// {{interpolation}} paths.
// ---------------------------------------------------------------------

export const TriggerPayloadFieldSchema = z.object({
  type: z.enum(["string", "number", "boolean", "integer"]),
  format: z.string().min(1).optional(),
  required: z.boolean().default(true),
});

export type TriggerPayloadField = z.infer<typeof TriggerPayloadFieldSchema>;

// ---------------------------------------------------------------------
// Typed consumes entry (§2.c). A block's `consumes:` list in v2 shape
// is a list of these — a discriminated union on which key is present.
// Three variants today:
//   - { event: name }                                     subscribes to an event
//   - { soul_field: path, type: descriptor }              reads a soul field
//   - { trigger_payload: { field: TriggerPayloadField } } reads trigger data
//
// 2e will add the `external_state` variant for cross-event-history
// queries; not defined here to keep the current shape honest.
// ---------------------------------------------------------------------

export const TypedConsumesEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("event"),
    event: EventNameSchema,
  }),
  z.object({
    kind: z.literal("soul_field"),
    soul_field: z.string().min(1).regex(/^workspace\.(soul|theme)\.[a-z][a-z0-9_]*$/, {
      message: 'soul_field path must be "workspace.soul.<key>" or "workspace.theme.<key>"',
    }),
    type: SoulFieldTypeDescriptorSchema,
  }),
  z.object({
    kind: z.literal("trigger_payload"),
    trigger_payload: z.record(z.string().min(1), TriggerPayloadFieldSchema),
  }),
]);

export type TypedConsumesEntry = z.infer<typeof TypedConsumesEntrySchema>;

// ---------------------------------------------------------------------
// Authoring-side ToolDefinition (§2.a). Used in `<block>.tools.ts` files
// to declare tools with real Zod schemas for args + returns. The emit
// step (C6) walks an array of these and calls `z.toJSONSchema()` on
// each `args` and `returns` to produce the BLOCK.md JSON-Schema block.
//
// Not a Zod schema itself — it's the TypeScript shape authors write
// against. The generic <TArgs, TReturns extends z.ZodType> gives strong
// typing on the handler-less side of the surface; the .tools.ts files
// infer from it when they declare their tools as-const.
// ---------------------------------------------------------------------

export interface ToolDefinition<
  TArgs extends z.ZodType = z.ZodType,
  TReturns extends z.ZodType = z.ZodType,
> {
  name: string;
  description: string;
  args: TArgs;
  returns: TReturns;
  // Events this tool emits on successful execution. Must appear in this
  // block's produces list — composition-contract validator enforces
  // that cross-reference in C5.
  emits: string[];
}

// ---------------------------------------------------------------------
// BLOCK.md-parse-side tool entry. When the parser reads the v2 contract
// between `<!-- TOOLS:START -->` / `<!-- TOOLS:END -->` markers, each
// entry has this shape: `args` and `returns` are already JSON-Schema
// objects (the emitted output). We don't validate JSON-Schema structure
// here — that'd require a JSON-Schema validator dependency. Instead we
// check the metadata (name non-empty, emits references are dot-notation
// event names). PR 2 re-parses args/returns as Zod for type-checking.
// ---------------------------------------------------------------------

export const ToolEntrySchema = z.object({
  name: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, {
    message: "Tool name must be lowercase snake_case (e.g., create_contact)",
  }),
  description: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  returns: z.record(z.string(), z.unknown()),
  emits: z.array(EventNameSchema),
});

export type ToolEntry = z.infer<typeof ToolEntrySchema>;

// ---------------------------------------------------------------------
// Subscriptions — SLICE 1 PR 1 (2026-04-23). Block-level reactive
// handlers: "when event X arrives in this workspace, run handler Y."
//
// BLOCK.md `## Subscriptions` section carries one entry per
// subscription. Parser (block-md.ts) populates `subscriptions:
// SubscriptionEntry[]` on the parsed contract. Validator
// (SLICE 1 PR 1 M3) cross-checks event names against the SeldonEvent
// registry, handler names against module exports, and idempotency
// key templates against resolvable interpolation paths.
//
// Design rationale in tasks/step-subscription-audit.md §3. Gate
// decisions applied here:
//   G-1 (fully-qualified event): `event` is `<block-slug>:<event.name>`.
//   G-3 (idempotency required): `idempotency_key` defaults to `{{id}}`
//        when omitted; composite fallback + validator-refusal in the
//        dispatcher.
//   G-6 (filtered status): delivery status enum includes "filtered"
//        as distinct terminal state (not collapsed into delivered/
//        failed).
// Predicate primitive reused from lib/agents/types.ts — NOT extended
// per the containment principle (validated 12 times across 2b.2 +
// 2c + SLICE 1-a).
// ---------------------------------------------------------------------

// G-1: fully-qualified event name in `<block-slug>:<event.name>`
// form. Block slug is lowercase-with-hyphens (matches existing
// BLOCK.md id conventions like `caldiy-booking`). Event name is
// the two-or-more-dot-separated-lowercase-segments shape used
// elsewhere.
export const FullyQualifiedEventSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, {
    message:
      'Event must be "<block-slug>:<event.name>" (e.g., "caldiy-booking:booking.created")',
  });

// G-6: dispatcher outcome enum. `filtered` is distinct from
// `delivered` / `failed` so the admin surface can show "the
// predicate rejected this event" as its own state. `pending` /
// `in_flight` / `dead` ship with PR 2 runtime; defined here so
// the full enum is discoverable alongside the contract.
export const SubscriptionDeliveryStatusSchema = z.enum([
  "pending",
  "in_flight",
  "delivered",
  "failed",
  "filtered",
  "dead",
]);

export type SubscriptionDeliveryStatus = z.infer<
  typeof SubscriptionDeliveryStatusSchema
>;

// Retry policy. Defaults applied by the parser when the field is
// omitted entirely; per-field defaults applied when the object is
// partial. Ceiling on `max` enforced at validation time (recommend
// 10 per audit §3.2 + §4.7).
export const RetryPolicySchema = z.object({
  max: z.number().int().positive().max(10).default(3),
  backoff: z.enum(["exponential", "linear", "fixed"]).default("exponential"),
  initial_delay_ms: z.number().int().positive().default(1000),
});

export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

// Handler name — JavaScript identifier shape, consistent with the
// `export function <name>(...)` convention in block subscriptions.ts
// files. Validator cross-checks that a matching export exists at
// parse time (SLICE 1 PR 1 M3).
export const HandlerNameSchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9_]*$/, {
    message:
      "Handler name must be a lowerCamelCase identifier (e.g., logActivityOnBookingCreate)",
  });

// Idempotency key template. Accepts literal characters + `{{...}}`
// interpolations. G-3 defaults to `{{id}}` at parse time; the
// composite fallback + validator-refusal paths live in the M3
// validator.
export const IdempotencyKeyTemplateSchema = z.string().min(1);

// A subscription entry. Authored in BLOCK.md under `## Subscriptions`.
// Filter uses the existing Predicate primitive from
// lib/agents/types.ts — reused, NOT extended, per the containment
// principle. Authors writing a BLOCK.md don't import Zod; the parser
// reconstructs the object from YAML-ish syntax (see block-md.ts).
export const SubscriptionEntrySchema = z.object({
  event: FullyQualifiedEventSchema,
  handler: HandlerNameSchema,
  idempotency_key: IdempotencyKeyTemplateSchema.default("{{id}}"),
  retry: RetryPolicySchema.default({
    max: 3,
    backoff: "exponential",
    initial_delay_ms: 1000,
  }),
  // `filter` intentionally unknown shape here — validator (M3)
  // parses it against PredicateSchema. Keeping it `unknown` at the
  // contract-v2 layer preserves the separation: contract-v2 knows
  // contract shapes; lib/agents/types.ts owns the Predicate primitive.
  filter: z.unknown().optional(),
});

export type SubscriptionEntry = z.infer<typeof SubscriptionEntrySchema>;
