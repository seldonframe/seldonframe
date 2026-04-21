#!/usr/bin/env node
/* eslint-disable no-console */

// Phase 7.a agent-synthesis architectural spike.
//
// Probes: is "natural-language prompt → valid agent spec → executable
// agent" a viable architecture for v1? Or do we need a structured
// intermediate representation that the user fills/approves?
//
// Archetype tested: Speed-to-Lead.
//   "When someone submits the new-patient intake form, text them
//    within 2 minutes to ask a couple qualifying questions. If they
//    are ready and have insurance, book them into the next available
//    new-patient consultation slot and email a confirmation."
//
// The spike runs structural validation regardless of live Claude
// availability. Live-mode probes Claude's actual output shape; fixture
// mode probes the schema + validator + execution simulator.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const outDir = path.resolve(repoRoot, "tasks/phase-7-synthesis-spike");
await fs.mkdir(outDir, { recursive: true });

// ===========================================================================
// 1. Load SDK (optional; fixture fallback when absent).
// ===========================================================================

let anthropic = null;
let sdkLoadError = null;
try {
  const sdkUrl = new URL("./packages/crm/node_modules/@anthropic-ai/sdk/index.js", `file://${repoRoot}/`);
  const sdkModule = await import(sdkUrl.href);
  const Anthropic = sdkModule.default ?? sdkModule.Anthropic;
  if (process.env.ANTHROPIC_API_KEY && Anthropic) {
    anthropic = new Anthropic();
  }
} catch (err) {
  sdkLoadError = err instanceof Error ? err.message : String(err);
}

const hasLiveClaude = Boolean(anthropic);

