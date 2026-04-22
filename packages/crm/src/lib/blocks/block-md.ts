import {
  ToolEntry,
  ToolEntrySchema,
  TypedConsumesEntry,
  TypedConsumesEntrySchema,
  TypedProducesEntry,
  TypedProducesEntrySchema,
} from "./contract-v2";

export type BlockMdViewType = "table" | "kanban" | "record" | "timeline";

export type BlockMdFieldDefinition = {
  name: string;
  type: string;
  relation?: string;
  options?: string[];
  auto?: boolean;
  raw: string;
};

export type BlockMdEntityRelationDefinition = {
  field: string;
  target: string;
  raw: string;
};

export type BlockMdEntityDefinition = {
  name: string;
  singular?: string;
  plural?: string;
  slug?: string;
  routeBase?: string;
  description?: string;
  fields: BlockMdFieldDefinition[];
  relations: BlockMdEntityRelationDefinition[];
  raw: string[];
};

export type BlockMdViewFilter = {
  field: string;
  value: string;
  operator?: "contains" | "is" | "gt" | "gte" | "lt" | "lte";
};

export type BlockMdViewSort = {
  field: string;
  direction: "asc" | "desc";
};

export type BlockMdSavedViewDefinition = {
  visibility: "personal" | "shared";
  label: string;
};

export type BlockMdViewDefinition = {
  name: string;
  entity: string;
  type: BlockMdViewType;
  route?: string;
  default?: boolean;
  columns: string[];
  fields: string[];
  cardFields: string[];
  filters: BlockMdViewFilter[];
  sorting: BlockMdViewSort[];
  laneField?: string;
  titleField?: string;
  descriptionField?: string;
  wipLimits: Record<string, number>;
  savedViews: BlockMdSavedViewDefinition[];
  raw: string[];
};

// Added Phase 2.75 (2026-04-20). The composition contract is the
// machine-readable input to agent synthesis (Phase 7): given a prompt + Soul
// + registry of blocks with contracts, Claude picks blocks by matching
// natural-language `verbs`, chains them via `produces` → `consumes`, and
// only composes blocks that list each other in `composeWith`.
//
// Contract lives in the BLOCK.md under `## Composition Contract` as four
// typed key:[array] lines. Missing section is OK — parser returns empty
// arrays so un-amended blocks don't crash anything; synthesis just treats
// them as "no known composition" and won't auto-use them.
//
// v2 (Scope 3 Step 2b.1, 2026-04-21): typed produces/consumes via JSON
// object entries; typed tool-input surface via a <!-- TOOLS --> block
// carrying JSON-Schema. v1 and v2 coexist at parse time — a block stays
// on v1 until it migrates (2b.2 migrates the remaining 6 core blocks; CRM
// migrates in PR 3 of this slice). `isV2` is true when the block uses any
// typed field (producesTyped / consumesTyped / tools populated).
export type BlockMdCompositionContract = {
  // Event names this block emits (read by downstream blocks' consumes).
  // Format: "namespace.verb" e.g. "contact.created", "form.submitted".
  // v1 + v2: always populated with event names for downstream consumers
  // that only read names (saves every consumer from branching on isV2).
  produces: string[];
  // Soul / workspace context keys this block reads at runtime.
  // Format: dot-path e.g. "workspace.soul.business_type".
  // v1 + v2: always populated (v2 flattens typed entries to their
  // human-readable references).
  consumes: string[];
  // Natural-language intents that route to this block. Lowercase, no
  // punctuation. e.g. "intake", "capture", "qualify", "schedule a call".
  verbs: string[];
  // Other block slugs this composes cleanly with. Used by synthesis to
  // prefer known-good pairings over hallucinated ones.
  composeWith: string[];
  // Original lines from the section — retained for debugging + future
  // extension without breaking the typed surface.
  raw: string[];
  // v2 typed entries. Present when the block authored `produces:` /
  // `consumes:` as JSON arrays of objects rather than string lists.
  // Undefined on v1 blocks. See contract-v2.ts for shapes.
  producesTyped?: TypedProducesEntry[];
  consumesTyped?: TypedConsumesEntry[];
  // v2 tool catalogue parsed from the `<!-- TOOLS:START --> ... <!-- TOOLS:END -->`
  // marker block. Each entry is JSON-Schema-shaped (emitted by C6's
  // `z.toJSONSchema()` pass over a `<block>.tools.ts` module).
  tools?: ToolEntry[];
  // True when any v2 field is populated. Synthesis + validator use this
  // to decide whether to apply the v2 type-check surface or treat the
  // block as legacy-contract.
  isV2: boolean;
  // Parse-time errors for lines that straddled v1/v2 shapes inside a
  // single field. Surfaces as `mixed_v1_v2` warnings from the validator.
  mixedShapeFields: string[];
};

