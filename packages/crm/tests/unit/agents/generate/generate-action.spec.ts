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

// ─── a capturing fake of the injected deps ────────────────────────────────────

function makeDeps(over: {
  orgId?: string | null;
  classify?: GenerateDeps["classify"];
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
