#!/usr/bin/env node
/* eslint-disable no-console */

// Runs probe-archetype.mjs 3 times for each archetype in a list,
// saves outputs as runN.json under the regression dir, computes
// structural hashes, and prints a comparison table vs. the
// expected baselines.
//
// Usage:
//   node scripts/phase-7-spike/run-regression-3x.mjs <regression-dir-name>
//
// Example:
//   node scripts/phase-7-spike/run-regression-3x.mjs slice-7-pr1-regression

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const probesRoot = path.resolve(repoRoot, "tasks/phase-7-archetype-probes");

const ARCHETYPES = [
  "speed-to-lead",
  "win-back",
  "review-requester",
  "daily-digest",
  "weather-aware-booking",
];

// Expected baselines per SLICE 6 PR 2 close-out (commit 4e57cbe9).
const BASELINES = {
  "speed-to-lead":          "735f9299ff111080",
  "win-back":               "72ea1438d6c4a691",
  "review-requester":       "4464ec782dfd7bad",
  "daily-digest":           "6e2e04637b8e0e49",
  "weather-aware-booking":  "f330b46ca684ac2b",
};

const regressionDir = process.argv[2];
if (!regressionDir) {
  console.error("Usage: run-regression-3x.mjs <regression-dir-name>");
  process.exit(2);
}

const outDir = path.resolve(probesRoot, regressionDir);
await fs.mkdir(outDir, { recursive: true });

// Structural hash — strips NL-generated copy (initial_message,
// body, subject, exit_when, arg values). Matches the convention
// used in scripts/phase-7-spike/structural-hash.mjs since pr3-
// regression. The full-spec hash varies run-to-run because
// Claude's prose isn't temperature-zero; the structural skeleton
// is the durable invariant the streak tracks.
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

function structuralCanonicalize(spec) {
  return {
    trigger: canonicalTrigger(spec.trigger),
    variables:
      Array.isArray(spec.variables) || typeof spec.variables !== "object" || spec.variables === null
        ? null
        : Object.keys(spec.variables).sort(),
    steps: Array.isArray(spec.steps) ? spec.steps.map(canonicalStep) : null,
  };
}

function stableHash(obj) {
  const canonical = JSON.stringify(structuralCanonicalize(obj));
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

async function runProbe(archetype) {
  // Spawns the probe script, which writes
  // tasks/phase-7-archetype-probes/<archetype>.filled.json on success.
  return await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/phase-7-spike/probe-archetype.mjs", archetype],
      { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.stdout.on("data", () => {}); // discard
    child.on("close", (code) => {
      if (code === 0) resolve(null);
      else reject(new Error(`probe exited ${code}: ${stderr}`));
    });
  });
}

async function loadFilledForArchetype(archetype) {
  const p = path.resolve(probesRoot, `${archetype}.filled.json`);
  const text = await fs.readFile(p, "utf8");
  return JSON.parse(text);
}

const results = {};

for (const archetype of ARCHETYPES) {
  console.log(`\n[${archetype}] running 3 probes...`);
  results[archetype] = { runs: [], hashes: [] };
  for (let i = 1; i <= 3; i++) {
    process.stdout.write(`  run ${i}/3... `);
    try {
      await runProbe(archetype);
      const filled = await loadFilledForArchetype(archetype);
      const hash = stableHash(filled);
      const dest = path.resolve(outDir, `${archetype}.run${i}.json`);
      await fs.writeFile(dest, JSON.stringify(filled, null, 2));
      results[archetype].runs.push(dest);
      results[archetype].hashes.push(hash);
      console.log(`hash=${hash}`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      results[archetype].hashes.push(null);
    }
  }
}

// Print comparison table.
console.log("\n=== RESULTS ===\n");
console.log("Archetype                | Baseline           | run1               | run2               | run3               | Verdict");
console.log("------------------------|--------------------|--------------------|--------------------|--------------------|-------");
let totalMatches = 0;
let totalRuns = 0;
for (const archetype of ARCHETYPES) {
  const baseline = BASELINES[archetype] ?? "?";
  const hashes = results[archetype].hashes;
  let verdict = "?";
  if (hashes.every((h) => h === baseline)) {
    verdict = "✅ 3/3 PASS";
    totalMatches += 3;
  } else if (hashes.every((h) => h === hashes[0]) && hashes[0]) {
    verdict = `🟡 3/3 stable @ ${hashes[0]} ≠ baseline`;
    totalMatches += hashes.filter((h) => h === baseline).length;
  } else {
    verdict = "❌ unstable";
    totalMatches += hashes.filter((h) => h === baseline).length;
  }
  totalRuns += hashes.length;
  console.log(`${archetype.padEnd(24)}| ${baseline.padEnd(18)} | ${(hashes[0] ?? "fail").padEnd(18)} | ${(hashes[1] ?? "fail").padEnd(18)} | ${(hashes[2] ?? "fail").padEnd(18)} | ${verdict}`);
}

console.log(`\nTotal: ${totalMatches}/${totalRuns} baseline matches`);

// Write a JSON summary for the close-out report to consume.
await fs.writeFile(
  path.resolve(outDir, "_summary.json"),
  JSON.stringify({
    runDate: new Date().toISOString(),
    baselines: BASELINES,
    results,
    totalMatches,
    totalRuns,
  }, null, 2),
);
console.log(`\nSummary written to ${path.relative(repoRoot, path.resolve(outDir, "_summary.json"))}`);
