import type { BlockMdEntityDefinition, BlockMdViewDefinition, BlockMdViewFilter, BlockMdViewType } from "@/lib/blocks/block-md";

export type GeneratedViewDraft = {
  view: BlockMdViewDefinition;
  openRoute: string;
  label: string;
};

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function toTitleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function inferViewType(prompt: string): BlockMdViewType | null {
  const normalized = prompt.toLowerCase();
  if (/(kanban|pipeline|board)/.test(normalized)) {
    return "kanban";
  }

  if (/(table|list view|list|grid|filtered view|custom view|showing)/.test(normalized)) {
    return "table";
  }

  return null;
}

function pickPrimaryField(availableFields: string[]) {
  const preferred = ["name", "title", "firstName", "subject"];
  return preferred.find((field) => availableFields.includes(field)) ?? availableFields[0] ?? "name";
}

function pickDescriptionField(availableFields: string[]) {
  const preferred = ["company", "contactName", "summary", "description", "notes", "status", "stage"];
  return preferred.find((field) => availableFields.includes(field));
}

function pickLaneField(availableFields: string[]) {
  const preferred = ["stage", "status", "lane", "pipeline"];
  return preferred.find((field) => availableFields.includes(field)) ?? null;
}

function resolveFieldAlias(input: string) {
  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return [] as string[];
  }

  if (normalized === "budget") {
    return ["budget", "value"];
  }

  if (normalized === "value") {
    return ["value", "budget"];
  }

  if (normalized === "status") {
    return ["status", "stage"];
  }

  if (normalized === "stage") {
    return ["stage", "status"];
  }

  if (normalized === "name") {
    return ["name", "title", "firstName"];
  }

  if (normalized === "contact") {
    return ["contactName", "contactId"];
  }

  if (normalized.includes("task")) {
    return ["openTaskCount"];
  }

  return [input.trim()];
}

function resolveFieldName(input: string, availableFields: string[]) {
  const normalizedAvailable = new Map(availableFields.map((field) => [normalizeToken(field), field]));
  for (const candidate of resolveFieldAlias(input)) {
    const direct = normalizedAvailable.get(normalizeToken(candidate));
    if (direct) {
      return direct;
    }
  }

  return null;
}

function extractRequestedFields(prompt: string, availableFields: string[]) {
  const normalized = prompt.trim();
  const requested = [] as string[];
  const patterns = [
    /\bby ([a-z0-9 ,/_-]+?)(?=$|\bfor\b|\bwho\b|\bwith\b|\bwhere\b|[.!?])/i,
    /\bshowing [a-z0-9 _-]+ by ([a-z0-9 ,/_-]+?)(?=$|\bfor\b|\bwho\b|\bwith\b|\bwhere\b|[.!?])/i,
    /\bwith ([a-z0-9 ,/_-]+?)(?=$|\bfor\b|\bwho\b|\bwhere\b|[.!?])/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    requested.push(
      ...match[1]
        .split(/,|\band\b|\bplus\b/gi)
        .map((part) => part.trim())
        .filter(Boolean)
    );
  }

  const fields = requested
    .map((part) => resolveFieldName(part, availableFields))
    .filter((field): field is string => Boolean(field));

  return unique(fields);
}

function buildFilters(prompt: string, availableFields: string[]): BlockMdViewFilter[] {
  const normalized = prompt.toLowerCase();
  const filters = [] as BlockMdViewFilter[];

  if (/(high[- ]value|high value|over \$?50k|over 50000)/.test(normalized) && availableFields.includes("value")) {
    filters.push({ field: "value", value: "50000", operator: "gte" });
  }

  if (/open tasks?/.test(normalized) && availableFields.includes("openTaskCount")) {
    filters.push({ field: "openTaskCount", value: "0", operator: "gt" });
  }

  return filters;
}

function buildSorting(prompt: string, availableFields: string[]) {
  const normalized = prompt.toLowerCase();
  if (/(high[- ]value|high value)/.test(normalized) && availableFields.includes("value")) {
    return [{ field: "value", direction: "desc" as const }];
  }

  if (/open tasks?/.test(normalized) && availableFields.includes("openTaskCount")) {
    return [{ field: "openTaskCount", direction: "desc" as const }];
  }

  if (availableFields.includes("updatedAt")) {
    return [{ field: "updatedAt", direction: "desc" as const }];
  }

  return [] as Array<{ field: string; direction: "asc" | "desc" }>;
}

