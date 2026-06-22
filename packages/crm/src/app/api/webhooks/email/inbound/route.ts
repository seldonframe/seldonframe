// Multi-surface runtime — inbound email webhook (NET-NEW).
//
// Resend Inbound (MX + a webhook pointed here) POSTs an inbound email as
// { type:"email.received", data:{ from, to, subject, text, html, ... } }. We
// verify the Svix signature (same as the outbound resend webhook), then route
// the message through the SAME agent loop SMS uses, via the channel-adapter
// seam (handleInboundEmail → runChannelTurn → ResendEmailAdapter sends the
// reply). The "to" address resolves to a workspace by a verified custom domain
// or the <slug>@inbound.<root> convention.
//
// OPS NOTE (code-ready, ops-pending): enabling this requires an operator config
// step — set up Resend Inbound (MX records + this webhook URL) for the inbound
// domain. Until that's done no inbound email is delivered here. This handler is
// inert without it.
//
// Soft-fail + ALWAYS 200 (except 401 on a bad signature) so a degraded agent
// layer or an unknown address never triggers a Resend retry-storm. Mirrors the
// outbound webhooks/resend/route.ts posture.

import { NextResponse } from "next/server";
import { verifyResendWebhook } from "@/lib/emails/webhook-verify";
import { logEvent } from "@/lib/observability/log";
import {
  handleInboundEmail,
  resolveOrgByInboundAddress,
  findContactByEmail,
  type HandleInboundEmailDeps,
} from "@/lib/emails/inbound";
import { createResendEmailAdapter } from "@/lib/agents/channels/channel-adapter";
import { buildRealChannelTurnDeps, runChannelTurn } from "@/lib/agents/channels/run-channel-turn";

export const runtime = "nodejs";

/** Build the real deps once per request: real resolver + contact lookup +
 *  runChannelTurn pre-bound with the Resend email adapter (which sends the
 *  reply from the resolved workspace with a "Re: …" subject). */
function buildRealDeps(): HandleInboundEmailDeps {
  const channelDeps = buildRealChannelTurnDeps();
  const adapter = createResendEmailAdapter();
  return {
    resolveOrgId: (to) => resolveOrgByInboundAddress(to),
    findContactByEmail: (orgId, email) => findContactByEmail(orgId, email),
    runChannelTurn: (inbound) => runChannelTurn(channelDeps, inbound, adapter),
  };
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const rawBody = await request.text();

  // Verify the Svix signature when a secret is configured (prod). In dev
  // (no secret) unsigned requests pass through — matches the outbound webhook.
  if (secret) {
    const result = verifyResendWebhook({
      body: rawBody,
      secret,
      headers: {
        svixId: request.headers.get("svix-id"),
        svixTimestamp: request.headers.get("svix-timestamp"),
        svixSignature: request.headers.get("svix-signature"),
      },
    });
    if (!result.ok) {
      logEvent("inbound_email_webhook_rejected", { reason: result.reason });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Malformed JSON: 400 (the only non-200 besides a bad signature), matching
    // the outbound resend route.
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // handleInboundEmail never throws — it returns an outcome we just log.
  const outcome = await handleInboundEmail(payload, buildRealDeps());
  logEvent("inbound_email_handled", {
    status: outcome.status,
    reason: "reason" in outcome ? outcome.reason : null,
  });

  // Always 200 so Resend doesn't retry-storm on ignored / unhandled messages.
  return NextResponse.json({ ok: true, status: outcome.status });
}
