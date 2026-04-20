import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { parseBlockMd, replaceBlockMdSection, replaceBlockMdViews, type BlockMdViewDefinition, type BlockMdViewType, type ParsedBlockMd } from "@/lib/blocks/block-md";
import { buildDefaultBrainIntelligenceSection } from "@/lib/brain-record-insights";
import { buildGeneratedViewDraft } from "@/lib/crm/generated-views";
import type { CrmScopedOverride } from "@/components/crm/types";

export type CrmSurfaceEntity = "contacts" | "deals";

type StoredCrmSurfaceSpec = {
  blockMd: string;
  updatedAt: string;
  sourcePrompt?: string;
};

type StoredCrmSurfaceSettings = {
  crmSurfaceSpecs?: Partial<Record<CrmSurfaceEntity, StoredCrmSurfaceSpec>>;
  crmClientSurfaceSpecs?: Record<string, Partial<Record<CrmSurfaceEntity, StoredCrmSurfaceSpec>>>;
  crmClientSurfaceOverrides?: Record<string, Partial<Record<CrmSurfaceEntity, CrmScopedOverride>>>;
};

export type ResolvedCrmSurface = {
  entity: CrmSurfaceEntity;
  blockMd: string;
  parsed: ParsedBlockMd;
  scopedOverride?: CrmScopedOverride;
};

function readSurfaceSettings(settings: Record<string, unknown>) {
  const typed = settings as StoredCrmSurfaceSettings;
  return {
    surfaceSpecs: typed.crmSurfaceSpecs ?? {},
    clientSurfaceSpecs: typed.crmClientSurfaceSpecs ?? {},
    clientSurfaceOverrides: typed.crmClientSurfaceOverrides ?? {},
  };
}

function writeSurfaceSettings(params: {
  baseSettings: Record<string, unknown>;
  surfaceSpecs?: Partial<Record<CrmSurfaceEntity, StoredCrmSurfaceSpec>>;
  clientSurfaceSpecs?: Record<string, Partial<Record<CrmSurfaceEntity, StoredCrmSurfaceSpec>>>;
  clientSurfaceOverrides?: Record<string, Partial<Record<CrmSurfaceEntity, CrmScopedOverride>>>;
}) {
  return {
    ...params.baseSettings,
    ...(params.surfaceSpecs ? { crmSurfaceSpecs: params.surfaceSpecs } : {}),
    ...(params.clientSurfaceSpecs ? { crmClientSurfaceSpecs: params.clientSurfaceSpecs } : {}),
    ...(params.clientSurfaceOverrides ? { crmClientSurfaceOverrides: params.clientSurfaceOverrides } : {}),
  };
}

function contactBaseViews(): BlockMdViewDefinition[] {
  return [
    {
      name: "Contacts Table",
      entity: "Contact",
      type: "table",
      route: "/contacts",
      default: true,
      columns: ["name", "company", "email", "status", "updatedAt"],
      fields: [],
      cardFields: [],
      filters: [],
      sorting: [{ field: "updatedAt", direction: "desc" }],
      wipLimits: {},
      savedViews: [
        { visibility: "personal", label: "Recent Contacts" },
        { visibility: "shared", label: "Follow-up Queue" },
      ],
      raw: [],
    },
    {
      name: "Contact Record",
      entity: "Contact",
      type: "record",
      route: "/contacts/[id]",
      default: false,
      columns: [],
      fields: ["name", "email", "phone", "company", "status", "score", "revenue", "createdAt", "updatedAt"],
      cardFields: [],
      filters: [],
      sorting: [],
      titleField: "name",
      descriptionField: "company",
      wipLimits: {},
      savedViews: [],
      raw: [],
    },
    {
      name: "Contact Timeline",
      entity: "Contact",
      type: "timeline",
      route: "/contacts/[id]/timeline",
      default: false,
      columns: [],
      fields: ["status", "createdAt", "updatedAt"],
      cardFields: [],
      filters: [],
      sorting: [{ field: "updatedAt", direction: "desc" }],
      wipLimits: {},
      savedViews: [],
      raw: [],
    },
  ];
}

