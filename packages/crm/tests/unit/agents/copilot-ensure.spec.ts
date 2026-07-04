// Hidden per-org SeldonChat agent bootstrap (TDD, win-ladder P0/Task 2).
//
// ensureWorkspaceCopilotAgent(orgId) get-or-creates ONE agent row per org
// (archetype: "workspace_copilot" — the schema's discriminator column is
// named `archetype`, not `type`; see packages/crm/src/db/schema/agents.ts.
// The plan's "type" language maps onto this existing column exactly as
// every other archetype does — no migration) + ONE agent_conversations row
// per (agent, operator user id), keyed via the conversation's
// `anonymousSessionId` column (the same external-key column the public
// turn route dedupes conversations on) storing `copilot:<userId>`.
//
// Pure orchestration around injected deps — runs DB-free with stubs.

import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";

import { ensureWorkspaceCopilotAgent } from "../../../src/lib/agents/copilot/ensure-agent";

describe("ensureWorkspaceCopilotAgent", () => {
  test("creates the copilot agent when absent", async () => {
    const createAgent = mock.fn(async () => ({ id: "agent-1" }));
    const findAgent = mock.fn(async () => undefined);
    const findConversation = mock.fn(async () => undefined);
    const createConversation = mock.fn(async () => ({ id: "conv-1" }));

    const result = await ensureWorkspaceCopilotAgent("org-1", {
      findAgent,
      createAgent,
      findConversation,
      createConversation,
    });

    assert.equal(result.agentId, "agent-1");
    assert.equal(createAgent.mock.callCount(), 1);
    const createArgs = createAgent.mock.calls[0]!.arguments[0] as {
      orgId: string;
      name: string;
      archetype: string;
      blueprint: { capabilities: string[] };
    };
    assert.equal(createArgs.orgId, "org-1");
    assert.equal(createArgs.name, "SeldonChat");
    assert.equal(createArgs.archetype, "workspace_copilot");
    assert.deepEqual(createArgs.blueprint.capabilities, ["workspace_copilot"]);
  });

  test("returns the existing agent when present (no create call)", async () => {
    const createAgent = mock.fn(async () => ({ id: "should-not-be-used" }));
    const findAgent = mock.fn(async () => ({ id: "existing-agent" }));
    const findConversation = mock.fn(async () => ({ id: "conv-1" }));
    const createConversation = mock.fn(async () => ({ id: "should-not-be-used" }));

    const result = await ensureWorkspaceCopilotAgent("org-1", {
      findAgent,
      createAgent,
      findConversation,
      createConversation,
    });

    assert.equal(result.agentId, "existing-agent");
    assert.equal(createAgent.mock.callCount(), 0);
  });

  test("conversationIdFor keys conversations per user via the copilot:<userId> external key", async () => {
    const findAgent = mock.fn(async () => ({ id: "agent-1" }));
    const createAgent = mock.fn(async () => ({ id: "unused" }));
    const findConversation = mock.fn(async () => undefined);
    const createConversation = mock.fn(async (input: { agentId: string; externalKey: string }) => ({
      id: `conv-for-${input.externalKey}`,
    }));

    const result = await ensureWorkspaceCopilotAgent("org-1", {
      findAgent,
      createAgent,
      findConversation,
      createConversation,
    });

    const conversationId = await result.conversationIdFor("user-42");

    assert.equal(conversationId, "conv-for-copilot:user-42");
    assert.equal(createConversation.mock.callCount(), 1);
    const createConvArgs = createConversation.mock.calls[0]!.arguments[0] as {
      agentId: string;
      externalKey: string;
    };
    assert.equal(createConvArgs.agentId, "agent-1");
    assert.equal(createConvArgs.externalKey, "copilot:user-42");
  });

  test("conversationIdFor is idempotent — second call for the same user returns the existing conversation, no second create", async () => {
    const findAgent = mock.fn(async () => ({ id: "agent-1" }));
    const createAgent = mock.fn(async () => ({ id: "unused" }));
    let existing: { id: string } | undefined;
    const findConversation = mock.fn(async () => existing);
    const createConversation = mock.fn(async () => {
      existing = { id: "conv-1" };
      return existing;
    });

    const result = await ensureWorkspaceCopilotAgent("org-1", {
      findAgent,
      createAgent,
      findConversation,
      createConversation,
    });

    const first = await result.conversationIdFor("user-42");
    const second = await result.conversationIdFor("user-42");

    assert.equal(first, "conv-1");
    assert.equal(second, "conv-1");
    assert.equal(createConversation.mock.callCount(), 1);
  });

  test("conversationIdFor keys different users to different conversations", async () => {
    const findAgent = mock.fn(async () => ({ id: "agent-1" }));
    const createAgent = mock.fn(async () => ({ id: "unused" }));
    const conversationsByKey = new Map<string, { id: string }>();
    const findConversation = mock.fn(async (input: { externalKey: string }) =>
      conversationsByKey.get(input.externalKey),
    );
    const createConversation = mock.fn(async (input: { externalKey: string }) => {
      const row = { id: `conv-${input.externalKey}` };
      conversationsByKey.set(input.externalKey, row);
      return row;
    });

    const result = await ensureWorkspaceCopilotAgent("org-1", {
      findAgent,
      createAgent,
      findConversation,
      createConversation,
    });

    const a = await result.conversationIdFor("user-a");
    const b = await result.conversationIdFor("user-b");

    assert.equal(a, "conv-copilot:user-a");
    assert.equal(b, "conv-copilot:user-b");
    assert.equal(createConversation.mock.callCount(), 2);
  });
});
