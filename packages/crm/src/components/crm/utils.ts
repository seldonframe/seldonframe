import type { BlockMdViewDefinition, BlockMdViewFilter } from "@/lib/blocks/block-md";
import type { CrmRecord, CrmScopedOverride } from "@/components/crm/types";

function toComparableString(value: unknown) {
  if (value == null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(" ").toLowerCase();
  }

  return String(value).toLowerCase();
}

function toComparableNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function recordMatchesViewFilter(record: CrmRecord, filter: BlockMdViewFilter) {
  const rawValue = record.values[filter.field];
  const operator = filter.operator ?? "contains";

  if (operator === "gt" || operator === "gte" || operator === "lt" || operator === "lte") {
    const left = toComparableNumber(rawValue);
    const right = toComparableNumber(filter.value);
    if (left == null || right == null) {
      return false;
    }

    if (operator === "gt") return left > right;
    if (operator === "gte") return left >= right;
    if (operator === "lt") return left < right;
    return left <= right;
  }

  if (operator === "is") {
    return toComparableString(rawValue) === toComparableString(filter.value);
  }

  return toComparableString(rawValue).includes(toComparableString(filter.value));
}

export function recordMatchesViewFilters(record: CrmRecord, filters: BlockMdViewFilter[]) {
  return filters.every((filter) => recordMatchesViewFilter(record, filter));
}

export function formatCrmValue(value: unknown) {
  if (value == null || value === "") {
    return "—";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(", ") || "—";
  }

  if (value instanceof Date) {
    return value.toLocaleString();
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  const raw = String(value);
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime()) && /\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}/.test(raw)) {
    return date.toLocaleString();
  }

  return raw;
}

export function resolveInitials(input?: string | null) {
  const normalized = (input ?? "").trim();
  if (!normalized) {
    return "SF";
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || normalized.slice(0, 2).toUpperCase();
}

export function resolveFieldLabel(field: string, scopedOverride?: CrmScopedOverride, viewName?: string) {
  const fromView = viewName ? scopedOverride?.viewOverrides?.[viewName]?.labelOverrides?.[field] : undefined;
  const fromGlobal = scopedOverride?.labelOverrides?.[field];
  if (fromView || fromGlobal) {
    return fromView || fromGlobal || field;
  }

  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}

export function applyScopedViewOverride(view: BlockMdViewDefinition, scopedOverride?: CrmScopedOverride) {
  const namedOverride = scopedOverride?.viewOverrides?.[view.name];

  const mergedView: BlockMdViewDefinition = {
    ...view,
    ...namedOverride,
    columns: namedOverride?.columns ?? view.columns,
    fields: namedOverride?.fields ?? view.fields,
    cardFields: namedOverride?.cardFields ?? view.cardFields,
    filters: namedOverride?.filters ?? view.filters,
    sorting: namedOverride?.sorting ?? view.sorting,
    wipLimits: namedOverride?.wipLimits ?? view.wipLimits,
    savedViews: namedOverride?.savedViews ?? view.savedViews,
  };

  const hiddenFields = new Set([...(scopedOverride?.hiddenFields ?? []), ...(namedOverride?.hiddenFields ?? [])]);
  const editableFields = new Set([...(scopedOverride?.editableFields ?? []), ...(namedOverride?.editableFields ?? [])]);
  const laneOrder = namedOverride?.laneOrder ?? scopedOverride?.laneOrder ?? [];

  return {
    view: mergedView,
    hiddenFields,
    editableFields,
    laneOrder,
    readOnly: Boolean(scopedOverride?.readOnly),
  };
}

export function getVisibleColumns(view: BlockMdViewDefinition, records: CrmRecord[], hiddenFields: Set<string>) {
  const fromView = view.columns.filter((field) => !hiddenFields.has(field));
  if (fromView.length > 0) {
    return fromView;
  }

  const firstRecord = records[0];
  if (!firstRecord) {
    return [];
  }

  return Object.keys(firstRecord.values).filter((field) => !hiddenFields.has(field)).slice(0, 6);
}

export function getVisibleFields(view: BlockMdViewDefinition, record: CrmRecord, hiddenFields: Set<string>) {
  const fromView = view.fields.filter((field) => !hiddenFields.has(field));
  if (fromView.length > 0) {
    return fromView;
  }

  return Object.keys(record.values).filter((field) => !hiddenFields.has(field)).slice(0, 10);
}

export function resolveRecordTitle(record: CrmRecord, view: BlockMdViewDefinition) {
  const titleField = view.titleField ?? "name";
  const fromValue = record.values[titleField];
  if (fromValue != null && fromValue !== "") {
    return String(fromValue);
  }

  return record.title || `Record ${record.id.slice(0, 8)}`;
}

export function resolveRecordDescription(record: CrmRecord, view: BlockMdViewDefinition) {
  const descriptionField = view.descriptionField;
  if (!descriptionField) {
    return record.subtitle || null;
  }

  const value = record.values[descriptionField];
  return value != null && value !== "" ? String(value) : record.subtitle || null;
}
