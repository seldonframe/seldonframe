#!/usr/bin/env node
/* eslint-disable no-console */

// Re-verifies a regression dir against documented baselines using
// the canonical structural-hash function. No probe calls — purely
// re-hashes saved runN.json files.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const ARCHETYPES = [
  "speed-to-lead",
  "win-back",
  "review-requester",
  "daily-digest",
  "weather-aware-booking",
  "appointment-confirm-sms",
];

const BASELINES = {
  "speed-to-lead":           "735f9299ff111080",
  "win-back":                "72ea1438d6c4a691",
  "review-requester":        "4464ec782dfd7bad",
  "daily-digest":            "6e2e04637b8e0e49",
  "weather-aware-booking":   "f330b46ca684ac2b",
  "appointment-confirm-sms": "ef6060d76c617b04",
};

function canonicalTrigger(t) {
  if (!t || typeof t !== "object") return null;
  const out = { type: t.type, event: t.event ?? null };
  if (t.filter && typeof t.filter === "object") {
    out.filter_keys = Object.keys(t.filter).sort();
  }
  return out;
}

function canonicalStep(s) {
  if (!s || typeof s !== "object") return null;
  const out = { id: s.id, type: s.type, next: s.next ?? null };
  if (s.type === "wait") {
    out.seconds = typeof s.seconds === "number" ? s.seconds : null;
  } else if (s.type === "mcp_tool_call") {
    out.tool = s.tool;
    out.capture = s.capture ?? null;
    out.args_keys = s.args && typeof s.args === "object" ? Object.keys(s.args).sort() : null;
  } else if (s.type === "conversation") {
    out.channel = s.channel;
    if (s.on_exit && typeof s.on_exit === "object") {
      out.on_exit = {
        next: s.on_exit.next ?? null,
        extract_keys:
          s.on_exit.extract && typeof s.on_exit.extract === "object"
            ? Object.keys(s.on_exit.extract).sort()
            : null,
      };
    }
  }
  return out;
}

function structuralHash(spec) {
  const skeleton = {
    trigger: canonicalTrigger(spec.trigger),
    variables:
      Array.isArray(spec.variables) || typeof spec.variables !== "object" || spec.variables === null
        ? null
        : Object.keys(spec.variables).sort(),
    steps: Array.isArray(spec.steps) ? spec.steps.map(canonicalStep) : null,
  };
  return crypto.createHash("sha256").update(JSON.stringify(skeleton)).digest("hex").slice(0, 16);
}

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: verify-regression-from-saved.mjs <regression-dir>");
  process.exit(2);
}
const fullDir = path.resolve(repoRoot, "tasks/phase-7-archetype-probes", dir);

const results = {};
let totalMatches = 0;
let totalRuns = 0;

for (const archetype of ARCHETYPES) {
  results[archetype] = { hashes: [], baseline: BASELINES[archetype] };
  for (let i = 1; i <= 3; i++) {
    const p = path.resolve(fullDir, `${archetype}.run${i}.json`);
    try {
      const text = await fs.readFile(p, "utf8");
      const spec = JSON.parse(text);
      const h = structuralHash(spec);
      results[archetype].hashes.push(h);
      if (h === BASELINES[archetype]) totalMatches++;
      totalRuns++;
    } catch (e) {
      results[archetype].hashes.push(null);
      totalRuns++;
    }
  }
}

console.log("\nArchetype                | Baseline           | run1               | run2               | run3               | Verdict");
console.log("-------------------------|--------------------|--------------------|--------------------|--------------------|-------");
for (const archetype of ARCHETYPES) {
  const r = results[archetype];
  const verdict = r.hashes.every((h) => h === r.baseline) ? "✅ 3/3 PASS" : "❌ drift";
  const cells = r.hashes.map((h) => (h ?? "fail").padEnd(18)).join(" | ");
  console.log(`${archetype.padEnd(25)}| ${r.baseline.padEnd(18)} | ${cells} | ${verdict}`);
}
console.log(`\nTotal: ${totalMatches}/${totalRuns} baseline matches`);

const summaryPath = path.resolve(fullDir, "_summary.json");
await fs.writeFile(
  summaryPath,
  JSON.stringify({
    runDate: new Date().toISOString(),
    hashFunction: "structural (scripts/phase-7-spike/structural-hash.mjs convention)",
    baselines: BASELINES,
    results,
    totalMatches,
    totalRuns,
  }, null, 2),
);
console.log(`\nSummary written: ${path.relative(repoRoot, summaryPath)}`);
