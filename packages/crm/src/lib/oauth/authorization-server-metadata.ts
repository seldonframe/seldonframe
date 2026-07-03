export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
}

/**
 * RFC 8414 Authorization Server Metadata. code_challenge_methods_supported
 * MUST be exactly ["S256"] — its absence tells an MCP client "this AS
 * doesn't support PKCE" per spec, and advertising "plain" would contradict
 * this design's S256-only enforcement (see pkce.ts). token_endpoint_auth_methods_supported
 * is ["none"] because this AS only registers public clients (no client
 * secret ever issued) — see design doc §3.2.
 */
export function buildAuthorizationServerMetadata(params: { issuer: string }): AuthorizationServerMetadata {
  const issuer = params.issuer.replace(/\/+$/, "");
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  };
}
