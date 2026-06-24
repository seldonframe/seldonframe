// Composio inbound-trigger webhook (NODE runtime).
//
// Composio posts a signed event here whenever a subscribed trigger fires (e.g. a
// new Gmail message for a connected account). The flow:
//   1. read the RAW body (signature is over the exact bytes)
//   2. require COMPOSIO_WEBHOOK_SECRET — if unset, 503 "not configured" so the
//      endpoint fails LOUD rather than silently accepting unverified events
//   3. verify the Svix-style HMAC signature (webhook-id/-timestamp/-signature);
//      401 on a bad/expired signature
//   4. map the V3 payload → SeldonEvent and emit it on the bus, which the
//      listeners bridge (lib/events/listeners.ts) routes into the archetype
//      dispatcher
//   5. ALWAYS 200 on a verified event (even if no agent matches) so Composio
//      doesn't retry-storm a workspace that simply has no matching agent.
//
// SECURITY: the secret is read from env only; the raw body is verified before any
// parsing/dispatch. A forged or replayed POST is rejected at step 3.

import { NextResponse } from "next/server";

import { emitSeldonEvent } from "@/lib/events/bus";
import {
  verifyComposioSignature,
  composioEventToSeldon,
  type ComposioWebhookPayload,
} from "@/lib/integrations/composio/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Raw body — the signature is computed over these exact bytes.
  const raw = await request.text();

  // 2. Fail loud if the platform secret is missing (never accept unverified).
  const secret = process.env.COMPOSIO_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "composio_webhook_not_configured" },
      { status: 503 },
    );
  }

  // Svix-style headers (Composio V3 webhook signing).
  const h = request.headers;
  const id = h.get("webhook-id") ?? "";
  const timestamp = h.get("webhook-timestamp") ?? "";
  const signatureHeader = h.get("webhook-signature") ?? "";

  // 3. Verify the signature (constant-time + 5-min replay window).
  const ok = verifyComposioSignature({
    id,
    timestamp,
    rawBody: raw,
    signatureHeader,
    secret,
    now: Date.now(),
  });
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "invalid_signature" },
      { status: 401 },
    );
  }

  // 4. Parse + map. A malformed body on a VERIFIED request is logged + 200'd (the
  // signature already proves it came from Composio; we don't want a retry storm).
  let payload: ComposioWebhookPayload;
  try {
    payload = JSON.parse(raw) as ComposioWebhookPayload;
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparseable" });
  }

  const mapped = composioEventToSeldon(payload);
  if (!mapped) {
    // Verified but not routable (no user_id / trigger_slug) — ack so Composio
    // stops retrying. This also covers Composio's non-trigger control messages.
    return NextResponse.json({ ok: true, ignored: "unroutable" });
  }

  // 5. Emit on the bus → listeners bridge → archetype dispatcher. Best-effort:
  // any handler error is swallowed by the bus; we always ack a verified event.
  try {
    await emitSeldonEvent(mapped.type, mapped.data, { orgId: mapped.orgId });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[composio webhook] emit failed", {
      type: mapped.type,
      orgId: mapped.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Still 200 — Composio retrying won't help a downstream emit failure, and the
    // event is verified. Internal failures are observed via logs.
  }

  return NextResponse.json({ ok: true, type: mapped.type });
}
