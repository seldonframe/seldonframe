// POST /api/oauth/token — RFC 6749 token endpoint. MUST accept
// application/x-www-form-urlencoded (Anthropic's docs are explicit: "Claude
// sends both the initial token exchange and refresh requests with this
// content type" — design doc §1.2). Do NOT parse this as JSON.
import { NextResponse } from "next/server";
import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import crypto from "node:crypto";
import { db } from "@/db";
import { apiKeys, oauthAuthorizationCodes, oauthRefreshTokens } from "@/db/schema";
import { validateCodeRedemption } from "@/lib/oauth/redeem-authorization-code";
import { decideRefreshOutcome } from "@/lib/oauth/rotate-refresh-token";
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
    // RFC 6749 doesn't define a rate-limit error code, but "slow_down" is the
    // established convention (used by RFC 8628 device-flow polling and widely
    // adopted for token-endpoint throttling) — "invalid_request" incorrectly
    // implies a malformed request, which would make a well-behaved client
    // retry with different params instead of simply backing off.
    return NextResponse.json({ error: "slow_down" }, { status: 429 });
  }

  if (grantType === "authorization_code") {
    return handleAuthorizationCodeGrant(form, clientId);
  }
  if (grantType === "refresh_token") {
    return handleRefreshTokenGrant(form, clientId);
  }
  return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
}

async function handleRefreshTokenGrant(form: FormData, clientId: string): Promise<NextResponse> {
  const presentedRefreshToken = String(form.get("refresh_token") ?? "");
  if (!presentedRefreshToken || !clientId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const tokenHash = hashOauthSecret(presentedRefreshToken);
  const [storedToken] = await db
    .select({
      id: oauthRefreshTokens.id,
      familyId: oauthRefreshTokens.familyId,
      clientId: oauthRefreshTokens.clientId,
      orgId: oauthRefreshTokens.orgId,
      userId: oauthRefreshTokens.userId,
      apiKeyId: oauthRefreshTokens.apiKeyId,
      revokedAt: oauthRefreshTokens.revokedAt,
      expiresAt: oauthRefreshTokens.expiresAt,
    })
    .from(oauthRefreshTokens)
    .where(eq(oauthRefreshTokens.tokenHash, tokenHash))
    .limit(1);

  const decision = decideRefreshOutcome({
    storedToken: storedToken ?? null,
    presentedClientId: clientId,
    now: new Date(),
  });

  if (decision.outcome === "reject") {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  if (decision.outcome === "reuse_detected") {
    // Revoke the ENTIRE family — every refresh token descended from the
    // same original grant — plus the access tokens tied to it. This is the
    // theft-response the design doc §3.2 and §4 both call for.
    //
    // 2026-07-03 — security review finding: SELECT-then-revoke-then-expire
    // (three statements) left a lost-update window — a concurrent rotation
    // could insert a NEW refresh-token row (with a new apiKeyId) into this
    // same family between the family SELECT and the api_keys expiry, and
    // that new row's access token would stay live for up to
    // ACCESS_TOKEN_EXPIRY_MINUTES (1h) after theft was detected. Fixed by
    // making the api_keys expiry a single set-based UPDATE driven by a
    // subquery over the CURRENT family membership at write time (rather than
    // a snapshot read beforehand), so any row inserted concurrently is still
    // covered as long as it lands before this statement executes. The
    // refresh-token revocation itself is already a single set-based
    // UPDATE ... WHERE family_id = ... AND revoked_at IS NULL, so it already
    // covers concurrently-inserted rows in the same family.
    await db
      .update(oauthRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(oauthRefreshTokens.familyId, decision.familyId), isNull(oauthRefreshTokens.revokedAt)));
    await db
      .update(apiKeys)
      .set({ expiresAt: new Date() })
      .where(
        inArray(
          apiKeys.id,
          db
            .select({ apiKeyId: oauthRefreshTokens.apiKeyId })
            .from(oauthRefreshTokens)
            .where(
              and(
                eq(oauthRefreshTokens.familyId, decision.familyId),
                isNotNull(oauthRefreshTokens.apiKeyId),
              ),
            ),
        ),
      );
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  // decision.outcome === "rotate"
  if (!storedToken) {
    // Unreachable given decideRefreshOutcome's contract, but keeps
    // TypeScript's control-flow narrowing honest without a non-null
    // assertion.
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  await db
    .update(oauthRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(oauthRefreshTokens.id, storedToken.id));

  const minted = await mintWorkspaceToken(storedToken.orgId, {
    name: `oauth:${clientId}`,
    kind: "oauth",
    expiresInMinutes: ACCESS_TOKEN_EXPIRY_MINUTES,
  });

  const newRefreshTokenRaw = generateRefreshToken();
  await db.insert(oauthRefreshTokens).values({
    tokenHash: hashOauthSecret(newRefreshTokenRaw),
    familyId: storedToken.familyId, // SAME family — this is the rotation chain
    clientId,
    orgId: storedToken.orgId,
    userId: storedToken.userId,
    apiKeyId: minted.tokenId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
  });

  return NextResponse.json({
    access_token: minted.token,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_EXPIRY_MINUTES * 60,
    refresh_token: newRefreshTokenRaw, // per Anthropic's docs: "return the new refresh token in the same response that invalidates the old one"
  });
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
