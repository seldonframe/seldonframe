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
  BookingMode,
  Deployment,
  DeploymentClientContact,
  DeploymentClientContext,
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
          clientOrgId: deployments.clientOrgId,
          portalInvitedAt: deployments.portalInvitedAt,
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
  /** The CLIENT's captured business context (narrow soul + FAQ). Optional —
   *  an empty/absent value persists as null (today's name-only behavior). */
  clientContext?: DeploymentClientContext;
  /** 'phone' | 'embed' | 'link'. Defaults to 'phone'. */
  surface?: DeploymentSurface;
  /** What the SMB pays per month, in cents. Defaults to 0. */
  priceCents?: number;
  /** How the deployed agent books (ICP-3). Defaults to 'native'. */
  bookingMode?: BookingMode;
  /** The client's own booking URL — persisted ONLY for bookingMode
   *  'external_link'; any other mode drops it (never store a stray URL). */
  externalBookingUrl?: string | null;
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
  // Collapse an empty captured context to null so the voice path's
  // "no clientContext → name-only" fallback fires (never persist {}).
  const clientContext = normalizeClientContext(input.clientContext);

  // Booking mode (ICP-3): default native. The booking URL is only meaningful for
  // external_link — for every other mode we store null so a stray URL never
  // lingers on the row (mirrors the contact/context "never store junk" guard).
  const bookingMode: BookingMode = input.bookingMode ?? "native";
  const externalBookingUrl =
    bookingMode === "external_link"
      ? input.externalBookingUrl?.trim() || null
      : null;

  const values: NewDeployment = {
    builderOrgId,
    agentTemplateId: input.agentTemplateId,
    clientName,
    clientContact,
    clientContext,
    surface,
    priceCents,
    bookingMode,
    externalBookingUrl,
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

/**
 * Drop empty branches from a captured client context so an all-blank capture
 * collapses to `undefined` (→ null column → the voice path's name-only
 * fallback). Trims strings, drops blank-named services, drops empty FAQ entries.
 * Returns undefined when nothing usable remains. Pure.
 *
 * Note: input is already shape-validated by ClientContextSchema at the action
 * boundary; this is the persistence-layer "never store {}" guard (mirrors
 * normalizeClientContact) so direct store callers stay honest too.
 */
export function normalizeClientContext(
  ctx: DeploymentClientContext | undefined,
): DeploymentClientContext | undefined {
  if (!ctx || typeof ctx !== "object") return undefined;

  const soulIn = ctx.soul;
  const soulOut: NonNullable<DeploymentClientContext["soul"]> = {};
  if (soulIn && typeof soulIn === "object") {
    const businessName = soulIn.businessName?.trim();
    const businessDescription = soulIn.businessDescription?.trim();
    if (businessName) soulOut.businessName = businessName;
    if (businessDescription) soulOut.businessDescription = businessDescription;

    if (Array.isArray(soulIn.services)) {
      const services = soulIn.services
        .map((s) => {
          const name = s?.name?.trim();
          if (!name) return null;
          const description = s?.description?.trim();
          return description ? { name, description } : { name };
        })
        .filter((s): s is { name: string; description?: string } => s !== null);
      if (services.length > 0) soulOut.services = services;
    }

    if (soulIn.business_hours && typeof soulIn.business_hours === "object") {
      if (Object.keys(soulIn.business_hours).length > 0) {
        soulOut.business_hours = soulIn.business_hours;
      }
    }

    const style = soulIn.voice?.style?.trim();
    if (style) soulOut.voice = { style };
  }

  let faqOut: { q: string; a: string }[] | undefined;
  if (Array.isArray(ctx.faq)) {
    const faq = ctx.faq
      .map((f) => {
        const q = f?.q?.trim();
        const a = f?.a?.trim();
        return q && a ? { q, a } : null;
      })
      .filter((f): f is { q: string; a: string } => f !== null);
    if (faq.length > 0) faqOut = faq;
  }

  const out: DeploymentClientContext = {};
  if (Object.keys(soulOut).length > 0) out.soul = soulOut;
  if (faqOut) out.faq = faqOut;
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
  /** The provisioned client workspace (front-office bridge) — gates the portal
   *  invite toggle (disabled until set). Null = not provisioned. */
  clientOrgId: string | null;
  /** When the client was invited to portal access (null = never). */
  portalInvitedAt: Date | null;
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
  /** The auto-provisioned client workspace (org) this deployment owns. Set by
   *  provisionClientWorkspaceForDeployment on activation; never nulled. */
  clientOrgId: string | null;
  /** When the agency invited the client to portal access. Set by the
   *  portal-invite action; re-invite updates it. */
  portalInvitedAt: Date | null;
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
  if (p.clientOrgId !== undefined) {
    patch.clientOrgId = p.clientOrgId;
  }
  if (p.portalInvitedAt !== undefined) {
    patch.portalInvitedAt = p.portalInvitedAt;
  }

  const updated = await update(input.id, patch);
  if (!updated) return { ok: false, error: "update_failed" };
  return { ok: true, deployment: updated };
}

// ─── agency + client-org helpers (front-office bridge) ───────────────────────
//
// These back the activation-time client-workspace provisioning (provision-
// client-workspace.ts) and archive-on-cancel. Lazy DB imports so unit tests that
// DI the provisioner never touch Neon — these run only on the real action path.

/**
 * Resolve the partner agency owned by a builder org, for white-label branding of
 * its client workspaces, or null if the builder has no agency yet. Mirrors the
 * billing/orgs.ts resolution: load the org's owner user, then find a
 * partner_agencies row owned by that user OR by the workspace itself
 * (polymorphic ownership). Prefers an `active` agency; falls back to any
 * non-archived row (the branding layer itself re-checks status). Best-effort:
 * returns null on any miss so provisioning never fails on branding.
 */
export async function resolveBuilderAgency(
  builderOrgId: string,
): Promise<string | null> {
  const { db } = await import("@/db");
  const { organizations } = await import("@/db/schema/organizations");
  const { partnerAgencies } = await import("@/db/schema/partner-agencies");
  const { and, eq, ne, or } = await import("drizzle-orm");

  const [org] = await db
    .select({ ownerId: organizations.ownerId })
    .from(organizations)
    .where(eq(organizations.id, builderOrgId))
    .limit(1);

  const ownerId = org?.ownerId ?? null;
  // The owner condition: by owner user (claimed builders) OR by the workspace
  // itself (anonymous builders own the agency via ownerWorkspaceId).
  const ownerCondition = ownerId
    ? or(
        eq(partnerAgencies.ownerUserId, ownerId),
        eq(partnerAgencies.ownerWorkspaceId, builderOrgId),
      )
    : eq(partnerAgencies.ownerWorkspaceId, builderOrgId);

  const rows = await db
    .select({ id: partnerAgencies.id, status: partnerAgencies.status })
    .from(partnerAgencies)
    .where(and(ownerCondition, ne(partnerAgencies.status, "archived")));

  if (rows.length === 0) return null;
  // Prefer an active agency; otherwise the first non-archived one.
  const active = rows.find((r) => r.status === "active");
  return (active ?? rows[0]).id;
}

/**
 * Store-level attach: set organizations.parentAgencyId for a client workspace so
 * it inherits the agency's branding. This is the SAME update attachWorkspaceToAgency
 * performs (partner-agencies/store.ts) — but WITHOUT its interactive
 * ownership/tier validation, because here the caller is the server provisioning a
 * workspace it just created (not a user request). Not gated; the agency-creation
 * tier check already happened upstream.
 */
export async function setOrgParentAgency(
  orgId: string,
  agencyId: string,
): Promise<void> {
  const { db } = await import("@/db");
  const { organizations } = await import("@/db/schema/organizations");
  const { eq } = await import("drizzle-orm");
  await db
    .update(organizations)
    .set({ parentAgencyId: agencyId, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}

/** Injectable seams for archiveClientOrg so the patch shape is unit-tested with
 *  no DB. The default `update` does the real organizations UPDATE. */
export type ArchiveClientOrgDeps = {
  update: (id: string, patch: { archivedAt: Date }) => Promise<void>;
};

/**
 * Archive a client workspace on deployment cancel: stamp organizations.archivedAt
 * (data retained — NEVER deleted). The deployment keeps its clientOrgId so the
 * agency can reactivate / hand off later. The `now` clock is injectable for
 * deterministic tests; defaults to new Date. Idempotent in effect (re-archiving
 * just rewrites the timestamp).
 */
export async function archiveClientOrg(
  args: { orgId: string; now?: () => Date },
  deps?: ArchiveClientOrgDeps,
): Promise<void> {
  const at = (args.now ?? (() => new Date()))();
  const update =
    deps?.update ??
    (async (id: string, patch: { archivedAt: Date }) => {
      const { db } = await import("@/db");
      const { organizations } = await import("@/db/schema/organizations");
      const { eq } = await import("drizzle-orm");
      await db
        .update(organizations)
        .set({ archivedAt: patch.archivedAt, updatedAt: new Date() })
        .where(eq(organizations.id, id));
    });
  await update(args.orgId, { archivedAt: at });
}

/**
 * Pure predicate mirroring the SQL `archivedAt IS NULL` filter: an org is ACTIVE
 * (eligible for workspace lists + the billing workspace-count) only when it has
 * not been archived. Lets fixture-level tests assert the exclusion without a DB.
 */
export function isOrgActiveRow(row: { archivedAt: Date | null }): boolean {
  return row.archivedAt == null;
}

/** Load an org's slug (the portal magic-link + booking tools key off it), or
 *  null if the org is gone. Lazy DB import (real path only). */
export async function loadOrgSlug(orgId: string): Promise<string | null> {
  const { db } = await import("@/db");
  const { organizations } = await import("@/db/schema/organizations");
  const { eq } = await import("drizzle-orm");
  const [row] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return row?.slug ?? null;
}

/** The primary contact id in an org for portal-invite addressing: the oldest
 *  contact that has an email. Null when the org has no emailed contact yet (the
 *  caller then falls back to creating one from the captured client email). Lazy
 *  DB import (real path only). */
export async function resolvePrimaryContactIdForOrg(
  orgId: string,
): Promise<string | null> {
  const { db } = await import("@/db");
  const { contacts } = await import("@/db/schema");
  const { and, asc, eq, isNotNull } = await import("drizzle-orm");
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), isNotNull(contacts.email)))
    .orderBy(asc(contacts.createdAt))
    .limit(1);
  return row?.id ?? null;
}