function dealBaseViews(): BlockMdViewDefinition[] {
  return [
    {
      name: "Opportunities Table",
      entity: "Deal",
      type: "table",
      route: "/deals",
      default: true,
      columns: ["title", "contactName", "stage", "value", "updatedAt"],
      fields: [],
      cardFields: [],
      filters: [],
      sorting: [{ field: "updatedAt", direction: "desc" }],
      wipLimits: {},
      savedViews: [
        { visibility: "personal", label: "Active Opportunities" },
        { visibility: "shared", label: "Pipeline Review" },
      ],
      raw: [],
    },
    {
      name: "Opportunities Pipeline",
      entity: "Deal",
      type: "kanban",
      route: "/deals/pipeline",
      default: false,
      columns: [],
      fields: [],
      cardFields: ["contactName", "value", "probability"],
      filters: [],
      sorting: [],
      laneField: "stage",
      titleField: "title",
      descriptionField: "contactName",
      wipLimits: {},
      savedViews: [
        { visibility: "personal", label: "My Pipeline" },
        { visibility: "shared", label: "Weekly Pipeline Review" },
      ],
      raw: [],
    },
    {
      name: "Opportunity Record",
      entity: "Deal",
      type: "record",
      route: "/deals/[id]",
      default: false,
      columns: [],
      fields: ["title", "contactName", "stage", "value", "probability", "notes", "createdAt", "updatedAt"],
      cardFields: [],
      filters: [],
      sorting: [],
      titleField: "title",
      descriptionField: "contactName",
      wipLimits: {},
      savedViews: [],
      raw: [],
    },
    {
      name: "Opportunity Timeline",
      entity: "Deal",
      type: "timeline",
      route: "/deals/[id]/timeline",
      default: false,
      columns: [],
      fields: ["stage", "value", "probability", "updatedAt"],
      cardFields: [],
      filters: [],
      sorting: [{ field: "updatedAt", direction: "desc" }],
      wipLimits: {},
      savedViews: [],
      raw: [],
    },
  ];
}

function buildBlockMd(entity: CrmSurfaceEntity, views: BlockMdViewDefinition[]) {
  if (entity === "contacts") {
    return `# BLOCK: Contacts CRM

## Purpose

Contacts gives every workspace a relationship operating system for people, lifecycle stages, contact context, and follow-up visibility.

## Entities

### Contact
- firstName (text)
- lastName (text)
- email (text)
- phone (text)
- company (text)
- status (enum: lead, customer, inactive)
- score (integer)
- createdAt (timestamp, auto)
- updatedAt (timestamp, auto)

## Dependencies
- Required:
  - Identity
- Optional:
  - Email
  - Calendar

## Events
- Emits:
  - contact.created
  - contact.updated
  - contact.status_changed
- Listens:
  - form.submitted
  - booking.confirmed

${buildDefaultBrainIntelligenceSection("Brain Summary")}

${viewsSection(views)}

## Pages

### Admin pages
1. /contacts
   - Shows the contact operating view with search, filtering, and bulk actions
   - Actions: create, update stage, assign owner, save views
   - Empty state: explain how new leads flow in from forms, bookings, and imports

2. /contacts/[id]
   - Shows the contact record with details, relationships, and activity context
   - Actions: update profile, view timeline, trigger follow-up
   - Empty state: scoped not-found guidance for missing records

### Integration pages
1. Opportunity detail integration
   - Adds linked contact summary and contact open action to deal records

Identity usage:
- Uses soul labels for people naming
- Uses soul voice for empty states and helper copy

## Navigation
- label: Contacts
- icon: Users
- order: 20`;
  }

  return `# BLOCK: Opportunities CRM

## Purpose

Opportunities turns the deal pipeline into a live operating surface with table, kanban, record, and timeline views generated from the workspace's sales process.

## Entities

### Deal
- title (text)
- contactId (relation -> Contact)
- contactName (text)
- stage (text)
- value (currency)
- probability (integer)
- createdAt (timestamp, auto)
- updatedAt (timestamp, auto)

## Dependencies
- Required:
  - Identity
- Optional:
  - Email
  - Calendar
  - Payments

## Events
- Emits:
  - deal.created
  - deal.stage_changed
  - deal.updated
- Listens:
  - contact.created
  - payment.received

${buildDefaultBrainIntelligenceSection("Brain Summary")}

${viewsSection(views)}

## Pages

### Admin pages
1. /deals
   - Shows the opportunities operating view with value filters and saved views
   - Actions: create, edit, bulk update, switch to pipeline
   - Empty state: explain how opportunities track revenue through the pipeline

2. /deals/pipeline
   - Shows the lane-based opportunity pipeline with stage drag and WIP limits
   - Actions: move stage, inspect opportunity, rebalance workload
   - Empty state: prompt the user to create the first opportunity

3. /deals/[id]
   - Shows the opportunity record with linked contact context and activity history
   - Actions: update stage, inspect value, review next steps
   - Empty state: scoped not-found guidance for missing records

### Integration pages
1. Contact detail integration
   - Adds linked opportunities preview and open action to the contact record

Identity usage:
- Uses soul pipeline labels to name stages where available
- Uses soul voice for guidance copy and empty states

## Navigation
- label: Opportunities
- icon: Briefcase
- order: 24`;
}

