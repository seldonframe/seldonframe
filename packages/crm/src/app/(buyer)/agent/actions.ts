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
import type { AgentBlueprint } from "@/db/schema/agents";
import {
  resolveDeploymentPersona,
  type DeploymentCustomization,
} from "@/lib/agents/persona/deployment-customization";
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

// ─── runBuyerTestTurnAction (the test/"hear it work" step — chat sandbox) ─────

export type BuyerTestTurnInput = {
  /** The chat history so far (plain user/assistant text); the latest user
   *  message is the last element. */
  messages: { role: "user" | "assistant"; content: string }[];
};

export type RunBuyerTestTurnResult =
  | { ok: true; reply: string; toolNotes: string[] }
  | {
      ok: false;
      error:
        | "unauthorized"
        | "not_found"
        | "not_ready"
        | "bad_input"
        | "runtime_error";
      message?: string;
    };

const MAX_BUYER_TEST_MESSAGES = 30;
const MAX_BUYER_TEST_CHARS = 2000;

/** Friendly, customer-safe labels for tools the agent may reach for in the test
 *  (so the buyer sees "checked availability" rather than a raw tool name). */
const BUYER_TOOL_LABELS: Record<string, string> = {
  look_up_availability: "checked availability",
  book_appointment: "would book an appointment",
  find_my_existing_appointment: "looked up an existing appointment",
  reschedule_appointment: "would reschedule",
  cancel_appointment: "would cancel",
  escalate_to_human: "would take a message for you",
  take_message: "would take a message",
  get_quote_range: "looked up a price range",
  provide_faq_answer: "answered from your FAQ",
};

/**
 * Run ONE sandboxed test turn against the BUYER's agent — the "hear it work"
 * step's chat path. MONEY-SAFE by construction: it runs through
 * `runStatelessAgentTurn` with `testMode: true`, so every WRITE tool
 * (book_appointment / take_message / escalate) returns a synthetic result and
 * writes NOTHING, and the turn is NON-persisting (no conversation/booking/
 * message row). No live connectors fire (the sandbox uses native tools only).
 *
 * The agent speaks AS the buyer's business: we build the effective persona from
 * the deployment's customization (`resolveDeploymentPersona` → greeting/script/
 * faq/services) layered onto the template blueprint, name the business via the
 * resolved business name, and ground it in the deployment's captured client soul.
 *
 * Key routing: the turn runs on the BUILDER's (template author's) Anthropic key —
 * the deployment → template → `agentTemplates.builderOrgId` → that org's
 * `getAIClient`. If the builder configured no usable key we return `not_ready`
 * (the agent isn't ready to talk yet) rather than crashing — the buyer can still
 * go live and call the number.
 */
export async function runBuyerTestTurnAction(
  deploymentId: string,
  input: BuyerTestTurnInput,
): Promise<RunBuyerTestTurnResult> {
  assertWritable();
  const loaded = await loadOwnedDeployment(deploymentId);
  if (!loaded.ok) return loaded;

  // Sanitize + bound the incoming history.
  const messages = (Array.isArray(input?.messages) ? input.messages : [])
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    )
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_BUYER_TEST_CHARS) }))
    .filter((m) => m.content.length > 0)
    .slice(-MAX_BUYER_TEST_MESSAGES);
  if (messages.length === 0) {
    return { ok: false, error: "bad_input", message: "No message to send." };
  }

  // Load the template (the source blueprint) AND identify the BUILDER org whose
  // key the deployed agent runs on (NOT the buyer's org).
  const { db } = await import("@/db");
  const { agentTemplates } = await import("@/db/schema/agent-templates");
  const { organizations } = await import("@/db/schema/organizations");
  const { eq } = await import("drizzle-orm");
  const [tpl] = await db
    .select()
    .from(agentTemplates)
    .where(eq(agentTemplates.id, loaded.deployment.agentTemplateId))
    .limit(1);
  const templateBlueprint = (tpl?.blueprint ?? {}) as AgentBlueprint;
  const builderOrgId = tpl?.builderOrgId ?? loaded.deployment.builderOrgId;

  // Resolve the BUILDER's Anthropic client (BYOK → platform fallback). The
  // stateless runtime is Anthropic-only, so a null client (no key anywhere) ⇒
  // the agent isn't ready to chat yet.
  const { getAIClient } = await import("@/lib/ai/client");
  const resolution = await getAIClient({ orgId: builderOrgId });
  if (!resolution.client) {
    return {
      ok: false,
      error: "not_ready",
      message:
        "This agent isn’t quite ready to chat yet — it’s still being set up. You can still go live and take real calls.",
    };
  }

  // Compose the EFFECTIVE persona the live agent would use, then layer it onto
  // the template blueprint so the sandbox agent speaks AS the buyer's business.
  const persona = resolveDeploymentPersona({
    templateGreeting: templateBlueprint.greeting ?? null,
    templateScript: templateBlueprint.customSkillMd ?? null,
    templateVoiceId: templateBlueprint.voice ?? null,
    templateFaq: templateBlueprint.faq ?? null,
    templateServices: null,
    customization: loaded.deployment.customization ?? null,
    clientName: loaded.deployment.clientName,
  });
  const effectiveBlueprint: AgentBlueprint = {
    ...templateBlueprint,
    ...(persona.greeting ? { greeting: persona.greeting } : {}),
    ...(persona.prompt ? { customSkillMd: persona.prompt } : {}),
    ...(persona.faq ? { faq: persona.faq } : {}),
  };
  const businessName =
    persona.businessName || loaded.deployment.clientName || "your business";

  // The deployment's captured client soul (narrow) so the agent names/describes
  // the client + lists services. Absent → name-only (the resolver tolerates it).
  const clientSoul = loaded.deployment.clientContext?.soul ?? null;
  const soul = clientSoul
    ? ({
        businessName: clientSoul.businessName ?? businessName,
        businessDescription: clientSoul.businessDescription,
        services: clientSoul.services,
        voice: clientSoul.voice,
      } as unknown as import("@/lib/agents/stateless-turn").RunStatelessAgentTurnInput["soul"])
    : null;

  // Workspace clock/slug for read-only grounding (availability tool + temporal).
  const [org] = await db
    .select({ slug: organizations.slug, timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, loaded.orgId))
    .limit(1);

  const { runStatelessAgentTurn } = await import("@/lib/agents/stateless-turn");
  const result = await runStatelessAgentTurn({
    orgId: loaded.orgId,
    orgSlug: org?.slug ?? "",
    orgName: businessName,
    soul,
    timezone: org?.timezone ?? "UTC",
    blueprint: effectiveBlueprint,
    messages,
    testMode: true, // money-safe: every write tool is stubbed; nothing persists.
    client: resolution.client,
  });

  if (!result.ok) {
    return { ok: false, error: "runtime_error", message: result.message };
  }
  const toolNotes = result.toolCalls.map(
    (tc) => BUYER_TOOL_LABELS[tc.name] ?? tc.name.replace(/_/g, " "),
  );
  return { ok: true, reply: result.reply, toolNotes };
}
