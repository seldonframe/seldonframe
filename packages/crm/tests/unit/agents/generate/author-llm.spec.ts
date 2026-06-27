// Primitive-Composition Agent Generator — P1, Task 2: the real LLM author.
//
// author-llm.ts is the one real implementation of the AgentAuthor seam: a single
// strict Anthropic call that DESIGNS one agent from the operator's sentence and
// returns the parsed JSON for authored-agent.ts's normalizeAuthoredAgent to
// validate. These tests pin the contract WITHOUT any network: the Anthropic
// client is a narrow in-memory fake (mirrors generate-action.spec's
// fakeAnthropicReturningText).
//
// What's pinned:
//   • a fake client returning a valid AuthoredAgent JSON → the author resolves an
//     object that normalizeAuthoredAgent turns into a real AuthoredAgent
//     (asserted end-to-end: name, trigger.kind, channel, tools);
//   • malformed JSON → {} → normalize → null (fail-soft);
//   • null client (no key) → {} → null;
//   • the prompt the client RECEIVES carries the tool menu (a label), a starter
//     example name, the KNOWN_EVENTS, and (when passed) the priorLessons string.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  makeLlmAgentAuthor,
  DEFAULT_AUTHOR_MODEL,
} from "../../../../src/lib/agents/generate/author-llm";
import { normalizeAuthoredAgent } from "../../../../src/lib/agents/generate/authored-agent";

// ─── a narrow fake Anthropic client ──────────────────────────────────────────

/** The minimal stand-in for the Anthropic surface the author touches
 *  (`messages.create(...)` → `{ content: [{type:"text", text}] }`). It also
 *  CAPTURES the request so a test can assert what prompt the model received.
 *  Cast through `unknown` to the author's getClient return type — the author only
 *  reads the text blocks. Mirrors generate-action.spec's fakeAnthropicReturningText. */
type CapturedCall = {
  system?: unknown;
  model?: unknown;
  messages?: unknown;
  max_tokens?: unknown;
};

function fakeClient(text: string): {
  client: ReturnType<
    NonNullable<NonNullable<Parameters<typeof makeLlmAgentAuthor>[0]>["getClient"]>
  >;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const client = {
    messages: {
      create: async (req: CapturedCall) => {
        calls.push(req);
        return { content: [{ type: "text", text }] };
      },
    },
  } as unknown as ReturnType<
    NonNullable<NonNullable<Parameters<typeof makeLlmAgentAuthor>[0]>["getClient"]>
  >;
  return { client, calls };
}

/** A valid AuthoredAgent JSON the author should pass straight through to the
 *  seam: a weekly Instagram poster (schedule cadence, action-only, Postiz). */
const WEEKLY_IG_JSON = JSON.stringify({
  name: "Weekly IG Highlight",
  summary: "Posts the best 5-star review to Instagram every Monday.",
  skillMd:
    "You are the weekly social poster.\n\n## When you fire\n- Every Monday at 9am.\n\n## What you do\n- Pull the best recent 5-star review and publish it to Instagram via Postiz.",
  trigger: { kind: "schedule", cron: "0 9 * * 1" },
  channel: "none",
  tools: ["postiz"],
});

// ─── happy path — a valid draft flows through to a real AuthoredAgent ─────────

describe("makeLlmAgentAuthor — resolves a draft the seam validates", () => {
  test("a valid AuthoredAgent JSON → normalizeAuthoredAgent yields a real agent (name/trigger/channel/tools)", async () => {
    const { client } = fakeClient(WEEKLY_IG_JSON);
    const author = makeLlmAgentAuthor({ getClient: () => client });

    const raw = await author("post a weekly instagram highlight of our 5-star reviews");

    // The author returns the raw parsed object; the seam is the sole validator.
    const agent = normalizeAuthoredAgent(raw);
    assert.ok(agent, "expected a normalized AuthoredAgent");
    assert.equal(agent!.name, "Weekly IG Highlight");
    assert.equal(agent!.trigger.kind, "schedule");
    assert.equal(agent!.channel, "none");
    assert.deepEqual(agent!.tools, ["postiz"]);
  });

  test("the author tolerates a ```json fenced response (fence-stripped before parse)", async () => {
    const { client } = fakeClient("```json\n" + WEEKLY_IG_JSON + "\n```");
    const author = makeLlmAgentAuthor({ getClient: () => client });

    const agent = normalizeAuthoredAgent(await author("weekly ig poster"));
    assert.ok(agent);
    assert.equal(agent!.trigger.kind, "schedule");
    assert.deepEqual(agent!.tools, ["postiz"]);
  });
});

// ─── fail-soft — malformed / no client → {} → seam → null ─────────────────────

