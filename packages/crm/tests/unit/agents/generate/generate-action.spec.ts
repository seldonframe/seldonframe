// Agent Loop — L4 Generate-by-Default — Task T3: the orchestration tests.
//
// runGenerateAgentDraft is the pure, DI'd heart of generateAgentDraftAction
// ("use server"). The action is a thin wrapper that only adds assertWritable +
// the real getOrgId/llmClassify/create deps + revalidatePath, so covering the
// orchestrator here (no real LLM, no Postgres) is the repo-idiomatic way to test
// the whole flow — exactly how instantiate-starter.spec.ts covers
// createTemplateFromStarterAction.
//
// These tests pin the contract:
//   • a review sentence (heuristic OR fake classify) → create called with a
//     blueprint carrying the event trigger + a verify rubric + review-requester
//     guardrails, and the "no review link" warning when no URL is supplied;
//   • "answer my phone" → the receptionist alias lands on the
//     ai-phone-receptionist starter (NO unrecognized-skill warning);
//   • getOrgId → null ⇒ { ok:false, error:"unauthorized" } and create is NEVER
//     called;
//   • a classify that THROWS still succeeds via the heuristic fallback.
//
// Plus a couple of pure-parse assertions for classify-llm.parseClassification
// (the defensive JSON parse that must never throw / never leak a bad shape).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  runGenerateAgentDraft,
  type CreateAgentDraftInput,
  type GenerateAgentDraftOutput,
  type GenerateDeps,
} from "../../../../src/lib/agents/generate/run-generate";
import { getStarterTemplate } from "../../../../src/lib/agent-templates/starter-pack";
import type { AgentIntent } from "../../../../src/lib/agents/generate/parse-intent";
import { parseClassification } from "../../../../src/lib/agents/generate/classify-llm";
import { makeLlmAgentGrader } from "../../../../src/lib/agents/generate/judge-llm";
import type { AgentBundle } from "../../../../src/lib/agents/generate/agent-bundle";

// ─── a capturing fake of the injected deps ────────────────────────────────────

function makeDeps(over: {
  orgId?: string | null;
  classify?: GenerateDeps["classify"];
  judge?: GenerateDeps["judge"];
  createResult?: { ok: true; id: string } | { ok: false; error: string };
} = {}): {
  deps: GenerateDeps;
  calls: { create: CreateAgentDraftInput[]; getOrgId: number };
} {
  const calls = { create: [] as CreateAgentDraftInput[], getOrgId: 0 };
  const deps: GenerateDeps = {
    getOrgId: async () => {
      calls.getOrgId += 1;
      return over.orgId === undefined ? "builder-1" : over.orgId;
    },
    classify: over.classify,
    judge: over.judge,
    create: async (input) => {
      calls.create.push(input);
      return over.createResult ?? { ok: true, id: "tmpl-new" };
    },
  };
  return { deps, calls };
}

/** Find the single verify check of a given kind (or undefined). */
function check(checks: Array<{ kind: string }>, kind: string) {
  return checks.find((c) => c.kind === kind);
}

// ─── review sentence (heuristic path, no URL) ─────────────────────────────────