// ===========================================================================
// 2. Load real block composition contracts from the repo.
// ===========================================================================

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
  // Extract the block under "## Composition Contract". Accepts either
  // key: [a, b, c] or key: a, b, c on separate lines.
  const section = markdown.split(/^## Composition Contract\s*$/im)[1];
  if (!section) return null;
  const body = section.split(/^## /m)[0];
  const take = (key) => {
    const m = body.match(new RegExp(`^${key}:\\s*(.+?)$`, "im"));
    if (!m) return [];
    let v = m[1].trim();
    if (v.startsWith("[") && v.endsWith("]")) v = v.slice(1, -1);
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
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
    // Also grab the "Description" line under the H1 for prompt context.
    const descMatch = raw.match(/\*\*Description\*\*\s*\n([^\n]+)/);
    out[slug] = {
      slug,
      description: descMatch?.[1]?.trim() ?? "",
      contract,
    };
  }
  return out;
}

// ===========================================================================
// 3. Load MCP tool catalog from the real tools.js.
// ===========================================================================

async function loadToolCatalog() {
  const toolsPath = path.join(repoRoot, "skills/mcp-server/src/tools.js");
  const raw = await fs.readFile(toolsPath, "utf8");

  // Cheap regex — the TOOLS array is hand-written so the format is
  // predictable. We just want name + first paragraph of description
  // for the prompt; full schemas aren't necessary for synthesis to
  // choose tools.
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

// ===========================================================================
// 4. Fixture Soul + fixture installed-block registry.
// ===========================================================================

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
// Deliberately NOT installed: payments, landing-pages. An agent that
// tries to invoke these should be flagged.

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

// ===========================================================================
// 5. The natural-language prompt we're testing.
// ===========================================================================

const USER_PROMPT = `When someone submits the new-patient intake form, text them within 2 minutes to thank them by name and ask when they'd like to come in. Have a short SMS conversation to confirm they have insurance, then book them into the next available new-patient consultation slot. Email a confirmation with the clinic address.`;

// ===========================================================================
// 6. Agent spec schema the spike proposes.
// ===========================================================================

const AGENT_SPEC_SCHEMA_DOC = `AgentSpec JSON shape:
{
  "name": string,                        // human-readable agent name
  "description": string,                 // what this agent does
  "trigger": {
    "type": "event",
    "event": string,                     // must be in the SeldonEvent vocabulary
    "filter": { ... }                    // optional, e.g. {"formId": "..."}
  },
  "variables": {                         // named data refs available to steps
    "<varName>": "<path>"                // e.g. "contact": "trigger.contactId"
  },
  "steps": [
    {
      "id": string,                      // kebab-case, stable within spec
      "type": "mcp_tool_call" | "wait" | "conversation" | "branch" | "end",
      ...type-specific fields,
      "next"?: string | null             // next step id or null
    }
  ]
}

Step types:
- mcp_tool_call: { tool: string, args: {...}, next: string | null }
  - "tool" must be a real MCP tool from the catalog
  - args can reference {{variables}} or {{trigger.field}}
- wait: { seconds: number, next: string }
- conversation: { channel: "email" | "sms", initial_message: string, exit_when: string, on_exit: { extract?: {...}, next: string } }
  - exit_when is a natural-language description; the runtime evaluates it per-turn via the Conversation Primitive
- branch: { condition: string, on_true: string, on_false: string }
  - condition is a natural-language test against collected variables
- end: {} (terminal node; omit "next")

Return ONLY the AgentSpec JSON. No markdown fences, no commentary.`;

function buildPrompt({ soul, contracts, tools, installed, form, appointmentTypes, userPrompt }) {
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

  return `You are synthesizing an AgentSpec for a SeldonFrame workspace. The workspace has a Soul (brand context), a set of installed blocks (each with a composition contract), and an MCP tool catalog. Compose an agent that answers the user's request.

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

Produce the AgentSpec now. Every step's tool must exist in the catalog. Every event must exist in a block's produces list. Every block referenced must be in the installed list. If the user's request requires a capability that isn't available, return {"error": "<short explanation>"} instead of guessing.`;
}

// ===========================================================================
// 7. Claude call + JSON parsing.
// ===========================================================================

async function callClaude(prompt, label) {
  if (!anthropic) {
    throw new Error("ANTHROPIC_API_KEY missing");
  }
  const response = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    system: "You are an agent-spec synthesizer. Return ONLY valid JSON matching the schema provided. No markdown fences. No commentary.",
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  await fs.writeFile(path.join(outDir, `${label}.raw.txt`), text);
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    throw new Error(`Claude returned non-JSON for ${label}: ${err.message}`);
  }
  await fs.writeFile(path.join(outDir, `${label}.json`), JSON.stringify(parsed, null, 2));
  return { parsed, usage: response.usage };
}

// ===========================================================================
// 8. Fixture AgentSpec — what a well-behaved Claude "should" produce
//    for the Speed-to-Lead archetype. Used when ANTHROPIC_API_KEY is
//    absent so the validator + execution simulator still exercise the
//    pipeline.
// ===========================================================================

const FIXTURE_AGENT_SPEC = {
  name: "Speed-to-Lead — New Patient Intake",
  description:
    "When a new-patient intake form is submitted, text the prospect within 2 minutes, run a short SMS conversation to confirm insurance, book them into the next new-patient consultation slot if qualified, and email a confirmation.",
  trigger: {
    type: "event",
    event: "form.submitted",
    filter: { formId: "form_new_patient_intake" },
  },
  variables: {
    contactId: "trigger.contactId",
    phone: "trigger.data.phone",
    name: "trigger.data.name",
    email: "trigger.data.email",
    hasInsurance: "trigger.data.has_insurance",
  },
  steps: [
    {
      id: "wait-two-minutes",
      type: "wait",
      seconds: 120,
      next: "opening-sms",
    },
    {
      id: "opening-sms",
      type: "mcp_tool_call",
      tool: "send_sms",
      args: {
        to: "{{phone}}",
        body:
          "Hi {{name}}, it's Bright Smile Dental — thanks for reaching out! Happy to get you in soon. Can I ask a couple quick questions to find the best time?",
        contact_id: "{{contactId}}",
      },
      next: "qualify-conversation",
    },
    {
      id: "qualify-conversation",
      type: "conversation",
      channel: "sms",
      initial_message:
        "First — do you have dental insurance you'd like us to check, or will this be self-pay?",
      exit_when:
        "The prospect has confirmed whether they have insurance, and stated at least one day/time that works for them.",
      on_exit: {
        extract: {
          insurance_status: "one of: yes | no | unsure",
          preferred_time: "natural-language time window",
        },
        next: "branch-on-ready",
      },
    },
    {
      id: "branch-on-ready",
      type: "branch",
      condition:
        "insurance_status is 'yes' or 'self-pay / no' and preferred_time is provided",
      on_true: "create-booking",
      on_false: "fallback-sms",
    },
    {
      id: "create-booking",
      type: "mcp_tool_call",
      tool: "create_booking",
      args: {
        contact_id: "{{contactId}}",
        appointment_type_id: "appt_new_patient_consult",
        starts_at: "{{preferred_time}}",
      },
      next: "send-confirmation-email",
    },
    {
      id: "send-confirmation-email",
      type: "mcp_tool_call",
      tool: "send_email",
      args: {
        to: "{{email}}",
        subject: "You're booked at Bright Smile Dental",
        body:
          "Hi {{name}}, we're confirmed for your new-patient consultation. Clinic address: 123 Main St, Laval. See you soon!",
        contact_id: "{{contactId}}",
      },
      next: null,
    },
    {
      id: "fallback-sms",
      type: "mcp_tool_call",
      tool: "send_sms",
      args: {
        to: "{{phone}}",
        body:
          "No worries — I'll have our scheduler reach out directly. Talk soon!",
        contact_id: "{{contactId}}",
      },
      next: null,
    },
  ],
};

// ===========================================================================
// 9. Validator — structural + semantic.
// ===========================================================================

const VALID_STEP_TYPES = new Set(["mcp_tool_call", "wait", "conversation", "branch", "end"]);

function validateAgentSpec(spec, { contracts, tools, installed }) {
  const issues = [];

  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    issues.push({ code: "not_object", path: "$", msg: "spec is not an object" });
    return issues;
  }
  if (spec.error) {
    // Model explicitly refused — treat as a valid "no" answer, surface separately.
    return [{ code: "model_declined", path: "$", msg: String(spec.error) }];
  }

  if (typeof spec.name !== "string") issues.push({ code: "bad_name", path: "name", msg: "missing or non-string" });
  if (typeof spec.description !== "string") issues.push({ code: "bad_description", path: "description", msg: "missing or non-string" });

  const toolNames = new Set(tools.map((t) => t.name));
  const eventProducers = new Set();
  for (const info of Object.values(contracts)) {
    for (const e of info.contract?.produces ?? []) eventProducers.add(e);
  }

  // Trigger
  const trigger = spec.trigger;
  if (!trigger || typeof trigger !== "object") {
    issues.push({ code: "bad_trigger", path: "trigger", msg: "missing" });
  } else {
    if (trigger.type !== "event") issues.push({ code: "bad_trigger_type", path: "trigger.type", msg: `expected "event", got ${JSON.stringify(trigger.type)}` });
    if (typeof trigger.event !== "string") {
      issues.push({ code: "bad_trigger_event", path: "trigger.event", msg: "missing" });
    } else if (!eventProducers.has(trigger.event)) {
      issues.push({
        code: "unknown_trigger_event",
        path: "trigger.event",
        msg: `event "${trigger.event}" is not produced by any installed block. Known producers: ${[...eventProducers].join(", ")}`,
      });
    }
  }

  // Steps
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
    if (stepIds.has(step.id)) {
      issues.push({ code: "duplicate_step_id", path: `steps.${step.id}`, msg: "duplicate id" });
    }
    stepIds.add(step.id);
    if (!VALID_STEP_TYPES.has(step.type)) {
      issues.push({
        code: "bad_step_type",
        path: `steps.${step.id}.type`,
        msg: `unknown step type "${step.type}"`,
      });
    }
    if (step.type === "mcp_tool_call") {
      if (typeof step.tool !== "string" || !toolNames.has(step.tool)) {
        issues.push({
          code: "unknown_tool",
          path: `steps.${step.id}.tool`,
          msg: `tool "${step.tool}" is not in the MCP catalog`,
        });
      }
      if (!step.args || typeof step.args !== "object") {
        issues.push({ code: "missing_args", path: `steps.${step.id}.args`, msg: "missing args" });
      }
    }
    if (step.type === "conversation") {
      if (!["email", "sms"].includes(step.channel)) {
        issues.push({ code: "bad_channel", path: `steps.${step.id}.channel`, msg: "channel must be 'email' or 'sms'" });
      }
      if (typeof step.exit_when !== "string") {
        issues.push({ code: "missing_exit_when", path: `steps.${step.id}.exit_when`, msg: "conversations need a natural-language exit_when" });
      }
    }
    if (step.type === "branch") {
      if (typeof step.condition !== "string") issues.push({ code: "missing_condition", path: `steps.${step.id}.condition`, msg: "missing condition" });
      if (typeof step.on_true !== "string") issues.push({ code: "missing_on_true", path: `steps.${step.id}.on_true`, msg: "missing on_true" });
      if (typeof step.on_false !== "string") issues.push({ code: "missing_on_false", path: `steps.${step.id}.on_false`, msg: "missing on_false" });
    }
  }

  // Reachability — every next / on_true / on_false / on_exit.next points at a real step id or null.
  for (const step of spec.steps) {
    const check = (label, value) => {
      if (value === null || value === undefined) return;
      if (typeof value !== "string") return;
      if (!stepIds.has(value)) {
        issues.push({
          code: "dangling_reference",
          path: `steps.${step.id}.${label}`,
          msg: `references missing step "${value}"`,
        });
      }
    };
    if (step.type === "mcp_tool_call" || step.type === "wait") check("next", step.next);
    if (step.type === "conversation") check("on_exit.next", step?.on_exit?.next);
    if (step.type === "branch") {
      check("on_true", step.on_true);
      check("on_false", step.on_false);
    }
  }

  // Block-usage warning: tools whose name starts with a specific block
  // (e.g. send_sms → sms block) should only appear if that block is installed.
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
        issues.push({
          code: "uninstalled_block_tool",
          path: `steps.${step.id}.tool`,
          msg: `tool "${step.tool}" requires block "${block}" which is not installed`,
        });
      }
    }
  }

  return issues;
}