describe("makeLlmAgentAuthor — fails soft to {} (→ seam null → heuristic)", () => {
  test("malformed JSON from the client → {} → normalize → null", async () => {
    const { client } = fakeClient("totally not json {oops");
    const author = makeLlmAgentAuthor({ getClient: () => client });

    const raw = await author("post weekly to instagram");
    assert.deepEqual(raw, {});
    assert.equal(normalizeAuthoredAgent(raw), null);
  });

  test("a non-object JSON (array) from the client → {} → null", async () => {
    const { client } = fakeClient("[1,2,3]");
    const author = makeLlmAgentAuthor({ getClient: () => client });

    const raw = await author("post weekly to instagram");
    assert.deepEqual(raw, {});
    assert.equal(normalizeAuthoredAgent(raw), null);
  });

  test("null client (no ANTHROPIC_API_KEY) → {} → null", async () => {
    const author = makeLlmAgentAuthor({ getClient: () => null });

    const raw = await author("post weekly to instagram");
    assert.deepEqual(raw, {});
    assert.equal(normalizeAuthoredAgent(raw), null);
  });

  test("a blank sentence short-circuits to {} (no client call needed)", async () => {
    const { client, calls } = fakeClient(WEEKLY_IG_JSON);
    const author = makeLlmAgentAuthor({ getClient: () => client });

    const raw = await author("   ");
    assert.deepEqual(raw, {});
    assert.equal(calls.length, 0); // never reached the model
  });

  test("a client that throws → {} (never throws out)", async () => {
    const throwing = {
      messages: {
        create: async () => {
          throw new Error("model down");
        },
      },
    } as unknown as ReturnType<
      NonNullable<NonNullable<Parameters<typeof makeLlmAgentAuthor>[0]>["getClient"]>
    >;
    const author = makeLlmAgentAuthor({ getClient: () => throwing });

    const raw = await author("post weekly to instagram");
    assert.deepEqual(raw, {});
  });
});

// ─── model + budget — premium author (Opus), playbook-sized token budget ──────

describe("makeLlmAgentAuthor — runs premium (Opus default) with a playbook-sized budget", () => {
  test("the default model constant is the premium Opus id", () => {
    // Generation is compile-time + amortized → the author runs premium by default.
    assert.equal(DEFAULT_AUTHOR_MODEL, "claude-opus-4-8");
  });

  test("the request uses the resolved author model (Opus default unless env overrides)", async () => {
    const { client, calls } = fakeClient(WEEKLY_IG_JSON);
    const author = makeLlmAgentAuthor({ getClient: () => client });

    await author("post a weekly instagram highlight");

    assert.equal(calls.length, 1);
    // Model is read at call time: env override wins, else the Opus default.
    const expected =
      process.env.ANTHROPIC_AUTHOR_MODEL?.trim() || DEFAULT_AUTHOR_MODEL;
    assert.equal(calls[0]!.model, expected);
  });

  test("max_tokens is sized for a full playbook (>= 4000)", async () => {
    const { client, calls } = fakeClient(WEEKLY_IG_JSON);
    const author = makeLlmAgentAuthor({ getClient: () => client });

    await author("post a weekly instagram highlight");

    const maxTokens = calls[0]!.max_tokens;
    assert.equal(typeof maxTokens, "number");
    assert.ok(
      (maxTokens as number) >= 4000,
      `expected max_tokens >= 4000, got ${String(maxTokens)}`,
    );
  });
});

// ─── the prompt the model receives ────────────────────────────────────────────

