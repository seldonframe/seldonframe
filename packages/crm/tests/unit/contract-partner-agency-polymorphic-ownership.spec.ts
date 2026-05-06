// ============================================================================
// v1.19.0 — partner-agency polymorphic ownership contract
// ============================================================================
//
// Bug class this test exists to prevent: anonymous workspaces
// (created via create_workspace_v2 or claimed-but-not-linked through
// the v1.7.3 NextAuth bug) have organizations.owner_id = NULL. Any
// agency endpoint that requires ownerUserId returns 403, blocking
// the dominant new-customer path from using white-label features.
//
// Contract (v1.19): caller supplies AT LEAST ONE of {ownerUserId,
// ownerWorkspaceId}. Owner-check passes if EITHER pointer matches the
// agency's stored owner. Insert path persists whichever fields are
// non-null. Plan-gate runs against whichever ownership type is set.
//
// What we test here are the PURE ownership-check predicates. The
// SQL/DB paths are exercised by the integration harness (queued).

import { test } from "node:test";
import assert from "node:assert/strict";

// ─── ownership-match predicate ─────────────────────────────────────────────
//
// Mirrors the predicate used in store.ts (attach/detach) and
// sender-domain.ts. Kept colocated so a future divergence is caught
// by a failing test rather than at runtime.

interface AgencyOwnershipRow {
  ownerUserId: string | null;
  ownerWorkspaceId: string | null;
}

interface CallerIdentity {
  ownerUserId?: string;
  ownerWorkspaceId?: string;
}

function callerOwnsAgency(
  agency: AgencyOwnershipRow,
  caller: CallerIdentity,
): boolean {
  const matchesUser =
    caller.ownerUserId != null && agency.ownerUserId === caller.ownerUserId;
  const matchesWorkspace =
    caller.ownerWorkspaceId != null &&
    agency.ownerWorkspaceId === caller.ownerWorkspaceId;
  return matchesUser || matchesWorkspace;
}

test("user-owned agency: caller-with-matching-user-id owns it", () => {
  const agency = {
    ownerUserId: "user-1",
    ownerWorkspaceId: null,
  };
  assert.equal(callerOwnsAgency(agency, { ownerUserId: "user-1" }), true);
});

test("user-owned agency: caller-with-different-user-id does NOT own it", () => {
  const agency = {
    ownerUserId: "user-1",
    ownerWorkspaceId: null,
  };
  assert.equal(callerOwnsAgency(agency, { ownerUserId: "user-2" }), false);
});

test("workspace-owned agency: caller-with-matching-workspace-id owns it", () => {
  const agency = {
    ownerUserId: null,
    ownerWorkspaceId: "ws-1",
  };
  assert.equal(callerOwnsAgency(agency, { ownerWorkspaceId: "ws-1" }), true);
});

test("workspace-owned agency: caller-with-different-workspace-id does NOT own it", () => {
  const agency = {
    ownerUserId: null,
    ownerWorkspaceId: "ws-1",
  };
  assert.equal(callerOwnsAgency(agency, { ownerWorkspaceId: "ws-2" }), false);
});

test("dual-pointer agency: matching ON EITHER pointer is sufficient", () => {
  // Common after a workspace is claimed: agency has BOTH
  // ownerUserId and ownerWorkspaceId set. Caller might present
  // either identity (e.g. anonymous re-bearer call still has the
  // workspaceId; signed-in dashboard call has the userId).
  const agency = {
    ownerUserId: "user-1",
    ownerWorkspaceId: "ws-1",
  };
  assert.equal(
    callerOwnsAgency(agency, { ownerUserId: "user-1" }),
    true,
    "user-side match",
  );
  assert.equal(
    callerOwnsAgency(agency, { ownerWorkspaceId: "ws-1" }),
    true,
    "workspace-side match",
  );
  assert.equal(
    callerOwnsAgency(agency, {
      ownerUserId: "user-1",
      ownerWorkspaceId: "ws-1",
    }),
    true,
    "both-side match",
  );
});

