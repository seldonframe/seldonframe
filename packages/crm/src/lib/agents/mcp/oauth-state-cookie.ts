// Signed, single-use state cookie for the MCP OAuth connect flow.
//
// The cookie carries everything the callback needs to complete the PKCE code
// exchange (state, verifier, the DCR client, the target connector + org)
// without any server-side session storage. It's HMAC-signed (AUTH_SECRET) so
// a tampered value is rejected before the callback ever touches the token
// endpoint — a forged cookie can't smuggle in a different orgId or verifier.
//
// Format: `${base64url(json)}.${base64url(hmacSha256(base64url(json), secret))}`.
// Verification uses a constant-time comparison (crypto.timingSafeEqual) so a
// byte-by-byte signature guess can't be timed out of the server.

import crypto from "node:crypto";
import { z } from "zod";

export const MCP_OAUTH_COOKIE = "sf_mcp_oauth";

export type McpOauthState = {
  v: 1;
  state: string;
  verifier: string;
  connectorId: string;
  orgId: string;
  clientId: string;
  clientSecret?: string;
  tokenEndpoint: string;
  scopes: string[];
  /** Epoch ms; the cookie is rejected once now() > exp. */
  exp: number;
};

const mcpOauthStateSchema: z.ZodType<McpOauthState> = z.object({
  v: z.literal(1),
  state: z.string().min(1),
  verifier: z.string().min(1),
  connectorId: z.string().min(1),
  orgId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().optional(),
  tokenEndpoint: z.string().min(1),
  scopes: z.array(z.string()),
  exp: z.number(),
}) as z.ZodType<McpOauthState>;

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hmac(payloadB64: string, secret: string): string {
  return base64url(crypto.createHmac("sha256", secret).update(payloadB64).digest());
}

export function signMcpOauthState(payload: McpOauthState, secret: string): string {
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = hmac(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

/** Constant-time signature compare — returns false (never throws) on any
 *  length mismatch or decoding error. */
function timingSafeEqualB64(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Verify + decode a signed state-cookie value. Returns null (never throws)
 * on: malformed shape, signature mismatch (constant-time compare), decode
 * failure, schema mismatch, or an expired `exp`.
 */
export function verifyMcpOauthState(
  cookieValue: string,
  secret: string,
  now: () => number = Date.now,
): McpOauthState | null {
  if (typeof cookieValue !== "string") return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expectedSig = hmac(payloadB64, secret);
  if (!timingSafeEqualB64(sig, expectedSig)) return null;

  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }

  const result = mcpOauthStateSchema.safeParse(json);
  if (!result.success) return null;

  if (now() > result.data.exp) return null;

  return result.data;
}
