import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { resolveV1Identity } from "@/lib/auth/v1-identity";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";

type SubmitSoulBody = {
  soul?: unknown;
  workspace_id?: unknown;
};

const MAX_SOUL_BYTES = 64 * 1024;

export async function POST(request: Request) {
  if (isDemoReadonly()) return demoApiBlockedResponse();
  assertWritable();

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const body = (await request.json().catch(() => ({}))) as SubmitSoulBody;
  const requestedId = typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";

  let orgId: string;
  if (identity.kind === "workspace") {
    if (requestedId && requestedId !== identity.orgId) {
      return NextResponse.json(
        { error: "Bearer token does not authorize this workspace." },
        { status: 403 }
      );
    }
    orgId = identity.orgId;
  } else {
    if (!requestedId) {
      return NextResponse.json({ error: "workspace_id is required." }, { status: 400 });
    }
    orgId = requestedId;
  }

  if (!body.soul || typeof body.soul !== "object") {
    return NextResponse.json({ error: "soul (object) is required." }, { status: 400 });
  }

  const soulJson = JSON.stringify(body.soul);
  if (soulJson.length > MAX_SOUL_BYTES) {
    return NextResponse.json(
      { error: `soul exceeds ${MAX_SOUL_BYTES} bytes.` },
      { status: 413 }
    );
  }

  const [updated] = await db
    .update(organizations)
    .set({
      soul: body.soul as typeof organizations.$inferInsert.soul,
      soulCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId))
    .returning({
      id: organizations.id,
      slug: organizations.slug,
      soulCompletedAt: organizations.soulCompletedAt,
    });

  if (!updated) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    workspace: {
      id: updated.id,
      slug: updated.slug,
      soul_completed_at: updated.soulCompletedAt?.toISOString() ?? null,
    },
    bytes: soulJson.length,
    next: [
      "get_workspace_snapshot({}) — subsequent snapshots now include the submitted Soul under `soul.data`.",
    ],
  });
}
