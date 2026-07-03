export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
}

/**
 * RFC 9728 protected-resource metadata builder. `resource` MUST be the
 * exact literal MCP server URL as a user types it into claude.ai's "Add
 * custom connector" field — Anthropic's docs are explicit that this field
 * "must match your MCP server URL exactly... including any path component"
 * (see design doc §1.2). `authorization_servers` is a single-entry array
 * because this AS is co-located and there is exactly one issuer — per
 * Anthropic's docs, "Claude uses the first entry and does not fall back to
 * later entries," so an accidental second entry here would be silently
 * ignored at best, confusing at worst. Keep it single-entry deliberately.
 */
export function buildProtectedResourceMetadata(params: {
  mcpResourceUrl: string;
  authorizationServerIssuer: string;
}): ProtectedResourceMetadata {
  return {
    resource: params.mcpResourceUrl,
    authorization_servers: [params.authorizationServerIssuer],
  };
}
