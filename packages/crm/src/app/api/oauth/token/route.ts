// POST /api/oauth/token — RFC 6749 token endpoint. MUST accept
// application/x-www-form-urlencoded (Anthropic's docs are explicit: "Claude
// sends both the initial token exchange and refresh requests with this
// content type" — design doc §1.2). Do NOT parse this as JSON.
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import crypto from "node:crypto";
import { db } from "@/db";
import { oauthAuthorizationCodes, oauthRefreshTokens } from "@/db/schema";
import { validateCodeRedemption } from "@/lib/oauth/redeem-authorization-code";
import { hashOauthSecret, generateRefreshToken } from "@/lib/oauth/tokens";
import { mintWorkspaceToken } from "@/lib/auth/workspace-token";
import { checkRateLimit } from "@/lib/utils/rate-limit";

export const runtime = "nodejs";

const ACCESS_TOKEN_EXPIRY_MINUTES = 60;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

export async function POST(request: Request) {
  if (process.env.SF_OAUTH_ENABLED !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const form = await request.formData();
  const grantType = String(form.get("grant_type") ?? "");
  const clientId = String(form.get("client_id") ?? "");

  if (!(await checkRateLimit(`oauth:token:${clientId || "unknown"}`, 60, 60_000))) {
    return NextResponse.json({ error: "invalid_request" }, { status: 429 });
  }

  if (grantType === "authorization_code") {
    return handleAuthorizationCodeGrant(form, clientId);
  }
  if (grantType === "refresh_token") {
    // Implemented in Task 13 — placeholder wiring only in this task.
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  }
  return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
}

async function handleAuthorizationCodeGrant(form: FormData, clientId: string): Promise<NextResponse> {
  const code = String(form.get("code") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const codeVerifier = String(form.get("code_verifier") ?? "");

  if (!code || !clientId || !redirectUri || !codeVerifier) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const codeHash = hashOauthSecret(code);
  const [storedCode] = await db
    .select({
      id: oauthAuthorizationCodes.id,
      clientId: oauthAuthorizationCodes.clientId,
      redirectUri: oauthAuthorizationCodes.redirectUri,
      codeChallenge: oauthAuthorizationCodes.codeChallenge,
      orgId: oauthAuthorizationCodes.orgId,
      userId: oauthAuthorizationCodes.userId,
      expiresAt: oauthAuthorizationCodes.expiresAt,
      consumedAt: oauthAuthorizationCodes.consumedAt,
    })
    .from(oauthAuthorizationCodes)
    .where(eq(oauthAuthorizationCodes.codeHash, codeHash))
    .limit(1);

  const validation = validateCodeRedemption({
    storedCode: storedCode ?? null,
    presentedClientId: clientId,
    presentedRedirectUri: redirectUri,
    presentedCodeVerifier: codeVerifier,
    now: new Date(),
  });

  if (!validation.ok || !storedCode) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  // Atomic single-use enforcement: only mark consumed if it's STILL
  // unconsumed at write time (defends a concurrent double-redemption race
  // that a read-then-check can't catch alone).
  const consumed = await db
    .update(oauthAuthorizationCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(oauthAuthorizationCodes.id, storedCode.id), isNull(oauthAuthorizationCodes.consumedAt)))
    .returning({ id: oauthAuthorizationCodes.id });

  if (consumed.length === 0) {
    // Someone else redeemed it in the race window between our SELECT and
    // this UPDATE — treat identically to "already consumed".
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  const minted = await mintWorkspaceToken(storedCode.orgId, {
    name: `oauth:${clientId}`,
    kind: "oauth",
    expiresInMinutes: ACCESS_TOKEN_EXPIRY_MINUTES,
  });

  const refreshTokenRaw = generateRefreshToken();
  const familyId = crypto.randomUUID();
  await db.insert(oauthRefreshTokens).values({
    tokenHash: hashOauthSecret(refreshTokenRaw),
    familyId,
    clientId,
    orgId: storedCode.orgId,
    userId: storedCode.userId,
    apiKeyId: minted.tokenId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
  });

  return NextResponse.json({
    access_token: minted.token,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_EXPIRY_MINUTES * 60,
    refresh_token: refreshTokenRaw,
  });
}
