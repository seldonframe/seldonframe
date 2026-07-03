const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Exact-match redirect_uri validation, with ONE spec-mandated exception:
 * RFC 8252 §7.3 requires ignoring the port component for loopback redirect
 * URIs (native clients bind an ephemeral port per run). Anthropic's own
 * connector-authentication docs confirm Claude Code relies on exactly this:
 * "your authorization server must accept both [localhost and 127.0.0.1]
 * with the port component ignored" (see design doc §1.2).
 *
 * Every other mismatch (scheme, host, path, or a non-loopback port) is a
 * hard reject — this is the open-redirect defense the MCP spec requires
 * ("Authorization servers MUST validate exact redirect URIs against
 * pre-registered values").
 */
export function isRedirectUriAllowed(candidate: string, allowlist: string[]): boolean {
  let candidateUrl: URL;
  try {
    candidateUrl = new URL(candidate);
  } catch {
    return false;
  }

  for (const allowed of allowlist) {
    if (candidate === allowed) return true;

    if (!LOOPBACK_HOSTS.has(candidateUrl.hostname)) continue;

    let allowedUrl: URL;
    try {
      allowedUrl = new URL(allowed);
    } catch {
      continue;
    }
    if (!LOOPBACK_HOSTS.has(allowedUrl.hostname)) continue;
    if (candidateUrl.protocol !== allowedUrl.protocol) continue;
    if (candidateUrl.hostname !== allowedUrl.hostname) continue;
    if (candidateUrl.pathname !== allowedUrl.pathname) continue;
    // Port intentionally NOT compared — this is the RFC 8252 exception.
    return true;
  }

  return false;
}
