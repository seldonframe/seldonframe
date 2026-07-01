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
  DeploymentCalendarRef,
  DeploymentClientContact,
  DeploymentClientContext,
  DeploymentStatus,
  DeploymentSurface,
  NewDeployment,
} from "@/db/schema/deployments";
import type { AgentTemplate } from "@/db/schema/agent-templates";
import type { BookingPolicy } from "@/lib/agents/booking/booking-policy";
import { bookingPolicyFromIntake } from "@/lib/agents/booking/booking-policy";
import type { DeploymentCustomization } from "@/lib/agents/persona/deployment-customization";
import {
  isDeploymentStatus,
  isDeploymentSurface,
  isOutboundDeployment,
  deploymentNeedsNumber,
} from "./margin";

// ─── blueprint capability probes (client-card copy signals) ──────────────────

/** A booking capability slug — its presence in blueprint.capabilities means the
 *  agent can BOOK. Mirrors the runtime tool id (lib/agents/tools.ts). */
const BOOKING_CAPABILITY = "book_appointment";

/** True iff the template blueprint gives the agent a booking capability. Pure +
 *  shape-tolerant (jsonb): a non-array `capabilities` → false. */
function blueprintBooks(blueprint: { capabilities?: unknown } | null): boolean {
  const caps = blueprint?.capabilities;
  return Array.isArray(caps) && caps.includes(BOOKING_CAPABILITY);
}

/** True iff the agent POSTS to a channel: it's flagged action-only (a poster/
 *  logger that sends no customer message) OR it binds a social connector (Postiz).
 *  Pure + shape-tolerant (jsonb). */
