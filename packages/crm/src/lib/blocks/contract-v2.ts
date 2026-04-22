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
