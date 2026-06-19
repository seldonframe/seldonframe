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

// ─── line-number-INDEPENDENT extraction ──────────────────────────────────────
//
// The line-anchored helpers above are brittle: any edit above an emit site
// shifts every line number below it, so the assertions silently start checking
// the wrong call (extractOrgIdExpr finds the FIRST emit at-or-after the line).
// 2026-06-19: bookings/actions.ts grew ~400 lines and the two
// submitPublicBookingAction sites drifted from 894/1001 to 1513/1811, breaking
// the spec.
//
// These helpers instead locate an emit site by WHAT it is — its event-name
// string literal and the function that encloses it — so they survive code
// moving around. Same parse/balanced-paren machinery as extractOrgIdExpr; only
// the "which site" selection changed.

export type EmitSite = {
  /** The event-name string-literal first argument (e.g. "booking.created"). */
  event: string;
  /** The orgId expression from the third argument ({ orgId } | { orgId: X }). */
  orgIdExpr: string;
  /** Name of the nearest enclosing `function`/`async function` declaration, or
   *  null if the site is at module scope. Used to disambiguate two emits of the
   *  same event in different functions. */
  enclosingFn: string | null;
};

/**
 * Parse every `emitSeldonEvent(...)` call in a file and return each site's
 * event name, orgId expression, and enclosing function name. Line-independent.
 */
export function findEmitSites(relativeFile: string): EmitSite[] {
  const abs = path.join(CRM_ROOT, relativeFile);
  const src = readFileSync(abs, "utf8").replace(/\r\n/g, "\n");

  const sites: EmitSite[] = [];
  const needle = "emitSeldonEvent(";
  let from = 0;
  for (;;) {
    const idx = src.indexOf(needle, from);
    if (idx === -1) break;
    from = idx + needle.length;

    // Walk balanced parens from just after `emitSeldonEvent`.
    const openParen = idx + "emitSeldonEvent".length;
    let depth = 0;
    let i = openParen;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) {
      throw new Error(`${relativeFile} — unbalanced parens for emitSeldonEvent at offset ${idx}`);
    }

    const args = splitTopLevelArgs(src.slice(openParen + 1, i));
    if (args.length < 3) {
      throw new Error(
        `${relativeFile} — emitSeldonEvent at offset ${idx} has ${args.length} arg(s), expected 3`,
      );
    }

    const event = parseStringLiteral(args[0].trim());
    if (event === null) {
      throw new Error(
        `${relativeFile} — emitSeldonEvent at offset ${idx} first arg is not a string literal: ${args[0].trim()}`,
      );
    }

    sites.push({
      event,
      orgIdExpr: parseOrgIdArg(args[2].trim(), `${relativeFile}@${idx}`),
      enclosingFn: enclosingFunctionName(src, idx),
    });

    from = i + 1;
  }

  return sites;
}

/**
 * Assert the orgId expression of THE emit site matching `event` (and, when
 * given, `inFunction`). Throws if zero or more than one site matches — an
 * ambiguous match means the disambiguator is wrong, which is itself a useful
 * failure (better than silently asserting the wrong site).
 */
export function assertEmitOrgId(
  relativeFile: string,
  selector: { event: string; inFunction?: string },
  expected: string,
): void {
  const all = findEmitSites(relativeFile);
  const matches = all.filter(
    (s) =>
      s.event === selector.event &&
      (selector.inFunction === undefined || s.enclosingFn === selector.inFunction),
  );
  const where = selector.inFunction ? ` in ${selector.inFunction}()` : "";
  assert.equal(
    matches.length,
    1,
    `${relativeFile} — expected exactly 1 emitSeldonEvent("${selector.event}")${where}, found ${matches.length}`,
  );
  assert.equal(
    matches[0]!.orgIdExpr,
    expected,
    `${relativeFile} — emitSeldonEvent("${selector.event}")${where}: expected orgId="${expected}", got "${matches[0]!.orgIdExpr}"`,
  );
}

// ─── internal parse helpers (shared shape with extractOrgIdExpr) ─────────────

/** Split a call's argument list on top-level commas (depth-0). */
function splitTopLevelArgs(body: string): string[] {
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
  return args;
}

/** Extract the orgId expression from a `{ orgId }` / `{ orgId: <expr> }` arg. */
function parseOrgIdArg(third: string, ctx: string): string {
  const shorthand = /^\{\s*orgId\s*\}$/.exec(third);
  if (shorthand) return "orgId";
  const explicit = /^\{\s*orgId\s*:\s*([^}]+?)\s*\}$/.exec(third);
  if (explicit) return explicit[1].trim();
  throw new Error(`${ctx} — third arg doesn't match { orgId } or { orgId: <expr> }: ${third}`);
}

/** Read a single/double-quoted string literal, or null if not one. */
function parseStringLiteral(raw: string): string | null {
  const m = /^(['"])((?:\\.|[^\\])*?)\1$/.exec(raw);
  return m ? m[2] : null;
}

/**
 * Name of the nearest `function NAME(` / `async function NAME(` declaration
 * whose `{` body opens before `offset` and whose matching `}` closes after it.
 * Walks declarations in source order, tracking the innermost enclosing one.
 * Good enough for the top-level server-action functions these specs cover
 * (it does not model arrow-function consts, which none of the asserted sites
 * use as their immediate encloser).
 */
function enclosingFunctionName(src: string, offset: number): string | null {
  const declRe = /(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g;
  let best: string | null = null;
  let bestBodyStart = -1;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(src)) !== null) {
    if (m.index >= offset) break; // declaration starts after the site
    // The regex ends just after the param-list's opening `(`. Walk to the
    // MATCHING `)` so we skip over object-destructured params like
    // `function foo({ a, b }: T)` — otherwise the next `{` we'd find is the
    // param-destructuring brace, not the function body, and the body range
    // collapses to the param list (the original bug that hid the two
    // submitPublicBookingAction sites).
    const paramOpen = declRe.lastIndex - 1; // index of the `(`
    let pd = 0;
    let p = paramOpen;
    for (; p < src.length; p++) {
      if (src[p] === "(") pd++;
      else if (src[p] === ")") {
        pd--;
        if (pd === 0) break;
      }
    }
    // Now find the function body's opening brace after the param list.
    const braceStart = src.indexOf("{", p);
    if (braceStart === -1) continue;
    // Walk to the matching close brace.
    let depth = 0;
    let k = braceStart;
    for (; k < src.length; k++) {
      if (src[k] === "{") depth++;
      else if (src[k] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const braceEnd = k;
    // The site is enclosed by this fn iff its offset is inside [braceStart, braceEnd].
    // Prefer the innermost (latest-starting) enclosing body.
    if (braceStart < offset && offset < braceEnd && braceStart > bestBodyStart) {
      best = m[1];
      bestBodyStart = braceStart;
    }
  }
  return best;
}
