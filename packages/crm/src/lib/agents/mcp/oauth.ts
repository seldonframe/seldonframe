// Inline OAuth 2.1 client for MCP connectors (RFC 8414 discovery, RFC 7591
// Dynamic Client Registration, PKCE S256). SDK not in the lockfile (L-17) —
// this is a minimal, dependency-free client covering exactly the flow a
// vetted OAuth-authType connector needs: discover the authorization server →
// register a client → build the consent URL → exchange the code → refresh.
//
// Grounded in the live Circle probe (design spec §1, 2026-07-13):
//   - Circle's `/.well-known/oauth-protected-resource` returns 200 **HTML**
//     (its SPA fallback — RFC 9728 is NOT implemented). Any real success here
//     MUST be JSON + the right shape, or we'd silently "discover" a bogus
//     issuer from Circle's marketing page.
//   - `/.well-known/oauth-authorization-server` at the MCP endpoint's own
//     origin (issuer root) returns valid RFC 8414 metadata: DCR is live at
//     `/oauth/register`, `code_challenge_methods: ["S256"]`,
//     `token_endpoint_auth_methods: ["client_secret_post","none"]`,
//     `scopes_supported: ["read","write"]`.
//   - No `refresh_token` grant advertised — refresh is OPTIONAL (store one if
//     the token response includes it; otherwise the connector re-connects on
//     expiry/401).
//
// SECURITY: HTTPS-only (mirrors client.ts's assertHttps); every network call
// carries a 10s AbortController timeout; a non-2xx token-endpoint response is
// mapped to a sanitized error (token-shaped substrings redacted) — never echo
// raw provider bodies that might carry a leaked secret.

import { z } from "zod";
import crypto from "node:crypto";

const DISCOVERY_TIMEOUT_MS = 10_000;

// ─── base64url + PKCE + state ────────────────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function generateStateToken(): string {
  return base64url(crypto.randomBytes(32));
}

// ─── HTTPS guard (mirrors client.ts's assertHttps) ───────────────────────────

function assertHttpsUrl(url: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} is not a valid URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must use https:// (got ${parsed.protocol}//…)`);
  }
  return parsed;
}

// ─── sanitized error bodies (never echo a leaked token-shaped value) ─────────

/** Redact anything that could be a token/secret (long opaque strings) before
 *  it ever reaches a thrown error message. */
function sanitizeBody(text: string): string {
  return text.slice(0, 200).replace(/[A-Za-z0-9_\-.]{20,}/g, "…");
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── AS metadata (RFC 8414) ──────────────────────────────────────────────────

export type AsMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
  scopes_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
};

const asMetadataSchema = z
  .object({
    issuer: z.string().url(),
    authorization_endpoint: z.string().url(),
    token_endpoint: z.string().url(),
    registration_endpoint: z.string().url().optional(),
    code_challenge_methods_supported: z.array(z.string()).optional(),
    scopes_supported: z.array(z.string()).optional(),
    token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
  })
  .passthrough();

async function tryFetchJsonObject(
  fetchImpl: typeof fetch,
  url: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchWithTimeout(
      fetchImpl,
      url,
      { method: "GET", headers: { accept: "application/json" } },
      DISCOVERY_TIMEOUT_MS,
    );
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return null; // Circle's HTML SPA fallback lands here.
    const text = await res.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Discover the OAuth authorization server metadata for an MCP endpoint.
 *   1. Try RFC 9728 protected-resource metadata (both the pathname-scoped and
 *      root well-known URLs) — if it's valid JSON with a non-empty
 *      `authorization_servers[]`, use its first entry as the issuer.
 *   2. Fetch RFC 8414 metadata at the issuer root (default issuer = the MCP
 *      endpoint's own origin — what Circle uses today).
 * A candidate only counts if it's 200 + `application/json` + zod-parses to
 * `AsMetadata`. All candidates failing throws a descriptive error.
 */
export async function discoverAuthServer(
  mcpEndpoint: string,
  deps?: { fetchImpl?: typeof fetch },
): Promise<AsMetadata> {
  const parsedEndpoint = assertHttpsUrl(mcpEndpoint, "MCP endpoint");
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const origin = parsedEndpoint.origin;

  // Step 1: RFC 9728 protected-resource metadata (pathname-scoped, then root).
  let issuerOrigin = origin;
  const protectedResourceUrls = [
    `${origin}/.well-known/oauth-protected-resource${parsedEndpoint.pathname}`,
    `${origin}/.well-known/oauth-protected-resource`,
  ];
  for (const url of protectedResourceUrls) {
    const body = await tryFetchJsonObject(fetchImpl, url);
    const servers = body?.authorization_servers;
    if (Array.isArray(servers) && servers.length > 0 && typeof servers[0] === "string") {
      try {
        issuerOrigin = new URL(servers[0]).origin;
      } catch {
        continue;
      }
      break;
    }
  }

  // Step 2: RFC 8414 metadata at the issuer root.
  const metadataUrl = `${issuerOrigin}/.well-known/oauth-authorization-server`;
  const body = await tryFetchJsonObject(fetchImpl, metadataUrl);
  if (body) {
    const parsed = asMetadataSchema.safeParse(body);
    if (parsed.success) {
      return parsed.data as AsMetadata;
    }
  }

  throw new Error(`MCP auth discovery failed for ${origin}: no valid OAuth metadata`);
}

// ─── registerClient (RFC 7591 DCR) ───────────────────────────────────────────

const dcrResponseSchema = z
  .object({
    client_id: z.string().min(1),
    client_secret: z.string().optional(),
  })
  .passthrough();

export async function registerClient(input: {
  metadata: AsMetadata;
  redirectUri: string;
  clientName: string;
  fetchImpl?: typeof fetch;
}): Promise<{ client_id: string; client_secret?: string }> {
  const { metadata, redirectUri, clientName } = input;
  const fetchImpl = input.fetchImpl ?? fetch;
  if (!metadata.registration_endpoint) {
    throw new Error(
      "MCP auth server has no registration_endpoint — dynamic client registration is unsupported; a pre-registered client_id is required",
    );
  }
  assertHttpsUrl(metadata.registration_endpoint, "registration_endpoint");

  const supportsNone =
    !metadata.token_endpoint_auth_methods_supported ||
    metadata.token_endpoint_auth_methods_supported.includes("none");
  const authMethod = supportsNone ? "none" : "client_secret_post";

  const res = await fetchWithTimeout(
    fetchImpl,
    metadata.registration_endpoint,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_name: clientName,
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: authMethod,
      }),
    },
    DISCOVERY_TIMEOUT_MS,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MCP client registration failed: HTTP ${res.status}${text ? `: ${sanitizeBody(text)}` : ""}`);
  }

  const rawText = await res.text();
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`MCP client registration returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const result = dcrResponseSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error("MCP client registration response missing a valid client_id");
  }
  return { client_id: result.data.client_id, client_secret: result.data.client_secret };
}

