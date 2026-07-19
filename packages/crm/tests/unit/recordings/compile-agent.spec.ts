// Task 11 — flow-model → skill-md + bundle + derived eval scenarios.
// Pure, deterministic, no LLM/DB — every function here takes only plain data.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  autonomyForModel,
  deriveEvalScenarios,
  flowModelToBundle,
  flowModelToSkillMd,
  inferDraftKind,
  inferTriggerFromModel,
} from "@/lib/recordings/compile-agent";
import type { CoverageEntry, FlowModel, WorkflowStep, WorkflowTrace } from "@/lib/recordings/trace-schema";
import { defaultToolsForToolkits } from "@/lib/integrations/composio/catalog";

function step(index: number, overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    index,
    app: overrides.app ?? "gmail",
    action: overrides.action ?? `send email ${index}`,
    intent: overrides.intent ?? `notify the customer about step ${index}`,
    dataIn: overrides.dataIn ?? [`customer email ${index}`],
    dataOut: overrides.dataOut ?? [`sent confirmation ${index}`],
    checks: overrides.checks ?? [`verify address is correct for step ${index}`],
    ...(overrides.decision !== undefined ? { decision: overrides.decision } : {}),
  };
}

function baseTrace(overrides: Partial<WorkflowTrace> = {}): WorkflowTrace {
  const steps = overrides.steps ?? [step(0), step(1, { app: "QuickBooks Desktop", action: "log payment 1" })];
  return {
    title: overrides.title ?? "Handle a new customer",
    goal: overrides.goal ?? "onboard a new customer end to end",
    apps: overrides.apps ?? Array.from(new Set(steps.map((s) => s.app))),
    steps,
    variables: overrides.variables ?? [],
    constants: overrides.constants ?? [],
    branches: overrides.branches ?? [{ condition: "customer has no email", behavior: "ask for one before continuing" }],
    openQuestions: overrides.openQuestions ?? [],
  };
}

function baseModel(overrides: Partial<FlowModel> = {}): FlowModel {
  const trace = baseTrace(overrides);
  const coverage: CoverageEntry[] =
    overrides.coverage ??
    trace.steps.map((s) =>
      s.app === "QuickBooks Desktop"
        ? { stepIndex: s.index, tier: "red", reason: "no tool binding — stays with the human" }
        : { stepIndex: s.index, tier: "green", toolkit: "gmail", reason: "matched gmail" },
    );
  return {
    ...trace,
    recordingsSeen: overrides.recordingsSeen ?? 1,
    coverage,
  };
}

/** A 40-step model with a LARGE branches list — big enough that the full
 *  render (steps + rules + may-not-do + branches + eval scenarios) blows
 *  past the 8000-char cap, but the steps/rules/may-not-do section ALONE
 *  ("required") stays under it. This exercises the truncation-priority
 *  rule (eval scenarios drop first, then branches — steps are NEVER
 *  dropped) without hitting the last-resort hard-truncate path, which
 *  would otherwise cut off a step. */
function bigModel(): FlowModel {
  const steps: WorkflowStep[] = Array.from({ length: 40 }, (_, i) =>
    step(i, {
      app: i % 5 === 0 ? "QuickBooks Desktop" : "gmail",
      action: `do thing ${i}`,
      intent: `help the customer ${i}`,
      dataIn: [`field-${i}`],
      dataOut: [`out-${i}`],
      checks: [`check amt ${i}`, `check name ${i}`],
    }),
  );
  const branches = Array.from({ length: 60 }, (_, i) => ({
    condition: `edge case number ${i} happens when the customer does something unusual and needs a longer description to matter`,
    behavior: `handle it by escalating to a human reviewer for edge case ${i} with enough detail to pad the section out`,
  }));
  return baseModel({ steps, apps: Array.from(new Set(steps.map((s) => s.app))), branches });
}

// ── flowModelToSkillMd ───────────────────────────────────────────────────────

