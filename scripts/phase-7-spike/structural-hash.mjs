#!/usr/bin/env node
/* eslint-disable no-console */

// Structural-hash utility for archetype probe regression checks.
//
// Given a filled AgentSpec, produces a deterministic short hash over
// the STRUCTURAL skeleton only — step ids + types + tool names +
// captures + extract keys + next pointers + trigger shape + variable
// keys + conversation channel + on_exit.next + wait seconds.
//
// NL-generated copy (initial_message, body, subject, description,
// exit_when, arg values that interpolate runtime data) is STRIPPED
// before hashing. Claude's temperature isn't zero for text, so NL
// copy varies run-to-run even when the archetype Claude picks is
// identical. Hashing only the skeleton isolates determinism of the
// composition decision from the prose.
//
// Produces a 16-char prefix of sha256(JSON.stringify(skeleton))
// matching the convention in the prior regression reports
// (pr3-regression, booking-regression, email-regression, sms-regression).
//
// Usage:
//   node scripts/phase-7-spike/structural-hash.mjs <path-to-filled.json> [...more paths]
//
// Exits 0 always. Prints "<path> <hash>" per input.

import fs from "node:fs";
import crypto from "node:crypto";

function canonicalize(spec) {
  // Returns a canonical structural representation — stable under
  // NL-copy variation but sensitive to shape/tool/flow-graph changes.
  const out = {
    trigger: canonicalTrigger(spec.trigger),
    variables: Array.isArray(spec.variables) || typeof spec.variables !== "object" || spec.variables === null
      ? null
      : Object.keys(spec.variables).sort(),
    steps: Array.isArray(spec.steps) ? spec.steps.map(canonicalStep) : null,
  };
  return out;
}

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

function hashOf(spec) {
  const skeleton = canonicalize(spec);
  const bytes = crypto.createHash("sha256").update(JSON.stringify(skeleton)).digest("hex");
  return bytes.slice(0, 16);
}

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("Usage: structural-hash.mjs <path-to-filled.json> [...]");
  process.exit(2);
}

for (const p of paths) {
  const content = fs.readFileSync(p, "utf8");
  const spec = JSON.parse(content);
  const h = hashOf(spec);
  console.log(`${h}  ${p}`);
}
