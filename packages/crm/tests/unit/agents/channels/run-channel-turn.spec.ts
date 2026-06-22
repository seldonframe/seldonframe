// Multi-surface runtime — tests for the channel-adapter seam.
//
// Two pure, DB-free, dependency-injected units:
//   1. resolveInboundAgent(deps, toHandle) — the UNIFIED inbound resolver.
//      deployment-number match FIRST (→ client workspace's default agent, so
//      orgId = clientOrgId and writes land in the CLIENT org); else workspace
//      number match (→ that workspace's default agent); else null.
//   2. runChannelTurn(deps, inbound, adapter) — resolve → get-or-create the
//      agentConversations thread → executeTurn → adapter.sendReply(reply).
//      Soft-fail throughout: a resolver miss or an executeTurn {ok:false}
//      returns { handled:false, reason } and sends NO reply (never throws).
//
// Everything is DI'd (mirrors resolve-deployment-by-number.spec.ts +
// voice-agent.spec.ts), so no Postgres / Anthropic / Twilio is touched.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveInboundAgent,
  runChannelTurn,
  type ResolveInboundAgentDeps,
  type RunChannelTurnDeps,
  type ChannelAdapter,
  type InboundMessage,
} from "../../../../src/lib/agents/channels/run-channel-turn";

// ─── resolveInboundAgent ──────────────────────────────────────────────────

describe("resolveInboundAgent", () => {
  test("deployment-number match → client workspace default agent (orgId = clientOrgId)", async () => {
    let workspaceResolverCalled = false;
    const deps: ResolveInboundAgentDeps = {
      // Deployment carries a provisioned client workspace (clientOrgId set).
      resolveDeploymentByNumber: async () => ({
        clientOrgId: "client-org-1",
      }),
      resolveOrgByFromNumber: async () => {
        workspaceResolverCalled = true;
        return "builder-org-should-not-be-used";
      },
      // The client org's default agent.
      loadDefaultAgent: async (orgId) =>
        orgId === "client-org-1"
          ? { agentId: "agent-client-default", orgId: "client-org-1" }
          : null,
    };

    const resolved = await resolveInboundAgent(deps, "+18335550100");
    assert.deepEqual(resolved, {
      agentId: "agent-client-default",
      orgId: "client-org-1",
    });
    // Deployment matched first → the workspace resolver must NOT run.
    assert.equal(workspaceResolverCalled, false);
  });

  test("deployment match but clientOrgId null → falls through to workspace resolver", async () => {
    const deps: ResolveInboundAgentDeps = {
      // Legacy deployment with no provisioned client workspace.
      resolveDeploymentByNumber: async () => ({ clientOrgId: null }),
      resolveOrgByFromNumber: async () => "workspace-org-9",
      loadDefaultAgent: async (orgId) =>
        orgId === "workspace-org-9"
          ? { agentId: "agent-ws-default", orgId: "workspace-org-9" }
          : null,
    };

    const resolved = await resolveInboundAgent(deps, "+18335550100");
    assert.deepEqual(resolved, {
      agentId: "agent-ws-default",
      orgId: "workspace-org-9",
    });
  });

  test("no deployment, workspace number match → workspace default agent", async () => {
    const deps: ResolveInboundAgentDeps = {
      resolveDeploymentByNumber: async () => null,
      resolveOrgByFromNumber: async () => "workspace-org-2",
      loadDefaultAgent: async (orgId) =>
        orgId === "workspace-org-2"
          ? { agentId: "agent-ws", orgId: "workspace-org-2" }
          : null,
    };

    const resolved = await resolveInboundAgent(deps, "+15125550111");
    assert.deepEqual(resolved, { agentId: "agent-ws", orgId: "workspace-org-2" });
  });

  test("neither deployment nor workspace matches → null", async () => {
    const deps: ResolveInboundAgentDeps = {
      resolveDeploymentByNumber: async () => null,
      resolveOrgByFromNumber: async () => null,
      loadDefaultAgent: async () => null,
    };

    assert.equal(await resolveInboundAgent(deps, "+10000000000"), null);
  });

  test("org resolves but it has NO default agent → null", async () => {
    const deps: ResolveInboundAgentDeps = {
      resolveDeploymentByNumber: async () => null,
      resolveOrgByFromNumber: async () => "org-without-agent",
      loadDefaultAgent: async () => null, // no slug='default' agent
    };

    assert.equal(await resolveInboundAgent(deps, "+15125550111"), null);
  });

  test("soft-fails (returns null) when a resolver throws", async () => {
    const deps: ResolveInboundAgentDeps = {
      resolveDeploymentByNumber: async () => {
        throw new Error("db down");
      },
      resolveOrgByFromNumber: async () => "x",
      loadDefaultAgent: async () => ({ agentId: "a", orgId: "x" }),
    };

    assert.equal(await resolveInboundAgent(deps, "+15125550111"), null);
  });
});