export type ParsedBlockMd = {
  title: string | null;
  purpose: string;
  entities: BlockMdEntityDefinition[];
  views: BlockMdViewDefinition[];
  composition: BlockMdCompositionContract;
  sections: Record<string, string>;
  // True when the BLOCK.md carries the "intentionally invisible" HTML-
  // comment marker (Scope 3 Step 2b.1 §7.5). Stamped on the 11 non-core
  // recipe blocks so the validator treats them as deliberately opaque to
  // synthesis rather than accidentally-missing-contract. When true, the
  // validator short-circuits and returns zero warnings even though the
  // composition fields are all empty.
  intentionallyInvisible: boolean;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "1";
}

function extractSections(blockMd: string) {
  const lines = blockMd.replace(/\r\n/g, "\n").split("\n");
  const sections: Record<string, string[]> = {};
  let currentSection = "";

  for (const line of lines) {
    if (line.startsWith("## ")) {
      currentSection = line.slice(3).trim().toLowerCase();
      sections[currentSection] = [];
      continue;
    }

    if (!currentSection) {
      continue;
    }

    sections[currentSection].push(line);
  }

  return Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, value.join("\n").trim()]));
}

function parseField(line: string): BlockMdFieldDefinition | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("- ")) {
    return null;
  }

  const match = trimmed.match(/^-\s*([^()]+?)\s*\(([^)]+)\)\s*$/);
  if (!match) {
    return null;
  }

  const [, rawName, rawDescriptor] = match;
  const name = rawName.trim();
  const descriptor = rawDescriptor.trim();
  const normalizedDescriptor = descriptor.toLowerCase();

  if (!name) {
    return null;
  }

  if (normalizedDescriptor.startsWith("relation")) {
    const relationMatch = descriptor.match(/relation\s*->\s*(.+)$/i);
    return {
      name,
      type: "relation",
      relation: relationMatch?.[1]?.trim(),
      raw: trimmed,
    };
  }

  if (normalizedDescriptor.startsWith("enum:")) {
    return {
      name,
      type: "enum",
      options: descriptor
        .slice(descriptor.indexOf(":") + 1)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      raw: trimmed,
    };
  }

  const parts = descriptor.split(",").map((item) => item.trim()).filter(Boolean);

  return {
    name,
    type: parts[0]?.toLowerCase() || descriptor.toLowerCase(),
    auto: parts.some((part) => part.toLowerCase() === "auto"),
    raw: trimmed,
  };
}

function parseEntityMetadata(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("- ")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex < 1) {
    return null;
  }

  const key = trimmed.slice(2, separatorIndex).trim().toLowerCase();
  const value = trimmed.slice(separatorIndex + 1).trim();
  if (!value) {
    return null;
  }

  if (key === "singular" || key === "plural" || key === "slug" || key === "routebase" || key === "description") {
    return { key, value };
  }

  return null;
}

function finalizeEntity(entity: BlockMdEntityDefinition): BlockMdEntityDefinition {
  return {
    ...entity,
    relations: entity.fields
      .filter((field) => field.type === "relation" && field.relation)
      .map((field) => ({
        field: field.name,
        target: field.relation ?? "",
        raw: field.raw,
      })),
  };
}

function parseEntities(section: string) {
  const lines = section.replace(/\r\n/g, "\n").split("\n");
  const entities: BlockMdEntityDefinition[] = [];
  let current: BlockMdEntityDefinition | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("### ")) {
      if (current) {
        entities.push(current);
      }

      current = {
        name: trimmed.slice(4).trim(),
        fields: [],
        relations: [],
        raw: [],
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (trimmed.startsWith("- ")) {
      current.raw.push(trimmed);
    }

    const metadata = parseEntityMetadata(trimmed);
    if (metadata) {
      if (metadata.key === "singular") {
        current.singular = metadata.value;
      } else if (metadata.key === "plural") {
        current.plural = metadata.value;
      } else if (metadata.key === "slug") {
        current.slug = metadata.value;
      } else if (metadata.key === "routebase") {
        current.routeBase = metadata.value.replace(/^\/+|\/+$/g, "");
      } else if (metadata.key === "description") {
        current.description = metadata.value;
      }
      continue;
    }

    const field = parseField(trimmed);
    if (field) {
      current.fields.push(field);
    }
  }

  if (current) {
    entities.push(finalizeEntity(current));
  }

  return entities;
}

