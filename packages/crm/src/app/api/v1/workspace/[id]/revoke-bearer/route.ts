import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { resolveV1Identity } from "@/lib/auth/v1-identity";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { logEvent } from "@/lib/observability/log";

// Revokes workspace bearer tokens (kind='workspace') for a given workspace.
//
// Who can call:
//   - The bearer itself (self-revocation) — a leaked device token can kill
//     itself by POSTing here with its own bearer.
//   - A user identity that owns the workspace (post-claim cleanup).
//
// Options via body:
//   - { token_id: "<uuid>" } → revoke a specific token
//   - { all_except_current: true } → revoke every token except the caller's
//       (the bearer the caller authenticated with)
//   - { all: true } → revoke every workspace token for this org, including
//       the caller's. Only allowed for user identities (not bearer) — a
//       bearer can't lock itself out while still needing to call other endpoints.
//
// Returns { revoked_count }.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (isDemoReadonly()) return demoApiBlockedResponse();
  assertWritable();

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const { id } = await params;
  const workspaceId = id.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace id is required." }, { status: 400 });
  }

  // Bearer can only act on its own workspace; user identity must own it.
  let callerTokenId: string | null = null;
  if (identity.kind === "workspace") {
    if (identity.orgId !== workspaceId) {
      return NextResponse.json(
        { error: "Bearer token does not authorize this workspace." },
        { status: 403 }
      );
    }
    callerTokenId = identity.tokenId;
  } else {
    // For user identity, verify ownership via apiKeys.orgId lookup — the user
    // must be able to prove they manage this workspace. We reuse the downstream
    // route pattern: any org the user can switch to is implicitly theirs.
    // For simplicity here we check ownership via organizations.ownerId === userId
    // OR userId linked through requireManagedWorkspaceForUser. We bias to
    // strict ownership for a destructive op.
    const { eq: eqFn } = await import("drizzle-orm");
    const { organizations } = await import("@/db/schema");
    const [org] = await db
      .select({ ownerId: organizations.ownerId })
      .from(organizations)
      .where(eqFn(organizations.id, workspaceId))
      .limit(1);
    if (!org || org.ownerId !== identity.userId) {
      return NextResponse.json(
        { error: "Only the workspace owner can revoke its tokens." },
        { status: 403 }
      );
    }
  }

  const body = (await request.json().catch(() => ({}))) as {
    token_id?: unknown;
    all_except_current?: unknown;
    all?: unknown;
  };

  const tokenId = typeof body.token_id === "string" ? body.token_id.trim() : "";
  const allExceptCurrent = body.all_except_current === true;
  const all = body.all === true;

  // Exactly one mode must be specified.
  const modes = [!!tokenId, allExceptCurrent, all].filter(Boolean).length;
  if (modes !== 1) {
    return NextResponse.json(
      {
        error:
          "Specify exactly one of { token_id, all_except_current: true, all: true }.",
      },
      { status: 400 }
    );
  }

  if (all && identity.kind === "workspace") {
    return NextResponse.json(
      {
        error:
          "Bearer identity cannot revoke ALL tokens (would lock itself out). Use all_except_current or authenticate as the workspace owner.",
      },
      { status: 403 }
    );
  }

  // Build the target query. We always scope to (org_id, kind='workspace').
  const baseFilter = and(
    eq(apiKeys.orgId, workspaceId),
    eq(apiKeys.kind, "workspace")
  );

  // Safety: bearer identity with all_except_current MUST have a known tokenId.
  // If it's somehow missing, refuse rather than fall through to delete-all.
  if (allExceptCurrent && identity.kind === "workspace" && !callerTokenId) {
    return NextResponse.json(
      { error: "Cannot determine caller token — refusing to revoke." },
      { status: 500 }
    );
  }

  let deleted: Array<{ id: string }> = [];
  if (tokenId) {
    deleted = await db
      .delete(apiKeys)
      .where(and(baseFilter, eq(apiKeys.id, tokenId)))
      .returning({ id: apiKeys.id });
    if (deleted.length === 0) {
      // Don't let callers enumerate token IDs for their own workspace.
      return NextResponse.json(
        { error: "Token not found or already revoked." },
        { status: 404 }
      );
    }
  } else if (allExceptCurrent && callerTokenId) {
    const { ne } = await import("drizzle-orm");
    deleted = await db
      .delete(apiKeys)
      .where(and(baseFilter, ne(apiKeys.id, callerTokenId)))
      .returning({ id: apiKeys.id });
  } else if (allExceptCurrent) {
    // User identity calling all_except_current — no "current" token, so this
    // equals all.
    deleted = await db
      .delete(apiKeys)
      .where(baseFilter)
      .returning({ id: apiKeys.id });
  } else if (all) {
    deleted = await db
      .delete(apiKeys)
      .where(baseFilter)
      .returning({ id: apiKeys.id });
  }

  // Accurate note: compute from the actual delete result, not from the request shape.
  const callerStillValid =
    identity.kind !== "workspace" ||
    (callerTokenId !== null && !deleted.some((d) => d.id === callerTokenId));

  logEvent(
    "revoke_bearer",
    {
      mode: tokenId ? "token_id" : allExceptCurrent ? "all_except_current" : "all",
      revoked_count: deleted.length,
      caller_still_valid: callerStillValid,
    },
    { request, identity, orgId: workspaceId, status: 200 }
  );

  return NextResponse.json({
    ok: true,
    workspace_id: workspaceId,
    revoked_count: deleted.length,
    revoked_token_ids: deleted.map((d) => d.id),
    caller_still_valid: callerStillValid,
    note:
      identity.kind === "workspace"
        ? callerStillValid
          ? "Your current bearer remains valid. To rotate, mint a new token via the workspace owner."
          : "Your current bearer was revoked. This request succeeded but future calls with it will 401."
        : null,
  });
}
