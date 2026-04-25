// Resolves the magic-link HMAC signing secret for a workspace.
// SLICE 10 PR 1 C5.
//
// v1 uses a single env-var secret (APPROVAL_MAGIC_LINK_SECRET).
// v1.1 will switch to per-workspace secrets stored in
// workspace_secrets, with a per-workspace key rotation API.
//
// Failure mode: if the env var is missing in production, magic-link
// generation fails fast at dispatch time (request_approval steps
// targeting client_owner approvers cannot be persisted). The error
// is loud + clear; ops sees the gap immediately.

const ENV_KEY = "APPROVAL_MAGIC_LINK_SECRET";

export async function getMagicLinkSecretForWorkspace(_orgId: string): Promise<string> {
  const value = process.env[ENV_KEY];
  if (!value || value.length < 16) {
    throw new Error(
      `${ENV_KEY} is not set or too short (need >=16 chars). Magic-link generation cannot proceed. Set the env var to a high-entropy random string.`,
    );
  }
  return value;
}