function viewsSection(views: BlockMdViewDefinition[]) {
  const sections = views.map((view) => {
    const lines = [`### ${view.name}`, `- entity: ${view.entity}`, `- type: ${view.type}`];
    if (view.route) lines.push(`- route: ${view.route}`);
    if (typeof view.default === "boolean") lines.push(`- default: ${view.default ? "true" : "false"}`);
    if (view.columns.length > 0) lines.push(`- columns: ${view.columns.join(", ")}`);
    if (view.fields.length > 0) lines.push(`- fields: ${view.fields.join(", ")}`);
    if (view.cardFields.length > 0) lines.push(`- cardFields: ${view.cardFields.join(", ")}`);
    if (view.filters.length > 0) lines.push(`- filters: ${view.filters.map((filter) => `${filter.field}=${filter.value}`).join(", ")}`);
    if (view.sorting.length > 0) lines.push(`- sorting: ${view.sorting.map((sorting) => `${sorting.field}:${sorting.direction}`).join(", ")}`);
    if (view.laneField) lines.push(`- laneField: ${view.laneField}`);
    if (view.titleField) lines.push(`- titleField: ${view.titleField}`);
    if (view.descriptionField) lines.push(`- descriptionField: ${view.descriptionField}`);
    if (Object.keys(view.wipLimits).length > 0) lines.push(`- wipLimits: ${Object.entries(view.wipLimits).map(([lane, value]) => `${lane}=${value}`).join(", ")}`);
    if (view.savedViews.length > 0) lines.push(`- savedViews: ${view.savedViews.map((savedView) => `${savedView.visibility}:${savedView.label}`).join(" | ")}`);
    return lines.join("\n");
  });

  return `## Views\n\n${sections.join("\n\n")}`;
}

function getDefaultViews(entity: CrmSurfaceEntity) {
  return entity === "contacts" ? contactBaseViews() : dealBaseViews();
}

function getDefaultBlockMd(entity: CrmSurfaceEntity) {
  return buildBlockMd(entity, getDefaultViews(entity));
}

function getCanonicalView(entity: CrmSurfaceEntity, viewType: BlockMdViewType) {
  return getDefaultViews(entity).find((view) => view.type === viewType) ?? null;
}

function mergeView(blockMd: string, entity: CrmSurfaceEntity, viewType: BlockMdViewType) {
  const parsed = parseBlockMd(blockMd);
  const canonicalView = getCanonicalView(entity, viewType);
  if (!canonicalView) {
    return { blockMd, parsed };
  }

  const views = [...parsed.views];
  const existingIndex = views.findIndex((view) => view.type === viewType);
  if (existingIndex >= 0) {
    views[existingIndex] = {
      ...views[existingIndex],
      ...canonicalView,
      default: viewType === "table" ? true : views[existingIndex].default ?? canonicalView.default,
    };
  } else {
    views.push(canonicalView);
  }

  if (viewType === "table") {
    for (const view of views) {
      if (view.type === "table") {
        view.default = view.name === canonicalView.name;
      }
    }
  }

  const nextBlockMd = replaceBlockMdViews(blockMd, views);
  return { blockMd: nextBlockMd, parsed: parseBlockMd(nextBlockMd) };
}

function detectGeneratedViewEntity(prompt: string): CrmSurfaceEntity | null {
  const normalized = prompt.trim().toLowerCase();
  const wantsGeneratedView = /(table|list view|grid|filtered view|custom view|showing|kanban|pipeline|board)/.test(normalized);
  const hasVerb = /\b(create|generate|build|make|show|add|give me|i want|we want|we need|can you build|can you create)\b/.test(normalized);
  if (!wantsGeneratedView || !hasVerb) {
    return null;
  }

  if (/(deal|deals|opportunit|opportunities|pipeline)/.test(normalized)) {
    return "deals";
  }

  if (/(contact|contacts|people|lead|leads|client|clients)/.test(normalized)) {
    return "contacts";
  }

  return null;
}

