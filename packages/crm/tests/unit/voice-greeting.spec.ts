import { test } from "node:test";
import assert from "node:assert/strict";

import {
  shouldGreetOnInbound,
  buildVoiceGreeting,
  buildGreetingTwiml,
} from "@/lib/agents/voice/greeting";

// 2026-06-10 — Inbound-call greeting for missed-call-text-back. The voice
// webhook answers + texts deterministically when the agent is deployed,
// instead of relying on Twilio's flaky "missed" classification.

test("shouldGreetOnInbound is true only when deployed and not paused", () => {
  assert.equal(shouldGreetOnInbound("2026-06-10T18:05:00Z", null), true);
  assert.equal(shouldGreetOnInbound(null, null), false);
  assert.equal(shouldGreetOnInbound(undefined, undefined), false);
  // Deployed but paused → do not greet.
  assert.equal(
    shouldGreetOnInbound("2026-06-10T18:05:00Z", "2026-06-10T19:00:00Z"),
    false,
  );
});

test("buildVoiceGreeting names the business when provided", () => {
  const g = buildVoiceGreeting("Seldon Studio");
  assert.ok(g.includes("Seldon Studio"), g);
  assert.ok(g.toLowerCase().includes("text"), g);
});

test("buildVoiceGreeting falls back to a generic line when no usable name", () => {
  const g = buildVoiceGreeting("   ");
  assert.ok(g.includes("calling us"), g);
  assert.ok(!g.includes("undefined"), g);
});

test("buildGreetingTwiml produces valid TwiML with Say + Hangup", () => {
  const xml = buildGreetingTwiml("Hi there");
  assert.ok(xml.startsWith("<?xml"), xml);
  assert.ok(xml.includes("<Response>"), xml);
  assert.ok(xml.includes("<Say>Hi there</Say>"), xml);
  assert.ok(xml.includes("<Hangup/>"), xml);
});

test("buildGreetingTwiml escapes XML-special characters", () => {
  const xml = buildGreetingTwiml("Tom & Jerry's <Plumbing>");
  assert.ok(xml.includes("Tom &amp; Jerry&apos;s &lt;Plumbing&gt;"), xml);
  // The raw, unescaped tag must NOT leak into the TwiML.
  assert.ok(!xml.includes("<Plumbing>"), xml);
});