// ===========================================================================
// 10. Execution simulator — walk the spec, confirm the wiring works.
// ===========================================================================

function simulateExecution(spec) {
  const trace = [];
  const stepById = new Map();
  for (const step of spec.steps ?? []) stepById.set(step.id, step);

  // Find the first step (lowest-indexed referenced step, or the first in the array).
  let current = spec.steps?.[0];
  const visited = new Set();
  let guard = 0;

  while (current && guard < 50) {
    guard += 1;
    if (visited.has(current.id)) {
      trace.push({ step: current.id, action: "loop_detected" });
      break;
    }
    visited.add(current.id);

    switch (current.type) {
      case "mcp_tool_call":
        trace.push({ step: current.id, action: `call ${current.tool}`, args: current.args });
        current = current.next ? stepById.get(current.next) : null;
        break;
      case "wait":
        trace.push({ step: current.id, action: `wait ${current.seconds}s` });
        current = current.next ? stepById.get(current.next) : null;
        break;
      case "conversation":
        trace.push({
          step: current.id,
          action: `conversation (${current.channel}) until: ${current.exit_when}`,
        });
        current = current?.on_exit?.next ? stepById.get(current.on_exit.next) : null;
        break;
      case "branch":
        // Simulator: take the on_true path (can't actually evaluate).
        trace.push({ step: current.id, action: `branch on: ${current.condition} → on_true` });
        current = current.on_true ? stepById.get(current.on_true) : null;
        break;
      default:
        trace.push({ step: current.id, action: "end" });
        current = null;
    }
  }
  return trace;
}

