// Auto-derive <EntityTable> column definitions from a Zod schema.
//
// Shipped in SLICE 4a PR 1 C4 per audit §2.1. The goal: a block
// authored with a Zod schema for its primary entity gets a
// sensible default table without hand-crafting a column list.
// Overrides bolt on top for cases where the defaults aren't right
// (custom renderer, hidden internal fields, reordered columns).
//
// Scope for v1:
//   - ZodObject top-level fields only. Nested structures land as
//     `type: "object"` with generic JSON renderer in the table.
//   - Primitive detection: string / number / boolean / object.
//   - Nullable + Optional unwrap to underlying type.
//   - `include` array controls presence + order.
//   - Per-key `overrides` (title / hidden / renderer).
//
// What this module does NOT do:
//   - z.union / z.discriminatedUnion — column type is "object" /
//     the table uses a fallback renderer.
//   - Custom formatters by type (dates, currency). Future scope.
//   - Runtime validation of rows against the schema. That's a
//     table-usage concern, not column-derivation.

import type { ZodObject, ZodTypeAny } from "zod";

export type ColumnType = "string" | "number" | "boolean" | "object" | "unknown";

export type Column<T = Record<string, unknown>> = {
  key: keyof T & string;
  title: string;
  type: ColumnType;
  hidden?: boolean;
  /** Optional custom cell renderer — passed the raw value. */
  renderer?: (value: unknown, row: T) => React.ReactNode;
};

export type ColumnOverride<T = Record<string, unknown>> = {
  title?: string;
  hidden?: boolean;
  renderer?: (value: unknown, row: T) => React.ReactNode;
};

export type DeriveColumnsOptions<T = Record<string, unknown>> = {
  /** Explicit ordered subset of keys to include. Other keys are omitted. */
  include?: (keyof T & string)[];
  /** Per-key overrides merged onto auto-derived columns. */
  overrides?: Partial<Record<keyof T & string, ColumnOverride<T>>>;
};

/**
 * Derive columns from a Zod object schema.
 * Throws if `schema` isn't a ZodObject.
 */
export function deriveColumns<T extends Record<string, unknown> = Record<string, unknown>>(
  schema: ZodObject<Record<string, ZodTypeAny>>,
  options: DeriveColumnsOptions<T> = {},
): Column<T>[] {
  const shape = (schema as unknown as { shape?: Record<string, ZodTypeAny> }).shape;
  if (!shape || typeof shape !== "object") {
    throw new Error(
      "deriveColumns: schema must be a ZodObject (got something else — this module only supports top-level object schemas)",
    );
  }

  const orderedKeys = options.include ?? (Object.keys(shape) as (keyof T & string)[]);

  const columns: Column<T>[] = [];
  for (const key of orderedKeys) {
    const fieldSchema = shape[key];
    if (!fieldSchema) continue;
    const override = options.overrides?.[key];
    if (override?.hidden) continue;

    columns.push({
      key,
      title: override?.title ?? camelToTitle(key),
      type: detectType(fieldSchema),
      renderer: override?.renderer,
    });
  }

  return columns;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function detectType(field: ZodTypeAny): ColumnType {
  const unwrapped = unwrap(field);
  const typeName = getTypeName(unwrapped);
  switch (typeName) {
    case "ZodString":
      return "string";
    case "ZodNumber":
    case "ZodBigInt":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodObject":
    case "ZodArray":
    case "ZodRecord":
      return "object";
    default:
      return "unknown";
  }
}

function unwrap(field: ZodTypeAny): ZodTypeAny {
  let current: ZodTypeAny = field;
  // Zod v4 exposes `_def.type` with values like "optional" / "nullable"
  // + `_def.innerType` pointing at the wrapped schema.
  for (let i = 0; i < 10; i += 1) {
    const def = (current as unknown as { _def?: { type?: string; innerType?: ZodTypeAny } })._def;
    if (!def) return current;
    if ((def.type === "optional" || def.type === "nullable" || def.type === "default") && def.innerType) {
      current = def.innerType;
      continue;
    }
    return current;
  }
  return current;
}

function getTypeName(field: ZodTypeAny): string {
  // Zod v4: constructor name (e.g. ZodString). Fallback to _def.typeName
  // for older internal representations.
  const ctor = (field as unknown as { constructor?: { name?: string } }).constructor;
  if (ctor?.name) return ctor.name;
  const def = (field as unknown as { _def?: { typeName?: string } })._def;
  return def?.typeName ?? "Unknown";
}

/**
 * `firstName` → `"First Name"`. Splits on uppercase boundaries + each
 * word gets its first letter capitalised.
 */
function camelToTitle(key: string): string {
  if (!key) return "";
  return key
    .replace(/([A-Z])/g, " $1") // firstName → "first Name"
    .trim()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ""))
    .join(" ");
}
