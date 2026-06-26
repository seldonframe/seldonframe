// Agent Loop — L4 Generate-by-Default — Task T2: the classifier seam tests.
//
// parse-intent.ts turns an operator's English sentence into a COMPLETE
// AgentIntent. These tests pin two things:
//
//   • heuristicIntent — pure keyword classification, in priority order
//     (review → lead → receptionist → default inbound chat), the sms|email
//     channel hint, URL extraction (trailing punctuation stripped), and that it
//     NEVER throws on gibberish;
//   • parseAgentIntent — the DI seam: with an injected fake `classify` the LLM
//     wins on the fields it returns while the heuristic's hints survive, and a
//     `classify` that throws degrades to the heuristic with no throw.
//
// NO network: the only I/O path (`classify`) is a plain in-memory fake.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  heuristicIntent,
  parseAgentIntent,
  type AgentIntent,
} from "../../../../src/lib/agents/generate/parse-intent";

// ─── heuristicIntent — review-requester ──────────────────────────────────────

describe("heuristicIntent — review-requester", () => {
  test("'ask my customers for a google review after the job' → review-requester + booking.completed + sms", () => {
    const i = heuristicIntent("ask my customers for a google review after the job");
    assert.equal(i.skill, "review-requester");
    assert.deepEqual(i.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    });
  });

  test("the original sentence is preserved as promptHint", () => {
    const s = "ask my customers for a google review after the job";
    assert.equal(heuristicIntent(s).promptHint, s);
  });
});

// ─── heuristicIntent — speed-to-lead ─────────────────────────────────────────

describe("heuristicIntent — speed-to-lead", () => {
  test("'instantly text new leads that come in' → speed-to-lead + lead.created + sms", () => {
    const i = heuristicIntent("instantly text new leads that come in");
    assert.equal(i.skill, "speed-to-lead");
    assert.deepEqual(i.trigger, {
      kind: "event",
      event: "lead.created",
      channel: "sms",
    });
  });

  test("'email new leads' → speed-to-lead + channel email", () => {
    const i = heuristicIntent("email new leads");
    assert.equal(i.skill, "speed-to-lead");
    assert.equal(i.trigger.kind, "event");
    assert.equal((i.trigger as { channel: string }).channel, "email");
  });

  test("a 'missed call' sentence is a lead (not the receptionist 'call' rule)", () => {
    // priority order: the lead rule (missed call) outranks the receptionist
    // /call/ rule, so this stays speed-to-lead.
    const i = heuristicIntent("follow up on every missed call right away");
    assert.equal(i.skill, "speed-to-lead");
    assert.equal((i.trigger as { event: string }).event, "lead.created");
  });
});

// ─── heuristicIntent — receptionist ──────────────────────────────────────────

describe("heuristicIntent — receptionist", () => {
  test("'answer my phone when I miss a call' → receptionist + inbound + voice", () => {
    const i = heuristicIntent("answer my phone when I miss a call");
    assert.equal(i.skill, "receptionist");
    assert.deepEqual(i.trigger, { kind: "inbound", channel: "voice" });
  });

  test("gibberish → receptionist inbound chat default, never throws", () => {
    let i: AgentIntent | undefined;
    assert.doesNotThrow(() => {
      i = heuristicIntent("qwzx flarn blorptastic 12345");
    });
    assert.ok(i, "expected an intent");
    assert.equal(i.skill, "receptionist");
    assert.deepEqual(i.trigger, { kind: "inbound", channel: "chat" });
  });

  test("empty / non-string input never throws and yields the inbound-chat default", () => {
    assert.doesNotThrow(() => heuristicIntent(""));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.doesNotThrow(() => heuristicIntent(undefined as any));
    const i = heuristicIntent("");
    assert.deepEqual(i.trigger, { kind: "inbound", channel: "chat" });
  });
});

// ─── heuristicIntent — URL extraction ────────────────────────────────────────

