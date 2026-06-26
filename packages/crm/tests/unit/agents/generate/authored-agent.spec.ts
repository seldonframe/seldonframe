// Primitive-Composition Agent Generator — P1, Task 1: the AuthoredAgent seam.
//
// authored-agent.ts is the PURE seam the new "compose-from-primitives" generator
// is built on. Instead of cloning a template, an LLM AUTHOR writes the agent's
// playbook (skillMd) and DECLARES its primitives (trigger / channel / tools).
// This module owns:
//   • the AuthoredAgent / AuthoredTrigger / AgentAuthor types;
//   • normalizeAuthoredAgent(raw) — the DEFENSIVE normalizer that turns the
//     author's raw JSON into a valid AuthoredAgent or null (the playbook is the
//     whole point: no non-empty skillMd → null);
//   • authorAgentDraft(sentence, deps) — the fail-soft DI seam: no author → null;
//     author throws/returns garbage → null. The caller then falls back to the
//     existing heuristic path, so generation never blocks.
//
// These tests pin the contract. NO network / clock / env: the only I/O path
// (`deps.author`) is a plain in-memory fake.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  authorAgentDraft,
  normalizeAuthoredAgent,
  type AgentAuthor,
} from "../../../../src/lib/agents/generate/authored-agent";
import {
  resolveAgentTrigger,
  type AgentTrigger,
} from "../../../../src/lib/agents/triggers/agent-trigger";

// ─── authorAgentDraft — the DI seam ──────────────────────────────────────────

describe("authorAgentDraft — happy path", () => {
  test("a valid author dep result is normalized + returned (name/channel/tools intact)", async () => {
    const author: AgentAuthor = async () => ({
      name: "Weekly IG",
      summary: "posts weekly",
      skillMd: "Each Monday, post our best 5-star review to Instagram.",
      // schedule triggers need a kind-valid channel (email|digest) to survive
      // resolveAgentTrigger — a channel-less schedule clamps to inbound (pinned
      // separately below). The agent's OUTBOUND axis is the top-level `channel`.
      trigger: { kind: "schedule", cron: "0 9 * * 1", channel: "digest" },
      channel: "none",
      tools: ["postiz"],
    });

    const draft = await authorAgentDraft("post weekly to instagram", { author });

    assert.ok(draft);
    assert.equal(draft!.name, "Weekly IG");
    assert.equal(draft!.summary, "posts weekly");
    assert.equal(draft!.channel, "none");
    assert.deepEqual(draft!.tools, ["postiz"]);
    // trigger is normalized through resolveAgentTrigger → a valid schedule.
    assert.equal(draft!.trigger.kind, "schedule");
    assert.match(draft!.skillMd, /Each Monday/);
  });

  test("a channel-less schedule trigger now PRESERVES its schedule kind (coerced channel+cron before resolve); top-level channel stays 'none'", async () => {
    // The author emits {kind:schedule, cron} with NO trigger-channel. We fill a
    // kind-appropriate channel (digest) before resolveAgentTrigger so the schedule
    // intent survives instead of clamping to the inbound voice default. The agent
    // is still action-only on the OUTBOUND axis (channel "none").
    const draft = await authorAgentDraft("post weekly to instagram", {
      author: async () => ({
        name: "Weekly IG",
        skillMd: "Each Monday, post our best 5-star review to Instagram.",
        trigger: { kind: "schedule", cron: "0 9 * * 1" },
        channel: "none",
        tools: ["postiz"],
      }),
    });
    assert.ok(draft);
    assert.equal(draft!.trigger.kind, "schedule");
    assert.equal(draft!.channel, "none");
  });

  test("a cron-less schedule still preserves schedule (default weekly cron filled)", () => {
    const a = normalizeAuthoredAgent({
      skillMd: "Send a weekly recap.",
      trigger: { kind: "schedule" },
      channel: "none",
    });
    assert.ok(a);
    assert.equal(a!.trigger.kind, "schedule");
  });

  test("a channel-less event trigger (with an event) preserves its event kind", () => {
    const a = normalizeAuthoredAgent({
      skillMd: "Text new leads fast.",
      trigger: { kind: "event", event: "lead.created" },
      channel: "sms",
    });
    assert.ok(a);
    assert.equal(a!.trigger.kind, "event");
  });

  test("the author is called with the sentence + priorLessons", async () => {
    let sawSentence: string | undefined;
    let sawLessons: string | undefined;
    const author: AgentAuthor = async (sentence, priorLessons) => {
      sawSentence = sentence;
      sawLessons = priorLessons;
      return {
        skillMd: "Reply to every new lead within five minutes.",
        trigger: { kind: "event", event: "lead.created", channel: "sms" },
        channel: "sms",
      };
    };

    await authorAgentDraft("reply to new leads fast", {
      author,
      priorLessons: "Always read the price range back.",
    });

    assert.equal(sawSentence, "reply to new leads fast");
    assert.equal(sawLessons, "Always read the price range back.");
  });
});