// ===========================================================================
// 11. Adversarial prompts.
// ===========================================================================

const ADVERSARIAL_PROMPTS = {
  hallucinatedBlock:
    "When a new-patient form is submitted, also post a notification to our Slack #leads channel with the contact details.",
  vague: "Build an agent that helps with leads.",
  impossibleCapability:
    "When a lead submits the form, FedEx them a physical welcome kit.",
  ambiguousRoute:
    "When a lead submits the form, send them a message. Just one message. Your choice whether SMS or email.",
};

// ===========================================================================
// 12. Main.
// ===========================================================================

async function run() {
  console.log(`Phase 7.a Agent Synthesis spike`);
  console.log(`  live Claude: ${hasLiveClaude ? "YES" : "NO — fixture fallback"}`);

  const contracts = await loadBlockManifests();
  const tools = await loadToolCatalog();

  await fs.writeFile(
    path.join(outDir, "00-inputs.json"),
    JSON.stringify(
      {
        soul: FIXTURE_SOUL,
        installed: FIXTURE_INSTALLED_BLOCKS,
        contracts,
        toolCount: tools.length,
        tools: tools.slice(0, 10),
        userPrompt: USER_PROMPT,
      },
      null,
      2
    )
  );

  const report = {
    mode: hasLiveClaude ? "live" : "fixture",
    contractCount: Object.keys(contracts).length,
    toolCount: tools.length,
    installed: FIXTURE_INSTALLED_BLOCKS,
    steps: [],
  };

  // ---------- Happy path ----------
  const promptInput = {
    soul: FIXTURE_SOUL,
    contracts,
    tools,
    installed: FIXTURE_INSTALLED_BLOCKS,
    form: FIXTURE_FORM,
    appointmentTypes: FIXTURE_APPOINTMENT_TYPES,
    userPrompt: USER_PROMPT,
  };
  const prompt = buildPrompt(promptInput);
  await fs.writeFile(path.join(outDir, "01-prompt.txt"), prompt);

  let spec;
  if (hasLiveClaude) {
    try {
      const { parsed, usage } = await callClaude(prompt, "02-happy-path-spec");
      spec = parsed;
      report.steps.push({ step: "synth-happy-path", ok: true, usage });
    } catch (err) {
      report.steps.push({ step: "synth-happy-path", ok: false, error: err.message });
      spec = FIXTURE_AGENT_SPEC;
      await fs.writeFile(path.join(outDir, "02-happy-path-spec.json"), JSON.stringify(spec, null, 2));
    }
  } else {
    spec = FIXTURE_AGENT_SPEC;
    await fs.writeFile(path.join(outDir, "02-happy-path-spec.json"), JSON.stringify(spec, null, 2));
    report.steps.push({ step: "synth-happy-path", ok: true, source: "fixture" });
  }

  const issues = validateAgentSpec(spec, { contracts, tools, installed: FIXTURE_INSTALLED_BLOCKS });
  console.log(`\n[validate:happy-path] ${issues.length === 0 ? "OK" : `${issues.length} issue(s)`}`);
  for (const issue of issues) console.log(`  - [${issue.code}] ${issue.path}: ${issue.msg}`);

  const trace = simulateExecution(spec);
  await fs.writeFile(path.join(outDir, "03-happy-path-trace.json"), JSON.stringify(trace, null, 2));

  console.log(`\n[simulate] ${trace.length} step(s):`);
  for (const entry of trace) console.log(`  • ${entry.step} → ${entry.action}`);

  report.happyPath = {
    validationIssues: issues,
    traceLength: trace.length,
    trace,
  };

  // ---------- Adversarial cases ----------
  console.log(`\n--- Adversarial cases ---`);
  report.adversarial = {};
  for (const [label, advPrompt] of Object.entries(ADVERSARIAL_PROMPTS)) {
    const advFull = buildPrompt({ ...promptInput, userPrompt: advPrompt });
    await fs.writeFile(path.join(outDir, `04-adversarial-${label}.prompt.txt`), advFull);

    let advSpec;
    if (hasLiveClaude) {
      try {
        const { parsed } = await callClaude(advFull, `04-adversarial-${label}`);
        advSpec = parsed;
      } catch (err) {
        advSpec = { error: `claude-call-failed: ${err.message}` };
        await fs.writeFile(path.join(outDir, `04-adversarial-${label}.json`), JSON.stringify(advSpec, null, 2));
      }
    } else {
      // In fixture mode we can't test Claude's actual response — we
      // synthesize plausible failure payloads that the validator
      // should catch. This only proves the validator works; it does
      // NOT prove Claude will produce these specific failure shapes.
      advSpec = synthesizeFixtureAdversarial(label);
      await fs.writeFile(path.join(outDir, `04-adversarial-${label}.json`), JSON.stringify(advSpec, null, 2));
    }

    const advIssues = validateAgentSpec(advSpec, { contracts, tools, installed: FIXTURE_INSTALLED_BLOCKS });
    const caught = advSpec?.error !== undefined || advIssues.length > 0;
    console.log(`  ${label}: ${caught ? `CAUGHT (${advSpec?.error ? "model-declined" : advIssues.length + " validator issue(s)"})` : "MISSED"}`);
    for (const issue of advIssues) console.log(`    - [${issue.code}] ${issue.path}: ${issue.msg}`);
    report.adversarial[label] = { caught, spec: advSpec, issues: advIssues };
  }

  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nArtifacts: ${path.relative(process.cwd(), outDir)}`);
}

function synthesizeFixtureAdversarial(label) {
  switch (label) {
    case "hallucinatedBlock":
      // A plausibly-confused Claude would invoke a slack tool that doesn't exist.
      return {
        ...FIXTURE_AGENT_SPEC,
        steps: [
          ...FIXTURE_AGENT_SPEC.steps,
          {
            id: "notify-slack",
            type: "mcp_tool_call",
            tool: "send_slack_message",
            args: { channel: "#leads", text: "New lead: {{name}}" },
            next: null,
          },
        ],
      };
    case "vague":
      // A well-behaved Claude would return the error envelope we asked for.
      return { error: "Request is too vague to synthesize. Specify a trigger event and a desired outcome." };
    case "impossibleCapability":
      // No block supports FedEx — ideal behavior is declining.
      return { error: "FedEx physical mailing is not a supported capability in this workspace." };
    case "ambiguousRoute":
      // Claude might pick either; spec still validates, flag to highlight that
      // validator passes but user intent was under-specified.
      return {
        ...FIXTURE_AGENT_SPEC,
        steps: [
          FIXTURE_AGENT_SPEC.steps[0],
          {
            id: "send-sms",
            type: "mcp_tool_call",
            tool: "send_sms",
            args: { to: "{{phone}}", body: "Hi {{name}} — thanks!", contact_id: "{{contactId}}" },
            next: null,
          },
        ],
      };
    default:
      return { error: "unknown adversarial label" };
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
