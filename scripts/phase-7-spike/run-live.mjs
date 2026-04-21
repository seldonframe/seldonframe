#!/usr/bin/env node
/* eslint-disable no-console */

// Phase 7.a live probe runner. Single command: `node scripts/phase-7-spike/run-live.mjs`.
// No flags. Either it runs the full 7-probe battery against live Claude
// or it fails clean with a specific reason.
//
// Outputs:
// - tasks/phase-7-synthesis-spike/live-run-report.md (human-readable)
// - tasks/phase-7-synthesis-spike/live-run-raw.json (machine-readable)
// - tasks/phase-7-synthesis-spike/live-*.json (per-probe specs)
// - tasks/phase-7-synthesis-spike/live-*.raw.txt (per-probe raw model output)

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const outDir = path.resolve(repoRoot, "tasks/phase-7-synthesis-spike");

// ---------------------------------------------------------------------------
// 0. Fail-early environment check.
// ---------------------------------------------------------------------------

// Optionally load .env.local from the repo root so Vercel-managed keys
// work without hand-exporting. `vercel env pull` writes to .env.local
// by default; process.loadEnvFile is native in Node 20.12+.
const envFileCandidates = [path.resolve(repoRoot, ".env.local"), path.resolve(repoRoot, ".env")];
for (const candidate of envFileCandidates) {
  try {
    if (typeof process.loadEnvFile === "function") {
      process.loadEnvFile(candidate);
      break;
    }
  } catch {
    // file missing or unreadable — try next candidate
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "\nError: ANTHROPIC_API_KEY is not set.\n" +
      "This script runs live Claude calls; fixture mode is not supported here.\n\n" +
      "Option 1 — pull the key from Vercel (recommended if it lives there):\n" +
      "  vercel env pull .env.local\n" +
      "  node scripts/phase-7-spike/run-live.mjs\n\n" +
      "Option 2 — export the key for this shell:\n" +
      "  export ANTHROPIC_API_KEY=sk-ant-...\n" +
      "  node scripts/phase-7-spike/run-live.mjs\n"
  );
  process.exit(2);
}

let Anthropic;
try {
  const sdkUrl = new URL(`./packages/crm/node_modules/@anthropic-ai/sdk/index.js`, `file://${repoRoot}/`);
  const sdkModule = await import(sdkUrl.href);
  Anthropic = sdkModule.default ?? sdkModule.Anthropic;
} catch (err) {
  console.error(
    `\nError: could not load @anthropic-ai/sdk from packages/crm/node_modules.\n` +
      `Reason: ${err instanceof Error ? err.message : String(err)}\n` +
      `Run \`pnpm install\` in the repo root and retry.\n`
  );
  process.exit(2);
}

const anthropic = new Anthropic();

// ---------------------------------------------------------------------------
// 1. Constants — model + pricing + budget.
// ---------------------------------------------------------------------------

const MODEL = "claude-opus-4-7";
const INPUT_PRICE_PER_M = 5.0;
const OUTPUT_PRICE_PER_M = 25.0;
const BUDGET_USD = 5.0;
const PREFLIGHT_ESTIMATE_USD = 0.15; // conservative per-call estimate used before we've seen real usage

function costFor(usage) {
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const cost = (inputTokens * INPUT_PRICE_PER_M + outputTokens * OUTPUT_PRICE_PER_M) / 1_000_000;
  return { inputTokens, outputTokens, cost };
}

// ---------------------------------------------------------------------------
// 2. Load real block manifests + MCP tool catalog from the repo.
// ---------------------------------------------------------------------------

const CORE_BLOCKS = [
  "crm",
  "email",
  "sms",
  "caldiy-booking",
  "formbricks-intake",
  "landing-pages",
  "payments",
];

