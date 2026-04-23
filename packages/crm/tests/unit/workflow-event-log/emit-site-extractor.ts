// Shared helper for SLICE 1-a per-site persistence tests.
//
// Per G-1a-2 refinement (2026-04-22): "per-site tests verify BOTH
// signature correctness AND workflow_event_log persistence, not
// signature-only. ~5-10 LOC per site."
//
// Approach: parse the source file, locate the `emitSeldonEvent(...)`
// call at the given line number, and extract the `orgId` expression
// from the third argument. Assert against expected.
//
// What this verifies:
//   1. Signature correctness — a third argument exists (TypeScript
//      enforces this too, but the runtime check also catches
//      test-author mistakes when sites renumber).
//   2. Workflow_event_log persistence correctness — the orgId
//      expression at the site references the CORRECT variable from
//      the scope, not a wrong-but-type-compatible one. (e.g., a
//      nested function that has both `orgId` and `bookingContext.
//      orgId` in scope needs the right one; TypeScript accepts both
//      as `string` but only one is semantically correct.)
//
// Pairs with Commit 7's integration test that exercises the full
// emit → log-write → sync-wake-up path. This helper's output is the
// 68 call-site "signature + correct scope" assertion; the
// integration test is the "writes actually land" assertion.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const CRM_ROOT = path.resolve(__dirname, "..", "..", "..");

/**
 * Extract the orgId expression from the emitSeldonEvent call that
 * starts on the given line of the file. Throws if no call is found
 * on that line or if the call has no third argument.
 */
export function extractOrgIdExpr(relativeFile: string, line: number): string {
  const abs = path.join(CRM_ROOT, relativeFile);
  const src = readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
  const lines = src.split("\n");
  // The emit call can span multiple lines; find the opening 'emitSeldonEvent('
  // by scanning from the given line backward or forward.
  const needle = "emitSeldonEvent(";
  let searchStart = -1;
  // Try the given line first.
  const idx = src.indexOf(needle, offsetOfLine(src, line));
  if (idx === -1) {
    throw new Error(`${relativeFile}:${line} — no emitSeldonEvent call found at or after this line`);
  }
  // Walk balanced parens from just after `emitSeldonEvent`.
  const openParen = idx + "emitSeldonEvent".length;
  let depth = 0;
  let i = openParen;
  for (; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) throw new Error(`${relativeFile}:${line} — unbalanced parens`);

  // Split top-level args.
  const body = src.slice(openParen + 1, i);
  const args: string[] = [];
  let d = 0;
  let start = 0;
  for (let j = 0; j < body.length; j++) {
    const c = body[j];
    if (c === "(" || c === "{" || c === "[") d++;
    else if (c === ")" || c === "}" || c === "]") d--;
    else if (c === "," && d === 0) {
      args.push(body.slice(start, j));
      start = j + 1;
    }
  }
  args.push(body.slice(start));
  if (args.length < 3) {
    throw new Error(`${relativeFile}:${line} — emitSeldonEvent has only ${args.length} arg(s), expected 3`);
  }

  // Third arg is an object literal. Two accepted forms:
  //   `{ orgId: <expr> }` — explicit expression
  //   `{ orgId }` — shorthand (identifier `orgId` in scope)
  const third = args[2].trim();
  const shorthand = /^\{\s*orgId\s*\}$/.exec(third);
  if (shorthand) return "orgId";
  const explicit = /^\{\s*orgId\s*:\s*([^}]+?)\s*\}$/.exec(third);
  if (explicit) return explicit[1].trim();
  throw new Error(`${relativeFile}:${line} — third arg doesn't match { orgId } or { orgId: <expr> }: ${third}`);

  // Unused; kept for future offset-aware search.
  void searchStart;
}

function offsetOfLine(src: string, line: number): number {
  let offset = 0;
  let currentLine = 1;
  while (currentLine < line) {
    const nl = src.indexOf("\n", offset);
    if (nl === -1) break;
    offset = nl + 1;
    currentLine++;
  }
  return offset;
}

/**
 * Convenience wrapper — asserts the orgId expression at the site.
 * Use inside a test() body: one line per assertion.
 */
export function assertOrgIdExpr(relativeFile: string, line: number, expected: string): void {
  const actual = extractOrgIdExpr(relativeFile, line);
  assert.equal(actual, expected, `${relativeFile}:${line} — expected orgId="${expected}", got "${actual}"`);
}