describe("authorAgentDraft — fail-soft → null", () => {
  test("no author dep → null (caller falls back to heuristic)", async () => {
    assert.equal(await authorAgentDraft("x", {}), null);
  });

  test("author throws → null", async () => {
    assert.equal(
      await authorAgentDraft("x", {
        author: async () => {
          throw new Error("model down");
        },
      }),
      null,
    );
  });

  test("author returns {} (missing skillMd) → null", async () => {
    assert.equal(await authorAgentDraft("x", { author: async () => ({}) }), null);
  });

  test("author returns null → null", async () => {
    assert.equal(await authorAgentDraft("x", { author: async () => null }), null);
  });

  test("author returns a non-object (string) → null", async () => {
    assert.equal(
      await authorAgentDraft("x", { author: async () => "not an object" }),
      null,
    );
  });

  test("author returns an object with a blank skillMd → null", async () => {
    assert.equal(
      await authorAgentDraft("x", {
        author: async () => ({ name: "X", skillMd: "   \n  " }),
      }),
      null,
    );
  });
});

// ─── normalizeAuthoredAgent — the defensive normalizer ───────────────────────

describe("normalizeAuthoredAgent — rejects (→ null)", () => {
  test("null / undefined / non-object → null", () => {
    assert.equal(normalizeAuthoredAgent(null), null);
    assert.equal(normalizeAuthoredAgent(undefined), null);
    assert.equal(normalizeAuthoredAgent(42), null);
    assert.equal(normalizeAuthoredAgent("hello"), null);
    assert.equal(normalizeAuthoredAgent([]), null);
  });

  test("missing skillMd → null", () => {
    assert.equal(normalizeAuthoredAgent({ name: "X", channel: "sms" }), null);
  });

  test("skillMd that is not a string → null", () => {
    assert.equal(normalizeAuthoredAgent({ skillMd: 123 }), null);
  });

  test("skillMd whitespace-only → null", () => {
    assert.equal(normalizeAuthoredAgent({ skillMd: "   \t\n  " }), null);
  });
});

