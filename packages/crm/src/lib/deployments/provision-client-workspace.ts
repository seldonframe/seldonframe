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
// 2026-07-08 post-review fix wave (spec invariant 5, BLOCKING) — the
// sub-account CAP CHECK is the one exception to "best-effort": it runs
// BEFORE createFullWorkspace and any other side effect, and a rejection
// aborts the whole call with no half-provisioned state (this was
// previously an ungated write — see git history for the original "Not
// gated" comment on setOrgParentAgency in deployments/store.ts, which
// is now stale; the gate lives here, upstream of that call).
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
import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";
import {
  buildClientWorkspaceInput,
  type BuildClientWorkspaceInputArgs,
} from "./client-workspace-seed";

/** 2026-07-08 post-review fix wave (spec invariant 5, BLOCKING) — the
 *  sub-account cap decision this dep returns. Matches
 *  lib/billing/limits.ts's SubAccountLimitDecision shape (duplicated
 *  here rather than imported to keep this DI-only module free of a
 *  DB-adjacent import chain; the real wiring in deployments/actions.ts
 *  maps limits.ts's decision 1:1 onto this shape). */
export type SubAccountCapDecision =
  | { ok: true }
  | { ok: false; reason: "subaccount_limit_reached"; used: number; limit: number };

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
  /** OPTIONAL (#3) — copy the deploying template's MCP connectors onto the new
   *  client workspace's default TEXT agent so it gets the builder's connectors.
   *  Best-effort: invoked after clientOrgId is persisted; a throw/absence NEVER
   *  fails provisioning. Voice is native-only, so this only matters for the text
   *  runtime (the copy is harmless for a voice deployment). */
  copyTemplateConnectors?: (args: {
    builderOrgId: string;
    agentTemplateId: string;
    clientOrgId: string;
  }) => Promise<void>;
  /** 2026-07-08 post-review — GATE, not best-effort. Checked BEFORE any
   *  provisioning side effect (createFullWorkspace, agency attach,
   *  deployment update). This is the ONLY seam in this module that can
   *  reject the whole call — deploy-to-client is a real handoff, unlike
   *  the branding attach below, which stays best-effort. */
  enforceSubAccountCap: (builderOrgId: string) => Promise<SubAccountCapDecision>;
};

export type ProvisionClientWorkspaceResult =
  | { ok: true; orgId: string; skipped?: true }
  | { ok: false; error: "create_threw" | "create_failed" }
  | { ok: false; error: "subaccount_limit_reached"; used: number; limit: number };

/** The deployment fields provisioning reads. */
type ProvisionableDeployment = Pick<
  Deployment,
  | "id"
  | "builderOrgId"
  | "agentTemplateId"
  | "clientName"
  | "clientContext"
  | "clientContact"
  | "clientOrgId"
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
  // Idempotent guard — already provisioned → no-op. (Also skips the cap
  // check below: re-activation of an already-provisioned deployment
  // creates no NEW attachment, so there's nothing to gate.)
  if (deployment.clientOrgId) {
    return { ok: true, orgId: deployment.clientOrgId, skipped: true };
  }

  // 2026-07-08 post-review fix wave (spec invariant 5, BLOCKING) — the
  // sub-account cap MUST be checked before any provisioning side effect
  // (createFullWorkspace, agency attach, deployment update). Unlike the
  // branding attach below, this is NOT best-effort: deploy-to-client is
  // a real handoff, so an over-cap deployment must be rejected outright
  // with no half-provisioned state (no workspace created, nothing
  // persisted).
  const capDecision = await deps.enforceSubAccountCap(deployment.builderOrgId);
  if (!capDecision.ok) {
    return {
      ok: false,
      error: "subaccount_limit_reached",
      used: capDecision.used,
      limit: capDecision.limit,
    };
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

  // Best-effort (#3): copy the deploying template's MCP connectors onto the new
  // client workspace's default text agent. Runs AFTER clientOrgId is persisted
  // (so the agent exists + is linked). A throw/absence NEVER fails provisioning —
  // the deployment is already created + linked; missing connectors just mean the
  // builder re-binds or a later retry copies them. The text runtime consumes
  // them; voice ignores them (native-only).
  if (deps.copyTemplateConnectors) {
    try {
      await deps.copyTemplateConnectors({
        builderOrgId: deployment.builderOrgId,
        agentTemplateId: deployment.agentTemplateId,
        clientOrgId: orgId,
      });
    } catch {
      /* connector copy is best-effort — never block provisioning on it */
    }
  }

  return { ok: true, orgId };
}

// ─── connector copy (#3 — Studio connectors → deployed text agent) ───────────
//
// The pure orchestration for copying a deploying template's MCP connectors onto
// the provisioned client workspace's default agent. DI'd so it's unit-tested with
// no DB; the action (deployments/actions.ts) wires the real template load + the
// client default-agent lookup + updateAgentBlueprint. Kept here (not in the
// "use server" action) so the branching logic is directly testable.
//
// REGRESSION: a template with NO connectors is a no-op — the client agent's
// blueprint is never touched, so the runtime's byte-for-byte native path holds
// for the overwhelmingly common case. Voice is native-only; this copy targets the
// TEXT agent only (the runtime seam reads agents.blueprint.connectors, which the
// realtime path ignores).

/** Injectable seams for the connector copy. */
export type CopyTemplateConnectorsDeps = {
  /** Load the deploying template's connectors (org-guarded by builderOrgId). */
  loadTemplateConnectors: (args: {
    builderOrgId: string;
    agentTemplateId: string;
  }) => Promise<ConnectorBinding[]>;
  /** Find the client workspace's default agent id (slug='default'), or null. */
  findClientDefaultAgentId: (clientOrgId: string) => Promise<string | null>;
  /** Merge the connectors onto the client agent's blueprint (updateAgentBlueprint). */
  updateAgentConnectors: (args: {
    agentId: string;
    orgId: string;
    connectors: ConnectorBinding[];
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export type CopyTemplateConnectorsResult =
  | { ok: true; copied: number }
  | { ok: false; reason: "no_client_agent" | "update_failed" | "threw" };

/**
 * Copy a deploying template's connectors onto the client workspace's default
 * agent. Returns {ok:true, copied:0} (a no-op) when the template has none — never
 * touching the agent. Soft: any thrown dep maps to {ok:false, reason:'threw'} so
 * the caller (best-effort in the provisioner) never crashes provisioning.
 */
export async function copyTemplateConnectorsToAgent(
  deps: CopyTemplateConnectorsDeps,
  args: { builderOrgId: string; agentTemplateId: string; clientOrgId: string },
): Promise<CopyTemplateConnectorsResult> {
  try {
    const connectors = await deps.loadTemplateConnectors({
      builderOrgId: args.builderOrgId,
      agentTemplateId: args.agentTemplateId,
    });
    // No connectors → no-op (preserve the native path; never write the blueprint).
    if (!connectors || connectors.length === 0) {
      return { ok: true, copied: 0 };
    }

    const agentId = await deps.findClientDefaultAgentId(args.clientOrgId);
    if (!agentId) return { ok: false, reason: "no_client_agent" };

    const result = await deps.updateAgentConnectors({
      agentId,
      orgId: args.clientOrgId,
      connectors,
    });
    if (!result.ok) return { ok: false, reason: "update_failed" };

    return { ok: true, copied: connectors.length };
  } catch {
    return { ok: false, reason: "threw" };
  }
}
