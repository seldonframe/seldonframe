// ICP-3 — agent_templates data layer (the Agent Builder).
//
// A builder creates a REUSABLE, sellable agent TEMPLATE (the product) once, then
// later deploys it to many no-login SMB clients (the `deployments` table). This
// module is the template CRUD; it mirrors lib/agents/store.ts (the per-workspace
// `agents` CRUD) but operates on `agent_templates` and is scoped by
// builderOrgId instead of orgId.
//
// All DB access is behind injectable `deps` (repo convention — see
// lib/agents/voice/transcript.ts + voice-agent.ts) so the unit tests run with no
// Postgres. The pure helpers (slug generation, default-blueprint construction,
// the patch merge) are exported separately and TDD'd in isolation.
//
// Testing the template live + the eval gate are LATER tasks (1.2 / 1.3). This
// module makes NO live LLM calls and does NOT run evals.

import type {
  AgentTemplate,
  AgentTemplateStatus,
  NewAgentTemplate,
} from "@/db/schema/agent-templates";
import type { Agent, AgentBlueprint } from "@/db/schema/agents";

// ─── archetype defaults ──────────────────────────────────────────────────────
//
// The default voice-receptionist blueprint a freshly-created template gets. This
// mirrors what a voice-receptionist AGENT gets today: the capability set from
// lib/agents/store.ts DEFAULT_CAPABILITIES_BY_ARCHETYPE["voice-receptionist"]
// (incl. take_message + get_quote_range), a greeting, and a TTS voice (the same
// "cedar" default getOrCreateVoiceAgent uses). Kept in sync deliberately so a
// template behaves like the live voice agent the builder already knows.

/** Template type id. v1 ships voice_receptionist; v2 adds chat_assistant. */
export type AgentTemplateType = "voice_receptionist" | "chat_assistant";

/** Which channel surface a template / agent targets. `voice` + `chat` are the
 *  original two; `sms` + `email` are text surfaces that route inbound messages
 *  through the SAME agent loop as web chat (multi-surface runtime), so they
 *  share the chat capability set (book/reschedule/cancel/find/escalate/faq) and
 *  deliberately exclude voice-only tools (the get_quote_range read-back guard). */
export type AgentSurface = "voice" | "chat" | "sms" | "email";

/** Map a template type to its surface channel. Pure — no DB. v1 template types
 *  only span voice/chat; sms/email surfaces are reached via agents.channel +
 *  the channel adapters, not a distinct template type. */
export function surfaceForType(type: AgentTemplateType): AgentSurface {
  return type === "chat_assistant" ? "chat" : "voice";
}

/**
 * Product-gap fix (agent-as-deploy-source) — map a workspace AGENT's `channel`
 * column onto the constrained `AgentTemplateType` a template row needs. Pure —
 * no DB. Mirrors surfaceForType's inverse: `channel === "voice"` is the only
 * case that becomes `voice_receptionist`; every other channel (web_chat / sms /
 * email) becomes `chat_assistant`, matching the doc comment above
 * `AgentSurface` that sms/email agents "share the chat capability set" with
 * web chat (they run the same text-agent loop, just via a different channel
 * adapter) — there is no dedicated sms/email template TYPE to map to instead.
 */
export function templateTypeForAgentChannel(channel: string): AgentTemplateType {
  return channel === "voice" ? "voice_receptionist" : "chat_assistant";
}

/**
 * Derive a friendly template NAME from the builder's one-sentence intent.
 * Used by the "Describe your agent" create flow so a generated agent gets a
 * sensible name without a second prompt. Pure (no DB) so it's unit-testable.
 *
 * Takes the first ~5 words, title-cases them, strips trailing punctuation, and
 * caps the length. Empty / wordless prompts fall back to "New agent".
 */
export function deriveName(prompt: string): string {
  const words = (prompt ?? "")
    .trim()
    // Split on whitespace; drop empties from leading/collapsed spaces.
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    // Strip punctuation so "phone," / "quote…" read cleanly as a name.
    .map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, ""))
    .filter(Boolean);

  if (words.length === 0) return "New agent";

  const titled = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  // Keep the name within the column width the editors/list render.
  return titled.slice(0, 60);
}

/** Default voice-receptionist capabilities — mirrors lib/agents/store.ts
 *  DEFAULT_CAPABILITIES_BY_ARCHETYPE["voice-receptionist"] (the live agent's
 *  default tool allowlist, incl. the voice R1 safe-exit + quote guard). */
