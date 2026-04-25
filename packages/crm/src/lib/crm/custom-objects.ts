import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { CrmLinkedRecord, CrmLinkedRecordGroup, CrmRecord, CrmRelationshipPreview, CrmScopedOverride } from "@/components/crm/types";
import { db } from "@/db";
import { contacts, deals, organizations } from "@/db/schema";
import { normalizeGeneratedBlockMd, parseBlockMd, replaceBlockMdSection, replaceBlockMdViews, type BlockMdEntityDefinition, type BlockMdFieldDefinition, type BlockMdViewDefinition, type ParsedBlockMd } from "@/lib/blocks/block-md";
import {
  buildDefaultCustomObjectPermissionsSection,
  mergeScopedOverrideWithAccess,
  parseCustomObjectPermissionPolicy,
  resolveCustomObjectAccess,
  serializeCustomObjectPermissionPolicy,
  type CustomObjectResolvedAccess,
  type CustomObjectRuntimeRole,
} from "@/lib/crm/custom-object-permissions";
import { emitSeldonEvent } from "@/lib/events/bus";
import { buildDefaultBrainIntelligenceSection, upsertBrainIntelligenceSection } from "@/lib/brain-record-insights";
import { buildGeneratedViewDraft } from "@/lib/crm/generated-views";

type StoredCustomObjectSpec = {
  slug: string;
  title: string;
  singular: string;
  plural: string;
  entityName: string;
  routeBase: string;
  blockMd: string;
  updatedAt: string;
  sourcePrompt?: string;
  icon?: string;
};

