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
