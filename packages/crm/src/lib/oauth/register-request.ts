export interface ParsedRegisterRequest {
  redirectUris: string[];
  clientName?: string;
}

export type ParseRegisterResult =
  | { ok: true; value: ParsedRegisterRequest }
  | { ok: false; error: string };

const MAX_CLIENT_NAME_LENGTH = 256;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

function isAcceptableRedirectUri(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) return true;
  return false;
}

/**
 * Validates an RFC 7591 registration request body. Open DCR (no auth on this
 * endpoint) means we cannot trust the caller AT ALL — every redirect_uri
 * offered here becomes part of the allowlist a future /oauth/authorize call
 * can redirect to, so this is the ONE gate standing between "anyone can
 * register a client" and "anyone can register a client with an open
 * redirect." HTTPS or loopback-http only — no plain http to a real host,
 * ever (see design doc §4, "No open redirects").
 */
export function parseRegisterRequest(body: unknown): ParseRegisterResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "invalid_request" };
  }
  const record = body as Record<string, unknown>;
  const redirectUrisRaw = record.redirect_uris;
  if (!Array.isArray(redirectUrisRaw) || redirectUrisRaw.length === 0) {
    return { ok: false, error: "invalid_request: redirect_uris must be a non-empty array" };
  }
  const redirectUris: string[] = [];
  for (const uri of redirectUrisRaw) {
    if (typeof uri !== "string" || !isAcceptableRedirectUri(uri)) {
      return { ok: false, error: `invalid_redirect_uri: ${String(uri)}` };
    }
    redirectUris.push(uri);
  }

  let clientName: string | undefined;
  if (typeof record.client_name === "string") {
    clientName = record.client_name.slice(0, MAX_CLIENT_NAME_LENGTH);
  }

  return { ok: true, value: { redirectUris, clientName } };
}
