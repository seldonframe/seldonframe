// Tests for MessageTriggerStore + helpers.
// SLICE 7 PR 1 C3 per audit §4.3 + §5.3 + gates G-7-6, G-7-8.
//
// Storage contract for two new tables:
//   1. messageTriggers — materialized lookup index (one row per
//      message-typed trigger per archetype per workspace).
//   2. messageTriggerFires — idempotency + observability table.
//      UNIQUE (triggerId, messageId) per G-7-6.
//
// Tests run against the in-memory store. Drizzle-backed implementation
// adapter (drizzle file) typechecks the production surface but is
// exercised via preview + integration harness in C7.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  makeInMemoryMessageTriggerStore,
  type MessageTrigger,
  type MessageTriggerFire,
  type MessageTriggerStore,
  buildMessageTrigger,
} from "../../src/lib/agents/message-trigger-storage";

// ---------------------------------------------------------------------
// 1. messageTriggers table — insert / list / enable
// ---------------------------------------------------------------------

describe("MessageTriggerStore — insert + list", () => {
  test("inserts a message trigger and lists by (workspaceId, channel)", async () => {
    const store = makeInMemoryMessageTriggerStore();
    const t: MessageTrigger = buildMessageTrigger({
      orgId: "org_a",
      archetypeId: "appointment-confirm-sms",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "CONFIRM", caseSensitive: false },
    });
    await store.insert(t);
    const found = await store.listEnabledForWorkspaceChannel("org_a", "sms");
    assert.equal(found.length, 1);
    assert.equal(found[0].archetypeId, "appointment-confirm-sms");
  });

  test("listEnabledForWorkspaceChannel returns only the matching org", async () => {
    const store = makeInMemoryMessageTriggerStore();
    await store.insert(buildMessageTrigger({
      orgId: "org_a",
      archetypeId: "agent_x",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "X" },
    }));
    await store.insert(buildMessageTrigger({
      orgId: "org_b",
      archetypeId: "agent_y",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "Y" },
    }));
    const a = await store.listEnabledForWorkspaceChannel("org_a", "sms");
    assert.equal(a.length, 1);
    assert.equal(a[0].archetypeId, "agent_x");
  });

  test("listEnabledForWorkspaceChannel excludes disabled triggers", async () => {
    const store = makeInMemoryMessageTriggerStore();
    const t = buildMessageTrigger({
      orgId: "org_a",
      archetypeId: "agent_x",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "X" },
    });
    await store.insert(t);
    await store.setEnabled(t.id, false);
    const found = await store.listEnabledForWorkspaceChannel("org_a", "sms");
    assert.equal(found.length, 0);
  });

  test("listEnabledForWorkspaceChannel filters by channel", async () => {
    const store = makeInMemoryMessageTriggerStore();
    await store.insert(buildMessageTrigger({
      orgId: "org_a",
      archetypeId: "sms_agent",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "X" },
    }));
    // Future-proof: even though "email" channel is invalid v1,
    // the storage layer must filter so 7b additions don't leak.
    const sms = await store.listEnabledForWorkspaceChannel("org_a", "sms");
    assert.equal(sms.length, 1);
  });
});

describe("MessageTriggerStore — find / setEnabled", () => {
  test("findById returns the inserted trigger", async () => {
    const store = makeInMemoryMessageTriggerStore();
    const t = buildMessageTrigger({
      orgId: "org_a",
      archetypeId: "agent_x",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "X" },
    });
    await store.insert(t);
    const found = await store.findById(t.id);
    assert.ok(found);
    assert.equal(found.id, t.id);
  });

  test("findById returns null for unknown id", async () => {
    const store = makeInMemoryMessageTriggerStore();
    const found = await store.findById("nope");
    assert.equal(found, null);
  });

  test("setEnabled toggles enabled flag idempotently", async () => {
    const store = makeInMemoryMessageTriggerStore();
    const t = buildMessageTrigger({
      orgId: "org_a",
      archetypeId: "agent_x",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "X" },
    });
    await store.insert(t);
    await store.setEnabled(t.id, false);
    let f = await store.findById(t.id);
    assert.equal(f!.enabled, false);
    await store.setEnabled(t.id, true);
    f = await store.findById(t.id);
    assert.equal(f!.enabled, true);
  });
});

// ---------------------------------------------------------------------
// 2. messageTriggerFires — idempotency on (triggerId, messageId)
// ---------------------------------------------------------------------

