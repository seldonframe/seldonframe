import { generateAuthorizationCode, hashOauthSecret } from "@/lib/oauth/tokens";

export interface AuthorizationCodeRecord {
  code: string; // raw — return to caller ONCE, never persist this value
  codeHash: string; // persist this
  clientId: string;
  redirectUri: string;
  orgId: string;
  userId: string;
  codeChallenge: string;
  resource: string | undefined;
  expiresAt: Date;
}

const CODE_TTL_MS = 60_000; // task constraint: code TTL <= 60s, enforced server-side

export function buildAuthorizationCodeRecord(params: {
  clientId: string;
  redirectUri: string;
  orgId: string;
  userId: string;
  codeChallenge: string;
  resource: string | undefined;
  now: Date;
}): AuthorizationCodeRecord {
  const code = generateAuthorizationCode();
  return {
    code,
    codeHash: hashOauthSecret(code),
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    orgId: params.orgId,
    userId: params.userId,
    codeChallenge: params.codeChallenge,
    resource: params.resource,
    expiresAt: new Date(params.now.getTime() + CODE_TTL_MS),
  };
}
