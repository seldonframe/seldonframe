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
import {
  CreateDeploymentSchema,
  ActivateDeploymentSchema,
  PauseDeploymentSchema,
  ProvisionDeploymentNumberSchema,
  CancelDeploymentSchema,
} from "./schema";
import { isE164, isAreaCode } from "./margin";
import { resolveBuilderTelephony } from "@/lib/telephony/config";
import { createTwilioTelephonyClient } from "@/lib/telephony/twilio-client";
import { provisionVoiceNumber } from "@/lib/telephony/provision-voice-number";

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

// ─── provisionDeploymentNumberAction ─────────────────────────────────────────

export type ProvisionDeploymentNumberActionResult =
  | { ok: true; phoneNumber: string }
  | { ok: false; error: "unauthorized" | "not_found" | "invalid_area_code" }
  | { ok: false; error: "needs_telephony"; missing: ("twilio" | "trunk")[] }
  | {
      ok: false;
      error:
        | "no_numbers_available"
        | "provisioning_unavailable"
        | "attach_failed"
        | "deployment_not_found";
    };

/**
 * Provision a REAL Twilio voice number for a deployment and attach it to the
 * builder's Elastic SIP Trunk (→ OpenAI voice gateway), then flip the
 * deployment to 'active'. This is the "Get a number" primary path (vs.
 * activateDeploymentAction, where the builder pastes a number they already own).
 *
 * Org-guarded: verifies the deployment's builder_org_id matches the current
 * operator's org. If the builder hasn't connected Twilio or set their voice
 * trunk SID, returns {error:'needs_telephony', missing} so the UI can point
 * them at Settings. Otherwise delegates to the idempotent provisionVoiceNumber
 * state machine (search → buy → persist sid → attach → active), which writes
 * phoneNumberSid + numberOrigin:'provisioned' via updateDeployment.
 *
 * No raw Twilio calls here — the network client is created from the builder's
 * resolved BYO creds and injected into the state machine.
 */
export async function provisionDeploymentNumberAction(input: {
  deploymentId: string;
  areaCode: string;
}): Promise<ProvisionDeploymentNumberActionResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const parsed = ProvisionDeploymentNumberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_area_code" };
  if (!isAreaCode(parsed.data.areaCode)) {
    return { ok: false, error: "invalid_area_code" };
  }

  // Org guard: load the deployment and verify ownership.
  const existing = await getDeployment(parsed.data.deploymentId);
  if (!existing || existing.builderOrgId !== orgId) {
    return { ok: false, error: "not_found" };
  }

  // Resolve the builder's BYO Twilio creds + voice trunk SID.
  const telephony = await resolveBuilderTelephony(orgId);
  if (!telephony.ok) {
    return { ok: false, error: "needs_telephony", missing: telephony.missing };
  }

  const client = createTwilioTelephonyClient({
    accountSid: telephony.accountSid,
    authToken: telephony.authToken,
  });

  const result = await provisionVoiceNumber(
    {
      client,
      loadDeployment: (id) => getDeployment(id),
      updateDeployment: async (id, patch) => {
        const res = await updateDeployment({ id, patch });
        return res.ok ? res.deployment : null;
      },
      friendlyName: (d) => d.clientName,
    },
    {
      deploymentId: parsed.data.deploymentId,
      areaCode: parsed.data.areaCode,
      trunkSid: telephony.voiceTrunkSid,
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/studio/clients");
  return { ok: true, phoneNumber: result.phoneNumber };
}

// ─── cancelDeploymentAction ──────────────────────────────────────────────────

export type CancelDeploymentActionResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" | "not_found" | "update_failed" };

/**
 * Cancel a deployment (→ 'canceled'). Org-guarded.
 *
 * Release-on-cancel: if the number was PROVISIONED by SeldonFrame
 * (numberOrigin === 'provisioned') and a phoneNumberSid is on file, we release
 * it from the builder's Twilio account so they stop paying for it. Release is
 * BEST-EFFORT — if the Twilio call throws (already released, network), we log
 * and still cancel the row. BYO numbers (numberOrigin !== 'provisioned') are
 * never released — the builder owns them.
 *
 * After a successful release we null phoneNumber + phoneNumberSid so the row no
 * longer points at a dead number (and frees the unique phone index). Pause, by
 * contrast, keeps the number assigned (see pauseDeploymentAction).
 *
 * @param _deps - optional DI; injected in unit tests to avoid DB.
 */
export async function cancelDeploymentAction(
  input: { deploymentId: string },
  _deps?: Partial<UpdateDeploymentDeps & { findDeploymentById: (id: string) => Promise<import("@/db/schema/deployments").Deployment | null> }>,
): Promise<CancelDeploymentActionResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const parsed = CancelDeploymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "not_found" };

  // Org guard: load the deployment and verify ownership.
  const existing = await getDeployment(
    parsed.data.deploymentId,
    _deps ? { findById: _deps.findDeploymentById ?? _deps.findById } : undefined,
  );
  if (!existing || existing.builderOrgId !== orgId) {
    return { ok: false, error: "not_found" };
  }

  // Release-on-cancel for SeldonFrame-provisioned numbers (best-effort).
  const shouldRelease =
    existing.numberOrigin === "provisioned" && Boolean(existing.phoneNumberSid);

  if (shouldRelease) {
    try {
      const telephony = await resolveBuilderTelephony(orgId);
      if (telephony.ok) {
        const client = createTwilioTelephonyClient({
          accountSid: telephony.accountSid,
          authToken: telephony.authToken,
        });
        await client.releaseNumber({ phoneNumberSid: existing.phoneNumberSid! });
      } else {
        // Creds gone — can't call Twilio. Cancel anyway; the number may linger
        // in the builder's account but we don't block the cancel on it.
        console.warn(
          "[deployments][cancel] skipping release — telephony unresolved",
          { deploymentId: existing.id, missing: telephony.missing },
        );
      }
    } catch (err) {
      // Already released / network / etc. — swallow and still cancel.
      console.warn("[deployments][cancel] number release failed (continuing)", {
        deploymentId: existing.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const result = await updateDeployment({
    id: parsed.data.deploymentId,
    patch: shouldRelease
      ? { status: "canceled", phoneNumber: null, phoneNumberSid: null }
      : { status: "canceled" },
    deps: _deps,
  });
  if (!result.ok) {
    return { ok: false, error: result.error === "deployment_not_found" ? "not_found" : "update_failed" };
  }
  revalidatePath("/studio/clients");
  return { ok: true };
}
