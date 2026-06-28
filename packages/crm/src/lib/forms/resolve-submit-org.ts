// ============================================================================
// forms/submit — authoritative-org resolution (security audit 2026-06-28, FIX 3)
// ============================================================================
//
// The public `POST /api/v1/forms/submit` route used to do:
//
//     const orgId = body.orgId || (await getOrgId());
//
// i.e. it trusted a caller-supplied `body.orgId` for a WRITE (creates a
// contact) AND an agent-fire (emits `lead.created`, which dispatches the
// org's speed-to-lead agent on that org's Twilio/Resend creds). Any
// unauthenticated caller could POST an arbitrary `orgId` and (a) inject a
// contact into another tenant's CRM and (b) make that tenant's agent send
// SMS/email on their dime. Cross-tenant write + side-effect.
//
// The legit flow: the Puck landing-page <FormContainer> posts
// `body.orgId = puck.metadata.orgId`. That value is the org id the page
// was SERVER-rendered for, and those pages are served on
// `<slug>.app.seldonframe.com` (or a verified custom domain) — so the
// REQUEST HOST already resolves to the very same org. The operator's
// in-dashboard editor preview is instead an AUTHENTICATED request whose
// session resolves the operator's own org.
//
// So the body.orgId is never needed as an authority; the authority is
// either the verified host or the authenticated session. This pure helper
// encodes that decision. The route resolves `hostOrgId` (from the verified
// subdomain / custom domain) and `sessionOrgId` (from getOrgId()) and asks
// this function what to do.

export type ResolveSubmitOrgInput = {
  /** Org id resolved from the VERIFIED request host (subdomain / custom
   *  domain). null when the host doesn't map to a workspace. */
  hostOrgId: string | null;
  /** Org id from an AUTHENTICATED operator session (getOrgId()). null when
   *  the request is anonymous. */
  sessionOrgId: string | null;
  /** The raw, UNTRUSTED `body.orgId`. Only ever used as a confirmation that
   *  must match the authority — never as the authority itself. */
  bodyOrgId: string | null;
};

export type ResolveSubmitOrgResult =
  | {
      ok: true;
      /** The org all writes + emits MUST be scoped to. */
      orgId: string;
      /** How the authority was established (for structured logs). */
      source: "host" | "session";
    }
  | {
      ok: false;
      /** Machine-readable reject reason (for logs, not the HTTP body). */
      reason: "no_verified_org" | "org_mismatch";
    };

function norm(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * PURE. Decide the authoritative org for a public form submission.
 *
 * Rules:
 *   1. Authority = verified host org, else authenticated session org.
 *      A raw `body.orgId` is NEVER the authority.
 *   2. If no authority can be established → reject (`no_verified_org`):
 *      we will not write or fire an agent for an unverifiable org.
 *   3. If `body.orgId` is present and does NOT match the authority →
 *      reject (`org_mismatch`): this is the cross-tenant attempt. (A
 *      legit page's body.orgId always equals the host/session org.)
 *   4. Otherwise → accept, scoped to the authority.
 */
export function resolveSubmitOrg(input: ResolveSubmitOrgInput): ResolveSubmitOrgResult {
  const hostOrgId = norm(input.hostOrgId);
  const sessionOrgId = norm(input.sessionOrgId);
  const bodyOrgId = norm(input.bodyOrgId);

  const authority = hostOrgId ?? sessionOrgId;
  const source: "host" | "session" = hostOrgId ? "host" : "session";

  if (!authority) {
    // Anonymous request on a host that doesn't resolve to a workspace.
    // We can't safely attribute the write/agent-fire to anyone.
    return { ok: false, reason: "no_verified_org" };
  }

  if (bodyOrgId && bodyOrgId !== authority) {
    // The caller asked us to write to a DIFFERENT org than the one the
    // request is actually authorized for. Classic cross-tenant attempt.
    return { ok: false, reason: "org_mismatch" };
  }

  return { ok: true, orgId: authority, source };
}
