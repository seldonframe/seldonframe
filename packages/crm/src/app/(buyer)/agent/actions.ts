"use server";

// Marketplace buyer surface — the buyer's setup-wizard server actions.
//
// Thin, org-scoped writers over the existing deployment store. The buyer OWNS
// their deployment (the buyer→deployment seam sets `deployment.builderOrgId =
// buyerOrgId`), so the same ownership guard the agency actions use —
// `existing.builderOrgId === orgId` — authorizes the buyer here.
//
// Why these write through `updateDeployment` directly rather than calling
// `setDeploymentCustomizationAction` / `setBookingPolicyAction`:
//   - The buyer wizard persists `customization.onboardingProgress` and
//     `customization.services`, but the agency-facing `setDeploymentCustomization`
//     zod schema is `.strict()` and accepts ONLY greeting/voiceId/businessInfo/
//     reviewUrl — it would REJECT progress + services. Rather than widen that
//     agency contract, the buyer surface writes the same jsonb shapes
//     (`businessInfo`, `bookingPolicy.hours`, `onboardingProgress`) through the
//     one underlying writer, fully org-guarded. The persona + booking resolvers
//     read those exact fields, so behaviour is identical.
//
// "use server" contract: this file may export ONLY async functions (checked by
// scripts/check-use-server.sh). Pure helpers + types live in
// @/lib/marketplace/buyer/buyer-onboarding (validation, go-live blockers) and
// the step engine modules.

import { revalidatePath } from "next/cache";

import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { getDeployment, updateDeployment } from "@/lib/deployments/store";
import type { Deployment } from "@/db/schema/deployments";
import type { DeploymentCustomization } from "@/lib/agents/persona/deployment-customization";
import {
  markStepDone,
  type OnboardingProgress,
} from "@/lib/marketplace/onboarding/progress";
import {
  buildOnboardingSteps,
  normalizeBlueprintForOnboarding,
  type OnboardingStepKind,
} from "@/lib/marketplace/onboarding/steps";
import {
  goLiveBlockers,
  validateBusinessInfo,
  type BusinessInfoInput,
  type GoLiveBlocker,
} from "@/lib/marketplace/buyer/buyer-onboarding";
import { buyerAgentPath } from "@/lib/marketplace/buyer/buyer-routes";

// ─── shared org-scoped load ──────────────────────────────────────────────────

type LoadedBuyerDeployment =
  | { ok: true; orgId: string; deployment: Deployment }
  | { ok: false; error: "unauthorized" | "not_found" };

/** Resolve the current buyer org and load their deployment, ORG-SCOPED (the
 *  deployment must be owned by the caller's org). The single auth gate every
 *  buyer action shares. */
async function loadOwnedDeployment(
  deploymentId: string,
): Promise<LoadedBuyerDeployment> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };
  const id = (deploymentId ?? "").trim();
  if (!id) return { ok: false, error: "not_found" };
  const deployment = await getDeployment(id);
  if (!deployment || deployment.builderOrgId !== orgId) {
    return { ok: false, error: "not_found" };
  }
  return { ok: true, orgId, deployment };
}

/** Read the saved onboarding progress off a deployment's customization jsonb. */
function readProgress(deployment: Deployment): OnboardingProgress {
  const raw = deployment.customization?.onboardingProgress;
  if (raw && Array.isArray(raw.doneKinds)) return { doneKinds: raw.doneKinds };
  return { doneKinds: [] };
}

/** Recompute the deployment's step list (for the go-live blocker check). Reads
 *  the blueprint off the deployment's template via a lazy DB import, mirroring
 *  the buyer-deployment seam, then runs the same pure engine the wizard uses. */
async function computeSteps(deployment: Deployment) {
  const { db } = await import("@/db");
  const { agentTemplates } = await import("@/db/schema/agent-templates");
  const { eq } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(agentTemplates)
    .where(eq(agentTemplates.id, deployment.agentTemplateId))
    .limit(1);
  const tpl = rows[0] ?? null;
  const agentType =
    tpl?.type ?? (deployment.surface === "embed" ? "chat_assistant" : "voice_receptionist");
  const normalized = normalizeBlueprintForOnboarding(agentType, tpl?.blueprint ?? {});
  return buildOnboardingSteps(normalized);
}

// ─── markStepDoneAction (resumable progress writer) ──────────────────────────

export type MarkStepDoneActionResult =
  | { ok: true; progress: OnboardingProgress }
  | { ok: false; error: "unauthorized" | "not_found" | "update_failed" };

/**
 * Record that the buyer finished a wizard step. Idempotent (marking a kind twice
 * dedups). Persists `customization.onboardingProgress` so the wizard resumes at
 * the exact next step. Org-scoped to the owning buyer.
 */
