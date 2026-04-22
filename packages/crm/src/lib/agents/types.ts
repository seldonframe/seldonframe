// Agent-spec primitive types for Composition Contract v2.
//
// Shipped in Scope 3 Step 2b.1 PR 1 (C2) per tasks/step-2b-1-contract-v2-
// audit.md §2.b + §9.3. These types are the shared vocabulary for typed
// conversation exits (2b.1 scope) AND, later, external-state branching
// (2e scope) — specifically `Predicate` is exported as the shared
// primitive so 2e can add its `external_state` variant without redesigning
// the branching surface.
//
// Consumers: this file's types are authored in Zod; downstream code reads
// either the Zod schemas (for runtime validation once 7.e ships) or the
// inferred TypeScript types (for synthesis-time checking, which is PR 2's
// agent-spec validator). BLOCK.md authors do NOT import these directly —
// they author tools in `<block>.tools.ts` files using the primitives, and
// the emit step (C6) renders JSON Schema from them.

import { z } from "zod";

// ---------------------------------------------------------------------
// Predicate — shared primitive for conversation exits (2b.1) and branch
// step conditions (2e, not yet implemented).
//
// 2b.1 only uses "in-conversation" variants (field_equals / field_contains
// / field_exists / event_emitted / all / any). 2e will add `external_state`
// when it ships. Keeping this as Predicate (not ExitPredicate) matches
// audit §9.3: the shape is not exit-specific, it's a general condition
// primitive that multiple step types will reference.
// ---------------------------------------------------------------------

export type Predicate =
  | { kind: "field_equals"; field: string; value: string | number | boolean }
  | { kind: "field_contains"; field: string; substring: string }
  | { kind: "field_exists"; field: string }
  | { kind: "event_emitted"; eventType: string }
  | { kind: "all"; of: Predicate[] }
  | { kind: "any"; of: Predicate[] };

// Recursive schema — Zod requires z.lazy() and explicit type annotation
// because the `all` / `any` variants reference Predicate itself.
export const PredicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("field_equals"),
      field: z.string().min(1),
      value: z.union([z.string(), z.number(), z.boolean()]),
    }),
    z.object({
      kind: z.literal("field_contains"),
      field: z.string().min(1),
      substring: z.string().min(1),
    }),
    z.object({
      kind: z.literal("field_exists"),
      field: z.string().min(1),
    }),
    z.object({
      kind: z.literal("event_emitted"),
      eventType: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, {
        message: 'eventType must be "namespace.verb" lowercase (e.g., "booking.created")',
      }),
    }),
    z.object({
      kind: z.literal("all"),
      of: z.array(PredicateSchema).min(1),
    }),
    z.object({
      kind: z.literal("any"),
      of: z.array(PredicateSchema).min(1),
    }),
  ])
);

// ---------------------------------------------------------------------
// ExtractField — typed description of a value extracted from a
// conversation on exit. `description` is the NL hint Claude uses during
// extraction; `type` narrows the downstream shape so {{interpolation}}
// references can be type-checked by PR 2's agent-spec validator.
// ---------------------------------------------------------------------

export const ExtractFieldSchema = z
  .object({
    type: z.enum(["string", "number", "boolean", "enum", "iso8601"]),
    enum_values: z.array(z.string().min(1)).optional(),
    required: z.boolean(),
    description: z.string().min(1),
  })
  .refine(
    (value) =>
      value.type !== "enum" ||
      (Array.isArray(value.enum_values) && value.enum_values.length > 0),
    { message: "ExtractField with type=enum must declare non-empty enum_values" }
  )
  .refine(
    (value) => value.type === "enum" || value.enum_values === undefined,
    { message: "enum_values is only valid when type=enum" }
  );

export type ExtractField = z.infer<typeof ExtractFieldSchema>;

// ---------------------------------------------------------------------
// Duration — ISO 8601 duration strings used by timeout exits and (later)
// wait steps. Narrow subset of the full grammar — only the forms we need
// today. Future slices can broaden if needed.
//   Accepted:   PT30M, PT1H, PT45S, P3D, P1W, P2M, P1Y
//   Rejected:   P1Y2M3DT4H5M6S (combined), 30m (missing prefix), etc.
// ---------------------------------------------------------------------

export const DurationSchema = z
  .string()
  .regex(/^(P(T\d+[SMH])|P\d+[DWMY])$/, {
    message:
      'Duration must be an ISO 8601 duration (supported forms: PT<n>[SMH] for sub-day, P<n>[DWMY] for day-and-up — e.g., "PT30M", "P3D")',
  });

export type Duration = z.infer<typeof DurationSchema>;

// ---------------------------------------------------------------------
// ConversationExit — the typed shape a conversation step uses to decide
// when to terminate and what to extract for downstream steps. Two
// variants today per audit §2.b:
//   - predicate: exit when the predicate holds (field_equals / etc.)
//   - timeout:   exit after the duration elapses, with optional extract
// Audit-approved: external_state is NOT an exit variant — it's a branch-
// step condition owned by 2e.
// ---------------------------------------------------------------------

export const ConversationExitSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("predicate"),
    predicate: PredicateSchema,
    extract: z.record(z.string().min(1), ExtractFieldSchema),
    next: z.string().nullable(),
  }),
  z.object({
    type: z.literal("timeout"),
    after: DurationSchema,
    extract: z.record(z.string().min(1), ExtractFieldSchema).optional(),
    next: z.string().nullable(),
  }),
]);

export type ConversationExit = z.infer<typeof ConversationExitSchema>;