function blueprintPosts(
  blueprint: { connectors?: unknown; actionOnly?: unknown } | null,
): boolean {
  if (blueprint?.actionOnly === true) return true;
  const connectors = blueprint?.connectors;
  if (!Array.isArray(connectors)) return false;
  return connectors.some(
    (c) =>
      c && typeof c === "object" && (c as { id?: unknown }).id === "postiz",
  );
}

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
      const { organizations } = await import("@/db/schema/organizations");
      const { desc, eq, sql } = await import("drizzle-orm");
      // Left-join the template so the Clients screen can show which agent each
      // client runs. Template is onDelete:'restrict', so it's effectively never
      // null, but we tolerate null defensively.
      //
      // ICP-3 (Open client + Vertical): ALSO left-join the client workspace
      // (organizations on clientOrgId) to carry its URL slug + Soul industry. One
      // extra join — no N+1 getSoul per client — surfaces both the "Open client →"
      // target and the "Vertical" badge. clientOrgId is null for un-activated
      // drafts, so both columns come back null then (the card omits the link and
      // shows "—"); `soul->>'industry'` is a cheap jsonb text extract that yields
      // null when the soul is absent or has no industry.
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
          // The template's trigger + type drive the inbound-vs-outbound decision
          // on the Clients card (isOutboundDeployment): outbound agents share the
          // client's number, so the card hides the get-a-number / phone step.
          templateType: agentTemplates.type,
          templateBlueprint: agentTemplates.blueprint,
          clientOrgId: deployments.clientOrgId,
          clientSlug: organizations.slug,
          clientVertical: sql<string | null>`${organizations.soul} ->> 'industry'`,
          portalInvitedAt: deployments.portalInvitedAt,
          bookingMode: deployments.bookingMode,
          calendarRef: deployments.calendarRef,
          bookingPolicy: deployments.bookingPolicy,
          customization: deployments.customization,
        })
        .from(deployments)
        .leftJoin(
          agentTemplates,
          eq(deployments.agentTemplateId, agentTemplates.id),
        )
        .leftJoin(
          organizations,
          eq(deployments.clientOrgId, organizations.id),
        )
        .where(eq(deployments.builderOrgId, builderOrgId))
        .orderBy(desc(deployments.updatedAt));
      return rows.map((r) => {
        const { templateType, templateBlueprint, ...rest } = r;
        const blueprint = (templateBlueprint ?? null) as {
          trigger?: unknown;
          capabilities?: unknown;
          connectors?: unknown;
          actionOnly?: unknown;
        } | null;
        const templateTrigger = blueprint?.trigger ?? null;
        return {
          ...rest,
          templateName: r.templateName ?? null,
          // ICP-3 (Open client + Vertical): pass the joined slug through as-is
          // (null when no workspace), and NORMALIZE the vertical — trim it and
          // collapse a blank to null so the card's "—" fallback is consistent
          // (an empty-string industry never renders as a blank badge).
          clientSlug: r.clientSlug ?? null,
          clientVertical: normalizeVertical(r.clientVertical),
          // Carry the legacy surface + the raw blueprint trigger so the Clients
          // card can resolve a precise per-agent trigger LABEL (triggerLabel),
          // while keeping the rest of the blueprint off the wire.
          templateType: templateType ?? null,
          templateTrigger,
          // Resolve the inbound/outbound flag here (pure) so the card stays dumb.
          isOutbound: isOutboundDeployment(templateTrigger, templateType),
          // P2.1-T3: whether the deployed agent needs its OWN dedicated number on
          // activation. TRUE for an inbound receptionist AND for a missed-call
          // agent (event-triggered but it forwards-in + texts-back). FALSE for a
          // pure-outbound review/social/digest agent. The card uses this to pick
          // the get-a-number form vs. the no-phone activate button.
          needsNumber: deploymentNeedsNumber(templateTrigger, templateType),
          // P2.1-T3 (copy fix): the two blueprint signals the card's outbound-note
          // copy keys off — does the agent BOOK (a booking capability) and/or POST
          // (a social/Postiz connector, or it's action-only). Resolved here (pure)
          // so the card stays dumb; the rest of the blueprint stays off the wire.
          agentBooks: blueprintBooks(blueprint),
          agentPosts: blueprintPosts(blueprint),
        };
      });
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
  /** An explicit per-client booking policy. When provided it is persisted as-is
   *  and WINS over the intake-derived seed (the "already set" case). When absent
   *  the store seeds it from the captured clientContext hours (see below). */
  bookingPolicy?: Partial<BookingPolicy> | null;
  /** An initial per-client persona/customization captured at deploy time —
   *  today just the Google review link for a review-requester agent
   *  (`customization.reviewUrl`). Sparse; collapsed to null when empty so a blank
   *  capture leaves the column null (→ the template's defaults). The agency can
   *  still edit it later from the client card (setDeploymentCustomizationAction). */
  customization?: Partial<DeploymentCustomization> | null;
  /** ATTACH-TO-EXISTING-CLIENT (F3). When set, the new deployment row is created
   *  pointing at this EXISTING client workspace (org) instead of leaving
   *  clientOrgId null. Because provisionClientWorkspaceForDeployment is idempotent
   *  (no-ops when clientOrgId is already set), the attach path never spawns a
   *  duplicate client workspace or buys a second number — the agent just joins the
   *  client, reusing its soul / business details / number. The ACTION layer is
   *  responsible for proving this id belongs to the builder's agency (it is
   *  intersected against listClientOrgsForAgency before reaching the store); the
   *  store trusts a pre-validated id here. Absent → today's "new client" behavior
   *  (clientOrgId null, provisioned on activation). */
  existingClientOrgId?: string | null;
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

  // Seed the per-client booking policy from the captured intake hours, UNLESS an
  // explicit policy was passed (which wins — the "already set" case). The seed is
  // a sparse Partial<BookingPolicy> derived purely from clientContext.soul
  // .business_hours (weekday window only); resolveBookingPolicy merges it over the
  // template default at runtime. Collapses to null when nothing parses so a blank
  // capture leaves the column null (→ template/system defaults), never {}.
  const bookingPolicy = resolveSeededBookingPolicy(
    input.bookingPolicy,
    clientContext,
  );

  // Initial per-client customization (today: the review link). Collapse an empty
  // object to null so a blank capture leaves the column null (→ template defaults),
  // never a stored {}. A blank/whitespace reviewUrl is dropped too.
  const customization = normalizeCustomization(input.customization);

  // Attach-to-existing-client (F3): a pre-validated existing clientOrgId is
  // written onto the row at create time so the idempotent provisioner no-ops on
  // activation (no duplicate workspace, no second number). A blank/whitespace id
  // collapses to undefined → today's "new client" path (clientOrgId stays null).
  const existingClientOrgId = normalizeExistingClientOrgId(input.existingClientOrgId);

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
    bookingPolicy,
    // Only set when something non-empty was captured (else the column stays null).
    ...(customization ? { customization } : {}),
    // Attach path only — null (omitted) for a new client; provisioning fills it
    // on activation. Set here only when attaching to an existing client workspace.
    ...(existingClientOrgId ? { clientOrgId: existingClientOrgId } : {}),
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
 * Normalize an initial per-client customization captured at create time. Today
 * the deploy flow only sets `reviewUrl` (the review-requester's Google link); we
 * trim it and drop a blank, returning null when nothing usable remains (so a
 * blank capture leaves the column null → the template's defaults, never a stored
 * {}). Other persona fields (greeting / voiceId / businessInfo / …) are passed
 * through verbatim when present — they're shape-bounded at the action boundary
 * (CreateDeploymentSchema does not yet accept them, so in practice only reviewUrl
 * arrives here today, but this stays forward-compatible). Pure; never throws. */
export function normalizeCustomization(
  customization: Partial<DeploymentCustomization> | null | undefined,
): Partial<DeploymentCustomization> | null {
  if (!customization || typeof customization !== "object") return null;
  const out: Partial<DeploymentCustomization> = {};
  for (const [key, value] of Object.entries(customization)) {
    if (key === "reviewUrl") {
      const v = typeof value === "string" ? value.trim() : "";
      if (v) out.reviewUrl = v;
      continue;
    }
    // Pass through any other present field verbatim (forward-compat). Skip
    // null/undefined so we never persist an explicit-null mid-object.
    if (value !== null && value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
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

/**
 * Resolve the booking_policy column value at create time:
 *   - an EXPLICIT policy (non-empty Partial) is persisted as-is and wins (the
 *     "already set" case the seed must not clobber);
 *   - otherwise it is SEEDED from the captured client context's hours via
 *     bookingPolicyFromIntake (weekday window only);
 *   - collapses to `null` when neither yields a usable field, so a blank capture
 *     leaves the column null (→ template/system defaults), never `{}`.
 * Pure.
 */
export function resolveSeededBookingPolicy(
  explicit: Partial<BookingPolicy> | null | undefined,
  clientContext: DeploymentClientContext | undefined,
): Partial<BookingPolicy> | null {
  if (explicit && Object.keys(explicit).length > 0) return explicit;
  const seeded = bookingPolicyFromIntake(clientContext ?? null);
  return Object.keys(seeded).length > 0 ? seeded : null;
}

/**
 * Normalize the attach-to-existing-client id: trim, and collapse a blank /
 * non-string value to undefined so an empty selection falls back to the "new
 * client" path (clientOrgId stays null). Pure. The id's OWNERSHIP (does this org
 * belong to the builder's agency?) is enforced at the action layer, not here.
 */
export function normalizeExistingClientOrgId(
  id: string | null | undefined,
): string | undefined {
  if (typeof id !== "string") return undefined;
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Decide the deploy's client mode from the (optional) requested existing-client
 * id and the agency's OWN set of client-org ids (the allow-list). Pure — the
 * action resolves the allow-list from listClientOrgsForAgency, then calls this:
 *
 *   - no id              → { mode: "new" }            (create a fresh client; today's default)
 *   - id ∈ allowed       → { mode: "attach", clientOrgId }  (join the existing client)
 *   - id ∉ allowed       → { mode: "error", error: "client_not_found" }
 *
 * The ∉-allowed case is a HARD reject (never silently fall back to creating a new
 * client) so a stale/foreign id can't (a) write into an org outside the agency or
 * (b) quietly resurrect the duplicate-client bug. Mirrors the intersect guard in
 * deployAgentTemplateToClientsAction.
 */
export type ResolveDeploymentClientMode =
  | { mode: "new" }
  | { mode: "attach"; clientOrgId: string }
  | { mode: "error"; error: "client_not_found" };

export function resolveDeploymentClientMode(
  requestedClientOrgId: string | null | undefined,
  allowedClientOrgIds: Iterable<string>,
): ResolveDeploymentClientMode {
  const requested = normalizeExistingClientOrgId(requestedClientOrgId);
  if (!requested) return { mode: "new" };
  const allowed = allowedClientOrgIds instanceof Set
    ? allowedClientOrgIds
    : new Set(allowedClientOrgIds);
  if (!allowed.has(requested)) return { mode: "error", error: "client_not_found" };
  return { mode: "attach", clientOrgId: requested };
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
  /** The template's legacy `type`/surface (null if the join missed) — the
   *  back-compat input to resolveAgentTrigger when no explicit trigger is stored. */
  templateType: string | null;
  /** The template's raw `blueprint.trigger` (loose jsonb; null when unset). The
   *  Clients card resolves a precise per-agent label from it
   *  (resolveAgentTrigger → triggerLabel). Off-wire blueprint stays off-wire — only
   *  the trigger sub-object is carried. */
  templateTrigger: unknown;
  /** The provisioned client workspace (front-office bridge) — gates the portal
   *  invite toggle (disabled until set). Null = not provisioned. */
  clientOrgId: string | null;
  /** ICP-3 (Open client) — the provisioned client workspace's URL slug, joined
   *  from organizations on clientOrgId. Drives the "Open client →" link on the
   *  client card (→ /clients/<slug>/ready, the same agency-side workspace hub the
   *  sidebar/topbar switcher targets). Null when the client has no workspace yet
   *  (un-activated draft) — the card then omits the link. */
  clientSlug: string | null;
  /** ICP-3 (Vertical) — the client's industry/vertical, read cheaply from the
   *  client org's Soul (`soul->>'industry'`) in the same join. Null/blank when the
   *  client has no workspace yet or the soul has no industry set — the card
   *  fail-softs to "—". */
  clientVertical: string | null;
  /** When the client was invited to portal access (null = never). */
  portalInvitedAt: Date | null;
  /** How the deployed agent books (native | external_link | api_mcp | cal_com).
   *  The Clients card shows the "Connect calendar" affordance only for api_mcp. */
  bookingMode: BookingMode;
  /** The client's external-calendar binding (Composio Google/Outlook), set once
   *  the calendar-connect callback persists it. Null = not yet connected; the
   *  card reads `calendarRef.accountId` to decide connected vs. not. */
  calendarRef: DeploymentCalendarRef | null;
  /** The per-client booking-policy override (sparse Partial<BookingPolicy>) —
   *  null = no override (→ template/system defaults). The Clients card seeds the
   *  BookingPolicyEditor with `resolveBookingPolicy(this, null, undefined)`. */
  bookingPolicy: Partial<BookingPolicy> | null;
  /** The per-client agent-persona override (greeting / voiceId / businessInfo) —
   *  null = no override (→ the template's defaults). The Clients card seeds the
   *  DeploymentCustomizationEditor directly with this value. */
  customization: Partial<DeploymentCustomization> | null;
  /** True iff the deployed agent is OUTBOUND (its template's trigger is
   *  event/schedule — review-requester, speed-to-lead, …). Outbound agents send
   *  from the CLIENT org's existing number (sendSmsFromApi) and never claim their
   *  own line, so the Clients card hides the get-a-number / phone-required step
   *  and the spoken-persona editor for them. Resolved purely in listDeployments
   *  from the joined template's blueprint trigger (isOutboundDeployment). */
  isOutbound: boolean;
  /** P2.1-T3 — True iff the deployed agent needs its OWN dedicated number on
   *  activation: an inbound receptionist OR a missed-call agent (event-triggered
   *  but it forwards-in + texts-back). The card routes these through the
   *  get-a-number form; pure-outbound agents (needsNumber:false) get the no-phone
   *  activate button. Resolved purely from the trigger (deploymentNeedsNumber). */
  needsNumber: boolean;
  /** P2.1-T3 (copy fix) — True iff the agent has a booking capability
   *  (blueprint.capabilities ∋ book_appointment). Drives the outbound-note copy. */
  agentBooks: boolean;
  /** P2.1-T3 (copy fix) — True iff the agent posts to a channel (action-only, or a
   *  social/Postiz connector). Drives the outbound-note copy. */
  agentPosts: boolean;
};

/** An EXISTING client the builder can attach a new agent to (F3). Derived purely
 *  from the builder's deployments, grouped by the provisioned clientOrgId. */
export type AttachableClient = {
  /** The provisioned client workspace (org) id — written onto the new deployment
   *  row so the agent attaches instead of spawning a duplicate client. */
  clientOrgId: string;
  /** Display name (the most recent deployment's clientName for this org). */
  clientName: string;
  /** The client's existing line, if any agent on it already holds one (inbound
   *  receptionist). Null when no attached agent owns a number. Surfaced read-only
   *  so the operator sees the new agent will SHARE it (no second number bought). */
  phoneNumber: string | null;
  /** The agents already running for this client (template names), for context. */
  agentNames: string[];
};

/**
 * Group a builder's deployments into the set of EXISTING clients a new agent can
 * ATTACH to (F3). A client is attachable once it has a provisioned `clientOrgId`
 * (its workspace exists) and is not canceled. One entry per clientOrgId, carrying
 * the display name, any existing phone number (so the UI shows the shared line),
 * and the names of agents already on it. Most-recently-updated client first
 * (input order is assumed newest-first, matching listDeployments). Pure.
 *
 * Deployments without a clientOrgId (never activated → no workspace yet) are
 * skipped: there's nothing to attach to, and the duplicate-client bug only
 * happens when a real workspace already exists.
 */
export function groupAttachableClients(
  deployments: Pick<
    DeploymentListItem,
    "clientOrgId" | "clientName" | "phoneNumber" | "templateName" | "status"
  >[],
): AttachableClient[] {
  const byOrg = new Map<string, AttachableClient>();
  for (const d of deployments) {
    const clientOrgId = d.clientOrgId;
    if (!clientOrgId) continue; // no workspace yet → nothing to attach to
    if (d.status === "canceled") continue; // a canceled client isn't a live target
    let entry = byOrg.get(clientOrgId);
    if (!entry) {
      entry = {
        clientOrgId,
        clientName: d.clientName,
        phoneNumber: d.phoneNumber ?? null,
        agentNames: [],
      };
      byOrg.set(clientOrgId, entry);
    }
    // First non-null number wins (input is newest-first → the latest live line).
    if (!entry.phoneNumber && d.phoneNumber) entry.phoneNumber = d.phoneNumber;
    const name = d.templateName?.trim();
    if (name && !entry.agentNames.includes(name)) entry.agentNames.push(name);
  }
  return [...byOrg.values()];
}

/** ICP-3 (Vertical) — normalize a client's industry/vertical for display: trim
 *  and collapse a blank / non-string to null so the Clients card fail-softs to
 *  "—" consistently (never a blank badge). Pure. */
export function normalizeVertical(vertical: string | null | undefined): string | null {
  if (typeof vertical !== "string") return null;
  const trimmed = vertical.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** One client on the Clients screen (F4): the client identity + number shown
 *  ONCE in the card header, plus every agent (deployment) running for it. */
export type ClientGroup = {
  /** Stable grouping key — the clientOrgId when provisioned, else a `name:<slug>`
   *  derived from the normalized client name (so un-provisioned drafts for the
   *  same client still collapse into one card). Used as the React key. */
  clientKey: string;
  /** Display name shown in the card header (the most-recent deployment's name). */
  clientName: string;
  /** The provisioned client workspace (org) id, or null if no agent on this
   *  client has been activated yet. */
  clientOrgId: string | null;
  /** ICP-3 (Open client) — the client workspace's URL slug, surfaced once on the
   *  group (first non-null across the client's agents wins, mirroring clientOrgId).
   *  Drives the "Open client →" link (→ /clients/<slug>/ready). Null until the
   *  client has a provisioned workspace — the card omits the link then. */
  clientSlug: string | null;
  /** ICP-3 (Vertical) — the client's industry/vertical from its Soul, surfaced
   *  once (first non-null across the client's agents wins). Null when unknown; the
   *  card fail-softs to "—". */
  clientVertical: string | null;
  /** The client's shared line, if any agent on it holds one (the inbound
   *  receptionist). Null when no agent owns a number. Shown once in the header. */
  number: string | null;
  /** Every deployment (agent) for this client, preserving input order
   *  (newest-first), each addressable by its own id for per-agent actions. */
  agents: DeploymentListItem[];
};

/** Normalize a client name into a stable grouping token: trim, lower-case, and
 *  collapse internal whitespace. Used only to derive a fallback key when a client
 *  has no provisioned clientOrgId yet (so two drafts named "Acme  Plumbing" and
 *  "acme plumbing" still group). Pure. */
function normalizeClientNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Group a builder's deployments into ONE entry per CLIENT for the Clients screen
 * (F4). A client is identified by its provisioned `clientOrgId` when set; before
 * activation (no workspace yet) deployments fall back to a key derived from the
 * normalized client name, so a client with several agents shows a single card
 * either way. Each group carries the client name + shared number (surfaced once
 * in the header) and the full list of its agents (each still addressable by its
 * own deployment id, so per-agent pause/cancel/activate stay correctly targeted).
 *
 * Order is STABLE and preserves the input order (listDeployments is newest-first):
 * a client appears at the position of its first (most-recent) deployment, and the
 * agents within a group keep that same newest-first order. Pure — no DB, no
 * filtering (canceled agents still belong to their client's card, unlike the
 * attach picker which drops them).
 */
export function groupDeploymentsByClient(
  deployments: DeploymentListItem[],
): ClientGroup[] {
  const byKey = new Map<string, ClientGroup>();
  for (const d of deployments) {
    // Prefer the provisioned org id; otherwise fall back to the normalized name
    // so un-activated drafts for the same client still collapse into one card.
    const key = d.clientOrgId
      ? `org:${d.clientOrgId}`
      : `name:${normalizeClientNameKey(d.clientName)}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        clientKey: key,
        clientName: d.clientName,
        clientOrgId: d.clientOrgId ?? null,
        clientSlug: d.clientSlug ?? null,
        clientVertical: d.clientVertical ?? null,
        number: d.phoneNumber ?? null,
        agents: [],
      };
      byKey.set(key, group);
    }
    // First non-null clientOrgId wins (a later activation fills what an earlier
    // draft row lacked), so the header can offer portal/attach affordances.
    if (!group.clientOrgId && d.clientOrgId) group.clientOrgId = d.clientOrgId;
    // ICP-3 — first non-null slug / vertical wins too (same "a later activated
    // row fills what an earlier draft lacked" rule), so the card can offer the
    // "Open client →" link + the vertical badge as soon as ANY of the client's
    // agents carries a provisioned workspace.
    if (!group.clientSlug && d.clientSlug) group.clientSlug = d.clientSlug;
    if (!group.clientVertical && d.clientVertical) group.clientVertical = d.clientVertical;
    // First non-null number wins (input is newest-first → the latest live line).
    if (!group.number && d.phoneNumber) group.number = d.phoneNumber;
    group.agents.push(d);
  }
  return [...byKey.values()];
}

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
  /** The client's external-calendar binding (Composio Google/Outlook). Set by the
   *  gated calendar-connect callback after OAuth; null clears it. Deliberately NOT
   *  accepted by CreateDeploymentSchema — only this gated writer sets it. */
  calendarRef: DeploymentCalendarRef | null;
  /** How the deployed agent books (native | external_link | api_mcp | cal_com).
   *  Set by the calendar-connect callback (via calendarConnectPatch) to flip
   *  native/unset → 'api_mcp' once a real calendar is connected, so
   *  book_appointment routes to the connected calendar instead of silently
   *  staying native. */
  bookingMode: BookingMode;
  /** The per-client booking policy (slot length / hours / buffer / lead time /
   *  required fields) — a sparse Partial<BookingPolicy> merged over the template
   *  default by resolveBookingPolicy. Set by the gated setBookingPolicyAction;
   *  null clears it (→ template/system defaults). Persisted verbatim — the engine
   *  clamps any malformed stored value at read time. */
  bookingPolicy: Partial<BookingPolicy> | null;
  /** The per-client agent-persona override (greeting / TTS voiceId / businessInfo
   *  that fills the template's `{placeholders}`) — a sparse
   *  Partial<DeploymentCustomization> resolved over the template default by
   *  resolveDeploymentPersona. Set by the gated setDeploymentCustomizationAction;
   *  null clears it (→ the template's defaults). Persisted verbatim. */
  customization: Partial<DeploymentCustomization> | null;
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
  if (p.calendarRef !== undefined) {
    patch.calendarRef = p.calendarRef;
  }
  if (p.bookingMode !== undefined) {
    patch.bookingMode = p.bookingMode;
  }
  if (p.bookingPolicy !== undefined) {
    patch.bookingPolicy = p.bookingPolicy;
  }
  if (p.customization !== undefined) {
    patch.customization = p.customization;
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

// ─── loadDeploymentCustomizationForOrgTemplate ───────────────────────────────

/**
 * Load the per-client `customization` (Partial<DeploymentCustomization>) for the
 * deployment of `agentTemplateId` that serves `orgId`, or null if none.
 *
 * This is the runtime seam the event-agent path (review-requester) uses to read a
 * client's OWN review link off their deployment. The firing org is the CLIENT org
 * (a `booking.completed` resolves orgId from the booking row → the client
 * workspace), but a template-in-the-agency-org case fires with the BUILDER org;
 * so we match a deployment whose `agentTemplateId` is this template AND whose
 * `clientOrgId` OR `builderOrgId` is the firing org. The PRECISE per-client match
 * (`clientOrgId === orgId`) is preferred over the agency-org match — so a builder
 * org that both owns the template AND has provisioned clients still reads the
 * RIGHT client's link — then most-recently-updated within that tier (an org rarely
 * runs two deployments of the SAME template, but if it does the live one's link is
 * the right one). Returns the raw jsonb customization (the caller resolves
 * precedence vs. the template default via `resolveReviewUrl`). Lazy DB import;
 * never used in unit tests (DI'd there).
 */
export async function loadDeploymentCustomizationForOrgTemplate(
  orgId: string,
  agentTemplateId: string,
): Promise<Partial<DeploymentCustomization> | null> {
  if (!orgId || !agentTemplateId) return null;
  const { db } = await import("@/db");
  const { deployments } = await import("@/db/schema/deployments");
  const { and, desc, eq, or, sql } = await import("drizzle-orm");
  const [row] = await db
    .select({ customization: deployments.customization })
    .from(deployments)
    .where(
      and(
        eq(deployments.agentTemplateId, agentTemplateId),
        or(
          eq(deployments.clientOrgId, orgId),
          eq(deployments.builderOrgId, orgId),
        ),
      ),
    )
    // Prefer the precise client match (0) over the agency-org match (1), then the
    // most-recently-updated within that tier.
    .orderBy(
      sql`CASE WHEN ${deployments.clientOrgId} = ${orgId} THEN 0 ELSE 1 END`,
      desc(deployments.updatedAt),
    )
    .limit(1);
  return row?.customization ?? null;
}

// ─── scheduled-agent deployments (P2.1-T1: the schedule cron runtime) ─────────
//
// The schedule cron (/api/cron/schedule-agents) enumerates ACTIVE deployments
// whose template's `blueprint.trigger.kind === "schedule"` and fires runEventAgent
// for each one that's due. These two helpers are its data layer: the enumerate
// query + the per-deployment `lastFiredAt` stamp. Lazy DB imports (real path
// only) — the orchestration (runDueScheduledAgents) is DI'd + unit-tested with no
// Postgres.

/**
 * The reserved key under the deployment's `customization` jsonb where the
 * schedule cron stamps the last-fired time (ISO string). Stored HERE (rather than
 * a new column) so the idempotency guard needs NO migration — the deployments
 * table has no generic metadata jsonb, and `customization` is already loaded by
 * listDeployments. The `_`-prefix + this constant mark it as runtime-internal:
 * resolveDeploymentPersona only reads the typed persona fields (greeting/voiceId/
 * …) and ignores unknown keys, so this never leaks into the agent's persona.
 */
export const SCHEDULE_LAST_FIRED_KEY = "_scheduleLastFiredAt";

/**
 * List the ACTIVE deployments whose deployed template is a SCHEDULE agent —
 * `resolveAgentTrigger(blueprint.trigger, template.type).kind === "schedule"` —
 * each resolved to the shape the cron orchestration consumes:
 *   { deploymentId, orgId, agentKey, cron, tz, lastFiredAt }
 *
 * `orgId` is the org the agent runs FOR: the provisioned client workspace
 * (clientOrgId) when present, else the builder/agency org — the SAME org
 * runEventAgent grounds in. `tz` is that org's `organizations.timezone`. `cron`
 * is `blueprint.trigger.cron`. `lastFiredAt` is read off
 * `customization[SCHEDULE_LAST_FIRED_KEY]` (the idempotency stamp; null if never
 * fired / not a string).
 *
 * Only `status = 'active'` deployments are considered (a draft/paused/canceled
 * agent must not fire). A deployment whose template join missed, whose trigger
 * isn't a schedule, or whose cron is blank is dropped. Returns [] when there are
 * none. Lazy DB import; DI'd in unit tests via runDueScheduledAgents' `list`.
 */
export async function listScheduledAgentDeployments(): Promise<
  import("@/lib/agents/triggers/schedule-agents").ScheduledAgentDeployment[]
> {
  const { db } = await import("@/db");
  const { deployments } = await import("@/db/schema/deployments");
  const { agentTemplates } = await import("@/db/schema/agent-templates");
  const { organizations } = await import("@/db/schema/organizations");
  const { resolveAgentTrigger } = await import("@/lib/agents/triggers/agent-trigger");
  const { and, eq } = await import("drizzle-orm");

  // Active deployments + their template's trigger/type + the org tz. The org we
  // resolve tz for (and run as) is clientOrgId ?? builderOrgId — joined below via
  // COALESCE-style resolution in JS (a SQL coalesce join on two FK targets is
  // awkward), so we select both the client-org tz and the builder-org tz and pick.
  const rows = await db
    .select({
      deploymentId: deployments.id,
      builderOrgId: deployments.builderOrgId,
      clientOrgId: deployments.clientOrgId,
      agentTemplateId: deployments.agentTemplateId,
      customization: deployments.customization,
      templateType: agentTemplates.type,
      templateBlueprint: agentTemplates.blueprint,
    })
    .from(deployments)
    .innerJoin(agentTemplates, eq(deployments.agentTemplateId, agentTemplates.id))
    .where(eq(deployments.status, "active"));

  if (rows.length === 0) return [];

  // Resolve the run-org per row (clientOrgId ?? builderOrgId) and batch-load each
  // distinct org's timezone in ONE query (avoid N round-trips).
  const orgIds = Array.from(
    new Set(rows.map((r) => r.clientOrgId ?? r.builderOrgId).filter(Boolean)),
  ) as string[];
  const tzByOrg = new Map<string, string>();
  if (orgIds.length > 0) {
    const { inArray } = await import("drizzle-orm");
    const tzRows = await db
      .select({ id: organizations.id, timezone: organizations.timezone })
      .from(organizations)
      .where(inArray(organizations.id, orgIds));
    for (const t of tzRows) {
      tzByOrg.set(t.id, typeof t.timezone === "string" && t.timezone.trim() ? t.timezone.trim() : "UTC");
    }
  }

  const out: import("@/lib/agents/triggers/schedule-agents").ScheduledAgentDeployment[] = [];
  for (const r of rows) {
    const trigger = resolveAgentTrigger(
      (r.templateBlueprint as { trigger?: unknown } | null)?.trigger as Parameters<
        typeof resolveAgentTrigger
      >[0],
      r.templateType,
    );
    if (trigger.kind !== "schedule") continue;
    const cron = typeof trigger.cron === "string" ? trigger.cron.trim() : "";
    if (!cron) continue;

    const orgId = r.clientOrgId ?? r.builderOrgId;
    const tz = tzByOrg.get(orgId) ?? "UTC";
    const lastFiredRaw = (r.customization as Record<string, unknown> | null)?.[
      SCHEDULE_LAST_FIRED_KEY
    ];
    const lastFiredAt = typeof lastFiredRaw === "string" ? lastFiredRaw : null;

    out.push({
      deploymentId: r.deploymentId,
      orgId,
      agentKey: r.agentTemplateId,
      cron,
      tz,
      lastFiredAt,
    });
  }
  return out;
}

/**
 * Stamp a deployment's schedule `lastFiredAt` (the cron's idempotency guard) into
 * its `customization` jsonb under SCHEDULE_LAST_FIRED_KEY — NO migration (the
 * deployments table has no generic metadata column). Reads the current
 * customization, merges the new ISO stamp over it (preserving every persona
 * field), and writes it back. Best-effort: the caller (runDueScheduledAgents)
 * swallows a throw and counts it (a missed stamp only risks a re-fire next tick,
 * which the window guard + the agent's own throttle/guardrails contain). Lazy DB
 * import (real path only).
 */
export async function markDeploymentScheduleFired(
  deploymentId: string,
  firedAt: Date,
): Promise<void> {
  if (!deploymentId) return;
  const { db } = await import("@/db");
  const { deployments } = await import("@/db/schema/deployments");
  const { eq } = await import("drizzle-orm");

  const [row] = await db
    .select({ customization: deployments.customization })
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .limit(1);

  const current = (row?.customization ?? {}) as Record<string, unknown>;
  const next = { ...current, [SCHEDULE_LAST_FIRED_KEY]: firedAt.toISOString() };

  await db
    .update(deployments)
    .set({
      customization: next as Partial<DeploymentCustomization>,
      updatedAt: new Date(),
    })
    .where(eq(deployments.id, deploymentId));
}

// ─── listSfManagedDeploymentsForRent (Task 7 — the monthly rent cron) ───────

/** One row the rent cron plans against — see planMonthlyRent
 *  (lib/telephony/rent-planner.ts). */
export type SfManagedRentDeployment = {
  deploymentId: string;
  orgId: string;
  delinquentSince: string | null;
};

/**
 * List every ACTIVE deployment whose number was acquired via the SF-managed
 * (Tier 0) path — `status = 'active' AND numberOrigin = 'sf_managed'` — with
 * its builder orgId and current `delinquentSince` marker, for the monthly
 * rent cron's planMonthlyRent input. Mirrors listScheduledAgentDeployments's
 * shape (a plain `where` filter, lazy DB import, no DI — this runs only from
 * the cron route). Reuses getDelinquentSince (delinquency.ts) to read the
 * reserved customization key so both call sites agree on ONE parsing rule.
 * Returns [] when there are none.
 */
export async function listSfManagedDeploymentsForRent(): Promise<SfManagedRentDeployment[]> {
  const { db } = await import("@/db");
  const { deployments } = await import("@/db/schema/deployments");
  const { and, eq } = await import("drizzle-orm");
  const { getDelinquentSince } = await import("@/lib/telephony/delinquency");

  const rows = await db
    .select({
      id: deployments.id,
      builderOrgId: deployments.builderOrgId,
      customization: deployments.customization,
    })
    .from(deployments)
    .where(and(eq(deployments.status, "active"), eq(deployments.numberOrigin, "sf_managed")));

  return rows.map((r) => ({
    deploymentId: r.id,
    orgId: r.builderOrgId,
    delinquentSince: getDelinquentSince({ customization: r.customization }),
  }));
}