// ─── runChannelTurn ───────────────────────────────────────────────────────

function makeInbound(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    channel: "sms",
    fromHandle: "+15125559999",
    toHandle: "+18335550100",
    text: "do you have any openings friday?",
    contactId: "contact-1",
    ...overrides,
  };
}

describe("runChannelTurn", () => {
  test("resolves agent → get-or-create conversation → executeTurn → adapter.sendReply(assistantMessage)", async () => {
    const sent: Array<{ to: string; from: string; orgId: string; text: string }> = [];
    let executeTurnArg: { conversationId: string; userMessage: string } | null = null;
    let getOrCreateArg: unknown = null;

    const adapter: ChannelAdapter = {
      sendReply: async (target, text) => {
        sent.push({
          to: target.toHandle,
          from: target.fromHandle,
          orgId: target.orgId,
          text,
        });
      },
    };

    const deps: RunChannelTurnDeps = {
      resolveInboundAgent: async () => ({
        agentId: "agent-1",
        orgId: "client-org-1",
      }),
      getOrCreateConversation: async (arg) => {
        getOrCreateArg = arg;
        return "conv-123";
      },
      executeTurn: async (arg) => {
        executeTurnArg = arg;
        return {
          ok: true,
          assistantMessage: "Yes! Friday at 2pm works — want me to book it?",
        };
      },
    };

    const res = await runChannelTurn(deps, makeInbound(), adapter);

    assert.deepEqual(res, { handled: true, conversationId: "conv-123" });
    // executeTurn got the conversation id + the inbound text as the user message.
    assert.deepEqual(executeTurnArg, {
      conversationId: "conv-123",
      userMessage: "do you have any openings friday?",
    });
    // The conversation was created against the resolved agent + org, scoped to
    // the inbound channel + the sender handle + contact.
    assert.deepEqual(getOrCreateArg, {
      agentId: "agent-1",
      orgId: "client-org-1",
      channel: "sms",
      fromHandle: "+15125559999",
      contactId: "contact-1",
    });
    // The reply went back to the SENDER (fromHandle), tagged with the resolved
    // org (so the adapter sends from the right workspace — client org).
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], {
      to: "+18335550100",
      from: "+15125559999",
      orgId: "client-org-1",
      text: "Yes! Friday at 2pm works — want me to book it?",
    });
  });

  test("resolver returns null → {handled:false, reason:'no_agent'}, executeTurn NOT called, no reply", async () => {
    let executeCalled = false;
    let sendCalled = false;
    const adapter: ChannelAdapter = {
      sendReply: async () => {
        sendCalled = true;
      },
    };
    const deps: RunChannelTurnDeps = {
      resolveInboundAgent: async () => null,
      getOrCreateConversation: async () => "should-not-happen",
      executeTurn: async () => {
        executeCalled = true;
        return { ok: true, assistantMessage: "x" };
      },
    };

    const res = await runChannelTurn(deps, makeInbound(), adapter);
    assert.deepEqual(res, { handled: false, reason: "no_agent" });
    assert.equal(executeCalled, false);
    assert.equal(sendCalled, false);
  });

  test("executeTurn {ok:false} → no reply sent, returns {handled:false} (soft)", async () => {
    let sendCalled = false;
    const adapter: ChannelAdapter = {
      sendReply: async () => {
        sendCalled = true;
      },
    };
    const deps: RunChannelTurnDeps = {
      resolveInboundAgent: async () => ({ agentId: "a", orgId: "o" }),
      getOrCreateConversation: async () => "conv-x",
      executeTurn: async () => ({
        ok: false,
        reason: "llm_not_configured",
        fallbackMessage: "…",
      }),
    };

    const res = await runChannelTurn(deps, makeInbound(), adapter);
    assert.equal(res.handled, false);
    assert.equal(sendCalled, false);
    if (!res.handled) assert.equal(res.reason, "llm_not_configured");
  });

  test("empty assistantMessage → handled but NO send (don't text an empty body)", async () => {
    let sendCalled = false;
    const adapter: ChannelAdapter = {
      sendReply: async () => {
        sendCalled = true;
      },
    };
    const deps: RunChannelTurnDeps = {
      resolveInboundAgent: async () => ({ agentId: "a", orgId: "o" }),
      getOrCreateConversation: async () => "conv-x",
      executeTurn: async () => ({ ok: true, assistantMessage: "   " }),
    };

    const res = await runChannelTurn(deps, makeInbound(), adapter);
    assert.deepEqual(res, { handled: true, conversationId: "conv-x" });
    assert.equal(sendCalled, false);
  });

  test("get-or-create throws → soft-fail {handled:false}, executeTurn not reached", async () => {
    let executeCalled = false;
    const adapter: ChannelAdapter = { sendReply: async () => {} };
    const deps: RunChannelTurnDeps = {
      resolveInboundAgent: async () => ({ agentId: "a", orgId: "o" }),
      getOrCreateConversation: async () => {
        throw new Error("insert failed");
      },
      executeTurn: async () => {
        executeCalled = true;
        return { ok: true, assistantMessage: "x" };
      },
    };

    const res = await runChannelTurn(deps, makeInbound(), adapter);
    assert.equal(res.handled, false);
    assert.equal(executeCalled, false);
  });

  test("adapter.sendReply throws → still returns handled:true (reply failure is soft)", async () => {
    const deps: RunChannelTurnDeps = {
      resolveInboundAgent: async () => ({ agentId: "a", orgId: "o" }),
      getOrCreateConversation: async () => "conv-x",
      executeTurn: async () => ({ ok: true, assistantMessage: "hello" }),
    };
    const adapter: ChannelAdapter = {
      sendReply: async () => {
        throw new Error("twilio 500");
      },
    };

    // The turn ran + persisted (executeTurn already wrote the assistant turn);
    // only the outbound send failed. We don't want to claim no_agent or retry
    // the whole turn — report handled with the conversation id.
    const res = await runChannelTurn(deps, makeInbound(), adapter);
    assert.deepEqual(res, { handled: true, conversationId: "conv-x" });
  });

  test("email channel routes identically (toHandle/fromHandle are addresses)", async () => {
    const sent: Array<{ to: string; from: string; text: string }> = [];
    const adapter: ChannelAdapter = {
      sendReply: async (target, text) => {
        sent.push({ to: target.toHandle, from: target.fromHandle, text });
      },
    };
    const deps: RunChannelTurnDeps = {
      resolveInboundAgent: async () => ({ agentId: "a", orgId: "o" }),
      getOrCreateConversation: async () => "conv-email",
      executeTurn: async () => ({ ok: true, assistantMessage: "Thanks for reaching out!" }),
    };

    const res = await runChannelTurn(
      deps,
      makeInbound({
        channel: "email",
        fromHandle: "jane@example.com",
        toHandle: "hello@acme.com",
        text: "what are your hours?",
      }),
      adapter,
    );

    assert.deepEqual(res, { handled: true, conversationId: "conv-email" });
    assert.equal(sent[0].from, "jane@example.com");
    assert.equal(sent[0].text, "Thanks for reaching out!");
  });
});
