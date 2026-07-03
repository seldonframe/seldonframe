import { verifyPkce } from "@/lib/oauth/pkce";

export interface StoredAuthorizationCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export type ValidateRedemptionResult = { ok: true } | { ok: false; error: "invalid_grant" };

/**
 * The full authorization_code grant validation, per RFC 6749 §4.1.3 +
 * this design's PKCE-mandatory constraint. Every failure returns the SAME
 * error code ("invalid_grant") regardless of WHICH check failed — RFC 6749
 * doesn't want servers leaking "the code was right but the verifier was
 * wrong" vs "the code doesn't exist" (a probing vector), matching the same
 * anti-probing philosophy validateRawWorkspaceToken already uses for wst_
 * tokens (design doc §2.2).
 */
export function validateCodeRedemption(params: {
  storedCode: StoredAuthorizationCode | null;
  presentedClientId: string;
  presentedRedirectUri: string;
  presentedCodeVerifier: string;
  now: Date;
}): ValidateRedemptionResult {
  const { storedCode } = params;
  if (!storedCode) return { ok: false, error: "invalid_grant" };
  if (storedCode.consumedAt !== null) return { ok: false, error: "invalid_grant" };
  if (storedCode.expiresAt.getTime() <= params.now.getTime()) return { ok: false, error: "invalid_grant" };
  if (storedCode.clientId !== params.presentedClientId) return { ok: false, error: "invalid_grant" };
  if (storedCode.redirectUri !== params.presentedRedirectUri) return { ok: false, error: "invalid_grant" };
  if (!verifyPkce({ verifier: params.presentedCodeVerifier, challenge: storedCode.codeChallenge, method: "S256" })) {
    return { ok: false, error: "invalid_grant" };
  }
  return { ok: true };
}
