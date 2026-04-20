import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts, deals, organizations, users } from "@/db/schema";
import { parseBlockMd } from "@/lib/blocks/block-md";

type StoredWorkflowSpec = {
  id: string;
  name: string;
  blockMd: string;
  updatedAt: string;
  sourcePrompt?: string;
};

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

type WorkflowSettings = {
  crmWorkflowSpecs?: Record<string, StoredWorkflowSpec>;
  crmClientWorkflowSpecs?: Record<string, Record<string, StoredWorkflowSpec>>;
  crmCustomObjectSpecs?: Record<string, StoredCustomObjectSpec>;
  crmClientCustomObjectSpecs?: Record<string, Record<string, StoredCustomObjectSpec>>;
};

type ResolvedWorkflowSettings = {
  baseSettings: Record<string, unknown>;
  workflows: Record<string, StoredWorkflowSpec>;
  clientWorkflows: Record<string, Record<string, StoredWorkflowSpec>>;
  customObjectSpecs: Record<string, StoredCustomObjectSpec>;
  clientCustomObjectSpecs: Record<string, Record<string, StoredCustomObjectSpec>>;
};

type GeneratedWorkflowAction = "create_task";

type GeneratedWorkflowDefinition = {
  id: string;
  name: string;
  trigger: string;
  objectSlug?: string;
  conditions: Record<string, string>;
  action: GeneratedWorkflowAction;
  taskSubject: string;
  taskBody: string;
};

type GeneratedWorkflowIntent = {
  name: string;
  trigger: string;
  objectSlug?: string;
  conditions: Record<string, string>;
  taskSubject: string;
  taskBody: string;
};

type WorkflowEventContext = {
  eventType: string;
  orgId: string;
  contactId?: string | null;
  dealId?: string | null;
  recordId?: string | null;
  objectSlug?: string | null;
  field?: string | null;
  from?: unknown;
  to?: unknown;
  data: Record<string, unknown>;
};

export type GeneratedWorkflowManagementItem = {
  id: string;
  name: string;
  trigger: string;
  action: string;
  updatedAt: string;
  scopeLabel: string;
  objectLabel?: string;
  conditions: string[];
};

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toTitleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeValue(value: string) {
  return value.trim().toLowerCase();
}

function normalizeEntityName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildCustomObjectEventBase(spec: StoredCustomObjectSpec) {
  return slugify(spec.singular).replace(/_/g, "-");
}

function readWorkflowSettings(baseSettings: Record<string, unknown>): ResolvedWorkflowSettings {
  const typed = baseSettings as WorkflowSettings;
  return {
    baseSettings,
    workflows: typed.crmWorkflowSpecs ?? {},
    clientWorkflows: typed.crmClientWorkflowSpecs ?? {},
    customObjectSpecs: typed.crmCustomObjectSpecs ?? {},
    clientCustomObjectSpecs: typed.crmClientCustomObjectSpecs ?? {},
  };
}