// ─── buildAuthorizeUrl ───────────────────────────────────────────────────────

export function buildAuthorizeUrl(input: {
  metadata: AsMetadata;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(input.metadata.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

// ─── token envelope ───────────────────────────────────────────────────────────

export type TokenEnvelope = {
  v: 1;
  kind: "oauth";
  access_token: string;
  refresh_token?: string;
  /** Epoch ms when access_token expires (absent = treat as non-expiring). */
  expires_at?: number;
  scope?: string;
  token_endpoint: string;
  client_id: string;
  client_secret?: string;
  obtained_at: number;
  /** Set by the callback's fail-soft tools probe; display-only. */
  discovered_tools_count?: number;
};

export const tokenEnvelopeSchema: z.ZodType<TokenEnvelope> = z.object({
  v: z.literal(1),
  kind: z.literal("oauth"),
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_at: z.number().optional(),
  scope: z.string().optional(),
  token_endpoint: z.string().min(1),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
  obtained_at: z.number(),
  discovered_tools_count: z.number().optional(),
}) as z.ZodType<TokenEnvelope>;

/** Parse a stored secret string as a TokenEnvelope. Returns null on ANY
 *  failure (garbage JSON, wrong shape, a plain-bearer legacy string) — callers
 *  treat null as "not an OAuth envelope" (resolve-bearer.ts falls back to
 *  legacy plain-string handling for that case). Never throws. */
export function parseTokenEnvelope(raw: string): TokenEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = tokenEnvelopeSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

// ─── token endpoint calls (exchange + refresh) ───────────────────────────────

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    token_type: z.string().optional(),
    expires_in: z.number().optional(),
    refresh_token: z.string().optional(),
    scope: z.string().optional(),
  })
  .passthrough();

async function postToken(
  fetchImpl: typeof fetch,
  tokenEndpoint: string,
  body: URLSearchParams,
): Promise<z.infer<typeof tokenResponseSchema>> {
  assertHttpsUrl(tokenEndpoint, "token_endpoint");
  const res = await fetchWithTimeout(
    fetchImpl,
    tokenEndpoint,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: body.toString(),
    },
    DISCOVERY_TIMEOUT_MS,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MCP token endpoint returned HTTP ${res.status}${text ? `: ${sanitizeBody(text)}` : ""}`);
  }

  const rawText = await res.text();
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`MCP token endpoint returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const result = tokenResponseSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error("MCP token endpoint response missing a valid access_token");
  }
  return result.data;
}

export async function exchangeCode(input: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<TokenEnvelope> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? Date.now;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    client_id: input.clientId,
  });
  if (input.clientSecret) body.set("client_secret", input.clientSecret);

  const token = await postToken(fetchImpl, input.tokenEndpoint, body);
  const obtainedAt = now();

  return {
    v: 1,
    kind: "oauth",
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: token.expires_in ? obtainedAt + token.expires_in * 1000 : undefined,
    scope: token.scope,
    token_endpoint: input.tokenEndpoint,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    obtained_at: obtainedAt,
  };
}

export async function refreshTokens(input: {
  envelope: TokenEnvelope;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<TokenEnvelope> {
  const { envelope } = input;
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? Date.now;

  if (!envelope.refresh_token) {
    throw new Error("Cannot refresh: envelope has no refresh_token");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: envelope.refresh_token,
    client_id: envelope.client_id,
  });
  if (envelope.client_secret) body.set("client_secret", envelope.client_secret);

  const token = await postToken(fetchImpl, envelope.token_endpoint, body);
  const obtainedAt = now();

  return {
    v: 1,
    kind: "oauth",
    access_token: token.access_token,
    // Rotation-optional (RFC 6749 §6): keep the old refresh_token when the
    // response omits a new one.
    refresh_token: token.refresh_token ?? envelope.refresh_token,
    expires_at: token.expires_in ? obtainedAt + token.expires_in * 1000 : undefined,
    scope: token.scope ?? envelope.scope,
    token_endpoint: envelope.token_endpoint,
    client_id: envelope.client_id,
    client_secret: envelope.client_secret,
    obtained_at: obtainedAt,
  };
}
