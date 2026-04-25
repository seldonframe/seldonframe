// Tests for MessageTriggerSchema + cross-ref validator.
// SLICE 7 PR 1 C2 per audit §3.1-3.3 + gates G-7-1, G-7-1b, G-7-2, G-7-3.
//
// Third branch of the discriminated-union TriggerSchema (after C1 event,
// SLICE 5 C2 schedule). Adds cross-ref Zod validation per L-17 cross-ref
// edge-count scaling rule:
//
// Cross-ref edges in MessageTriggerSchema (per audit §3.2):
//   1. pattern.kind === "regex" → must compile (inline superRefine)
//   2. channel === "sms" ⇒ binding.kind in {any, phone} (top-level superRefine)
//   3. channel === "email" reserved for SLICE 7b — REJECT in SLICE 7
//   4. binding.kind === "phone" ⇒ binding.number is valid E.164
//   5. pattern.kind != "any" requires pattern.value
//   6. G-7-1b foot-gun guardrail: pattern.kind === "any" + binding.kind === "any" → reject
//
// Total: 5-6 edges, lands in interpolated 7-9 band lower edge OR upper 4-6 band.
// Per L-17, projected test multiplier 2.8-3.0x.
//
// Per gate decisions:
//   G-7-1:  exact, contains, starts_with, regex, any
//   G-7-1b: pattern.any + binding.any = INVALID at parse
//   G-7-2:  channel ["sms"] in v1; "email" reserved for 7b
//   G-7-3:  channelBinding ["any", "phone"] in v1
//
// Default case-insensitivity for exact/contains/starts_with per G-7-1
// (verified at evaluator level in C4 spec, not here — schema only stores
// the caseSensitive bool with default false).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  validateAgentSpec,
  type BlockRegistry,
  type EventRegistry,
} from "../../src/lib/agents/validator";

const testEventRegistry: EventRegistry = {
  events: [{ type: "form.submitted", fields: {} }],
};
const testBlockRegistry: BlockRegistry = {
  tools: new Map(),
  producesByBlock: new Map(),
};

function baseSpec(trigger: unknown): unknown {
  return {
    id: "test",
    name: "t",
    description: "t",
    trigger,
    variables: {},
    steps: [{ id: "s1", type: "wait", seconds: 1, next: null }],
  };
}

function triggerIssues(spec: unknown) {
  const result = validateAgentSpec(spec, testBlockRegistry, testEventRegistry);
  return result.filter((i) => i.path === "trigger" || i.path.startsWith("trigger."));
}

// ---------------------------------------------------------------------
// 1. Happy-path message triggers (each pattern mode × binding kind)
// ---------------------------------------------------------------------

describe("MessageTriggerSchema — happy path: each pattern mode", () => {
  test("accepts pattern.kind='exact' with binding.any", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "CONFIRM" },
    });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });

  test("accepts pattern.kind='contains' with binding.any", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "contains", value: "refund" },
    });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });

  test("accepts pattern.kind='starts_with' with binding.any", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "starts_with", value: "STOP" },
    });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });

  test("accepts pattern.kind='regex' with valid regex", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "regex", value: "^(YES|CONFIRM|OK)$", flags: "i" },
    });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });

  test("accepts pattern.kind='any' with specific phone binding", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "phone", number: "+15551234567" },
      pattern: { kind: "any" },
    });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });

  test("caseSensitive defaults to false on exact/contains/starts_with (parse succeeds without it)", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "confirm" },
    });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });
});

// ---------------------------------------------------------------------
// 2. Pattern mode validation
// ---------------------------------------------------------------------

describe("MessageTriggerSchema — pattern mode validation", () => {
  test("rejects unknown pattern kind", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "fuzzy", value: "x" },
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });

  test("rejects pattern with empty value (modes that need value)", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "" },
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });

  test("rejects pattern with missing value (modes that need value)", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "contains" },
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });

  test("pattern.any does NOT require value field", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "phone", number: "+15551234567" },
      pattern: { kind: "any" },
    });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });
});

// ---------------------------------------------------------------------
// 3. Regex compile-time validation (cross-ref edge: regex must compile)
// ---------------------------------------------------------------------

