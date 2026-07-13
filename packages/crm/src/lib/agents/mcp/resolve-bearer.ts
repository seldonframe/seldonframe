// OAuth-aware bearer resolver — the ONE seam that makes an OAuth token
// envelope (Task 1's TokenEnvelope, stored as the connector's secret) look
// like a plain bearer string to every existing consumer (wrap-tool's
// execute(), bind-time discovery). A plain (legacy) stored secret is returned
// verbatim, so postiz/rube stay byte-for-byte unchanged.
//
// Refresh: a stale envelope (expires_at within 60s, or already past) with a
// refresh_token is proactively refreshed and the ROTATED envelope is
// re-persisted. Concurrent resolves for the same (orgId, serviceName)
// single-flight through one in-flight refresh Promise so a burst of tool
// calls never fires N redundant refresh requests against the provider.
//
// FAIL-SOFT: any failure (malformed envelope, stale + no refresh_token,
// refresh throwing) returns null — wrap-tool's existing "no stored
// credential — re-bind it" error fires exactly as it does for a missing
// secret today.

import { parseTokenEnvelope, refreshTokens } from "./oauth";

const REFRESH_SKEW_MS = 60_000;

export type ResolveBearerDeps = {
  getSecretValue: (input: {
    workspaceId: string;
    serviceName: string;
    skipAccessCheck?: boolean;
  }) => Promise<string | null>;
  storeSecret: (input: {
    workspaceId: string;
    serviceName: string;
    value: string;
  }) => Promise<unknown>;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

/** Lazily resolve the real encrypted-secret deps — imported only when a
 *  caller doesn't inject its own (tests always inject both, so the real
 *  `@/lib/secrets` module — and its DB-touching import graph — never loads
 *  in unit tests; it also keeps the single-flight race deterministic, since
 *  a dynamic import adds a non-lockstep async tick). */
async function resolveMissingDeps(
  partial: Partial<ResolveBearerDeps>,
): Promise<ResolveBearerDeps> {
  if (partial.getSecretValue && partial.storeSecret) {
    return partial as ResolveBearerDeps;
  }
  const { getSecretValue, storeSecret } = await import("@/lib/secrets");
  return {
    getSecretValue:
      partial.getSecretValue ??
      (async ({ workspaceId, serviceName }) =>
        getSecretValue({ workspaceId, serviceName, skipAccessCheck: true })),
    storeSecret:
      partial.storeSecret ??
      (async ({ workspaceId, serviceName, value }) =>
        storeSecret({ workspaceId, serviceName, value })),
    fetchImpl: partial.fetchImpl,
    now: partial.now,
  };
}

// Single-flight in-flight refreshes, keyed `${orgId}:${serviceName}`.
const inFlightRefreshes = new Map<string, Promise<string | null>>();

async function doRefresh(
  orgId: string,
  serviceName: string,
  envelope: Parameters<typeof refreshTokens>[0]["envelope"],
  deps: ResolveBearerDeps,
): Promise<string | null> {
  try {
    const rotated = await refreshTokens({
      envelope,
      fetchImpl: deps.fetchImpl,
      now: deps.now,
    });
    await deps.storeSecret({
      workspaceId: orgId,
      serviceName,
      value: JSON.stringify(rotated),
    });
    return rotated.access_token;
  } catch {
    return null;
  }
}

/**
 * Resolve the Authorization bearer for a vetted/byo MCP binding's secret.
 *   - Plain string secret (doesn't start with `{`) → returned verbatim.
 *   - `{...}` that fails to parse as a TokenEnvelope → null (malformed;
 *     NEVER silently passed through as a raw bearer).
 *   - Fresh envelope → the access_token.
 *   - Stale + refresh_token → single-flight refresh, re-persist, return the
 *     new access_token (null on any refresh failure).
 *   - Stale + no refresh_token → null.
 */
export async function resolveConnectorBearer(
  orgId: string,
  serviceName: string,
  deps?: Partial<ResolveBearerDeps>,
): Promise<string | null> {
  const resolvedDeps: ResolveBearerDeps = await resolveMissingDeps(deps ?? {});
  const now = resolvedDeps.now ?? Date.now;

  const raw = await resolvedDeps.getSecretValue({ workspaceId: orgId, serviceName, skipAccessCheck: true });
  if (raw === null || raw === undefined) return null;

  if (!raw.trimStart().startsWith("{")) {
    // Legacy plain bearer (postiz/rube etc.) — unchanged behavior.
    return raw;
  }

  const envelope = parseTokenEnvelope(raw);
  if (!envelope) return null; // malformed envelope = unusable, never pass raw JSON as a bearer.

  const isFresh = envelope.expires_at === undefined || envelope.expires_at - now() > REFRESH_SKEW_MS;
  if (isFresh) return envelope.access_token;

  if (!envelope.refresh_token) return null;

  const key = `${orgId}:${serviceName}`;
  let inFlight = inFlightRefreshes.get(key);
  if (!inFlight) {
    inFlight = doRefresh(orgId, serviceName, envelope, resolvedDeps).finally(() => {
      inFlightRefreshes.delete(key);
    });
    inFlightRefreshes.set(key, inFlight);
  }
  return inFlight;
}
