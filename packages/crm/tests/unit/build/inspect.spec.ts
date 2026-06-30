// inspect — the catalog-entry inspect view (spec 1ff09dcb, P1 Task 2).
//
// `buildInspectView` shapes a resolved catalog entry into Monid's inspect
// response: { id, type, name, description, inputSchema, price, docUrl? }. It is
// PURE — the endpoint does the I/O (resolve the listing / fetch the Composio
// tool's schema) and hands the pieces here. These tests pin the agent-vs-tool
// input-schema shaping + the passthrough of price/docUrl.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildInspectView,
  agentRunInputSchema,
  type InspectSource,
} from "../../../src/lib/build/inspect";

describe("agentRunInputSchema", () => {
  test("is a JSON Schema object exposing the agent's `message` input", () => {
    const schema = agentRunInputSchema();
    assert.equal(schema.type, "object");
    const props = schema.properties as Record<string, unknown>;
    assert.ok(props.message, "message property is present");
    assert.deepEqual(schema.required, ["message"]);
  });
});

describe("buildInspectView — agent", () => {
  const agentSource: InspectSource = {
    type: "agent",
    id: "ace-receptionist",
    name: "24/7 AI Receptionist",
    description: "Answers calls, qualifies the lead, and books the job.",
    price: { type: "per_call", amountCents: 10 },
    capabilities: ["look_up_availability", "book_appointment"],
  };

  test("returns the Monid inspect shape for an agent", () => {
    const view = buildInspectView(agentSource);
    assert.equal(view.id, "ace-receptionist");
    assert.equal(view.type, "agent");
    assert.equal(view.name, "24/7 AI Receptionist");
    assert.equal(view.price.amountCents, 10);
    // an agent is run by sending it a message → the message input schema.
    assert.equal(view.inputSchema.type, "object");
    assert.ok((view.inputSchema.properties as Record<string, unknown>).message);
  });

  test("surfaces the agent's capabilities in the description context", () => {
    const view = buildInspectView(agentSource);
    // capabilities are echoed so a caller knows what the agent can do.
    assert.ok(Array.isArray(view.capabilities));
    assert.deepEqual(view.capabilities, ["look_up_availability", "book_appointment"]);
  });
});

describe("buildInspectView — tool", () => {
  const toolSchema = {
    type: "object",
    properties: {
      recipient_email: { type: "string", description: "Who to email" },
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["recipient_email", "body"],
  };

  const toolSource: InspectSource = {
    type: "tool",
    id: "GMAIL_SEND_EMAIL",
    provider: "gmail",
    name: "Gmail — Send Email",
    description: "Send an email from the connected Gmail account.",
    price: { type: "per_call", amountCents: 0 },
    inputSchema: toolSchema,
    docUrl: "https://docs.composio.dev/tools/gmail",
  };

  test("returns the Monid inspect shape for a tool with its real input schema", () => {
    const view = buildInspectView(toolSource);
    assert.equal(view.id, "GMAIL_SEND_EMAIL");
    assert.equal(view.type, "tool");
    assert.equal(view.provider, "gmail");
    // the tool's OWN schema is passed through verbatim.
    assert.deepEqual(view.inputSchema, toolSchema);
    assert.deepEqual(view.inputSchema.required, ["recipient_email", "body"]);
  });

  test("passes through docUrl when present", () => {
    const view = buildInspectView(toolSource);
    assert.equal(view.docUrl, "https://docs.composio.dev/tools/gmail");
  });

  test("a tool with no fetched schema falls back to a permissive object schema", () => {
    const view = buildInspectView({ ...toolSource, inputSchema: undefined });
    assert.equal(view.inputSchema.type, "object");
    // permissive: unknown props allowed, nothing required.
    assert.equal(view.inputSchema.additionalProperties, true);
  });

  test("omits docUrl when absent (key not present, not undefined string)", () => {
    const view = buildInspectView({ ...toolSource, docUrl: undefined });
    assert.equal("docUrl" in view, false);
  });
});
