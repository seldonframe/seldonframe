// v1.10.0 — GET /api/v1/workspace/v2/blocks/[name]/regenerate
//
// Bundles everything the IDE agent needs to regenerate a single v2
// block: current_props (so the LLM iterates rather than starting fresh),
// workspace_summary (business name, industry, services, voice), brain
// patterns for this vertical, and the operator's new_instructions
// (passed via ?new_instructions=… query string).
//
// Thin harness: this route does NO creative work. The IDE agent's LLM
// generates new props from the bundle + the SKILL.md (fetched separately
// via get_block_skill or /api/v1/public/blocks/[name]/skill), then calls
// persist_block with the result.
//
// Auth: workspace bearer token (same as persist_block). Bearer's orgId
// must match the workspace_id used in the path.
//
// Response shape: see RegenerateContextOutput in
// src/lib/page-blocks/regenerate.ts.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import { getBlock } from "@/lib/page-blocks/registry";
import { loadRegenerateContext } from "@/lib/page-blocks/regenerate";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { name } = await params;
  const blockName = name?.trim() ?? "";

  if (!blockName || !getBlock(blockName)) {
    return NextResponse.json(
      {
        ok: false,
        error: "block_unknown",
        block_name: blockName,
        hint: "Use list_blocks to discover known blocks.",
      },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const newInstructions = url.searchParams.get("new_instructions") ?? undefined;

  const result = await loadRegenerateContext(
    guard.orgId,
    blockName,
    newInstructions,
  );

  if (!result) {
    // Workspace doesn't exist (or bearer/workspace mismatch). The
    // bearer is already org-scoped, so this means orgs row missing —
    // shouldn't happen in practice but return 404 for safety.
    return NextResponse.json(
      { ok: false, error: "workspace_not_found" },
      { status: 404 },
    );
  }

  logEvent(
    "v2_regenerate_block_context",
    {
      block_name: blockName,
      status: result.status,
      had_new_instructions: Boolean(newInstructions),
      brain_patterns_count: result.brain_patterns.length,
    },
    { request, orgId: guard.orgId, status: 200 },
  );

  return NextResponse.json({ ok: true, ...result }, { status: 200 });
}
