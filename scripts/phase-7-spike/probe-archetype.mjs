#!/usr/bin/env node
/* eslint-disable no-console */

// Per-archetype live probe. Usage:
//   node scripts/phase-7-spike/probe-archetype.mjs <archetype-id> [nl-customization]
//
// Example:
//   node scripts/phase-7-spike/probe-archetype.mjs speed-to-lead \
//     "Text new dental patients within 2 minutes of form submission"
//
// What it does:
// 1. Loads the archetype template from packages/crm/src/lib/agents/archetypes/
// 2. Asks Claude to fill every $placeholder using Soul + tool-catalog context
//    + the optional NL customization sentence.
// 3. Validates the filled spec against the spike's AgentSpec validator.
// 4. Writes a per-archetype report under tasks/phase-7-archetype-probes/.
//
// Output files:
//   tasks/phase-7-archetype-probes/<archetype-id>.filled.json
//   tasks/phase-7-archetype-probes/<archetype-id>.raw.txt
//   tasks/phase-7-archetype-probes/<archetype-id>.report.md

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const outDir = path.resolve(repoRoot, "tasks/phase-7-archetype-probes");

// ---------------------------------------------------------------------------
// 0. Env setup + SDK load (reuses run-live.mjs's conventions).
// ---------------------------------------------------------------------------

for (const candidate of [path.resolve(repoRoot, ".env.local"), path.resolve(repoRoot, ".env")]) {
  try {
    if (typeof process.loadEnvFile === "function") {
      process.loadEnvFile(candidate);
      break;
    }
  } catch {
    /* file missing / unreadable */
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "\nError: ANTHROPIC_API_KEY is not set. Run `vercel env pull .env.local` first.\n",
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
    `\nError: could not load @anthropic-ai/sdk from packages/crm/node_modules. Reason: ${err.message}\n`,
  );
  process.exit(2);
}

const anthropic = new Anthropic();
const MODEL = "claude-opus-4-7";

// ---------------------------------------------------------------------------
// 1. Inputs: archetype id + optional NL customization.
// ---------------------------------------------------------------------------

const [archetypeId, ...rest] = process.argv.slice(2);
const customization = rest.join(" ").trim();

if (!archetypeId) {
  console.error(
    "\nUsage: node scripts/phase-7-spike/probe-archetype.mjs <archetype-id> [customization]\n" +
      "Example: node scripts/phase-7-spike/probe-archetype.mjs speed-to-lead\n",
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// 2. Load archetype definition from source. The archetype files are
//    TypeScript; we parse their JSON-ish contents via tsx-style import.
//    To keep the probe script SDK-free, we hand-parse the exported
//    object with a tiny ESM import. TypeScript files can be imported
//    into Node if they're plain enough; we expose a runtime-friendly
//    mirror by dynamic-importing from a .mjs wrapper when the TS
//    module doesn't have a one.
// ---------------------------------------------------------------------------

async function loadArchetype(id) {
  // Read the TS source file directly and extract the AgentSpec template +
  // placeholder metadata via regex-matching on the exported object.
  // Simpler than spinning up ts-node inside a spike script.
  const tsPath = path.resolve(repoRoot, `packages/crm/src/lib/agents/archetypes/${id}.ts`);
  try {
    await fs.access(tsPath);
  } catch {
    throw new Error(`Archetype "${id}" not found at ${path.relative(process.cwd(), tsPath)}`);
  }

  const source = await fs.readFile(tsPath, "utf8");

  // Hand-parse: the archetype file's default export is a const object
  // literal. Locate the `specTemplate: { ... }` and `placeholders: { ... }`
  // via bracket-matching.
  const specTemplate = extractObjectLiteral(source, "specTemplate");
  const placeholdersRaw = extractObjectLiteral(source, "placeholders");
  const nameMatch = source.match(/name:\s*"([^"]+)"/);
  const requiresMatch = source.match(/requiresInstalled:\s*\[([^\]]*)\]/);
  const requires = requiresMatch ? requiresMatch[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean) : [];

  return {
    id,
    name: nameMatch?.[1] ?? id,
    requiresInstalled: requires,
    specTemplate: JSON.parse(specTemplate),
    placeholdersSource: placeholdersRaw,
  };
}