function upsertNamedView(existingViews: BlockMdViewDefinition[], nextView: BlockMdViewDefinition) {
  const next = [...existingViews];
  const existingIndex = next.findIndex((view) => view.name.toLowerCase() === nextView.name.toLowerCase() && view.type === nextView.type && view.route === nextView.route);
  if (existingIndex >= 0) {
    next[existingIndex] = nextView;
    return next;
  }

  next.push(nextView);
  return next;
}

export async function getCrmSurfaceConfig(params: {
  orgId: string;
  entity: CrmSurfaceEntity;
  clientId?: string | null;
}) {
  const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, params.orgId)).limit(1);
  const settings = ((org?.settings ?? {}) as Record<string, unknown>) || {};
  const { surfaceSpecs, clientSurfaceSpecs, clientSurfaceOverrides } = readSurfaceSettings(settings);
  const clientId = params.clientId?.trim() || "";
  const clientSurface = clientId ? clientSurfaceSpecs[clientId]?.[params.entity] : undefined;
  const surface = clientSurface ?? surfaceSpecs[params.entity];
  const blockMd = surface?.blockMd ?? getDefaultBlockMd(params.entity);

  return {
    entity: params.entity,
    blockMd,
    parsed: parseBlockMd(blockMd),
    scopedOverride: clientId ? clientSurfaceOverrides[clientId]?.[params.entity] : undefined,
  } satisfies ResolvedCrmSurface;
}

export async function applyCrmSurfaceIntent(params: {
  orgId: string;
  entity: CrmSurfaceEntity;
  viewType: BlockMdViewType;
  prompt: string;
  clientId?: string | null;
}) {
  const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, params.orgId)).limit(1);
  const currentSettings = ((org?.settings ?? {}) as Record<string, unknown>) || {};
  const { surfaceSpecs, clientSurfaceSpecs, clientSurfaceOverrides } = readSurfaceSettings(currentSettings);
  const clientId = params.clientId?.trim() || "";

  const existingSpec = clientId
    ? clientSurfaceSpecs[clientId]?.[params.entity]?.blockMd ?? getDefaultBlockMd(params.entity)
    : surfaceSpecs[params.entity]?.blockMd ?? getDefaultBlockMd(params.entity);

  const merged = mergeView(existingSpec, params.entity, params.viewType);
  const nextEntry: StoredCrmSurfaceSpec = {
    blockMd: merged.blockMd,
    updatedAt: new Date().toISOString(),
    sourcePrompt: params.prompt,
  };

  const nextSurfaceSpecs = { ...surfaceSpecs };
  const nextClientSurfaceSpecs = { ...clientSurfaceSpecs };

  if (clientId) {
    nextClientSurfaceSpecs[clientId] = {
      ...(nextClientSurfaceSpecs[clientId] ?? {}),
      [params.entity]: nextEntry,
    };
  } else {
    nextSurfaceSpecs[params.entity] = nextEntry;
  }

  await db
    .update(organizations)
    .set({
      settings: writeSurfaceSettings({
        baseSettings: currentSettings,
        surfaceSpecs: nextSurfaceSpecs,
        clientSurfaceSpecs: nextClientSurfaceSpecs,
        clientSurfaceOverrides,
      }),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, params.orgId));

  return {
    entity: params.entity,
    blockMd: merged.blockMd,
    parsed: merged.parsed,
  };
}

