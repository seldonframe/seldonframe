// ICP-3 — deployments data layer (the builder's "deploy a template to an SMB").
//
// A "deployment" is a LITE TENANT: an SMB client the builder serves who NEVER
// logs into SeldonFrame. It's just a `deployments` row owned by the builder
// (builderOrgId), pointing at one of the builder's agent TEMPLATES
// (agentTemplateId). Creating one here only writes a `draft` row — the phone
// number provisioning (Twilio), the voice runtime, and the billing
// (Stripe) are LATER, GATED steps. So `createDeployment` captures intent
// (client, surface, price) and nothing more; `status` stays 'draft' until those
// gated steps activate it.
//
// Mirrors lib/agent-templates/store.ts exactly: all DB access is behind
// injectable `deps` (lazy `import("@/db")`) so the unit tests run with no
// Postgres, and the pure helpers live in margin.ts (TDD'd in isolation). NO
// Twilio, NO Stripe, NO voice runtime, NO live LLM calls.

import type {
  Deployment,
  DeploymentClientContact,
  DeploymentStatus,
  DeploymentSurface,
  NewDeployment,
} from "@/db/schema/deployments";
import type { AgentTemplate } from "@/db/schema/agent-templates";
import { isDeploymentStatus, isDeploymentSurface } from "./margin";

// ─── injectable deps (lazy DB — never imported in unit tests) ─────────────────

export type CreateDeploymentDeps = {
  /** Load the template being deployed (to validate ownership). */
  findTemplateById: (id: string) => Promise<AgentTemplate | null>;
  /** Insert a deployments row and return it. */
  insert: (values: NewDeployment) => Promise<Deployment>;
};

export type ListDeploymentsDeps = {
  /** A builder's deployments, joined with the template name for display. */
  list: (builderOrgId: string) => Promise<DeploymentListItem[]>;
};

export type GetDeploymentDeps = {
  findById: (id: string) => Promise<Deployment | null>;
};

export type UpdateDeploymentDeps = {
  findById: (id: string) => Promise<Deployment | null>;
  update: (
    id: string,
    patch: Partial<NewDeployment>,
  ) => Promise<Deployment | null>;
};

// ─── default DB-backed deps (lazy — never imported in unit tests) ─────────────

