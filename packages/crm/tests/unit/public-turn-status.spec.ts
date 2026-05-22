// 2026-05-22 — public turn conversation status decision (bug fix).
//
// BUG: public visitors using the auto-deployed website chatbot on /w/[slug]
// were completing full booking conversations but nothing persisted. The
// root cause was the public /api/v1/public/agent/[slug]/turn route writing
// `agent_conversations.status = "test"` whenever `agent.status === "test"`,
// which makes the book_appointment + escalate_to_human tools short-circuit
// (testMode no-op stubs in lib/agents/tools.ts).
//
// Auto-created chatbots are scaffolded with status="test" by the v2 flow
// and the web-onboarding URL/paste routes. Public traffic from real
// customers therefore never produced bookings, contacts, or deals.
//
// FIX (Part A — belt half of belt-and-suspenders): the public turn route
// uses `decidePublicConversationStatus()` to decide the conversation's
// status. Anonymous public callers always get "active" — the bug fix.
// Authenticated operators testing their own chatbot via /agents/[id]/test
// can opt INTO test-mode by setting `x-test-mode: 1`; the route refuses
// the header for anonymous callers.
//
// (Part B — suspenders half — auto-creators publish status="live" instead
// of "test"; tested separately in auto-create-website-chatbot.spec.ts.)

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { decidePublicConversationStatus } from "../../src/lib/agents/public-turn-status";

describe("decidePublicConversationStatus — Part A bug fix", () => {
  test("anonymous caller + agent.status='test' → 'active' (THE BUG FIX)", () => {
    // This is the production bug: public visitor lands on /w/[slug] and
    // chats with an auto-deployed chatbot whose status is "test". Pre-fix
    // this returned "test", causing the booking tool to no-op. Post-fix
    // it returns "active" so real bookings/contacts/deals persist.
    const status = decidePublicConversationStatus({
      agentStatus: "test",
      requestedTestMode: false,
      isAuthenticatedOperator: false,
    });
    assert.equal(status, "active");
  });

  test("anonymous caller + agent.status='live' → 'active'", () => {
    const status = decidePublicConversationStatus({
      agentStatus: "live",
      requestedTestMode: false,
      isAuthenticatedOperator: false,
    });
    assert.equal(status, "active");
  });

  test("anonymous caller WITH x-test-mode header → 'active' (header refused)", () => {
    // An anonymous caller cannot opt into test mode by setting the
    // header. Without this guard the bug fix is trivially bypassable —
    // any public visitor could send `x-test-mode: 1` and the chatbot
    // would silently stop writing to the DB.
    const status = decidePublicConversationStatus({
      agentStatus: "test",
      requestedTestMode: true,
      isAuthenticatedOperator: false,
    });
    assert.equal(status, "active");
  });

  test("authenticated operator + x-test-mode header + agent.status='test' → 'test'", () => {
    // Operator sandbox path. /agents/[id]/test sends the header so the
    // booking tool short-circuits (testMode plumbing in tools.ts). This
    // preserves the existing operator-sandbox UX without affecting public
    // traffic.
    const status = decidePublicConversationStatus({
      agentStatus: "test",
      requestedTestMode: true,
      isAuthenticatedOperator: true,
    });
    assert.equal(status, "test");
  });

  test("authenticated operator + x-test-mode header + agent.status='live' → 'test'", () => {
    // Operator can also opt into test mode even when the agent is live —
    // useful for "is this still safe?" smoke tests after a blueprint
    // update. The header is the gate, not the agent status.
    const status = decidePublicConversationStatus({
      agentStatus: "live",
      requestedTestMode: true,
      isAuthenticatedOperator: true,
    });
    assert.equal(status, "test");
  });

  test("authenticated operator WITHOUT x-test-mode header → 'active'", () => {
    // Operator can also chat with their own chatbot like a real customer
    // would (no header set). In that case turns persist real bookings —
    // matches the customer experience.
    const status = decidePublicConversationStatus({
      agentStatus: "test",
      requestedTestMode: false,
      isAuthenticatedOperator: true,
    });
    assert.equal(status, "active");
  });
});