function writeWorkflowSettings(settings: ResolvedWorkflowSettings) {
  return {
    ...settings.baseSettings,
    crmWorkflowSpecs: settings.workflows,
    crmClientWorkflowSpecs: settings.clientWorkflows,
    crmCustomObjectSpecs: settings.customObjectSpecs,
    crmClientCustomObjectSpecs: settings.clientCustomObjectSpecs,
  } satisfies Record<string, unknown>;
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

function resolveCustomObjectSpecs(settings: ResolvedWorkflowSettings, clientId?: string | null) {
  if (!clientId) {
    return settings.customObjectSpecs;
  }

  return {
    ...settings.customObjectSpecs,
    ...(settings.clientCustomObjectSpecs[clientId] ?? {}),
  };
}

function findCustomObjectSpecByTarget(specs: Record<string, StoredCustomObjectSpec>, target: string) {
  const normalizedTarget = normalizeEntityName(target);
  return Object.values(specs).find((spec) => {
    return [spec.slug, spec.title, spec.singular, spec.plural, spec.entityName].some((candidate) => normalizeEntityName(candidate) === normalizedTarget);
  }) ?? null;
}

function serializeWorkflowDefinition(definition: GeneratedWorkflowDefinition) {
  const conditionEntries = Object.entries(definition.conditions);
  return [
    `### ${definition.name}`,
    `- id: ${definition.id}`,
    `- trigger: ${definition.trigger}`,
    definition.objectSlug ? `- objectSlug: ${definition.objectSlug}` : null,
    `- conditions: ${conditionEntries.length > 0 ? conditionEntries.map(([key, value]) => `${key}=${value}`).join(", ") : "always"}`,
    `- action: ${definition.action}`,
    `- taskSubject: ${definition.taskSubject}`,
    `- taskBody: ${definition.taskBody}`,
  ].filter(Boolean).join("\n");
}

function parseWorkflowDefinitions(blockMd: string) {
  const parsed = parseBlockMd(blockMd);
  const lines = (parsed.sections.workflows ?? "").split("\n");
  const definitions: GeneratedWorkflowDefinition[] = [];
  let current: Partial<GeneratedWorkflowDefinition> | null = null;

  const pushCurrent = () => {
    if (!current?.name || !current.trigger || !current.action || !current.taskSubject || !current.taskBody) {
      return;
    }

    definitions.push({
      id: current.id ?? randomUUID(),
      name: current.name,
      trigger: current.trigger,
      objectSlug: current.objectSlug,
      conditions: current.conditions ?? {},
      action: current.action,
      taskSubject: current.taskSubject,
      taskBody: current.taskBody,
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("### ")) {
      pushCurrent();
      current = {
        name: line.slice(4).trim(),
        conditions: {},
      };
      continue;
    }

    if (!current || !line.startsWith("- ")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(2, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === "id") {
      current.id = value;
      continue;
    }
    if (key === "trigger") {
      current.trigger = value;
      continue;
    }
    if (key === "objectSlug") {
      current.objectSlug = value;
      continue;
    }
    if (key === "conditions") {
      current.conditions = value.toLowerCase() === "always"
        ? {}
        : Object.fromEntries(
            splitCommaList(value)
              .map((entry) => {
                const [conditionKey, conditionValue] = entry.split("=");
                return [String(conditionKey ?? "").trim(), String(conditionValue ?? "").trim()];
              })
              .filter(([conditionKey, conditionValue]) => conditionKey && conditionValue)
          );
      continue;
    }
    if (key === "action" && value === "create_task") {
      current.action = "create_task";
      continue;
    }
    if (key === "taskSubject") {
      current.taskSubject = value;
      continue;
    }
    if (key === "taskBody") {
      current.taskBody = value;
    }
  }

  pushCurrent();
  return definitions;
}

function buildWorkflowBlockMd(definition: GeneratedWorkflowDefinition) {
  return `# BLOCK: ${definition.name}

## Purpose

Generated workflow specification created by Seldon It for CRM automation.

## Workflows

${serializeWorkflowDefinition(definition)}`.trim();
}

function resolveWorkflowSpecMap(settings: ResolvedWorkflowSettings, clientId?: string | null) {
  if (!clientId) {
    return settings.workflows;
  }

  return {
    ...settings.workflows,
    ...(settings.clientWorkflows[clientId] ?? {}),
  };
}

function resolveIntentFromPrompt(params: {
  prompt: string;
  customObjectSpecs: Record<string, StoredCustomObjectSpec>;
}) {
  const prompt = params.prompt.trim();
  if (!/(workflow|automation)/i.test(prompt) || !/task/i.test(prompt)) {
    return null;
  }

  const dealStageMatch = prompt.match(/(?:create|add|make).*(?:workflow|automation).*(?:create|creates|creating).*(?:task).*(?:when|if) (?:a )?deal stage changes?(?: to ([a-z0-9 _-]+))?/i);
  if (dealStageMatch) {
    const toStage = dealStageMatch[1]?.trim();
    const stageLabel = toStage ? toTitleCase(toStage) : null;
    const conditions: Record<string, string> = {};
    if (toStage) {
      conditions.to = normalizeValue(toStage);
    }

    return {
      name: stageLabel ? `Task when deal stage changes to ${stageLabel}` : "Task when deal stage changes",
      trigger: "deal.stage_changed",
      conditions,
      taskSubject: stageLabel ? `Automation: Review deals entering ${stageLabel}` : "Automation: Review deal stage change",
      taskBody: stageLabel ? `A deal moved to ${stageLabel}. Review the opportunity and next step.` : "A deal stage changed. Review the opportunity and next step.",
    } satisfies GeneratedWorkflowIntent;
  }

  const objectFieldMatch = prompt.match(/(?:create|add|make).*(?:workflow|automation).*(?:create|creates|creating).*(?:task).*(?:when|if) (?:an? )?([a-z0-9 _-]+?) (status|stage|lane) changes?(?: to ([a-z0-9 _-]+))?/i);
  if (!objectFieldMatch) {
    return null;
  }

  const relatedSpec = findCustomObjectSpecByTarget(params.customObjectSpecs, objectFieldMatch[1] ?? "");
  if (!relatedSpec) {
    return null;
  }

  const field = normalizeValue(objectFieldMatch[2] ?? "status");
  const toValue = objectFieldMatch[3]?.trim();
  const toLabel = toValue ? toTitleCase(toValue) : null;
  const conditions: Record<string, string> = {
    field,
  };
  if (toValue) {
    conditions.to = normalizeValue(toValue);
  }

  return {
    name: toLabel ? `Task when ${relatedSpec.singular} ${field} changes to ${toLabel}` : `Task when ${relatedSpec.singular} ${field} changes`,
    trigger: `${buildCustomObjectEventBase(relatedSpec)}.field_changed`,
    objectSlug: relatedSpec.slug,
    conditions,
    taskSubject: toLabel
      ? `Automation: Review ${relatedSpec.singular.toLowerCase()} ${field} → ${toLabel}`
      : `Automation: Review ${relatedSpec.singular.toLowerCase()} ${field} change`,
    taskBody: toLabel
      ? `A ${relatedSpec.singular.toLowerCase()} changed ${field} to ${toLabel}. Review and follow up.`
      : `A ${relatedSpec.singular.toLowerCase()} ${field} changed. Review and follow up.`,
  } satisfies GeneratedWorkflowIntent;
}

export async function applyGeneratedWorkflowIntent(params: {
  orgId: string;
  prompt: string;
  clientId?: string | null;
}) {
  const baseSettings = await readOrganizationSettings(params.orgId);
  const settings = readWorkflowSettings(baseSettings);
  const intent = resolveIntentFromPrompt({
    prompt: params.prompt,
    customObjectSpecs: resolveCustomObjectSpecs(settings, params.clientId),
  });

  if (!intent) {
    return null;
  }

  const existingEntries = Object.values(resolveWorkflowSpecMap(settings, params.clientId));
  const existing = existingEntries.find((entry) => {
    const [definition] = parseWorkflowDefinitions(entry.blockMd);
    return definition
      && definition.trigger === intent.trigger
      && definition.objectSlug === intent.objectSlug
      && JSON.stringify(definition.conditions) === JSON.stringify(intent.conditions)
      && definition.action === "create_task";
  });

  const definition: GeneratedWorkflowDefinition = {
    id: existing?.id ?? randomUUID(),
    name: intent.name,
    trigger: intent.trigger,
    objectSlug: intent.objectSlug,
    conditions: intent.conditions,
    action: "create_task",
    taskSubject: intent.taskSubject,
    taskBody: intent.taskBody,
  };
  const blockMd = buildWorkflowBlockMd(definition);
  const spec: StoredWorkflowSpec = {
    id: definition.id,
    name: definition.name,
    blockMd,
    updatedAt: new Date().toISOString(),
    sourcePrompt: params.prompt,
  };

  if (params.clientId) {
    settings.clientWorkflows[params.clientId] = {
      ...(settings.clientWorkflows[params.clientId] ?? {}),
      [spec.id]: spec,
    };
  } else {
    settings.workflows[spec.id] = spec;
  }

  await updateOrganizationSettings(params.orgId, writeWorkflowSettings(settings));

  return {
    id: spec.id,
    name: spec.name,
    blockMd,
    openPath: params.clientId ? `/automations?clientId=${params.clientId}` : "/automations",
    scopeLabel: params.clientId ? "Client-scoped workflow" : "Org-wide workflow",
    summary: `Workflow saved: ${spec.name}.`,
  };
}

function renderTemplate(value: string, context: WorkflowEventContext) {
  return value
    .replaceAll("{event}", context.eventType)
    .replaceAll("{dealId}", context.dealId ?? "")
    .replaceAll("{contactId}", context.contactId ?? "")
    .replaceAll("{recordId}", context.recordId ?? "")
    .replaceAll("{object}", context.objectSlug ?? "")
    .replaceAll("{field}", String(context.field ?? ""))
    .replaceAll("{from}", String(context.from ?? ""))
    .replaceAll("{to}", String(context.to ?? ""));
}

function conditionMatches(context: WorkflowEventContext, key: string, expected: string) {
  const normalizedExpected = normalizeValue(expected);
  if (key === "field") {
    return normalizeValue(String(context.field ?? "")) === normalizedExpected;
  }

  if (key === "objectslug") {
    return normalizeValue(String(context.objectSlug ?? "")) === normalizedExpected;
  }

  if (key === "to") {
    return normalizeValue(String(context.to ?? "")) === normalizedExpected;
  }

  if (key === "from") {
    return normalizeValue(String(context.from ?? "")) === normalizedExpected;
  }

  return normalizeValue(String(context.data[key] ?? "")) === normalizedExpected;
}

async function resolveOwnerUserId(orgId: string) {
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.orgId, orgId))
    .limit(1);

  if (owner?.id) {
    return owner.id;
  }

  return null;
}

async function hasGeneratedWorkflowTask(params: {
  orgId: string;
  workflowId: string;
  subject: string;
  fingerprint: string;
}) {
  const rows = await db
    .select({ metadata: activities.metadata })
    .from(activities)
    .where(and(eq(activities.orgId, params.orgId), eq(activities.type, "task"), eq(activities.subject, params.subject)))
    .limit(50);

  return rows.some((row) => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    return metadata.workflowId === params.workflowId && metadata.workflowFingerprint === params.fingerprint;
  });
}

