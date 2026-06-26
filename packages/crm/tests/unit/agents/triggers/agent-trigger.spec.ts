// Unified Agent Model — P1, Task T1.
//
// The Trigger model is PURE (no I/O): an agent generalizes from `surface:
// voice|chat` to Trigger × Channel. `surface` becomes ONE point in that space
// (kind:"inbound"). These tests pin the back-compat + the validation/clamp
// rules so a malformed stored trigger NEVER crashes the builder — it falls back
// to the safe inbound default (today's behavior, byte-for-byte).
//
// Pinned rules (see agent-trigger.ts):
//   • kind ∈ {inbound, event, schedule}; anything else → inbound fallback.
//   • channel must be valid FOR the kind:
//       inbound  → voice | chat | email | sms
//       event    → sms | email
//       schedule → email | digest
//     an invalid channel-for-kind → inbound fallback (NOT repaired).
//   • event needs a non-empty `event`; schedule needs a non-empty `cron`;
//     blank/whitespace → inbound fallback.
//   • resolveAgentTrigger never throws.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  triggerFromSurface,
  resolveAgentTrigger,
  resolveSendDelayMinutes,
  triggerLabel,
  KNOWN_EVENTS,
  type AgentTrigger,
} from "../../../../src/lib/agents/triggers/agent-trigger";

describe("triggerFromSurface", () => {
  test("maps a known surface to inbound + that channel", () => {
    assert.deepEqual(triggerFromSurface("voice"), {
      kind: "inbound",
      channel: "voice",
    });
    assert.deepEqual(triggerFromSurface("chat"), {
      kind: "inbound",
      channel: "chat",
    });
    assert.deepEqual(triggerFromSurface("email"), {
      kind: "inbound",
      channel: "email",
    });
    assert.deepEqual(triggerFromSurface("sms"), {
      kind: "inbound",
      channel: "sms",
    });
  });

  test("unknown / empty / null surface → inbound voice default", () => {
    assert.deepEqual(triggerFromSurface("something-else"), {
      kind: "inbound",
      channel: "voice",
    });
    assert.deepEqual(triggerFromSurface(""), {
      kind: "inbound",
      channel: "voice",
    });
    assert.deepEqual(triggerFromSurface(null), {
      kind: "inbound",
      channel: "voice",
    });
    assert.deepEqual(triggerFromSurface(undefined), {
      kind: "inbound",
      channel: "voice",
    });
  });

  test("is case/whitespace tolerant for the surface string", () => {
    assert.deepEqual(triggerFromSurface(" Voice "), {
      kind: "inbound",
      channel: "voice",
    });
  });
});

describe("resolveAgentTrigger — falls back to surface when stored is absent", () => {
  test("null stored + chat surface → inbound chat", () => {
    assert.deepEqual(resolveAgentTrigger(null, "chat"), {
      kind: "inbound",
      channel: "chat",
    });
  });

  test("undefined stored + no surface → inbound voice default", () => {
    assert.deepEqual(resolveAgentTrigger(undefined), {
      kind: "inbound",
      channel: "voice",
    });
  });

  test("empty-object stored + sms surface → inbound sms (from surface)", () => {
    assert.deepEqual(resolveAgentTrigger({}, "sms"), {
      kind: "inbound",
      channel: "sms",
    });
  });
});

describe("resolveAgentTrigger — returns a well-formed trigger verbatim", () => {
  test("a valid event trigger resolves verbatim", () => {
    const stored: AgentTrigger = {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    };
    assert.deepEqual(resolveAgentTrigger(stored), stored);
  });

  test("a valid inbound trigger resolves verbatim (stored wins over surface)", () => {
    const stored: AgentTrigger = { kind: "inbound", channel: "email" };
    // surface says voice, but a well-formed stored trigger takes precedence.
    assert.deepEqual(resolveAgentTrigger(stored, "voice"), stored);
  });

  test("a valid schedule trigger resolves verbatim", () => {
    const stored: AgentTrigger = {
      kind: "schedule",
      cron: "0 8 * * 1",
      channel: "email",
    };
    assert.deepEqual(resolveAgentTrigger(stored), stored);
  });

  test("normalizes case on a well-formed trigger", () => {
    assert.deepEqual(
      resolveAgentTrigger({ kind: "event", event: "lead.created", channel: "EMAIL" as "email" }),
      { kind: "event", event: "lead.created", channel: "email" },
    );
  });
});