describe("makeLlmAgentAuthor — the system prompt is built from the catalog / events / starters / lessons", () => {
  test("the system prompt contains a tool label, a starter example name, and the KNOWN_EVENTS", async () => {
    const { client, calls } = fakeClient(WEEKLY_IG_JSON);
    const author = makeLlmAgentAuthor({ getClient: () => client });

    await author("post a weekly instagram highlight");

    assert.equal(calls.length, 1);
    const system = String(calls[0]!.system ?? "");

    // The tool menu is built from TOOL_CATALOG — Postiz's label + id must show.
    assert.match(system, /Postiz/);
    assert.match(system, /postiz/);
    // At least one starter example name (the flagship receptionist) is included.
    assert.match(system, /AI Phone Receptionist/);
    // The KNOWN_EVENTS slugs are listed for the 'event' trigger rule.
    assert.match(system, /booking\.completed/);
    assert.match(system, /lead\.created/);
  });

  test("the prompt features the curated tool menu (labels + descriptions from the catalog)", async () => {
    const { client, calls } = fakeClient(WEEKLY_IG_JSON);
    const author = makeLlmAgentAuthor({ getClient: () => client });

    await author("post a weekly instagram highlight");
    const system = String(calls[0]!.system ?? "");

    // The featured menu surfaces the curated catalog's labels (UI-grade names).
    for (const label of [
      "Postiz (social publishing)",
      "Google Sheets / Drive",
      "Google Calendar",
      "Gmail",
      "Notion",
      "Slack",
    ]) {
      assert.ok(
        system.includes(label),
        `featured tool menu should list "${label}"`,
      );
    }
  });

  test("the prompt frames Postiz as a MULTI-PLATFORM social publisher (not IG-only)", async () => {
    const { client, calls } = fakeClient(WEEKLY_IG_JSON);
    const author = makeLlmAgentAuthor({ getClient: () => client });

    await author("post a weekly instagram highlight");
    const system = String(calls[0]!.system ?? "");

    // Multi-platform note: the social poster reaches well beyond Instagram.
    assert.match(system, /multi-platform/i);
    for (const platform of ["Instagram", "Facebook", "LinkedIn", "TikTok"]) {
      assert.ok(
        system.includes(platform),
        `Postiz framing should mention "${platform}"`,
      );
    }
    // X/Twitter is covered too (either spelling).
    assert.match(system, /X\/Twitter|Twitter/);
  });

  test("the prompt states channel 'none' is for a posting agent (not 'digest')", async () => {
    const { client, calls } = fakeClient(WEEKLY_IG_JSON);
    const author = makeLlmAgentAuthor({ getClient: () => client });

    await author("post a weekly instagram highlight");
    const system = String(calls[0]!.system ?? "");

    // A social poster sends no customer message → channel 'none' (a real run
    // mis-picked 'digest'; the prompt now nudges 'none' explicitly).
    assert.match(system, /'none' for a social-posting agent|none.*social-posting/i);
    // And it warns off 'digest' for the publish action (digest = internal recap).
    assert.match(system, /digest/i);
  });

  test("the prompt instructs the neededCapabilities escape hatch (don't invent tool ids)", async () => {
    const { client, calls } = fakeClient(WEEKLY_IG_JSON);
    const author = makeLlmAgentAuthor({ getClient: () => client });

    await author("post a weekly instagram highlight");
    const system = String(calls[0]!.system ?? "");

    // The JSON contract advertises the field…
    assert.match(system, /neededCapabilities/);
    // …and the rule tells the author to use it instead of inventing a tool id.
    assert.match(system, /invent a tool id/i);
    // An out-of-menu example is shown to anchor the behavior.
    assert.match(system, /Google reviews|Trello|Stripe/);
  });

  test("priorLessons, when passed, is folded into the system prompt", async () => {
    const { client, calls } = fakeClient(WEEKLY_IG_JSON);
    const author = makeLlmAgentAuthor({ getClient: () => client });

    await author("post a weekly instagram highlight", "Never quote a firm price.");

    const system = String(calls[0]!.system ?? "");
    assert.match(system, /Never quote a firm price\./);
  });

  test("no priorLessons → the corrections line reads 'none' (still a valid prompt)", async () => {
    const { client, calls } = fakeClient(WEEKLY_IG_JSON);
    const author = makeLlmAgentAuthor({ getClient: () => client });

    await author("post a weekly instagram highlight");

    const system = String(calls[0]!.system ?? "");
    assert.match(system, /Past corrections to honor: none\./);
  });
});

// ─── P5.3 — the Soul-grounded business block ──────────────────────────────────

describe("makeLlmAgentAuthor — grounds the prompt in the workspace Soul (soulContext)", () => {
  const SUMMARY =
    "Acme Plumbing is a plumbing business. We fix leaks 24/7. Services: Drain cleaning. Brand voice: friendly, professional.";

  test("a soulContext factory dep → the business block appears in the system prompt", async () => {
    const { client, calls } = fakeClient(WEEKLY_IG_JSON);
    const author = makeLlmAgentAuthor({
      getClient: () => client,
      soulContext: SUMMARY,
    });

    await author("post a weekly instagram highlight of our 5-star reviews");

    const system = String(calls[0]!.system ?? "");
    // The grounding label + the summary + the "speak as THIS business" rule.
    assert.match(system, /The business you are authoring this agent for:/);
    assert.match(system, /Acme Plumbing is a plumbing business/);
    assert.match(system, /Drain cleaning/);
    assert.match(system, /speak and act as THIS business/);
  });

  test("no soulContext → the business block is ABSENT (prompt stays generic)", async () => {
    const { client, calls } = fakeClient(WEEKLY_IG_JSON);
    const author = makeLlmAgentAuthor({ getClient: () => client });

    await author("post a weekly instagram highlight");

    const system = String(calls[0]!.system ?? "");
    assert.ok(
      !system.includes("The business you are authoring this agent for:"),
      "the business block must not appear when no soulContext is provided",
    );
  });

  test("an empty soulContext → the business block is ABSENT", async () => {
    const { client, calls } = fakeClient(WEEKLY_IG_JSON);
    const author = makeLlmAgentAuthor({ getClient: () => client, soulContext: "" });

    await author("post a weekly instagram highlight");

    const system = String(calls[0]!.system ?? "");
    assert.ok(!system.includes("The business you are authoring this agent for:"));
  });

  test("soulContext and priorLessons coexist — BOTH fold into the prompt", async () => {
    const { client, calls } = fakeClient(WEEKLY_IG_JSON);
    const author = makeLlmAgentAuthor({
      getClient: () => client,
      soulContext: SUMMARY,
    });

    await author("post a weekly instagram highlight", "Never quote a firm price.");

    const system = String(calls[0]!.system ?? "");
    // priorLessons still threads through (regression guard)…
    assert.match(system, /Never quote a firm price\./);
    // …alongside the Soul block.
    assert.match(system, /Acme Plumbing is a plumbing business/);
  });
});