describe("MessageTriggerSchema — regex compile validation", () => {
  test("rejects malformed regex (unbalanced parens)", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "regex", value: "(unclosed" },
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
    assert.match(issues[0].message.toLowerCase(), /regex|invalid/);
  });

  test("rejects malformed regex (invalid character class)", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "regex", value: "[a-" },
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });

  test("rejects regex with invalid flags", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "regex", value: "abc", flags: "Q" },
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });

  test("accepts regex with valid flags (i, g, m, s, u)", () => {
    for (const flags of ["i", "g", "m", "s", "u", "im", "gmi"]) {
      const spec = baseSpec({
        type: "message",
        channel: "sms",
        channelBinding: { kind: "any" },
        pattern: { kind: "regex", value: "abc", flags },
      });
      const issues = triggerIssues(spec);
      assert.equal(issues.length, 0, `flags=${flags} should pass; got ${JSON.stringify(issues)}`);
    }
  });

  test("accepts regex without flags field", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "regex", value: "abc" },
    });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });
});

// ---------------------------------------------------------------------
// 4. Channel validation (G-7-2: SMS only in v1, email reserved for 7b)
// ---------------------------------------------------------------------

describe("MessageTriggerSchema — channel validation (G-7-2)", () => {
  test("accepts channel='sms'", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "x" },
    });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });

  test("rejects channel='email' (reserved for SLICE 7b)", () => {
    const spec = baseSpec({
      type: "message",
      channel: "email",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "x" },
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });

  test("rejects unknown channel", () => {
    const spec = baseSpec({
      type: "message",
      channel: "voice",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "x" },
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });

  test("rejects missing channel field", () => {
    const spec = baseSpec({
      type: "message",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "x" },
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });
});

// ---------------------------------------------------------------------
// 5. Channel binding validation (G-7-3: any + phone in v1)
// ---------------------------------------------------------------------

describe("MessageTriggerSchema — binding validation (G-7-3)", () => {
  test("accepts binding.kind='any'", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "x" },
    });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });

  test("accepts binding.kind='phone' with valid E.164", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "phone", number: "+15551234567" },
      pattern: { kind: "exact", value: "x" },
    });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });

  test("rejects binding.kind='phone' with non-E.164 number", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "phone", number: "555-123-4567" },
      pattern: { kind: "exact", value: "x" },
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });

  test("rejects binding.kind='phone' with empty number", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "phone", number: "" },
      pattern: { kind: "exact", value: "x" },
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });

  test("rejects binding.kind='email' (reserved for SLICE 7b)", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "email", address: "a@b.com" },
      pattern: { kind: "exact", value: "x" },
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });

  test("rejects unknown binding kind", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "tag", value: "marketing" },
      pattern: { kind: "exact", value: "x" },
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });

  test("rejects missing channelBinding field", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      pattern: { kind: "exact", value: "x" },
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });
});

// ---------------------------------------------------------------------
// 6. Foot-gun guardrail (G-7-1b: pattern.any + binding.any → reject)
// ---------------------------------------------------------------------

describe("MessageTriggerSchema — G-7-1b foot-gun guardrail", () => {
  test("rejects pattern.any + binding.any combination at parse time", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "any" },
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0, "pattern.any + binding.any must reject");
    // Per G-7-1b: error message should be specific about the combination.
    assert.match(
      issues[0].message.toLowerCase(),
      /any.*any|both|combination|specific/,
      `expected specific guardrail message; got: ${issues[0].message}`,
    );
  });

  test("accepts pattern.any with specific phone binding", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "phone", number: "+15551234567" },
      pattern: { kind: "any" },
    });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });

  test("accepts specific pattern with binding.any", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "contains", value: "DEMO" },
    });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });
});

// ---------------------------------------------------------------------
// 7. Discriminator behavior (preserves event + schedule branches)
// ---------------------------------------------------------------------

describe("TriggerSchema with three branches — discriminator", () => {
  test("type='event' still works (C1+C2 invariant preserved)", () => {
    const spec = baseSpec({ type: "event", event: "form.submitted" });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0);
  });

  test("type='schedule' still works (SLICE 5 invariant preserved)", () => {
    const spec = baseSpec({ type: "schedule", cron: "0 9 * * *" });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0);
  });

  test("type='message' NO LONGER rejected after C2", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "OK" },
    });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });

  test("unknown trigger type still rejected", () => {
    const spec = baseSpec({ type: "webhook", url: "x" });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });
});

// ---------------------------------------------------------------------
// 8. Message triggers don't cross-ref event-registry (standalone like schedule)
// ---------------------------------------------------------------------

describe("MessageTriggerSchema — no event-registry cross-ref", () => {
  test("message trigger does not require a matching event in the registry", () => {
    const spec = baseSpec({
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "x" },
    });
    const result = validateAgentSpec(spec, testBlockRegistry, testEventRegistry);
    const eventRefIssues = result.filter(
      (i) => i.code === "unknown_event" || i.path === "trigger.event",
    );
    assert.equal(eventRefIssues.length, 0);
  });
});
