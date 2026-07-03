export interface ParsedAuthorizeRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  resource?: string;
}

export type ParseAuthorizeResult =
  | { ok: true; value: ParsedAuthorizeRequest }
  | { ok: false; error: string };

/**
 * Validates the /oauth/authorize query string BEFORE we render anything or
 * touch the DB. response_type MUST be "code" (this AS never supports
 * implicit grant) and code_challenge_method MUST be literally "S256" — any
 * other value (including the legacy "plain") is rejected here, at the very
 * first gate, not silently downgraded downstream. state and resource are
 * both optional to the SERVER (client MUST send resource per RFC 8707, but
 * the server tolerating its absence is safer than hard-failing a client
 * that's otherwise spec-compliant on every other dimension).
 */
export function parseAuthorizeRequest(params: URLSearchParams): ParseAuthorizeResult {
  if (params.get("response_type") !== "code") {
    return { ok: false, error: "unsupported_response_type" };
  }
  if (params.get("code_challenge_method") !== "S256") {
    return { ok: false, error: "invalid_request: code_challenge_method must be S256" };
  }
  const clientId = params.get("client_id");
  if (!clientId) return { ok: false, error: "invalid_request: missing client_id" };
  const redirectUri = params.get("redirect_uri");
  if (!redirectUri) return { ok: false, error: "invalid_request: missing redirect_uri" };
  const codeChallenge = params.get("code_challenge");
  if (!codeChallenge) return { ok: false, error: "invalid_request: missing code_challenge" };

  return {
    ok: true,
    value: {
      clientId,
      redirectUri,
      codeChallenge,
      state: params.get("state") ?? undefined,
      resource: params.get("resource") ?? undefined,
    },
  };
}
