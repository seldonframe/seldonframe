// Primitive-Composition Agent Generator — P3, Task 7: the judge prose-safety lens.
//
// judge-llm.ts's grader now also reviews the AUTHORED skill (customSkillMd) for
// SAFETY violations — a firm/made-up price, fabricated facts, a skipped read-back,
// a review incentive, over-promising — and emits field:"skill" issues WITH NO fix
// (flag-only; the harness never rewrites prose). For that to be possible two
// things must hold, and these tests pin BOTH off a capturing fake client (NO
// network):
//   1. the grader SYSTEM PROMPT carries the prose-safety instruction (it names
//      "firm price" / "fabricate" / "read-back" and the field:"skill" contract);
//   2. the compacted bundle the model actually SEES (the user message) includes a
//      slice of customSkillMd — otherwise the judge would be told to review prose
//      it was never shown.
//
// Plus a pure compactBundleForJudge assertion: the skill is sliced (a head, not
// the whole playbook) so the prompt budget stays sane, and a missing skill is "".

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  makeLlmAgentGrader,
  compactBundleForJudge,
} from "../../../../src/lib/agents/generate/judge-llm";
import type { AgentBundle } from "../../../../src/lib/agents/generate/agent-bundle";

// ─── a CAPTURING fake Anthropic client ────────────────────────────────────────

/** A narrow stand-in for the Anthropic surface the grader touches
 *  (`messages.create(req)` → `{ content: [{type:"text", text}] }`) that also
 *  CAPTURES each request so a test can assert the system prompt + user content.
 *  Cast through `unknown` to the grader's getClient return type — the grader only
 *  ever reads the text blocks. Mirrors author-llm.spec's fakeClient. */
function capturingClient(text: string): {
  client: ReturnType<
    NonNullable<NonNullable<Parameters<typeof makeLlmAgentGrader>[0]>["getClient"]>
  >;
  calls: Array<{ system?: unknown; model?: unknown; messages?: unknown }>;
} {
  const calls: Array<{ system?: unknown; model?: unknown; messages?: unknown }> = [];
  const client = {
    messages: {
      create: async (req: { system?: unknown; model?: unknown; messages?: unknown }) => {
        calls.push(req);
        return { content: [{ type: "text", text }] };
      },
    },
  } as unknown as ReturnType<
    NonNullable<NonNullable<Parameters<typeof makeLlmAgentGrader>[0]>["getClient"]>
  >;
  return { client, calls };
}

/** Flatten the user message content the grader sent (the request `messages`) into
 *  one string, however the SDK shape nests it (string or text-block array). */
function userContentText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  const parts: string[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const content = (m as { content?: unknown }).content;
    if (typeof content === "string") parts.push(content);
    else if (Array.isArray(content)) {
      for (const block of content) {
        const t = (block as { text?: unknown })?.text;
        if (typeof t === "string") parts.push(t);
      }
    }
  }
  return parts.join("\n");
}

// A composed authored bundle whose skill carries a UNIQUE marker we can find in
// the user content the model received (proving the slice was sent), plus the
// SF ground rules the composer appends.
const SKILL_MARKER = "PROSE_MARKER_unique_42";
const AUTHORED_BUNDLE: AgentBundle = {
  name: "Weekly IG Highlight",
  description: "Posts a weekly highlight of our best reviews.",
  blueprint: {
    trigger: { kind: "schedule", channel: "digest", cron: "0 9 * * 1" },
    customSkillMd: `Each Monday, draft an on-brand highlight. ${SKILL_MARKER}. Never fabricate a quote.\n\n## Ground rules\n- Never invent facts, hours, or prices.`,
  },
  warnings: [],
};

// The grader returns a benign verdict — we are asserting what it SENT, not what it
// got back, so any well-formed JSON keeps the grader from failing-open early.
const BENIGN = '{"ok":true,"issues":[]}';

// ─── the system prompt carries the prose-safety lens ─────────────────────────

