// Multi-surface runtime — the SMS auto-reply dispatcher.
//
// This is the SINGLE call the Twilio SMS webhook makes at its (already
// intent-gated, conversation-not-owning) auto-reply point. It replaces the
// inline handleIncomingTurn + sendSmsFromApi block with:
//
//   1. runChannelTurn through the canonical agent loop (tools!) + Twilio adapter.
//   2. ONLY if the workspace has no default agent (runChannelTurn → reason
//      "no_agent") fall back to today's soul-aware chatbot (handleIncomingTurn +
//      sendSmsFromApi). This preserves behavior for workspaces that never got an
//      `agents` row — they keep their tool-less Soul reply, zero regression.
//
// Any OTHER non-handled reason (a degraded turn: llm_not_configured, an
// execute_error, etc.) does NOT re-run the legacy chatbot — the agent exists and
// just hiccuped, so the message lands unread in the operator inbox (same as the
// pre-reroute "classified as other" branch).
//
// Soft-fail throughout: the legacy fallback's runtime + send are wrapped so a
// failure never throws to the webhook (which must return 200 to Twilio). DI'd so
// the route's decision wiring is unit-testable without Twilio / Anthropic / Neon.
//
// NOTE: this is a PLAIN module (not "use server") — it's called from a route
// handler and composes the non-server-action API wrappers + the orchestrator.

import {
  buildRealChannelTurnDeps,
  runChannelTurn,
  type RunChannelTurnResult,
} from "./run-channel-turn";
import { createTwilioSmsAdapter, type InboundMessage } from "./channel-adapter";

/** The route-supplied facts about this inbound SMS. */
export type SmsAutoReplyInput = {
  orgId: string;
  contactId: string;
  /** The customer (sender) — we reply here. */
  fromNumber: string;
  /** Our workspace/deployment number it came in on — resolves the agent. */
  toNumber: string;
  inboundBody: string;
  smsMessageId: string;
};

/** Legacy chatbot result shape (lib/conversation/runtime.ts handleIncomingTurn). */
type LegacyTurnResult = { responseText: string | null };

export type SmsAutoReplyDeps = {
  /** The agent-loop entry. Defaults to runChannelTurn with the real deps + the
   *  Twilio adapter (the adapter sends the reply itself). */
  runChannelTurn: (inbound: InboundMessage) => Promise<RunChannelTurnResult>;
  /** Today's soul-aware chatbot — the no-default-agent fallback. */
  handleIncomingTurn: (input: {
    orgId: string;
    contactId: string;
    channel: "sms";
    incomingMessage: string;
    smsMessageId: string;
  }) => Promise<LegacyTurnResult>;
  /** Audited outbound SMS for the legacy fallback's reply. */
  sendSms: (params: {
    orgId: string;
    userId: null;
    contactId: string;
    toNumber: string;
    body: string;
  }) => Promise<unknown>;
};

export type SmsAutoReplyOutcome = {
  /** Which path produced the reply (or attempted to). */
  path: "agent" | "legacy";
  /** True when a turn ran (agent) or the legacy chatbot produced + sent a reply. */
  handled: boolean;
};

function buildDefaultDeps(): SmsAutoReplyDeps {
  const channelDeps = buildRealChannelTurnDeps();
  const adapter = createTwilioSmsAdapter();
  return {
    runChannelTurn: (inbound) => runChannelTurn(channelDeps, inbound, adapter),
    handleIncomingTurn: async (input) => {
      const { handleIncomingTurn } = await import("@/lib/conversation/runtime");
      return handleIncomingTurn(input);
    },
    sendSms: async (params) => {
      const { sendSmsFromApi } = await import("@/lib/sms/api");
      return sendSmsFromApi(params);
    },
  };
}

/**
 * Route an intent-gated inbound SMS through the agent loop, falling back to the
 * legacy soul-aware chatbot only when the workspace has no default agent.
 * Returns which path ran + whether it was handled. Never throws.
 */
export async function dispatchSmsAutoReply(
  input: SmsAutoReplyInput,
  deps: SmsAutoReplyDeps = buildDefaultDeps(),
): Promise<SmsAutoReplyOutcome> {
  // 1. Agent loop first (tools). The Twilio adapter sends any reply.
  const res = await deps.runChannelTurn({
    channel: "sms",
    fromHandle: input.fromNumber,
    toHandle: input.toNumber,
    text: input.inboundBody,
    contactId: input.contactId,
  });

  if (res.handled) return { path: "agent", handled: true };

  // 2. Only "no_agent" (the workspace has no default agent) falls back to the
  //    legacy chatbot. Every other reason means the agent exists but degraded —
  //    don't double-reply; leave it unread for the operator.
  if (res.reason !== "no_agent") {
    return { path: "agent", handled: false };
  }

  // Legacy soul-aware reply (today's behavior). Best-effort; never throws.
  let responseText: string | null = null;
  try {
    const legacy = await deps.handleIncomingTurn({
      orgId: input.orgId,
      contactId: input.contactId,
      channel: "sms",
      incomingMessage: input.inboundBody,
      smsMessageId: input.smsMessageId,
    });
    responseText = legacy.responseText;
  } catch (err) {
    console.error(
      `[sms-auto-reply] legacy_runtime_failed org=${input.orgId} contact=${input.contactId} err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return { path: "legacy", handled: false };
  }

  if (!responseText) return { path: "legacy", handled: false };

  // Re-export through sendSmsFromApi for the full suppression + audit-log +
  // webhook-dispatch treatment (unchanged from the pre-reroute path).
  try {
    await deps.sendSms({
      orgId: input.orgId,
      userId: null,
      contactId: input.contactId,
      toNumber: input.fromNumber,
      body: responseText,
    });
  } catch (err) {
    console.error(
      `[sms-auto-reply] legacy_send_failed org=${input.orgId} contact=${input.contactId} err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  return { path: "legacy", handled: true };
}
