// ICP-3 — server actions for the Deploy-to-client flow.
//
// Wraps lib/deployments/store.ts createDeployment so the Studio's deploy
// stepper can create a lite-tenant (a `deployments` row) without leaving the
// dashboard. Mirrors lib/agent-templates/actions.ts: resolve the operator's org
// from session via getOrgId() (the operator's org IS the builder org), validate
// the input with a zod schema that lives in a plain sibling module
// (./schema.ts), then delegate to the store. The store re-checks template
// ownership against the builder org.
//
// "use server" — only async exports here (types/consts/zod live in schema.ts +
// store.ts + margin.ts). NO Twilio number provisioning, NO Stripe billing, NO
// voice runtime, NO live LLM calls: this creates a DRAFT row only.

"use server";

import { revalidatePath } from "next/cache";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { createDeployment, getDeployment, updateDeployment } from "./store";
import type { UpdateDeploymentDeps } from "./store";
import { CreateDeploymentSchema, ActivateDeploymentSchema, PauseDeploymentSchema } from "./schema";
import { isE164 } from "./margin";

export type CreateDeploymentActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Create a deployment (a no-login SMB client) owned by the current operator's
 * org. Validates the payload against the allow-list, then delegates to the
 * store, which enforces that the chosen template belongs to this builder. On
 * success returns the new deployment id so the stepper can link to the Clients
 * screen.
 *
 * The deployment is created in `draft` status: the phone number, voice runtime,
 * and billing are activated by LATER, GATED steps (Twilio + Stripe). This action
 * captures intent only.
 */
export async function createDeploymentAction(input: {
  agentTemplateId: string;
  clientName: string;
  clientContact?: { phone?: string; email?: string; address?: string };
  surface?: string;
  priceCents?: number;
}): Promise<CreateDeploymentActionResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const parsed = CreateDeploymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `invalid_input: ${parsed.error.message}` };
  }

  const result = await createDeployment({
    builderOrgId: orgId,
    agentTemplateId: parsed.data.agentTemplateId,
    clientName: parsed.data.clientName,
    clientContact: parsed.data.clientContact,
    surface: parsed.data.surface,
    priceCents: parsed.data.priceCents,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/studio/clients");
  revalidatePath("/studio/agents");
  return { ok: true, id: result.deployment.id };
}

// ─── activateDeploymentAction ────────────────────────────────────────────────

export type ActivateDeploymentActionResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" | "invalid_phone" | "phone_in_use" | "not_found" | "update_failed" };

/**
 * Activate a draft deployment: assign the builder's Twilio phone number and
 * flip status to 'active'. Org-guarded — verifies the deployment's
 * builder_org_id matches the current operator's org. Validates E.164. Maps
 * the unique-constraint violation (number already assigned) to {ok:false,
 * error:"phone_in_use"}.
 *
 * Does NOT provision the Twilio number (no API call) — the builder supplies
 * their own number string. The actual inbound-call→deployment routing is
 * wired in task 2.3.
 *
 * @param _deps - optional DI; injected in unit tests to avoid DB.
 */
export async function activateDeploymentAction(
  input: { deploymentId: string; phoneNumber: string },
  _deps?: Partial<UpdateDeploymentDeps & { findDeploymentById: (id: string) => Promise<import("@/db/schema/deployments").Deployment | null> }>,
): Promise<ActivateDeploymentActionResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const parsed = ActivateDeploymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_phone" };

  if (!isE164(parsed.data.phoneNumber)) return { ok: false, error: "invalid_phone" };

  // Org guard: load the deployment and verify ownership.
  const existing = await getDeployment(parsed.data.deploymentId, _deps ? { findById: _deps.findDeploymentById ?? _deps.findById } : undefined);
  if (!existing || existing.builderOrgId !== orgId) return { ok: false, error: "not_found" };

  try {
    const result = await updateDeployment({
      id: parsed.data.deploymentId,
      patch: { phoneNumber: parsed.data.phoneNumber, status: "active" },
      deps: _deps,
    });
    if (!result.ok) {
      return { ok: false, error: result.error === "deployment_not_found" ? "not_found" : "update_failed" };
    }
    revalidatePath("/studio/clients");
    return { ok: true };
  } catch (err) {
    // Map the Postgres unique-constraint violation to a typed error.
    // pg/neon throws an error with code '23505' (unique_violation).
    const isUniqueViolation =
      err instanceof Error &&
      ("code" in err
        ? (err as unknown as { code: string }).code === "23505"
        : err.message.includes("unique") || err.message.includes("duplicate"));
    if (isUniqueViolation) return { ok: false, error: "phone_in_use" };
    throw err;
  }
}

// ─── pauseDeploymentAction ───────────────────────────────────────────────────

export type PauseDeploymentActionResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" | "not_found" | "update_failed" };

/**
 * Pause an active deployment (active → paused). Org-guarded. Does not touch
 * the phone number — the number stays assigned so the builder can re-activate
 * without re-entering it.
 *
 * @param _deps - optional DI; injected in unit tests to avoid DB.
 */
export async function pauseDeploymentAction(
  input: { deploymentId: string },
  _deps?: Partial<UpdateDeploymentDeps & { findDeploymentById: (id: string) => Promise<import("@/db/schema/deployments").Deployment | null> }>,
): Promise<PauseDeploymentActionResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const parsed = PauseDeploymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "not_found" };

  // Org guard: load the deployment and verify ownership.
  const existing = await getDeployment(parsed.data.deploymentId, _deps ? { findById: _deps.findDeploymentById ?? _deps.findById } : undefined);
  if (!existing || existing.builderOrgId !== orgId) return { ok: false, error: "not_found" };

  const result = await updateDeployment({
    id: parsed.data.deploymentId,
    patch: { status: "paused" },
    deps: _deps,
  });
  if (!result.ok) {
    return { ok: false, error: result.error === "deployment_not_found" ? "not_found" : "update_failed" };
  }
  revalidatePath("/studio/clients");
  return { ok: true };
}