describe("makeLlmAgentGrader — the system prompt instructs a prose-safety review", () => {
  test("the prompt names the skill-safety checks (firm price / fabricate / read-back) + the field:'skill' flag-only contract", async () => {
    const { client, calls } = capturingClient(BENIGN);
    const grader = makeLlmAgentGrader({ getClient: () => client });

    await grader({ sentence: "post a weekly instagram highlight", bundle: AUTHORED_BUNDLE });

    assert.equal(calls.length, 1, "the grader called the model once");
    const system = String(calls[0]!.system ?? "");

    // It tells the judge to review the skill prose for safety …
    assert.match(system, /skill/i);
    // … and names the concrete violations the lens guards against.
    assert.match(system, /firm.*price/i);
    assert.match(system, /fabricat/i);
    assert.match(system, /read-back/i);
    // … and pins the flag-only contract (a skill issue carries NO fix).
    assert.match(system, /field.*skill/i);
    // … and stays conservative (only a real instruction, not a missing rule).
    assert.match(system, /absence|conservative/i);
  });
});

// ─── the compacted bundle the model SEES includes a slice of the skill ───────

describe("makeLlmAgentGrader — the model is shown a slice of the authored skill", () => {
  test("the user content carries the customSkillMd slice (so the judge can actually review it)", async () => {
    const { client, calls } = capturingClient(BENIGN);
    const grader = makeLlmAgentGrader({ getClient: () => client });

    await grader({ sentence: "post a weekly instagram highlight", bundle: AUTHORED_BUNDLE });

    const sent = userContentText(calls[0]!.messages);
    assert.match(
      sent,
      new RegExp(SKILL_MARKER),
      "the authored skill prose must reach the model (else the prose-safety lens is blind)",
    );
  });
});

// ─── compactBundleForJudge — slices the skill, keeps the budget sane (pure) ──

describe("compactBundleForJudge — ships a TRIMMED skill head, not the whole playbook", () => {
  test("a short skill is carried verbatim under blueprint.skillMd", () => {
    const compact = compactBundleForJudge(AUTHORED_BUNDLE);
    const bp = compact.blueprint as Record<string, unknown>;
    assert.equal(typeof bp.skillMd, "string");
    assert.match(String(bp.skillMd), new RegExp(SKILL_MARKER));
    // hasSkillPrompt still reports presence (the structural signal is preserved).
    assert.equal(bp.hasSkillPrompt, true);
  });

  test("a very long skill is TRIMMED (a head with an ellipsis, not the full prose)", () => {
    const long = "x".repeat(5000);
    const bundle: AgentBundle = {
      name: "Big",
      description: "",
      blueprint: { trigger: { kind: "inbound", channel: "voice" }, customSkillMd: long },
      warnings: [],
    };
    const compact = compactBundleForJudge(bundle);
    const skillMd = String((compact.blueprint as Record<string, unknown>).skillMd);
    assert.ok(skillMd.length < long.length, "the long skill must be trimmed");
    assert.ok(skillMd.length <= 2500, "trimmed to ~2400 chars + an ellipsis, keeping the budget sane");
    assert.ok(skillMd.endsWith("…"), "a trimmed slice ends with an ellipsis");
  });

  test("no skill → blueprint.skillMd is '' and hasSkillPrompt is false", () => {
    const bundle: AgentBundle = {
      name: "Bare",
      description: "",
      blueprint: { trigger: { kind: "inbound", channel: "voice" } },
      warnings: [],
    };
    const compact = compactBundleForJudge(bundle);
    const bp = compact.blueprint as Record<string, unknown>;
    assert.equal(bp.skillMd, "");
    assert.equal(bp.hasSkillPrompt, false);
  });

  // The trim is now ~2400 chars (was 1200) so the judge rarely sees a sentence
  // cut mid-thought — fewer FALSE "truncated" flags. Pin the new ceiling at the
  // pure layer (a 2000-char skill is carried whole; a 5000-char one is trimmed
  // wider than the old 1200 head).
  test("the skill slice is wider than the old 1200 head (~2400 chars now)", () => {
    const mid = "y".repeat(2000);
    const midBundle: AgentBundle = {
      name: "Mid",
      description: "",
      blueprint: { trigger: { kind: "inbound", channel: "voice" }, customSkillMd: mid },
      warnings: [],
    };
    const midSkill = String(
      (compactBundleForJudge(midBundle).blueprint as Record<string, unknown>).skillMd,
    );
    // A 2000-char skill now fits under the slice → carried whole (would have been
    // trimmed under the old 1200 ceiling).
    assert.equal(midSkill, mid, "a 2000-char skill is now carried whole (slice ≥ 2400)");

    const long = "z".repeat(5000);
    const longBundle: AgentBundle = {
      name: "Long",
      description: "",
      blueprint: { trigger: { kind: "inbound", channel: "voice" }, customSkillMd: long },
      warnings: [],
    };
    const longSkill = String(
      (compactBundleForJudge(longBundle).blueprint as Record<string, unknown>).skillMd,
    );
    // The trimmed head is now > the old 1200 ceiling and ≤ ~2400 + an ellipsis.
    assert.ok(longSkill.length > 1300, "the trim is wider than the old 1200 head");
    assert.ok(longSkill.length <= 2500, "trimmed to ~2400 chars + an ellipsis");
    assert.ok(longSkill.endsWith("…"));
  });

  // The slice is carried under an explicitly-LABELED `skillMdExcerpt` key (in
  // addition to `skillMd`) so the judge can never mistake an intentional trim for
  // a model that ran out of room mid-sentence.
  test("the slice is also exposed under a labeled `skillMdExcerpt` key", () => {
    const compact = compactBundleForJudge(AUTHORED_BUNDLE);
    const bp = compact.blueprint as Record<string, unknown>;
    assert.equal(typeof bp.skillMdExcerpt, "string");
    assert.equal(bp.skillMdExcerpt, bp.skillMd, "the excerpt mirrors the skill slice");
    assert.match(String(bp.skillMdExcerpt), new RegExp(SKILL_MARKER));
  });
});

