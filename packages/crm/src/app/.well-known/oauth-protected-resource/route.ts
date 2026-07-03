// RFC 9728 Protected Resource Metadata for mcp.seldonframe.com/v1 — served on
// the MCP host itself (design doc §2.4: this path is deliberately OUTSIDE
// proxy.ts's config.matcher, mirroring the two existing .well-known
// precedents — src/app/api/ap2/.well-known/route.ts and
// src/app/.well-known/openai-apps-challenge/route.ts — both public, static,
// unauthenticated, and never touched by authProxy).
//
// SF_OAUTH_ENABLED gate: 404 when unset/false. This must be the FIRST check
// in the handler body, before any other logic.
import { NextResponse } from "next/server";
import { buildProtectedResourceMetadata } from "@/lib/oauth/protected-resource-metadata";

export const runtime = "nodejs";

const MCP_RESOURCE_URL = "https://mcp.seldonframe.com/v1";
const AUTHORIZATION_SERVER_ISSUER = "https://app.seldonframe.com";

export async function GET() {
  if (process.env.SF_OAUTH_ENABLED !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const metadata = buildProtectedResourceMetadata({
    mcpResourceUrl: MCP_RESOURCE_URL,
    authorizationServerIssuer: AUTHORIZATION_SERVER_ISSUER,
  });

  return NextResponse.json(metadata, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
