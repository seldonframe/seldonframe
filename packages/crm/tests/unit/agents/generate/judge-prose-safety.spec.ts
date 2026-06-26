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
    assert.ok(skillMd.length <= 1300, "trimmed to ~1200 chars + an ellipsis, keeping the budget sane");
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
});