describe("resolveAgentTrigger — clamps malformed shapes to the inbound default", () => {
  test("invalid channel-for-kind (event with voice) → inbound fallback", () => {
    // voice is not a valid event channel → fall back to surface (voice).
    assert.deepEqual(
      resolveAgentTrigger(
        { kind: "event", event: "booking.completed", channel: "voice" as unknown as "sms" },
        "voice",
      ),
      { kind: "inbound", channel: "voice" },
    );
  });

  test("blank event string → inbound fallback", () => {
    assert.deepEqual(
      resolveAgentTrigger({ kind: "event", event: "", channel: "sms" }),
      { kind: "inbound", channel: "voice" },
    );
  });

  test("whitespace-only event string → inbound fallback", () => {
    assert.deepEqual(
      resolveAgentTrigger({ kind: "event", event: "   ", channel: "sms" }, "chat"),
      { kind: "inbound", channel: "chat" },
    );
  });

  test("schedule with blank cron → inbound fallback", () => {
    assert.deepEqual(
      resolveAgentTrigger({ kind: "schedule", cron: "", channel: "email" }, "email"),
      { kind: "inbound", channel: "email" },
    );
  });

  test("unknown kind → inbound fallback", () => {
    assert.deepEqual(
      resolveAgentTrigger({ kind: "webhook" as unknown as "event" }, "sms"),
      { kind: "inbound", channel: "sms" },
    );
  });

  test("inbound with an invalid channel → inbound fallback (default voice)", () => {
    assert.deepEqual(
      resolveAgentTrigger({ kind: "inbound", channel: "carrier-pigeon" as unknown as "voice" }),
      { kind: "inbound", channel: "voice" },
    );
  });

  test("schedule with a schedule-invalid channel (sms) → inbound fallback", () => {
    assert.deepEqual(
      resolveAgentTrigger({ kind: "schedule", cron: "0 8 * * 1", channel: "sms" as unknown as "email" }),
      { kind: "inbound", channel: "voice" },
    );
  });

  test("never throws on garbage input", () => {
    assert.doesNotThrow(() =>
      resolveAgentTrigger("nope" as unknown as Partial<AgentTrigger>),
    );
    assert.doesNotThrow(() =>
      resolveAgentTrigger(123 as unknown as Partial<AgentTrigger>),
    );
    assert.deepEqual(
      resolveAgentTrigger("nope" as unknown as Partial<AgentTrigger>, "chat"),
      { kind: "inbound", channel: "chat" },
    );
  });
});

describe("triggerLabel", () => {
  test("inbound → 'Inbound · <Channel>' (title-cased channel)", () => {
    assert.equal(triggerLabel({ kind: "inbound", channel: "voice" }), "Inbound · Voice");
    assert.equal(triggerLabel({ kind: "inbound", channel: "chat" }), "Inbound · Chat");
  });

  test("known event → friendly text · CHANNEL", () => {
    assert.equal(
      triggerLabel({ kind: "event", event: "booking.completed", channel: "sms" }),
      "After booking · SMS",
    );
    assert.equal(
      triggerLabel({ kind: "event", event: "lead.created", channel: "email" }),
      "New lead · EMAIL",
    );
  });

  test("unknown event → prettified slug · CHANNEL", () => {
    assert.equal(
      triggerLabel({ kind: "event", event: "deal.won", channel: "sms" }),
      "Deal won · SMS",
    );
  });

  test("schedule → 'Scheduled · <CHANNEL>' (with cadence hint for common crons)", () => {
    // weekly Monday 8am — a cadence hint is allowed but must include the channel.
    const weekly = triggerLabel({ kind: "schedule", cron: "0 8 * * 1", channel: "email" });
    assert.ok(/EMAIL/.test(weekly), `expected channel in "${weekly}"`);
    assert.ok(/Weekly|Scheduled/.test(weekly), `expected cadence/Scheduled in "${weekly}"`);

    // an opaque cron still labels cleanly.
    const opaque = triggerLabel({ kind: "schedule", cron: "*/13 7 3 * *", channel: "digest" });
    assert.ok(/DIGEST/.test(opaque), `expected channel in "${opaque}"`);
    assert.ok(/Scheduled/.test(opaque), `expected "Scheduled" in "${opaque}"`);
  });
});

describe("KNOWN_EVENTS", () => {
  const values = KNOWN_EVENTS.map((e) => e.value);

  test("contains booking.completed and lead.created", () => {
    assert.ok(values.includes("booking.completed"), `got [${values.join(", ")}]`);
    assert.ok(values.includes("lead.created"), `got [${values.join(", ")}]`);
  });

  test("contains invoice.paid and missed_call", () => {
    assert.ok(values.includes("invoice.paid"), `got [${values.join(", ")}]`);
    assert.ok(values.includes("missed_call"), `got [${values.join(", ")}]`);
  });

  test("every entry has a non-empty value + label", () => {
    for (const e of KNOWN_EVENTS) {
      assert.ok(typeof e.value === "string" && e.value.length > 0);
      assert.ok(typeof e.label === "string" && e.label.length > 0);
    }
  });
});

// ─── F2: send delay (delayMinutes on the event trigger) ───────────────────────
//
// An event trigger may carry an optional `delayMinutes` to DEFER its outbound
// send (e.g. 1440 = "send the review ask 24h after the job"). Pinned rules:
//   • a valid positive integer is carried verbatim on a resolved event trigger;
//   • a malformed / negative / NaN / non-number delay is OMITTED (= immediate),
//     and NEVER corrupts the otherwise-valid event trigger;
//   • a delay past the 7-day cap (10080 min) is clamped DOWN to it;
//   • resolveSendDelayMinutes reads a clamped delay off any trigger (0 for
//     non-event / missing), and never throws.

