// POST /api/v1/landing/r1/customize
//
// Apply a natural-language instruction to the current R1 landing payload.
// Auth: workspace bearer OR x-org-id + x-api-key (both handled by guardApiRequest).
// Also needs a userId — resolved from the workspace bearer's session or provided
// in the request body for API-key callers.
//
// Body: { workspace_id?: string, instruction: string }
//
// Note: workspace_id is resolved from the bearer's orgId if not provided.
// The route does NOT take byokKey from the request body — it is loaded from
// the org's integrations JSONB (same as getAIClient). The MCP tool passes
// workspace bearer auth so it goes through the same resolution.

import { NextResponse } from "next/server";
import { getAIClient } from "@/lib/ai/client";
import { customizeLandingR1 } from "@/lib/landing/r1-customize";
import { resolveR1Auth } from "@/lib/landing/r1-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Dual-path auth: session (in-app editor) OR workspace bearer (MCP).
  const authResult = await resolveR1Auth(request);
  if (!authResult.ok) return authResult.response;

  const { orgId, userId } = authResult;

  const body = (await request.json()) as {
    instruction?: unknown;
  };

  if (typeof body.instruction !== "string" || !body.instruction.trim()) {
    return NextResponse.json(
      { error: "instruction is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  // Resolve the AI client (BYOK → platform env fallback).
  const aiResolution = await getAIClient({ orgId });
  if (!aiResolution.client) {
    return NextResponse.json(
      {
        error: "no_ai_key",
        detail:
          "No Anthropic API key configured for this workspace. Add one at /settings/integrations.",
      },
      { status: 503 },
    );
  }

  // getAIClient returns a typed Anthropic instance — extract the raw key from
  // the client options to pass to the handler. The handler needs the key string
  // (it builds its own Anthropic instance) so we peek at the client's apiKey.
  const byokKey = (aiResolution.client as { apiKey?: string }).apiKey ?? "";

  const result = await customizeLandingR1({
    workspaceId: orgId,
    instruction: body.instruction,
    userId,
    byokKey,
  });

  if (!result.ok) {
    const status =
      result.reason === "no_landing_exists"
        ? 404
        : result.reason === "no_ai_key"
          ? 503
          : 422;
    return NextResponse.json(
      { error: result.reason, detail: result.detail },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    summary: result.summary,
    version_id: result.versionId,
  });
}
