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
import {
  createDeployment,
  getDeployment,
  updateDeployment,
  resolveBuilderAgency,
  setOrgParentAgency,
  archiveClientOrg,
  loadOrgSlug,
  resolvePrimaryContactIdForOrg,
} from "./store";
import type { UpdateDeploymentDeps } from "./store";
import {
  provisionClientWorkspaceForDeployment,
  copyTemplateConnectorsToAgent,
} from "./provision-client-workspace";
import { inviteClientToPortal } from "./portal-invite";
import { createFullWorkspace } from "@/lib/workspace/create-full";
import { createPortalMagicLink } from "@/lib/portal/auth";
import { createContactForOrg } from "@/lib/contacts/create-for-org";
import {
  CreateDeploymentSchema,
  ActivateDeploymentSchema,
  PauseDeploymentSchema,
  ProvisionDeploymentNumberSchema,
  CancelDeploymentSchema,
} from "./schema";
import { isE164, isAreaCode, isPhoneInUseError } from "./margin";
import { mapSoulToClientContext } from "./client-context";
import { compileSoulService } from "@/lib/soul-compiler/service";
import { resolveBuilderClaudeKey } from "./client-context-server";
import type { DeploymentClientContext } from "@/db/schema/deployments";
import type { SoulV4 } from "@/lib/soul-compiler/schema";
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
  clientContext?: DeploymentClientContext;
  surface?: string;
  priceCents?: number;
  /** How the deployed agent books (ICP-3). Defaults to 'native'. */
  bookingMode?: "native" | "external_link" | "api_mcp" | "cal_com";
  /** The client's own booking URL — required by the schema for external_link. */
  externalBookingUrl?: string | null;
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
    clientContext: parsed.data.clientContext,
    surface: parsed.data.surface,
    priceCents: parsed.data.priceCents,
    bookingMode: parsed.data.bookingMode,
    externalBookingUrl: parsed.data.externalBookingUrl,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/studio/clients");
  revalidatePath("/studio/agents");
  return { ok: true, id: result.deployment.id };
}

// ─── generateClientContextAction ─────────────────────────────────────────────

export type GenerateClientContextActionResult =
  | { ok: true; clientContext: DeploymentClientContext }
  | { ok: false; error: "unauthorized" | "empty" | "no_key" | "compile_failed" };

/** DI seam: compile a description → a SoulV4 (or an error). The default resolves
 *  the builder org's Claude key + calls compileSoulService; tests inject a stub
 *  so the action is network-free. */
export type GenerateClientContextDeps = {
  compile: (args: {
    orgId: string;
    description: string;
  }) => Promise<
    | { ok: true; soul: SoulV4 }
    | { ok: false; error: "no_key" | "compile_failed" }
  >;
};

function buildDefaultGenerateDeps(): GenerateClientContextDeps {
  return {
    compile: async ({ orgId, description }) => {
      const claudeApiKey = await resolveBuilderClaudeKey(orgId);
      if (!claudeApiKey) return { ok: false, error: "no_key" };

      const result = await compileSoulService({ input: description, claudeApiKey });
      // 'ready' is the only status that yields a usable soul. 'split_required'
      // (the business has product+service halves) and 'error' both can't fill
      // the persona, so we surface a generic compile_failed — the deploy UI
      // treats it as "auto-fill didn't work, edit by hand".
      if (result.status === "ready") return { ok: true, soul: result.soul };
      return { ok: false, error: "compile_failed" };
    },
  };
}

/**
 * Compile a free-form description of the CLIENT's business into a
 * DeploymentClientContext (narrow soul + FAQ) for the deploy wizard's
 * "Auto-fill" button. Org-guarded. A blank description short-circuits to
 * {ok:false, error:'empty'} WITHOUT calling the compiler (no wasted LLM spend).
 *
 * On success returns the mapped clientContext — the wizard renders it as
 * editable services / FAQ / description rows, hand-editable before deploy. This
 * action does NOT persist anything; the assembled context is threaded into
 * createDeploymentAction when the builder submits.
 */