function parseContract(markdown) {
  const section = markdown.split(/^## Composition Contract\s*$/im)[1];
  if (!section) return null;
  const body = section.split(/^## /m)[0];
  const take = (key) => {
    const m = body.match(new RegExp(`^${key}:\\s*(.+?)$`, "im"));
    if (!m) return [];
    let v = m[1].trim();
    if (v.startsWith("[") && v.endsWith("]")) v = v.slice(1, -1);
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  };
  return {
    produces: take("produces"),
    consumes: take("consumes"),
    verbs: take("verbs"),
    composeWith: take("compose_with"),
  };
}

async function loadBlockManifests() {
  const out = {};
  for (const slug of CORE_BLOCKS) {
    const filePath = path.join(repoRoot, "packages/crm/src/blocks", `${slug}.block.md`);
    const raw = await fs.readFile(filePath, "utf8");
    const contract = parseContract(raw);
    const descMatch = raw.match(/\*\*Description\*\*\s*\n([^\n]+)/);
    out[slug] = {
      slug,
      description: descMatch?.[1]?.trim() ?? "",
      contract,
    };
  }
  return out;
}

async function loadToolCatalog() {
  const toolsPath = path.join(repoRoot, "skills/mcp-server/src/tools.js");
  const raw = await fs.readFile(toolsPath, "utf8");
  const tools = [];
  const toolRe = /\{\s*name:\s*"([^"]+)",\s*description:\s*"([^"]+(?:\\"[^"]*)*)"/g;
  let match;
  while ((match = toolRe.exec(raw)) !== null) {
    tools.push({
      name: match[1],
      description: match[2].replace(/\\"/g, '"').replace(/\\n/g, " ").slice(0, 240),
    });
  }
  return tools;
}

// ---------------------------------------------------------------------------
// 3. Fixture Soul + installed blocks + form + appointment types + prompts.
//    Must match scripts/phase-7-spike/synthesis.mjs so results are comparable.
// ---------------------------------------------------------------------------

const FIXTURE_SOUL = {
  businessName: "Bright Smile Dental",
  industry: "dental clinic",
  mission: "Make dental care feel less scary, one patient at a time.",
  offer: "Free new-patient consultations + painless cleanings + modern tech",
  tone: "warm, reassuring, no sales pressure",
  services: [
    { name: "New-patient consultation", duration: "45 min", price: 0 },
    { name: "Cleaning", duration: "60 min", price: 120 },
    { name: "Emergency visit", duration: "30 min", price: 180 },
  ],
};

const FIXTURE_INSTALLED_BLOCKS = ["crm", "caldiy-booking", "formbricks-intake", "sms", "email"];

const FIXTURE_FORM = {
  id: "form_new_patient_intake",
  name: "New patient intake",
  fields: [
    { name: "name", type: "text", required: true },
    { name: "email", type: "email", required: true },
    { name: "phone", type: "tel", required: true },
    { name: "reason_for_visit", type: "textarea", required: false },
    { name: "has_insurance", type: "select", required: true, options: ["yes", "no", "unsure"] },
  ],
};

const FIXTURE_APPOINTMENT_TYPES = [
  { id: "appt_new_patient_consult", name: "New-patient consultation", duration: 45, price: 0 },
  { id: "appt_cleaning", name: "Cleaning", duration: 60, price: 120 },
];

const HAPPY_PROMPT =
  "When someone submits the new-patient intake form, text them within 2 minutes to thank them by name and ask when they'd like to come in. Have a short SMS conversation to confirm they have insurance, then book them into the next available new-patient consultation slot. Email a confirmation with the clinic address.";

const ADVERSARIAL = {
  hallucinatedBlock:
    "When a new-patient form is submitted, also post a notification to our Slack #leads channel with the contact details.",
  vague: "Build an agent that helps with leads.",
  impossibleCapability:
    "When a lead submits the form, FedEx them a physical welcome kit.",
  ambiguousRoute:
    "When a lead submits the form, send them a message. Just one message. Your choice whether SMS or email.",
};

const NOVEL_PROMPT =
  "Build me an agent that helps a yoga studio recover members who haven't attended in 60 days, with a discount offer on their third reminder.";

// ---------------------------------------------------------------------------
// 4. Prompt builder — identical to synthesis.mjs.
// ---------------------------------------------------------------------------

const AGENT_SPEC_SCHEMA_DOC = `AgentSpec JSON shape:
{
  "name": string,
  "description": string,
  "trigger": {
    "type": "event",
    "event": string,                     // must be in the SeldonEvent vocabulary
    "filter": { ... }                    // optional
  },
  "variables": { "<varName>": "<path>" },
  "steps": [
    { "id": string, "type": "mcp_tool_call" | "wait" | "conversation" | "branch" | "end", ... }
  ]
}

Step types:
- mcp_tool_call: { tool: string, args: {...}, next: string | null }
- wait: { seconds: number, next: string }
- conversation: { channel: "email" | "sms", initial_message: string, exit_when: string, on_exit: { extract?: {...}, next: string } }
- branch: { condition: string, on_true: string, on_false: string }   // binary only
- end: {} (terminal)

Return ONLY the AgentSpec JSON. No markdown fences, no commentary. If the user's request requires a capability that isn't available, return {"error": "<short explanation>"} instead of guessing.`;

function buildPrompt({ userPrompt, soul = FIXTURE_SOUL, contracts, tools, installed = FIXTURE_INSTALLED_BLOCKS, form = FIXTURE_FORM, appointmentTypes = FIXTURE_APPOINTMENT_TYPES }) {
  const contractLines = Object.entries(contracts).map(([slug, info]) => {
    const c = info.contract;
    if (!c) return `- ${slug}: (no contract)`;
    return `- ${slug}: ${info.description}
    produces: [${c.produces.join(", ")}]
    consumes: [${c.consumes.join(", ")}]
    verbs: [${c.verbs.join(", ")}]
    compose_with: [${c.composeWith.join(", ")}]`;
  });
  const toolLines = tools.map((t) => `- ${t.name}: ${t.description}`);
  return `You are synthesizing an AgentSpec for a SeldonFrame workspace.

## Workspace Soul
${JSON.stringify(soul, null, 2)}

## Installed blocks
${installed.join(", ")}

## Block composition contracts (ONLY use these blocks)
${contractLines.join("\n")}

## Existing intake forms
${JSON.stringify([form], null, 2)}

## Existing appointment types
${JSON.stringify(appointmentTypes, null, 2)}

## MCP tool catalog (ONLY use tools from this list)
${toolLines.join("\n")}

## Output schema
${AGENT_SPEC_SCHEMA_DOC}

## User request
"""
${userPrompt}
"""

Produce the AgentSpec now. Every step's tool must exist in the catalog. Every event must exist in a block's produces list. Every block referenced must be in the installed list.`;
}

// ---------------------------------------------------------------------------
// 5. Validator — same rules as the spike script.
// ---------------------------------------------------------------------------

const VALID_STEP_TYPES = new Set(["mcp_tool_call", "wait", "conversation", "branch", "end"]);

function validateAgentSpec(spec, { contracts, tools, installed }) {
  const issues = [];
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    issues.push({ code: "not_object", path: "$", msg: "spec is not an object" });
    return issues;
  }
  if (spec.error) return [{ code: "model_declined", path: "$", msg: String(spec.error) }];
  if (typeof spec.name !== "string") issues.push({ code: "bad_name", path: "name", msg: "missing or non-string" });
  if (typeof spec.description !== "string") issues.push({ code: "bad_description", path: "description", msg: "missing or non-string" });

  const toolNames = new Set(tools.map((t) => t.name));
  const eventProducers = new Set();
  for (const info of Object.values(contracts)) {
    for (const e of info.contract?.produces ?? []) eventProducers.add(e);
  }

  const trigger = spec.trigger;
  if (!trigger || typeof trigger !== "object") {
    issues.push({ code: "bad_trigger", path: "trigger", msg: "missing" });
  } else {
    if (trigger.type !== "event") issues.push({ code: "bad_trigger_type", path: "trigger.type", msg: `expected "event", got ${JSON.stringify(trigger.type)}` });
    if (typeof trigger.event !== "string") issues.push({ code: "bad_trigger_event", path: "trigger.event", msg: "missing" });
    else if (!eventProducers.has(trigger.event)) {
      issues.push({
        code: "unknown_trigger_event",
        path: "trigger.event",
        msg: `event "${trigger.event}" is not produced by any installed block`,
      });
    }
  }

  if (!Array.isArray(spec.steps)) {
    issues.push({ code: "bad_steps", path: "steps", msg: "not an array" });
    return issues;
  }

  const stepIds = new Set();
  for (const step of spec.steps) {
    if (!step || typeof step !== "object") {
      issues.push({ code: "bad_step", path: "steps[?]", msg: "non-object step" });
      continue;
    }
    if (typeof step.id !== "string" || !step.id) {
      issues.push({ code: "missing_step_id", path: "steps[?]", msg: "missing id" });
      continue;
    }
    if (stepIds.has(step.id)) issues.push({ code: "duplicate_step_id", path: `steps.${step.id}`, msg: "duplicate id" });
    stepIds.add(step.id);
    if (!VALID_STEP_TYPES.has(step.type)) {
      issues.push({ code: "bad_step_type", path: `steps.${step.id}.type`, msg: `unknown step type "${step.type}"` });
    }
    if (step.type === "mcp_tool_call") {
      if (typeof step.tool !== "string" || !toolNames.has(step.tool)) {
        issues.push({ code: "unknown_tool", path: `steps.${step.id}.tool`, msg: `tool "${step.tool}" is not in the MCP catalog` });
      }
      if (!step.args || typeof step.args !== "object") issues.push({ code: "missing_args", path: `steps.${step.id}.args`, msg: "missing args" });
    }
    if (step.type === "conversation") {
      if (!["email", "sms"].includes(step.channel)) issues.push({ code: "bad_channel", path: `steps.${step.id}.channel`, msg: "channel must be 'email' or 'sms'" });
      if (typeof step.exit_when !== "string") issues.push({ code: "missing_exit_when", path: `steps.${step.id}.exit_when`, msg: "conversations need a natural-language exit_when" });
    }
    if (step.type === "branch") {
      if (typeof step.condition !== "string") issues.push({ code: "missing_condition", path: `steps.${step.id}.condition`, msg: "missing condition" });
      if (typeof step.on_true !== "string") issues.push({ code: "missing_on_true", path: `steps.${step.id}.on_true`, msg: "missing on_true" });
      if (typeof step.on_false !== "string") issues.push({ code: "missing_on_false", path: `steps.${step.id}.on_false`, msg: "missing on_false" });
    }
  }

  for (const step of spec.steps) {
    const check = (label, value) => {
      if (value === null || value === undefined || typeof value !== "string") return;
      if (!stepIds.has(value)) issues.push({ code: "dangling_reference", path: `steps.${step.id}.${label}`, msg: `references missing step "${value}"` });
    };
    if (step.type === "mcp_tool_call" || step.type === "wait") check("next", step.next);
    if (step.type === "conversation") check("on_exit.next", step?.on_exit?.next);
    if (step.type === "branch") {
      check("on_true", step.on_true);
      check("on_false", step.on_false);
    }
  }

  const toolBlockHints = {
    sms: ["send_sms", "list_sms", "get_sms", "suppress_phone", "unsuppress_phone", "list_sms_suppressions"],
    email: ["send_email", "list_emails", "get_email", "suppress_email", "unsuppress_email", "list_suppressions"],
    "caldiy-booking": ["create_booking", "list_appointment_types", "create_appointment_type"],
    "formbricks-intake": ["list_forms", "create_form", "update_form"],
    payments: ["create_invoice", "create_subscription", "refund_payment"],
    "landing-pages": ["create_landing_page", "publish_landing_page", "generate_landing_page"],
  };
  const installedSet = new Set(installed);
  for (const step of spec.steps) {
    if (step.type !== "mcp_tool_call") continue;
    for (const [block, toolList] of Object.entries(toolBlockHints)) {
      if (toolList.includes(step.tool) && !installedSet.has(block)) {
        issues.push({ code: "uninstalled_block_tool", path: `steps.${step.id}.tool`, msg: `tool "${step.tool}" requires block "${block}" which is not installed` });
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 6. Determinism helpers.
// ---------------------------------------------------------------------------

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
    return sorted;
  }
  return value;
}

function stableHash(obj) {
  const canonical = JSON.stringify(canonicalize(obj));
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

// Structural skeleton — step count, step types in order, tool names,
// trigger event. Two specs with the same skeleton differ only in copy
// / ids / prose, which is expected model non-determinism.
function structuralSkeleton(spec) {
  if (!spec || typeof spec !== "object") return "";
  if (spec.error) return `__error__`;
  const parts = [
    `trigger=${spec?.trigger?.event ?? "?"}`,
    `count=${Array.isArray(spec.steps) ? spec.steps.length : "?"}`,
  ];
  for (const step of spec.steps ?? []) {
    if (step.type === "mcp_tool_call") parts.push(`tool:${step.tool ?? "?"}`);
    else if (step.type === "conversation") parts.push(`conv:${step.channel ?? "?"}`);
    else if (step.type === "branch") parts.push("branch");
    else if (step.type === "wait") parts.push("wait");
    else if (step.type === "end") parts.push("end");
    else parts.push(`?:${step.type}`);
  }
  return parts.join("|");
}

function compareDeterminism(specs) {
  const hashes = specs.map((s) => stableHash(s));
  const skeletons = specs.map((s) => structuralSkeleton(s));
  const uniqueHashes = new Set(hashes);
  const uniqueSkeletons = new Set(skeletons);

  let identicalCount = 0;
  const firstHash = hashes[0];
  for (const h of hashes) if (h === firstHash) identicalCount += 1;

  let structurallyEquivalent = 0;
  const firstSkeleton = skeletons[0];
  for (const s of skeletons) if (s === firstSkeleton) structurallyEquivalent += 1;

  return {
    hashes,
    skeletons,
    uniqueHashCount: uniqueHashes.size,
    uniqueSkeletonCount: uniqueSkeletons.size,
    identicalCount,
    structurallyEquivalentCount: structurallyEquivalent,
    materiallyDifferentCount: specs.length - structurallyEquivalent,
  };
}

// ---------------------------------------------------------------------------
// 7. Claude call.
// ---------------------------------------------------------------------------

async function callClaude(prompt, label) {
  const startedAt = Date.now();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    system:
      "You are an agent-spec synthesizer. Return ONLY valid JSON matching the schema provided. No markdown fences. No commentary.",
    messages: [{ role: "user", content: prompt }],
  });
  const elapsedMs = Date.now() - startedAt;

  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  const thinking = response.content.filter((b) => b.type === "thinking").map((b) => b.thinking ?? "").join("\n\n---\n\n");

  await fs.writeFile(path.join(outDir, `live-${label}.raw.txt`), text);
  if (thinking) await fs.writeFile(path.join(outDir, `live-${label}.thinking.txt`), thinking);

  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed;
  let parseError = null;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }

  if (parsed !== undefined) {
    await fs.writeFile(path.join(outDir, `live-${label}.json`), JSON.stringify(parsed, null, 2));
  }

  const usage = costFor(response.usage);
  return { parsed, parseError, raw: text, thinking: thinking || null, elapsedMs, usage };
}

// ---------------------------------------------------------------------------
// 8. Budget tracker.
// ---------------------------------------------------------------------------

class BudgetTracker {
  constructor(capUsd) {
    this.cap = capUsd;
    this.spent = 0;
    this.calls = 0;
  }

  canAfford(estimatedUsd) {
    return this.spent + estimatedUsd <= this.cap;
  }

  record(usdCost) {
    this.spent += usdCost;
    this.calls += 1;
  }

  summary() {
    return { capUsd: this.cap, spentUsd: this.spent, callCount: this.calls };
  }
}

// ---------------------------------------------------------------------------
// 9. Main — run 7 probes in order with budget checks.
// ---------------------------------------------------------------------------

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  console.log(`\nPhase 7.a live probe run`);
  console.log(`  model: ${MODEL}`);
  console.log(`  budget: $${BUDGET_USD.toFixed(2)}`);

  const contracts = await loadBlockManifests();
  const tools = await loadToolCatalog();
  console.log(`  loaded: ${Object.keys(contracts).length} contracts, ${tools.length} tools`);

  const budget = new BudgetTracker(BUDGET_USD);
  const startedAt = Date.now();

  const probes = [];
  const determinismSpecs = [];

  // Helper that guards every call through the budget.
  async function runProbe(probe) {
    const estimate = budget.calls === 0 ? PREFLIGHT_ESTIMATE_USD : Math.max(budget.spent / budget.calls, PREFLIGHT_ESTIMATE_USD);
    if (!budget.canAfford(estimate)) {
      console.log(`  BUDGET STOP at $${budget.spent.toFixed(4)} of $${BUDGET_USD.toFixed(2)} — next call estimated at $${estimate.toFixed(4)}, would exceed cap.`);
      probe.skipped = true;
      probe.reason = "budget_stop";
      probes.push(probe);
      return false;
    }

    const prompt = buildPrompt({ userPrompt: probe.prompt, contracts, tools });
    await fs.writeFile(path.join(outDir, `live-${probe.label}.prompt.txt`), prompt);

    console.log(`  → ${probe.label}`);
    try {
      const result = await callClaude(prompt, probe.label);
      budget.record(result.usage.cost);

      const valid = result.parsed ? validateAgentSpec(result.parsed, { contracts, tools, installed: FIXTURE_INSTALLED_BLOCKS }) : null;
      probe.ok = true;
      probe.parsed = result.parsed;
      probe.parseError = result.parseError;
      probe.thinking = result.thinking;
      probe.elapsedMs = result.elapsedMs;
      probe.usage = result.usage;
      probe.validation = valid;
      probe.runningSpendUsd = budget.spent;

      const passed = !result.parseError && valid && valid.length === 0;
      console.log(
        `    ${passed ? "PASS" : "FAIL"} · ${result.usage.inputTokens}/${result.usage.outputTokens} tok · $${result.usage.cost.toFixed(4)} · ${result.elapsedMs}ms · issues=${valid?.length ?? "n/a"} · running=$${budget.spent.toFixed(4)}`
      );
    } catch (err) {
      probe.ok = false;
      probe.error = err instanceof Error ? err.message : String(err);
      console.log(`    ERROR: ${probe.error}`);
    }
    probes.push(probe);
    return true;
  }

  // ---- Probe 1: happy path ----
  await runProbe({ label: "01-happy-path", kind: "happy", prompt: HAPPY_PROMPT });

  // ---- Probes 2-5: adversarial ----
  let adversarialIndex = 2;
  for (const [key, prompt] of Object.entries(ADVERSARIAL)) {
    const padded = String(adversarialIndex).padStart(2, "0");
    await runProbe({ label: `${padded}-adversarial-${key}`, kind: "adversarial", adversarialKey: key, prompt });
    adversarialIndex += 1;
  }

  // ---- Probe 6: determinism (5 repeats of happy-path) ----
  console.log(`  determinism x5:`);
  for (let i = 1; i <= 5; i += 1) {
    const padded = String(i).padStart(1, "0");
    const probe = { label: `06-determinism-run-${padded}`, kind: "determinism", runIndex: i, prompt: HAPPY_PROMPT };
    const ran = await runProbe(probe);
    if (probe.parsed !== undefined) determinismSpecs.push(probe.parsed);
    if (!ran) break;
  }

  // ---- Probe 7: novel prompt ----
  await runProbe({ label: "07-novel-yoga-recovery", kind: "novel", prompt: NOVEL_PROMPT });

  const totalElapsedMs = Date.now() - startedAt;

  // Determinism analysis.
  let determinism = null;
  if (determinismSpecs.length >= 2) {
    determinism = compareDeterminism(determinismSpecs);
  }

  // Write raw machine-readable record.
  const raw = {
    model: MODEL,
    startedAt: new Date(startedAt).toISOString(),
    totalElapsedMs,
    budget: budget.summary(),
    probes,
    determinism,
  };
  await fs.writeFile(path.join(outDir, "live-run-raw.json"), JSON.stringify(raw, null, 2));

  // Render the markdown report.
  await writeMarkdownReport({ probes, determinism, budget: budget.summary(), totalElapsedMs, contracts, tools, installed: FIXTURE_INSTALLED_BLOCKS });

  console.log(`\nTotal spend: $${budget.spent.toFixed(4)} (${budget.calls} calls, ${totalElapsedMs}ms)`);
  console.log(`Report: ${path.relative(process.cwd(), path.join(outDir, "live-run-report.md"))}`);
}

// ---------------------------------------------------------------------------
// 10. Markdown report renderer.
// ---------------------------------------------------------------------------

function renderIssueList(issues) {
  if (!issues) return "n/a";
  if (issues.length === 0) return "_none_";
  return issues.map((i) => `\`[${i.code}] ${i.path}\` — ${i.msg}`).join("<br>");
}

function renderProbeRow(p) {
  if (p.skipped) {
    return `| ${p.label} | _skipped_ (${p.reason}) | — | — | — | — | — |`;
  }
  if (!p.ok) {
    return `| ${p.label} | _error_ | — | — | — | — | ${p.error} |`;
  }
  const validityCell =
    p.parseError
      ? `parse-error`
      : p.validation && p.validation.length === 0
        ? "PASS"
        : p.validation && p.validation.length === 1 && p.validation[0].code === "model_declined"
          ? "declined"
          : `FAIL (${p.validation?.length ?? "?"})`;
  return `| ${p.label} | ${validityCell} | ${p.usage.inputTokens} | ${p.usage.outputTokens} | $${p.usage.cost.toFixed(4)} | ${p.elapsedMs}ms | ${renderIssueList(p.validation)} |`;
}

// Classify each probe into one of four outcome classes. A decline is
// "grounded" when the model's decline text cites real missing
// infrastructure — a tool name, a block slug, or a phrase indicating
// catalog/registry awareness ("no X tool", "not installed",
// "not in the catalog", etc.). Ungrounded declines are refusals without
// evidence — the failure mode we actually worry about (model declining
// because of a misread rather than a real gap).
//
// A "hallucinated" outcome is when the model produced a spec but the
// validator found unknown tools / unknown trigger events / tools from
// uninstalled blocks. That's the spec-fabrication failure mode.
function classifyProbe(probe, { contracts, tools, installed }) {
  if (probe.skipped || !probe.ok) return { class: "error", grounded: null };
  if (probe.parseError) return { class: "hallucinated", grounded: null, reason: "parse_error" };

  const spec = probe.parsed;
  if (spec?.error) {
    const text = String(spec.error).toLowerCase();
    const toolNames = tools.map((t) => t.name.toLowerCase());
    const blockSlugs = Object.keys(contracts).map((s) => s.toLowerCase());
    const installedSlugs = installed.map((s) => s.toLowerCase());
    const groundingPhrases = [
      "no such tool",
      "no create_",
      "not in the catalog",
      "not in the mcp",
      "not installed",
      "no block",
      "no mcp tool",
      "is not available",
      "does not exist",
      "not supported",
      "catalog only exposes",
      "catalog has no",
      "no integration",
    ];
    const grounded =
      toolNames.some((n) => n.length > 3 && text.includes(n)) ||
      blockSlugs.some((s) => text.includes(s)) ||
      installedSlugs.some((s) => text.includes(s)) ||
      groundingPhrases.some((phrase) => text.includes(phrase));
    return { class: grounded ? "declined_grounded" : "declined_ungrounded", grounded };
  }

  // Produced a spec. Now decide: is it real synthesis, or hallucination?
  const issues = probe.validation ?? [];
  const hallucinationCodes = new Set(["unknown_tool", "unknown_trigger_event", "uninstalled_block_tool"]);
  const hasHallucination = issues.some((i) => hallucinationCodes.has(i.code));
  if (hasHallucination) {
    return { class: "hallucinated", grounded: false, reason: "unknown_tool_or_event" };
  }
  return { class: "produced_spec", grounded: null };
}

function deriveVerdict({ probes, determinism, contracts, tools, installed }) {
  const counted = probes.map((probe) => ({ probe, cls: classifyProbe(probe, { contracts, tools, installed }) }));

  const produced = counted.filter((x) => x.cls.class === "produced_spec").length;
  const groundedDeclines = counted.filter((x) => x.cls.class === "declined_grounded").length;
  const ungroundedDeclines = counted.filter((x) => x.cls.class === "declined_ungrounded").length;
  const hallucinated = counted.filter((x) => x.cls.class === "hallucinated").length;
  const total = produced + groundedDeclines + ungroundedDeclines + hallucinated;

  const hallucinationRate = total > 0 ? hallucinated / total : 0;
  const totalDeclines = groundedDeclines + ungroundedDeclines;
  const groundingRate = totalDeclines > 0 ? groundedDeclines / totalDeclines : 1;

  // Vague-prompt handling: did Claude respond with clarifying questions,
  // or did it produce a spec / decline ungroundedly? A clarifying
  // response would arrive as {questions: [...]} or similar. For now we
  // treat "produced a spec on a vague prompt" as the failure mode
  // flagged by the 2026-04-21 live run.
  const vagueProbe = probes.find((p) => p.adversarialKey === "vague");
  const vagueProducedSpec =
    vagueProbe && vagueProbe.ok && vagueProbe.parsed && !vagueProbe.parsed.error &&
    !vagueProbe.parseError && !vagueProbe.parsed.questions;
  const vagueHadClarifyingQuestions = vagueProbe?.parsed?.questions != null;

  const classificationSummary = {
    produced,
    grounded_declines: groundedDeclines,
    ungrounded_declines: ungroundedDeclines,
    hallucinated,
    total,
    hallucination_rate: hallucinationRate,
    grounding_rate: groundingRate,
    vague_produced_spec_without_clarification: Boolean(vagueProducedSpec),
    vague_had_clarifying_questions: Boolean(vagueHadClarifyingQuestions),
  };

  // Verdict ladder. Per the 2026-04-21 semantics:
  if (hallucinationRate > 0) {
    return {
      label: "fundamentally unreliable for archetypal prompts",
      detail:
        `${hallucinated} of ${total} calls produced a spec with unknown tools / trigger events / uninstalled-block tool calls. Any hallucination rate > 0 is disqualifying — synthesis cannot ship while the model invents capabilities that don't exist. Tighten the system prompt with catalog evidence + re-test before proceeding.`,
      classification: classificationSummary,
    };
  }
  if (groundingRate < 0.8) {
    return {
      label: "fundamentally unreliable for archetypal prompts",
      detail:
        `Grounding rate ${(groundingRate * 100).toFixed(0)}% is below the 80% threshold. ${ungroundedDeclines} of ${totalDeclines} declines cited no real missing infrastructure — the model is refusing for reasons unrelated to the actual catalog. Investigate why the model is ungrounded before shipping.`,
      classification: classificationSummary,
    };
  }
  if (vagueProducedSpec) {
    return {
      label: "needs prompt engineering",
      detail:
        `Hallucination rate is 0% and grounding rate is ${(groundingRate * 100).toFixed(0)}%, but the vague-prompt adversarial probe produced a spec without asking clarifying questions. Ship 7.d's clarifying-questions loop before the synthesis engine goes into general availability.`,
      classification: classificationSummary,
    };
  }
  return {
    label: "production-ready for archetypal prompts",
    detail:
      `${produced}/${total} produced specs, ${groundedDeclines}/${totalDeclines} declines grounded in real catalog evidence (${(groundingRate * 100).toFixed(0)}%), 0 hallucinations, vague prompt handled with clarifying questions. Proceed with 7.h / archetype library shipping plan.`,
    classification: classificationSummary,
  };
}

async function writeMarkdownReport({ probes, determinism, budget, totalElapsedMs, contracts, tools, installed }) {
  const verdict = deriveVerdict({ probes, determinism, contracts, tools, installed });

  // Per-probe classification map, used to annotate the results table.
  const classByLabel = new Map();
  for (const probe of probes) {
    classByLabel.set(probe.label, classifyProbe(probe, { contracts, tools, installed }));
  }

  const perProbeTable = [
    "| Probe | Class | Validity | In tok | Out tok | Cost | Latency | Issues |",
    "|---|---|---|---|---|---|---|---|",
    ...probes.map((p) => {
      const cls = classByLabel.get(p.label)?.class ?? "—";
      return renderProbeRow(p).replace(/^\| ([^|]+) \|/, (_, label) => `| ${label} | ${cls} |`);
    }),
  ].join("\n");

  const c = verdict.classification;
  const classificationBlock = c
    ? [
        "## Classification summary",
        "",
        `- Produced specs: **${c.produced} / ${c.total}**`,
        `- Grounded declines (cited real missing catalog/registry): **${c.grounded_declines} / ${c.total}**`,
        `- Ungrounded declines (no catalog evidence in refusal text): **${c.ungrounded_declines} / ${c.total}**`,
        `- Hallucinated specs (unknown tools / unknown events / uninstalled-block tools): **${c.hallucinated} / ${c.total}**`,
        `- **Grounding rate:** ${(c.grounding_rate * 100).toFixed(0)}% (threshold: ≥80%)`,
        `- **Hallucination rate:** ${(c.hallucination_rate * 100).toFixed(1)}% (threshold: =0%)`,
        `- Vague prompt produced a spec without clarifying questions: **${c.vague_produced_spec_without_clarification ? "yes (UX failure — 7.d clarifying-questions loop required)" : "no"}**`,
      ].join("\n")
    : "";

  const novelProbe = probes.find((p) => p.kind === "novel");
  const novelSummary = novelProbe
    ? novelProbe.skipped
      ? "Skipped (budget stop)."
      : novelProbe.parsed?.error
        ? `Claude declined. Reason: "${novelProbe.parsed.error}"`
        : novelProbe.parseError
          ? `Parse error: ${novelProbe.parseError}`
          : novelProbe.validation?.length === 0
            ? "Produced a valid AgentSpec."
            : `Produced a spec with ${novelProbe.validation?.length ?? "?"} validation issue(s) — see raw JSON.`
    : "_not run_";

  const determinismBlock = determinism
    ? [
        "## Determinism across 5 happy-path runs",
        "",
        `- Identical hash matches to run 1: **${determinism.identicalCount} / ${determinism.hashes.length}**`,
        `- Structurally equivalent to run 1: **${determinism.structurallyEquivalentCount} / ${determinism.skeletons.length}**`,
        `- Materially different from run 1: **${determinism.materiallyDifferentCount} / ${determinism.skeletons.length}**`,
        `- Unique hashes: ${determinism.uniqueHashCount}, unique skeletons: ${determinism.uniqueSkeletonCount}`,
        "",
        "### Skeleton fingerprints",
        "",
        ...determinism.skeletons.map((s, i) => `- run ${i + 1}: \`${s}\``),
      ].join("\n")
    : "## Determinism across 5 happy-path runs\n\n_Not computed — fewer than 2 successful runs (likely budget stop)._";

  const md = [
    "# Phase 7.a — Live probe run report",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    `**Model:** ${MODEL}`,
    `**Budget:** $${BUDGET_USD.toFixed(2)} cap`,
    `**Spent:** $${budget.spentUsd.toFixed(4)} across ${budget.callCount} call(s)`,
    `**Wall-clock:** ${totalElapsedMs}ms`,
    "",
    "## Verdict",
    "",
    `**${verdict.label}**`,
    "",
    verdict.detail,
    "",
    classificationBlock,
    "",
    "## Per-probe results",
    "",
    perProbeTable,
    "",
    determinismBlock,
    "",
    "## Novel prompt (yoga-studio recovery)",
    "",
    `Prompt: _"${NOVEL_PROMPT}"_`,
    "",
    novelSummary,
    "",
    "## Raw artifacts",
    "",
    "- `live-run-raw.json` — machine-readable record",
    "- `live-<probe>.raw.txt` — raw Claude text response",
    "- `live-<probe>.thinking.txt` — adaptive thinking blocks (when present)",
    "- `live-<probe>.json` — parsed AgentSpec (when JSON parse succeeded)",
    "- `live-<probe>.prompt.txt` — exact prompt sent",
    "",
  ].join("\n");

  await fs.writeFile(path.join(outDir, "live-run-report.md"), md);
}

main().catch((err) => {
  console.error("\nFatal error during live run:");
  console.error(err);
  process.exit(1);
});
