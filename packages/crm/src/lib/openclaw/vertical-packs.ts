import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getAIClient } from "@/lib/ai/client";
import { writeEvent } from "@/lib/brain";

/**
 * A VerticalPack is a SeldonFrame "skill pack" — a complete, vertical-specific
 * bundle of BLOCK.md-compatible definitions (objects, relations, views,
 * permissions, workflows) that can be installed into a workspace in one go.
 *
 * Packs are schema-driven. Every capability here maps to an existing
 * SeldonFrame primitive; no runtime code generation required.
 */

export const VERTICAL_PACK_SCHEMA_VERSION = "1.0";

export type VerticalPackField = {
  key: string;
  label: string;
  type:
    | "text"
    | "long_text"
    | "email"
    | "phone"
    | "url"
    | "integer"
    | "currency"
    | "boolean"
    | "timestamp"
    | "enum"
    | "relation";
  required?: boolean;
  options?: string[];
  relation_target?: string;
};

export type VerticalPackObject = {
  key: string;
  label_singular: string;
  label_plural: string;
  description: string;
  fields: VerticalPackField[];
};

export type VerticalPackRelation = {
  from_object: string;
  to_object: string;
  kind: "one_to_one" | "one_to_many" | "many_to_many";
  description: string;
};

export type VerticalPackView = {
  object_key: string;
  name: string;
  description: string;
  filters?: { field: string; op: "eq" | "neq" | "in" | "gt" | "lt" | "contains"; value: unknown }[];
  sort?: { field: string; direction: "asc" | "desc" };
  layout: "table" | "kanban" | "calendar" | "gallery";
};

export type VerticalPackPermission = {
  role: string;
  object_key: string;
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
};

export type VerticalPackWorkflow = {
  name: string;
  trigger: string;
  description: string;
  steps: string[];
};

export type VerticalPack = {
  schema_version: typeof VERTICAL_PACK_SCHEMA_VERSION;
  id: string;
  name: string;
  tagline: string;
  industry: string;
  description: string;
  soul_hints: {
    audience_type: "service" | "product" | "agency";
    tone: string;
    tagline_suggestion: string;
  };
  objects: VerticalPackObject[];
  relations: VerticalPackRelation[];
  views: VerticalPackView[];
  permissions: VerticalPackPermission[];
  workflows: VerticalPackWorkflow[];
  block_ids: string[];
  generated_by?: "builtin" | "ai";
  generated_at?: string;
};

/* ---------------------------------------------------------------- */
/*  Built-in seed pack — real estate agency                         */
/* ---------------------------------------------------------------- */