// ─── the system prompt teaches the SeldonFrame model (kills the 4 false flags) ──
//
// A generic judge raised FALSE issues by assuming a connector-per-capability model
// SeldonFrame does not use ("needs a Twilio connector", "needs per-platform social
// connectors", "channel doesn't match the trigger", "skill is truncated"). The
// JUDGE_SYSTEM prompt now carries a "SeldonFrame model (do NOT flag these as
// issues)" section that forbids each of those. Pin the substrings off the captured
// system prompt (NO network).

describe("makeLlmAgentGrader — the system prompt teaches SeldonFrame's own model", () => {
  test("it carries the SF-model section that forbids the 4 known false flags", async () => {
    const { client, calls } = capturingClient(BENIGN);
    const grader = makeLlmAgentGrader({ getClient: () => client });

    await grader({ sentence: "text back missed callers", bundle: AUTHORED_BUNDLE });

    assert.equal(calls.length, 1, "the grader called the model once");
    const system = String(calls[0]!.system ?? "");

    // A clearly-delimited "do NOT flag these" section exists.
    assert.match(system, /SeldonFrame model/i);
    assert.match(system, /do NOT flag/i);

    // (1) sms/email/voice are NATIVE channels — not connectors.
    assert.match(system, /native/i);
    assert.match(system, /sms.*email.*voice|voice.*native/i);

    // (2) Postiz is one MULTI-PLATFORM publisher covering all socials.
    assert.match(system, /postiz/i);
    assert.match(system, /multi-platform/i);

    // (3) `channel` is the OUTPUT medium — it need not match the trigger event.
    assert.match(system, /OUTBOUND|output medium/i);

    // (4) the skill is an EXCERPT — never flag truncation / incompleteness.
    assert.match(system, /excerpt/i);
    assert.match(system, /do NOT flag.*truncat|never flag.*truncat|truncat/i);
  });

  test("the genuine P3 prose-safety checks still ride alongside the SF-model section (regression guard)", async () => {
    const { client, calls } = capturingClient(BENIGN);
    const grader = makeLlmAgentGrader({ getClient: () => client });

    await grader({ sentence: "post a weekly instagram highlight", bundle: AUTHORED_BUNDLE });

    const system = String(calls[0]!.system ?? "");
    // The real safety lens (firm price / fabricate / read-back) is untouched.
    assert.match(system, /firm.*price/i);
    assert.match(system, /fabricat/i);
    assert.match(system, /read-back/i);
  });
});
