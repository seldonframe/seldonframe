// Marketplace buyer onboarding — the buyer-surface route paths (pure).
//
// One source of truth for the buyer's setup wizard + "My Agent" home paths, so
// the install action, the purchase webhook, and the success UI all agree on the
// same target string. Returns null for a missing id rather than emitting a
// half-built "/agent//setup" URL (the caller falls back — e.g. to /studio).

/** The buyer's setup wizard for a deployment, or null when the id is absent. */
export function buyerSetupPath(
  deploymentId: string | null | undefined,
): string | null {
  const id = (deploymentId ?? "").trim();
  return id ? `/agent/${id}/setup` : null;
}

/** The buyer's "My Agent" home for a deployment, or null when the id is absent. */
export function buyerAgentPath(
  deploymentId: string | null | undefined,
): string | null {
  const id = (deploymentId ?? "").trim();
  return id ? `/agent/${id}` : null;
}