describe("heuristicIntent — businessHints.reviewUrl", () => {
  test("a sentence containing a review URL captures it with no trailing punctuation", () => {
    const i = heuristicIntent(
      "ask for a review and link them to https://g.page/r/abc/review.",
    );
    assert.equal(i.businessHints?.reviewUrl, "https://g.page/r/abc/review");
  });

  test("no URL → no businessHints", () => {
    const i = heuristicIntent("ask my customers for a review after the job");
    assert.equal(i.businessHints, undefined);
  });
});

// ─── parseAgentIntent — no classify ──────────────────────────────────────────

describe("parseAgentIntent — without a classifier", () => {
  test("returns the pure heuristic result", async () => {
    const i = await parseAgentIntent("instantly text new leads");
    assert.equal(i.skill, "speed-to-lead");
    assert.deepEqual(i.trigger, {
      kind: "event",
      event: "lead.created",
      channel: "sms",
    });
  });
});

// ─── parseAgentIntent — injected classify wins (fields it returns) ───────────

describe("parseAgentIntent — classify override (DI fake, no network)", () => {
  test("the LLM result wins on skill/trigger; heuristic's reviewUrl + promptHint survive", async () => {
    // A review-ish sentence (so the heuristic alone would say review-requester),
    // but the "LLM" reclassifies it as speed-to-lead via email. The merged
    // intent must take the LLM's skill + trigger, yet keep the heuristic's
    // captured reviewUrl and the original-sentence promptHint.
    const sentence =
      "review the new lead and reply, link is https://g.page/r/abc/review";
    const classify = async (): Promise<Partial<AgentIntent>> => ({
      skill: "speed-to-lead",
      trigger: { kind: "event", event: "lead.created", channel: "email" },
    });

    const i = await parseAgentIntent(sentence, { classify });

    // LLM wins:
    assert.equal(i.skill, "speed-to-lead");
    assert.deepEqual(i.trigger, {
      kind: "event",
      event: "lead.created",
      channel: "email",
    });
    // heuristic fills the gaps:
    assert.equal(i.businessHints?.reviewUrl, "https://g.page/r/abc/review");
    assert.equal(i.promptHint, sentence);
  });

  test("a malformed LLM trigger is clamped (never produces an illegal trigger)", async () => {
    const classify = async (): Promise<Partial<AgentIntent>> => ({
      // event + voice is illegal for an event trigger → resolveAgentTrigger
      // falls back to the safe inbound default rather than emitting garbage.
      trigger: { kind: "event", event: "lead.created", channel: "voice" } as never,
    });
    const i = await parseAgentIntent("instantly text new leads", { classify });
    assert.deepEqual(i.trigger, { kind: "inbound", channel: "voice" });
    // skill still comes from the heuristic (LLM didn't override it).
    assert.equal(i.skill, "speed-to-lead");
  });

  test("the LLM can override name/description while the trigger stays the heuristic's", async () => {
    const classify = async (): Promise<Partial<AgentIntent>> => ({
      name: "Concierge",
      description: "Hand-tuned pitch",
    });
    const i = await parseAgentIntent("answer my phone", { classify });
    assert.equal(i.name, "Concierge");
    assert.equal(i.description, "Hand-tuned pitch");
    assert.deepEqual(i.trigger, { kind: "inbound", channel: "voice" });
  });
});

// ─── parseAgentIntent — classify throws → heuristic, no throw ─────────────────

describe("parseAgentIntent — classify failure is fail-soft", () => {
  test("a classify that throws yields the heuristic result and never throws", async () => {
    const classify = async (): Promise<Partial<AgentIntent>> => {
      throw new Error("LLM exploded");
    };
    let i: AgentIntent | undefined;
    await assert.doesNotReject(async () => {
      i = await parseAgentIntent("ask my customers for a google review", {
        classify,
      });
    });
    assert.ok(i, "expected the heuristic fallback intent");
    assert.equal(i.skill, "review-requester");
    assert.deepEqual(i.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    });
  });
});