const REAL_ESTATE_PACK: VerticalPack = {
  schema_version: VERTICAL_PACK_SCHEMA_VERSION,
  id: "real-estate-agency",
  name: "Real Estate Agency",
  tagline: "List, tour, negotiate, close — one CRM for the whole pipeline.",
  industry: "real_estate",
  description:
    "A complete vertical CRM for independent agents and boutique agencies. Tracks listings, buyer leads, showings, offers, and closings on top of the standard SeldonFrame contact and deal primitives.",
  soul_hints: {
    audience_type: "service",
    tone: "confident, local, concise",
    tagline_suggestion: "Your neighbourhood expert, in one CRM.",
  },
  objects: [
    {
      key: "listing",
      label_singular: "Listing",
      label_plural: "Listings",
      description: "A property currently or recently on the market.",
      fields: [
        { key: "address", label: "Address", type: "text", required: true },
        { key: "mls_number", label: "MLS #", type: "text" },
        { key: "status", label: "Status", type: "enum", options: ["coming_soon", "active", "pending", "sold", "withdrawn"], required: true },
        { key: "list_price", label: "List price", type: "currency", required: true },
        { key: "sale_price", label: "Sale price", type: "currency" },
        { key: "bedrooms", label: "Bedrooms", type: "integer" },
        { key: "bathrooms", label: "Bathrooms", type: "integer" },
        { key: "square_feet", label: "Sq ft", type: "integer" },
        { key: "listed_at", label: "Listed at", type: "timestamp" },
        { key: "description", label: "Description", type: "long_text" },
      ],
    },
    {
      key: "showing",
      label_singular: "Showing",
      label_plural: "Showings",
      description: "A scheduled or completed property tour.",
      fields: [
        { key: "listing_id", label: "Listing", type: "relation", relation_target: "listing", required: true },
        { key: "contact_id", label: "Attendee", type: "relation", relation_target: "contact", required: true },
        { key: "scheduled_at", label: "Scheduled at", type: "timestamp", required: true },
        { key: "outcome", label: "Outcome", type: "enum", options: ["scheduled", "completed", "no_show", "canceled"] },
        { key: "notes", label: "Notes", type: "long_text" },
      ],
    },
    {
      key: "offer",
      label_singular: "Offer",
      label_plural: "Offers",
      description: "A written offer on a listing.",
      fields: [
        { key: "listing_id", label: "Listing", type: "relation", relation_target: "listing", required: true },
        { key: "contact_id", label: "Buyer", type: "relation", relation_target: "contact", required: true },
        { key: "amount", label: "Amount", type: "currency", required: true },
        { key: "status", label: "Status", type: "enum", options: ["submitted", "countered", "accepted", "rejected", "withdrawn"], required: true },
        { key: "submitted_at", label: "Submitted at", type: "timestamp" },
        { key: "closing_date", label: "Target closing date", type: "timestamp" },
      ],
    },
  ],
  relations: [
    { from_object: "contact", to_object: "showing", kind: "one_to_many", description: "A buyer may attend many showings." },
    { from_object: "listing", to_object: "showing", kind: "one_to_many", description: "A listing may have many showings." },
    { from_object: "listing", to_object: "offer", kind: "one_to_many", description: "A listing may receive many offers." },
    { from_object: "contact", to_object: "offer", kind: "one_to_many", description: "A buyer may submit many offers." },
  ],
  views: [
    { object_key: "listing", name: "Active listings", description: "All listings currently on market.", filters: [{ field: "status", op: "in", value: ["coming_soon", "active"] }], sort: { field: "listed_at", direction: "desc" }, layout: "table" },
    { object_key: "showing", name: "This week's showings", description: "All tours scheduled for the next 7 days.", filters: [{ field: "outcome", op: "eq", value: "scheduled" }], sort: { field: "scheduled_at", direction: "asc" }, layout: "calendar" },
    { object_key: "offer", name: "Open offers", description: "Offers awaiting response.", filters: [{ field: "status", op: "in", value: ["submitted", "countered"] }], sort: { field: "submitted_at", direction: "desc" }, layout: "kanban" },
  ],
  permissions: [
    { role: "agent", object_key: "listing", can_read: true, can_write: true, can_delete: false },
    { role: "agent", object_key: "showing", can_read: true, can_write: true, can_delete: true },
    { role: "agent", object_key: "offer", can_read: true, can_write: true, can_delete: false },
    { role: "end_client", object_key: "listing", can_read: true, can_write: false, can_delete: false },
    { role: "end_client", object_key: "showing", can_read: true, can_write: false, can_delete: false },
    { role: "end_client", object_key: "offer", can_read: true, can_write: false, can_delete: false },
  ],
  workflows: [
    { name: "Offer accepted notification", trigger: "offer.status == accepted", description: "Notify buyer and agent, schedule closing tasks.", steps: ["send_email(buyer)", "send_email(agent)", "create_task(closing_prep, +3d)"] },
    { name: "Showing reminder", trigger: "showing.scheduled_at - 24h", description: "Send reminder to attendee.", steps: ["send_sms(contact)", "send_email(contact)"] },
    { name: "Listing goes stale", trigger: "listing.listed_at + 30d AND listing.status == active", description: "Flag listings that have been on market for 30+ days.", steps: ["create_task(agent, price_review)"] },
  ],
  block_ids: ["pages", "forms", "emails", "bookings"],
  generated_by: "builtin",
};

const BUILTIN_PACKS: VerticalPack[] = [REAL_ESTATE_PACK];

/* ---------------------------------------------------------------- */
/*  Registry                                                        */
/* ---------------------------------------------------------------- */

export async function listVerticalPacks(): Promise<VerticalPack[]> {
  return BUILTIN_PACKS.map((pack) => ({ ...pack }));
}

export async function getVerticalPackById(id: string): Promise<VerticalPack | null> {
  const match = BUILTIN_PACKS.find((pack) => pack.id === id);
  return match ? { ...match } : null;
}

/* ---------------------------------------------------------------- */
/*  AI generator                                                    */
/* ---------------------------------------------------------------- */

