// Auto-derive <EntityFormDrawer> field definitions from a Zod schema.
//
// Shipped in SLICE 4a PR 2 C2 per audit §2.1. Companion to
// deriveColumns (list side). Given a Zod schema for an entity,
// produces a typed list of form field specs: key, label, widget,
// required flag, defaultValue, options (for selects), placeholder.
//
// Widget inference v1:
//   ZodString                → "text"
//   ZodString().email()      → "email"       (detected via check format)
//   ZodString().url()        → "url"
//   ZodNumber / ZodBigInt    → "number"
//   ZodBoolean               → "checkbox"
//   ZodEnum                  → "select"      (options = enum values)
//   ZodDate                  → "date"
//   anything else (array/
//   object/record/union)     → "text"        (fallback — override for JSON/textarea)
//
// Required logic: a field is required unless wrapped in
// ZodOptional, ZodNullable, or ZodDefault. `.default(x)` also
// sets `defaultValue` on the field spec.
//
// Overrides API: per-key override can force widget, label,
// placeholder, options, or hide the field entirely.

import type { ZodObject, ZodTypeAny } from "zod";

export type FieldWidget =
  | "text"
  | "email"
  | "url"
  | "number"
  | "checkbox"
  | "select"
  | "date"
  | "textarea";

export type Field<T = Record<string, unknown>> = {
  key: keyof T & string;
  label: string;
  widget: FieldWidget;
  required: boolean;
  defaultValue?: unknown;
  /** Select-widget options. Populated from ZodEnum by default; overridable. */
  options?: readonly string[];
  placeholder?: string;
};

export type FieldOverride = {
  widget?: FieldWidget;
  label?: string;
  hidden?: boolean;
  options?: readonly string[];
  placeholder?: string;
};

export type DeriveFieldsOptions<T = Record<string, unknown>> = {
  /** Explicit ordered subset of keys. Missing keys in the schema are skipped. */
  include?: (keyof T & string)[];
  /** Per-key overrides merged on top of auto-derivation. */
  overrides?: Partial<Record<keyof T & string, FieldOverride>>;
};

/**
 * Derive fields from a Zod object schema.
 * Throws if `schema` isn't a ZodObject.
 */
export function deriveFields<T extends Record<string, unknown> = Record<string, unknown>>(
  schema: ZodObject<Record<string, ZodTypeAny>>,
  options: DeriveFieldsOptions<T> = {},
): Field<T>[] {
  const shape = (schema as unknown as { shape?: Record<string, ZodTypeAny> }).shape;
  if (!shape || typeof shape !== "object") {
    throw new Error(
      "deriveFields: schema must be a ZodObject (got something else — this module only supports top-level object schemas)",
    );
  }

  const allKeys = Object.keys(shape) as (keyof T & string)[];
  const orderedKeys =
    options.include !== undefined
      ? options.include.filter((k) => k in shape)
      : allKeys;

  const fields: Field<T>[] = [];
  for (const key of orderedKeys) {
    const fieldSchema = shape[key];
    if (!fieldSchema) continue;
    const override = options.overrides?.[key];
    if (override?.hidden) continue;

    const { widget: autoWidget, options: autoOptions } = detectWidget(fieldSchema);
    const widget = override?.widget ?? autoWidget;
    const resolvedOptions = override?.options ?? autoOptions;

    fields.push({
      key,
      label: override?.label ?? camelToTitle(key),
      widget,
      required: isRequired(fieldSchema),
      defaultValue: extractDefault(fieldSchema),
      ...(resolvedOptions ? { options: resolvedOptions } : {}),
      ...(override?.placeholder ? { placeholder: override.placeholder } : {}),
    });
  }

  return fields;
}

// ---------------------------------------------------------------------
// Zod introspection helpers
// ---------------------------------------------------------------------

type ZodDef = {
  type?: string;
  innerType?: ZodTypeAny;
  defaultValue?: unknown;
  checks?: Array<{ def?: { format?: string }; format?: string }>;
  entries?: Record<string, string>;
};

function getDef(field: ZodTypeAny): ZodDef | undefined {
  return (field as unknown as { _def?: ZodDef })._def;
}

function getTypeName(field: ZodTypeAny): string {
  const ctor = (field as unknown as { constructor?: { name?: string } }).constructor;
  if (ctor?.name) return ctor.name;
  return getDef(field)?.type ?? "Unknown";
}

function isWrapper(
  field: ZodTypeAny,
): { innerType: ZodTypeAny } | undefined {
  const def = getDef(field);
  if (!def) return undefined;
  if (
    (def.type === "optional" || def.type === "nullable" || def.type === "default") &&
    def.innerType
  ) {
    return { innerType: def.innerType };
  }
  return undefined;
}

function unwrap(field: ZodTypeAny): ZodTypeAny {
  let current: ZodTypeAny = field;
  for (let i = 0; i < 10; i += 1) {
    const wrap = isWrapper(current);
    if (!wrap) return current;
    current = wrap.innerType;
  }
  return current;
}

function isRequired(field: ZodTypeAny): boolean {
  const def = getDef(field);
  if (!def) return true;
  if (def.type === "optional" || def.type === "nullable" || def.type === "default") {
    return false;
  }
  return true;
}

function extractDefault(field: ZodTypeAny): unknown {
  // Walk the wrapper chain looking for ZodDefault. Take the first
  // defaultValue encountered.
  let current: ZodTypeAny = field;
  for (let i = 0; i < 10; i += 1) {
    const def = getDef(current);
    if (!def) return undefined;
    if (def.type === "default") {
      // Zod v4 stores the default as a thunk — `defaultValue` may be
      // the raw value or a function returning it.
      const raw = def.defaultValue as unknown;
      return typeof raw === "function" ? (raw as () => unknown)() : raw;
    }
    const wrap = isWrapper(current);
    if (!wrap) return undefined;
    current = wrap.innerType;
  }
  return undefined;
}

function detectWidget(field: ZodTypeAny): {
  widget: FieldWidget;
  options?: readonly string[];
} {
  const inner = unwrap(field);
  const typeName = getTypeName(inner);
  const def = getDef(inner);

  switch (typeName) {
    case "ZodString": {
      const format = def?.checks?.find((c) => c.def?.format ?? c.format)?.def?.format
        ?? def?.checks?.find((c) => c.format)?.format;
      if (format === "email") return { widget: "email" };
      if (format === "url" || format === "uri") return { widget: "url" };
      return { widget: "text" };
    }
    case "ZodNumber":
    case "ZodBigInt":
      return { widget: "number" };
    case "ZodBoolean":
      return { widget: "checkbox" };
    case "ZodDate":
      return { widget: "date" };
    case "ZodEnum": {
      const entries = def?.entries;
      const options = entries ? Object.values(entries) : [];
      return { widget: "select", options };
    }
    default:
      return { widget: "text" };
  }
}

/**
 * `firstName` → `"First Name"`. Mirrors derive-columns' helper so
 * list + form labels land identical.
 */
function camelToTitle(key: string): string {
  if (!key) return "";
  return key
    .replace(/([A-Z])/g, " $1")
    .trim()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ""))
    .join(" ");
}
