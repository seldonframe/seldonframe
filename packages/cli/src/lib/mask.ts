// mask — never print a full secret. Pure: same input → same masked string.
//
// A workspace bearer (wst_…) is shown ONCE at /build/keys; the CLI stores it but
// must never echo it back in full (keys list, errors, --json). We keep a short,
// recognizable hint — the prefix + the last 4 chars — and mask the middle.

/**
 * Mask a secret for display: keep the leading `wst_` (or first 4 chars) and the
 * last 4, replace the middle with a fixed-width ellipsis. Short/empty inputs are
 * fully masked. Never throws.
 *
 *   "wst_abcdEFGH1234567890wxyz" → "wst_…wxyz"
 *   "short"                      → "…"
 */
export function maskKey(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  if (s.length === 0) return "";

  // The recognizable prefix: the `wst_` scheme if present, else the first 4.
  const prefix = s.startsWith("wst_") ? "wst_" : s.slice(0, 4);
  const suffix = s.slice(-4);

  // Too short to reveal a prefix AND a distinct 4-char suffix without overlap →
  // fully mask so we never leak most of a short token.
  if (s.length <= prefix.length + 4) return "…";

  return `${prefix}…${suffix}`;
}
