// Record-to-agent — Task 11: flow-model → skill-md + bundle + derived eval
// scenarios. Pure, deterministic, NO LLM and NO I/O — every function here
// takes only plain data (a FlowModel + the recordings' traces) and returns
// plain data. This is the last hop before the compile-agent ROUTE (Task 12)
// persists an agent_templates row.
//
// L-15 does NOT apply here — the truncation/section rules below govern
// `customSkillMd` (a per-agent prompt override, db/schema/agents.ts:67, hard
// capped at 8000 chars), not a marketplace BLOCK.md.

import { heuristicIntent } from "@/lib/agents/generate/parse-intent";
import { assembleAgentBundle, type AgentBundle } from "@/lib/agents/generate/agent-bundle";
import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";
import type { AgentTrigger } from "@/lib/agents/triggers/agent-trigger";
import type { EvalScenario } from "@/lib/agents/evals/eval-types";
import { coverFlowModel } from "@/lib/recordings/coverage";
import type { CoverageEntry, CoverageTier, FlowModel, WorkflowStep, WorkflowTrace } from "@/lib/recordings/trace-schema";

const CUSTOM_SKILL_MD_MAX_CHARS = 8000;
const SCENARIO_ARRAY_CAP = 6;

// ─── flowModelToSkillMd ──────────────────────────────────────────────────────

function tierForStep(coverage: CoverageEntry[], stepIndex: number): CoverageTier {
  return coverage.find((c) => c.stepIndex === stepIndex)?.tier ?? "red";
}

function workflowSection(model: FlowModel): string {
  const lines = model.steps.map((step) => {
    const checks = step.checks.length > 0 ? ` (checks: ${step.checks.join("; ")})` : "";
    return `${step.index}. [${step.app}] ${step.action} — ${step.intent}${checks}`;
  });
  return `## The workflow\n${lines.join("\n")}`;
}

function rulesSection(model: FlowModel): string {
  const lines: string[] = [];
  for (const constant of model.constants) {
    lines.push(`- ${constant} — always verify before acting.`);
  }
  if (lines.length === 0) {
    lines.push("- Always verify before acting; never invent a value not present in the workflow.");
  }
  return `## Rules\n${lines.join("\n")}`;
}

function branchesSection(model: FlowModel): string {
  if (model.branches.length === 0) return "";
  const lines = model.branches.map((b) => `- If ${b.condition}: ${b.behavior}`);
  return `## Branches / edge cases\n${lines.join("\n")}`;
}

function mayNotDoSection(model: FlowModel): string {
  const lines: string[] = [];
  for (const step of model.steps) {
    const tier = tierForStep(model.coverage, step.index);
    if (tier === "green") continue;
    lines.push(`- ${tier === "red" ? "Hand off to the human" : "Needs human approval first"}: ${step.action}`);
  }
  if (lines.length === 0) {
    lines.push("- Nothing — every step is bound to a tool.");
  }
  return `## What you may NOT do\n${lines.join("\n")}`;
}

function evalScenariosSection(scenarios: EvalScenario[]): string {
  if (scenarios.length === 0) return "";
  const lines = scenarios.map(
    (s) => `- ${s.title}: ${s.opening} Success: ${s.successCriteria.join("; ")}`,
  );
  return `## Eval scenarios\n${lines.join("\n")}`;
}

/**
 * Render a FlowModel into an agent's `customSkillMd`. Sections, in order:
 * title+goal, the workflow (numbered steps, checks inline), rules
 * (constants), branches/edge cases, what-you-may-NOT-do (red/yellow steps —
 * NEVER silently dropped), eval scenarios (derived, informational).
 *
 * Hard-capped at CUSTOM_SKILL_MD_MAX_CHARS. If the full render is too long,
 * sections are dropped LOWEST-priority first: eval scenarios, then branches/
 * edge cases. The workflow (every step) and the may-NOT-do section are NEVER
 * dropped — silently losing a step or a safety boundary is exactly the
 * Optimistic Path failure mode this module must not commit.
 */
export function flowModelToSkillMd(model: FlowModel): string {
  const scenarios = deriveEvalScenarios(
    // The recap-time skill-md doesn't have per-recording traces separated
    // out — derive one scenario from the merged model itself so the section
    // is non-empty and consistent with deriveEvalScenarios' own shape.
    [{ label: model.title, trace: model }],
  );

  const header = `# ${model.title}\n${model.goal}`;
  const workflow = workflowSection(model);
  const rules = rulesSection(model);
  const branches = branchesSection(model);
  const mayNotDo = mayNotDoSection(model);
  const evalSection = evalScenariosSection(scenarios);

  const required = [header, workflow, rules, mayNotDo].filter(Boolean).join("\n\n");

  // Try: everything, then drop eval scenarios, then drop branches too.
  const withEval = [required, branches, evalSection].filter(Boolean).join("\n\n");
  if (withEval.length <= CUSTOM_SKILL_MD_MAX_CHARS) return withEval;

  const withoutEval = [required, branches].filter(Boolean).join("\n\n");
  if (withoutEval.length <= CUSTOM_SKILL_MD_MAX_CHARS) return withoutEval;

  if (required.length <= CUSTOM_SKILL_MD_MAX_CHARS) return required;

  // Last resort: the required sections themselves overflow the cap (an
  // extreme number of steps) — hard-truncate. This never happens for any
  // realistic recording count, but never throw/silently omit either.
  return required.slice(0, CUSTOM_SKILL_MD_MAX_CHARS);
}