export async function markStepDoneAction(
  deploymentId: string,
  kind: OnboardingStepKind,
): Promise<MarkStepDoneActionResult> {
  assertWritable();
  const loaded = await loadOwnedDeployment(deploymentId);
  if (!loaded.ok) return loaded;

  const next = markStepDone(readProgress(loaded.deployment), kind);
  const customization: Partial<DeploymentCustomization> = {
    ...(loaded.deployment.customization ?? {}),
    onboardingProgress: next,
  };
  const result = await updateDeployment({
    id: loaded.deployment.id,
    patch: { customization },
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error === "deployment_not_found" ? "not_found" : "update_failed",
    };
  }
  revalidatePath(buyerAgentPath(loaded.deployment.id) ?? "/");
  return { ok: true, progress: next };
}

// ─── saveBusinessInfoAction (business_info step) ─────────────────────────────

export type SaveBusinessInfoActionResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "unauthorized"
        | "not_found"
        | "update_failed"
        | "name_required"
        | "invalid_hours";
    };

/**
 * Persist the business_info step: the business name + what-you-do + hours into
 * `customization.businessInfo` and `customization.services`, the structured
 * Mon–Fri window into `bookingPolicy.hours` (what the booking engine reads), and
 * mark `business_info` done — all in one org-guarded write. Validates via the
 * pure `validateBusinessInfo`.
 */
export async function saveBusinessInfoAction(
  deploymentId: string,
  input: BusinessInfoInput,
): Promise<SaveBusinessInfoActionResult> {
  assertWritable();
  const loaded = await loadOwnedDeployment(deploymentId);
  if (!loaded.ok) return loaded;

  const validated = validateBusinessInfo(input);
  if (!validated.ok) return { ok: false, error: validated.error };
  const v = validated.value;

  const prevCustomization = loaded.deployment.customization ?? {};
  const customization: Partial<DeploymentCustomization> = {
    ...prevCustomization,
    businessInfo: {
      ...(prevCustomization.businessInfo ?? {}),
      name: v.name,
      ...(v.hoursText ? { hours: v.hoursText } : {}),
    },
    services: v.services,
    onboardingProgress: markStepDone(readProgress(loaded.deployment), "business_info"),
  };

  // Merge the structured weekly window into any existing booking policy.
  const bookingPolicy = v.bookingHours
    ? { ...(loaded.deployment.bookingPolicy ?? {}), hours: v.bookingHours }
    : (loaded.deployment.bookingPolicy ?? undefined);

  const result = await updateDeployment({
    id: loaded.deployment.id,
    patch: bookingPolicy
      ? { customization, bookingPolicy }
      : { customization },
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error === "deployment_not_found" ? "not_found" : "update_failed",
    };
  }
  revalidatePath(buyerAgentPath(loaded.deployment.id) ?? "/");
  return { ok: true };
}

// ─── goLiveAction (the go_live step) ─────────────────────────────────────────

export type GoLiveActionResult =
  | { ok: true; agentPath: string }
  | { ok: false; error: "unauthorized" | "not_found" | "update_failed" }
  | { ok: false; error: "blocked"; blockers: GoLiveBlocker[] };

/**
 * Flip the buyer's deployment to `active` — the go-live. Gated ONLY on true
 * blockers: any REQUIRED onboarding step still incomplete (computed via
 * `goLiveBlockers`). Skippable steps never block. Marks `go_live` done and
 * activates in one org-guarded write. Returns the "My Agent" home path to route
 * to on success.
 */
export async function goLiveAction(
  deploymentId: string,
): Promise<GoLiveActionResult> {
  assertWritable();
  const loaded = await loadOwnedDeployment(deploymentId);
  if (!loaded.ok) return loaded;

  const steps = await computeSteps(loaded.deployment);
  const progress = readProgress(loaded.deployment);
  const blockers = goLiveBlockers(steps, progress);
  if (blockers.length > 0) {
    return { ok: false, error: "blocked", blockers };
  }

  const customization: Partial<DeploymentCustomization> = {
    ...(loaded.deployment.customization ?? {}),
    onboardingProgress: markStepDone(progress, "go_live"),
  };
  const result = await updateDeployment({
    id: loaded.deployment.id,
    patch: { status: "active", customization },
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error === "deployment_not_found" ? "not_found" : "update_failed",
    };
  }
  revalidatePath(buyerAgentPath(loaded.deployment.id) ?? "/");
  return { ok: true, agentPath: buyerAgentPath(loaded.deployment.id) ?? "/" };
}
