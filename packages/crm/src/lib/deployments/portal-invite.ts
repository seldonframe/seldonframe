// Front-office bridge — testable core behind inviteClientToPortalAction.
//
// PLAIN module (NOT "use server"): the orchestration logic lives here, DI'd, so
// it's unit-tested with no DB / network. The thin "use server" action
// (actions.ts) wires the real implementations + the org-guard.
//
// Portal access is OPT-IN. When the agency flips it on for a deployment, we:
//   1. require deployment.clientOrgId (the provisioned client workspace).
//   2. resolve a contact in that client org to address the invite to — the
//      primary contact if one exists, else create one from
//      deployment.clientContact.email. No email anywhere → can't invite.
//   3. send the magic link via the existing portal auth (createPortalMagicLink).
//   4. stamp deployments.portalInvitedAt (re-invite allowed; refreshes the time).

import type { Deployment } from "@/db/schema/deployments";

/** Injectable seams so the orchestration is unit-tested offline. */
export type InviteClientToPortalDeps = {
  /** The client org's slug (createPortalMagicLink resolves the workspace by it). */
  loadOrgSlug: (orgId: string) => Promise<string | null>;
  /** The primary contact id in the client org (oldest with an email), or null. */
  resolvePrimaryContactId: (orgId: string) => Promise<string | null>;
  /** Create a contact in the client org for an email; returns its id (or null). */
  createContactForEmail: (orgId: string, email: string) => Promise<string | null>;
  /** Send the portal magic link to a contact; returns the invite URL. */
  createMagicLink: (args: {
    orgSlug: string;
    contactId: string;
  }) => Promise<{ inviteUrl: string }>;
  /** Stamp deployments.portalInvitedAt. */
  updateDeployment: (
    id: string,
    patch: { portalInvitedAt: Date },
  ) => Promise<void>;
  /** Injectable clock (defaults handled by the caller's wiring). */
  now: () => Date;
};

export type InviteClientToPortalResult =
  | { ok: true; inviteUrl: string }
  | {
      ok: false;
      error: "no_client_org" | "no_contact_email" | "org_not_found" | "send_failed";
    };

/** The deployment fields the invite reads. */
type InvitableDeployment = Pick<Deployment, "id" | "clientOrgId" | "clientContact">;

/**
 * Send a client a portal magic link + stamp portalInvitedAt. See the module
 * header for the contract. Pure orchestration over DI'd effects.
 */
export async function inviteClientToPortal(
  deps: InviteClientToPortalDeps,
  deployment: InvitableDeployment,
): Promise<InviteClientToPortalResult> {
  const clientOrgId = deployment.clientOrgId;
  if (!clientOrgId) return { ok: false, error: "no_client_org" };

  const orgSlug = await deps.loadOrgSlug(clientOrgId);
  if (!orgSlug) return { ok: false, error: "org_not_found" };

  // Resolve who to address the invite to: the org's primary contact, else create
  // one from the captured client contact email. No email anywhere → can't invite.
  let contactId = await deps.resolvePrimaryContactId(clientOrgId);
  if (!contactId) {
    const email = deployment.clientContact?.email?.trim();
    if (!email) return { ok: false, error: "no_contact_email" };
    contactId = await deps.createContactForEmail(clientOrgId, email);
    if (!contactId) return { ok: false, error: "no_contact_email" };
  }

  let inviteUrl: string;
  try {
    const link = await deps.createMagicLink({ orgSlug, contactId });
    inviteUrl = link.inviteUrl;
  } catch {
    return { ok: false, error: "send_failed" };
  }

  await deps.updateDeployment(deployment.id, { portalInvitedAt: deps.now() });
  return { ok: true, inviteUrl };
}
