import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { orgMembers, organizations, users } from "@/db/schema";
import { resolveWorkspaceBearer } from "@/lib/auth/workspace-token";

export type V1Identity =
  | { kind: "workspace"; orgId: string; tokenId: string }
  | { kind: "user"; userId: string };

export function resolveUserIdFromSeldonApiKey(headers: Headers): string | null {
  const providedKey = headers.get("x-seldon-api-key")?.trim();
  if (!providedKey) {
    return null;
  }

  const configuredPairs = (process.env.SELDON_BUILDER_API_KEYS ?? "")
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf(":");
      if (separator < 1) {
        return null;
      }
      const key = pair.slice(0, separator).trim();
      const userId = pair.slice(separator + 1).trim();
      if (!key || !userId) {
        return null;
      }
      return { key, userId };
    })
    .filter((entry): entry is { key: string; userId: string } => Boolean(entry));

  const match = configuredPairs.find((entry) => entry.key === providedKey);
  return match?.userId ?? null;
}

export type V1AuthResult =
  | { ok: true; identity: V1Identity }
  | { ok: false; response: NextResponse };

export async function resolveV1Identity(request: Request): Promise<V1AuthResult> {
  const bearer = await resolveWorkspaceBearer(request.headers);
  if (bearer) {
    return {
      ok: true,
      identity: { kind: "workspace", orgId: bearer.orgId, tokenId: bearer.tokenId },
    };
  }

  const apiKeyUserId = resolveUserIdFromSeldonApiKey(request.headers);
  const hasApiKeyHeader = Boolean(request.headers.get("x-seldon-api-key")?.trim());

  if (hasApiKeyHeader && !apiKeyUserId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid x-seldon-api-key." }, { status: 401 }),
    };
  }

  if (apiKeyUserId) {
    return { ok: true, identity: { kind: "user", userId: apiKeyUserId } };
  }

  const session = await auth();
  if (session?.user?.id) {
    return { ok: true, identity: { kind: "user", userId: session.user.id } };
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

export async function resolveOrgIdFromIdentity(identity: V1Identity): Promise<string | null> {
  if (identity.kind === "workspace") return identity.orgId;
  const [row] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, identity.userId))
    .limit(1);
  return row?.orgId ?? null;
}

// Verifies a user identity is authorized to write to a specific workspace.
// Four paths: (1) organizations.ownerId, (2) organizations.parentUserId,
// (3) users.orgId (primary org, may predate org_members), (4) org_members entry.
// Matches the vectors used by listManagedOrganizations + /switch-workspace.
export async function userCanWriteWorkspace(
  userId: string,
  orgId: string
): Promise<boolean> {
  const [owned] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, orgId),
        or(
          eq(organizations.ownerId, userId),
          eq(organizations.parentUserId, userId)
        )
      )
    )
    .limit(1);
  if (owned?.id) return true;

  const [u] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (u?.orgId === orgId) return true;

  const [m] = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .limit(1);
  return Boolean(m?.orgId);
}

// Helper for routes that accept an optional workspace_id. For workspace-bearer
// identities, verifies the requested id matches the bearer's org. For user
// identities, falls back to the user's primary org if no id is provided, then
// verifies write access. Returns orgId or a NextResponse to short-circuit.
export async function resolveOrgIdForWrite(
  identity: V1Identity,
  requestedWorkspaceId: string | null | undefined
): Promise<
  { ok: true; orgId: string } | { ok: false; response: NextResponse }
> {
  const requested = requestedWorkspaceId?.trim() || "";

  if (identity.kind === "workspace") {
    if (requested && requested !== identity.orgId) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Bearer token does not authorize this workspace." },
          { status: 403 }
        ),
      };
    }
    return { ok: true, orgId: identity.orgId };
  }

  // user identity
  const target = requested || (await resolveOrgIdFromIdentity(identity));
  if (!target) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "workspace_id is required." },
        { status: 400 }
      ),
    };
  }

  const authorized = await userCanWriteWorkspace(identity.userId, target);
  if (!authorized) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You do not manage this workspace." },
        { status: 403 }
      ),
    };
  }
  return { ok: true, orgId: target };
}