async function createGeneratedWorkflowTask(params: {
  context: WorkflowEventContext;
  workflow: GeneratedWorkflowDefinition;
}) {
  const ownerUserId = await resolveOwnerUserId(params.context.orgId);
  if (!ownerUserId) {
    return false;
  }

  const subject = renderTemplate(params.workflow.taskSubject, params.context);
  const body = renderTemplate(params.workflow.taskBody, params.context);
  const fingerprint = `${params.context.eventType}:${params.context.dealId ?? ""}:${params.context.contactId ?? ""}:${params.context.recordId ?? ""}:${params.context.field ?? ""}:${String(params.context.to ?? "")}`;

  if (await hasGeneratedWorkflowTask({
    orgId: params.context.orgId,
    workflowId: params.workflow.id,
    subject,
    fingerprint,
  })) {
    return false;
  }

  await db.insert(activities).values({
    orgId: params.context.orgId,
    userId: ownerUserId,
    contactId: params.context.contactId ?? null,
    dealId: params.context.dealId ?? null,
    type: "task",
    subject,
    body,
    metadata: {
      source: "generated-workflow",
      workflowId: params.workflow.id,
      workflowName: params.workflow.name,
      workflowFingerprint: fingerprint,
      eventType: params.context.eventType,
      recordId: params.context.recordId ?? null,
      objectSlug: params.context.objectSlug ?? null,
      field: params.context.field ?? null,
      from: params.context.from ?? null,
      to: params.context.to ?? null,
    },
    scheduledAt: new Date(),
  });

  return true;
}