describe("flowModelToSkillMd", () => {
  test("contains all required sections for a normal model", () => {
    const md = flowModelToSkillMd(baseModel());
    assert.match(md, /^# Handle a new customer/);
    assert.match(md, /## The workflow/);
    assert.match(md, /## Rules/);
    assert.match(md, /## Branches \/ edge cases/);
    assert.match(md, /## What you may NOT do/);
    assert.match(md, /## Eval scenarios/);
  });

  test("red/yellow steps show up under 'What you may NOT do' — never silently dropped", () => {
    const md = flowModelToSkillMd(baseModel());
    const section = md.split("## What you may NOT do")[1] ?? "";
    assert.match(section, /log payment 1/);
  });

  test("stays within the 8000-char customSkillMd cap for a large (40-step) model", () => {
    const md = flowModelToSkillMd(bigModel());
    assert.ok(md.length <= 8000, `expected <= 8000 chars, got ${md.length}`);
  });

  test("truncation drops eval scenarios first — never drops a step", () => {
    const model = bigModel();
    const md = flowModelToSkillMd(model);
    // Every step index must still appear in the workflow section (steps are
    // NEVER dropped, per the plan's truncation priority).
    const workflowSection = md.split("## The workflow")[1]?.split("## Rules")[0] ?? "";
    for (const s of model.steps) {
      assert.match(
        workflowSection,
        new RegExp(`\\b${s.index}\\.`),
        `expected step ${s.index} to survive truncation`,
      );
    }
    // The eval-scenarios section is the lowest priority — it should be the
    // one that got dropped (or shrunk to nothing) to make room.
    assert.ok(!md.includes("## Eval scenarios") || md.length <= 8000);
  });
});

// ── deriveEvalScenarios ──────────────────────────────────────────────────────

describe("deriveEvalScenarios", () => {
  test("one scenario per recording", () => {
    const recordings = [
      { label: "Happy path", trace: baseTrace() },
      { label: null, trace: baseTrace({ title: "Edge case: no email" }) },
    ];
    const scenarios = deriveEvalScenarios(recordings);
    assert.equal(scenarios.length, 2);
    assert.equal(scenarios[0].title, "Happy path");
    assert.equal(scenarios[1].title, "Edge case: no email");
  });

  test("caps successCriteria/mustDo/mustNotDo at 6 each", () => {
    const manySteps = Array.from({ length: 10 }, (_, i) =>
      step(i, { checks: [`check-a-${i}`, `check-b-${i}`], app: "gmail" }),
    );
    const trace = baseTrace({ steps: manySteps, apps: ["gmail"] });
    const [scenario] = deriveEvalScenarios([{ label: "Big", trace }]);
    assert.ok(scenario.successCriteria.length <= 6);
    assert.ok(scenario.mustDo.length <= 6);
    assert.ok(scenario.mustNotDo.length <= 6);
  });

  test("is deterministic — same input yields the same output", () => {
    const recordings = [{ label: "Happy path", trace: baseTrace() }];
    const a = deriveEvalScenarios(recordings);
    const b = deriveEvalScenarios(recordings);
    assert.deepEqual(a, b);
  });

  test("mustNotDo always carries the two fixed guardrail lines", () => {
    const [scenario] = deriveEvalScenarios([{ label: "Happy path", trace: baseTrace() }]);
    assert.ok(scenario.mustNotDo.includes("invent data not present in the workflow"));
    assert.ok(scenario.mustNotDo.includes("skip a required check"));
  });
});

// ── flowModelToBundle ────────────────────────────────────────────────────────

describe("flowModelToBundle", () => {
  test("overrides customSkillMd, surfaces the green toolkit in connectors, warns on red steps", () => {
    const model = baseModel();
    const { bundle, scenarios, warnings } = flowModelToBundle({
      model,
      recordings: [{ label: "Happy path", trace: baseTrace() }],
    });

    assert.equal(bundle.blueprint.customSkillMd, flowModelToSkillMd(model));
    assert.ok(bundle.blueprint.connectors?.some((c) => c.kind === "composio" ? c.enabledToolkits.includes("gmail") : c.id === "gmail"));
    assert.equal(scenarios.length, 1);
    assert.ok(warnings.some((w) => /log payment 1/.test(w)));
  });

  // T1 (2026-07-11 incident follow-up: DB row 32a12952-c2ec-468b-8636-
  // 3aa5fd76ae7d, a supervised run whose only bound tool resolved to an
  // empty allowlist, so it had zero real tools no matter what). A compiled
  // agent gets no later discovery/picker step to fill `enabledTools` in —
  // this binding IS its resting run state — so bindingForToolkit must seed
  // the toolkit's curated default tools, never [].
  test("a green-coverage composio toolkit compiles to a binding seeded with its curated default tools, never an empty allowlist", () => {
    const model = baseModel();
    const { bundle } = flowModelToBundle({
      model,
      recordings: [{ label: "Happy path", trace: baseTrace() }],
    });
    const gmail = bundle.blueprint.connectors?.find(
      (c) => c.kind === "composio" && c.enabledToolkits.includes("gmail"),
    );
    assert.ok(gmail && gmail.kind === "composio");
    assert.deepEqual(
      (gmail as { enabledTools: string[] }).enabledTools,
      defaultToolsForToolkits(["gmail"]),
    );
    assert.notDeepEqual((gmail as { enabledTools: string[] }).enabledTools, []);
  });

  test("a green-coverage postiz (vetted) step is unchanged — still an empty allowlist (no toolkit-default catalog for vetted connectors)", () => {
    const model = baseModel({
      coverage: [
        { stepIndex: 0, tier: "green", toolkit: "postiz", reason: "matches postiz post" },
        { stepIndex: 1, tier: "red", reason: "no tool binding" },
      ],
    });
    const { bundle } = flowModelToBundle({
      model,
      recordings: [{ label: "Happy path", trace: baseTrace() }],
    });
    const postiz = bundle.blueprint.connectors?.find((c) => c.kind === "vetted" && c.id === "postiz");
    assert.ok(postiz);
    assert.deepEqual((postiz as { enabledTools: string[] }).enabledTools, []);
  });

  test("identity comes from the flow model, not the starter it fell through to", () => {
    // "Forward SeldonFrame Weekly Emails to Personal Gmail" matches no
    // parse-intent keyword, so heuristicIntent falls through to the
    // receptionist starter — whose name/description must NOT win.
    const model = baseModel({
      title: "Forward SeldonFrame Weekly Emails to Personal Gmail",
      goal: "Forward SeldonFrame Weekly Emails to Personal Gmail",
    });
    const { bundle } = flowModelToBundle({
      model,
      recordings: [{ label: "Happy path", trace: baseTrace() }],
    });

    assert.equal(bundle.name, model.title);
    assert.notEqual(bundle.name, "AI Phone Receptionist");
    assert.equal(bundle.description, model.goal);
  });

  const BOOKING_CAPABILITIES = [
    "look_up_availability",
    "book_appointment",
    "find_my_existing_appointment",
    "reschedule_appointment",
    "cancel_appointment",
    "take_message",
    "get_quote_range",
  ];

  test("Gmail-forwarding recording compiles an inbound-email trigger, not the receptionist starter's inbound voice/chat + booking tools", () => {
    const model = baseModel({
      title: "Forward SeldonFrame Weekly Emails to Personal Gmail",
      goal: "Forward SeldonFrame Weekly Emails to Personal Gmail",
      steps: [
        step(0, { app: "gmail", action: "forward matching email to personal gmail" }),
      ],
      apps: ["gmail"],
    });
    const { bundle } = flowModelToBundle({
      model,
      recordings: [{ label: "Happy path", trace: baseTrace() }],
    });

    assert.deepEqual(bundle.blueprint.trigger, { kind: "inbound", channel: "email" });
    assert.match(bundle.blueprint.greeting ?? "", new RegExp(model.title));
    assert.doesNotMatch(bundle.blueprint.greeting ?? "", /calling/i);
    assert.deepEqual(bundle.blueprint.faq, []);
    for (const cap of BOOKING_CAPABILITIES) {
      assert.ok(
        !bundle.blueprint.capabilities?.includes(cap),
        `expected capabilities to NOT include starter booking tool "${cap}"`,
      );
    }
    assert.ok(bundle.blueprint.capabilities?.includes("escalate_to_human"));
    assert.equal(bundle.blueprint.quoteRanges, undefined);
    assert.equal(bundle.blueprint.pricingFacts, undefined);
    assert.equal(bundle.blueprint.missedCallTextBack, undefined);
    assert.equal(bundle.blueprint.reviewUrl, undefined);
  });

  test("a schedule-flavored recording compiles a daily schedule trigger", () => {
    const model = baseModel({
      title: "Daily sales recap",
      goal: "Post a daily recap of yesterday's sales every morning",
      steps: [step(0, { app: "slack", action: "post the recap" })],
      apps: ["slack"],
    });
    const { bundle } = flowModelToBundle({
      model,
      recordings: [{ label: "Happy path", trace: baseTrace() }],
    });
    assert.deepEqual(bundle.blueprint.trigger, {
      kind: "schedule",
      cron: "0 9 * * *",
      channel: "email",
    });
  });
});

describe("inferTriggerFromModel", () => {
  test("gmail/outlook/email mentioned anywhere -> inbound email", () => {
    const model = baseModel({
      goal: "Forward matching Outlook emails",
      steps: [step(0, { app: "outlook", action: "forward the email" })],
    });
    assert.deepEqual(inferTriggerFromModel(model), { kind: "inbound", channel: "email" });
  });

  test("recurring-cadence wording -> schedule trigger, 9am daily, email channel", () => {
    const model = baseModel({
      goal: "Post a weekly summary",
      steps: [step(0, { app: "slack", action: "post the summary" })],
    });
    assert.deepEqual(inferTriggerFromModel(model), {
      kind: "schedule",
      cron: "0 9 * * *",
      channel: "email",
    });
  });

  test("sms/text-message wording -> inbound sms", () => {
    const model = baseModel({
      goal: "Reply to text messages from customers",
      steps: [step(0, { app: "twilio", action: "send an sms reply" })],
    });
    assert.deepEqual(inferTriggerFromModel(model), { kind: "inbound", channel: "sms" });
  });

  test("no matching keywords -> inbound chat (the safe default)", () => {
    const model = baseModel({
      goal: "Log a new customer into QuickBooks",
      steps: [step(0, { app: "QuickBooks Desktop", action: "create the customer record" })],
    });
    assert.deepEqual(inferTriggerFromModel(model), { kind: "inbound", channel: "chat" });
  });

  // ── inbox-watch refinement (agent lifecycle slice) ────────────────────────
  // An email app + watch-semantics ("check my inbox", "watch for new email")
  // is a recurring cadence the operator can't self-serve as an inbound-email
  // trigger (no email surface wired for a from-recording template) — it
  // should compile to an hourly schedule instead, checked BEFORE the plain
  // email-inbound branch.

  test("gmail-forwarding-style corpus ('check my inbox ... forward ...') -> hourly schedule, not inbound email", () => {
    const model = baseModel({
      goal: "Check my Gmail inbox every hour and forward matching emails",
      steps: [step(0, { app: "gmail", action: "check inbox for matching emails" })],
    });
    assert.deepEqual(inferTriggerFromModel(model), {
      kind: "schedule",
      cron: "0 * * * *",
      channel: "email",
    });
  });

  test("plain 'reply to emails' support flow (no watch-semantics) -> still inbound email", () => {
    const model = baseModel({
      goal: "Reply to customer emails in Gmail with the order status",
      steps: [step(0, { app: "gmail", action: "reply with order status" })],
    });
    assert.deepEqual(inferTriggerFromModel(model), { kind: "inbound", channel: "email" });
  });

  // Wave 1 review, F5: bare "check" over-matched INBOX_WATCH_KEYWORDS — a
  // one-off "check the customer's email and reply" flow (no recurring
  // cadence at all) was misclassified as an hourly inbox-watch schedule
  // instead of the inbound-email default. Only PHRASE-level "check ..."
  // entries should trip the watch-semantics branch.

  test("'check the customer's email and reply' (email-reply flow, bare 'check' + 'reply') -> still inbound email, NOT a schedule", () => {
    const model = baseModel({
      goal: "Check the customer's email and reply with the order status",
      steps: [step(0, { app: "gmail", action: "check the customer's email and reply" })],
    });
    assert.deepEqual(inferTriggerFromModel(model), { kind: "inbound", channel: "email" });
  });

  test("'monitor the inbox for new orders' -> hourly schedule", () => {
    const model = baseModel({
      goal: "Monitor the inbox for new orders and log them",
      steps: [step(0, { app: "outlook", action: "monitor for new orders" })],
    });
    assert.deepEqual(inferTriggerFromModel(model), {
      kind: "schedule",
      cron: "0 * * * *",
      channel: "email",
    });
  });

  test("no email app at all + 'every morning' wording -> still the existing daily 9am schedule branch, not inbox-watch", () => {
    const model = baseModel({
      goal: "Post a daily recap every morning",
      steps: [step(0, { app: "slack", action: "post the recap" })],
    });
    assert.deepEqual(inferTriggerFromModel(model), {
      kind: "schedule",
      cron: "0 9 * * *",
      channel: "email",
    });
  });
});

// ── never-fail-compile: autonomy + draft approvals ──────────────────────────
// 2 green, 1 yellow, 1 red — steps: "Open the job in Jobber"(green), "Look up
// availability"(green), "Post the update"(yellow), "Enter the job record" in
// "QuickBooks Desktop"(red).
function mixedCoverageModel() {
  const steps = [
    step(0, { app: "Jobber", action: "Open the job in Jobber" }),
    step(1, { app: "Jobber", action: "Look up availability" }),
    step(2, { app: "Slack", action: "Post the update" }),
    step(3, { app: "QuickBooks Desktop", action: "Enter the job record" }),
  ];
  return baseModel({
    steps,
    apps: ["Jobber", "Slack", "QuickBooks Desktop"],
    coverage: [
      { stepIndex: 0, tier: "green", toolkit: "jobber", reason: "matched jobber" },
      { stepIndex: 1, tier: "green", toolkit: "jobber", reason: "matched jobber" },
      { stepIndex: 2, tier: "yellow", reason: "likely API-doable — needs approval gate" },
      { stepIndex: 3, tier: "red", reason: "no tool binding — stays with the human" },
    ],
  });
}

describe("autonomyForModel", () => {
  test("mixed coverage counts and pct", () => {
    const model = mixedCoverageModel();
    const a = autonomyForModel(model);
    assert.deepEqual(a, { green: 2, yellow: 1, red: 1, total: 4, autonomousPct: 50 });
  });
  test("missing coverage entries count as red", () => {
    const model = { ...mixedCoverageModel(), coverage: [] };
    const a = autonomyForModel(model);
    assert.equal(a.green, 0);
    assert.equal(a.red, a.total);
    assert.equal(a.autonomousPct, 0);
  });
});

describe("flowModelToSkillMd — draft approvals flag", () => {
  test("flag OFF: output byte-identical to the un-optioned call", () => {
    const model = mixedCoverageModel();
    assert.equal(flowModelToSkillMd(model), flowModelToSkillMd(model, { draftApprovals: false }));
  });
  test("flag ON: red/yellow steps render in 'What you draft for approval' with kind + done-only-when-approved", () => {
    const md = flowModelToSkillMd(mixedCoverageModel(), { draftApprovals: true });
    assert.ok(md.includes("## What you draft for approval"));
    assert.ok(md.includes("draft_for_approval"));
    assert.ok(md.includes("DONE only when a human approves"));
  });
  test("flag ON: may-NOT-do keeps the filing≠doing floor", () => {
    const md = flowModelToSkillMd(mixedCoverageModel(), { draftApprovals: true });
    assert.ok(md.includes("## What you may NOT do"));
    assert.ok(md.includes("Never execute or claim to have executed a drafted step"));
  });
});

describe("flowModelToBundle — draft approvals flag", () => {
  test("flag ON grants the capability; flag OFF does not", () => {
    const recordings = [{ label: null, trace: baseTrace() }];
    const on = flowModelToBundle({ model: mixedCoverageModel(), recordings, draftApprovals: true });
    const off = flowModelToBundle({ model: mixedCoverageModel(), recordings });
    assert.ok(on.bundle.blueprint.capabilities?.includes("draft_for_approval"));
    assert.equal(off.bundle.blueprint.capabilities?.includes("draft_for_approval"), false);
  });
  test("flag ON persists the autonomy score on the blueprint", () => {
    const on = flowModelToBundle({ model: mixedCoverageModel(), recordings: [], draftApprovals: true });
    assert.equal(on.bundle.blueprint.autonomy?.total, 4);
  });
  test("flag OFF: bundle deep-equal to today's output (byte-parity regression)", () => {
    const recordings = [{ label: null, trace: baseTrace() }];
    const a = flowModelToBundle({ model: mixedCoverageModel(), recordings });
    const b = flowModelToBundle({ model: mixedCoverageModel(), recordings, draftApprovals: false });
    assert.deepEqual(a, b);
  });
});

describe("deriveEvalScenarios — draft approvals flag", () => {
  test("flag ON: red step yields mustDo file-a-draft + mustNotDo claim-executed", () => {
    const scenarios = deriveEvalScenarios([{ label: null, trace: baseTrace() }], { draftApprovals: true });
    const s = scenarios[0]!;
    assert.ok(s.mustDo.some((l) => l.startsWith("file a draft for:")));
    assert.ok(s.mustNotDo.some((l) => l.startsWith("claim executed:")));
  });
  test("flag OFF: legacy 'attempt:' shape preserved", () => {
    const scenarios = deriveEvalScenarios([{ label: null, trace: baseTrace() }]);
    assert.ok(scenarios[0]!.mustNotDo.some((l) => l.startsWith("attempt:")));
  });
});

describe("inferDraftKind", () => {
  test("maps by keywords with 'other' fallback", () => {
    assert.equal(inferDraftKind(step(0, { app: "Gmail", action: "Send the follow-up email" })), "email");
    assert.equal(inferDraftKind(step(0, { action: "Send the invoice" })), "invoice");
    assert.equal(inferDraftKind(step(0, { app: "Twilio", action: "Text the customer" })), "message");
    assert.equal(inferDraftKind(step(0, { app: "QuickBooks Desktop", action: "Enter the job record" })), "data_entry");
    assert.equal(inferDraftKind(step(0, { app: "Camera", action: "Review the photos" })), "other");
  });
});