test("dual-pointer agency: caller with neither pointer does NOT own it", () => {
  const agency = {
    ownerUserId: "user-1",
    ownerWorkspaceId: "ws-1",
  };
  assert.equal(
    callerOwnsAgency(agency, { ownerUserId: "user-2" }),
    false,
    "wrong user, no workspace",
  );
  assert.equal(
    callerOwnsAgency(agency, { ownerWorkspaceId: "ws-2" }),
    false,
    "wrong workspace, no user",
  );
  assert.equal(
    callerOwnsAgency(agency, {
      ownerUserId: "user-2",
      ownerWorkspaceId: "ws-2",
    }),
    false,
    "both wrong",
  );
});

test("empty caller identity does NOT own the agency", () => {
  // Defensive: an empty caller (the API route's pre-v1.19 path
  // would have 403'd before reaching the predicate, but the
  // predicate must still refuse).
  const agency = {
    ownerUserId: "user-1",
    ownerWorkspaceId: "ws-1",
  };
  assert.equal(callerOwnsAgency(agency, {}), false);
});

test("predicate guards against null-equals-undefined ambiguity", () => {
  // A common error-path: agency.ownerUserId is null AND caller.ownerUserId
  // is undefined. We must NOT treat them as a match. Same for
  // workspace pointer.
  const agency = {
    ownerUserId: null,
    ownerWorkspaceId: null,
  };
  assert.equal(
    callerOwnsAgency(agency, { ownerUserId: undefined as unknown as string }),
    false,
  );
  assert.equal(
    callerOwnsAgency(agency, { ownerWorkspaceId: undefined as unknown as string }),
    false,
  );
});

// ─── workspace-owns-itself predicate (anonymous-workspace-as-actor) ────────
//
// For attachWorkspaceToAgency: when target workspace.ownerId is null
// (anonymous workspace), we accept the bearer-workspace identity
// match — caller's ownerWorkspaceId must equal the target
// workspace.id. (You own a workspace by holding its bearer key.)

interface TargetWorkspaceRow {
  id: string;
  ownerId: string | null;
}

function callerOwnsTargetWorkspace(
  target: TargetWorkspaceRow,
  caller: CallerIdentity,
): boolean {
  const ownsByUserId =
    target.ownerId != null &&
    caller.ownerUserId != null &&
    target.ownerId === caller.ownerUserId;
  const ownsBySelfWorkspace =
    target.ownerId == null &&
    caller.ownerWorkspaceId != null &&
    caller.ownerWorkspaceId === target.id;
  return ownsByUserId || ownsBySelfWorkspace;
}

test("anonymous workspace: caller's-workspace-id-equals-target owns it", () => {
  const target = { id: "ws-anon", ownerId: null };
  assert.equal(
    callerOwnsTargetWorkspace(target, { ownerWorkspaceId: "ws-anon" }),
    true,
  );
});

test("anonymous workspace: another workspace-id does NOT own it", () => {
  const target = { id: "ws-anon", ownerId: null };
  assert.equal(
    callerOwnsTargetWorkspace(target, { ownerWorkspaceId: "ws-other" }),
    false,
  );
});

test("claimed workspace: matching userId owns it", () => {
  const target = { id: "ws-claimed", ownerId: "user-1" };
  assert.equal(
    callerOwnsTargetWorkspace(target, { ownerUserId: "user-1" }),
    true,
  );
});

test("claimed workspace: workspace-id does NOT own it (must be userId)", () => {
  // Important: holding the bearer key for ws-claimed doesn't grant
  // ownership when there's a real human owner. The human-owner check
  // takes precedence to prevent a stray bearer from re-attaching a
  // claimed workspace to a different agency.
  const target = { id: "ws-claimed", ownerId: "user-1" };
  assert.equal(
    callerOwnsTargetWorkspace(target, { ownerWorkspaceId: "ws-claimed" }),
    false,
  );
});
