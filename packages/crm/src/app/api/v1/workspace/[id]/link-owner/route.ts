import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { orgMembers, organizations, users } from "@/db/schema";
import { resolveUserIdFromSeldonApiKey } from "@/lib/auth/v1-identity";
import { resolveWorkspaceBearer } from "@/lib/auth/workspace-token";
import { buildWorkspaceUrls } from "@/lib/billing/anonymous-workspace";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";

const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

async function resolveClaimingUserId(request: Request): Promise<
  | { ok: true; userId: string; via: "api_key" | "session" }
  | { ok: false; response: NextResponse }
> {
  const apiKeyUserId = resolveUserIdFromSeldonApiKey(request.headers);
  const hasApiKeyHeader = Boolean(request.headers.get("x-seldon-api-key")?.trim());

  if (hasApiKeyHeader && !apiKeyUserId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid x-seldon-api-key." }, { status: 401 }),
    };
  }
  if (apiKeyUserId) {
    return { ok: true, userId: apiKeyUserId, via: "api_key" };
  }

  const session = await auth();
  if (session?.user?.id) {
    return { ok: true, userId: session.user.id, via: "session" };
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        error:
          "Ownership link requires a user identity. Provide x-seldon-api-key or sign in.",
      },
      { status: 401 }
    ),
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isDemoReadonly()) return demoApiBlockedResponse();
  assertWritable();

  const { id } = await params;
  const workspaceId = id.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace id is required." }, { status: 400 });
  }

  const bearer = await resolveWorkspaceBearer(request.headers);
  if (!bearer) {
    return NextResponse.json(
      {
        error:
          "Missing or invalid workspace bearer token. Pass Authorization: Bearer wst_… from the workspace you want to link.",
      },
      { status: 401 }
    );
  }

  if (bearer.orgId !== workspaceId) {
    return NextResponse.json(
      { error: "Bearer token does not authorize this workspace." },
      { status: 403 }
    );
  }

  const claim = await resolveClaimingUserId(request);
  if (!claim.ok) return claim.response;

  const [userRow] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, claim.userId))
    .limit(1);
  if (!userRow) {
    return NextResponse.json({ error: "Claiming user not found." }, { status: 404 });
  }

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      ownerId: organizations.ownerId,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);
  if (!org) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  if (org.ownerId) {
    if (org.ownerId === userRow.id) {
      // Already linked to this user — idempotent success.
      return NextResponse.json({
        ok: true,
        already_linked: true,
        workspace: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          owner_id: org.ownerId,
        },
        linked_to: { user_id: userRow.id, email: userRow.email ?? null, via: claim.via },
      });
    }
    return NextResponse.json(
      { error: "This workspace already has an owner.", code: "already_owned" },
      { status: 409 }
    );
  }

  // Atomic guard: only link if still unowned. Prevents a race if two callers
  // hit link-owner simultaneously; the loser gets 0 rows and we return 409.
  const [updated] = await db
    .update(organizations)
    .set({
      ownerId: userRow.id,
      parentUserId: userRow.id,
      updatedAt: new Date(),
    })
    .where(and(eq(organizations.id, workspaceId), isNull(organizations.ownerId)))
    .returning({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      ownerId: organizations.ownerId,
    });

  if (!updated) {
    return NextResponse.json(
      { error: "This workspace already has an owner.", code: "already_owned" },
      { status: 409 }
    );
  }

  // Best-effort membership upsert. Unique index on (org_id, user_id) prevents duplicates.
  await db
    .insert(orgMembers)
    .values({ orgId: workspaceId, userId: userRow.id, role: "owner" })
    .onConflictDoNothing({ target: [orgMembers.orgId, orgMembers.userId] });

  const urls = buildWorkspaceUrls(updated.slug, WORKSPACE_BASE_DOMAIN, updated.id);

  return NextResponse.json({
    ok: true,
    linked_at: new Date().toISOString(),
    workspace: {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      owner_id: updated.ownerId,
    },
    linked_to: {
      user_id: userRow.id,
      email: userRow.email ?? null,
      via: claim.via,
    },
    urls,
    next: [
      `Sign in at ${urls.admin_dashboard.split("?")[0]} to manage this workspace in the browser.`,
      "Your workspace bearer token continues to work for the MCP — no need to rotate.",
    ],
  });
}
