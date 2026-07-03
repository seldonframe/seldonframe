export interface StoredRefreshToken {
  familyId: string;
  clientId: string;
  orgId: string;
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
}

export type RefreshOutcome =
  | { outcome: "rotate" }
  | { outcome: "reject" }
  | { outcome: "reuse_detected"; familyId: string };

/**
 * The refresh-rotation decision core (design doc §3.2). THREE distinct
 * outcomes, not two — this is the key nuance versus a naive valid/invalid
 * check:
 *
 *   - "rotate": legitimate refresh. Caller should revoke this row, mint a
 *     new one in the SAME family, and mint a fresh access token.
 *   - "reject": token unknown, wrong client, or naturally expired. No
 *     family-wide action needed — this is just "this particular refresh
 *     attempt failed," not evidence of theft.
 *   - "reuse_detected": the presented token hash matched a REAL row that
 *     is ALREADY revoked. Under normal operation this can only happen if
 *     the legitimate client already rotated past this token — meaning
 *     whoever just presented it is NOT the legitimate client (a stolen,
 *     replayed refresh token). The caller MUST revoke every row sharing
 *     this familyId AND the currently-live access token tied to it (see
 *     oauth_refresh_tokens.apiKeyId in the schema).
 */
export function decideRefreshOutcome(params: {
  storedToken: StoredRefreshToken | null;
  presentedClientId: string;
  now: Date;
}): RefreshOutcome {
  const { storedToken } = params;
  if (!storedToken) return { outcome: "reject" };
  if (storedToken.clientId !== params.presentedClientId) return { outcome: "reject" };
  if (storedToken.revokedAt !== null) {
    return { outcome: "reuse_detected", familyId: storedToken.familyId };
  }
  if (storedToken.expiresAt.getTime() <= params.now.getTime()) return { outcome: "reject" };
  return { outcome: "rotate" };
}
