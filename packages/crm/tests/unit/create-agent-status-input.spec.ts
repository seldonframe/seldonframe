// Tests for the v1.55.0 optional `status` field on createAgent input.
//
// v1.55 introduces the field so v2/complete can pass status: "test"
// for the auto-created website-chatbot (the chatbot needs to respond
// on the preview page immediately). Backward compat: when omitted,
// status defaults to "draft" — preserves behavior for other callers.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { CreateAgentInput } from "../../src/lib/agents/store";

describe("CreateAgentInput.status — type contract", () => {
  test("accepts no status (defaults to draft at the insert site)", () => {
    // Type-level assertion: this should compile.
    const input: CreateAgentInput = {
      orgId: "org-1",
      archetype: "website-chatbot",
      channel: "web_chat",
      name: "Acme Chatbot",
    };
    assert.equal(input.orgId, "org-1");
    // No status property — typecheck must allow this.
  });

  test("accepts status: 'test'", () => {
    const input: CreateAgentInput = {
      orgId: "org-1",
      archetype: "website-chatbot",
      channel: "web_chat",
      name: "Acme Chatbot",
      status: "test",
    };
    assert.equal(input.status, "test");
  });

  test("accepts status: 'draft'", () => {
    const input: CreateAgentInput = {
      orgId: "org-1",
      archetype: "website-chatbot",
      channel: "web_chat",
      name: "Acme Chatbot",
      status: "draft",
    };
    assert.equal(input.status, "draft");
  });

  test("accepts status: 'live'", () => {
    const input: CreateAgentInput = {
      orgId: "org-1",
      archetype: "website-chatbot",
      channel: "web_chat",
      name: "Acme Chatbot",
      status: "live",
    };
    assert.equal(input.status, "live");
  });
});
