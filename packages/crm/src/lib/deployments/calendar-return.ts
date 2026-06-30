// Calendar-connect RETURN helpers (pure; no I/O, no "use server").
//
// BUG 1 — the buyer's connect-calendar must land the buyer back on THEIR wizard
// (`/agent/<id>/setup`) after the Composio OAuth round-trip, not the AGENCY
// Clients page (`/studio/clients`). These pure helpers resolve + validate the
// `returnTo` that threads through `startCalendarConnect` (the "use server"
// action) and the unauthenticated OAuth callback route.
//
// They live HERE rather than in connect-calendar.ts because that file is
// "use server" — a Server Actions module may export ONLY async functions, so a
// synchronous pure helper there is rejected by `next build`
// (invalid-use-server-value). Both the action and the callback route import from
// this module instead.

/**
 * Validate a buyer-wizard `returnTo` and return it (or null).
 *
 * Hardened against the same open-redirect class as `isSafeInternalRedirect`, but
 * scoped to the BUYER surface: the path portion MUST be under `/agent/…` (the
 * only place a buyer returns to). Rejects absolute URLs, protocol-relative
 * `//host`, backslash/control-char host-smuggling, `..` traversal, and any
 * non-`/agent` path — so a hostile `returnTo` can never redirect off-app or onto
 * an agency surface. Pure; never throws.
 */
export function safeBuyerReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw.startsWith("/")) return null; // absolute URLs + scheme tricks have no leading slash
  if (raw.startsWith("//")) return null; // protocol-relative → foreign host
  if (/[\\\x00-\x1f]/.test(raw)) return null; // `\` host-smuggling / control chars
  if (raw.includes("..")) return null; // no traversal out of /agent

  const pathOnly = raw.split(/[?#]/)[0]!;
  // Must be the agent root itself or a sub-path (so `/agentupling` is rejected).
  if (pathOnly !== "/agent" && !pathOnly.startsWith("/agent/")) return null;
  return raw;
}

/**
 * Decide where the calendar OAuth return lands.
 *
 * When `returnTo` is a SAFE buyer `/agent/…` path, send the buyer BACK to their
 * wizard with the `?calendar=<outcome>` flag (the wizard re-resolves the
 * connected state from the persisted calendarRef and resumes at the connect
 * step's success view). When `returnTo` is absent or unsafe, keep the AGENCY
 * default (`/studio/clients?calendar=<outcome>`) — so the agency connect flow is
 * never regressed and a hostile returnTo can never open-redirect.
 *
 * The flag is appended with the correct separator (`?` or `&`) so a returnTo
 * that already carries a query (e.g. `/agent/<id>/setup?step=phone`) stays valid.
 */
export function resolveCalendarCallbackRedirect(args: {
  appUrl: string;
  returnTo: string | null | undefined;
  outcome: "connected" | "error";
}): string {
  const safe = safeBuyerReturnTo(args.returnTo);
  if (!safe) return `${args.appUrl}/studio/clients?calendar=${args.outcome}`;
  const sep = safe.includes("?") ? "&" : "?";
  return `${args.appUrl}${safe}${sep}calendar=${args.outcome}`;
}