describe("runGenerateAgentDraft — review sentence (heuristic, no URL)", () => {
  test("creates a template with the event trigger + verify + review-requester guardrails", async () => {
    const { deps, calls } = makeDeps();
    const result = await runGenerateAgentDraft(deps, {
      sentence: "text my customers for a google review after the job",
    });

    assert.equal(result.ok, true);
    assert.equal(calls.create.length, 1, "create called exactly once");

    const bp = calls.create[0]!.blueprint;
    // event trigger (review-requester fires on booking.completed via SMS)
    assert.deepEqual(bp.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    });
    // a verify rubric is present, with the always-on guards
    assert.ok(bp.verify, "expected a verify rubric");
    assert.ok(check(bp.verify.checks, "max_length"), "max_length guard present");
    assert.ok(
      check(bp.verify.checks, "must_not_include"),
      "no-placeholder guard present",
    );
    // review-requester guardrails (quiet hours + 30-day per-contact cap)
    assert.ok(bp.guardrails, "expected guardrails");
    assert.ok(bp.guardrails.quietHours, "review-requester has quiet hours");
    assert.equal(bp.guardrails.minMinutesBetweenPerContact, 43200);
  });

  test("returns { ok, templateId, warnings } with the 'no review link' warning", async () => {
    const { deps } = makeDeps();
    const result = await runGenerateAgentDraft(deps, {
      sentence: "ask customers for a google review",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.templateId, "tmpl-new");
    assert.ok(
      result.warnings.some((w) => /review link/i.test(w)),
      `expected a no-review-link warning, got: ${JSON.stringify(result.warnings)}`,
    );
  });

  test("a provided reviewUrl is wired into the blueprint and clears the warning", async () => {
    const { deps, calls } = makeDeps();
    const REVIEW_URL = "https://g.page/r/abc123/review";
    const result = await runGenerateAgentDraft(deps, {
      sentence: "ask customers for a google review",
      reviewUrl: REVIEW_URL,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(calls.create[0]!.blueprint.reviewUrl, REVIEW_URL);
    const inc = check(calls.create[0]!.blueprint.verify!.checks, "must_include");
    assert.ok(inc, "expected a must_include for the review link");
    assert.deepEqual(result.warnings, [], "no warnings once the URL is set");
  });
});

// ─── review sentence (fake classify wins) ─────────────────────────────────────

describe("runGenerateAgentDraft — review sentence with a fake classify", () => {
  test("the injected classify drives the skill/trigger and create still gets the safe blueprint", async () => {
    // A sentence the heuristic would read as receptionist, but the fake "LLM"
    // classifies it as review-requester — proving the classify seam flows
    // through parseAgentIntent into the assembled bundle.
    const classify = async (): Promise<Partial<AgentIntent>> => ({
      skill: "review-requester",
      trigger: { kind: "event", event: "booking.completed", channel: "sms" },
    });
    const { deps, calls } = makeDeps({ classify });

    const result = await runGenerateAgentDraft(deps, {
      sentence: "answer the phone for me",
    });

    assert.equal(result.ok, true);
    const bp = calls.create[0]!.blueprint;
    assert.deepEqual(bp.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    });
    assert.ok(bp.verify, "verify rubric from the assembler");
    assert.ok(bp.guardrails?.quietHours, "review-requester guardrails");
    // template type follows the review-requester starter (chat_assistant)
    assert.equal(calls.create[0]!.type, "chat_assistant");
  });
});

// ─── receptionist alias ───────────────────────────────────────────────────────

describe("runGenerateAgentDraft — receptionist alias", () => {
  test("'answer my phone' uses the ai-phone-receptionist blueprint (no unrecognized-skill warning)", async () => {
    const { deps, calls } = makeDeps();
    const result = await runGenerateAgentDraft(deps, {
      sentence: "answer my phone when I miss a call",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    // the alias landed on the real receptionist starter → its name + prose
    const starter = getStarterTemplate("ai-phone-receptionist");
    assert.equal(calls.create[0]!.name, starter.name, "ai-phone-receptionist name");
    assert.equal(
      calls.create[0]!.type,
      "voice_receptionist",
      "voice template type",
    );
    assert.ok(
      calls.create[0]!.blueprint.customSkillMd?.includes(
        "phone receptionist for a local service business",
      ),
      "the rich receptionist prose is used (alias resolved to the starter)",
    );
    // inbound voice trigger
    assert.deepEqual(calls.create[0]!.blueprint.trigger, {
      kind: "inbound",
      channel: "voice",
    });
    // CRITICAL: no "unrecognized skill" warning — the alias prevented the
    // generic-fallback path.
    assert.ok(
      !result.warnings.some((w) => /unrecognized/i.test(w)),
      `expected NO unrecognized-skill warning, got: ${JSON.stringify(result.warnings)}`,
    );
  });
});

// ─── unauthorized ──────────────────────────────────────────────────────────────

describe("runGenerateAgentDraft — unauthorized", () => {
  test("getOrgId → null ⇒ { ok:false, error:'unauthorized' } and create is NOT called", async () => {
    const { deps, calls } = makeDeps({ orgId: null });
    const result = await runGenerateAgentDraft(deps, {
      sentence: "ask customers for a review",
    });

    assert.deepEqual(result, { ok: false, error: "unauthorized" });
    assert.equal(calls.create.length, 0, "must not create when unauthorized");
  });
});

// ─── classify throws → heuristic fallback still succeeds ──────────────────────

describe("runGenerateAgentDraft — classify failure is fail-soft", () => {
  test("a classify that throws still creates an agent via the heuristic", async () => {
    const classify = async (): Promise<Partial<AgentIntent>> => {
      throw new Error("LLM exploded");
    };
    const { deps, calls } = makeDeps({ classify });

    // The call itself must not reject (the throwing classify is swallowed inside
    // parseAgentIntent). Await it directly so the result type is preserved.
    const result: GenerateAgentDraftOutput = await runGenerateAgentDraft(deps, {
      sentence: "text my customers for a google review after the job",
    });

    assert.equal(result.ok, true, "still succeeds despite the classify throw");
    assert.equal(calls.create.length, 1, "create still called");
    // heuristic classified it as review-requester → the event trigger
    assert.deepEqual(calls.create[0]!.blueprint.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    });
  });
});

// ─── create failure surfaces the error ────────────────────────────────────────

describe("runGenerateAgentDraft — create failure", () => {
  test("a failing create returns { ok:false, error } from the create seam", async () => {
    const { deps } = makeDeps({
      createResult: { ok: false, error: "template_not_found" },
    });
    const result = await runGenerateAgentDraft(deps, {
      sentence: "ask customers for a review",
    });
    assert.deepEqual(result, { ok: false, error: "template_not_found" });
  });

  test("an empty sentence is rejected before any work", async () => {
    const { deps, calls } = makeDeps();
    const result = await runGenerateAgentDraft(deps, { sentence: "   " });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "empty_sentence");
    assert.equal(calls.getOrgId, 0, "no org lookup for an empty sentence");
    assert.equal(calls.create.length, 0);
  });
});

// ─── classify-llm.parseClassification — pure defensive parse ──────────────────

describe("parseClassification — defensive JSON parse (no network)", () => {
  test("clean JSON → the typed fields are carried", () => {
    const out = parseClassification(
      '{"skill":"speed-to-lead","trigger":{"kind":"event","event":"lead.created","channel":"email"},"name":"Lead Bot"}',
    );
    assert.equal(out.skill, "speed-to-lead");
    assert.deepEqual(out.trigger, {
      kind: "event",
      event: "lead.created",
      channel: "email",
    });
    assert.equal(out.name, "Lead Bot");
  });

  test("a ```json fenced response is still parsed", () => {
    const out = parseClassification(
      '```json\n{"skill":"receptionist","trigger":{"kind":"inbound","channel":"voice"}}\n```',
    );
    assert.equal(out.skill, "receptionist");
  });

  test("garbage / non-JSON → {} (never throws)", () => {
    assert.deepEqual(parseClassification("not json at all"), {});
    assert.deepEqual(parseClassification(""), {});
    assert.deepEqual(parseClassification("[1,2,3]"), {});
    // a JSON object with no recognized fields → {}
    assert.deepEqual(parseClassification('{"foo":"bar"}'), {});
  });

  test("a non-string skill is dropped (shape guard)", () => {
    const out = parseClassification('{"skill":123,"name":"X"}');
    assert.equal(out.skill, undefined);
    assert.equal(out.name, "X");
  });
});

// ─── the maker≠checker judge wired into the orchestrator (L5.2 T5) ────────────
//
// run-generate.ts runs the (optional, DI'd) judge AFTER the deterministic
// assembler: an auto-fix lands on the created blueprint; an un-fixable issue
// surfaces as a warning; NO judge dep is byte-for-byte today's behavior; and a
// THROWING judge can never block a (safe) generation (judgeGeneratedAgent
// fails-open). All with an in-memory fake grader — NO real LLM.

describe("runGenerateAgentDraft — judge wiring (auto-fix)", () => {
  test("a judge trigger fix is reflected in the CREATED template's blueprint", async () => {
    // The receptionist sentence assembles an INBOUND/voice trigger; the fake
    // judge rules the user actually wanted an event agent and supplies a
    // low-risk trigger fix. The created blueprint must carry the FIXED trigger.
    const judge: GenerateDeps["judge"] = async () => ({
      ok: false,
      issues: [
        {
          field: "trigger",
          problem: "the sentence implies a post-booking event, not an inbound call",
          fix: {
            trigger: { kind: "event", event: "booking.completed", channel: "sms" },
          },
        },
      ],
    });
    const { deps, calls } = makeDeps({ judge });

    const result = await runGenerateAgentDraft(deps, {
      sentence: "answer my phone when I miss a call",
    });

    assert.equal(result.ok, true);
    assert.equal(calls.create.length, 1);
    // the FIXED trigger landed on the persisted blueprint (not the inbound default)
    assert.deepEqual(calls.create[0]!.blueprint.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    });
  });
});