export async function applyCrmSurfaceIntelligenceIntent(params: {
  orgId: string;
  entities: CrmSurfaceEntity[];
  prompt: string;
  clientId?: string | null;
}) {
  const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, params.orgId)).limit(1);
  const currentSettings = ((org?.settings ?? {}) as Record<string, unknown>) || {};
  const { surfaceSpecs, clientSurfaceSpecs, clientSurfaceOverrides } = readSurfaceSettings(currentSettings);
  const clientId = params.clientId?.trim() || "";
  const nextSurfaceSpecs = { ...surfaceSpecs };
  const nextClientSurfaceSpecs = { ...clientSurfaceSpecs };
  const applied = [] as Array<{ entity: CrmSurfaceEntity; blockMd: string }>;

  for (const entity of params.entities) {
    const existingSpec = clientId
      ? clientSurfaceSpecs[clientId]?.[entity]?.blockMd ?? getDefaultBlockMd(entity)
      : surfaceSpecs[entity]?.blockMd ?? getDefaultBlockMd(entity);
    const blockMd = replaceBlockMdSection(existingSpec, "Intelligence", buildDefaultBrainIntelligenceSection("Brain Summary").replace(/^## Intelligence\n\n/, ""));
    const nextEntry: StoredCrmSurfaceSpec = {
      blockMd,
      updatedAt: new Date().toISOString(),
      sourcePrompt: params.prompt,
    };

    if (clientId) {
      nextClientSurfaceSpecs[clientId] = {
        ...(nextClientSurfaceSpecs[clientId] ?? {}),
        [entity]: nextEntry,
      };
    } else {
      nextSurfaceSpecs[entity] = nextEntry;
    }

    applied.push({ entity, blockMd });
  }

  await db
    .update(organizations)
    .set({
      settings: writeSurfaceSettings({
        baseSettings: currentSettings,
        surfaceSpecs: nextSurfaceSpecs,
        clientSurfaceSpecs: nextClientSurfaceSpecs,
        clientSurfaceOverrides,
      }),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, params.orgId));

  return applied;
}

export async function applyGeneratedCrmViewIntent(params: {
  orgId: string;
  prompt: string;
  clientId?: string | null;
}) {
  const entity = detectGeneratedViewEntity(params.prompt);
  if (!entity) {
    return null;
  }

  const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, params.orgId)).limit(1);
  const currentSettings = ((org?.settings ?? {}) as Record<string, unknown>) || {};
  const { surfaceSpecs, clientSurfaceSpecs, clientSurfaceOverrides } = readSurfaceSettings(currentSettings);
  const clientId = params.clientId?.trim() || "";
  const existingSpec = clientId
    ? clientSurfaceSpecs[clientId]?.[entity]?.blockMd ?? getDefaultBlockMd(entity)
    : surfaceSpecs[entity]?.blockMd ?? getDefaultBlockMd(entity);
  const parsed = parseBlockMd(existingSpec);
  const primaryEntity = parsed.entities[0];
  if (!primaryEntity) {
    return null;
  }

  const draft = buildGeneratedViewDraft({
    prompt: params.prompt,
    entity: primaryEntity,
    existingViews: parsed.views,
    routeBase: entity === "contacts" ? "contacts" : "deals",
    displayPluralLabel: entity === "contacts" ? "Contacts" : "Opportunities",
    extraFields: entity === "contacts"
      ? ["name", "revenue", "openTaskCount", "createdAt", "updatedAt"]
      : ["contactName", "value", "probability", "createdAt", "updatedAt", "closedAt"],
  });
  if (!draft) {
    return null;
  }

  const nextViews = upsertNamedView(parsed.views, draft.view);
  const blockMd = replaceBlockMdViews(existingSpec, nextViews);
  const nextEntry: StoredCrmSurfaceSpec = {
    blockMd,
    updatedAt: new Date().toISOString(),
    sourcePrompt: params.prompt,
  };

  const nextSurfaceSpecs = { ...surfaceSpecs };
  const nextClientSurfaceSpecs = { ...clientSurfaceSpecs };
  if (clientId) {
    nextClientSurfaceSpecs[clientId] = {
      ...(nextClientSurfaceSpecs[clientId] ?? {}),
      [entity]: nextEntry,
    };
  } else {
    nextSurfaceSpecs[entity] = nextEntry;
  }

  await db
    .update(organizations)
    .set({
      settings: writeSurfaceSettings({
        baseSettings: currentSettings,
        surfaceSpecs: nextSurfaceSpecs,
        clientSurfaceSpecs: nextClientSurfaceSpecs,
        clientSurfaceOverrides,
      }),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, params.orgId));

  const query = new URLSearchParams();
  query.set("view", draft.view.name);
  if (clientId) {
    query.set("clientId", clientId);
  }

  return {
    entity,
    label: draft.label,
    blockMd,
    openPath: `${draft.openRoute}?${query.toString()}`,
    viewName: draft.view.name,
  };
}
