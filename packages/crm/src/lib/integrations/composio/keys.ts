// Composio API-key resolution (BYO-secret-else-platform-env), the exact mirror
// of the AI client's `resolveAgentKeyStatusFromInputs` (lib/ai/client.ts). A
// workspace may store its own Composio key (serviceName "composio") to override
// the platform key; otherwise the platform key (process.env.COMPOSIO_API_KEY)
// is used. If neither exists, Composio is simply unavailable for that workspace
// and the agent falls back to its native tools (fail-closed, no crash).
//
// SECURITY: this module never logs a key. The DB-bound resolver reads the
// decrypted secret with `skipAccessCheck:true` because the agent runtime
// (voice/SMS/public chat) has no interactive user session — the same pattern
// the connector secret read uses (tools.ts defaultMcpDeps).

/** The source the resolved key came from. "none" = Composio unavailable. */
export type ComposioKeySource = "byo" | "platform" | "none";

export type ComposioKeyResolution = {
  /** The usable Composio API key, or null when none is configured. */
  apiKey: string | null;
  source: ComposioKeySource;
};

/** Empty/whitespace-only strings count as absent. */
function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Pure resolution: BYO secret wins, else platform env, else none. Mirrors
 * `resolveAgentKeyStatusFromInputs`. No DB / env access — unit-testable.
 */
export function resolveComposioKeyFromInputs(
  byoKey: string | null,
  platformKey: string | null,
): ComposioKeyResolution {
  const byo = clean(byoKey);
  if (byo) {
    return { apiKey: byo, source: "byo" };
  }
  const platform = clean(platformKey);
  if (platform) {
    return { apiKey: platform, source: "platform" };
  }
  return { apiKey: null, source: "none" };
}

/**
 * DB-bound resolver for an org. Reads the encrypted `composio` workspace secret
 * (skipAccessCheck — runtime has no user session) and falls back to the
 * platform env key. Imported lazily inside callers that already run in Node.
 */
export async function resolveComposioKey(
  orgId: string,
): Promise<ComposioKeyResolution> {
  const { getSecretValue } = await import("@/lib/secrets");
  const byoKey = await getSecretValue({
    workspaceId: orgId,
    serviceName: "composio",
    skipAccessCheck: true,
  });
  return resolveComposioKeyFromInputs(byoKey, process.env.COMPOSIO_API_KEY ?? null);
}