// ─── agency multi-client deploy: enumerate clients + idempotency ─────────────
//
// Back the "deploy a marketplace agent template to many EXISTING client
// workspaces" action. An agency's client workspaces are the organizations whose
// parentAgencyId points at the agency (set when the workspace was attached /
// provisioned) and that are not archived — the same filter
// billing/orgs.ts uses for the agency's active workspace list. Lazy DB imports
// so the real path is the only thing that touches Neon.

/** A client workspace the agency can deploy into. */
export type AgencyClientOrg = {
  id: string;
  name: string;
  slug: string;
};

/**
 * List the agency's EXISTING client workspaces: organizations WHERE
 * parentAgencyId = agencyId AND archivedAt IS NULL, newest first. These are the
 * orgs a marketplace agent template can be deployed into (one live agent each,
 * each grounded by that org's own soul at runtime). Returns [] when the agency
 * has no client workspaces yet (drives the UI's empty state). Lazy DB import.
 */
export async function listClientOrgsForAgency(
  agencyId: string,
): Promise<AgencyClientOrg[]> {
  if (!agencyId) return [];
  const { db } = await import("@/db");
  const { organizations } = await import("@/db/schema/organizations");
  const { and, desc, eq, isNull } = await import("drizzle-orm");
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.parentAgencyId, agencyId),
        isNull(organizations.archivedAt),
      ),
    )
    .orderBy(desc(organizations.createdAt));
  return rows;
}

/**
 * Of the given client org ids, return the SUBSET that already runs an agent
 * created from `templateId` (its blueprint carries sourceTemplateId === the
 * template). This is the idempotency input for planClientDeployments: those
 * clients are skipped on a re-deploy so the agency never gets duplicate agents.
 *
 * Matches on the jsonb `blueprint->>'sourceTemplateId'` text, scoped to the
 * requested orgs so it never scans agents outside the agency. Returns a Set for
 * O(1) membership in the planner. Empty input → empty set (no query). Lazy DB
 * import (real path only).
 */
export async function listClientOrgIdsWithTemplateAgent(
  clientOrgIds: string[],
  templateId: string,
): Promise<Set<string>> {
  const ids = clientOrgIds.filter(Boolean);
  if (ids.length === 0 || !templateId) return new Set();
  const { db } = await import("@/db");
  const { agents } = await import("@/db/schema");
  const { and, inArray, sql } = await import("drizzle-orm");
  const rows = await db
    .selectDistinct({ orgId: agents.orgId })
    .from(agents)
    .where(
      and(
        inArray(agents.orgId, ids),
        sql`${agents.blueprint} ->> 'sourceTemplateId' = ${templateId}`,
      ),
    );
  return new Set(rows.map((r) => r.orgId));
}