function parseFilterItem(input: string): BlockMdViewFilter | null {
  const trimmed = input.trim();
  const operators = [
    { token: ">=", operator: "gte" as const },
    { token: "<=", operator: "lte" as const },
    { token: ">", operator: "gt" as const },
    { token: "<", operator: "lt" as const },
    { token: "=", operator: "contains" as const },
    { token: ":", operator: "contains" as const },
  ];

  for (const candidate of operators) {
    const separatorIndex = trimmed.indexOf(candidate.token);
    if (separatorIndex < 1) {
      continue;
    }

    const field = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + candidate.token.length).trim();
    if (!field || !value) {
      return null;
    }

    return { field, value, operator: candidate.operator };
  }

  return null;
}

function parseSortItem(input: string): BlockMdViewSort | null {
  const separatorIndex = input.indexOf(":");
  if (separatorIndex < 1) {
    return null;
  }

  const field = input.slice(0, separatorIndex).trim();
  const direction = input.slice(separatorIndex + 1).trim().toLowerCase();
  if (!field || (direction !== "asc" && direction !== "desc")) {
    return null;
  }

  return { field, direction };
}

function parseSavedViewItem(input: string): BlockMdSavedViewDefinition | null {
  const separatorIndex = input.indexOf(":");
  if (separatorIndex < 1) {
    return null;
  }

  const visibility = input.slice(0, separatorIndex).trim().toLowerCase();
  const label = input.slice(separatorIndex + 1).trim();

  if ((visibility !== "personal" && visibility !== "shared") || !label) {
    return null;
  }

  return {
    visibility,
    label,
  };
}

function parseWipLimitItem(input: string) {
  const separatorIndex = input.includes("=") ? input.indexOf("=") : input.indexOf(":");
  if (separatorIndex < 1) {
    return null;
  }

  const lane = input.slice(0, separatorIndex).trim();
  const rawValue = Number(input.slice(separatorIndex + 1).trim());
  if (!lane || !Number.isFinite(rawValue)) {
    return null;
  }

  return { lane, value: rawValue };
}

function parseViews(section: string) {
  const lines = section.replace(/\r\n/g, "\n").split("\n");
  const views: BlockMdViewDefinition[] = [];
  let current: BlockMdViewDefinition | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("### ")) {
      if (current) {
        views.push(current);
      }

      current = {
        name: trimmed.slice(4).trim(),
        entity: "",
        type: "table",
        columns: [],
        fields: [],
        cardFields: [],
        filters: [],
        sorting: [],
        wipLimits: {},
        savedViews: [],
        raw: [],
      };
      continue;
    }

    if (!current || !trimmed.startsWith("- ")) {
      continue;
    }

    current.raw.push(trimmed);
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex < 1) {
      continue;
    }

    const rawKey = trimmed.slice(2, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    const key = rawKey.toLowerCase();

    if (key === "entity") {
      current.entity = value;
      continue;
    }

    if (key === "type") {
      if (value === "table" || value === "kanban" || value === "record" || value === "timeline") {
        current.type = value;
      }
      continue;
    }

    if (key === "route") {
      current.route = value;
      continue;
    }

    if (key === "default") {
      current.default = toBoolean(value);
      continue;
    }

    if (key === "columns") {
      current.columns = splitCommaList(value);
      continue;
    }

    if (key === "fields") {
      current.fields = splitCommaList(value);
      continue;
    }

    if (key === "cardfields") {
      current.cardFields = splitCommaList(value);
      continue;
    }

    if (key === "filters") {
      current.filters = value
        .split(",")
        .map((item) => parseFilterItem(item.trim()))
        .filter((item): item is BlockMdViewFilter => Boolean(item));
      continue;
    }

    if (key === "sorting") {
      current.sorting = value
        .split(",")
        .map((item) => parseSortItem(item.trim()))
        .filter((item): item is BlockMdViewSort => Boolean(item));
      continue;
    }

    if (key === "lanefield") {
      current.laneField = value;
      continue;
    }

    if (key === "titlefield") {
      current.titleField = value;
      continue;
    }

    if (key === "descriptionfield") {
      current.descriptionField = value;
      continue;
    }

    if (key === "wiplimits") {
      current.wipLimits = Object.fromEntries(
        value
          .split(",")
          .map((item) => parseWipLimitItem(item.trim()))
          .filter((item): item is { lane: string; value: number } => Boolean(item))
          .map((item) => [item.lane, item.value])
      );
      continue;
    }

    if (key === "savedviews" || key === "savedview") {
      current.savedViews.push(
        ...value
          .split("|")
          .map((item) => parseSavedViewItem(item.trim()))
          .filter((item): item is BlockMdSavedViewDefinition => Boolean(item))
      );
    }
  }

  if (current) {
    views.push(current);
  }

  return views.filter((view) => view.name && view.entity);
}