export async function generateClientContextAction(
  input: { description: string },
  _deps?: Partial<GenerateClientContextDeps>,
): Promise<GenerateClientContextActionResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const description = (input.description ?? "").trim();
  if (!description) return { ok: false, error: "empty" };

  const compile = _deps?.compile ?? buildDefaultGenerateDeps().compile;
  const compiled = await compile({ orgId, description });
  if (!compiled.ok) return { ok: false, error: compiled.error };

  const clientContext = mapSoulToClientContext(compiled.soul);
  return { ok: true, clientContext };
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
    // A duplicate phone_number write (the partial unique index) surfaces as a
    // friendly typed error rather than an unhandled throw.
    if (isPhoneInUseError(err)) return { ok: false, error: "phone_in_use" };
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
        | "deployment_not_found"
        | "phone_in_use";
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

  // Multi-surface number: point the provisioned number's inbound SMS webhook at
  // SeldonFrame so it answers calls + texts (both → the client org's agent).
  const appBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";

  let result: Awaited<ReturnType<typeof provisionVoiceNumber>>;
  try {
    result = await provisionVoiceNumber(
      {
        client,
        loadDeployment: (id) => getDeployment(id),
        updateDeployment: async (id, patch) => {
          const res = await updateDeployment({ id, patch });
          return res.ok ? res.deployment : null;
        },
        friendlyName: (d) => d.clientName,
        smsUrl: `${appBaseUrl}/api/webhooks/twilio/sms`,
      },
      {
        deploymentId: parsed.data.deploymentId,
        areaCode: parsed.data.areaCode,
        trunkSid: telephony.voiceTrunkSid,
      },
    );
  } catch (err) {
    // A duplicate phone_number (the partial unique index, e.g. a number already
    // assigned to another deployment) would otherwise throw out of the action
    // and render the generic error page. Surface it as a friendly typed error.
    if (isPhoneInUseError(err)) return { ok: false, error: "phone_in_use" };
    throw err;
  }

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  // Front-office bridge: now that the deployment is active, auto-provision its
  // isolated, agency-branded CLIENT workspace and link it via clientOrgId. This
  // is IDEMPOTENT (re-activation safe) + SOFT-FAIL: if it errors, we log and
  // continue — activation MUST still succeed (the agent runs, writing to the
  // builder org as a fallback until a later retry provisions). Reload the row so
  // the idempotent clientOrgId guard sees the latest persisted state. Never
  // block the action's success on provisioning, and never let it throw.
  try {
    const fresh = (await getDeployment(parsed.data.deploymentId)) ?? existing;
    const provisioned = await provisionClientWorkspaceForDeployment(
      buildProvisionDeps(),
      fresh,
    );
    if (!provisioned.ok) {
      console.warn("[deployments][provision] client workspace not provisioned (continuing)", {
        deploymentId: existing.id,
        error: provisioned.error,
      });
    }
  } catch (err) {
    console.warn("[deployments][provision] threw (continuing — activation still succeeds)", {
      deploymentId: existing.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  revalidatePath("/studio/clients");
  return { ok: true, phoneNumber: result.phoneNumber };
}

/** Real default deps for provisionClientWorkspaceForDeployment, wired to the
 *  workspace-creation core + the deployments store helpers. Kept as a builder so
 *  the action body stays declarative and a future caller (e.g. a backfill) can
 *  reuse the same wiring. */
function buildProvisionDeps() {
  return {
    createFullWorkspace,
    resolveBuilderAgency,
    setParentAgency: setOrgParentAgency,
    updateDeployment: async (id: string, patch: { clientOrgId: string }) => {
      await updateDeployment({ id, patch });
    },
    // #3 — best-effort copy of the deploying template's MCP connectors onto the
    // client workspace's default TEXT agent. Soft-fail by construction
    // (copyTemplateConnectorsToAgent try/catches), and the provisioner wraps the
    // whole call in its own try/catch — so this never breaks provisioning. Voice
    // is native-only; this copy only changes behavior for the text runtime.
    copyTemplateConnectors: async (args: {
      builderOrgId: string;
      agentTemplateId: string;
      clientOrgId: string;
    }) => {
      await copyTemplateConnectorsToAgent(
        {
          loadTemplateConnectors: async ({ builderOrgId, agentTemplateId }) => {
            const { getAgentTemplate } = await import("@/lib/agent-templates/store");
            const template = await getAgentTemplate(agentTemplateId);
            // Org guard — only the deploying builder's own template is read.
            if (!template || template.builderOrgId !== builderOrgId) return [];
            const { blueprint } = template;
            return (
              (blueprint as { connectors?: import("@/lib/agents/mcp/connectors").ConnectorBinding[] })
                .connectors ?? []
            );
          },
          findClientDefaultAgentId: async (clientOrgId) => {
            const { db } = await import("@/db");
            const { agents } = await import("@/db/schema");
            const { and, eq, sql } = await import("drizzle-orm");
            const [row] = await db
              .select({ id: agents.id })
              .from(agents)
              .where(
                and(
                  eq(agents.orgId, clientOrgId),
                  sql`lower(${agents.slug}) = 'default'`,
                ),
              )
              .limit(1);
            return row?.id ?? null;
          },
          updateAgentConnectors: async ({ agentId, orgId, connectors }) => {
            const { updateAgentBlueprint } = await import("@/lib/agents/store");
            return updateAgentBlueprint({
              agentId,
              orgId,
              patch: { connectors },
              publishNotes: "Copied connectors from deploying template",
            });
          },
        },
        args,
      );
    },
  };
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

  // Front-office bridge: ARCHIVE the provisioned client workspace (data
  // retained, never deleted) so it drops out of active workspace lists + the
  // billing workspace-count but can be reactivated / handed off later. We KEEP
  // deployments.clientOrgId. Best-effort: a failure here must not block the
  // cancel (the number release already happened); log + continue.
  if (existing.clientOrgId) {
    try {
      await archiveClientOrg({ orgId: existing.clientOrgId });
    } catch (err) {
      console.warn("[deployments][cancel] client workspace archive failed (continuing)", {
        deploymentId: existing.id,
        clientOrgId: existing.clientOrgId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const result = await updateDeployment({
    id: parsed.data.deploymentId,
    // ALWAYS free the number in OUR DB on cancel (null phone_number + _sid).
    // The partial unique index `deployments_phone_number_uniq` counts ANY
    // non-null phone_number — even on a canceled row — so leaving it set
    // permanently locks that number from reuse and the NEXT activation throws a
    // 23505 unique violation (→ a 500 on /studio/clients). `shouldRelease` gates
    // only the Twilio CARRIER release above, NOT whether we free our column.
    patch: { status: "canceled", phoneNumber: null, phoneNumberSid: null },
    deps: _deps,
  });
  if (!result.ok) {
    return { ok: false, error: result.error === "deployment_not_found" ? "not_found" : "update_failed" };
  }
  revalidatePath("/studio/clients");
  return { ok: true };
}

// ─── inviteClientToPortalAction ──────────────────────────────────────────────

export type InviteClientToPortalActionResult =
  | { ok: true; inviteUrl: string }
  | {
      ok: false;
      error:
        | "unauthorized"
        | "not_found"
        | "no_client_org"
        | "no_contact_email"
        | "org_not_found"
        | "send_failed";
    };

/**
 * Opt-in client portal access. The agency flips this on from the deployment
 * management UI to send the client a magic link into their (provisioned) client
 * workspace + stamp deployments.portalInvitedAt. Org-guarded. Requires
 * deployment.clientOrgId — disabled in the UI until the workspace exists.
 *
 * The orchestration logic + its branches are unit-tested in portal-invite.ts
 * (inviteClientToPortal, DI'd); this action just enforces the org guard and
 * wires the real store/portal/contact effects.
 */
export async function inviteClientToPortalAction(input: {
  deploymentId: string;
}): Promise<InviteClientToPortalActionResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const parsed = PauseDeploymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "not_found" };

  // Org guard: the deployment must belong to the current operator's org.
  const existing = await getDeployment(parsed.data.deploymentId);
  if (!existing || existing.builderOrgId !== orgId) {
    return { ok: false, error: "not_found" };
  }

  const result = await inviteClientToPortal(
    {
      loadOrgSlug,
      resolvePrimaryContactId: resolvePrimaryContactIdForOrg,
      createContactForEmail: async (clientOrgId, email) => {
        const { id } = await createContactForOrg({
          orgId: clientOrgId,
          firstName: existing.clientName,
          lastName: null,
          email,
          phone: existing.clientContact?.phone ?? null,
          status: "lead",
          source: "portal_invite",
        });
        return id;
      },
      createMagicLink: async ({ orgSlug, contactId }) => {
        const invite = await createPortalMagicLink({
          orgSlug,
          contactId,
          redirectTo: `/customer/${orgSlug}?onboarding=1`,
        });
        return { inviteUrl: invite.inviteUrl };
      },
      updateDeployment: async (id, patch) => {
        await updateDeployment({ id, patch });
      },
      now: () => new Date(),
    },
    existing,
  );

  if (!result.ok) return result;
  revalidatePath("/studio/clients");
  return { ok: true, inviteUrl: result.inviteUrl };
}
