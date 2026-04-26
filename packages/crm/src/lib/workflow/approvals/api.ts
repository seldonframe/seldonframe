// Pure API helpers for approval resolution endpoints.
// SLICE 10 PR 1 C5 — extracted from the route files so the auth +
// permission logic is unit-testable without spinning up Next.js.
//
// L-22 structural enforcement: permissions checked here BEFORE any
// DB write. The route file translates these helpers into HTTP
// status codes (200 / 401 / 403 / 404 / 409 / 422) — this file
// returns structured discriminated-union outcomes the route maps.
//
// Two resolution paths:
//   1. authenticated user (operator / user_id / org-owner override):
//      authorizeAuthenticatedResolution()
//   2. magic-link (client_owner via emailed token):
//      authorizeMagicLinkResolution()
//
// Both produce a "go ahead" outcome the route then funnels into
// runtimeResumeApproval; the route never touches storage directly
// for the resolve path.

import type { WorkflowApproval } from "@/db/schema/workflow-approvals";

import { hashMagicLinkToken, verifyMagicLinkToken } from "./magic-link";
import type { ApprovalStorage } from "./types";

// ---------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------

export type AuthorizationOutcome =
  | { kind: "ok"; approval: WorkflowApproval; overrideFlag: boolean }
  | { kind: "not_found" }
  | { kind: "forbidden"; reason: string }
  | { kind: "wrong_org" }
  | { kind: "already_resolved"; approval: WorkflowApproval }
  | { kind: "expired" }
  | { kind: "invalid_token" };

// ---------------------------------------------------------------------
// Authenticated path: operator / user_id / org-owner override
// ---------------------------------------------------------------------

export type AuthenticatedResolutionInput = {
  approvalId: string;
  /** Workspace the API call is scoped to (from session cookie). */
  callerOrgId: string;
  /** Authenticated user id from the session. */
  callerUserId: string;
  /** True if the caller is the workspace owner (org.ownerId === callerUserId). */
  callerIsOrgOwner: boolean;
};

export async function authorizeAuthenticatedResolution(
  storage: ApprovalStorage,
  input: AuthenticatedResolutionInput,
  /** When true, the caller is exercising the org-owner override; we
   * accept any pending approval in the org regardless of the bound
   * approver. When false, we require approverUserId === callerUserId. */
  asOverride: boolean,
): Promise<AuthorizationOutcome> {
  const approval = await storage.getApprovalById(input.approvalId);
  if (!approval) return { kind: "not_found" };
  if (approval.orgId !== input.callerOrgId) return { kind: "wrong_org" };
  if (approval.status !== "pending") return { kind: "already_resolved", approval };

  if (asOverride) {
    // G-10-7 — org-owner emergency unblock. Only the org owner can
    // exercise it; non-owners trying to use the override route get 403.
    if (!input.callerIsOrgOwner) {
      return { kind: "forbidden", reason: "override_requires_org_owner" };
    }
    return { kind: "ok", approval, overrideFlag: true };
  }

  // Regular resolve path. Bound approver must match the caller. The
  // org-owner is also allowed to resolve via the regular path (defense
  // in depth — they already have full workspace authority); the
  // override-flag is set only when they explicitly hit the override
  // route.
  if (approval.approverUserId !== input.callerUserId && !input.callerIsOrgOwner) {
    return { kind: "forbidden", reason: "not_bound_approver" };
  }

  return { kind: "ok", approval, overrideFlag: false };
}

// ---------------------------------------------------------------------
// Magic-link path: client_owner via emailed token
// ---------------------------------------------------------------------

export type MagicLinkResolutionInput = {
  /** Raw token from the URL path. */
  token: string;
  /** Workspace HMAC signing secret for verification. */
  secret: string;
  now: Date;
};

export async function authorizeMagicLinkResolution(
  storage: ApprovalStorage,
  input: MagicLinkResolutionInput,
): Promise<AuthorizationOutcome> {
  // 1. Verify the token signature + extract the approvalId encoded
  //    in the payload. Tampering / wrong secret → invalid_token.
  //    Past expiration → expired (distinct verdict for UX).
  const verdict = verifyMagicLinkToken({ token: input.token, secret: input.secret, now: input.now });
  if (verdict.kind === "expired") return { kind: "expired" };
  if (verdict.kind !== "valid") return { kind: "invalid_token" };

  // 2. Look up the approval by stored hash. If the hash doesn't
  //    match (maybe the row was rotated server-side), or the row's
  //    own magic_link_expires_at is past, we bail with invalid_token
  //    (uniform error to defeat enumeration).
  const tokenHash = hashMagicLinkToken({ token: input.token, secret: input.secret });
  const approval = await storage.findApprovalByMagicLinkHash(tokenHash, input.now);
  if (!approval) return { kind: "invalid_token" };

  // 3. Status check (same as authenticated path).
  if (approval.status !== "pending") return { kind: "already_resolved", approval };

  return { kind: "ok", approval, overrideFlag: false };
}
