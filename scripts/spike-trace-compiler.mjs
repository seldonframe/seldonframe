#!/usr/bin/env node
// Spike: run the record-to-agent trace compiler against a REAL folder of
// JPEG keyframes + a transcript JSON, outside the whole capture/upload/route
// pipeline — useful for iterating on the compileTrace prompt/schema without
// a browser, a session token, or a Postgres row.
//
// Requires `tsx` (this repo's dep) so the .ts modules under
// packages/crm/src/lib/recordings resolve directly, no build step.
//
// Usage (PowerShell):
//   $env:ANTHROPIC_API_KEY = "sk-ant-…"
//   node --import tsx scripts/spike-trace-compiler.mjs --frames .\my-frames --transcript .\my-transcript.json --label "Happy path"
//
// Usage (bash):
//   ANTHROPIC_API_KEY=sk-ant-… node --import tsx scripts/spike-trace-compiler.mjs \
//     --frames ./my-frames --transcript ./my-transcript.json --label "Happy path"
//
// --frames       directory of .jpg/.jpeg files (read in sorted filename order)
// --transcript   a JSON file: an array of { atMs: number, text: string }
// --label        optional label for the recording (e.g. "Edge case: no email")
//
// Prints the parsed WorkflowTrace JSON, then a human summary (step/branch/
// open-question counts). Never writes anywhere — read-only against the
// filesystem, network-only against Anthropic.

import { readdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

function parseArgs(argv) {
  const out = { frames: null, transcript: null, label: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--frames") out.frames = argv[++i];
    else if (arg === "--transcript") out.transcript = argv[++i];
    else if (arg === "--label") out.label = argv[++i];
  }
  return out;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ERROR: set ANTHROPIC_API_KEY before running.");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  if (!args.frames || !args.transcript) {
    console.error("Usage: node --import tsx scripts/spike-trace-compiler.mjs --frames <dir> --transcript <json file> [--label <s>]");
    process.exit(1);
  }

  const framesDir = resolve(args.frames);
  const imageFiles = readdirSync(framesDir)
    .filter((f) => [".jpg", ".jpeg"].includes(extname(f).toLowerCase()))
    .sort();
  if (imageFiles.length === 0) {
    console.error(`ERROR: no .jpg/.jpeg files found in ${framesDir}`);
    process.exit(1);
  }
  const frames = imageFiles.map((f) => ({
    base64: readFileSync(join(framesDir, f)).toString("base64"),
  }));

  const transcriptRaw = JSON.parse(readFileSync(resolve(args.transcript), "utf8"));
  const transcript = Array.isArray(transcriptRaw) ? transcriptRaw : [];

  const { makeAnthropicTraceLlm } = await import("../packages/crm/src/lib/recordings/trace-llm.ts");
  const { compileTrace } = await import("../packages/crm/src/lib/recordings/trace-compiler.ts");

  const llm = makeAnthropicTraceLlm({ apiKey });

  console.log(`Compiling ${frames.length} frame(s), ${transcript.length} transcript segment(s)...`);
  const result = await compileTrace({ frames, transcript, label: args.label, llm });

  if (!result.ok) {
    console.error("compileTrace FAILED:", result.error);
    process.exit(1);
  }

  console.log(JSON.stringify(result.trace, null, 2));
  console.log("\n--- summary ---");
  console.log(`title: ${result.trace.title}`);
  console.log(`steps: ${result.trace.steps.length}`);
  console.log(`branches: ${result.trace.branches.length}`);
  console.log(`open questions: ${result.trace.openQuestions.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