// ─── deriveEvalScenarios ─────────────────────────────────────────────────────

function firstStepOpeningLine(steps: WorkflowStep[]): string {
  const first = steps[0];
  if (!first) return "You're about to start the workflow.";
  const context = first.dataIn.length > 0 ? first.dataIn.join(", ") : first.intent;
  return `You've just received: ${context}.`;
}

function finalStepDataOut(steps: WorkflowStep[]): string[] {
  const last = steps[steps.length - 1];
  return last ? last.dataOut : [];
}

/**
 * Derive one EvalScenario per recording — deterministic, no LLM. Each
 * recording's trace is scored with the SAME per-step tool-coverage logic
 * `coverFlowModel` uses (wrapped as a throwaway single-recording FlowModel),
 * so `mustDo` (green-step actions) and the red-step lines under `mustNotDo`
 * come from the real coverage rules, not a re-implementation of them.
 */
export function deriveEvalScenarios(
  recordings: Array<{ label: string | null; trace: WorkflowTrace }>,
): EvalScenario[] {
  return recordings.map((recording, index) => {
    const { trace } = recording;
    const coverage = coverFlowModel({ ...trace, recordingsSeen: 1, coverage: [] });

    const successCriteria = [
      ...trace.steps.flatMap((s) => s.checks),
      ...finalStepDataOut(trace.steps),
    ].slice(0, SCENARIO_ARRAY_CAP);

    const mustDo = trace.steps
      .filter((s) => tierForStep(coverage, s.index) === "green")
      .map((s) => s.action)
      .slice(0, SCENARIO_ARRAY_CAP);

    const mustNotDo = [
      "invent data not present in the workflow",
      "skip a required check",
      ...trace.steps
        .filter((s) => tierForStep(coverage, s.index) === "red")
        .map((s) => `attempt: ${s.action}`),
    ].slice(0, SCENARIO_ARRAY_CAP);

    const scenario: EvalScenario = {
      id: `rec-${index}`,
      title: recording.label ?? trace.title,
      persona: `a customer/counterparty in: ${trace.goal}`,
      opening: firstStepOpeningLine(trace.steps),
      successCriteria,
      mustDo,
      mustNotDo,
    };
    return scenario;
  });
}

// ─── inferTriggerFromModel ───────────────────────────────────────────────────

/** All the text worth scanning for a workflow-shape signal: the goal plus
 *  every step's app/action/intent, lowercased and joined. Kept as one string
 *  so the keyword checks below are simple `.includes()` calls. */
function modelTextCorpus(model: FlowModel): string {
  const stepText = model.steps
    .map((step) => `${step.app} ${step.action} ${step.intent}`)
    .join(" ");
  return `${model.goal} ${model.apps.join(" ")} ${stepText}`.toLowerCase();
}

/**
 * Infer what should FIRE a from-recording agent, from the recorded workflow
 * itself — a compiled recording is never the receptionist starter's inbound
 * voice/chat default (Task: "compiled blueprint carries only flow-relevant
 * primitives"). Pure heuristic, checked in this order (first match wins):
 *   1. an email app (gmail/outlook) is named anywhere → inbound email (the
 *      recording IS the operator's inbox workflow);
 *   2. the goal/steps talk about a recurring cadence (schedule/daily/weekly/
 *      every morning) → a daily 9am schedule, email channel (the operator
 *      gets the run's output by email — no one to reply to inline);
 *   3. the goal/steps mention SMS/text message → inbound sms;
 *   4. otherwise → inbound chat (the safe default — a copilot-style agent
 *      the operator can talk to inline, same shape the compile-agent route
 *      already exposes at /studio/agents/:id).
 * Never throws; always returns a valid AgentTrigger.
 */
export function inferTriggerFromModel(model: FlowModel): AgentTrigger {
  const corpus = modelTextCorpus(model);

  if (corpus.includes("gmail") || corpus.includes("outlook") || corpus.includes("email")) {
    return { kind: "inbound", channel: "email" };
  }

  if (
    corpus.includes("schedule") ||
    corpus.includes("daily") ||
    corpus.includes("weekly") ||
    corpus.includes("every morning")
  ) {
    return { kind: "schedule", cron: "0 9 * * *", channel: "email" };
  }

  if (corpus.includes("sms") || corpus.includes("text message")) {
    return { kind: "inbound", channel: "sms" };
  }

  return { kind: "inbound", channel: "chat" };
}

// ─── from-recording capability filter ───────────────────────────────────────

/** Always kept regardless of the recorded workflow — every compiled agent
 *  needs a safe exit to a human. */
const ALWAYS_KEPT_CAPABILITY = "escalate_to_human";