function buildViewLabel(params: {
  prompt: string;
  pluralLabel: string;
  viewType: BlockMdViewType;
  requestedFields: string[];
}) {
  const normalized = params.prompt.toLowerCase();
  if (/open tasks?/.test(normalized)) {
    return `${params.pluralLabel} with Open Tasks`;
  }

  if (/(high[- ]value|high value)/.test(normalized)) {
    return params.viewType === "kanban" ? `High-Value ${params.pluralLabel} Pipeline` : `High-Value ${params.pluralLabel}`;
  }

  if (params.requestedFields.length > 0 && params.viewType === "table") {
    return `${params.pluralLabel} by ${params.requestedFields.map((field) => toTitleCase(field)).join(" and ")}`;
  }

  if (params.viewType === "kanban") {
    return /smart/.test(normalized) ? `Smart ${params.pluralLabel} Pipeline` : `${params.pluralLabel} Pipeline`;
  }

  return `${params.pluralLabel} Table`;
}

function buildWipLimits(entity: BlockMdEntityDefinition, laneField: string | null, existingViews: BlockMdViewDefinition[]) {
  if (!laneField) {
    return {} as Record<string, number>;
  }

  const existingKanban = existingViews.find((view) => view.type === "kanban" && view.laneField === laneField);
  if (existingKanban && Object.keys(existingKanban.wipLimits).length > 0) {
    return existingKanban.wipLimits;
  }

  const sourceField = entity.fields.find((field) => field.name === laneField);
  return Object.fromEntries((sourceField?.options ?? []).slice(0, 8).map((option) => [option, 10]));
}

export function buildGeneratedViewDraft(params: {
  prompt: string;
  entity: BlockMdEntityDefinition;
  extraFields?: string[];
  existingViews: BlockMdViewDefinition[];
  displayPluralLabel?: string;
  routeBase?: string;
}) {
  const viewType = inferViewType(params.prompt);
  if (!viewType) {
    return null;
  }

  const singularLabel = params.entity.singular?.trim() || params.entity.name;
  const pluralLabel = params.displayPluralLabel?.trim() || params.entity.plural?.trim() || `${singularLabel}s`;
  const routeBase = params.routeBase?.trim().replace(/^\/+|\/+$/g, "") || params.entity.routeBase?.trim().replace(/^\/+|\/+$/g, "") || pluralLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const availableFields = unique([...params.entity.fields.map((field) => field.name), ...(params.extraFields ?? [])]);
  const titleField = pickPrimaryField(availableFields);
  const descriptionField = pickDescriptionField(availableFields);
  const requestedFields = extractRequestedFields(params.prompt, availableFields);
  const filters = buildFilters(params.prompt, availableFields);
  const sorting = buildSorting(params.prompt, availableFields);

  if (viewType === "kanban") {
    const laneField = pickLaneField(availableFields);
    if (!laneField) {
      return null;
    }

    const label = buildViewLabel({ prompt: params.prompt, pluralLabel, viewType, requestedFields });
    const cardFields = unique([
      ...requestedFields,
      availableFields.includes("value") ? "value" : "",
      availableFields.includes("contactName") ? "contactName" : "",
      availableFields.includes("probability") ? "probability" : "",
    ]).filter((field) => field !== titleField).slice(0, 4);

    return {
      label,
      openRoute: `/${routeBase}/pipeline`,
      view: {
        name: label,
        entity: singularLabel,
        type: "kanban",
        route: `/${routeBase}/pipeline`,
        default: false,
        columns: [],
        fields: [],
        cardFields,
        filters,
        sorting: [],
        laneField,
        titleField,
        descriptionField,
        wipLimits: buildWipLimits(params.entity, laneField, params.existingViews),
        savedViews: [{ visibility: "shared", label }],
        raw: [],
      } satisfies BlockMdViewDefinition,
    } satisfies GeneratedViewDraft;
  }

  const columns = unique([
    titleField,
    ...requestedFields,
    availableFields.includes("status") ? "status" : "",
    availableFields.includes("stage") ? "stage" : "",
    availableFields.includes("company") ? "company" : "",
    availableFields.includes("value") && /(high[- ]value|budget|value)/i.test(params.prompt) ? "value" : "",
    availableFields.includes("openTaskCount") && /open tasks?/i.test(params.prompt) ? "openTaskCount" : "",
    availableFields.includes("updatedAt") ? "updatedAt" : "",
  ]).slice(0, 6);
  const label = buildViewLabel({ prompt: params.prompt, pluralLabel, viewType, requestedFields });

  return {
    label,
    openRoute: `/${routeBase}`,
    view: {
      name: label,
      entity: singularLabel,
      type: "table",
      route: `/${routeBase}`,
      default: false,
      columns,
      fields: [],
      cardFields: [],
      filters,
      sorting,
      titleField,
      descriptionField,
      wipLimits: {},
      savedViews: [{ visibility: "shared", label }],
      raw: [],
    } satisfies BlockMdViewDefinition,
  } satisfies GeneratedViewDraft;
}
