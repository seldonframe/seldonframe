// Marketplace buyer onboarding — the buyer→DEPLOYMENT seam.
//
// A marketplace BUYER purchases ONE agent and runs it on SeldonFrame infra. The
// existing install path clones the listing's blueprint into a buyer-owned
// `agent_templates` row (an editable template). But a buyer needs a RUNNABLE
// agent — a phone, a calendar binding, a go-live — which is exactly the
// `deployments` model (deployment = a template's tenant config + activation).
//
// So a buyer purchase resolves to a buyer-OWNED deployment of the listing's
// blueprint. We reuse the deployment model verbatim: the deployment's
// `builderOrgId` is the BUYER's org (they own + run it), `agentTemplateId`
// points at the buyer's cloned template, and `status` starts 'draft' (the
// existing "captured intent, not yet activated" state — there is no 'setup'
// status on the table; 'draft' IS the pre-activation state, and go-live flips it
// to 'active'). The empty onboarding progress rides `customization` jsonb (no
// migration — see deployment-customization.ts).
//
// Layering (repo convention): a PURE planner (planBuyerDeployment) + DI'd
// functions over injected deps, with lazy DB-backed defaults that the unit tests
// never import. No Postgres, no Stripe, no Twilio here.

import type { CreateDeploymentInput } from "@/lib/deployments/store";
import type { Deployment, DeploymentSurface } from "@/db/schema/deployments";
import type { AgentTemplate } from "@/db/schema/agent-templates";
import type { AgentBlueprint } from "@/db/schema/agents";
import {
  buildOnboardingSteps,
  normalizeBlueprintForOnboarding,
  type OnboardingStep,
} from "@/lib/marketplace/onboarding/steps";
import {
  emptyProgress,
  firstIncompleteStep,
  type OnboardingProgress,
} from "@/lib/marketplace/onboarding/progress";

// ─── inputs ──────────────────────────────────────────────────────────────────

/** The subset of a kind:'agent' marketplace listing the buyer seam reads. */
export type BuyerListing = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  agentType: string | null;
  agentBlueprint: AgentBlueprint | null;
};

export type PlanBuyerDeploymentInput = {
  /** The buyer's org — they OWN the deployment (deployment.builderOrgId). */
  buyerOrgId: string;
  /** The purchased listing (kind:'agent'). */
  listing: BuyerListing;
  /** The buyer's cloned `agent_templates.id` the deployment points at (FK,
   *  NOT NULL). The caller clones the listing blueprint into the buyer org first
   *  (the existing install primitive) and passes the new id here. */
  agentTemplateId: string;
};

// ─── planBuyerDeployment (pure) ──────────────────────────────────────────────

/** Map a template type → the deployment surface it's reached on. A voice agent
 *  answers a PHONE; a chat agent is embedded. Mirrors the deployment surface
 *  vocabulary (phone | embed | link | sms | email), distinct from the agent's
 *  channel. */
function surfaceForAgentType(agentType: string | null | undefined): DeploymentSurface {
  return agentType === "chat_assistant" ? "embed" : "phone";
}

/**
 * Produce the `CreateDeploymentInput` for a buyer-owned deployment of a listing.
 * Pure — no DB. The buyer org owns it; it starts draft (createDeployment forces
 * 'draft'); the surface is derived from the listing's agentType; and an EMPTY
 * onboarding progress is seeded on `customization` so the wizard resumes from
 * step one. `clientName` falls back to the listing name (a deployment row
 * requires a name; the buyer edits their business name in the business_info
 * step).
 */
export function planBuyerDeployment(
  input: PlanBuyerDeploymentInput,
): CreateDeploymentInput {
  const clientName = (input.listing.name ?? "").trim() || "My agent";
  return {
    builderOrgId: input.buyerOrgId,
    agentTemplateId: input.agentTemplateId,
    clientName,
    surface: surfaceForAgentType(input.listing.agentType),
    // Seed an empty resumable progress on the existing customization jsonb (no
    // migration). createDeployment passes it through normalizeCustomization.
    customization: { onboardingProgress: emptyProgress() },
  };
}

// ─── resolveOrCreateBuyerDeployment (DI'd, idempotent) ───────────────────────

export type ResolveBuyerDeploymentDeps = {
  /** The buyer's EXISTING deployment for this listing, if any (idempotency: one
   *  deployment per buyer+listing). Null when none. */
  findExistingForListing: (args: {
    buyerOrgId: string;
    listingId: string;
  }) => Promise<Deployment | null>;
  /** Create the deployment row (wraps the existing createDeployment store fn). */
  createDeployment: (input: CreateDeploymentInput) => Promise<Deployment>;
};

export type ResolveBuyerDeploymentResult =
  | { ok: true; deployment: Deployment; created: boolean }
  | { ok: false; error: "invalid_input" | "not_agent_listing" };

/**
 * Resolve (or create) the buyer-owned deployment for a purchased agent listing.
 * IDEMPOTENT: if the buyer already has a deployment for this listing, return it
 * unchanged (no second create) — so a re-purchase / a webhook re-delivery / a
 * free re-install never spawns a duplicate. Otherwise plan + create one.
 *
 * DI'd over the store so it unit-tests with a fake. Validates the listing is an
 * agent listing and the buyer org is present; returns a typed error otherwise
 * (never throws for a bad input).
 */