/**
 * Strip the starter's booking-receptionist tools (look_up_availability,
 * book_appointment, take_message, get_quote_range, ...) from a from-recording
 * agent's capabilities — they're receptionist-starter noise, not something
 * the recorded workflow asked for. Keeps `escalate_to_human` unconditionally,
 * plus any capability whose name appears (case-insensitive substring) in some
 * step's app or action text — i.e. a capability the recording itself implies.
 */
function filterCapabilitiesForModel(caps: string[] | undefined, model: FlowModel): string[] {
  const stepHaystacks = model.steps.map((step) => `${step.app} ${step.action}`.toLowerCase());
  const kept = new Set<string>([ALWAYS_KEPT_CAPABILITY]);
  for (const cap of caps ?? []) {
    const needle = cap.toLowerCase();
    if (stepHaystacks.some((haystack) => haystack.includes(needle))) {
      kept.add(cap);
    }
  }
  return Array.from(kept);
}

// ─── flowModelToBundle ───────────────────────────────────────────────────────

/**
 * Turn a coverage entry's `toolkit` into a valid ConnectorBinding. Unlike
 * `bindingForEntry` (lib/agents/generate/bind-tools.ts:64, not exported),
 * this operates on the coverage tier's ALREADY-RESOLVED toolkit string
 * (coverage.ts sets it to `match.toolkitSlug ?? match.id` — i.e. it's
 * already the final slug/id a binding needs), so no catalog lookup is
 * needed: "postiz" is the one vetted id in the catalog, everything else is
 * a Composio toolkit slug. Mirrors bindingForEntry's two shapes exactly.
 */
function bindingForToolkit(toolkit: string): ConnectorBinding {
  if (toolkit === "postiz") {
    return { id: "postiz", kind: "vetted", serviceName: "postiz", enabledTools: [] };
  }
  return { id: toolkit, kind: "composio", enabledToolkits: [toolkit], enabledTools: [] };
}

function dedupeConnectors(connectors: ConnectorBinding[]): ConnectorBinding[] {
  const out: ConnectorBinding[] = [];
  const seen = new Set<string>();
  for (const c of connectors) {
    const key = `${c.kind}:${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Assemble the final AgentBundle from a merged FlowModel + its recordings:
 *   1. classify `model.goal` with the pure heuristic (no LLM — this whole
 *      module stays deterministic) → assembleAgentBundle for a SAFE base
 *      blueprint (trigger + verify + guardrails already wired);
 *   2. override `customSkillMd` with the flow-model-rendered skill-md;
 *   3. union the green-coverage toolkits onto `blueprint.connectors`;
 *   4. derive eval scenarios (one per recording) and one warning per red step.
 */
export function flowModelToBundle(params: {
  model: FlowModel;
  recordings: Array<{ label: string | null; trace: WorkflowTrace }>;
}): { bundle: AgentBundle; scenarios: EvalScenario[]; warnings: string[] } {
  const { model, recordings } = params;

  const intent = heuristicIntent(model.goal);
  const bundle = assembleAgentBundle(intent);
  bundle.blueprint.customSkillMd = flowModelToSkillMd(model);
  // The compiled agent's identity is the recorded workflow, never the
  // starter blueprint heuristicIntent fell through to on an unrecognized
  // goal (e.g. "Forward SeldonFrame Weekly Emails to Personal Gmail" — no
  // parse-intent keyword match → the receptionist starter's name/description
  // would otherwise silently win). Archetype/trigger stay starter-derived —
  // out of scope here (trigger inference is a named follow-up).
  bundle.name = model.title;
  bundle.description = model.goal;

  // Trigger/greeting/faq/capabilities/pricing all come from the receptionist
  // starter heuristicIntent fell through to — none of it is relevant to a
  // from-recording workflow agent (see plan Task "from-recording bundles
  // stop inheriting receptionist starter primitives"). Override every one of
  // them with something derived from the recording itself.
  bundle.blueprint.trigger = inferTriggerFromModel(model);
  bundle.blueprint.greeting = `Hi — I'm your "${model.title}" agent. Tell me what you need, or say "run it" to start.`;
  bundle.blueprint.faq = [];
  bundle.blueprint.capabilities = filterCapabilitiesForModel(bundle.blueprint.capabilities, model);
  bundle.blueprint.quoteRanges = undefined;
  bundle.blueprint.pricingFacts = undefined;
  bundle.blueprint.missedCallTextBack = undefined;
  bundle.blueprint.reviewUrl = undefined;

  const greenToolkits = model.coverage
    .filter((c) => c.tier === "green" && c.toolkit)
    .map((c) => c.toolkit as string);
  const bound = greenToolkits.map(bindingForToolkit);
  const mergedConnectors = dedupeConnectors([...(bundle.blueprint.connectors ?? []), ...bound]);
  if (mergedConnectors.length > 0) {
    bundle.blueprint.connectors = mergedConnectors;
  }

  const scenarios = deriveEvalScenarios(recordings);

  const warnings = [...bundle.warnings];
  for (const step of model.steps) {
    if (tierForStep(model.coverage, step.index) === "red") {
      warnings.push(`No tool binding for "${step.action}" (${step.app}) — stays with the human.`);
    }
  }

  return { bundle, scenarios, warnings };
}
