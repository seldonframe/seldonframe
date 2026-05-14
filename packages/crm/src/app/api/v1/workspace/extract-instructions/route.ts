// packages/crm/src/app/api/v1/workspace/extract-instructions/route.ts
//
// 2026-05-14 — Pure-data endpoint that returns a "playbook" for URL-based
// workspace creation. No fetching, no LLM, no auth. The MCP tool
// `create_workspace_from_url` proxies this response to Claude in CC. Claude
// then runs WebFetch + extraction itself per the instructions.
//
// Spec: docs/superpowers/specs/2026-05-14-pull-firecrawl-out-of-backend-design.md

import { NextResponse } from "next/server";
import {
  EXTRACTION_INSTRUCTIONS,
  REQUIRED_FIELDS_SCHEMA,
} from "@/lib/soul-compiler/url-extraction-instructions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json(
      { error: "missing ?url param" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    status: "instructions",
    url_echo: url,
    instructions: EXTRACTION_INSTRUCTIONS.replace("{url_echo}", url).replace(
      "{url_echo}",
      url
    ),
    required_fields_schema: REQUIRED_FIELDS_SCHEMA,
    next_tool: "create_workspace_v2",
  });
}