export const DEFAULT_VOICE_RECEPTIONIST_CAPABILITIES: string[] = [
  "look_up_availability",
  "book_appointment",
  "find_my_existing_appointment",
  "reschedule_appointment",
  "cancel_appointment",
  "escalate_to_human",
  // voice R1 — the safe exit + the quote guard.
  "take_message",
  "get_quote_range",
];

/** Default greeting a new voice-receptionist template ships with. */
export const DEFAULT_VOICE_RECEPTIONIST_GREETING =
  "Thanks for calling! How can I help you today?";

/** Default TTS voice — matches getOrCreateVoiceAgent's "cedar" default
 *  (the newest gpt-realtime voice). */
export const DEFAULT_VOICE_RECEPTIONIST_VOICE = "cedar";

/** Default chat-assistant capabilities. Mirrors the website-chatbot archetype
 *  capabilities from lib/agents/store.ts DEFAULT_CAPABILITIES_BY_ARCHETYPE
 *  ["chat-assistant"], plus provide_faq_answer (chat-only; excluded from
 *  voice because openai-realtime.ts filters it out as a v1.26 placeholder). */
export const DEFAULT_CHAT_ASSISTANT_CAPABILITIES: string[] = [
  "look_up_availability",
  "book_appointment",
  "find_my_existing_appointment",
  "reschedule_appointment",
  "cancel_appointment",
  "escalate_to_human",
  "provide_faq_answer",
];

/** Default greeting a new chat-assistant template ships with. */
export const DEFAULT_CHAT_ASSISTANT_GREETING = "Hi! How can I help you today?";

/** Union of ALL capabilities available across any template type. De-duplicated
 *  so callers can render a combined UI capability picker or seed permissions. */
export const ALL_TEMPLATE_CAPABILITIES: string[] = Array.from(
  new Set([
    ...DEFAULT_VOICE_RECEPTIONIST_CAPABILITIES,
    ...DEFAULT_CHAT_ASSISTANT_CAPABILITIES,
  ]),
);

/**
 * The tools allowed for a given channel surface. Pure (no DB) so callers (the
 * generator's allow-list, the editor's tool picker) stay in lockstep on which
 * tools belong to which surface — voice gets the voice-receptionist set (incl.
 * get_quote_range, excl. the chat-only provide_faq_answer), chat gets the
 * chat-assistant set (the reverse). Returns a FRESH array each call so callers
 * may mutate it freely. Prefer this over ALL_TEMPLATE_CAPABILITIES (the
 * voice+chat union) whenever the surface is known, so a voice agent is never
 * offered chat-only tools and vice-versa.
 */
export function capabilitiesForSurface(surface: AgentSurface): string[] {
  // Only `voice` gets the voice-receptionist set (with the get_quote_range
  // read-back guard, minus the chat-only provide_faq_answer). Every text
  // surface — chat, sms, email — shares the chat-assistant set, since an SMS /
  // email agent reasons in text exactly like the web chatbot.
  return surface === "voice"
    ? [...DEFAULT_VOICE_RECEPTIONIST_CAPABILITIES]
    : [...DEFAULT_CHAT_ASSISTANT_CAPABILITIES];
}

/**
 * Build the DEFAULT blueprint for a template of the given type. Pure (no DB) so
 * it's unit-testable. Branches on type: voice_receptionist gets the same
 * defaults a live voice-receptionist agent gets (incl. cedar voice + quote
 * guard); chat_assistant gets web-chat defaults (no voice key).
 */
export function buildDefaultTemplateBlueprint(
  type: AgentTemplateType,
): AgentBlueprint {
  if (type === "chat_assistant") {
    return {
      archetype: "chat-assistant",
      capabilities: [...DEFAULT_CHAT_ASSISTANT_CAPABILITIES],
      faq: [],
      pricingFacts: [],
      greeting: DEFAULT_CHAT_ASSISTANT_GREETING,
      // No MCP connectors by default; the builder binds them in the Studio's
      // "Connectors & Tools" picker (#3). An empty array keeps the runtime seam
      // on its byte-for-byte native path until a connector is actually bound.
      connectors: [],
    };
  }
  return {
    archetype: "voice-receptionist",
    capabilities: [...DEFAULT_VOICE_RECEPTIONIST_CAPABILITIES],
    faq: [],
    pricingFacts: [],
    greeting: DEFAULT_VOICE_RECEPTIONIST_GREETING,
    voice: DEFAULT_VOICE_RECEPTIONIST_VOICE,
    connectors: [],
  };
}