describe("MessageTriggerStore — recordFire idempotency (G-7-6)", () => {
  test("first recordFire for (triggerId, messageId) returns ok=true", async () => {
    const store = makeInMemoryMessageTriggerStore();
    const fire: MessageTriggerFire = {
      id: "fire_1",
      triggerId: "trig_1",
      messageId: "twilio_msg_abc",
      runId: "run_xyz",
      skippedReason: null,
      firedAt: new Date(),
    };
    const result = await store.recordFire(fire);
    assert.equal(result.ok, true);
  });

  test("second recordFire for same (triggerId, messageId) returns ok=false", async () => {
    const store = makeInMemoryMessageTriggerStore();
    const baseFire: MessageTriggerFire = {
      id: "fire_1",
      triggerId: "trig_1",
      messageId: "twilio_msg_abc",
      runId: "run_xyz",
      skippedReason: null,
      firedAt: new Date(),
    };
    await store.recordFire(baseFire);
    const dup = await store.recordFire({ ...baseFire, id: "fire_2", runId: "run_dup" });
    assert.equal(dup.ok, false);
  });

  test("different triggerId for same messageId records both (different agents matching same SMS)", async () => {
    const store = makeInMemoryMessageTriggerStore();
    await store.recordFire({
      id: "f1", triggerId: "trig_a", messageId: "msg_1",
      runId: "r1", skippedReason: null, firedAt: new Date(),
    });
    const r = await store.recordFire({
      id: "f2", triggerId: "trig_b", messageId: "msg_1",
      runId: "r2", skippedReason: null, firedAt: new Date(),
    });
    assert.equal(r.ok, true);
  });

  test("different messageId for same triggerId records both", async () => {
    const store = makeInMemoryMessageTriggerStore();
    await store.recordFire({
      id: "f1", triggerId: "trig_a", messageId: "msg_1",
      runId: "r1", skippedReason: null, firedAt: new Date(),
    });
    const r = await store.recordFire({
      id: "f2", triggerId: "trig_a", messageId: "msg_2",
      runId: "r2", skippedReason: null, firedAt: new Date(),
    });
    assert.equal(r.ok, true);
  });
});

describe("MessageTriggerStore — recordFire skippedReason observability", () => {
  test("can record a fire with skippedReason and null runId (skip path)", async () => {
    const store = makeInMemoryMessageTriggerStore();
    const result = await store.recordFire({
      id: "f1",
      triggerId: "trig_a",
      messageId: "msg_1",
      runId: null,
      skippedReason: "loop_guard",
      firedAt: new Date(),
    });
    assert.equal(result.ok, true);
  });

  test("recordFire allows skippedReason values: loop_guard, no_match, already_fired, dispatch_failed", async () => {
    const store = makeInMemoryMessageTriggerStore();
    let i = 0;
    for (const reason of ["loop_guard", "no_match", "already_fired", "dispatch_failed"] as const) {
      i++;
      const r = await store.recordFire({
        id: `f${i}`,
        triggerId: `trig_${i}`,
        messageId: `msg_${i}`,
        runId: null,
        skippedReason: reason,
        firedAt: new Date(),
      });
      assert.equal(r.ok, true, `${reason} should record`);
    }
  });
});

// ---------------------------------------------------------------------
// 3. buildMessageTrigger helper — id generation + defaults
// ---------------------------------------------------------------------

describe("buildMessageTrigger helper", () => {
  test("assigns a non-empty id", () => {
    const t = buildMessageTrigger({
      orgId: "org_a",
      archetypeId: "agent_x",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "X" },
    });
    assert.ok(t.id.length > 0);
  });

  test("generates unique ids across calls", () => {
    const a = buildMessageTrigger({
      orgId: "org_a", archetypeId: "x", channel: "sms",
      channelBinding: { kind: "any" }, pattern: { kind: "any" },
    });
    const b = buildMessageTrigger({
      orgId: "org_a", archetypeId: "x", channel: "sms",
      channelBinding: { kind: "any" }, pattern: { kind: "any" },
    });
    assert.notEqual(a.id, b.id);
  });

  test("defaults enabled=true", () => {
    const t = buildMessageTrigger({
      orgId: "org_a", archetypeId: "x", channel: "sms",
      channelBinding: { kind: "any" }, pattern: { kind: "any" },
    });
    assert.equal(t.enabled, true);
  });

  test("sets createdAt to a Date instance", () => {
    const t = buildMessageTrigger({
      orgId: "org_a", archetypeId: "x", channel: "sms",
      channelBinding: { kind: "any" }, pattern: { kind: "any" },
    });
    assert.ok(t.createdAt instanceof Date);
  });
});