describe("runGenerateAgentDraft — judge wiring (un-fixable issue → warning)", () => {
  test("a judge issue WITHOUT a fix is surfaced in result.warnings", async () => {
    const PROBLEM = "guardrails look empty for an outbound agent — review before publishing";
    const judge: GenerateDeps["judge"] = async () => ({
      ok: false,
      issues: [{ field: "guardrails", problem: PROBLEM }],
    });
    const { deps, calls } = makeDeps({ judge });

    const result = await runGenerateAgentDraft(deps, {
      sentence: "ask customers for a google review",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(
      result.warnings.includes(PROBLEM),
      `expected the un-fixable issue surfaced as a warning, got: ${JSON.stringify(result.warnings)}`,
    );
    // an un-fixable issue must NOT mutate the persisted blueprint trigger
    assert.deepEqual(calls.create[0]!.blueprint.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    });
  });
});

describe("runGenerateAgentDraft — NO judge dep is today's behavior (baseline)", () => {
  test("without a judge, a fixable-looking sentence keeps the assembler's trigger + only assembler warnings", async () => {
    // No judge passed. The receptionist sentence must keep its INBOUND/voice
    // trigger (no judge to rewrite it) and surface ONLY the assembler's warnings.
    const { deps, calls } = makeDeps(); // no judge
    const result = await runGenerateAgentDraft(deps, {
      sentence: "answer my phone when I miss a call",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    // assembler default trigger, untouched
    assert.deepEqual(calls.create[0]!.blueprint.trigger, {
      kind: "inbound",
      channel: "voice",
    });
    // receptionist alias resolves cleanly → no unrecognized-skill warning, and
    // (no judge) no judge-sourced warnings either.
    assert.deepEqual(result.warnings, [], "no warnings without a judge");
  });
});

describe("runGenerateAgentDraft — judge fails OPEN (never blocks)", () => {
  test("a judge that THROWS still creates the agent (fail-open), blueprint persisted", async () => {
    const judge: GenerateDeps["judge"] = async () => {
      throw new Error("LLM judge down");
    };
    const { deps, calls } = makeDeps({ judge });

    let result!: GenerateAgentDraftOutput;
    await assert.doesNotReject(async () => {
      result = await runGenerateAgentDraft(deps, {
        sentence: "ask customers for a google review",
      });
    });

    assert.equal(result.ok, true, "a throwing judge must not block generation");
    assert.equal(calls.create.length, 1, "the bundle is still persisted");
    // the assembler's blueprint survives intact (the throw is swallowed open)
    assert.deepEqual(calls.create[0]!.blueprint.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    });
  });
});

// ─── makeLlmAgentGrader — real grader factory (defensive parse, fail-open) ────

/** A minimal stand-in for the Anthropic client surface the grader touches
 *  (`messages.create(...)` → `{ content: [{type:"text", text}] }`). Cast through
 *  `unknown` to the grader's getClient return type — the grader only ever reads
 *  the text blocks, so this narrow fake is sufficient. */
function fakeAnthropicReturningText(text: string): ReturnType<
  NonNullable<NonNullable<Parameters<typeof makeLlmAgentGrader>[0]>["getClient"]>
> {
  return {
    messages: {
      create: async () => ({ content: [{ type: "text", text }] }),
    },
  } as unknown as ReturnType<
    NonNullable<NonNullable<Parameters<typeof makeLlmAgentGrader>[0]>["getClient"]>
  >;
}

const INBOUND_BUNDLE: AgentBundle = {
  name: "Front Desk",
  description: "Answers inbound calls.",
  blueprint: { trigger: { kind: "inbound", channel: "voice" } },
  warnings: [],
};

describe("makeLlmAgentGrader — fails OPEN on a malformed model response", () => {
  test("a fake client returning malformed JSON → { ok:true, issues:[] }", async () => {
    // The response is NOT valid judge JSON. The grader must parse defensively and
    // fail OPEN — never throw, never block.
    const grader = makeLlmAgentGrader({
      getClient: () => fakeAnthropicReturningText("totally not json {oops"),
    });

    const verdict = await grader({ sentence: "answer my phone", bundle: INBOUND_BUNDLE });

    assert.equal(verdict.ok, true, "malformed JSON must fail OPEN");
    assert.deepEqual(verdict.issues, []);
  });

  test("a fake client returning WELL-FORMED judge JSON → parsed through", async () => {
    const grader = makeLlmAgentGrader({
      getClient: () =>
        fakeAnthropicReturningText(
          '{"ok":false,"issues":[{"field":"trigger","problem":"mismatch"}]}',
        ),
    });
    const verdict = await grader({ sentence: "answer my phone", bundle: INBOUND_BUNDLE });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.issues.length, 1);
    assert.equal(verdict.issues[0]!.field, "trigger");
  });

  test("no client (null) → { ok:true, issues:[] } (no key, generation proceeds)", async () => {
    const grader = makeLlmAgentGrader({ getClient: () => null });
    const verdict = await grader({ sentence: "ask for a review", bundle: INBOUND_BUNDLE });
    assert.equal(verdict.ok, true);
    assert.deepEqual(verdict.issues, []);
  });
});