function pickPrimaryField(entity: BlockMdEntityDefinition) {
  return (
    entity.fields.find((field) => /^(name|title|subject)$/i.test(field.name))?.name ||
    entity.fields.find((field) => field.type !== "relation")?.name ||
    entity.fields[0]?.name ||
    "name"
  );
}

function buildDefaultViews(entities: BlockMdEntityDefinition[]): BlockMdViewDefinition[] {
  const primaryEntity = entities[0];
  if (!primaryEntity) {
    return [];
  }

  const singularLabel = primaryEntity.singular?.trim() || primaryEntity.name;
  const pluralLabel = primaryEntity.plural?.trim() || primaryEntity.name;
  const routeBase = primaryEntity.routeBase?.trim().replace(/^\/+|\/+$/g, "") || slugify(primaryEntity.slug || pluralLabel) || "records";
  const primaryField = pickPrimaryField(primaryEntity);
  const defaultColumns = primaryEntity.fields
    .filter((field) => field.type !== "long text" && field.type !== "rich text" && field.type !== "key-value map")
    .slice(0, 5)
    .map((field) => field.name);
  const defaultFields = primaryEntity.fields.slice(0, 8).map((field) => field.name);
  const stageField = primaryEntity.fields.find((field) => field.type === "enum" && /stage|status|pipeline|lane/i.test(field.name));

  const views: BlockMdViewDefinition[] = [
    {
      name: `${pluralLabel} Table`,
      entity: singularLabel,
      type: "table",
      route: `/${routeBase}`,
      default: true,
      columns: defaultColumns,
      fields: [],
      cardFields: [],
      filters: stageField ? [{ field: stageField.name, value: stageField.options?.[0] ?? "active" }] : [],
      sorting: [{ field: primaryEntity.fields.find((field) => /updatedat|createdat/i.test(field.name))?.name ?? primaryField, direction: "desc" }],
      laneField: undefined,
      titleField: undefined,
      descriptionField: undefined,
      wipLimits: {},
      savedViews: [
        { visibility: "personal", label: `My ${pluralLabel} Queue` },
        { visibility: "shared", label: `${pluralLabel} Team View` },
      ],
      raw: [],
    },
    {
      name: `${singularLabel} Record`,
      entity: singularLabel,
      type: "record",
      route: `/${routeBase}/[id]`,
      default: false,
      columns: [],
      fields: defaultFields,
      cardFields: [],
      filters: [],
      sorting: [],
      laneField: undefined,
      titleField: primaryField,
      descriptionField: primaryEntity.fields.find((field) => /description|summary|notes/i.test(field.name))?.name,
      wipLimits: {},
      savedViews: [],
      raw: [],
    },
  ];

  if (stageField) {
    views.push({
      name: `${pluralLabel} Pipeline`,
      entity: singularLabel,
      type: "kanban",
      route: `/${routeBase}/pipeline`,
      default: false,
      columns: [],
      fields: [],
      cardFields: [
        primaryField,
        ...primaryEntity.fields
          .filter((field) => field.name !== primaryField && field.type !== "long text" && field.type !== "rich text")
          .slice(0, 3)
          .map((field) => field.name),
      ],
      filters: [],
      sorting: [],
      laneField: stageField.name,
      titleField: primaryField,
      descriptionField: primaryEntity.fields.find((field) => /description|summary|notes/i.test(field.name))?.name,
      wipLimits: Object.fromEntries((stageField.options ?? []).slice(0, 5).map((option) => [option, 10])),
      savedViews: [
        { visibility: "personal", label: `My ${pluralLabel} Pipeline` },
        { visibility: "shared", label: `${pluralLabel} Pipeline` },
      ],
      raw: [],
    });
  }

  return views;
}