async function resolveEventContext(eventType: string, data: Record<string, unknown>) {
  const directOrgId = typeof data.orgId === "string" ? data.orgId : null;
  const directContactId = typeof data.contactId === "string" ? data.contactId : null;
  const directDealId = typeof data.dealId === "string" ? data.dealId : null;
  const directRecordId = typeof data.recordId === "string" ? data.recordId : null;
  const directObjectSlug = typeof data.objectSlug === "string" ? data.objectSlug : null;
  const directField = typeof data.field === "string" ? data.field : null;

  if (directOrgId) {
    return {
      eventType,
      orgId: directOrgId,
      contactId: directContactId,
      dealId: directDealId,
      recordId: directRecordId,
      objectSlug: directObjectSlug,
      field: directField,
      from: data.from,
      to: data.to,
      data,
    } satisfies WorkflowEventContext;
  }

  if (directDealId) {
    const [deal] = await db
      .select({ orgId: deals.orgId, contactId: deals.contactId })
      .from(deals)
      .where(eq(deals.id, directDealId))
      .limit(1);

    if (deal?.orgId) {
      return {
        eventType,
        orgId: deal.orgId,
        contactId: directContactId ?? deal.contactId ?? null,
        dealId: directDealId,
        recordId: directRecordId,
        objectSlug: directObjectSlug,
        field: directField,
        from: data.from,
        to: data.to,
        data,
      } satisfies WorkflowEventContext;
    }
  }

  if (directContactId) {
    const [contact] = await db
      .select({ orgId: contacts.orgId })
      .from(contacts)
      .where(eq(contacts.id, directContactId))
      .limit(1);

    if (contact?.orgId) {
      return {
        eventType,
        orgId: contact.orgId,
        contactId: directContactId,
        dealId: directDealId,
        recordId: directRecordId,
        objectSlug: directObjectSlug,
        field: directField,
        from: data.from,
        to: data.to,
        data,
      } satisfies WorkflowEventContext;
    }
  }

  return null;
}

