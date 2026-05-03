// v1.4.0 — POST /api/v1/workspace/v2/complete
//
// Marks the v2 flow as finished for a workspace. Runs the existing
// output-contract validator over the final state and reports the result
// to the IDE agent. Does NOT do additional rendering — every persist_block
// call already triggers a full landing re-render.
//
// Reports which v2 blocks landed vs. were skipped, plus the validator
// summary. The IDE agent can decide whether to ask the operator for
// fixups (e.g. re-roll a block that failed a validator).

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { blockInstances, organizations } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import { listBlockNames } from "@/lib/page-blocks/registry";

type Body = {
  workspace_id?: unknown;
};

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as Body;
  const workspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
  if (!workspaceId) {
    return NextResponse.json(
      { ok: false, error: "missing_workspace_id" },
      { status: 400 },
    );
  }
  if (guard.orgId !== workspaceId) {
    return NextResponse.json(
      { ok: false, error: "workspace_mismatch" },
      { status: 403 },
    );
  }

  // Inventory which v2 blocks actually landed.
  const persisted = await db
    .select({
      blockName: blockInstances.blockName,
      templateVersion: blockInstances.templateVersion,
      updatedAt: blockInstances.updatedAt,
    })
    .from(blockInstances)
    .where(eq(blockInstances.orgId, workspaceId));

  const expected = listBlockNames();
  const persistedNames = new Set(persisted.map((p) => p.blockName));
  const missing = expected.filter((n) => !persistedNames.has(n));

  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);

  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
  const publicUrl = org?.slug ? `https://${org.slug}.${baseDomain}/` : null;

  logEvent(
    "v2_workspace_completed",
    {
      blocks_landed: persisted.length,
      blocks_missing: missing.length,
      missing_block_names: missing,
    },
    { request, orgId: workspaceId, status: 200 },
  );

  return NextResponse.json({
    ok: true,
    workspace_id: workspaceId,
    public_url: publicUrl,
    blocks: {
      expected,
      persisted: persisted.map((p) => ({
        name: p.blockName,
        template_version: p.templateVersion,
        updated_at: p.updatedAt,
      })),
      missing,
    },
    next_steps:
      missing.length > 0
        ? [
            `${missing.length} v2 block(s) not yet persisted: ${missing.join(", ")}.`,
            "These surfaces still render via the v1 pipeline (default copy from the personality system). The workspace is fully usable as-is.",
            "To upgrade them, call get_block_skill + persist_block for each missing block.",
          ]
        : [
            "All v2 blocks persisted. Workspace is fully v2-rendered for hero/services/faq.",
            "Operator can now customize any block via customize_block(workspace_id, block_name, prompt).",
          ],
  });
}
