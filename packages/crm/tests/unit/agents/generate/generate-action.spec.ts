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
import type { AgentAuthor } from "../../../../src/lib/agents/generate/authored-agent";
import type { AgentIntent } from "../../../../src/lib/agents/generate/parse-intent";
import { parseClassification } from "../../../../src/lib/agents/generate/classify-llm";
import { makeLlmAgentGrader } from "../../../../src/lib/agents/generate/judge-llm";
import type { AgentBundle } from "../../../../src/lib/agents/generate/agent-bundle";
import {
  recordGeneratorLesson,
  type GeneratorLesson,
} from "../../../../src/lib/agents/generate/generator-lessons";
import type {
  AgentMemoryEntry,
  AgentMemoryStore,
} from "../../../../src/lib/agents/memory/agent-memory";
import type { ConnectorBinding } from "../../../../src/lib/agents/mcp/connectors";

// ─── a capturing fake of the injected deps ────────────────────────────────────

function makeDeps(over: {
  orgId?: string | null;
  author?: GenerateDeps["author"];
  classify?: GenerateDeps["classify"];
  judge?: GenerateDeps["judge"];
  resolveCapabilities?: GenerateDeps["resolveCapabilities"];
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
    author: over.author,
    classify: over.classify,
    judge: over.judge,
    resolveCapabilities: over.resolveCapabilities,
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

describe("runGenerateAgentDraft — judge wiring (prose-safety skill issue → warning, prose untouched)", () => {
  test("a field:'skill' flag-only issue surfaces as a warning AND never rewrites customSkillMd", async () => {
    // The prose-safety lens (P3) returns field:"skill" issues with NO fix when the
    // authored playbook instructs something unsafe. run-generate must surface the
    // problem as an operator warning (it has no `fix`, so it flows through the
    // issues.filter(!i.fix) → warnings path) and leave the prose byte-for-byte
    // (applyJudgeFixes's allow-list excludes `skill`).
    const SKILL_PROBLEM =
      "the skill instructs quoting a firm $99 price — give an honest range a human confirms instead";
    const author: AgentAuthor = async () => IG_POSTER_DRAFT;
    const judge: GenerateDeps["judge"] = async () => ({
      ok: false,
      issues: [{ field: "skill", problem: SKILL_PROBLEM }], // flag-only
    });
    const { deps, calls } = makeDeps({ author, judge });

    const result = await runGenerateAgentDraft(deps, {
      sentence: "Post a weekly Instagram highlight of our 5-star reviews",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    // surfaced as a warning for the operator to resolve …
    assert.ok(
      result.warnings.includes(SKILL_PROBLEM),
      `expected the skill issue surfaced as a warning, got: ${JSON.stringify(result.warnings)}`,
    );
    // … and the authored prose is preserved exactly (never auto-rewritten).
    assert.ok(
      calls.create[0]!.blueprint.customSkillMd?.includes("draft a short, on-brand highlight"),
      "the authored playbook prose survives a flag-only skill issue",
    );
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

// ─── P1 T5 — author-first path: the primitive-composition generator ──────────
//
// run-generate.ts now tries an LLM AUTHOR first: when a valid AuthoredAgent comes
// back it COMPOSES the bundle from primitives (authored playbook + SF's
// deterministic safety floor + declared trigger/channel/tools) instead of cloning
// a starter. It's additive + fail-soft: no author dep, or an author that returns
// null / throws, degrades to TODAY's parseAgentIntent → assembleAgentBundle path.
// The judge + lessons ride on top of WHICHEVER bundle was selected. All with
// in-memory fakes — NO real LLM, NO Postgres.

/** A valid author result: a weekly Instagram poster — a NEW species of agent the
 *  template-picker could never emit (schedule-fired, action-only, Postiz-bound). */
const IG_POSTER_DRAFT = {
  name: "Weekly IG Highlight",
  summary: "Posts a weekly highlight of our best reviews to Instagram.",
  skillMd:
    "Each Monday at 9am, draft a short, on-brand highlight of the week's best 5-star review and publish it to the connected Instagram account. Keep it warm, concise, and never fabricate a quote.",
  trigger: { kind: "schedule", cron: "0 9 * * 1" },
  channel: "none",
  tools: ["postiz"],
} as const;

describe("runGenerateAgentDraft — author-first: a valid draft uses the COMPOSED bundle", () => {
  test("an author returning a weekly IG poster → composed (authored skill + actionOnly + Postiz), NOT a starter clone", async () => {
    const author: AgentAuthor = async () => IG_POSTER_DRAFT;
    const { deps, calls } = makeDeps({ author });

    const result = await runGenerateAgentDraft(deps, {
      // A sentence the heuristic would keyword-match to "reviews" and clone the
      // review-requester starter from — the author path must win instead.
      sentence: "Post a weekly Instagram highlight of our 5-star reviews",
    });

    assert.equal(result.ok, true);
    assert.equal(calls.create.length, 1, "create called exactly once");
    const created = calls.create[0]!;

    // The AUTHORED name (not the review-requester starter's name).
    assert.equal(created.name, "Weekly IG Highlight");

    // The AUTHORED playbook prose is present (the composed path, not a clone) AND
    // SF's ground rules are appended (the deterministic safety floor).
    const skill = created.blueprint.customSkillMd ?? "";
    assert.ok(
      skill.includes("draft a short, on-brand highlight"),
      "the authored playbook prose is used",
    );
    assert.ok(skill.includes("Never invent"), "SF ground rules appended");

    // The composed primitives: a schedule trigger, action-only, Postiz bound.
    assert.equal(created.blueprint.trigger?.kind, "schedule");
    assert.equal(
      created.blueprint.actionOnly,
      true,
      "channel 'none' → actionOnly true (a poster sends no customer message)",
    );
    const postiz = (created.blueprint.connectors ?? []).find(
      (c) => c.id === "postiz",
    );
    assert.ok(postiz, "the Postiz connector is bound from the declared tool id");
    assert.equal(postiz?.kind, "vetted");

    // It is NOT the review-requester clone: an action-only poster has NO quiet
    // hours (the review-requester starter always does).
    assert.equal(
      created.blueprint.guardrails?.quietHours,
      undefined,
      "an action-only poster has no quiet hours (not the review-requester clone)",
    );
    // …and it is a chat_assistant row type (not a voice receptionist).
    assert.equal(created.type, "chat_assistant");
  });
});

describe("runGenerateAgentDraft — NO author dep falls back to the heuristic (baseline)", () => {
  test("without an author, a review sentence still assembles the review-requester bundle", async () => {
    const { deps, calls } = makeDeps(); // no author
    const result = await runGenerateAgentDraft(deps, {
      sentence: "text my customers for a google review after the job",
    });

    assert.equal(result.ok, true);
    assert.equal(calls.create.length, 1);
    // Today's heuristic path: review-requester's event/SMS trigger + quiet hours.
    assert.deepEqual(calls.create[0]!.blueprint.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    });
    assert.ok(
      calls.create[0]!.blueprint.guardrails?.quietHours,
      "the heuristic review-requester bundle keeps its quiet hours",
    );
  });
});

describe("runGenerateAgentDraft — a fail-soft author falls back to the heuristic", () => {
  test("an author that RETURNS NULL → falls back; generation still succeeds", async () => {
    const author: AgentAuthor = async () => null;
    const { deps, calls } = makeDeps({ author });

    const result = await runGenerateAgentDraft(deps, {
      sentence: "text my customers for a google review after the job",
    });

    assert.equal(result.ok, true, "a null-returning author still generates");
    assert.equal(calls.create.length, 1);
    // Fell back to the heuristic review-requester bundle.
    assert.deepEqual(calls.create[0]!.blueprint.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    });
  });

  test("an author that THROWS → falls back (fail-soft); generation still succeeds", async () => {
    const author: AgentAuthor = async () => {
      throw new Error("LLM author down");
    };
    const { deps, calls } = makeDeps({ author });

    let result!: GenerateAgentDraftOutput;
    await assert.doesNotReject(async () => {
      result = await runGenerateAgentDraft(deps, {
        sentence: "text my customers for a google review after the job",
      });
    });

    assert.equal(result.ok, true, "a throwing author must not block generation");
    assert.equal(calls.create.length, 1);
    assert.deepEqual(calls.create[0]!.blueprint.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    });
  });

  test("an author returning GARBAGE (no skillMd) → falls back via the seam", async () => {
    const author: AgentAuthor = async () => ({ name: "no playbook here" });
    const { deps, calls } = makeDeps({ author });

    const result = await runGenerateAgentDraft(deps, {
      sentence: "text my customers for a google review after the job",
    });

    assert.equal(result.ok, true);
    assert.equal(calls.create.length, 1);
    // The garbage draft normalized to null → heuristic review-requester bundle.
    assert.deepEqual(calls.create[0]!.blueprint.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    });
  });
});

describe("runGenerateAgentDraft — judge + lessons run on the COMPOSED (authored) bundle", () => {
  test("a judge trigger-fix is applied to the composed bundle AND recorded as a lesson", async () => {
    const author: AgentAuthor = async () => IG_POSTER_DRAFT;

    // The judge rules the poster should actually fire on a booking event and
    // supplies a low-risk trigger fix — it must land on the COMPOSED blueprint.
    const FIX = {
      trigger: { kind: "event", event: "booking.completed", channel: "sms" },
    } as const;
    const judge: GenerateDeps["judge"] = async ({ bundle }) => {
      // Prove the judge received the COMPOSED bundle (authored prose), not a clone.
      assert.ok(
        bundle.blueprint.customSkillMd?.includes("draft a short, on-brand highlight"),
        "the judge graded the composed authored bundle",
      );
      return {
        ok: false,
        issues: [
          { field: "trigger", problem: "this should fire after a booking", fix: FIX },
        ],
      };
    };

    const store = makeFakeLessonsStore();
    const { deps, calls } = makeDeps({ author, judge });

    const result = await runGenerateAgentDraft(
      { ...deps, lessonsStore: store },
      { sentence: "Post a weekly Instagram highlight of our 5-star reviews" },
    );

    assert.equal(result.ok, true);
    assert.equal(calls.create.length, 1);
    // The FIXED trigger landed on the persisted COMPOSED blueprint (not the
    // authored schedule trigger) — the judge rides on top of the authored path.
    assert.deepEqual(calls.create[0]!.blueprint.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    });
    // …but the authored playbook prose survives the judge (prose is never rewritten).
    assert.ok(
      calls.create[0]!.blueprint.customSkillMd?.includes(
        "draft a short, on-brand highlight",
      ),
      "the authored prose is preserved through the judge",
    );

    // The applied fix was recorded as a generator lesson (the compounding loop).
    const recalled = await recallStore(store);
    assert.equal(recalled.length, 1, "exactly one lesson recorded");
    assert.equal(recalled[0]!.correction, JSON.stringify(FIX));
    assert.ok(
      recalled[0]!.pattern.includes("Post a weekly Instagram highlight"),
      `the lesson keys on the sentence, got: ${recalled[0]!.pattern}`,
    );
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

// ─── L5.3 — generator lessons recalled into + recorded from a generation ──────
//
// run-generate.ts now (when a `lessonsStore` dep is present) RECALLS the org's
// past corrections and threads the rendered hint into BOTH the classifier and
// the judge, and RECORDS every judge fix it applies as a new lesson. All of it is
// fail-soft: no store → unchanged behavior, a throwing store → generation still
// succeeds. These use an in-memory fake AgentMemoryStore (a Map) + capturing
// fake classify/judge deps — NO Brain, NO LLM.

// An in-memory fake AgentMemoryStore over a Map (same read + append-to-array
// semantics as the real Brain store), so recall/record round-trip without I/O.
function makeFakeLessonsStore(): AgentMemoryStore & {
  data: Map<string, AgentMemoryEntry[]>;
} {
  const data = new Map<string, AgentMemoryEntry[]>();
  return {
    data,
    read: async (key) => data.get(key) ?? [],
    append: async (key, entry) => {
      const list = data.get(key) ?? [];
      list.push(entry);
      data.set(key, list);
    },
  };
}

// A store whose every method rejects — to prove a generation survives a broken
// lessons store (record + recall both soft-fail).
const throwingLessonsStore: AgentMemoryStore = {
  read: async () => {
    throw new Error("brain read exploded");
  },
  append: async () => {
    throw new Error("brain append exploded");
  },
};

const PRIOR_LESSON: GeneratorLesson = {
  pattern: "sentence says 'after a booking' but trigger is inbound",
  mistake: "wired an inbound trigger",
  correction: "use trigger.event = booking.completed",
};

describe("runGenerateAgentDraft — L5.3 recall: priorLessons threaded into classify + judge", () => {
  test("a prior lesson is rendered + passed into BOTH the classifier and the judge", async () => {
    const store = await seededStore([PRIOR_LESSON]);

    // Capturing fakes: record the priorLessons string each one receives.
    let classifySawLessons: string | undefined;
    const classify: GenerateDeps["classify"] = async (_sentence, priorLessons) => {
      classifySawLessons = priorLessons;
      return {};
    };
    let judgeSawLessons: string | undefined;
    const judge: GenerateDeps["judge"] = async ({ priorLessons }) => {
      judgeSawLessons = priorLessons;
      return { ok: true, issues: [] };
    };

    const { deps } = makeDeps({ classify, judge });
    const result = await runGenerateAgentDraft(
      { ...deps, lessonsStore: store },
      { sentence: "ask customers for a google review" },
    );

    assert.equal(result.ok, true);
    // Both saw a NON-EMPTY hint carrying the recalled correction.
    assert.ok(classifySawLessons, "classifier received a priorLessons string");
    assert.ok(
      classifySawLessons!.includes(PRIOR_LESSON.correction),
      `classifier hint missing the correction, got: ${classifySawLessons}`,
    );
    assert.ok(judgeSawLessons, "judge received a priorLessons string");
    assert.ok(
      judgeSawLessons!.includes(PRIOR_LESSON.correction),
      `judge hint missing the correction, got: ${judgeSawLessons}`,
    );
  });

  test("no lessonsStore → classify/judge see an empty hint (today's behavior)", async () => {
    let classifySawLessons: string | undefined;
    const classify: GenerateDeps["classify"] = async (_s, priorLessons) => {
      classifySawLessons = priorLessons;
      return {};
    };
    let judgeSawLessons: string | undefined;
    const judge: GenerateDeps["judge"] = async ({ priorLessons }) => {
      judgeSawLessons = priorLessons;
      return { ok: true, issues: [] };
    };
    const { deps } = makeDeps({ classify, judge }); // no lessonsStore

    const result = await runGenerateAgentDraft(deps, {
      sentence: "ask customers for a google review",
    });

    assert.equal(result.ok, true);
    // "" — an empty hint leaves the prompts byte-for-byte unchanged.
    assert.equal(classifySawLessons, "");
    assert.equal(judgeSawLessons, "");
  });

  // P3 T7 — the AUTHOR (not just the classifier/judge) learns from past
  // corrections: run-generate threads the recalled lessons hint into
  // authorAgentDraft, so the primitive-composition author honors a fix we've made
  // before. (authored-agent threads deps.priorLessons → author(sentence, hint);
  // this pins the orchestrator end of that wire with a capturing fake author.)
  test("the recalled priorLessons hint reaches the AUTHOR dep (author-fed lessons)", async () => {
    const store = await seededStore([PRIOR_LESSON]);

    let authorSawSentence: string | undefined;
    let authorSawLessons: string | undefined;
    const author: AgentAuthor = async (sentence, priorLessons) => {
      authorSawSentence = sentence;
      authorSawLessons = priorLessons;
      // Return a valid composed draft so the author path is taken (and to prove
      // the hint reaching the author isn't an artifact of a fallback).
      return IG_POSTER_DRAFT;
    };

    const { deps } = makeDeps({ author });
    const result = await runGenerateAgentDraft(
      { ...deps, lessonsStore: store },
      { sentence: "Post a weekly Instagram highlight of our 5-star reviews" },
    );

    assert.equal(result.ok, true);
    assert.equal(
      authorSawSentence,
      "Post a weekly Instagram highlight of our 5-star reviews",
      "the author receives the operator's sentence",
    );
    assert.ok(authorSawLessons, "the author received a priorLessons string");
    assert.ok(
      authorSawLessons!.includes(PRIOR_LESSON.correction),
      `author hint missing the recalled correction, got: ${authorSawLessons}`,
    );
  });

  test("no lessonsStore → the author sees an empty hint (today's behavior)", async () => {
    let authorSawLessons: string | undefined;
    const author: AgentAuthor = async (_s, priorLessons) => {
      authorSawLessons = priorLessons;
      return IG_POSTER_DRAFT;
    };
    const { deps } = makeDeps({ author }); // no lessonsStore

    const result = await runGenerateAgentDraft(deps, {
      sentence: "Post a weekly Instagram highlight of our 5-star reviews",
    });

    assert.equal(result.ok, true);
    assert.equal(authorSawLessons, "", "an empty hint when there's no store");
  });
});

describe("runGenerateAgentDraft — L5.3 record: an applied judge fix becomes a lesson", () => {
  test("after the judge fixes the trigger, a generator_lesson is recorded to the store", async () => {
    const store = makeFakeLessonsStore();
    const FIX = {
      trigger: { kind: "event", event: "booking.completed", channel: "sms" },
    } as const;
    const judge: GenerateDeps["judge"] = async () => ({
      ok: false,
      issues: [
        {
          field: "trigger",
          problem: "the sentence implies a post-booking event, not an inbound call",
          fix: FIX,
        },
      ],
    });
    const { deps } = makeDeps({ judge });

    const result = await runGenerateAgentDraft(
      { ...deps, lessonsStore: store },
      { sentence: "answer my phone when I miss a call" },
    );

    assert.equal(result.ok, true);
    // The fix was recorded as a lesson under the generator lessons key.
    const recalled = await recallStore(store);
    assert.equal(recalled.length, 1, "exactly one lesson recorded");
    assert.equal(recalled[0]!.mistake, "the sentence implies a post-booking event, not an inbound call");
    // correction is the JSON-stringified fix the judge supplied.
    assert.equal(recalled[0]!.correction, JSON.stringify(FIX));
    // pattern is a feature of the sentence (its lead).
    assert.ok(
      recalled[0]!.pattern.includes("answer my phone"),
      `pattern should key on the sentence, got: ${recalled[0]!.pattern}`,
    );
  });

  test("an un-fixable issue (no fix) records NOTHING", async () => {
    const store = makeFakeLessonsStore();
    const judge: GenerateDeps["judge"] = async () => ({
      ok: false,
      issues: [{ field: "guardrails", problem: "looks empty — review before publishing" }],
    });
    const { deps } = makeDeps({ judge });

    const result = await runGenerateAgentDraft(
      { ...deps, lessonsStore: store },
      { sentence: "ask customers for a google review" },
    );

    assert.equal(result.ok, true);
    const recalled = await recallStore(store);
    assert.equal(recalled.length, 0, "no lesson for an issue without a fix");
  });
});

describe("runGenerateAgentDraft — L5.3 fail-soft: a broken lessons store never blocks", () => {
  test("a throwing lessons store (recall + record) still yields a created agent", async () => {
    // A judge fix would trigger a record; the store throws on both read + write.
    const judge: GenerateDeps["judge"] = async () => ({
      ok: false,
      issues: [
        {
          field: "trigger",
          problem: "wrong trigger",
          fix: { trigger: { kind: "event", event: "booking.completed", channel: "sms" } },
        },
      ],
    });
    const { deps, calls } = makeDeps({ judge });

    let result!: GenerateAgentDraftOutput;
    await assert.doesNotReject(async () => {
      result = await runGenerateAgentDraft(
        { ...deps, lessonsStore: throwingLessonsStore },
        { sentence: "ask customers for a google review" },
      );
    });

    assert.equal(result.ok, true, "a broken lessons store must not block generation");
    assert.equal(calls.create.length, 1, "the template is still created");
  });
});

// Seed a fake store with prior lessons via the REAL recorder (awaited), so the
// recall path under test sees production-shaped entries.
async function seededStore(seed: GeneratorLesson[]): Promise<AgentMemoryStore & {
  data: Map<string, AgentMemoryEntry[]>;
}> {
  const store = makeFakeLessonsStore();
  for (const lesson of seed) {
    await recordGeneratorLesson(store, { orgId: "builder-1", lesson });
  }
  return store;
}

// Read back every recorded generator lesson from a fake store (across all keys),
// decoded from the AgentMemoryEntry payload — so a test asserts on the lessons
// without re-deriving the memory key.
async function recallStore(
  store: AgentMemoryStore & { data: Map<string, AgentMemoryEntry[]> },
): Promise<GeneratorLesson[]> {
  const out: GeneratorLesson[] = [];
  for (const entries of store.data.values()) {
    for (const e of entries) {
      if (e.kind !== "generator_lesson" || !e.data) continue;
      const d = e.data as Record<string, unknown>;
      out.push({
        pattern: String(d.pattern ?? ""),
        mistake: String(d.mistake ?? ""),
        correction: String(d.correction ?? ""),
      });
    }
  }
  return out;
}

// ─── P5.4 — the LIVE capability resolver wired into the orchestrator ──────────
//
// run-generate.ts now (when a `resolveCapabilities` dep is present AND the AUTHOR
// path declared `neededCapabilities`) resolves those plain-English long-tail asks
// to real composio ConnectorBindings, MERGES them onto blueprint.connectors
// (deduped by kind+id), and surfaces every unresolved phrase as an operator
// warning. It is additive + fail-soft: no dep / no neededCapabilities / the
// heuristic path → today's behavior; a throwing resolver → generation still
// succeeds. All with in-memory fakes — NO Composio, NO network.

/** A composio binding the fake resolver returns for a Google-reviews ask — the
 *  exact shape composio-resolver.bindComposioToolkits produces. */
const GOOGLEBUSINESS_BINDING: ConnectorBinding = {
  id: "googlebusiness",
  kind: "composio",
  enabledToolkits: ["googlebusiness"],
  enabledTools: [],
};

/** An author draft that declares BOTH a featured tool (postiz) and a long-tail
 *  capability the menu doesn't cover — so the merged connectors must carry the
 *  postiz vetted binding AND the resolved composio binding. */
const POSTER_WITH_CAPABILITY = {
  name: "Review Spotlight Poster",
  summary: "Posts our best Google reviews to social each week.",
  skillMd:
    "Each Monday, pull this week's best Google review and publish an on-brand highlight to our social channels. Keep it warm and never fabricate a quote.",
  trigger: { kind: "schedule", cron: "0 9 * * 1" },
  channel: "none",
  tools: ["postiz"],
  neededCapabilities: ["read this business's Google reviews"],
} as const;

describe("runGenerateAgentDraft — P5.4 resolve: long-tail capability → composio binding", () => {
  test("a resolved capability binding is merged onto the CREATED blueprint (alongside the tool bindings)", async () => {
    const author: AgentAuthor = async () => POSTER_WITH_CAPABILITY;
    // The fake resolver maps the Google-reviews ask → the googlebusiness binding,
    // nothing unresolved.
    const resolveCapabilities: GenerateDeps["resolveCapabilities"] = async (
      caps,
    ) => {
      assert.deepEqual(
        caps,
        ["read this business's Google reviews"],
        "the author's neededCapabilities are handed to the resolver",
      );
      return {
        bindings: [GOOGLEBUSINESS_BINDING],
        resolved: [
          {
            capability: "read this business's Google reviews",
            slug: "googlebusiness",
            label: "Google Business Profile",
          },
        ],
        unresolved: [],
      };
    };

    const { deps, calls } = makeDeps({ author, resolveCapabilities });
    const result = await runGenerateAgentDraft(deps, {
      sentence: "Post a weekly highlight of our best Google reviews",
    });

    assert.equal(result.ok, true);
    assert.equal(calls.create.length, 1, "create called exactly once");

    const connectors = calls.create[0]!.blueprint.connectors ?? [];
    // the resolved composio binding landed …
    const gb = connectors.find((c) => c.id === "googlebusiness");
    assert.ok(gb, "the resolved googlebusiness composio binding is on the blueprint");
    assert.equal(gb!.kind, "composio");
    // … ALONGSIDE the featured-tool (postiz) binding the composer already wired.
    const postiz = connectors.find((c) => c.id === "postiz");
    assert.ok(postiz, "the authored postiz tool binding is preserved");

    // No unresolved phrases → no capability warning.
    if (result.ok) {
      assert.ok(
        !result.warnings.some((w) => /No integration found yet/i.test(w)),
        `expected no unresolved-capability warning, got: ${JSON.stringify(result.warnings)}`,
      );
    }
  });

  test("a capability the resolver leaves UNRESOLVED surfaces a warning AND the bundle still persists", async () => {
    const author: AgentAuthor = async () => ({
      ...POSTER_WITH_CAPABILITY,
      neededCapabilities: ["consult an astrologer for the daily horoscope"],
    });
    // The resolver finds nothing → empty bindings, the phrase is unresolved.
    const resolveCapabilities: GenerateDeps["resolveCapabilities"] = async (
      caps,
    ) => ({
      bindings: [],
      resolved: [],
      unresolved: caps,
    });

    const { deps, calls } = makeDeps({ author, resolveCapabilities });
    const result = await runGenerateAgentDraft(deps, {
      sentence: "Post a weekly social highlight",
    });

    assert.equal(result.ok, true, "an unresolved capability never blocks generation");
    assert.equal(calls.create.length, 1, "the bundle still persists");
    if (!result.ok) return;
    assert.ok(
      result.warnings.some(
        (w) =>
          /No integration found yet/i.test(w) &&
          w.includes("consult an astrologer for the daily horoscope"),
      ),
      `expected an unresolved-capability warning naming the phrase, got: ${JSON.stringify(result.warnings)}`,
    );
  });

  test("NO resolveCapabilities dep → today's behavior (the authored bundle's connectors are untouched)", async () => {
    const author: AgentAuthor = async () => POSTER_WITH_CAPABILITY;
    const { deps, calls } = makeDeps({ author }); // no resolveCapabilities
    const result = await runGenerateAgentDraft(deps, {
      sentence: "Post a weekly highlight of our best Google reviews",
    });

    assert.equal(result.ok, true);
    const connectors = calls.create[0]!.blueprint.connectors ?? [];
    // Only the authored featured tool (postiz) — no long-tail resolution ran.
    assert.ok(connectors.some((c) => c.id === "postiz"), "postiz tool binding present");
    assert.ok(
      !connectors.some((c) => c.id === "googlebusiness"),
      "no composio binding without a resolver dep",
    );
    if (result.ok) {
      assert.ok(
        !result.warnings.some((w) => /No integration found yet/i.test(w)),
        "no capability warnings without a resolver dep",
      );
    }
  });

  test("the HEURISTIC path (no author) never invokes the resolver, even when one is passed", async () => {
    let resolverCalled = 0;
    const resolveCapabilities: GenerateDeps["resolveCapabilities"] = async () => {
      resolverCalled += 1;
      return { bindings: [], resolved: [], unresolved: [] };
    };
    // No author → the heuristic path (which has no neededCapabilities) runs.
    const { deps, calls } = makeDeps({ resolveCapabilities });
    const result = await runGenerateAgentDraft(deps, {
      sentence: "text my customers for a google review after the job",
    });

    assert.equal(result.ok, true);
    assert.equal(calls.create.length, 1);
    assert.equal(
      resolverCalled,
      0,
      "the resolver is never called on the heuristic (no-neededCapabilities) path",
    );
  });

  test("a resolveCapabilities that THROWS → generation still succeeds (fail-soft), bundle persisted", async () => {
    const author: AgentAuthor = async () => POSTER_WITH_CAPABILITY;
    const resolveCapabilities: GenerateDeps["resolveCapabilities"] = async () => {
      throw new Error("composio catalog down");
    };
    const { deps, calls } = makeDeps({ author, resolveCapabilities });

    let result!: GenerateAgentDraftOutput;
    await assert.doesNotReject(async () => {
      result = await runGenerateAgentDraft(deps, {
        sentence: "Post a weekly highlight of our best Google reviews",
      });
    });

    assert.equal(result.ok, true, "a throwing resolver must not block generation");
    assert.equal(calls.create.length, 1, "the bundle is still persisted");
    // The authored connectors survive (the postiz tool binding); no composio one.
    const connectors = calls.create[0]!.blueprint.connectors ?? [];
    assert.ok(connectors.some((c) => c.id === "postiz"), "authored connectors survive a resolver throw");
  });
});
