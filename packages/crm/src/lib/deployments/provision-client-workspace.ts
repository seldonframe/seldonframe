// Front-office bridge — provision an isolated, agency-branded CLIENT workspace
// for a deployment, then link it back via deployments.clientOrgId.
//
// This runs at ACTIVATION (the "Get a number" path), OFF the live-call path, and
// is the bridge's keystone: it reuses createFullWorkspace (the structured-input
// core of /clients/new) seeded from the deployment's already-captured
// clientContext, so the deployed voice agent becomes the phone surface of a real
// client workspace (CRM + booking + portal + landing).
//
// Two hard guarantees the activation path depends on:
//   - IDEMPOTENT — if deployment.clientOrgId is already set, no-op (re-activation
//     and provision retries never spawn a duplicate org).
//   - SOFT-FAIL — if workspace creation fails (validation/throw), return
//     { ok:false } WITHOUT persisting clientOrgId and WITHOUT throwing. Activation
//     must still succeed; the agent falls back to writing the builder org until a
//     later retry provisions successfully.
//
// The agency attach (parentAgencyId, for white-label branding) is BEST-EFFORT:
// a resolver/attach failure never fails provisioning — the workspace is still
// created + linked, just unbranded/attachable later.
//
// Every external effect (createFullWorkspace, agency resolve, parentAgency
// update, deployment update) is injected via `deps` so this is unit-tested with
// no DB / network. The default deps (wired in actions.ts at the activation seam)
// supply the real implementations.

import type {
  CreateFullWorkspaceInput,
  CreateFullWorkspaceResult,
} from "@/lib/workspace/create-full";
import type { Deployment } from "@/db/schema/deployments";
import {
  buildClientWorkspaceInput,
  type BuildClientWorkspaceInputArgs,
} from "./client-workspace-seed";

/** Injectable seams — DI so provisioning is unit-tested with no DB / network. */
export type ProvisionClientWorkspaceDeps = {
  /** Atomic structured workspace creation (lib/workspace/create-full.ts). */
  createFullWorkspace: (
    input: CreateFullWorkspaceInput,
  ) => Promise<CreateFullWorkspaceResult>;
  /** Optional override of the pure seed mapper (defaults to buildClientWorkspaceInput). */
  buildInput?: (args: BuildClientWorkspaceInputArgs) => CreateFullWorkspaceInput;
  /** Resolve the builder's partner agency id (for branding), or null if none. */
  resolveBuilderAgency: (builderOrgId: string) => Promise<string | null>;
  /** Store-level attach: set organizations.parentAgencyId for the client org. */
  setParentAgency: (orgId: string, agencyId: string) => Promise<void>;
  /** Persist the new client org id back onto the deployment row. */
  updateDeployment: (
    id: string,
    patch: { clientOrgId: string },
  ) => Promise<void>;
};

export type ProvisionClientWorkspaceResult =
  | { ok: true; orgId: string; skipped?: true }
  | { ok: false; error: "create_threw" | "create_failed" };

/** The deployment fields provisioning reads. */
type ProvisionableDeployment = Pick<
  Deployment,
  "id" | "builderOrgId" | "clientName" | "clientContext" | "clientContact" | "clientOrgId"
>;

/**
 * Provision (idempotently, soft-failing) the client workspace for a deployment.
 * See the module header for the guarantees. Returns the client org id on success
 * (with `skipped:true` when it was already provisioned).
 */
export async function provisionClientWorkspaceForDeployment(
  deps: ProvisionClientWorkspaceDeps,
  deployment: ProvisionableDeployment,
): Promise<ProvisionClientWorkspaceResult> {
  // Idempotent guard — already provisioned → no-op.
  if (deployment.clientOrgId) {
    return { ok: true, orgId: deployment.clientOrgId, skipped: true };
  }

  const buildInput = deps.buildInput ?? buildClientWorkspaceInput;
  const input = buildInput({
    clientName: deployment.clientName,
    clientContext: deployment.clientContext,
    clientContact: deployment.clientContact,
  });

  // Create the workspace. Soft-fail on both a thrown error and a non-ready result.
  let result: CreateFullWorkspaceResult;
  try {
    result = await deps.createFullWorkspace(input);
  } catch {
    return { ok: false, error: "create_threw" };
  }
  if (result.status !== "ready" || !result.workspace_id) {
    return { ok: false, error: "create_failed" };
  }
  const orgId = result.workspace_id;

  // Best-effort agency attach for white-label branding — NEVER fail provisioning
  // on it. If the builder has no agency, leave the workspace unattached
  // (SF-default branding; attachable later).
  try {
    const agencyId = await deps.resolveBuilderAgency(deployment.builderOrgId);
    if (agencyId) await deps.setParentAgency(orgId, agencyId);
  } catch {
    /* branding attach is best-effort */
  }

  // Persist the link last — once this lands, the agent retargets to the client org.
  await deps.updateDeployment(deployment.id, { clientOrgId: orgId });

  return { ok: true, orgId };
}
