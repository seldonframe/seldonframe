import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { seedInitialBlocks } from "@/lib/soul-compiler/blocks";
import { demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { logEvent } from "@/lib/observability/log";

/**
 * v1.47 — generate (or regenerate) the landing page for an existing
 * workspace. Called as an opt-in follow-up after create_workspace_from_url
 * (which skips landing-page generation by default).
 *
 * Body: { workspace_id, style? }
 *   workspace_id: org UUID (required)
 *   style: optional archetype override; currently ignored (uses soul-based default)
 *
 * Returns: { ok, workspace_id, landing_url }
 */

type GenerateLandingPageBody = {
  workspace_id?: unknown;
  style?: unknown;
};

const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

export async function POST(request: Request) {
  const startedAt = Date.now();

  if (isDemoReadonly()) {
    return demoApiBlockedResponse();
  }

  const body = (await request.json().catch(() => ({}))) as GenerateLandingPageBody;
  const workspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";

  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspace_id is required" },
      { status: 400 }
    );
  }

  // Load the workspace's soul (needed for base_framework).
  const [org] = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      soul: organizations.soul,
    })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });
  }

  if (!org.soul) {
    return NextResponse.json(
      {
        error:
          "workspace_has_no_soul — generate-landing-page requires the workspace to have been created via the soul-compile path (URL or description input).",
      },
      { status: 422 }
    );
  }

  const baseFramework =
    ((org.soul as { base_framework?: string }).base_framework as
      | "coaching"
      | "agency"
      | "consulting"
      | "f1-landing-waitlist"
      | "f2-saas-launch"
      | undefined) ?? "coaching";

  try {
    await seedInitialBlocks(org.id, baseFramework);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "landing_page_generation_failed";
    logEvent(
      "generate_landing_page_failed",
      { workspace_id: workspaceId, error: message },
      { request, status: 500, durationMs: Date.now() - startedAt, severity: "error" }
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const subdomainUrl = `https://${org.slug}.${WORKSPACE_BASE_DOMAIN}`;

  logEvent(
    "generate_landing_page_succeeded",
    { workspace_id: workspaceId, slug: org.slug },
    { request, status: 200, durationMs: Date.now() - startedAt }
  );

  return NextResponse.json({
    ok: true,
    workspace_id: workspaceId,
    landing_url: subdomainUrl,
  });
}
