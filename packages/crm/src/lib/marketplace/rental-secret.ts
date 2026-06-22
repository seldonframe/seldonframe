// Resolves the HMAC signing secret for agent-rental keys.
//
// Mirrors lib/workflow/approvals/workspace-secret.ts. A dedicated env var
// (AGENT_RENTAL_SECRET) is preferred so rental keys can be rotated
// independently of everything else. We FALL BACK to ENCRYPTION_KEY — the
// always-present platform server secret (lib/encryption.ts requires it) — so
// the rental rail works out of the box on any deploy without a new env var
// being provisioned first. Both are server-only; neither is ever sent to a
// client. The key payload is signed (HMAC), not encrypted, so reusing the
// encryption secret as an HMAC key is safe (different construction, same
// high-entropy material).
//
// FOLLOW-ON: per-listing or per-renter rotating secrets (alongside the
// revocable key table) so a single leaked platform secret can't forge keys for
// every agent. v1 is one platform secret, like the magic-link v1.

const PRIMARY_ENV = "AGENT_RENTAL_SECRET";
const FALLBACK_ENV = "ENCRYPTION_KEY";

/**
 * Resolve the rental-key signing secret. Returns the dedicated secret if set
 * (>=16 chars), else the platform ENCRYPTION_KEY. Throws only if neither is
 * available (a misconfigured deploy) — the route maps that to a clean 500 so
 * a renter sees a stable error rather than a stack trace.
 */
export function getRentalSigningSecret(): string {
  const dedicated = process.env[PRIMARY_ENV];
  if (dedicated && dedicated.length >= 16) return dedicated;

  const fallback = process.env[FALLBACK_ENV];
  if (fallback && fallback.length >= 16) return fallback;

  throw new Error(
    `No rental signing secret available. Set ${PRIMARY_ENV} (preferred) or ensure ${FALLBACK_ENV} is configured (>=16 chars).`,
  );
}