const GENERATOR_SYSTEM_PROMPT = `You are the SeldonFrame Vertical Pack Generator. You produce one VerticalPack JSON document for a specific business vertical.

# What a VerticalPack is

A VerticalPack is a COMPLETE, INSTALL-READY bundle for a single industry (e.g. "real-estate-agency", "coaching-client-os"). It contains:
  - objects: domain nouns with typed fields
  - relations: how objects link to each other AND to the built-in "contact" and "deal" objects
  - views: named, filtered views of objects (table / kanban / calendar / gallery)
  - permissions: role-based access (roles include "agent", "owner", "end_client")
  - workflows: named triggers with step descriptions

# Output format — STRICT

Return ONE JSON object. NOTHING ELSE. No markdown fences. No prose. No commentary before or after.
The JSON must match this TypeScript shape EXACTLY:

{
  "schema_version": "1.0",
  "id": "<kebab-case-vertical-id>",
  "name": "<human name>",
  "tagline": "<one sentence>",
  "industry": "<snake_case_industry>",
  "description": "<2-4 sentences>",
  "soul_hints": {
    "audience_type": "service" | "product" | "agency",
    "tone": "<2-4 adjectives>",
    "tagline_suggestion": "<one sentence>"
  },
  "objects": [
    {
      "key": "<snake_case>",
      "label_singular": "<string>",
      "label_plural": "<string>",
      "description": "<string>",
      "fields": [
        { "key": "<snake_case>", "label": "<string>", "type": "<allowed type>", "required"?: boolean, "options"?: [string], "relation_target"?: "<object key>" }
      ]
    }
  ],
  "relations": [
    { "from_object": "<key>", "to_object": "<key>", "kind": "one_to_one" | "one_to_many" | "many_to_many", "description": "<string>" }
  ],
  "views": [
    { "object_key": "<key>", "name": "<string>", "description": "<string>", "filters"?: [{"field": "<key>", "op": "eq"|"neq"|"in"|"gt"|"lt"|"contains", "value": <any>}], "sort"?: {"field": "<key>", "direction": "asc"|"desc"}, "layout": "table"|"kanban"|"calendar"|"gallery" }
  ],
  "permissions": [
    { "role": "<role name>", "object_key": "<key>", "can_read": boolean, "can_write": boolean, "can_delete": boolean }
  ],
  "workflows": [
    { "name": "<string>", "trigger": "<string>", "description": "<string>", "steps": ["<string>", ...] }
  ],
  "block_ids": ["<one or more of: pages, forms, emails, bookings, automations>"]
}

# Allowed field types (exhaustive)

"text", "long_text", "email", "phone", "url", "integer", "currency", "boolean", "timestamp", "enum", "relation"

If type is "enum", you MUST include "options" (array of snake_case strings).
If type is "relation", you MUST include "relation_target" (the target object's key, OR "contact" / "deal" for built-ins).
Never invent other types.

# Hard rules — DO

1. Produce 2 to 5 objects. Never more than 5.
2. Produce 2 to 6 views total across all objects.
3. Produce at least one permission for each object you create, for both "agent" and "end_client" roles.
4. Produce 1 to 4 workflows.
5. Use the built-in "contact" object for people. Do not redefine a Person/Contact object.
6. Use the built-in "deal" object for monetisable pipelines when appropriate.
7. Keep every string in English.
8. Keep every object key, field key, and view filter reference lowercase snake_case.
9. id must be kebab-case and end with the vertical's pattern (e.g. "-agency", "-os", "-crm").

# Hard rules — DO NOT

1. DO NOT include any field named "id", "created_at", "updated_at" — those are auto-managed by SeldonFrame.
2. DO NOT invent roles beyond: "owner", "agent", "end_client".
3. DO NOT reference an object_key or relation_target that you did not define AND is not "contact" or "deal".
4. DO NOT include code, SQL, JavaScript, or implementation details in any field.
5. DO NOT include markdown, backticks, or prose around the JSON.
6. DO NOT include fields like "tables", "migrations", "schema_ddl" — the installer owns persistence.

# Success criteria (the pack is valid only if ALL are true)

A. The JSON parses with no errors.
B. schema_version === "1.0".
C. Every relation's from_object and to_object is either a defined object key or "contact" / "deal".
D. Every view's object_key is either a defined object key or "contact" / "deal".
E. Every view's filter.field is a field on that view's object (or a built-in field like "status" on "deal").
F. Every permission.object_key is either a defined object key or "contact" / "deal".
G. Every enum field has a non-empty "options" array.
H. Every relation field has a "relation_target".

# Stop conditions

Stop immediately after emitting the closing "}" of the JSON object. Do not continue.`;