export async function runGeneratedWorkflowsForEvent(params: {
  eventType: string;
  data: Record<string, unknown>;
}) {
  const context = await resolveEventContext(params.eventType, params.data);
  if (!context) {
    return { matched: 0, created: 0 };
  }

  const settings = readWorkflowSettings(await readOrganizationSettings(context.orgId));
  const orgDefinitions = Object.values(settings.workflows).flatMap((spec) => parseWorkflowDefinitions(spec.blockMd));
  const clientDefinitions = context.contactId ? Object.values(settings.clientWorkflows[context.contactId] ?? {}).flatMap((spec) => parseWorkflowDefinitions(spec.blockMd)) : [];
  const definitions = [...orgDefinitions, ...clientDefinitions];

  let matched = 0;
  let created = 0;

  for (const definition of definitions) {
    if (definition.trigger !== params.eventType) {
      continue;
    }

    if (definition.objectSlug && normalizeValue(definition.objectSlug) !== normalizeValue(String(context.objectSlug ?? ""))) {
      continue;
    }

    const conditionsSatisfied = Object.entries(definition.conditions).every(([key, value]) => conditionMatches(context, key.toLowerCase(), value));
    if (!conditionsSatisfied) {
      continue;
    }

    matched += 1;

    if (definition.action === "create_task") {
      const didCreate = await createGeneratedWorkflowTask({ context, workflow: definition });
      if (didCreate) {
        created += 1;
      }
    }
  }

  return { matched, created };
}

export async function listGeneratedWorkflowManagementItems(params: {
  orgId: string;
  clientId?: string | null;
}) {
  const settings = readWorkflowSettings(await readOrganizationSettings(params.orgId));
  const specs = resolveWorkflowSpecMap(settings, params.clientId);
  const customObjectSpecs = resolveCustomObjectSpecs(settings, params.clientId);

  return Object.values(specs)
    .flatMap((spec) => parseWorkflowDefinitions(spec.blockMd).map((definition) => ({ spec, definition })))
    .sort((left, right) => right.spec.updatedAt.localeCompare(left.spec.updatedAt))
    .map(({ spec, definition }) => ({
      id: definition.id,
      name: definition.name,
      trigger: definition.trigger,
      action: definition.action,
      updatedAt: spec.updatedAt,
      scopeLabel: params.clientId ? "Client-scoped" : "Org-wide",
      objectLabel: definition.objectSlug ? customObjectSpecs[definition.objectSlug]?.plural ?? customObjectSpecs[definition.objectSlug]?.title : undefined,
      conditions: Object.entries(definition.conditions).map(([key, value]) => `${key} = ${value}`),
    })) satisfies GeneratedWorkflowManagementItem[];
}
