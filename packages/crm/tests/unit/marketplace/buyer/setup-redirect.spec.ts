// Marketplace buyer onboarding — TDD for the pure setup-redirect target.
//
// After a purchase (free install OR a paid purchase activating), the buyer is
// routed to a focused setup wizard at /agent/<deploymentId>/setup. The path
// builder is pure so the install action, the webhook, and the success UI all
// agree on ONE target string.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buyerSetupPath,
  buyerAgentPath,
} from "../../../../src/lib/marketplace/buyer/buyer-routes";

test("buyerSetupPath points at the deployment's setup wizard", () => {
  assert.equal(buyerSetupPath("dep-123"), "/agent/dep-123/setup");
});

test("buyerAgentPath points at the deployment's My Agent home", () => {
  assert.equal(buyerAgentPath("dep-123"), "/agent/dep-123");
});

test("buyerSetupPath trims a stray-whitespace id", () => {
  assert.equal(buyerSetupPath("  dep-9 "), "/agent/dep-9/setup");
});

test("buyerSetupPath returns null for a missing id (no half-built URL)", () => {
  assert.equal(buyerSetupPath(""), null);
  assert.equal(buyerSetupPath(null), null);
  assert.equal(buyerSetupPath(undefined), null);
});

test("buyerAgentPath returns null for a missing id", () => {
  assert.equal(buyerAgentPath(""), null);
});