function parseVerticalPackJson(text: string): unknown {
  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Generator did not return a JSON object.");
  }
  const json = trimmed.slice(firstBrace, lastBrace + 1);
  return JSON.parse(json);
}

const ALLOWED_FIELD_TYPES = new Set([
  "text", "long_text", "email", "phone", "url", "integer", "currency",
  "boolean", "timestamp", "enum", "relation",
]);
const BUILTIN_OBJECT_KEYS = new Set(["contact", "deal"]);
const ALLOWED_ROLES = new Set(["owner", "agent", "end_client"]);
const ALLOWED_LAYOUTS = new Set(["table", "kanban", "calendar", "gallery"]);
const ALLOWED_BLOCK_IDS = new Set(["pages", "forms", "emails", "bookings", "automations"]);

function validateVerticalPack(raw: unknown): VerticalPack {
  if (!raw || typeof raw !== "object") throw new Error("Pack is not an object.");
  const pack = raw as Record<string, unknown>;

  if (pack.schema_version !== VERTICAL_PACK_SCHEMA_VERSION) {
    throw new Error(`schema_version must be ${VERTICAL_PACK_SCHEMA_VERSION}`);
  }
  for (const key of ["id", "name", "tagline", "industry", "description"] as const) {
    if (typeof pack[key] !== "string" || !(pack[key] as string).trim()) {
      throw new Error(`${key} is required and must be a non-empty string`);
    }
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(pack.id as string)) {
    throw new Error("id must be kebab-case");
  }

  const objects = pack.objects;
  if (!Array.isArray(objects) || objects.length < 2 || objects.length > 5) {
    throw new Error("objects must contain 2 to 5 entries");
  }
  const objectKeys = new Set<string>();
  for (const obj of objects as VerticalPackObject[]) {
    if (!obj.key || objectKeys.has(obj.key)) throw new Error("object keys must be unique");
    objectKeys.add(obj.key);
    if (!Array.isArray(obj.fields) || obj.fields.length === 0) {
      throw new Error(`object ${obj.key} must have at least one field`);
    }
    for (const field of obj.fields) {
      if (["id", "created_at", "updated_at"].includes(field.key)) {
        throw new Error(`field ${field.key} is reserved and must not be declared`);
      }
      if (!ALLOWED_FIELD_TYPES.has(field.type)) {
        throw new Error(`field type ${field.type} is not allowed`);
      }
      if (field.type === "enum" && (!field.options || field.options.length === 0)) {
        throw new Error(`enum field ${field.key} must declare options`);
      }
      if (field.type === "relation" && !field.relation_target) {
        throw new Error(`relation field ${field.key} must declare relation_target`);
      }
      if (field.type === "relation" && field.relation_target) {
        if (!objectKeys.has(field.relation_target) && !BUILTIN_OBJECT_KEYS.has(field.relation_target)) {
          // deferred until all objects read; partial validation here is OK
        }
      }
    }
  }

  const resolveObjectRef = (key: string) => objectKeys.has(key) || BUILTIN_OBJECT_KEYS.has(key);

  for (const obj of objects as VerticalPackObject[]) {
    for (const field of obj.fields) {
      if (field.type === "relation" && field.relation_target && !resolveObjectRef(field.relation_target)) {
        throw new Error(`relation field ${obj.key}.${field.key} targets unknown object ${field.relation_target}`);
      }
    }
  }

  const relations = (pack.relations ?? []) as VerticalPackRelation[];
  if (!Array.isArray(relations)) throw new Error("relations must be an array");
  for (const rel of relations) {
    if (!resolveObjectRef(rel.from_object) || !resolveObjectRef(rel.to_object)) {
      throw new Error(`relation references unknown object: ${rel.from_object} -> ${rel.to_object}`);
    }
  }

  const views = pack.views;
  if (!Array.isArray(views) || views.length < 2 || views.length > 6) {
    throw new Error("views must contain 2 to 6 entries");
  }
  for (const view of views as VerticalPackView[]) {
    if (!resolveObjectRef(view.object_key)) {
      throw new Error(`view ${view.name} targets unknown object ${view.object_key}`);
    }
    if (!ALLOWED_LAYOUTS.has(view.layout)) {
      throw new Error(`view ${view.name} has unsupported layout ${view.layout}`);
    }
  }

  const permissions = pack.permissions;
  if (!Array.isArray(permissions) || permissions.length === 0) {
    throw new Error("permissions must contain at least one entry");
  }
  for (const perm of permissions as VerticalPackPermission[]) {
    if (!ALLOWED_ROLES.has(perm.role)) throw new Error(`permission role ${perm.role} is not allowed`);
    if (!resolveObjectRef(perm.object_key)) {
      throw new Error(`permission targets unknown object ${perm.object_key}`);
    }
  }

  const workflows = pack.workflows;
  if (!Array.isArray(workflows) || workflows.length < 1 || workflows.length > 4) {
    throw new Error("workflows must contain 1 to 4 entries");
  }

  const blockIds = pack.block_ids;
  if (!Array.isArray(blockIds) || blockIds.length === 0) {
    throw new Error("block_ids must contain at least one entry");
  }
  for (const id of blockIds) {
    if (typeof id !== "string" || !ALLOWED_BLOCK_IDS.has(id)) {
      throw new Error(`block id ${id} is not allowed`);
    }
  }

  return {
    ...(pack as object),
    schema_version: VERTICAL_PACK_SCHEMA_VERSION,
  } as VerticalPack;
}

