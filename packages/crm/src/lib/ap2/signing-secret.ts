// Resolves the HMAC signing secret for AP2 mandates.
//
// Mirrors lib/marketplace/rental-secret.ts exactly. A dedicated env var
// (AP2_SIGNING_SECRET) is preferred so AP2 mandate signing can be rotated
// independently. We FALL BACK to the agent-rental secret chain
// (AGENT_RENTAL_SECRET → ENCRYPTION_KEY, the always-present platform server
// secret) so AP2 works out of the box on any deploy that already runs the
// marketplace rails — no new env var must be provisioned first. Every candidate
// is server-only; none is ever sent to a client. Mandates are SIGNED (HMAC),
// not encrypted, so reusing high-entropy platform material as an HMAC key is
// safe (different construction).
//
// PROD-SAFETY: throws if no secret ≥16 chars is available (a misconfigured
// deploy) — the route maps that to a clean error rather than signing/verifying
// with weak or empty material. This is the documented "default-throw if absent
// in prod" the plan requires.

const PRIMARY_ENV = "AP2_SIGNING_SECRET";
const SHARED_ENV = "AGENT_RENTAL_SECRET";
const FALLBACK_ENV = "ENCRYPTION_KEY";

/**
 * Resolve the AP2 mandate-signing secret. Returns the dedicated
 * AP2_SIGNING_SECRET if set (≥16 chars), else the shared rental secret, else the
 * platform ENCRYPTION_KEY. Throws only when none is available (≥16 chars).
 */
export function getAp2SigningSecret(): string {
  const dedicated = process.env[PRIMARY_ENV];
  if (dedicated && dedicated.length >= 16) return dedicated;

  const shared = process.env[SHARED_ENV];
  if (shared && shared.length >= 16) return shared;

  const fallback = process.env[FALLBACK_ENV];
  if (fallback && fallback.length >= 16) return fallback;

  throw new Error(
    `No AP2 signing secret available. Set ${PRIMARY_ENV} (preferred) or ensure ${SHARED_ENV}/${FALLBACK_ENV} is configured (>=16 chars).`,
  );
}