type StoredCustomObjectRecord = {
  id: string;
  values: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type StoredCustomObjectSettings = {
  crmCustomObjectSpecs?: Record<string, StoredCustomObjectSpec>;
  crmClientCustomObjectSpecs?: Record<string, Record<string, StoredCustomObjectSpec>>;
  crmCustomObjectRecords?: Record<string, StoredCustomObjectRecord[]>;
  crmClientCustomObjectRecords?: Record<string, Record<string, StoredCustomObjectRecord[]>>;
  crmClientCustomObjectOverrides?: Record<string, Record<string, CrmScopedOverride>>;
};

type ResolvedSettings = {
  baseSettings: Record<string, unknown>;
  specs: Record<string, StoredCustomObjectSpec>;
  clientSpecs: Record<string, Record<string, StoredCustomObjectSpec>>;
  records: Record<string, StoredCustomObjectRecord[]>;
  clientRecords: Record<string, Record<string, StoredCustomObjectRecord[]>>;
  clientOverrides: Record<string, Record<string, CrmScopedOverride>>;
};

type RelationLookupEntry = {
  label: string;
  href?: string;
  subtitle?: string;
  badges?: string[];
};

export type CustomObjectIntent = {
  slug: string;
  title: string;
  singular: string;
  plural: string;
  entityName: string;
  routeBase: string;
  fields: BlockMdFieldDefinition[];
  relations: Array<{ field: string; target: string }>;
};

export type CustomObjectFieldSchema = {
  name: string;
  label: string;
  type: string;
  relation?: string;
  options?: string[];
};

export type CustomObjectRelationOption = {
  value: string;
  label: string;
  subtitle?: string;
};

export type CustomObjectFormSchema = {
  slug: string;
  singular: string;
  plural: string;
  fields: CustomObjectFieldSchema[];
  relationOptions: Record<string, CustomObjectRelationOption[]>;
};

export type CustomObjectNavigationItem = {
  slug: string;
  label: string;
  href: string;
  icon: string;
};

export type ResolvedCustomObject = {
  slug: string;
  spec: StoredCustomObjectSpec;
  parsed: ParsedBlockMd;
  entity: BlockMdEntityDefinition;
  scopedOverride?: CrmScopedOverride;
  access: CustomObjectResolvedAccess;
};

export type CustomObjectManagementItem = {
  slug: string;
  label: string;
  singular: string;
  plural: string;
  href: string;
  pipelineHref?: string;
  description?: string;
  relationTargets: string[];
  recordCount: number;
  updatedAt: string;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toTitleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function pluralize(value: string) {
  if (/ies$/i.test(value) || /s$/i.test(value)) {
    return value;
  }

  if (/y$/i.test(value) && !/[aeiou]y$/i.test(value)) {
    return `${value.slice(0, -1)}ies`;
  }

  return `${value}s`;
}

function singularize(value: string) {
  if (/ies$/i.test(value)) {
    return `${value.slice(0, -3)}y`;
  }

  if (/ses$/i.test(value)) {
    return value.slice(0, -2);
  }

  if (/s$/i.test(value) && !/ss$/i.test(value)) {
    return value.slice(0, -1);
  }

  return value;
}

function camelCase(value: string) {
  const words = value.split(/[\s_-]+/).filter(Boolean);
  return words
    .map((word, index) => {
      const lowered = word.toLowerCase();
      return index === 0 ? lowered : lowered.charAt(0).toUpperCase() + lowered.slice(1);
    })
    .join("");
}

function humanizeFieldName(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function normalizeEntityToken(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function splitTopLevelList(value: string) {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (char === "," && depth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function inferFieldDefinition(rawName: string, descriptor?: string): BlockMdFieldDefinition {
  const name = rawName.trim().replace(/\s+/g, "_");
  const normalizedName = name.toLowerCase();
  const raw = descriptor ? `- ${name} (${descriptor})` : `- ${name}`;

  if (descriptor) {
    const normalizedDescriptor = descriptor.trim().toLowerCase();
    if (normalizedDescriptor.startsWith("enum:")) {
      return {
        name,
        type: "enum",
        options: descriptor
          .slice(descriptor.indexOf(":") + 1)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        raw,
      };
    }

    if (normalizedDescriptor.startsWith("relation")) {
      const relation = descriptor.match(/relation\s*->\s*(.+)$/i)?.[1]?.trim();
      return {
        name,
        type: "relation",
        relation,
        raw,
      };
    }

    return {
      name,
      type: normalizedDescriptor,
      raw,
    };
  }

  if (/(^|_)(status|stage|lane)$/i.test(normalizedName)) {
    return {
      name,
      type: "enum",
      options: ["planned", "active", "completed"],
      raw: `- ${name} (enum: planned, active, completed)`,
    };
  }

  if (/(^|_)(due|deadline|start|end|date)(_|$)/i.test(normalizedName)) {
    return {
      name,
      type: "date",
      raw: `- ${name} (date)`,
    };
  }

  if (/(^|_)(value|amount|budget|price|cost|revenue)(_|$)/i.test(normalizedName)) {
    return {
      name,
      type: "currency",
      raw: `- ${name} (currency)`,
    };
  }

  if (/(^|_)(score|count|number|qty|quantity|estimate)(_|$)/i.test(normalizedName)) {
    return {
      name,
      type: "integer",
      raw: `- ${name} (integer)`,
    };
  }

  if (/(^|_)(notes|description|summary|details)(_|$)/i.test(normalizedName)) {
    return {
      name,
      type: "long text",
      raw: `- ${name} (long text)`,
    };
  }

  return {
    name,
    type: "text",
    raw: `- ${name} (text)`,
  };
}

function ensureCoreFields(fields: BlockMdFieldDefinition[]) {
  const byName = new Map(fields.map((field) => [field.name.toLowerCase(), field]));

  if (!Array.from(byName.keys()).some((field) => field === "name" || field === "title")) {
    byName.set("name", inferFieldDefinition("name", "text"));
  }

  if (!byName.has("status")) {
    byName.set("status", inferFieldDefinition("status"));
  }

  if (!byName.has("createdat")) {
    byName.set("createdat", {
      name: "createdAt",
      type: "timestamp",
      auto: true,
      raw: "- createdAt (timestamp, auto)",
    });
  }

  if (!byName.has("updatedat")) {
    byName.set("updatedat", {
      name: "updatedAt",
      type: "timestamp",
      auto: true,
      raw: "- updatedAt (timestamp, auto)",
    });
  }

  return Array.from(byName.values());
}

function buildRelationField(target: string) {
  const singularTarget = toTitleCase(singularize(target));
  const relationField = `${camelCase(singularTarget)}Id`;
  return {
    name: relationField,
    type: "relation",
    relation: singularTarget,
    raw: `- ${relationField} (relation -> ${singularTarget})`,
  } satisfies BlockMdFieldDefinition;
}

function buildRouteBase(slug: string) {
  return `objects/${slug}`;
}

function buildAdminPath(slug: string, clientId?: string | null) {
  const base = `/${buildRouteBase(slug)}`;
  if (!clientId) {
    return base;
  }

  const searchParams = new URLSearchParams({ clientId });
  return `${base}?${searchParams.toString()}`;
}

function buildScopedHref(path: string, clientId?: string | null) {
  if (!clientId) {
    return path;
  }

  const searchParams = new URLSearchParams({ clientId });
  return `${path}?${searchParams.toString()}`;
}

function buildRelationLookupKey(target: string, id: string) {
  return `${normalizeEntityName(target)}:${id}`;
}

function getEntityFromSpec(spec: StoredCustomObjectSpec, cache: Map<string, BlockMdEntityDefinition | null>) {
  if (cache.has(spec.slug)) {
    return cache.get(spec.slug) ?? null;
  }

  const entity = parseBlockMd(spec.blockMd).entities[0] ?? null;
  cache.set(spec.slug, entity);
  return entity;
}

function getEntityTitleField(entity: BlockMdEntityDefinition) {
  return entity.fields.find((field) => /^(name|title|subject)$/i.test(field.name))?.name ?? entity.fields.find((field) => !field.auto)?.name ?? "name";
}

function getEntityDescriptionField(entity: BlockMdEntityDefinition) {
  return entity.fields.find((field) => /description|summary|notes|details/i.test(field.name))?.name;
}

function getEntityStatusField(entity: BlockMdEntityDefinition) {
  return entity.fields.find((field) => /(^|_)(status|stage|lane)(_|$)/i.test(field.name))?.name;
}

function resolveRecordTitle(record: StoredCustomObjectRecord, entity: BlockMdEntityDefinition, fallback: string) {
  const titleField = getEntityTitleField(entity);
  return String(record.values[titleField] ?? fallback);
}

function resolveRecordSubtitle(record: StoredCustomObjectRecord, entity: BlockMdEntityDefinition) {
  const statusField = getEntityStatusField(entity);
  if (statusField) {
    const status = toDisplayText(record.values[statusField]);
    if (status) {
      return status;
    }
  }

  const descriptionField = getEntityDescriptionField(entity);
  if (descriptionField) {
    const description = String(record.values[descriptionField] ?? "").trim();
    if (description) {
      return description.length > 96 ? `${description.slice(0, 93)}...` : description;
    }
  }

  return undefined;
}

function resolveRecordDescription(record: StoredCustomObjectRecord, entity: BlockMdEntityDefinition) {
  const descriptionField = getEntityDescriptionField(entity);
  if (!descriptionField) {
    return undefined;
  }

  const description = String(record.values[descriptionField] ?? "").trim();
  return description || undefined;
}

function dedupeStoredRecords(records: StoredCustomObjectRecord[]) {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.id)) {
      return false;
    }

    seen.add(record.id);
    return true;
  });
}

function toDisplayText(value: unknown) {
  const displayValue = toDisplayValue(value);
  if (displayValue === "") {
    return undefined;
  }

  return String(displayValue);
}

function readSettings(baseSettings: Record<string, unknown>): ResolvedSettings {
  const typed = baseSettings as StoredCustomObjectSettings;
  return {
    baseSettings,
    specs: typed.crmCustomObjectSpecs ?? {},
    clientSpecs: typed.crmClientCustomObjectSpecs ?? {},
    records: typed.crmCustomObjectRecords ?? {},
    clientRecords: typed.crmClientCustomObjectRecords ?? {},
    clientOverrides: typed.crmClientCustomObjectOverrides ?? {},
  };
}

function writeSettings(input: ResolvedSettings) {
  return {
    ...input.baseSettings,
    crmCustomObjectSpecs: input.specs,
    crmClientCustomObjectSpecs: input.clientSpecs,
    crmCustomObjectRecords: input.records,
    crmClientCustomObjectRecords: input.clientRecords,
    crmClientCustomObjectOverrides: input.clientOverrides,
  } satisfies Record<string, unknown>;
}

function getEditableFieldNames(entity: BlockMdEntityDefinition) {
  return entity.fields.filter((field) => !field.auto && !/^(createdAt|updatedAt)$/i.test(field.name)).map((field) => field.name);
}

function resolveSpecAccess(spec: StoredCustomObjectSpec, runtimeRole: CustomObjectRuntimeRole) {
  const parsed = parseBlockMd(spec.blockMd);
  const entity = parsed.entities[0];
  return resolveCustomObjectAccess({
    blockMd: spec.blockMd,
    role: runtimeRole,
    editableFields: entity ? getEditableFieldNames(entity) : [],
  });
}

function buildCustomObjectEventBase(spec: StoredCustomObjectSpec) {
  return slugify(spec.singular).replace(/_/g, "-");
}

function resolveRelatedContactId(entity: BlockMdEntityDefinition, values: Record<string, unknown>, fallbackClientId?: string | null) {
  const contactRelationField = entity.relations.find((relation) => /^contact$/i.test(relation.target))?.field;
  const relatedContactId = contactRelationField ? String(values[contactRelationField] ?? "").trim() : "";
  return relatedContactId || fallbackClientId || null;
}

async function readOrganizationSettings(orgId: string) {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  return ((org?.settings ?? {}) as Record<string, unknown>) || {};
}

async function updateOrganizationSettings(orgId: string, settings: Record<string, unknown>) {
  await db
    .update(organizations)
    .set({
      settings,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

function parseObjectName(input: string) {
  const direct = input.match(/\bcustom object\s+(?:called|named)\s+['"]?([a-z0-9 _-]+?)['"]?(?=\s+(?:with|linked|related|connected)\b|[.,]|$)/i)?.[1];
  if (direct) {
    return normalizeEntityToken(direct);
  }

  const reverse = input.match(/\bcustom\s+['"]?([a-z0-9 _-]+?)['"]?\s+object\b/i)?.[1];
  if (reverse) {
    return normalizeEntityToken(reverse);
  }

  return null;
}

function parseFieldTokens(input: string) {
  const match = input.match(/\bwith fields?\s+(.+?)(?=(?:\s+(?:linked|related|connected)\s+to\b)|[.]|$)/i)?.[1];
  if (!match) {
    return [] as BlockMdFieldDefinition[];
  }

  return splitTopLevelList(match.replace(/\band\b/gi, ","))
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const parenMatch = token.match(/^([^()]+?)\s*\(([^)]+)\)$/);
      if (parenMatch) {
        return inferFieldDefinition(parenMatch[1], parenMatch[2]);
      }

      const colonMatch = token.match(/^([^:]+?)\s*:\s*(.+)$/);
      if (colonMatch) {
        return inferFieldDefinition(colonMatch[1], colonMatch[2]);
      }

      return inferFieldDefinition(token);
    });
}

function parseRelationTargets(input: string) {
  const matches = Array.from(input.matchAll(/\b(?:linked|related|connected)\s+to\s+([a-z0-9 _,-]+?)(?=(?:\s+(?:for|with|using|that)\b)|[.]|$)/gi));
  const rawTargets = matches.flatMap((match) => match[1].split(/,|\band\b/gi)).map((target) => normalizeEntityToken(target)).filter(Boolean);
  const seen = new Set<string>();

  return rawTargets.filter((target) => {
    const key = target.toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function extractCustomObjectIntent(input: string): CustomObjectIntent | null {
  const normalized = input.trim();
  if (!normalized || !/\bcustom\b/i.test(normalized) || !/\bobject\b/i.test(normalized)) {
    return null;
  }

  const objectName = parseObjectName(normalized);
  if (!objectName) {
    return null;
  }

  const titled = toTitleCase(objectName);
  const singular = toTitleCase(singularize(titled));
  const plural = toTitleCase(pluralize(titled));
  const slug = slugify(plural);
  const routeBase = buildRouteBase(slug);
  const explicitFields = parseFieldTokens(normalized);
  const relationTargets = parseRelationTargets(normalized);
  const relationFields = relationTargets.map((target) => buildRelationField(target));
  const fields = ensureCoreFields([...explicitFields, ...relationFields]);

  return {
    slug,
    title: plural,
    singular,
    plural,
    entityName: singular,
    routeBase,
    fields,
    relations: relationFields.map((field) => ({
      field: field.name,
      target: field.relation ?? "",
    })),
  };
}

function buildBlockPurpose(intent: CustomObjectIntent) {
  const relatedSummary = intent.relations.length > 0
    ? ` It keeps ${intent.plural.toLowerCase()} connected to ${intent.relations.map((relation) => relation.target).join(", ")}.`
    : "";

  return `${intent.plural} gives the workspace a schema-driven operating surface for managing ${intent.plural.toLowerCase()} with custom fields, record detail, and saved views.${relatedSummary}`;
}

function buildPagesSection(intent: CustomObjectIntent) {
  return `## Pages

### Admin pages
1. /${intent.routeBase}
   - Shows the ${intent.plural.toLowerCase()} operating view with search, filtering, and saved views
   - Actions: create, update fields, open records, switch views
   - Empty state: explain what the object tracks and offer quick create

2. /${intent.routeBase}/[id]
   - Shows the ${intent.singular.toLowerCase()} record page with fields and related context
   - Actions: inspect relationships, update fields, review activity context
   - Empty state: scoped not-found guidance for missing records

${intent.fields.some((field) => field.type === "enum" && /status|stage|lane/i.test(field.name)) ? `3. /${intent.routeBase}/pipeline
   - Shows the ${intent.plural.toLowerCase()} kanban view when the object has a status or stage field
   - Actions: move records between lanes, inspect record details, rebalance work
   - Empty state: prompt the user to add the first ${intent.singular.toLowerCase()}

` : ""}Identity usage:
- Uses soul voice in empty states and helper copy
- Uses workspace terminology for relationship guidance`;
}

export function buildCustomObjectBlockMd(intent: CustomObjectIntent) {
  const blockMd = `# BLOCK: ${intent.plural} CRM

## Purpose

${buildBlockPurpose(intent)}

## Entities

### ${intent.entityName}
- singular: ${intent.singular}
- plural: ${intent.plural}
- slug: ${intent.slug}
- routeBase: ${intent.routeBase}
- description: Custom object generated by Seldon It
${intent.fields.map((field) => field.raw).join("\n")}

## Dependencies
- Required:
  - Identity
- Optional:
  - CRM

## Events
- Emits:
  - ${slugify(intent.singular).replace(/-/g, "_").replace(/_/g, "-")}.created
  - ${slugify(intent.singular).replace(/-/g, "_").replace(/_/g, "-")}.field_changed
- Listens:
  - contact.updated

${buildDefaultBrainIntelligenceSection("Brain Summary")}

${buildDefaultCustomObjectPermissionsSection()}

${buildPagesSection(intent)}

## Navigation
- label: ${intent.plural}
- icon: Puzzle
- order: 82`;

  return normalizeGeneratedBlockMd(blockMd).blockMd;
}

function resolveStoredSpec(parsed: ParsedBlockMd, intent: CustomObjectIntent, prompt: string): StoredCustomObjectSpec {
  const entity = parsed.entities[0];
  return {
    slug: intent.slug,
    title: parsed.title ?? intent.plural,
    singular: entity?.singular ?? intent.singular,
    plural: entity?.plural ?? intent.plural,
    entityName: entity?.name ?? intent.entityName,
    routeBase: entity?.routeBase ?? intent.routeBase,
    blockMd: buildCustomObjectBlockMd(intent),
    updatedAt: new Date().toISOString(),
    sourcePrompt: prompt,
    icon: "Puzzle",
  };
}

function resolveSpecMap(settings: ResolvedSettings, clientId?: string | null) {
  if (!clientId) {
    return settings.specs;
  }

  return {
    ...settings.specs,
    ...(settings.clientSpecs[clientId] ?? {}),
  };
}

function resolveVisibleRecordBranch(params: {
  settings: ResolvedSettings;
  specs: Record<string, StoredCustomObjectSpec>;
  clientId?: string | null;
  runtimeRole?: CustomObjectRuntimeRole;
}) {
  if (!params.clientId) {
    return Object.fromEntries(
      Object.entries(params.specs).map(([slug, spec]) => {
        const access = resolveSpecAccess(spec, params.runtimeRole ?? "builder");
        return [slug, access.canView ? params.settings.records[slug] ?? [] : []];
      })
    ) as Record<string, StoredCustomObjectRecord[]>;
  }

  const cache = new Map<string, BlockMdEntityDefinition | null>();
  const clientBranch = params.settings.clientRecords[params.clientId] ?? {};

  return Object.fromEntries(
    Object.entries(params.specs).map(([slug, spec]) => {
      const access = resolveSpecAccess(spec, params.runtimeRole ?? "builder");
      if (!access.canView) {
        return [slug, []];
      }

      const entity = getEntityFromSpec(spec, cache);
      const contactRelationFields = entity?.relations.filter((relation) => /^contact$/i.test(relation.target)).map((relation) => relation.field) ?? [];
      const baseRecords = params.settings.records[slug] ?? [];
      const visibleBaseRecords = contactRelationFields.length > 0
        ? baseRecords.filter((record) => contactRelationFields.some((field) => String(record.values[field] ?? "").trim() === params.clientId))
        : [];

      return [slug, dedupeStoredRecords([...(clientBranch[slug] ?? []), ...visibleBaseRecords])];
    })
  ) as Record<string, StoredCustomObjectRecord[]>;
}

function normalizeEntityName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findCustomObjectSpecByTarget(specs: Record<string, StoredCustomObjectSpec>, target: string) {
  const normalizedTarget = normalizeEntityName(target);
  return Object.values(specs).find((spec) => {
    return [spec.slug, spec.title, spec.singular, spec.plural, spec.entityName].some((candidate) => normalizeEntityName(candidate) === normalizedTarget);
  }) ?? null;
}

function detectGeneratedCustomObjectViewPrompt(prompt: string) {
  return /\b(create|generate|build|make|show|add)\b/i.test(prompt) && /\b(table|list view|grid|filtered view|kanban|pipeline|board|custom view|showing)\b/i.test(prompt);
}

function upsertNamedCustomObjectView(blockMd: string, nextView: BlockMdViewDefinition) {
  const parsed = parseBlockMd(blockMd);
  const views = [...parsed.views];
  const existingIndex = views.findIndex((view) => view.name.toLowerCase() === nextView.name.toLowerCase() && view.type === nextView.type && view.route === nextView.route);
  if (existingIndex >= 0) {
    views[existingIndex] = nextView;
  } else {
    views.push(nextView);
  }

  return replaceBlockMdViews(blockMd, views);
}

function resolveRelationTargetLabel(specs: Record<string, StoredCustomObjectSpec>, target: string) {
  if (/^contact$/i.test(target)) {
    return "Contacts";
  }

  if (/^deal$/i.test(target)) {
    return "Deals";
  }

  const relatedSpec = findCustomObjectSpecByTarget(specs, target);
  if (relatedSpec) {
    return relatedSpec.plural;
  }

  return toTitleCase(pluralize(target));
}

function mapStoredRecordToLinkedRecord(input: {
  record: StoredCustomObjectRecord;
  spec: StoredCustomObjectSpec;
  entity: BlockMdEntityDefinition;
  clientId?: string | null;
}): CrmLinkedRecord {
  const subtitle = resolveRecordSubtitle(input.record, input.entity);
  const description = resolveRecordDescription(input.record, input.entity);
  const statusField = getEntityStatusField(input.entity);
  const statusBadge = statusField ? toDisplayText(input.record.values[statusField]) : undefined;

  return {
    id: input.record.id,
    label: resolveRecordTitle(input.record, input.entity, input.spec.singular),
    href: buildScopedHref(`/${input.spec.routeBase}/${input.record.id}`, input.clientId),
    subtitle,
    description,
    badges: statusBadge ? [statusBadge] : [],
  } satisfies CrmLinkedRecord;
}

function buildLinkedRecordGroupsForTarget(params: {
  recordId: string;
  targetType: "contact" | "deal" | "custom";
  targetSpec?: StoredCustomObjectSpec;
  specs: Record<string, StoredCustomObjectSpec>;
  recordBranch: Record<string, StoredCustomObjectRecord[]>;
  clientId?: string | null;
}) {
  const cache = new Map<string, BlockMdEntityDefinition | null>();
  const groups = [] as CrmLinkedRecordGroup[];

  for (const spec of Object.values(params.specs)) {
    const entity = getEntityFromSpec(spec, cache);
    if (!entity) {
      continue;
    }

    for (const relation of entity.relations) {
      const matchesTarget = params.targetType === "contact"
        ? /^contact$/i.test(relation.target)
        : params.targetType === "deal"
          ? /^deal$/i.test(relation.target)
          : params.targetSpec
            ? findCustomObjectSpecByTarget(params.specs, relation.target)?.slug === params.targetSpec.slug
            : false;

      if (!matchesTarget) {
        continue;
      }

      const relatedRecords = (params.recordBranch[spec.slug] ?? [])
        .filter((record) => String(record.values[relation.field] ?? "").trim() === params.recordId)
        .map((record) => mapStoredRecordToLinkedRecord({
          record,
          spec,
          entity,
          clientId: params.clientId,
        }))
        .sort((left, right) => left.label.localeCompare(right.label));

      if (relatedRecords.length === 0) {
        continue;
      }

      groups.push({
        id: `${spec.slug}:${relation.field}:${params.recordId}`,
        label: spec.plural,
        subtitle: `Linked via ${humanizeFieldName(relation.field)}`,
        field: relation.field,
        target: relation.target,
        records: relatedRecords,
      });
    }
  }

  return groups.sort((left, right) => left.label.localeCompare(right.label));
}

async function buildRelationLookups(params: {
  orgId: string;
  clientId?: string | null;
  entity: BlockMdEntityDefinition;
  records: StoredCustomObjectRecord[];
  specs: Record<string, StoredCustomObjectSpec>;
  recordBranch: Record<string, StoredCustomObjectRecord[]>;
}) {
  const contactIds = new Set<string>();
  const dealIds = new Set<string>();
  const customRequests = new Map<string, Set<string>>();

  for (const relation of params.entity.relations) {
    for (const record of params.records) {
      const value = record.values[relation.field];
      if (typeof value !== "string" || !value.trim()) {
        continue;
      }

      if (/^contact$/i.test(relation.target)) {
        contactIds.add(value);
        continue;
      }

      if (/^deal$/i.test(relation.target)) {
        dealIds.add(value);
        continue;
      }

      const spec = findCustomObjectSpecByTarget(params.specs, relation.target);
      if (!spec) {
        continue;
      }

      if (!customRequests.has(spec.slug)) {
        customRequests.set(spec.slug, new Set<string>());
      }

      customRequests.get(spec.slug)?.add(value);
    }
  }

  const [contactRows, dealRows] = await Promise.all([
    contactIds.size > 0
      ? db
          .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, company: contacts.company })
          .from(contacts)
          .where(and(eq(contacts.orgId, params.orgId), inArray(contacts.id, Array.from(contactIds))))
      : Promise.resolve([]),
    dealIds.size > 0
      ? db
          .select({ id: deals.id, title: deals.title, stage: deals.stage })
          .from(deals)
          .where(and(eq(deals.orgId, params.orgId), inArray(deals.id, Array.from(dealIds))))
      : Promise.resolve([]),
  ]);

  const lookup = new Map<string, RelationLookupEntry>();

  for (const row of contactRows) {
    lookup.set(buildRelationLookupKey("Contact", row.id), {
      label: `${row.firstName} ${row.lastName ?? ""}`.trim() || row.company || "Contact",
      href: params.clientId ? `/contacts/${row.id}?clientId=${params.clientId}` : `/contacts/${row.id}`,
      subtitle: row.company || undefined,
    });
  }

  for (const row of dealRows) {
    lookup.set(buildRelationLookupKey("Deal", row.id), {
      label: row.title || "Deal",
      href: params.clientId ? `/deals/${row.id}?clientId=${params.clientId}` : `/deals/${row.id}`,
      subtitle: row.stage || undefined,
      badges: row.stage ? [row.stage] : undefined,
    });
  }

  for (const [slug, ids] of customRequests.entries()) {
    const spec = params.specs[slug];
    const targetRecords = params.recordBranch[slug] ?? [];
    const targetEntity = parseBlockMd(spec.blockMd).entities[0];
    if (!targetEntity) {
      continue;
    }

    for (const record of targetRecords) {
      if (!ids.has(record.id)) {
        continue;
      }

      const entry = {
        label: resolveRecordTitle(record, targetEntity, spec.singular),
        href: buildScopedHref(`/${spec.routeBase}/${record.id}`, params.clientId),
        subtitle: resolveRecordSubtitle(record, targetEntity),
      } satisfies RelationLookupEntry;

      for (const alias of [spec.entityName, spec.singular, spec.plural, spec.slug, spec.title]) {
        lookup.set(buildRelationLookupKey(alias, record.id), entry);
      }
    }
  }

  return lookup;
}

function toDisplayValue(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  return String(value);
}

function mapCustomObjectRecord(input: {
  record: StoredCustomObjectRecord;
  entity: BlockMdEntityDefinition;
  spec: StoredCustomObjectSpec;
  clientId?: string | null;
  relationLookup: Map<string, RelationLookupEntry>;
}): CrmRecord {
  const values: Record<string, unknown> = { ...input.record.values };
  const relationships: CrmRelationshipPreview[] = input.entity.relations.flatMap((relation) => {
    const rawValue = input.record.values[relation.field];
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      return [] as CrmRelationshipPreview[];
    }

    const lookupKey = buildRelationLookupKey(relation.target, rawValue);
    const related = input.relationLookup.get(lookupKey);
    if (related) {
      values[relation.field] = related.label;
      return [{
        id: `${input.record.id}:${relation.field}`,
        field: relation.field,
        label: related.label,
        href: related.href,
        subtitle: related.subtitle,
        badges: related.badges,
      }];
    }

    values[relation.field] = rawValue;
    return [{
      id: `${input.record.id}:${relation.field}`,
      field: relation.field,
      label: rawValue,
    }];
  });

  const hrefBase = input.clientId ? `/${input.spec.routeBase}/${input.record.id}?clientId=${input.clientId}` : `/${input.spec.routeBase}/${input.record.id}`;
  const title = resolveRecordTitle(input.record, input.entity, input.spec.singular);
  const subtitle = resolveRecordSubtitle(input.record, input.entity);

  return {
    id: input.record.id,
    href: hrefBase,
    title,
    subtitle,
    values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, toDisplayValue(value)])),
    relationships,
    badges: input.clientId ? ["Client scope"] : [],
  } satisfies CrmRecord;
}

function normalizeFieldValue(field: BlockMdFieldDefinition, value: FormDataEntryValue | null, clientId?: string | null) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (field.type === "relation" && /^contact$/i.test(field.relation ?? "") && clientId && !raw) {
    return clientId;
  }

  if (!raw) {
    return "";
  }

  if (field.type === "integer") {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : raw;
  }

  if (field.type === "currency") {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : raw;
  }

  return raw;
}

export async function applyCustomObjectIntent(params: {
  orgId: string;
  prompt: string;
  clientId?: string | null;
}) {
  const intent = extractCustomObjectIntent(params.prompt);
  if (!intent) {
    return null;
  }

  const blockMd = buildCustomObjectBlockMd(intent);
  const parsed = parseBlockMd(blockMd);
  const baseSettings = await readOrganizationSettings(params.orgId);
  const settings = readSettings(baseSettings);
  const entry = resolveStoredSpec(parsed, intent, params.prompt);

  if (params.clientId) {
    settings.clientSpecs[params.clientId] = {
      ...(settings.clientSpecs[params.clientId] ?? {}),
      [intent.slug]: entry,
    };
  } else {
    settings.specs[intent.slug] = entry;
  }

  await updateOrganizationSettings(params.orgId, writeSettings(settings));

  return {
    slug: intent.slug,
    label: intent.plural,
    blockMd,
    adminPath: buildAdminPath(intent.slug, params.clientId),
    parsed,
    spec: entry,
  };
}

export async function applyCustomObjectPermissionIntent(params: {
  orgId: string;
  prompt: string;
  clientId?: string | null;
}) {
  const baseSettings = await readOrganizationSettings(params.orgId);
  const settings = readSettings(baseSettings);
  const specs = resolveSpecMap(settings, params.clientId);
  const prompt = params.prompt.trim();

  const endClientMatch = prompt.match(/(?:only\s+)?allow\s+end-clients?\s+to\s+(view|edit)\s+(their own\s+)?([a-z0-9][a-z0-9 _-]*?)(?=[.!?]|$)/i);
  const operatorMatch = prompt.match(/allow\s+operators?\s+to\s+(view|edit|manage)\s+([a-z0-9][a-z0-9 _-]*?)(?=[.!?]|$)/i);
  const targetName = endClientMatch?.[3] ?? operatorMatch?.[2] ?? null;
  if (!targetName) {
    return null;
  }

  const spec = findCustomObjectSpecByTarget(specs, targetName);
  if (!spec) {
    return null;
  }

  const currentPolicy = parseCustomObjectPermissionPolicy(spec.blockMd);
  const nextPolicy = {
    ...currentPolicy,
    operatorEditableFields: [...currentPolicy.operatorEditableFields],
    endClientEditableFields: [...currentPolicy.endClientEditableFields],
  };
  let summary = "";

  if (endClientMatch) {
    nextPolicy.endClient = endClientMatch[1]?.toLowerCase() === "edit"
      ? endClientMatch[2] ? "edit-own" : "edit"
      : endClientMatch[2] ? "view-own" : "view";
    summary = `End-clients now ${endClientMatch[1]?.toLowerCase() === "edit" ? "edit" : "view"}${endClientMatch[2] ? " their own" : ""} ${spec.plural.toLowerCase()}.`;
  }

  if (operatorMatch) {
    nextPolicy.operator = operatorMatch[1]?.toLowerCase() === "manage"
      ? "manage"
      : operatorMatch[1]?.toLowerCase() === "edit"
        ? "edit"
        : "view";
    summary = `Operators now ${operatorMatch[1]?.toLowerCase()} ${spec.plural.toLowerCase()}.`;
  }

  const blockMd = replaceBlockMdSection(spec.blockMd, "Permissions", serializeCustomObjectPermissionPolicy(nextPolicy));
  const parsed = parseBlockMd(blockMd);
  const nextSpec = {
    ...spec,
    title: parsed.title ?? spec.title,
    blockMd,
    updatedAt: new Date().toISOString(),
    sourcePrompt: params.prompt,
  } satisfies StoredCustomObjectSpec;

  if (params.clientId) {
    settings.clientSpecs[params.clientId] = {
      ...(settings.clientSpecs[params.clientId] ?? {}),
      [spec.slug]: nextSpec,
    };
  } else {
    settings.specs[spec.slug] = nextSpec;
  }

  await updateOrganizationSettings(params.orgId, writeSettings(settings));

  return {
    slug: spec.slug,
    label: spec.plural,
    blockMd,
    adminPath: buildAdminPath(spec.slug, params.clientId),
    parsed,
    spec: nextSpec,
    summary,
  };
}

export async function applyCustomObjectBrainIntent(params: {
  orgId: string;
  prompt: string;
  clientId?: string | null;
}) {
  if (!/(brain insights?|intelligence summary|brain summary|intelligence section)/i.test(params.prompt)) {
    return null;
  }

  const baseSettings = await readOrganizationSettings(params.orgId);
  const settings = readSettings(baseSettings);
  const specs = resolveSpecMap(settings, params.clientId);
  const prompt = params.prompt.trim();
  const targetMatch = prompt.match(/(?:for|on|to) (?:this |the )?([a-z0-9][a-z0-9 _-]+?)(?: record| page| detail)?(?=[.!?]|$)/i);
  const targetName = targetMatch?.[1]?.trim();
  if (!targetName) {
    return null;
  }

  const spec = findCustomObjectSpecByTarget(specs, targetName);
  if (!spec) {
    return null;
  }

  const blockMd = upsertBrainIntelligenceSection(spec.blockMd, { enabled: true, title: "Brain Summary", maxSignals: 4 });
  const parsed = parseBlockMd(blockMd);
  const nextSpec = {
    ...spec,
    title: parsed.title ?? spec.title,
    blockMd,
    updatedAt: new Date().toISOString(),
    sourcePrompt: params.prompt,
  } satisfies StoredCustomObjectSpec;

  if (params.clientId) {
    settings.clientSpecs[params.clientId] = {
      ...(settings.clientSpecs[params.clientId] ?? {}),
      [spec.slug]: nextSpec,
    };
  } else {
    settings.specs[spec.slug] = nextSpec;
  }

  await updateOrganizationSettings(params.orgId, writeSettings(settings));

  return {
    slug: spec.slug,
    label: spec.plural,
    blockMd,
    adminPath: buildAdminPath(spec.slug, params.clientId),
    summary: `Brain insights are now enabled on ${spec.plural}.`,
  };
}

export async function applyGeneratedCustomObjectViewIntent(params: {
  orgId: string;
  prompt: string;
  clientId?: string | null;
}) {
  if (!detectGeneratedCustomObjectViewPrompt(params.prompt)) {
    return null;
  }

  const baseSettings = await readOrganizationSettings(params.orgId);
  const settings = readSettings(baseSettings);
  const specs = resolveSpecMap(settings, params.clientId);
  const normalizedPrompt = params.prompt.trim();
  const spec = Object.values(specs).find((candidate) => {
    return [candidate.slug, candidate.title, candidate.singular, candidate.plural, candidate.entityName].some((label) => {
      const normalizedLabel = label.trim().toLowerCase();
      return normalizedLabel.length > 0 && normalizedPrompt.toLowerCase().includes(normalizedLabel.toLowerCase());
    });
  }) ?? null;
  if (!spec) {
    return null;
  }

  const parsed = parseBlockMd(spec.blockMd);
  const entity = parsed.entities[0];
  if (!entity) {
    return null;
  }

  const draft = buildGeneratedViewDraft({
    prompt: params.prompt,
    entity,
    existingViews: parsed.views,
    routeBase: spec.routeBase,
    displayPluralLabel: spec.plural,
    extraFields: ["createdAt", "updatedAt"],
  });
  if (!draft) {
    return null;
  }

  const blockMd = upsertNamedCustomObjectView(spec.blockMd, draft.view);
  const nextSpec = {
    ...spec,
    blockMd,
    updatedAt: new Date().toISOString(),
    sourcePrompt: params.prompt,
  } satisfies StoredCustomObjectSpec;

  if (params.clientId) {
    settings.clientSpecs[params.clientId] = {
      ...(settings.clientSpecs[params.clientId] ?? {}),
      [spec.slug]: nextSpec,
    };
  } else {
    settings.specs[spec.slug] = nextSpec;
  }

  await updateOrganizationSettings(params.orgId, writeSettings(settings));

  const query = new URLSearchParams();
  query.set("view", draft.view.name);
  if (params.clientId) {
    query.set("clientId", params.clientId);
  }

  return {
    slug: spec.slug,
    label: spec.plural,
    blockMd,
    openPath: `${draft.openRoute}?${query.toString()}`,
    viewName: draft.view.name,
    summary: `${draft.label} is now live for ${spec.plural}.`,
  };
}

export async function listCustomObjectNavigationItems(params: {
  orgId: string;
  clientId?: string | null;
  runtimeRole?: CustomObjectRuntimeRole;
}) {
  const settings = readSettings(await readOrganizationSettings(params.orgId));
  return Object.values(resolveSpecMap(settings, params.clientId))
    .filter((spec) => resolveSpecAccess(spec, params.runtimeRole ?? "builder").canView)
    .sort((left, right) => left.plural.localeCompare(right.plural))
    .map((spec) => ({
      slug: spec.slug,
      label: spec.plural,
      href: buildScopedHref(`/${spec.routeBase}`, params.clientId),
      icon: spec.icon ?? "Puzzle",
    })) satisfies CustomObjectNavigationItem[];
}

export async function listCustomObjectManagementItems(params: {
  orgId: string;
  clientId?: string | null;
  runtimeRole?: CustomObjectRuntimeRole;
}) {
  const settings = readSettings(await readOrganizationSettings(params.orgId));
  const specs = resolveSpecMap(settings, params.clientId);
  const recordBranch = resolveVisibleRecordBranch({
    settings,
    specs,
    clientId: params.clientId,
    runtimeRole: params.runtimeRole,
  });
  const cache = new Map<string, BlockMdEntityDefinition | null>();

  return Object.values(specs)
    .filter((spec) => resolveSpecAccess(spec, params.runtimeRole ?? "builder").canView)
    .sort((left, right) => left.plural.localeCompare(right.plural))
    .map((spec) => {
      const parsed = parseBlockMd(spec.blockMd);
      const entity = getEntityFromSpec(spec, cache);

      return {
        slug: spec.slug,
        label: spec.plural,
        singular: spec.singular,
        plural: spec.plural,
        href: buildScopedHref(`/${spec.routeBase}`, params.clientId),
        pipelineHref: parsed.views.some((view) => view.type === "kanban") ? buildScopedHref(`/${spec.routeBase}/pipeline`, params.clientId) : undefined,
        description: entity?.description || `Schema-driven ${spec.plural.toLowerCase()} surface generated from BLOCK.md metadata.`,
        relationTargets: Array.from(new Set((entity?.relations ?? []).map((relation) => resolveRelationTargetLabel(specs, relation.target)))),
        recordCount: (recordBranch[spec.slug] ?? []).length,
        updatedAt: spec.updatedAt,
      } satisfies CustomObjectManagementItem;
    });
}

export async function getCustomObjectLinkedRecordGroups(params: {
  orgId: string;
  targetType: "contact" | "deal" | "custom";
  recordId: string;
  objectSlug?: string;
  clientId?: string | null;
  runtimeRole?: CustomObjectRuntimeRole;
}) {
  const settings = readSettings(await readOrganizationSettings(params.orgId));
  const specs = resolveSpecMap(settings, params.clientId);
  const recordBranch = resolveVisibleRecordBranch({
    settings,
    specs,
    clientId: params.clientId,
    runtimeRole: params.runtimeRole,
  });

  return buildLinkedRecordGroupsForTarget({
    recordId: params.recordId,
    targetType: params.targetType,
    targetSpec: params.objectSlug ? specs[params.objectSlug] : undefined,
    specs,
    recordBranch,
    clientId: params.clientId,
  });
}

export async function getCustomObjectConfig(params: {
  orgId: string;
  objectSlug: string;
  clientId?: string | null;
  runtimeRole?: CustomObjectRuntimeRole;
}) {
  const settings = readSettings(await readOrganizationSettings(params.orgId));
  const spec = resolveSpecMap(settings, params.clientId)[params.objectSlug];
  if (!spec) {
    return null;
  }

  const parsed = parseBlockMd(spec.blockMd);
  const entity = parsed.entities[0];
  if (!entity) {
    return null;
  }

  const access = resolveSpecAccess(spec, params.runtimeRole ?? "builder");
  if (!access.canView) {
    return null;
  }

  return {
    slug: params.objectSlug,
    spec,
    parsed,
    entity,
    scopedOverride: mergeScopedOverrideWithAccess(params.clientId ? settings.clientOverrides[params.clientId]?.[params.objectSlug] : undefined, access),
    access,
  } satisfies ResolvedCustomObject;
}

export async function listCustomObjectCrmRecords(params: {
  orgId: string;
  objectSlug: string;
  clientId?: string | null;
  runtimeRole?: CustomObjectRuntimeRole;
}) {
  const baseSettings = await readOrganizationSettings(params.orgId);
  const settings = readSettings(baseSettings);
  const spec = resolveSpecMap(settings, params.clientId)[params.objectSlug];
  if (!spec) {
    return [] as CrmRecord[];
  }

  const parsed = parseBlockMd(spec.blockMd);
  const entity = parsed.entities[0];
  if (!entity) {
    return [] as CrmRecord[];
  }

  const access = resolveSpecAccess(spec, params.runtimeRole ?? "builder");
  if (!access.canView) {
    return [] as CrmRecord[];
  }

  const recordBranch = resolveVisibleRecordBranch({
    settings,
    specs: resolveSpecMap(settings, params.clientId),
    clientId: params.clientId,
    runtimeRole: params.runtimeRole,
  });
  const rawRecords = recordBranch[params.objectSlug] ?? [];
  const relationLookup = await buildRelationLookups({
    orgId: params.orgId,
    clientId: params.clientId,
    entity,
    records: rawRecords,
    specs: resolveSpecMap(settings, params.clientId),
    recordBranch,
  });

  return rawRecords.map((record) => mapCustomObjectRecord({
    record,
    entity,
    spec,
    clientId: params.clientId,
    relationLookup,
  }));
}

export async function getCustomObjectCrmRecord(params: {
  orgId: string;
  objectSlug: string;
  recordId: string;
  clientId?: string | null;
  runtimeRole?: CustomObjectRuntimeRole;
}) {
  const records = await listCustomObjectCrmRecords({
    orgId: params.orgId,
    objectSlug: params.objectSlug,
    clientId: params.clientId,
    runtimeRole: params.runtimeRole,
  });

  const record = records.find((candidate) => candidate.id === params.recordId) ?? null;
  if (!record) {
    return null;
  }

  const linkedRecordGroups = await getCustomObjectLinkedRecordGroups({
    orgId: params.orgId,
    targetType: "custom",
    objectSlug: params.objectSlug,
    recordId: params.recordId,
    clientId: params.clientId,
    runtimeRole: params.runtimeRole,
  });

  return {
    ...record,
    linkedRecordGroups,
  } satisfies CrmRecord;
}

export async function getCustomObjectFormSchema(params: {
  orgId: string;
  objectSlug: string;
  clientId?: string | null;
  runtimeRole?: CustomObjectRuntimeRole;
}) {
  const baseSettings = await readOrganizationSettings(params.orgId);
  const settings = readSettings(baseSettings);
  const spec = resolveSpecMap(settings, params.clientId)[params.objectSlug];
  if (!spec) {
    return null;
  }

  const parsed = parseBlockMd(spec.blockMd);
  const entity = parsed.entities[0];
  if (!entity) {
    return null;
  }

  const access = resolveSpecAccess(spec, params.runtimeRole ?? "builder");
  if (!access.canView) {
    return null;
  }

  const editableFields = entity.fields.filter((field) => !field.auto && !/^(createdAt|updatedAt)$/i.test(field.name));
  const relationOptions: Record<string, CustomObjectRelationOption[]> = {};
  const visibleRecordBranch = resolveVisibleRecordBranch({
    settings,
    specs: resolveSpecMap(settings, params.clientId),
    clientId: params.clientId,
    runtimeRole: params.runtimeRole,
  });

  for (const field of editableFields.filter((candidate) => candidate.type === "relation" && candidate.relation)) {
    if (/^contact$/i.test(field.relation ?? "")) {
      const rows = await db
        .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, company: contacts.company })
        .from(contacts)
        .where(params.clientId ? and(eq(contacts.orgId, params.orgId), eq(contacts.id, params.clientId)) : eq(contacts.orgId, params.orgId))
        .orderBy(desc(contacts.updatedAt))
        .limit(params.clientId ? 1 : 100);

      relationOptions[field.name] = rows.map((row) => ({
        value: row.id,
        label: `${row.firstName} ${row.lastName ?? ""}`.trim() || row.company || "Contact",
        subtitle: row.company || undefined,
      }));
      continue;
    }

    if (/^deal$/i.test(field.relation ?? "")) {
      const rows = await db
        .select({ id: deals.id, title: deals.title, stage: deals.stage })
        .from(deals)
        .where(eq(deals.orgId, params.orgId))
        .orderBy(desc(deals.updatedAt))
        .limit(100);

      relationOptions[field.name] = rows.map((row) => ({
        value: row.id,
        label: row.title,
        subtitle: row.stage || undefined,
      }));
      continue;
    }

    const relatedSpec = findCustomObjectSpecByTarget(resolveSpecMap(settings, params.clientId), field.relation ?? "");
    if (!relatedSpec) {
      continue;
    }

    const targetEntity = parseBlockMd(relatedSpec.blockMd).entities[0];
    const titleField = targetEntity ? getEntityTitleField(targetEntity) : "name";
    const targetRecords = visibleRecordBranch[relatedSpec.slug] ?? [];

    relationOptions[field.name] = targetRecords.map((record) => ({
      value: record.id,
      label: String(record.values[titleField] ?? relatedSpec.singular),
    }));
  }

  return {
    slug: spec.slug,
    singular: spec.singular,
    plural: spec.plural,
    fields: editableFields.map((field) => ({
      name: field.name,
      label: humanizeFieldName(field.name),
      type: field.type,
      relation: field.relation,
      options: field.options,
    })),
    relationOptions,
  } satisfies CustomObjectFormSchema;
}

