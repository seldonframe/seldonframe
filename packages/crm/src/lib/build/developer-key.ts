// Developer API key — the IDE connect snippet (spec 1ff09dcb, P0 Task 3).
//
// SeldonFrame already has a complete, secure, reveal-once key surface at
// /settings/api (mintApiKeyAction / revokeApiKeyAction → mintWorkspaceToken →
// the api_keys table). It mints a long-lived `user:`-prefixed workspace bearer
// (wst_…) that the SeldonFrame MCP server accepts as both SELDONFRAME_API_KEY
// AND `Authorization: Bearer wst_…`. So the builder key path REUSES that — we do
// NOT add a second mint/revoke implementation.
//
// The one net-new pure bit a BUILDER needs (and the dashboard didn't show) is
// the MCP connector command: how to wire the freshly minted key into the IDE
// over Streamable HTTP. That snippet is rendered both in the reveal panel and in
// SKILL.md, so it lives here, pure and unit-tested.

/** Build the copy-paste `claude mcp add` command that connects an IDE agent to
 *  the SeldonFrame MCP over Streamable HTTP, authenticating with the raw key.
 *  Pure: same inputs → same string. */
export function buildMcpConnectSnippet(rawKey: string, mcpUrl: string): string {
  return [
    `claude mcp add seldonframe --transport http ${mcpUrl} \\`,
    `  --header "Authorization: Bearer ${rawKey}"`,
  ].join("\n");
}
