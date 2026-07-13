// GET /api/integrations/mcp/callback — the MCP OAuth connect flow's redirect
// target (mirrors Composio's hosted-consent callback shape). Per L-31, this
// file exports ONLY the HTTP verb + runtime config; all decision logic lives
// in lib/agents/mcp/oauth-callback.ts (handleMcpOauthCallback), unit-tested
// there with injected deps — this file wires the REAL cookie/session/secret
// store + inline OAuth client around it.

import { NextResponse, type NextRequest } from "next/server";
import { getOrgId } from "@/lib/auth/helpers";
import { storeSecret } from "@/lib/secrets";
import { exchangeCode } from "@/lib/agents/mcp/oauth";
import { discoverVettedToolsLive } from "@/lib/agents/mcp/discover-vetted-tools";
import { MCP_OAUTH_COOKIE } from "@/lib/agents/mcp/oauth-state-cookie";
import { handleMcpOauthCallback } from "@/lib/agents/mcp/oauth-callback";

export const runtime = "nodejs";

function resolveAuthSecret(): string {
  return process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim() || "";
}

function resolveAppOrigin(): string {
  return (process.env.NEXTAUTH_URL?.trim() || "https://app.seldonframe.com").replace(/\/+$/, "");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const result = await handleMcpOauthCallback(
    { code: searchParams.get("code"), state: searchParams.get("state") },
    {
      getCookie: (name) => request.cookies.get(name)?.value,
      resolveSessionOrgId: async () => getOrgId(),
      storeSecret: async ({ workspaceId, serviceName, value }) =>
        storeSecret({ workspaceId, serviceName, value }),
      exchange: exchangeCode,
      probeTools: async (orgId, connectorId) => {
        try {
          const tools = await discoverVettedToolsLive(orgId, connectorId);
          return tools.length;
        } catch {
          return null;
        }
      },
      redirectUri: `${resolveAppOrigin()}/api/integrations/mcp/callback`,
      authSecret: resolveAuthSecret(),
    },
  );

  const response = NextResponse.redirect(new URL(result.redirect, request.url));
  if (result.clearCookie) {
    response.cookies.delete(MCP_OAUTH_COOKIE);
  }
  return response;
}