describe("normalizeAuthoredAgent — clamps + normalizes", () => {
  test("unknown tool ids dropped + deduped; known catalog ids kept", () => {
    const a = normalizeAuthoredAgent({
      skillMd: "do it",
      tools: ["postiz", "made_up", "postiz", "notion", "definitely_not_a_tool"],
    });
    assert.ok(a);
    assert.deepEqual(a!.tools, ["postiz", "notion"]);
  });

  test("absent / non-array tools → []", () => {
    assert.deepEqual(normalizeAuthoredAgent({ skillMd: "x" })!.tools, []);
    assert.deepEqual(
      normalizeAuthoredAgent({ skillMd: "x", tools: "postiz" })!.tools,
      [],
    );
  });

  test("a bad/missing trigger shape → a valid resolveAgentTrigger result", () => {
    const a = normalizeAuthoredAgent({ skillMd: "x", trigger: { kind: "nonsense" } });
    assert.ok(a);
    assert.ok(["inbound", "event", "schedule"].includes(a!.trigger.kind));
    // matches the resolver's clamp for a bad shape (the inbound voice default).
    assert.deepEqual(a!.trigger, resolveAgentTrigger({ kind: "nonsense" } as never));
  });

  test("a well-formed event trigger is preserved through the resolver", () => {
    const a = normalizeAuthoredAgent({
      skillMd: "x",
      trigger: { kind: "event", event: "booking.completed", channel: "sms" },
      channel: "sms",
    });
    assert.ok(a);
    assert.deepEqual(a!.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    } satisfies AgentTrigger);
  });

  test("a valid channel (sms/email/none) is kept as-is", () => {
    assert.equal(
      normalizeAuthoredAgent({ skillMd: "x", channel: "email" })!.channel,
      "email",
    );
    assert.equal(
      normalizeAuthoredAgent({ skillMd: "x", channel: "none" })!.channel,
      "none",
    );
    assert.equal(
      normalizeAuthoredAgent({ skillMd: "x", channel: "SMS" })!.channel,
      "sms",
    );
  });

  test("invalid channel defaults by the RESOLVED trigger kind", () => {
    // schedule → "none"
    assert.equal(
      normalizeAuthoredAgent({
        skillMd: "x",
        trigger: { kind: "schedule", cron: "0 9 * * 1" },
        channel: "weird",
      })!.channel,
      "none",
    );
    // event → "sms"
    assert.equal(
      normalizeAuthoredAgent({
        skillMd: "x",
        trigger: { kind: "event", event: "lead.created", channel: "sms" },
        channel: "weird",
      })!.channel,
      "sms",
    );
    // a bad trigger resolves to inbound → "none" (type-safe inbound default;
    // an inbound agent carries no outbound EventChannel — see module note).
    assert.equal(
      normalizeAuthoredAgent({ skillMd: "x", trigger: { kind: "nope" }, channel: "weird" })!
        .channel,
      "none",
    );
  });

  test("missing channel also defaults by trigger kind", () => {
    assert.equal(
      normalizeAuthoredAgent({
        skillMd: "x",
        trigger: { kind: "event", event: "invoice.paid", channel: "email" },
      })!.channel,
      "sms",
    );
  });

  test("trimmed name kept; blank/missing name → humanized fallback (never empty)", () => {
    assert.equal(
      normalizeAuthoredAgent({ name: "  Lead Responder  ", skillMd: "x" })!.name,
      "Lead Responder",
    );
    const fallback = normalizeAuthoredAgent({
      name: "   ",
      summary: "Post the weekly highlight",
      skillMd: "Each Monday post our best review.",
    });
    assert.ok(fallback);
    assert.ok(fallback!.name.length > 0);
  });

  test("summary trimmed; missing summary → empty string", () => {
    assert.equal(
      normalizeAuthoredAgent({ skillMd: "x", summary: "  hi  " })!.summary,
      "hi",
    );
    assert.equal(normalizeAuthoredAgent({ skillMd: "x" })!.summary, "");
  });

  test("knowledgeHints.reviewUrl kept only when a string; otherwise omitted", () => {
    const withUrl = normalizeAuthoredAgent({
      skillMd: "x",
      knowledgeHints: { reviewUrl: "https://g.page/r/abc" },
    });
    assert.equal(withUrl!.knowledgeHints?.reviewUrl, "https://g.page/r/abc");

    const badUrl = normalizeAuthoredAgent({
      skillMd: "x",
      knowledgeHints: { reviewUrl: 123 },
    });
    assert.equal(badUrl!.knowledgeHints, undefined);

    const noHints = normalizeAuthoredAgent({ skillMd: "x" });
    assert.equal(noHints!.knowledgeHints, undefined);
  });

  test("never throws + never mutates the input object", () => {
    const raw = {
      skillMd: "x",
      tools: ["postiz", "made_up"],
      trigger: { kind: "event", event: "lead.created", channel: "sms" },
    };
    const snapshot = JSON.stringify(raw);
    assert.doesNotThrow(() => normalizeAuthoredAgent(raw));
    assert.equal(JSON.stringify(raw), snapshot); // input untouched
  });
});