// ─── slug ────────────────────────────────────────────────────────────────────

/** Lowercase, hyphenate, trim to 40 chars. Mirrors lib/agents/store.ts
 *  slugify so template slugs read identically to agent slugs. */
export function slugifyTemplateName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Resolve a per-builder-unique slug from a base name given the slugs already
 * taken by this builder. Pure (the caller supplies the existing set), so the
 * uniqueness loop is unit-testable without a DB.
 *
 * Unlike agents (whose FIRST agent gets the terse "default" slug for a short
 * embed URL), templates have no public per-template URL, so the first template
 * keeps its real name-derived slug. Empty/blank names fall back to "template".
 */
export function resolveUniqueTemplateSlug(
  name: string,
  takenSlugs: Iterable<string>,
): string {
  const taken = new Set<string>();
  for (const s of takenSlugs) taken.add(s.toLowerCase());

  const base = slugifyTemplateName(name) || "template";
  if (!taken.has(base)) return base;

  for (let attempt = 2; attempt < 1000; attempt++) {
    const candidate = `${base}-${attempt}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Pathological fallback — astronomically unlikely.
  return `${base}-${Date.now()}`;
}

// ─── buildTemplateFromAgent (product-gap fix: agent-as-deploy-source) ────────
//
// `POST /api/v1/build/deploy` only ever accepted a marketplace TEMPLATE
// source (templateId | listingSlug). When a Claude Code session builds a
// workspace AGENT (the `agents` table — created via createAgent/the Studio
// generator) and says "deploy it", there is no matching source and the route
// 404s. Rather than teach the deploy verb a SECOND parallel flow, this
// converts the agent into an agent_templates row on the fly and lets the
// EXISTING template flow (readiness → phone → go-live, Tier-0 included)
// handle it unchanged — mirrors buildInstalledAgentTemplate's exact shape
// (a Pick<NewAgentTemplate, …> the caller inserts), just with an AGENT as the
// source instead of a marketplace listing's cloned blueprint.

/**
 * The agent_templates INSERT for a template generated FROM a workspace
 * agent, minus the slug (the caller resolves a per-builder-unique slug
 * against the DB, exactly like buildInstalledAgentTemplate). Pure — no DB.
 *
 * The blueprint is a DEFENSIVE COPY (structuredClone) of the agent's own
 * blueprint, stamped with `blueprint.sourceAgentId` (AgentBlueprint,
 * db/schema/agents.ts) so a repeat "deploy it" call resolves the SAME
 * generated template instead of cloning a fresh one every time — this
 * mirrors the resolve-or-reuse idiom resolveListingSource already
 * established for listing-cloned templates (`blueprint ->> 'sourceListingId'
 * = listing.id`); the route's agent-source resolver runs the equivalent
 * `blueprint ->> 'sourceAgentId' = agent.id` query. `type` is derived from
 * the agent's `channel` (templateTypeForAgentChannel) since agents carry a
 * free-text `archetype` string, not the constrained AgentTemplateType a
 * template row requires. Status starts 'draft' — the deploy flow doesn't
 * gate on template status, so this needs no eval/publish step to be
 * immediately deployable.
 */
export function buildTemplateFromAgent(
  agent: Pick<Agent, "orgId" | "name" | "channel" | "blueprint" | "id">,
): Pick<NewAgentTemplate, "builderOrgId" | "name" | "type" | "blueprint" | "status"> {
  const blueprint: AgentBlueprint = {
    ...structuredClone(agent.blueprint ?? {}),
    sourceAgentId: agent.id,
  };
  return {
    builderOrgId: agent.orgId,
    name: agent.name,
    type: templateTypeForAgentChannel(agent.channel),
    blueprint,
    status: "draft",
  };
}

// ─── resolveAgentAsTemplate (DI'd orchestration) ─────────────────────────────
//
// The impure half of the agent-as-deploy-source bridge: given a caller-owned
// (org-scoped) workspace agent id, resolve-or-create the agent_templates row
// that `POST /api/v1/build/deploy`'s resolveTemplateSource then treats exactly
// like any other owned template. DI'd (repo convention) so it's unit-testable
// with fakes — no live Postgres, no route/HTTP layer needed to exercise the
// resolve-or-reuse idempotency or the cross-org rejection.

export type ResolveAgentAsTemplateDeps = {
  /** Load the workspace agent by id, org-scoped. Returns null if the id
   *  doesn't exist OR belongs to a different org — the caller must never
   *  distinguish these two cases (never leak cross-org existence). */
  findAgentInOrg: (
    orgId: string,
    agentId: string,
  ) => Promise<Pick<Agent, "id" | "orgId" | "name" | "channel" | "blueprint"> | null>;
  /** Find an agent_templates row this builder already generated from this
   *  agent (the `blueprint.sourceAgentId` jsonb-stamp match) — the
   *  resolve-or-reuse idempotency check, mirroring resolveListingSource's
   *  `sourceListingId` match. */
  findTemplateBySourceAgentId: (orgId: string, agentId: string) => Promise<AgentTemplate | null>;
  /** Existing template slugs for this builder (to resolve a unique slug for
   *  the newly-generated template, exactly like createAgentTemplate). */
  listSlugs: (orgId: string) => Promise<string[]>;
  /** Insert the generated agent_templates row and return it. */
  insert: (values: NewAgentTemplate) => Promise<AgentTemplate>;
};

function buildDefaultResolveAgentAsTemplateDeps(): ResolveAgentAsTemplateDeps {
  return {
    findAgentInOrg: async (orgId, agentId) => {
      const { db } = await import("@/db");
      const { agents } = await import("@/db/schema/agents");
      const { and, eq } = await import("drizzle-orm");
      const rows = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.orgId, orgId)))
        .limit(1);
      return rows[0] ?? null;
    },
    findTemplateBySourceAgentId: async (orgId, agentId) => {
      const { db } = await import("@/db");
      const { agentTemplates } = await import("@/db/schema/agent-templates");
      const { and, eq, sql } = await import("drizzle-orm");
      const rows = await db
        .select()
        .from(agentTemplates)
        .where(
          and(
            eq(agentTemplates.builderOrgId, orgId),
            sql`${agentTemplates.blueprint} ->> 'sourceAgentId' = ${agentId}`,
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },
    // Reuse createAgentTemplate's own default deps for the slug/insert seams —
    // they operate on the same agentTemplates table with the same signatures.
    ...buildDefaultCreateDeps(),
  };
}

/**
 * Resolve-or-create the agent_templates row that represents a workspace agent
 * as a deploy source (the product-gap fix — see buildTemplateFromAgent's doc
 * comment for the full "why"). Org-scoped: `agentId` is looked up ONLY within
 * `orgId` — a cross-org id (an agent belonging to a different workspace)
 * resolves to `null`, identical to a nonexistent id, so the caller (the
 * route's resolveTemplateSource) reports the SAME `template_not_found` either
 * way and never leaks cross-org existence.
 *
 * Idempotent: a repeat call for the same (orgId, agentId) reuses the template
 * already stamped with `blueprint.sourceAgentId === agentId` instead of
 * generating a duplicate on every "deploy it" call.
 */
export async function resolveAgentAsTemplate(
  orgId: string,
  agentId: string,
  deps?: Partial<ResolveAgentAsTemplateDeps>,
): Promise<AgentTemplate | null> {
  const defaults = buildDefaultResolveAgentAsTemplateDeps();
  const findAgentInOrg = deps?.findAgentInOrg ?? defaults.findAgentInOrg;
  const findTemplateBySourceAgentId = deps?.findTemplateBySourceAgentId ?? defaults.findTemplateBySourceAgentId;
  const listSlugs = deps?.listSlugs ?? defaults.listSlugs;
  const insert = deps?.insert ?? defaults.insert;

  const agent = await findAgentInOrg(orgId, agentId);
  if (!agent) return null;

  const existingTemplate = await findTemplateBySourceAgentId(orgId, agentId);
  if (existingTemplate) return existingTemplate;

  const args = buildTemplateFromAgent(agent);
  const existingSlugs = await listSlugs(orgId);
  const slug = resolveUniqueTemplateSlug(args.name, existingSlugs);

  return insert({ ...args, slug });
}

// ─── patch merge ─────────────────────────────────────────────────────────────

/** The blueprint fields the template editor may patch. Mirrors the
 *  voice-receptionist editor's editable surface (greeting / script / FAQ /
 *  voice / quoteRanges), expressed as a Partial<AgentBlueprint>. `connectors`
 *  carries the Studio MCP connector picker's bindings (#3) onto the template
 *  blueprint; the runtime seam reads it identically to the agent-scoped path. */
export type TemplateBlueprintPatch = Partial<
  Pick<
    AgentBlueprint,
    | "greeting"
    | "customSkillMd"
    | "faq"
    | "voice"
    | "capabilities"
    | "quoteRanges"
    | "connectors"
    // What FIRES the agent (unified agent model P1). Carries blueprint.trigger
    // through the same save path (zod-validated in schema.ts, persisted by the
    // generic mergeTemplateBlueprint loop). Lets the Studio trigger picker + the
    // event-triggered starters (review-requester / speed-to-lead) set it.
    | "trigger"
  >
> & {
  // The L2 VERIFY rubric + L3 GUARDRAILS (agent-loop safety primitives). Carried
  // through the same save path so the Studio "Guardrails & quality" card can
  // OVERRIDE the per-skill smart defaults (defaultRubricForSkill /
  // defaultGuardrailsForSkill). Declared HERE (not in the Pick above) so they can
  // additionally accept `null`: editor convention (outbound-UX F5) is that a `null`
  // means "clear the override" — mergeTemplateBlueprint DELETES the key so the
  // runtime default applies fresh again; an absent key leaves it untouched.
  verify?: AgentBlueprint["verify"] | null;
  guardrails?: AgentBlueprint["guardrails"] | null;
};

/**
 * Merge-patch a template blueprint. Pure (no DB). Object-level shallow merge —
 * arrays (faq / capabilities) are REPLACED, not concatenated (the editor sends
 * the full set it wants), identical to lib/agents/store.ts updateAgentBlueprint.
 * `undefined` patch fields are ignored so a partial save never clobbers an
 * existing value with undefined.
 *
 * `null` is the explicit CLEAR signal (outbound-UX F5): a patch field set to
 * `null` DELETES that key from the blueprint, so a previously-saved override
 * (e.g. `guardrails` / `verify`) is removed and the per-skill runtime default
 * applies again. This differs from `undefined` (which is a no-op) on purpose: a
 * partial save omits keys it doesn't touch, but flipping "Use smart defaults"
 * back ON must actively wipe the stored override, not merely skip it.
 */
export function mergeTemplateBlueprint(
  current: AgentBlueprint,
  patch: TemplateBlueprintPatch,
): AgentBlueprint {
  const next: AgentBlueprint = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) {
      // Explicit clear — remove the override so the runtime default reapplies.
      delete (next as Record<string, unknown>)[key];
      continue;
    }
    (next as Record<string, unknown>)[key] = value;
  }
  return next;
}

// ─── injectable deps ─────────────────────────────────────────────────────────

export type CreateAgentTemplateDeps = {
  /** Existing slugs for this builder (to resolve a unique slug). */
  listSlugs: (builderOrgId: string) => Promise<string[]>;
  /** Insert an agent_templates row and return it. */
  insert: (values: NewAgentTemplate) => Promise<AgentTemplate>;
};

export type ListAgentTemplatesDeps = {
  list: (builderOrgId: string) => Promise<AgentTemplate[]>;
};

export type GetAgentTemplateDeps = {
  findById: (id: string) => Promise<AgentTemplate | null>;
};

export type UpdateAgentTemplateDeps = {
  findById: (id: string) => Promise<AgentTemplate | null>;
  update: (id: string, patch: Partial<NewAgentTemplate>) => Promise<AgentTemplate | null>;
};

// ─── default DB-backed deps (lazy — never imported in unit tests) ─────────────

function buildDefaultCreateDeps(): CreateAgentTemplateDeps {
  return {
    listSlugs: async (builderOrgId) => {
      const { db } = await import("@/db");
      const { agentTemplates } = await import("@/db/schema/agent-templates");
      const { eq } = await import("drizzle-orm");
      const rows = await db
        .select({ slug: agentTemplates.slug })
        .from(agentTemplates)
        .where(eq(agentTemplates.builderOrgId, builderOrgId));
      return rows.map((r) => r.slug);
    },
    insert: async (values) => {
      const { db } = await import("@/db");
      const { agentTemplates } = await import("@/db/schema/agent-templates");
      const [created] = await db.insert(agentTemplates).values(values).returning();
      if (!created) throw new Error("agent_templates insert returned no row");
      return created;
    },
  };
}

function buildDefaultListDeps(): ListAgentTemplatesDeps {
  return {
    list: async (builderOrgId) => {
      const { db } = await import("@/db");
      const { agentTemplates } = await import("@/db/schema/agent-templates");
      const { desc, eq } = await import("drizzle-orm");
      return db
        .select()
        .from(agentTemplates)
        .where(eq(agentTemplates.builderOrgId, builderOrgId))
        .orderBy(desc(agentTemplates.updatedAt));
    },
  };
}

function buildDefaultGetDeps(): GetAgentTemplateDeps {
  return {
    findById: async (id) => {
      const { db } = await import("@/db");
      const { agentTemplates } = await import("@/db/schema/agent-templates");
      const { eq } = await import("drizzle-orm");
      const rows = await db
        .select()
        .from(agentTemplates)
        .where(eq(agentTemplates.id, id))
        .limit(1);
      return rows[0] ?? null;
    },
  };
}

function buildDefaultUpdateDeps(): UpdateAgentTemplateDeps {
  const get = buildDefaultGetDeps();
  return {
    findById: get.findById,
    update: async (id, patch) => {
      const { db } = await import("@/db");
      const { agentTemplates } = await import("@/db/schema/agent-templates");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db
        .update(agentTemplates)
        .set(patch)
        .where(eq(agentTemplates.id, id))
        .returning();
      return updated ?? null;
    },
  };
}

// ─── public API ──────────────────────────────────────────────────────────────

export type CreateAgentTemplateInput = {
  builderOrgId: string;
  name: string;
  type: AgentTemplateType;
  deps?: Partial<CreateAgentTemplateDeps>;
};

/**
 * Create a new agent template (status 'draft') for a builder. Generates a
 * per-builder-unique slug and seeds a sensible DEFAULT voice_receptionist
 * blueprint (the same defaults a voice-receptionist agent gets today). Returns
 * the created row.
 */
export async function createAgentTemplate(
  input: CreateAgentTemplateInput,
): Promise<AgentTemplate> {
  const name = input.name.trim();
  if (!input.builderOrgId) throw new Error("builderOrgId is required");
  if (name.length < 2) throw new Error("name must be at least 2 chars");

  const defaults = buildDefaultCreateDeps();
  const listSlugs = input.deps?.listSlugs ?? defaults.listSlugs;
  const insert = input.deps?.insert ?? defaults.insert;

  const existing = await listSlugs(input.builderOrgId);
  const slug = resolveUniqueTemplateSlug(name, existing);
  const blueprint = buildDefaultTemplateBlueprint(input.type);

  const values: NewAgentTemplate = {
    builderOrgId: input.builderOrgId,
    name,
    slug,
    type: input.type,
    blueprint,
    status: "draft" satisfies AgentTemplateStatus,
  };

  return insert(values);
}

/** List a builder's templates, most-recently-updated first. */
export async function listAgentTemplates(
  builderOrgId: string,
  deps?: Partial<ListAgentTemplatesDeps>,
): Promise<AgentTemplate[]> {
  const list = deps?.list ?? buildDefaultListDeps().list;
  return list(builderOrgId);
}

/** Fetch a single template by id, or null. */
export async function getAgentTemplate(
  id: string,
  deps?: Partial<GetAgentTemplateDeps>,
): Promise<AgentTemplate | null> {
  const findById = deps?.findById ?? buildDefaultGetDeps().findById;
  return findById(id);
}

export type UpdateAgentTemplateInput = {
  id: string;
  /** Merge-patch onto the existing blueprint (greeting / customSkillMd / faq /
   *  voice / capabilities). Arrays are replaced, not merged. */
  patch: TemplateBlueprintPatch;
  deps?: Partial<UpdateAgentTemplateDeps>;
};

export type UpdateAgentTemplateResult =
  | { ok: true; template: AgentTemplate }
  | { ok: false; error: "template_not_found" | "update_failed" };

/**
 * Merge-patch a template's blueprint and persist. Loads the row, shallow-merges
 * the patch onto blueprint (mergeTemplateBlueprint), writes blueprint +
 * updatedAt. Does NOT change status or eval_score (those are later-task
 * concerns). Returns the updated row.
 */
export async function updateAgentTemplate(
  input: UpdateAgentTemplateInput,
): Promise<UpdateAgentTemplateResult> {
  const defaults = buildDefaultUpdateDeps();
  const findById = input.deps?.findById ?? defaults.findById;
  const update = input.deps?.update ?? defaults.update;

  const existing = await findById(input.id);
  if (!existing) return { ok: false, error: "template_not_found" };

  const nextBlueprint = mergeTemplateBlueprint(
    (existing.blueprint ?? {}) as AgentBlueprint,
    input.patch,
  );

  const updated = await update(input.id, {
    blueprint: nextBlueprint,
    updatedAt: new Date(),
  });
  if (!updated) return { ok: false, error: "update_failed" };

  return { ok: true, template: updated };
}