export async function createCustomObjectRecord(params: {
  orgId: string;
  objectSlug: string;
  values: Record<string, FormDataEntryValue | null>;
  clientId?: string | null;
  runtimeRole?: CustomObjectRuntimeRole;
}) {
  const config = await getCustomObjectConfig({
    orgId: params.orgId,
    objectSlug: params.objectSlug,
    clientId: params.clientId,
    runtimeRole: params.runtimeRole,
  });

  if (!config) {
    throw new Error("Custom object not found");
  }

  if (!config.access.canCreate) {
    throw new Error("You do not have permission to create records for this custom object");
  }

  const baseSettings = await readOrganizationSettings(params.orgId);
  const settings = readSettings(baseSettings);
  const now = new Date().toISOString();
  const values = Object.fromEntries(
    config.entity.fields
      .filter((field) => !field.auto)
      .map((field) => [field.name, normalizeFieldValue(field, params.values[field.name] ?? null, params.clientId)])
  );

  const nextRecord: StoredCustomObjectRecord = {
    id: randomUUID(),
    values: {
      ...values,
      createdAt: now,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  if (params.clientId) {
    settings.clientRecords[params.clientId] = {
      ...(settings.clientRecords[params.clientId] ?? {}),
      [params.objectSlug]: [...(settings.clientRecords[params.clientId]?.[params.objectSlug] ?? []), nextRecord],
    };
  } else {
    settings.records[params.objectSlug] = [...(settings.records[params.objectSlug] ?? []), nextRecord];
  }

  await updateOrganizationSettings(params.orgId, writeSettings(settings));
  await emitSeldonEvent(`${buildCustomObjectEventBase(config.spec)}.created`, {
    orgId: params.orgId,
    objectSlug: params.objectSlug,
    recordId: nextRecord.id,
    contactId: resolveRelatedContactId(config.entity, nextRecord.values, params.clientId),
  }, { orgId: params.orgId });
  return nextRecord;
}

export async function updateCustomObjectRecordField(params: {
  orgId: string;
  objectSlug: string;
  recordId: string;
  field: string;
  value: unknown;
  clientId?: string | null;
  runtimeRole?: CustomObjectRuntimeRole;
}) {
  const config = await getCustomObjectConfig({
    orgId: params.orgId,
    objectSlug: params.objectSlug,
    clientId: params.clientId,
    runtimeRole: params.runtimeRole,
  });

  if (!config) {
    throw new Error("Custom object not found");
  }

  if (!config.access.canEdit) {
    throw new Error("You do not have permission to edit this custom object");
  }

  if (!config.access.editableFields.includes(params.field)) {
    throw new Error(`Field ${params.field} is not editable in this scope`);
  }

  const baseSettings = await readOrganizationSettings(params.orgId);
  const settings = readSettings(baseSettings);
  const now = new Date().toISOString();
  const existingRecords = params.clientId
    ? settings.clientRecords[params.clientId]?.[params.objectSlug] ?? []
    : settings.records[params.objectSlug] ?? [];
  const existingRecord = existingRecords.find((record) => record.id === params.recordId) ?? null;
  const previousValue = existingRecord?.values?.[params.field];
  const updateList = (records: StoredCustomObjectRecord[]) => records.map((record) => record.id === params.recordId
    ? {
        ...record,
        updatedAt: now,
        values: {
          ...record.values,
          [params.field]: params.value,
          updatedAt: now,
        },
      }
    : record);

  if (params.clientId) {
    settings.clientRecords[params.clientId] = {
      ...(settings.clientRecords[params.clientId] ?? {}),
      [params.objectSlug]: updateList(settings.clientRecords[params.clientId]?.[params.objectSlug] ?? []),
    };
  } else {
    settings.records[params.objectSlug] = updateList(settings.records[params.objectSlug] ?? []);
  }

  await updateOrganizationSettings(params.orgId, writeSettings(settings));
  await emitSeldonEvent(`${buildCustomObjectEventBase(config.spec)}.field_changed`, {
    orgId: params.orgId,
    objectSlug: params.objectSlug,
    recordId: params.recordId,
    field: params.field,
    from: previousValue ?? null,
    to: params.value,
    contactId: resolveRelatedContactId(config.entity, {
      ...(existingRecord?.values ?? {}),
      [params.field]: params.value,
    }, params.clientId),
  }, { orgId: params.orgId });
}

export async function moveCustomObjectRecordLane(params: {
  orgId: string;
  objectSlug: string;
  recordId: string;
  laneField: string;
  toLane: string;
  clientId?: string | null;
  runtimeRole?: CustomObjectRuntimeRole;
}) {
  await updateCustomObjectRecordField({
    orgId: params.orgId,
    objectSlug: params.objectSlug,
    recordId: params.recordId,
    field: params.laneField,
    value: params.toLane,
    clientId: params.clientId,
    runtimeRole: params.runtimeRole,
  });
}

export function revalidateCustomObjectPaths(slug: string) {
  return [`/${buildRouteBase(slug)}`, `/${buildRouteBase(slug)}/pipeline`] as const;
}
