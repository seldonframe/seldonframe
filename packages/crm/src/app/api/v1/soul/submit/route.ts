import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { resolveV1Identity } from "@/lib/auth/v1-identity";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { logEvent } from "@/lib/observability/log";
import { applyPipelineStagesFromSoul } from "@/lib/soul/apply-pipeline-stages";

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

  // April 30, 2026 (B6) — re-seed the workspace's pipeline stages from
  // soul.pipeline_stages if present. Idempotent: no-op when the Soul
  // doesn't carry stages or the existing pipeline already matches.
  // Best-effort: failures log but don't fail the Soul submission.
  let pipelineUpdate: { changed: boolean; stages: unknown } = {
    changed: false,
    stages: null,
  };
  try {
    const result = await applyPipelineStagesFromSoul(
      orgId,
      body.soul as Record<string, unknown>,
      null
    );
    pipelineUpdate = { changed: result.changed, stages: result.stages };
  } catch (err) {
    console.warn("[soul/submit] pipeline re-seed failed:", err);
  }

  logEvent(
    "soul_submit",
    {
      bytes: soulJson.length,
      pipeline_stages_updated: pipelineUpdate.changed,
    },
    { request, identity, orgId, status: 200 }
  );

  return NextResponse.json({
    ok: true,
    workspace: {
      id: updated.id,
      slug: updated.slug,
      soul_completed_at: updated.soulCompletedAt?.toISOString() ?? null,
    },
    bytes: soulJson.length,
    pipeline_stages_updated: pipelineUpdate.changed,
    next: [
      "get_workspace_snapshot({}) — subsequent snapshots now include the submitted Soul under `soul.data`.",
    ],
  });
}