function buildDefaultCreateDeps(): CreateDeploymentDeps {
  return {
    findTemplateById: async (id) => {
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
    insert: async (values) => {
      const { db } = await import("@/db");
      const { deployments } = await import("@/db/schema/deployments");
      const [created] = await db.insert(deployments).values(values).returning();
      if (!created) throw new Error("deployments insert returned no row");
      return created;
    },
  };
}

function buildDefaultListDeps(): ListDeploymentsDeps {
  return {
    list: async (builderOrgId) => {
      const { db } = await import("@/db");
      const { deployments } = await import("@/db/schema/deployments");
      const { agentTemplates } = await import("@/db/schema/agent-templates");
      const { desc, eq } = await import("drizzle-orm");
      // Left-join the template so the Clients screen can show which agent each
      // client runs. Template is onDelete:'restrict', so it's effectively never
      // null, but we tolerate null defensively.
      const rows = await db
        .select({
          id: deployments.id,
          builderOrgId: deployments.builderOrgId,
          agentTemplateId: deployments.agentTemplateId,
          clientName: deployments.clientName,
          clientContact: deployments.clientContact,
          surface: deployments.surface,
          phoneNumber: deployments.phoneNumber,
          priceCents: deployments.priceCents,
          status: deployments.status,
          createdAt: deployments.createdAt,
          updatedAt: deployments.updatedAt,
          templateName: agentTemplates.name,
        })
        .from(deployments)
        .leftJoin(
          agentTemplates,
          eq(deployments.agentTemplateId, agentTemplates.id),
        )
        .where(eq(deployments.builderOrgId, builderOrgId))
        .orderBy(desc(deployments.updatedAt));
      return rows.map((r) => ({
        ...r,
        templateName: r.templateName ?? null,
      }));
    },
  };
}

function buildDefaultGetDeps(): GetDeploymentDeps {
  return {
    findById: async (id) => {
      const { db } = await import("@/db");
      const { deployments } = await import("@/db/schema/deployments");
      const { eq } = await import("drizzle-orm");
      const rows = await db
        .select()
        .from(deployments)
        .where(eq(deployments.id, id))
        .limit(1);
      return rows[0] ?? null;
    },
  };
}

function buildDefaultUpdateDeps(): UpdateDeploymentDeps {
  const get = buildDefaultGetDeps();
  return {
    findById: get.findById,
    update: async (id, patch) => {
      const { db } = await import("@/db");
      const { deployments } = await import("@/db/schema/deployments");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db
        .update(deployments)
        .set(patch)
        .where(eq(deployments.id, id))
        .returning();
      return updated ?? null;
    },
  };
}

// ─── createDeployment ────────────────────────────────────────────────────────

export type CreateDeploymentInput = {
  builderOrgId: string;
  agentTemplateId: string;
  clientName: string;
  clientContact?: DeploymentClientContact;
  /** 'phone' | 'embed' | 'link'. Defaults to 'phone'. */
  surface?: DeploymentSurface;
  /** What the SMB pays per month, in cents. Defaults to 0. */
  priceCents?: number;
  deps?: Partial<CreateDeploymentDeps>;
};

export type CreateDeploymentResult =
  | { ok: true; deployment: Deployment }
  | { ok: false; error: "unauthorized" | "template_not_found" | "invalid_input" };

/**
 * Create a new deployment (a lite-tenant SMB client) for a builder, in `draft`
 * status. Validates the template belongs to the builder (ownership guard —
 * mirrors agent-templates/actions.ts), then inserts. Does NOT provision a phone
 * number, start the voice runtime, or create any Stripe billing — those are
 * later, gated steps; the row stays `draft` until then.
 *
 * Returns the created row (the action layer maps it to just the id).
 */
export async function createDeployment(
  input: CreateDeploymentInput,
): Promise<CreateDeploymentResult> {
  const builderOrgId = input.builderOrgId;
  const clientName = (input.clientName ?? "").trim();
  if (!builderOrgId) return { ok: false, error: "unauthorized" };
  if (clientName.length < 2) return { ok: false, error: "invalid_input" };

  // Surface defaults to phone; reject an unknown surface defensively.
  const surface: DeploymentSurface = input.surface ?? "phone";
  if (!isDeploymentSurface(surface)) return { ok: false, error: "invalid_input" };

  const priceCents = Math.max(0, Math.round(input.priceCents ?? 0));

  const defaults = buildDefaultCreateDeps();
  const findTemplateById = input.deps?.findTemplateById ?? defaults.findTemplateById;
  const insert = input.deps?.insert ?? defaults.insert;

  // Ownership guard: the template must exist AND belong to this builder.
  const template = await findTemplateById(input.agentTemplateId);
  if (!template || template.builderOrgId !== builderOrgId) {
    return { ok: false, error: "template_not_found" };
  }

  // Drop empty contact fields so we never persist {} or whitespace-only values.
  const clientContact = normalizeClientContact(input.clientContact);

  const values: NewDeployment = {
    builderOrgId,
    agentTemplateId: input.agentTemplateId,
    clientName,
    clientContact,
    surface,
    priceCents,
    // Draft only — provisioning + billing activate this later (gated).
    status: "draft" satisfies DeploymentStatus,
  };

  const deployment = await insert(values);
  return { ok: true, deployment };
}

/** Trim contact fields, drop blanks, return undefined if nothing remains. Pure. */
export function normalizeClientContact(
  contact: DeploymentClientContact | undefined,
): DeploymentClientContact | undefined {
  if (!contact) return undefined;
  const out: DeploymentClientContact = {};
  const phone = contact.phone?.trim();
  const email = contact.email?.trim();
  const address = contact.address?.trim();
  if (phone) out.phone = phone;
  if (email) out.email = email;
  if (address) out.address = address;
  return Object.keys(out).length > 0 ? out : undefined;
}

// ─── listDeployments ─────────────────────────────────────────────────────────

/** A deployment row enriched with the template name for the Clients screen. */
export type DeploymentListItem = {
  id: string;
  builderOrgId: string;
  agentTemplateId: string;
  clientName: string;
  clientContact: DeploymentClientContact | null;
  surface: string;
  phoneNumber: string | null;
  priceCents: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  /** The deployed template's display name (null if the join missed). */
  templateName: string | null;
};

/** List a builder's deployments, most-recently-updated first, with template name. */
export async function listDeployments(
  builderOrgId: string,
  deps?: Partial<ListDeploymentsDeps>,
): Promise<DeploymentListItem[]> {
  const list = deps?.list ?? buildDefaultListDeps().list;
  return list(builderOrgId);
}

// ─── getDeployment ───────────────────────────────────────────────────────────

/** Fetch a single deployment by id, or null. */
export async function getDeployment(
  id: string,
  deps?: Partial<GetDeploymentDeps>,
): Promise<Deployment | null> {
  const findById = deps?.findById ?? buildDefaultGetDeps().findById;
  return findById(id);
}

// ─── updateDeployment ────────────────────────────────────────────────────────

/** The deployment fields callers may patch. Provisioning/billing fields
 *  (phoneNumber, phoneNumberSid, numberOrigin, stripe*) are intentionally
 *  writable here because the gated tasks (number provisioning, billing) flip
 *  them. status is validated against the allow-list.
 *
 *  phoneNumberSid + numberOrigin are persisted by the Phase-2 provisioning /
 *  release actions: provision writes the Twilio PN… SID + numberOrigin
 *  'provisioned'; cancel nulls them after releasing the number. */
export type DeploymentPatch = Partial<{
  clientName: string;
  clientContact: DeploymentClientContact | null;
  surface: DeploymentSurface;
  priceCents: number;
  status: DeploymentStatus;
  phoneNumber: string | null;
  phoneNumberSid: string | null;
  numberOrigin: string | null;
}>;

export type UpdateDeploymentInput = {
  id: string;
  patch: DeploymentPatch;
  deps?: Partial<UpdateDeploymentDeps>;
};

export type UpdateDeploymentResult =
  | { ok: true; deployment: Deployment }
  | { ok: false; error: "deployment_not_found" | "invalid_input" | "update_failed" };

/**
 * Patch a deployment and persist (bumps updatedAt). Loads the row first, then
 * writes only the provided fields. Validates surface/status against the
 * allow-lists. Does NOT itself provision/bill — it's a plain writer the gated
 * tasks reuse.
 */
export async function updateDeployment(
  input: UpdateDeploymentInput,
): Promise<UpdateDeploymentResult> {
  const defaults = buildDefaultUpdateDeps();
  const findById = input.deps?.findById ?? defaults.findById;
  const update = input.deps?.update ?? defaults.update;

  const existing = await findById(input.id);
  if (!existing) return { ok: false, error: "deployment_not_found" };

  const patch: Partial<NewDeployment> = { updatedAt: new Date() };
  const p = input.patch;

  if (p.clientName !== undefined) {
    const name = p.clientName.trim();
    if (name.length < 2) return { ok: false, error: "invalid_input" };
    patch.clientName = name;
  }
  if (p.clientContact !== undefined) {
    patch.clientContact = p.clientContact === null
      ? null
      : (normalizeClientContact(p.clientContact) ?? null);
  }
  if (p.surface !== undefined) {
    if (!isDeploymentSurface(p.surface)) return { ok: false, error: "invalid_input" };
    patch.surface = p.surface;
  }
  if (p.priceCents !== undefined) {
    patch.priceCents = Math.max(0, Math.round(p.priceCents));
  }
  if (p.status !== undefined) {
    if (!isDeploymentStatus(p.status)) return { ok: false, error: "invalid_input" };
    patch.status = p.status;
  }
  if (p.phoneNumber !== undefined) {
    patch.phoneNumber = p.phoneNumber;
  }
  if (p.phoneNumberSid !== undefined) {
    patch.phoneNumberSid = p.phoneNumberSid;
  }
  if (p.numberOrigin !== undefined) {
    patch.numberOrigin = p.numberOrigin;
  }

  const updated = await update(input.id, patch);
  if (!updated) return { ok: false, error: "update_failed" };
  return { ok: true, deployment: updated };
}