export async function resolveOrCreateBuyerDeployment(
  input: PlanBuyerDeploymentInput,
  deps: ResolveBuyerDeploymentDeps,
): Promise<ResolveBuyerDeploymentResult> {
  const buyerOrgId = (input.buyerOrgId ?? "").trim();
  if (!buyerOrgId || !input.agentTemplateId) {
    return { ok: false, error: "invalid_input" };
  }
  if (input.listing.kind !== "agent") {
    return { ok: false, error: "not_agent_listing" };
  }

  const existing = await deps.findExistingForListing({
    buyerOrgId,
    listingId: input.listing.id,
  });
  if (existing) {
    return { ok: true, deployment: existing, created: false };
  }

  const createInput = planBuyerDeployment({ ...input, buyerOrgId });
  const deployment = await deps.createDeployment(createInput);
  return { ok: true, deployment, created: true };
}

// ─── getBuyerAgent (org-scoped read for the wizard + home) ───────────────────

export type GetBuyerAgentDeps = {
  findDeploymentById: (id: string) => Promise<Deployment | null>;
  findTemplateById: (id: string) => Promise<AgentTemplate | null>;
};

/** What the buyer's setup wizard + "My Agent" home read: the deployment, its
 *  effective blueprint, the computed step list, the saved progress, and the
 *  resume point. */
export type BuyerAgentView = {
  deployment: Deployment;
  blueprint: AgentBlueprint;
  steps: OnboardingStep[];
  progress: OnboardingProgress;
  /** The first incomplete step (resume point), or null when fully set up. */
  nextStep: OnboardingStep | null;
};

/** Read the saved onboarding progress off a deployment's customization jsonb,
 *  coercing a malformed/absent value to an empty progress. */
function readProgress(deployment: Deployment): OnboardingProgress {
  const raw = deployment.customization?.onboardingProgress;
  if (raw && Array.isArray(raw.doneKinds)) return { doneKinds: raw.doneKinds };
  return emptyProgress();
}

/**
 * Load a buyer's agent (deployment) for the wizard / home, ORG-SCOPED to the
 * buyer. Returns null when the deployment doesn't exist OR isn't owned by this
 * buyer org (a 404 to anyone else — the tenant-isolation invariant). DI'd over
 * the store so it unit-tests with a fake.
 *
 * The blueprint is read from the buyer's cloned template (the deployment points
 * at it); the step list is computed from the listing's agentType-derived surface
 * + the blueprint's connectors. Falls back to the deployment's own surface when
 * the template is missing (defensive — the FK makes that effectively impossible).
 */
export async function getBuyerAgent(
  deploymentId: string,
  buyerOrgId: string,
  deps: GetBuyerAgentDeps,
): Promise<BuyerAgentView | null> {
  const deployment = await deps.findDeploymentById(deploymentId);
  // ORG-SCOPE: the deployment must exist AND be owned by this buyer.
  if (!deployment || deployment.builderOrgId !== buyerOrgId) return null;

  const template = await deps.findTemplateById(deployment.agentTemplateId);
  const blueprint: AgentBlueprint = template?.blueprint ?? {};
  // Derive the surface from the template type when present; else infer from the
  // deployment's surface ('embed' → chat, anything else → voice).
  const agentType =
    template?.type ?? (deployment.surface === "embed" ? "chat_assistant" : "voice_receptionist");

  const normalized = normalizeBlueprintForOnboarding(agentType, blueprint);
  const steps = buildOnboardingSteps(normalized);
  const progress = readProgress(deployment);
  const nextStep = firstIncompleteStep(steps, progress);

  return { deployment, blueprint, steps, progress, nextStep };
}

// ─── lazy DB-backed default deps (never imported in unit tests) ──────────────

/** The real store deps for resolveOrCreateBuyerDeployment. Lazy `import("@/db")`
 *  so unit tests never touch Postgres. Idempotency: the buyer's deployment for a
 *  listing is found by matching the source listing id stamped on the cloned
 *  template's blueprint (`sourceListingId`) — the same jsonb-stamp idempotency
 *  the agency multi-deploy uses (`sourceTemplateId`). */
export function buildDefaultResolveBuyerDeploymentDeps(): ResolveBuyerDeploymentDeps {
  return {
    findExistingForListing: async ({ buyerOrgId, listingId }) => {
      const { db } = await import("@/db");
      const { deployments } = await import("@/db/schema/deployments");
      const { agentTemplates } = await import("@/db/schema/agent-templates");
      const { and, eq, sql } = await import("drizzle-orm");
      // A buyer deployment whose template was cloned from THIS listing. We join
      // the buyer's template and match the listing id stamped in its blueprint.
      const rows = await db
        .select({ deployment: deployments })
        .from(deployments)
        .innerJoin(agentTemplates, eq(agentTemplates.id, deployments.agentTemplateId))
        .where(
          and(
            eq(deployments.builderOrgId, buyerOrgId),
            eq(agentTemplates.builderOrgId, buyerOrgId),
            sql`${agentTemplates.blueprint} ->> 'sourceListingId' = ${listingId}`,
          ),
        )
        .limit(1);
      return rows[0]?.deployment ?? null;
    },
    createDeployment: async (input) => {
      const { createDeployment } = await import("@/lib/deployments/store");
      const result = await createDeployment(input);
      if (!result.ok) {
        throw new Error(`buyer deployment create failed: ${result.error}`);
      }
      return result.deployment;
    },
  };
}

/** The real store deps for getBuyerAgent. Lazy `import("@/db")`. */
export function buildDefaultGetBuyerAgentDeps(): GetBuyerAgentDeps {
  return {
    findDeploymentById: async (id) => {
      const { db } = await import("@/db");
      const { deployments } = await import("@/db/schema/deployments");
      const { eq } = await import("drizzle-orm");
      const rows = await db.select().from(deployments).where(eq(deployments.id, id)).limit(1);
      return rows[0] ?? null;
    },
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
  };
}