function serializeViewsSection(views: BlockMdViewDefinition[]) {
  const body = views
    .map((view) => {
      const lines = [
        `### ${view.name}`,
        `- entity: ${view.entity}`,
        `- type: ${view.type}`,
      ];

      if (view.route) {
        lines.push(`- route: ${view.route}`);
      }
      if (typeof view.default === "boolean") {
        lines.push(`- default: ${view.default ? "true" : "false"}`);
      }
      if (view.columns.length > 0) {
        lines.push(`- columns: ${view.columns.join(", ")}`);
      }
      if (view.fields.length > 0) {
        lines.push(`- fields: ${view.fields.join(", ")}`);
      }
      if (view.cardFields.length > 0) {
        lines.push(`- cardFields: ${view.cardFields.join(", ")}`);
      }
      if (view.filters.length > 0) {
        lines.push(`- filters: ${view.filters.map((filter) => {
          const token = filter.operator === "gt"
            ? ">"
            : filter.operator === "gte"
              ? ">="
              : filter.operator === "lt"
                ? "<"
                : filter.operator === "lte"
                  ? "<="
                  : filter.operator === "is"
                    ? ":"
                    : "=";
          return `${filter.field}${token}${filter.value}`;
        }).join(", ")}`);
      }
      if (view.sorting.length > 0) {
        lines.push(`- sorting: ${view.sorting.map((sort) => `${sort.field}:${sort.direction}`).join(", ")}`);
      }
      if (view.laneField) {
        lines.push(`- laneField: ${view.laneField}`);
      }
      if (view.titleField) {
        lines.push(`- titleField: ${view.titleField}`);
      }
      if (view.descriptionField) {
        lines.push(`- descriptionField: ${view.descriptionField}`);
      }
      if (Object.keys(view.wipLimits).length > 0) {
        lines.push(`- wipLimits: ${Object.entries(view.wipLimits).map(([lane, value]) => `${lane}=${value}`).join(", ")}`);
      }
      if (view.savedViews.length > 0) {
        lines.push(`- savedViews: ${view.savedViews.map((savedView) => `${savedView.visibility}:${savedView.label}`).join(" | ")}`);
      }

      return lines.join("\n");
    })
    .join("\n\n");

  return `## Views\n\n${body}`;
}

export function serializeBlockMdViews(views: BlockMdViewDefinition[]) {
  return serializeViewsSection(views);
}

// Parse outcome for a single contract line. `shape` discriminates v1
// (legacy comma-list) from v2 (JSON array of objects) — the parser uses
// this to route the values into the correct field and to detect
// mixed-within-a-single-field drift per audit §3 rule 3.
type ParsedCompositionLine =
  | { key: string; shape: "v1"; values: string[] }
  | { key: string; shape: "v2"; entries: unknown[] }
  | { key: string; shape: "mixed"; raw: string };

// Parse a single `key: [a, b, c]` (v1) OR `key: [{...}, {...}]` (v2)
// line from the Composition Contract section. Returns null for malformed
// lines so the caller can collect them into `raw` without losing data.
function parseCompositionLine(line: string): ParsedCompositionLine | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return null;

  // Accept:
  //   - `key: [a, b, c]`
  //   - `key: a, b, c`
  //   - `- key: [a, b, c]` (dash-prefix bullet)
  //   - `key: [{...}, {...}]` (v2 JSON object array)
  const match = trimmed.replace(/^-\s+/, "").match(/^([a-z_][a-z0-9_]*)\s*:\s*(.+)$/i);
  if (!match) return null;

  const key = match[1].toLowerCase();
  const rawValue = match[2].trim();

  // v2 detection: if the value is a well-formed JSON array, treat entries
  // as typed v2 data. Mixed arrays (strings + objects) are rejected per
  // audit §3 rule 3. v1's `[name, name]` is NOT valid JSON (identifiers
  // aren't quoted), so this is a clean discriminator — v1 flows into the
  // fallback splitCommaList path below.
  if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
    try {
      const parsed: unknown = JSON.parse(rawValue);
      if (Array.isArray(parsed)) {
        const hasObjects = parsed.some((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry));
        const hasStrings = parsed.some((entry) => typeof entry === "string");
        if (hasObjects && hasStrings) {
          return { key, shape: "mixed", raw: rawValue };
        }
        if (hasObjects) {
          return { key, shape: "v2", entries: parsed };
        }
        // All-strings JSON array (e.g., `produces: ["a", "b"]`) is v1 with
        // quoted identifiers — fall through to the comma-list shape so it
        // behaves identically to `produces: [a, b]`.
        return { key, shape: "v1", values: parsed.map((v) => String(v)) };
      }
    } catch {
      // Not valid JSON. Fall through to v1 splitCommaList parsing below.
    }
  }

  // v1 fallback — strip outer brackets if present and split on commas.
  let valuePart = rawValue;
  if (valuePart.startsWith("[") && valuePart.endsWith("]")) {
    valuePart = valuePart.slice(1, -1);
  }
  return { key, shape: "v1", values: splitCommaList(valuePart) };
}

// Extract the event-name reference from a v2 typed entry so we can
// populate the flat `produces` / `consumes` arrays alongside the typed
// fields. Downstream code that doesn't care about v2 typing keeps
// working without a branching read.
function flattenTypedProduces(entry: TypedProducesEntry): string {
  return entry.event;
}

function flattenTypedConsumes(entry: TypedConsumesEntry): string {
  switch (entry.kind) {
    case "event":
      return entry.event;
    case "soul_field":
      return entry.soul_field;
    case "trigger_payload":
      return `trigger_payload:${Object.keys(entry.trigger_payload).sort().join(",")}`;
  }
}