// Find an `<name>: {` … `}` block in the source and return its body as
// a JSON string. Tolerates trailing commas + TS object literal syntax;
// emits JSON by quoting keys + removing comments.
function extractObjectLiteral(source, key) {
  const keyRe = new RegExp(`\\b${key}\\s*:\\s*\\{`);
  const match = keyRe.exec(source);
  if (!match) throw new Error(`Could not find "${key}:" in archetype source`);

  let depth = 1;
  let i = match.index + match[0].length;
  const start = match.index + match[0].length - 1;
  while (depth > 0 && i < source.length) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === '"') {
      i += 1;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === "\\") i += 2;
        else i += 1;
      }
    }
    i += 1;
  }

  const raw = source.slice(start, i);
  // Convert TypeScript object literal to JSON: quote bare keys, strip
  // trailing commas, strip comments. Good enough for the constrained
  // shapes the archetype files use.
  return tsLiteralToJson(raw);
}

function tsLiteralToJson(literal) {
  // Remove // line comments and /* */ block comments.
  let out = literal.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  // Quote bare keys: look for `{` or `,` followed by whitespace + bare key + `:`
  out = out.replace(/([\{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');
  // Strip trailing commas.
  out = out.replace(/,(\s*[}\]])/g, "$1");
  return out;
}

// ---------------------------------------------------------------------------
// 3. Load the tool catalog + block contracts (identical logic to
//    run-live.mjs so the synthesis context mirrors the baseline run).
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

async function loadBlockManifests() {
  const out = {};
  for (const slug of CORE_BLOCKS) {
    const raw = await fs.readFile(path.join(repoRoot, "packages/crm/src/blocks", `${slug}.block.md`), "utf8");
    const section = raw.split(/^## Composition Contract\s*$/im)[1];
    if (!section) {
      out[slug] = { slug, contract: null };
      continue;
    }
    const body = section.split(/^## /m)[0];
    const take = (key) => {
      const m = body.match(new RegExp(`^${key}:\\s*(.+?)$`, "im"));
      if (!m) return [];
      let v = m[1].trim();
      if (v.startsWith("[") && v.endsWith("]")) v = v.slice(1, -1);
      return v.split(",").map((s) => s.trim()).filter(Boolean);
    };
    out[slug] = {
      slug,
      contract: {
        produces: take("produces"),
        consumes: take("consumes"),
        verbs: take("verbs"),
        composeWith: take("compose_with"),
      },
    };
  }
  return out;
}

async function loadToolCatalog() {
  const raw = await fs.readFile(path.join(repoRoot, "skills/mcp-server/src/tools.js"), "utf8");
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

// Fixture Soul (same as run-live.mjs — dental clinic).
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

const FIXTURE_FORM_ID = "form_new_patient_intake";
const FIXTURE_APPOINTMENT_TYPE_ID = "appt_new_patient_consult";

// ---------------------------------------------------------------------------
// 4. Build the synthesis prompt — give Claude the archetype template,
//    known placeholder metadata, Soul, tool catalog, and ask it to fill
//    every $placeholder with concrete values.
// ---------------------------------------------------------------------------

function buildPrompt({ archetype, soul, contracts, tools, customization }) {
  const contractLines = Object.entries(contracts).map(([slug, info]) => {
    const c = info.contract;
    if (!c) return `- ${slug}: (no contract)`;
    return `- ${slug}:
    produces: [${c.produces.join(", ")}]
    verbs: [${c.verbs.join(", ")}]`;
  });

  const toolLines = tools.map((t) => `- ${t.name}: ${t.description}`);

  return `You are filling placeholders in a pre-validated AgentSpec archetype. Do NOT change the structural shape — only replace $placeholder tokens with concrete values.

## Archetype
Name: ${archetype.name}
ID: ${archetype.id}
Requires installed: ${archetype.requiresInstalled.join(", ")}

## Placeholder metadata (TypeScript source)
${archetype.placeholdersSource}

## AgentSpec template (what to fill)
${JSON.stringify(archetype.specTemplate, null, 2)}

## Workspace Soul
${JSON.stringify(soul, null, 2)}

## Block composition contracts (reference only — DO NOT invent new tool calls)
${contractLines.join("\n")}

## MCP tool catalog (all tools currently present)
${toolLines.join("\n")}

## Fixture IDs (use these literal values for user_input placeholders)
- $formId → "${FIXTURE_FORM_ID}"
- $appointmentTypeId → "${FIXTURE_APPOINTMENT_TYPE_ID}"

## Customization (optional NL guidance; ignore if empty)
${customization || "(none — use Soul-only tone for copy fields)"}

## Task
Return the same AgentSpec template with every $placeholder token replaced by a concrete value:
- user_input placeholders → literal strings (use the fixture IDs above).
- soul_copy placeholders → short, on-brand, matches the Soul tone. Keep the quality you'd use in production — no lorem ipsum, no "[TODO]".
- Integer placeholders (like $waitSeconds) → bare numbers (not strings).

Do NOT change step ids, tool names, step types, or structural keys. Return ONLY the filled AgentSpec as JSON — no markdown fences, no commentary. If a placeholder is ambiguous enough that you'd have to invent something unsupported, return {"error": "<reason>"} instead.`;
}

// ---------------------------------------------------------------------------
// 5. Validator — mirrors the run-live.mjs / synthesis.mjs rules.
// ---------------------------------------------------------------------------

const VALID_STEP_TYPES = new Set(["mcp_tool_call", "wait", "conversation", "branch", "end"]);

function validateAgentSpec(spec, { tools }) {
  const issues = [];
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    issues.push({ code: "not_object", path: "$", msg: "spec is not an object" });
    return issues;
  }
  if (spec.error) return [{ code: "model_declined", path: "$", msg: String(spec.error) }];

  if (typeof spec.name !== "string") issues.push({ code: "bad_name", path: "name", msg: "missing or non-string" });
  if (typeof spec.description !== "string") issues.push({ code: "bad_description", path: "description", msg: "missing or non-string" });

  const toolNames = new Set(tools.map((t) => t.name));

  if (!spec.trigger || typeof spec.trigger !== "object") {
    issues.push({ code: "bad_trigger", path: "trigger", msg: "missing" });
  }

  if (!Array.isArray(spec.steps)) {
    issues.push({ code: "bad_steps", path: "steps", msg: "not an array" });
    return issues;
  }

  const stepIds = new Set();
  const unresolvedPlaceholderRe = /\$[A-Za-z_][A-Za-z0-9_]*/;

  for (const step of spec.steps) {
    if (!step || typeof step !== "object") continue;
    if (typeof step.id !== "string") {
      issues.push({ code: "missing_step_id", path: "steps[?]", msg: "missing id" });
      continue;
    }
    stepIds.add(step.id);
    if (!VALID_STEP_TYPES.has(step.type)) {
      issues.push({ code: "bad_step_type", path: `steps.${step.id}.type`, msg: `unknown step type "${step.type}"` });
    }
    if (step.type === "mcp_tool_call") {
      if (!toolNames.has(step.tool)) {
        issues.push({ code: "unknown_tool", path: `steps.${step.id}.tool`, msg: `tool "${step.tool}" is not in the MCP catalog` });
      }
    }

    // Unresolved $placeholder detector. Runs on string fields anywhere
    // in the step.
    JSON.stringify(step, (_key, value) => {
      if (typeof value === "string" && unresolvedPlaceholderRe.test(value)) {
        issues.push({
          code: "unresolved_placeholder",
          path: `steps.${step.id}`,
          msg: `string contains unresolved placeholder: ${value.match(unresolvedPlaceholderRe)[0]}`,
        });
      }
      return value;
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 6. Claude call.
// ---------------------------------------------------------------------------

async function callClaude(prompt) {
  const startedAt = Date.now();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    system:
      "You are filling placeholders in a pre-validated AgentSpec archetype. Do not change structure. Return only JSON.",
    messages: [{ role: "user", content: prompt }],
  });
  const elapsedMs = Date.now() - startedAt;

  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

  let parsed;
  let parseError = null;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    parseError = err.message;
  }

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const cost = (inputTokens * 5 + outputTokens * 25) / 1_000_000;

  return { parsed, parseError, raw: text, elapsedMs, usage: { inputTokens, outputTokens, cost } };
}

// ---------------------------------------------------------------------------
// 7. Main.
// ---------------------------------------------------------------------------

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  console.log(`\nPhase 7.c archetype probe`);
  console.log(`  archetype: ${archetypeId}`);
  console.log(`  customization: ${customization || "(none)"}`);

  const archetype = await loadArchetype(archetypeId);
  const contracts = await loadBlockManifests();
  const tools = await loadToolCatalog();
  console.log(`  loaded: ${Object.keys(contracts).length} contracts, ${tools.length} tools`);

  const prompt = buildPrompt({ archetype, soul: FIXTURE_SOUL, contracts, tools, customization });
  await fs.writeFile(path.join(outDir, `${archetypeId}.prompt.txt`), prompt);

  console.log(`  → calling Claude (model: ${MODEL})…`);
  const result = await callClaude(prompt);

  await fs.writeFile(path.join(outDir, `${archetypeId}.raw.txt`), result.raw);
  if (result.parsed !== undefined) {
    await fs.writeFile(path.join(outDir, `${archetypeId}.filled.json`), JSON.stringify(result.parsed, null, 2));
  }

  const issues = result.parsed ? validateAgentSpec(result.parsed, { tools }) : [];
  const passed = !result.parseError && issues.length === 0;

  console.log(
    `  ${passed ? "PASS" : "FAIL"} · ${result.usage.inputTokens}/${result.usage.outputTokens} tok · $${result.usage.cost.toFixed(4)} · ${result.elapsedMs}ms · issues=${issues.length}`,
  );
  for (const issue of issues) console.log(`    - [${issue.code}] ${issue.path}: ${issue.msg}`);

  const md = [
    `# Archetype probe: ${archetype.name} (${archetype.id})`,
    "",
    `**Generated:** ${new Date().toISOString()}`,
    `**Model:** ${MODEL}`,
    `**Input tokens:** ${result.usage.inputTokens} · **Output tokens:** ${result.usage.outputTokens} · **Cost:** $${result.usage.cost.toFixed(4)} · **Latency:** ${result.elapsedMs}ms`,
    `**Customization prompt:** ${customization ? `"${customization}"` : "(none)"}`,
    "",
    `## Verdict: ${passed ? "PASS" : "FAIL"}`,
    "",
    passed
      ? "Synthesis filled every placeholder cleanly. No unresolved $tokens, no unknown tools, no structural drift."
      : "Synthesis did NOT produce a valid filled spec — see issues below.",
    "",
    "## Validator issues",
    "",
    issues.length === 0 ? "_none_" : issues.map((i) => `- [\`${i.code}\`] ${i.path}: ${i.msg}`).join("\n"),
    "",
    "## Raw artifacts",
    "",
    `- \`${archetypeId}.prompt.txt\` — full prompt sent to Claude`,
    `- \`${archetypeId}.raw.txt\` — raw Claude response`,
    `- \`${archetypeId}.filled.json\` — parsed AgentSpec (when JSON parse succeeded)`,
    "",
  ].join("\n");

  await fs.writeFile(path.join(outDir, `${archetypeId}.report.md`), md);

  console.log(`\nReport: ${path.relative(process.cwd(), path.join(outDir, `${archetypeId}.report.md`))}`);
  // Set exitCode and let Node drain the event loop naturally. Using
  // process.exit() here races libuv's cleanup of the Anthropic SDK's
  // keep-alive HTTPS sockets on Windows, triggering a cosmetic
  // "UV_HANDLE_CLOSING" assertion after the report is already written.
  // Natural exit avoids it.
  process.exitCode = passed ? 0 : 1;
}

main().catch((err) => {
  console.error("\nFatal error during archetype probe:");
  console.error(err);
  process.exitCode = 1;
});
