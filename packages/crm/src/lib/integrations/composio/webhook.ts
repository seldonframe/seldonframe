// Pure Composio webhook helpers (NODE runtime — uses node:crypto).
//
// Two pure functions the inbound-trigger route is thin glue over:
//   - verifyComposioSignature: HMAC-SHA256 verification of a Composio webhook
//     (Svix-style headers: webhook-id / webhook-timestamp / webhook-signature),
//     constant-time, with a 5-minute replay window.
//   - composioEventToSeldon: map a V3 trigger payload to a SeldonEvent
//     ({ orgId, type, data }) the existing event bus + archetype dispatcher
//     already understand.
//
// SECURITY: the secret is used as-is (Composio's `whsec_…` is the raw HMAC key in
// their V3.1 webhook_subscriptions API). We compare in constant time and reject
// stale/forged messages so a forged POST can never drive the dispatcher.

import crypto from "node:crypto";

/** The 5-minute replay tolerance (ms), per the signing spec. */
const TOLERANCE_MS = 300_000;

export type VerifyComposioSignatureInput = {
  /** webhook-id header. */
  id: string;
  /** webhook-timestamp header (unix SECONDS as a string). */
  timestamp: string;
  /** The EXACT raw request body (never the parsed/re-stringified object). */
  rawBody: string;
  /** webhook-signature header — may be space-separated; each part maybe `v1,<b64>`. */
  signatureHeader: string;
  /** The webhook signing secret (used as-is). */
  secret: string;
  /** Current time in ms (injected for testability). */
  now: number;
};

/**
 * Verify a Composio webhook signature. Returns true only when (a) the timestamp
 * is within ±5 min of `now` AND (b) at least one signature in the header matches
 * the HMAC-SHA256(secret, `${id}.${timestamp}.${rawBody}`) base64 digest.
 */
export function verifyComposioSignature(input: VerifyComposioSignatureInput): boolean {
  const { id, timestamp, rawBody, signatureHeader, secret, now } = input;
  if (!signatureHeader || !secret || !timestamp) return false;

  // Replay window. timestamp is unix seconds.
  const tsMs = Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs)) return false;
  if (Math.abs(now - tsMs) > TOLERANCE_MS) return false;

  const signingString = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signingString)
    .digest("base64");
  const expectedBuf = Buffer.from(expected, "utf8");

  // The header may carry several space-separated signatures, each optionally
  // scheme-prefixed (`v1,<b64>`). Accept if ANY matches in constant time.
  for (const part of signatureHeader.split(/\s+/)) {
    if (!part) continue;
    const candidate = part.includes(",") ? part.slice(part.indexOf(",") + 1) : part;
    if (!candidate) continue;
    const candidateBuf = Buffer.from(candidate, "utf8");
    if (
      candidateBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(candidateBuf, expectedBuf)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Convert a Composio trigger slug to a SeldonEvent sub-type.
 *   `GMAIL_NEW_GMAIL_MESSAGE` → `gmail.new_message`
 * The first underscore-token is the toolkit (the namespace); the remaining
 * tokens form the event name, with any token equal to the toolkit dropped (so
 * the common `<TOOLKIT>_…_<TOOLKIT>_…` duplication collapses).
 */
export function slugToType(triggerSlug: string): string {
  const tokens = triggerSlug.trim().toLowerCase().split("_").filter(Boolean);
  if (tokens.length === 0) return "";
  const toolkit = tokens[0];
  const rest = tokens.slice(1).filter((t) => t !== toolkit);
  if (rest.length === 0) return toolkit;
  return `${toolkit}.${rest.join("_")}`;
}

/** The minimal V3 webhook payload shape we read. */
export type ComposioWebhookPayload = {
  id?: string;
  type?: string;
  timestamp?: string;
  metadata?: {
    user_id?: string;
    trigger_slug?: string;
    trigger_id?: string;
    connected_account_id?: string;
  };
  data?: Record<string, unknown>;
};

export type ComposioSeldonEvent = {
  /** The workspace (organizations.id) — Composio's session user_id. */
  orgId: string;
  /** The SeldonEvent type, e.g. `composio.gmail.new_message`. Typed as the
   *  `${string}.${string}` custom-event shape the bus accepts (always has the
   *  `composio.` prefix). */
  type: `${string}.${string}`;
  /** The trigger payload, with a `_composio` provenance block appended. */
  data: Record<string, unknown>;
};

/**
 * Map a verified Composio V3 trigger payload to a SeldonEvent. Returns null when
 * the payload lacks the routing fields (user_id / trigger_slug) — the route then
 * 200s without dispatching (a verified-but-unroutable event is not an error).
 */
export function composioEventToSeldon(
  payload: ComposioWebhookPayload,
): ComposioSeldonEvent | null {
  const meta = payload?.metadata;
  const orgId = meta?.user_id;
  const triggerSlug = meta?.trigger_slug;
  if (!orgId || !triggerSlug) return null;

  const subType = slugToType(triggerSlug);
  if (!subType) return null;

  return {
    orgId,
    type: `composio.${subType}`,
    data: {
      ...(payload.data ?? {}),
      _composio: {
        // orgId is embedded here too so in-memory bus listeners (which receive
        // only `data`, not the emit `{ orgId }` option) can route to the
        // archetype dispatcher without a DB lookup — see lib/events/listeners.ts.
        orgId,
        triggerSlug,
        connectedAccountId: meta?.connected_account_id ?? null,
        triggerId: meta?.trigger_id ?? null,
      },
    },
  };
}