// Parse the `<!-- TOOLS:START --> ... <!-- TOOLS:END -->` block out of a
// full BLOCK.md string. Returns the parsed JSON array validated against
// ToolEntrySchema, or undefined if no marker is present. Malformed JSON
// or validation failure returns an empty array plus a flag on the parse
// result so the validator can surface a targeted warning.
const TOOLS_START = "<!-- TOOLS:START -->";
const TOOLS_END = "<!-- TOOLS:END -->";

function parseToolsSection(blockMd: string): { tools?: ToolEntry[]; malformed: boolean } {
  const startIdx = blockMd.indexOf(TOOLS_START);
  const endIdx = blockMd.indexOf(TOOLS_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { malformed: false };
  }

  const inner = blockMd.slice(startIdx + TOOLS_START.length, endIdx).trim();
  if (!inner) {
    return { tools: [], malformed: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(inner);
  } catch {
    return { malformed: true };
  }

  if (!Array.isArray(parsed)) {
    return { malformed: true };
  }

  const validated: ToolEntry[] = [];
  for (const entry of parsed) {
    const result = ToolEntrySchema.safeParse(entry);
    if (!result.success) {
      return { malformed: true };
    }
    validated.push(result.data);
  }

  return { tools: validated, malformed: false };
}

// Detect the "intentionally invisible" HTML-comment marker added to the
// 11 non-contract recipe BLOCK.md files in Scope 3 Step 2b.1 §7.5. When
// present, the validator returns zero warnings (these blocks are
// deliberately opaque to synthesis; no `empty_contract` warning).
const INVISIBLE_MARKER_FRAGMENT = "Intentionally invisible to agent";

function detectIntentionallyInvisible(blockMd: string): boolean {
  return blockMd.includes(INVISIBLE_MARKER_FRAGMENT);
}

function parseCompositionContract(
  section: string,
  toolsResult: { tools?: ToolEntry[]; malformed: boolean } = { malformed: false },
): BlockMdCompositionContract {
  const empty: BlockMdCompositionContract = {
    produces: [],
    consumes: [],
    verbs: [],
    composeWith: [],
    raw: [],
    isV2: false,
    mixedShapeFields: [],
  };
  if (!section && !toolsResult.tools) return empty;

  const raw = section.split("\n");
  const result: BlockMdCompositionContract = { ...empty, raw };

  // Tool catalogue from the <!-- TOOLS --> block, parsed independently
  // of the ## Composition Contract section keys. Malformed tools bumps
  // isV2 so the validator can flag; valid tools populate result.tools.
  if (toolsResult.tools) {
    result.tools = toolsResult.tools;
    if (toolsResult.tools.length > 0) result.isV2 = true;
  }

  for (const line of raw) {
    const parsed = parseCompositionLine(line);
    if (!parsed) continue;

    if (parsed.shape === "mixed") {
      result.mixedShapeFields.push(parsed.key);
      continue;
    }

    switch (parsed.key) {
      case "produces": {
        if (parsed.shape === "v1") {
          result.produces = parsed.values;
        } else {
          // v2: validate each entry against TypedProducesEntrySchema. Invalid
          // entries fall through — validateCompositionContract surfaces the
          // malformed_produces warning.
          const typed: TypedProducesEntry[] = [];
          for (const entry of parsed.entries) {
            const res = TypedProducesEntrySchema.safeParse(entry);
            if (res.success) typed.push(res.data);
          }
          result.producesTyped = typed;
          result.produces = typed.map(flattenTypedProduces);
          if (typed.length > 0) result.isV2 = true;
        }
        break;
      }
      case "consumes": {
        if (parsed.shape === "v1") {
          result.consumes = parsed.values;
        } else {
          const typed: TypedConsumesEntry[] = [];
          for (const entry of parsed.entries) {
            const res = TypedConsumesEntrySchema.safeParse(entry);
            if (res.success) typed.push(res.data);
          }
          result.consumesTyped = typed;
          result.consumes = typed.map(flattenTypedConsumes);
          if (typed.length > 0) result.isV2 = true;
        }
        break;
      }
      case "verbs":
        if (parsed.shape === "v1") {
          result.verbs = parsed.values.map((v) => v.toLowerCase());
        }
        // v2 entries on `verbs:` don't make semantic sense (verbs stay
        // string-only per audit §1.8). Silently ignored; validator will
        // still catch empty verbs and surface `no_verbs`.
        break;
      case "compose_with":
      case "composewith":
        if (parsed.shape === "v1") {
          result.composeWith = parsed.values;
        }
        break;
      // Unknown keys are silently ignored to allow future extension
      // without breaking existing callers. The raw lines are still
      // retained on the `raw` field for debugging.
    }
  }

  return result;
}

export function parseBlockMd(blockMd: string): ParsedBlockMd {
  const normalized = blockMd.replace(/\r\n/g, "\n").trim();
  const titleMatch = normalized.match(/^#\s*BLOCK(?:\.md)?\s*:\s*(.+)$/im);
  const sections = extractSections(normalized);
  const toolsResult = parseToolsSection(normalized);
  const intentionallyInvisible = detectIntentionallyInvisible(normalized);

  const composition = parseCompositionContract(
    sections["composition contract"] ?? "",
    toolsResult,
  );

  // Stash the malformed-tools signal on the composition so the validator
  // can surface a targeted warning. We don't put a top-level field on
  // ParsedBlockMd for this because the composition is the natural home —
  // tools live inside the contract conceptually.
  if (toolsResult.malformed) {
    composition.mixedShapeFields.push("__tools_malformed__");
  }

  return {
    title: titleMatch?.[1]?.trim() || null,
    purpose: sections.purpose ?? "",
    entities: parseEntities(sections.entities ?? ""),
    views: parseViews(sections.views ?? ""),
    composition,
    sections,
    intentionallyInvisible,
  };
}

// Synthesis reliability check (D-13 mitigation). Runs after parse. Returns
// a list of human-readable warnings — empty array means the contract looks
// well-formed and composable with the current block registry. Warnings are
// non-fatal; agent synthesis may still use the block, just with a lower
// confidence signal. The Phase 12 CI gate turns warnings into errors.
export type CompositionContractWarning = {
  code: string;
  message: string;
};

export function validateCompositionContract(
  parsed: ParsedBlockMd,
  knownBlockSlugs: string[] = [],
): CompositionContractWarning[] {
  const warnings: CompositionContractWarning[] = [];
  const c = parsed.composition;

  // §7.5 stamped recipe blocks — intentionally invisible to synthesis.
  // Return early with zero warnings. The HTML-comment marker is a
  // deliberate signal; emitting empty_contract here would be noise.
  if (parsed.intentionallyInvisible) {
    return warnings;
  }

  // Mixed v1/v2 within a single field — audit §3 rule 3. This is a
  // blocking error, not an informational warning: silent fallthrough
  // here would hide a semantic contradiction.
  for (const field of c.mixedShapeFields) {
    if (field === "__tools_malformed__") {
      warnings.push({
        code: "malformed_tools",
        message:
          "The <!-- TOOLS --> marker block is present but its JSON content is malformed or does not match the ToolEntry schema. Run the emit step (z.toJSONSchema) to regenerate it from the block's <block>.tools.ts source.",
      });
      continue;
    }
    warnings.push({
      code: "mixed_v1_v2",
      message: `\`${field}:\` has a mix of v1 string entries and v2 object entries in the same list. Pick one shape per field — see tasks/step-2b-1-contract-v2-audit.md §3 rule 3.`,
    });
  }

  // A block with no contract is "opaque" to synthesis. Flag once per block.
  if (c.produces.length === 0 && c.consumes.length === 0 && c.verbs.length === 0 && !c.tools) {
    warnings.push({
      code: "empty_contract",
      message:
        "Composition contract is missing or empty. Agent synthesis won't auto-use this block. Add a `## Composition Contract` section with produces / consumes / verbs / compose_with.",
    });
    return warnings;
  }

  // Informational warning for blocks still on v1-only contracts. Not
  // blocking — v1 shape is fully supported through 2b.2's migration
  // window. Surfaces so block authors know v2 is available.
  if (!c.isV2 && c.mixedShapeFields.length === 0) {
    warnings.push({
      code: "legacy_contract",
      message:
        "This block uses v1 composition-contract shape (flat string arrays). v2 adds typed produces/consumes + a tools: block for JSON-Schema-emitted tool args. Migration is optional during 2b.2; see tasks/step-2b-1-contract-v2-audit.md §3.",
    });
  }

  // verbs must exist — they're how a prompt routes to the block.
  if (c.verbs.length === 0) {
    warnings.push({
      code: "no_verbs",
      message: "`verbs: []` is empty. Without verbs, natural-language prompts can't route to this block.",
    });
  }

  // Event-name sanity check. Allows one-or-more dot-separated lowercase
  // segments — e.g. "contact.created" (2 segments) and
  // "conversation.turn.received" (3 segments) are both valid.
  const eventNamePattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
  for (const event of c.produces) {
    if (!eventNamePattern.test(event)) {
      warnings.push({
        code: "malformed_produces",
        message: `produces event "${event}" doesn't match expected shape "namespace.verb" (lowercase, dot-separated).`,
      });
    }
  }

  // v2: every tool's `emits:` reference must appear in this block's
  // produces list. Prevents a tool from claiming to emit an event the
  // block doesn't produce (would break downstream consumer chaining).
  if (c.tools) {
    const producesSet = new Set(c.produces);
    for (const tool of c.tools) {
      for (const event of tool.emits) {
        if (!producesSet.has(event)) {
          warnings.push({
            code: "tool_emits_not_in_produces",
            message: `tool \`${tool.name}\` emits "${event}" but this event is not in the block's produces list.`,
          });
        }
      }
    }
  }

  // Compose-with references should point at real block slugs when the
  // caller passes the known registry. Skip this check if registry is empty
  // (e.g., in tests or during bootstrap).
  if (knownBlockSlugs.length > 0) {
    const slugSet = new Set(knownBlockSlugs);
    for (const slug of c.composeWith) {
      if (!slugSet.has(slug)) {
        warnings.push({
          code: "unknown_compose_with",
          message: `composeWith references "${slug}" which is not a known block slug in the registry.`,
        });
      }
    }
  }

  // Verbs should be short lowercase tokens, not full sentences. Flag long
  // verbs — they usually indicate someone wrote a description instead of a
  // routing keyword.
  for (const verb of c.verbs) {
    if (verb.length > 40 || verb.includes(" ") === false && verb.length > 30) {
      warnings.push({
        code: "verbose_verb",
        message: `verb "${verb}" looks long. Prefer short imperative tokens like "intake", "schedule", "send reminder".`,
      });
    }
  }

  return warnings;
}

export function normalizeGeneratedBlockMd(blockMd: string) {
  const normalized = blockMd.replace(/\r\n/g, "\n").trim();
  const parsed = parseBlockMd(normalized);

  if (parsed.views.length > 0) {
    return {
      blockMd: normalized,
      parsed,
    };
  }

  const defaultViews = buildDefaultViews(parsed.entities);
  if (defaultViews.length === 0) {
    return {
      blockMd: normalized,
      parsed,
    };
  }

  const viewsSection = serializeViewsSection(defaultViews);
  const nextBlockMd = /(^|\n)## Navigation\b/i.test(normalized)
    ? normalized.replace(/(^|\n)(## Navigation\b)/i, `\n\n${viewsSection}\n\n$2`)
    : `${normalized}\n\n${viewsSection}`;

  return {
    blockMd: nextBlockMd.trim(),
    parsed: {
      ...parsed,
      views: defaultViews,
      sections: {
        ...parsed.sections,
        views: viewsSection.replace(/^## Views\n\n/, ""),
      },
    },
  };
}

export function replaceBlockMdViews(blockMd: string, views: BlockMdViewDefinition[]) {
  const normalized = blockMd.replace(/\r\n/g, "\n").trim();
  const viewsSection = serializeViewsSection(views);

  if (/(^|\n)## Views\b/i.test(normalized)) {
    const match = normalized.match(/(^|\n)## Views\b[\s\S]*?(?=\n## [^\n]+|$)/i);
    if (match) {
      const replacement = `${match[0].startsWith("\n") ? "\n" : ""}${viewsSection}`;
      return normalized.replace(match[0], replacement).trim();
    }
  }

  const nextBlockMd = /(^|\n)## Navigation\b/i.test(normalized)
    ? normalized.replace(/(^|\n)(## Navigation\b)/i, `\n\n${viewsSection}\n\n$2`)
    : `${normalized}\n\n${viewsSection}`;

  return nextBlockMd.trim();
}

export function replaceBlockMdSection(blockMd: string, sectionTitle: string, body: string) {
  const normalized = blockMd.replace(/\r\n/g, "\n").trim();
  const normalizedTitle = sectionTitle.trim();
  const section = `## ${normalizedTitle}\n\n${body.trim()}`;
  const sectionPattern = new RegExp(`(^|\\n)## ${normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[\\s\\S]*?(?=\\n## [^\\n]+|$)`, "i");

  if (sectionPattern.test(normalized)) {
    const match = normalized.match(sectionPattern);
    if (match) {
      const replacement = `${match[0].startsWith("\n") ? "\n" : ""}${section}`;
      return normalized.replace(match[0], replacement).trim();
    }
  }

  const nextBlockMd = /(^|\n)## Navigation\b/i.test(normalized)
    ? normalized.replace(/(^|\n)(## Navigation\b)/i, `\n\n${section}\n\n$2`)
    : `${normalized}\n\n${section}`;

  return nextBlockMd.trim();
}