describe("resolveAgentTrigger — F2 delayMinutes on event triggers", () => {
  test("a valid positive delayMinutes is carried verbatim", () => {
    assert.deepEqual(
      resolveAgentTrigger({ kind: "event", event: "booking.completed", channel: "sms", delayMinutes: 1440 }),
      { kind: "event", event: "booking.completed", channel: "sms", delayMinutes: 1440 },
    );
  });

  test("delayMinutes 0 is omitted (immediate) — a clean event trigger with no delay key", () => {
    const resolved = resolveAgentTrigger({
      kind: "event",
      event: "booking.completed",
      channel: "sms",
      delayMinutes: 0,
    });
    assert.deepEqual(resolved, { kind: "event", event: "booking.completed", channel: "sms" });
    assert.ok(!("delayMinutes" in resolved), "a 0 delay is not stored");
  });

  test("a negative delayMinutes is omitted (treated as immediate), trigger still valid", () => {
    const resolved = resolveAgentTrigger({
      kind: "event",
      event: "lead.created",
      channel: "email",
      delayMinutes: -60,
    });
    assert.deepEqual(resolved, { kind: "event", event: "lead.created", channel: "email" });
  });

  test("a NaN / non-number delayMinutes is omitted, trigger still valid (never corrupts it)", () => {
    assert.deepEqual(
      resolveAgentTrigger({ kind: "event", event: "booking.completed", channel: "sms", delayMinutes: Number.NaN }),
      { kind: "event", event: "booking.completed", channel: "sms" },
    );
    assert.deepEqual(
      resolveAgentTrigger({
        kind: "event",
        event: "booking.completed",
        channel: "sms",
        delayMinutes: "1440" as unknown as number,
      }),
      { kind: "event", event: "booking.completed", channel: "sms" },
    );
  });

  test("a fractional delayMinutes is floored", () => {
    assert.deepEqual(
      resolveAgentTrigger({ kind: "event", event: "booking.completed", channel: "sms", delayMinutes: 90.7 }),
      { kind: "event", event: "booking.completed", channel: "sms", delayMinutes: 90 },
    );
  });

  test("a delayMinutes past the 7-day cap is clamped down to 10080", () => {
    assert.deepEqual(
      resolveAgentTrigger({ kind: "event", event: "booking.completed", channel: "sms", delayMinutes: 999999 }),
      { kind: "event", event: "booking.completed", channel: "sms", delayMinutes: 10080 },
    );
  });

  test("delayMinutes is ignored on a malformed event trigger (clamps to inbound, no delay leak)", () => {
    // A blank event with a delay still falls back to inbound — the delay never
    // resurrects an invalid trigger.
    assert.deepEqual(
      resolveAgentTrigger({ kind: "event", event: "", channel: "sms", delayMinutes: 1440 }, "voice"),
      { kind: "inbound", channel: "voice" },
    );
  });
});

describe("resolveSendDelayMinutes", () => {
  test("reads a positive delay off a resolved event trigger", () => {
    assert.equal(
      resolveSendDelayMinutes({ kind: "event", event: "booking.completed", channel: "sms", delayMinutes: 240 }),
      240,
    );
  });

  test("event trigger with no delay → 0", () => {
    assert.equal(
      resolveSendDelayMinutes({ kind: "event", event: "booking.completed", channel: "sms" }),
      0,
    );
  });

  test("non-event triggers → 0 (inbound / schedule never delay)", () => {
    assert.equal(resolveSendDelayMinutes({ kind: "inbound", channel: "voice" }), 0);
    assert.equal(
      resolveSendDelayMinutes({ kind: "schedule", cron: "0 8 * * 1", channel: "email" }),
      0,
    );
  });

  test("clamps a negative / NaN / fractional / over-cap delay defensively", () => {
    assert.equal(
      resolveSendDelayMinutes({ kind: "event", event: "x", channel: "sms", delayMinutes: -5 }),
      0,
    );
    assert.equal(
      resolveSendDelayMinutes({
        kind: "event",
        event: "x",
        channel: "sms",
        delayMinutes: Number.NaN,
      }),
      0,
    );
    assert.equal(
      resolveSendDelayMinutes({ kind: "event", event: "x", channel: "sms", delayMinutes: 90.9 }),
      90,
    );
    assert.equal(
      resolveSendDelayMinutes({ kind: "event", event: "x", channel: "sms", delayMinutes: 1e9 }),
      10080,
    );
  });

  test("null / undefined / garbage → 0, never throws", () => {
    assert.equal(resolveSendDelayMinutes(null), 0);
    assert.equal(resolveSendDelayMinutes(undefined), 0);
    assert.doesNotThrow(() =>
      resolveSendDelayMinutes("nope" as unknown as Partial<AgentTrigger>),
    );
    assert.equal(resolveSendDelayMinutes("nope" as unknown as Partial<AgentTrigger>), 0);
  });
});
