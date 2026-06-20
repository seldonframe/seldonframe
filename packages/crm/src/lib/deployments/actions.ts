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
import { createDeployment } from "./store";
import { CreateDeploymentSchema } from "./schema";

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