export type GenerateVerticalPackInput = {
  orgId: string;
  userId: string | null;
  description: string;
  vertical?: string;
};

export async function generateVerticalPack(input: GenerateVerticalPackInput): Promise<VerticalPack> {
  const description = input.description.trim();
  if (!description) throw new Error("description is required");

  const resolution = await getAIClient({ orgId: input.orgId, userId: input.userId });
  if (!resolution.client) {
    throw new Error("No Anthropic client available. Configure ANTHROPIC_API_KEY or BYOK.");
  }

  const verticalHint = input.vertical?.trim() ? `Suggested vertical id: ${input.vertical.trim()}` : "Pick a kebab-case vertical id that fits.";
  const userPrompt = [
    "Generate ONE VerticalPack JSON for the following vertical.",
    verticalHint,
    "Business description from the builder:",
    description,
    "Remember: output JSON only. Start with `{`, end with `}`. No markdown, no prose.",
  ].join("\n\n");

  const response = await resolution.client.messages.create({
    model: process.env.VERTICAL_PACK_MODEL?.trim() || "claude-sonnet-4-6",
    max_tokens: 4000,
    temperature: 0.2,
    system: GENERATOR_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("\n")
    .trim();

  const parsed = parseVerticalPackJson(text);
  const validated = validateVerticalPack(parsed);
  validated.generated_by = "ai";
  validated.generated_at = new Date().toISOString();

  void writeEvent(input.orgId, "vertical_pack_generated", {
    pack_id: validated.id,
    industry: validated.industry,
    object_count: validated.objects.length,
    view_count: validated.views.length,
    workflow_count: validated.workflows.length,
  });

  return validated;
}

/* ---------------------------------------------------------------- */
/*  Installer                                                       */
/* ---------------------------------------------------------------- */

export type InstallVerticalPackResult = {
  orgId: string;
  packId: string;
  installedAt: string;
  enabledBlocks: string[];
};

export async function installVerticalPack(orgId: string, pack: VerticalPack): Promise<InstallVerticalPackResult> {
  const validated = validateVerticalPack(pack);

  const [org] = await db
    .select({ settings: organizations.settings, enabledBlocks: organizations.enabledBlocks })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) throw new Error("Organization not found");

  const installedAt = new Date().toISOString();
  const settings = { ...((org.settings ?? {}) as Record<string, unknown>) };
  const priorPacks = (settings.verticalPacks ?? {}) as Record<string, unknown>;
  settings.verticalPacks = {
    ...priorPacks,
    [validated.id]: {
      ...validated,
      installed_at: installedAt,
    },
  };

  const existingBlocks = Array.isArray(org.enabledBlocks) ? org.enabledBlocks : [];
  const nextBlocks = Array.from(new Set([...existingBlocks, ...validated.block_ids]));

  await db
    .update(organizations)
    .set({ settings, enabledBlocks: nextBlocks, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));

  void writeEvent(orgId, "vertical_pack_installed", {
    pack_id: validated.id,
    industry: validated.industry,
    object_count: validated.objects.length,
    view_count: validated.views.length,
    workflow_count: validated.workflows.length,
    generated_by: validated.generated_by ?? "builtin",
  });

  return {
    orgId,
    packId: validated.id,
    installedAt,
    enabledBlocks: nextBlocks,
  };
}
