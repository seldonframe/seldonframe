// lib/build/share-card.ts
//
// Growth loop #2 (virality pack, Task 2): "I just shipped a 24/7 AI agent
// from my IDE" — a deploy-time share card + pre-filled x.com post intent,
// surfaced as an ADDITIVE `share` field on the deploy route's success
// response (see route.ts). PURE — no DB/network — so it's fully unit
// tested (tests/unit/build/share-card.spec.ts) without a live Postgres.
//
// Security note: `businessName` ends up rendered by the OG route
// (api/og/shipped/route.tsx) purely as TEXT inside an <ImageResponse> — but
// this module is what puts it on the wire as a URL query param in the first
// place, and that query string is what a builder pastes/shares publicly. It
// is therefore URL-encoded via URLSearchParams/encodeURIComponent at every
// hop (cardUrl's `name` param, and the `text` param baked into postUrl) —
// never template-literal-interpolated raw into either URL. This is what lets
// the OG route treat `name` as attacker-controlled input safely: whatever
// arrives on the query string already round-trips through a real URL parser
// on both ends.
//
// Base URL: reuses the exact `NEXT_PUBLIC_APP_URL` fallback pattern used
// throughout the codebase (e.g. deploy/route.ts's own `appBaseUrl`,
// chatgpt-app/deps.ts's `APP_URL`) — trimmed env var, falling back to the
// production app host.

const MIN_MINUTES = 1;
const MAX_MINUTES = 120;

/** Resolve the public app base URL the same way every other route in this
 *  codebase does (process.env.NEXT_PUBLIC_APP_URL?.trim() || the prod
 *  fallback) — read live (not module-scope-cached) so tests can flip the env
 *  var per-case, matching how the route-level call sites read it inline. */
function resolveAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
}

/** Whole minutes elapsed between startedAt and now, clamped to [1, 120].
 *  Negative/zero elapsed (clock skew, or startedAt === now) clamps up to 1 —
 *  a share card must never claim "0 minutes" or a negative duration. */
function clampMinutes(startedAt: Date, now: Date): number {
  const rawMs = now.getTime() - startedAt.getTime();
  const rawMinutes = Math.round(rawMs / 60_000);
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, rawMinutes));
}

export type ShareCardKind = "voice" | "chat" | "workspace";

export type BuildShareCardArgs = {
  businessName: string;
  /** When the deploy timer's start isn't known (e.g. a legacy deployment,
   *  or the route couldn't resolve a start timestamp), pass null — the copy
   *  falls back to "under an hour" phrasing instead of a minutes count. */
  startedAt: Date | null;
  now: Date;
  kind: ShareCardKind;
};

export type ShareCard = {
  /** The OG image route URL (api/og/shipped) with name/mins/kind query
   *  params — safe to embed as an <img src> or a social card link. */
  cardUrl: string;
  /** The plain-text share copy (no HTML/markdown). */
  text: string;
  /** A pre-filled https://x.com/intent/post URL — clicking it opens the
   *  native post composer with `text` (+ the card link) already filled in. */
  postUrl: string;
};

/** `kind === "voice"` gets the receptionist-specific noun; every other kind
 *  (chat, workspace) shares the generic "agent" wording per the plan spec. */
function nounForKind(kind: ShareCardKind): string {
  return kind === "voice" ? "phone receptionist" : "agent";
}

/**
 * Build the deploy share-card artifacts: the OG card URL, the share text,
 * and a pre-filled x.com post intent. PURE — no I/O.
 */
export function buildShareCard(args: BuildShareCardArgs): ShareCard {
  const { businessName, startedAt, now, kind } = args;
  const noun = nounForKind(kind);

  const timeClause =
    startedAt === null
      ? "in under an hour"
      : `in ${clampMinutes(startedAt, now)} minutes`;

  const text = `Shipped a 24/7 AI ${noun} for ${businessName} ${timeClause} — from my IDE. Built on @seldonframe.`;

  const cardUrl = new URL("/api/og/shipped", resolveAppBaseUrl());
  cardUrl.searchParams.set("name", businessName);
  cardUrl.searchParams.set(
    "mins",
    startedAt === null ? "0" : String(clampMinutes(startedAt, now)),
  );
  cardUrl.searchParams.set("kind", kind);
  const cardUrlString = cardUrl.toString();

  const postUrl = new URL("https://x.com/intent/post");
  postUrl.searchParams.set("text", `${text}\n${cardUrlString}`);

  return { cardUrl: cardUrlString, text, postUrl: postUrl.toString() };
}
