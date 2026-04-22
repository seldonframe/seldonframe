// Event-registry codegen — parses the SeldonEvent union from
// packages/core/src/events/index.ts into a runtime-queryable JSON shape.
//
// Shipped in Scope 3 Step 2b.1 PR 1 (C7) per audit §7.3 approved
// approach (build-time codegen).
//
// Why this exists: the SeldonEvent TypeScript union is the source of
// truth for event payload shapes, but TypeScript types evaporate at
// runtime. PR 2's agent-spec validator needs to look up "for a given
// event type, what fields does its data carry?" — which requires a
// runtime-queryable form. This parser extracts the union variants into
// a JSON shape the validator can read without pulling in the TypeScript
// compiler at runtime.
//
// Narrowness on purpose. The SeldonEvent union shape is flat — each
// variant is `{ type: "<name>"; data: { <field>: <type>; ... } }`. This
// parser handles that shape and nothing more. If the union grows a
// nested variant (e.g., discriminated sub-unions inside data), this
// parser must be extended explicitly — rather than try to be a general
// TS parser and fail silently on edge cases.

export type ParsedEventField = {
  /** The raw TypeScript type text as it appears in the union. */
  rawType: string;
  /** True when the type includes `| null` or `| undefined`. */
  nullable: boolean;
};

export type ParsedEvent = {
  type: string;
  fields: Record<string, ParsedEventField>;
};

export type EventRegistry = {
  /**
   * Informational header for humans reading the generated JSON.
   * Pinned to the first key so it renders at the top of the file.
   */
  $comment: string;
  events: ParsedEvent[];
};

const REGISTRY_COMMENT =
  "Generated from packages/core/src/events/index.ts SeldonEvent union. Edit the union, not this file. Run `pnpm emit:event-registry` to regenerate.";

/**
 * Extract the body of the `export type SeldonEvent = ...;` declaration
 * from the full contents of `index.ts`. Returns null if not found —
 * caller surfaces that as an error.
 */
export function extractSeldonEventBody(source: string): string | null {
  // Find `export type SeldonEvent =` and read until the terminating `;`.
  const anchor = source.indexOf("export type SeldonEvent");
  if (anchor === -1) return null;

  const equalsIdx = source.indexOf("=", anchor);
  if (equalsIdx === -1) return null;

  // Walk forward counting braces so we don't terminate inside a nested
  // data shape. End when depth returns to 0 and we hit `;`.
  let depth = 0;
  for (let i = equalsIdx + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ";" && depth === 0) {
      return source.slice(equalsIdx + 1, i).trim();
    }
  }
  return null;
}

/**
 * Split the body of `SeldonEvent` into the `| { type: "..."; data: {...} }`
 * variants. Brace-aware so nested braces in `data` don't break the split.
 */
export function splitVariants(body: string): string[] {
  const variants: string[] = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        variants.push(body.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return variants;
}

/**
 * Parse one `{ type: "<name>"; data: {...} }` variant. Returns null if
 * the variant doesn't match the expected flat shape — the caller should
 * treat that as an extension point that needs manual handling.
 */
export function parseVariant(variant: string): ParsedEvent | null {
  const typeMatch = variant.match(/type:\s*"([^"]+)"/);
  if (!typeMatch) return null;
  const type = typeMatch[1];

  // Extract the data block: `data: { ... }`. Brace-aware scan so any
  // nested braces (Record<string, unknown>, object types) are captured.
  const dataAnchor = variant.indexOf("data:");
  if (dataAnchor === -1) return { type, fields: {} };
  const dataOpen = variant.indexOf("{", dataAnchor);
  if (dataOpen === -1) return { type, fields: {} };

  let depth = 0;
  let dataClose = -1;
  for (let i = dataOpen; i < variant.length; i += 1) {
    if (variant[i] === "{") depth += 1;
    else if (variant[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        dataClose = i;
        break;
      }
    }
  }
  if (dataClose === -1) return { type, fields: {} };

  const dataInner = variant.slice(dataOpen + 1, dataClose).trim();
  return { type, fields: parseFields(dataInner) };
}

/**
 * Parse the contents of a `data: { ... }` block into field records.
 * Splits on top-level semicolons (brace-aware so fields whose types
 * contain `;` — rare but not impossible — don't split incorrectly).
 */
export function parseFields(inner: string): Record<string, ParsedEventField> {
  const fields: Record<string, ParsedEventField> = {};
  if (!inner.trim()) return fields;

  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === "{" || ch === "<") depth += 1;
    else if (ch === "}" || ch === ">") depth -= 1;
    else if (ch === ";" && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  if (start < inner.length) parts.push(inner.slice(start));

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const name = trimmed.slice(0, colon).trim();
    const rawType = trimmed.slice(colon + 1).trim();
    if (!name) continue;
    const nullable = /\|\s*(null|undefined)\b/.test(rawType);
    fields[name] = { rawType, nullable };
  }

  return fields;
}

/**
 * Walk the full SeldonEvent union and build the registry.
 * Throws if the source doesn't contain a SeldonEvent declaration
 * (catastrophic failure; codegen is broken).
 */
export function buildEventRegistry(source: string): EventRegistry {
  const body = extractSeldonEventBody(source);
  if (!body) {
    throw new Error("SeldonEvent union not found in source");
  }

  const variants = splitVariants(body);
  const events: ParsedEvent[] = [];
  for (const variant of variants) {
    const parsed = parseVariant(variant);
    if (parsed) events.push(parsed);
  }

  return {
    $comment: REGISTRY_COMMENT,
    events,
  };
}

/** Serialize with 2-space indent, newline at EOF. Deterministic. */
export function serializeRegistry(registry: EventRegistry): string {
  return `${JSON.stringify(registry, null, 2)}\n`;
}
