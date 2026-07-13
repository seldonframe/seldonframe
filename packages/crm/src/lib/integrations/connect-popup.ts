// Agent setup mode slice (T3) — the in-place popup connect's pure decision
// bits. Spec §2: Connect opens `createConnectLink`'s URL in a popup; the
// OAuth callback lands on a minimal route that posts a message back to
// `window.opener` and self-closes. Popup-blocked → same-tab redirect, with
// a `returnTo` allowlisted to same-origin /studio paths only (no open
// redirect). Everything here is pure/no I/O so the allowlist logic is
// directly unit-testable without a browser.

/** The `message` event `data.type` the popup callback page posts to
 *  `window.opener`, and the parent listens for. */
export const CONNECT_POPUP_MESSAGE_TYPE = "sf-connect-complete";

export type ConnectPopupMessage = {
  type: typeof CONNECT_POPUP_MESSAGE_TYPE;
  toolkit: string;
};

/** True iff `data` is a well-formed connect-popup completion message —
 *  narrows an arbitrary `message` event payload before the parent trusts
 *  the toolkit slug it carries. Never throws. */
export function isConnectPopupMessage(data: unknown): data is ConnectPopupMessage {
  if (!data || typeof data !== "object") return false;
  const rec = data as Record<string, unknown>;
  return rec.type === CONNECT_POPUP_MESSAGE_TYPE && typeof rec.toolkit === "string" && rec.toolkit.length > 0;
}

/** The callback URL passed to `createConnectLink` for the POPUP path — the
 *  minimal `/integrations/connected` route (outside the dashboard layout,
 *  L-18), never the agent page itself (the popup never navigates the
 *  agent's own tab). */
export function buildPopupCallbackUrl(appOrigin: string, toolkit: string): string {
  const base = appOrigin.replace(/\/$/, "");
  return `${base}/integrations/connected?popup=1&toolkit=${encodeURIComponent(toolkit)}`;
}

/**
 * Resolve the callback URL for the same-tab REDIRECT fallback (popup
 * blocked): the caller-supplied `returnTo` if — and only if — it resolves
 * to a same-origin `/studio/...` path; any other value (a different origin,
 * a scheme mismatch, an unparseable string, or a path outside /studio)
 * falls back to the caller-supplied default. This is the ONLY guard
 * standing between an attacker-supplied `returnTo` and an open redirect
 * through the Composio-hosted OAuth callback — never widen it without
 * re-reading spec §2's "same-origin /studio paths only" line.
 */
export function resolveConnectReturnTo(args: {
  returnTo: string | null | undefined;
  appOrigin: string;
  fallback: string;
}): string {
  const raw = (args.returnTo ?? "").trim();
  if (!raw) return args.fallback;
  let origin: string;
  try {
    origin = new URL(args.appOrigin).origin;
  } catch {
    return args.fallback;
  }
  try {
    const url = new URL(raw, args.appOrigin);
    if (url.origin !== origin) return args.fallback;
    if (!url.pathname.startsWith("/studio/")) return args.fallback;
    return url.toString();
  } catch {
    return args.fallback;
  }
}
