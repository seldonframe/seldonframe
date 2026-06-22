// Multi-surface runtime — tests for the SMS auto-reply dispatcher.
//
// dispatchSmsAutoReply is the SINGLE seam the Twilio SMS webhook calls at its
// (already intent-gated) auto-reply point. It routes the inbound message through
// the agent loop (runChannelTurn + the Twilio adapter) FIRST; only when the
// workspace has no default agent (runChannelTurn → reason "no_agent") does it
// fall back to today's soul-aware chatbot (handleIncomingTurn + sendSmsFromApi),
// so existing workspaces that rely on that path never regress.
//
// Everything is DI'd — no Twilio / Anthropic / Neon. We assert WHICH path ran
// for each runChannelTurn outcome and that the legacy fallback sends the reply.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { dispatchSmsAutoReply } from "../../../../src/lib/agents/channels/sms-auto-reply";

const BASE = {
  orgId: "org-1",
  contactId: "contact-1",
  fromNumber: "+15125559999",
  toNumber: "+18335550100",
  inboundBody: "do you have any openings friday?",
  smsMessageId: "sms-1",
};

describe("dispatchSmsAutoReply", () => {
  test("agent loop handled it → no legacy fallback runs", async () => {
    let runChannelTurnCalls = 0;
    let legacyCalls = 0;
    let smsSends = 0;
    let runChannelTurnArg: unknown = null;

    const out = await dispatchSmsAutoReply(BASE, {
      runChannelTurn: async (inbound) => {
        runChannelTurnCalls++;
        runChannelTurnArg = inbound;
        return { handled: true, conversationId: "conv-9" };
      },
      handleIncomingTurn: async () => {
        legacyCalls++;
        return { responseText: "legacy reply" };
      },
      sendSms: async () => {
        smsSends++;
      },
    });

    assert.equal(runChannelTurnCalls, 1);
    assert.equal(legacyCalls, 0, "legacy chatbot must NOT run when the agent handled it");
    assert.equal(smsSends, 0, "the adapter inside runChannelTurn owns the send");
    assert.deepEqual(out, { path: "agent", handled: true });
    // The inbound normalized for the agent loop: sender = fromNumber, our
    // number = toNumber, the body as text, contact threaded.
    assert.deepEqual(runChannelTurnArg, {
      channel: "sms",
      fromHandle: "+15125559999",
      toHandle: "+18335550100",
      text: "do you have any openings friday?",
      contactId: "contact-1",
    });
  });

  test("no default agent (reason no_agent) → falls back to legacy chatbot + sends reply", async () => {
    let legacyArg: unknown = null;
    let smsArg: unknown = null;

    const out = await dispatchSmsAutoReply(BASE, {
      runChannelTurn: async () => ({ handled: false, reason: "no_agent" }),
      handleIncomingTurn: async (arg) => {
        legacyArg = arg;
        return { responseText: "Sure — Friday at 2pm is open!" };
      },
      sendSms: async (arg) => {
        smsArg = arg;
      },
    });

    assert.deepEqual(out, { path: "legacy", handled: true });
    // Legacy runtime got the same inputs the pre-reroute route passed.
    assert.deepEqual(legacyArg, {
      orgId: "org-1",
      contactId: "contact-1",
      channel: "sms",
      incomingMessage: "do you have any openings friday?",
      smsMessageId: "sms-1",
    });
    // And the legacy reply was sent back to the sender via the audited path.
    assert.deepEqual(smsArg, {
      orgId: "org-1",
      userId: null,
      contactId: "contact-1",
      toNumber: "+15125559999",
      body: "Sure — Friday at 2pm is open!",
    });
  });

  test("agent degraded (reason llm_not_configured, NOT no_agent) → no legacy fallback, no send", async () => {
    let legacyCalls = 0;
    let smsSends = 0;
    const out = await dispatchSmsAutoReply(BASE, {
      runChannelTurn: async () => ({ handled: false, reason: "llm_not_configured" }),
      handleIncomingTurn: async () => {
        legacyCalls++;
        return { responseText: "x" };
      },
      sendSms: async () => {
        smsSends++;
      },
    });
    // Degraded ≠ unconfigured-workspace. We do NOT double-run the legacy chatbot
    // (the agent exists; it just hiccuped) — the operator sees it unread.
    assert.equal(legacyCalls, 0);
    assert.equal(smsSends, 0);
    assert.deepEqual(out, { path: "agent", handled: false });
  });

  test("legacy fallback with empty responseText → no send", async () => {
    let smsSends = 0;
    const out = await dispatchSmsAutoReply(BASE, {
      runChannelTurn: async () => ({ handled: false, reason: "no_agent" }),
      handleIncomingTurn: async () => ({ responseText: null }),
      sendSms: async () => {
        smsSends++;
      },
    });
    assert.equal(smsSends, 0);
    assert.deepEqual(out, { path: "legacy", handled: false });
  });

  test("legacy sendSms failure is swallowed (best-effort, never throws)", async () => {
    const out = await dispatchSmsAutoReply(BASE, {
      runChannelTurn: async () => ({ handled: false, reason: "no_agent" }),
      handleIncomingTurn: async () => ({ responseText: "hi" }),
      sendSms: async () => {
        throw new Error("twilio 500");
      },
    });
    // Reply send failed but the inbound is already persisted — don't throw.
    assert.deepEqual(out, { path: "legacy", handled: true });
  });

  test("legacy handleIncomingTurn throwing is swallowed (never throws to the webhook)", async () => {
    const out = await dispatchSmsAutoReply(BASE, {
      runChannelTurn: async () => ({ handled: false, reason: "no_agent" }),
      handleIncomingTurn: async () => {
        throw new Error("runtime boom");
      },
      sendSms: async () => {},
    });
    assert.deepEqual(out, { path: "legacy", handled: false });
  });
});
