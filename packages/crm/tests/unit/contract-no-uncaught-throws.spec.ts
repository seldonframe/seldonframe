// ============================================================================
// v1.9.0 — server-action / page / auth-helper throw contract
// ============================================================================
//
// Bug class this test exists to prevent (3 instances shipped this week):
//
//   v1.4.2 — Cinder & Salt: booking persist wiped form_fields name+email.
//   v1.7.3 — Dashboard `Unauthorized`: getBillingUserById threw on missing
//            users row, cascaded through SSR boundary.
//   v1.8.1 — Billing portal `No Stripe customer`: action threw on free
//            tier instead of redirecting.
//
// All three are the same shape: a server-side function `throw new Error()`s
// for a predictable user/workspace state, and the throw cascades to the
// frontend as "This page couldn't load."
//
// The contract: in user-reachable server-side code, every `throw new
// Error()` must EITHER be annotated with `// contract:throw-ok` (with a
// reason) explaining why this throw is safe, OR be wrapped in a try/catch
// that converts to a structured response.
//
// Scoped files (where the bug class actually shows up):
//
//   lib/billing/**.ts          — billing actions called from forms
//   lib/auth/**.ts             — auth helpers used by every dashboard page
//   lib/page-blocks/persist.ts — the v2 persist path (Cinder & Salt class)
//   app/(dashboard)/**/page.tsx — server components rendered to the user
//
// Out of scope for now:
//
//   - lib/agents/, lib/blueprint/, lib/blocks/ — these are deeper internals
//     where most throws are legitimate programmer-error checks. The bugs
//     we've actually shipped came from the four directories above.
//
// To add a new throw: prepend `// contract:throw-ok: <reason>` immediately
// above. Examples:
//   // contract:throw-ok: programmer error — this branch is unreachable
//   //   if buildBlueprint produced a valid Blueprint, validated upstream
//   throw new Error("Blueprint missing landing.sections");
//
// To add a new file to the scope: append its prefix to SCOPED_DIRS below.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");

/** File-prefix paths (relative to packages/crm/) where this contract is
 *  enforced. Adding a new path means walking that subtree and either
 *  fixing or annotating every existing throw. Worth doing one
 *  directory at a time. */
const SCOPED_DIRS = [
  "src/lib/billing",
  "src/lib/auth",
  "src/lib/page-blocks/persist.ts",
  "src/app/(dashboard)",
];

/** Annotation marker — when present on the line immediately above a
 *  throw (or inline trailing the throw), the throw is allowed. The
 *  format is `// contract:throw-ok` followed by an optional reason.
 *  Reasons aren't enforced but help future readers. */
const ANNOTATION_RE = /\/\/\s*contract:throw-ok/i;

/** Pattern we're looking for. Matches `throw new Error(` and `throw new
 *  TypeError(` etc. — anything that bubbles out as a thrown Error. */
const THROW_RE = /\bthrow\s+new\s+(\w+Error|Error)\b/;

interface Violation {
  file: string;
  line: number;
  preview: string;
}

function walkDir(dir: string, out: string[]): void {
  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip __generated__ — those are emitted, not author-written.
      if (entry.name === "__generated__") continue;
      // Skip node_modules just in case.
      if (entry.name === "node_modules") continue;
      walkDir(full, out);
    } else if (entry.isFile()) {
      if (
        full.endsWith(".ts") ||
        full.endsWith(".tsx")
      ) {
        out.push(full);
      }
    }
  }
}

function collectScopedFiles(): string[] {
  const all: string[] = [];
  for (const rel of SCOPED_DIRS) {
    const abs = join(ROOT, rel);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walkDir(abs, all);
    } else if (stat.isFile() && (abs.endsWith(".ts") || abs.endsWith(".tsx"))) {
      all.push(abs);
    }
  }
  return all;
}

/**
 * Scan a file for unannotated throws. A throw is "annotated" when the
 * preceding non-blank line OR the throw line itself contains the
 * `// contract:throw-ok` marker.
 *
 * The "previous non-blank line" rule lets the annotation sit either
 * directly above (most common) or trailing the throw line itself. We
 * skip pure-comment lines that aren't the annotation so multi-line
 * comment blocks above don't accidentally satisfy the contract.
 */
function findViolations(file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const violations: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!THROW_RE.test(line)) continue;

    // Annotation on the same line (trailing).
    if (ANNOTATION_RE.test(line)) continue;

    // Annotation anywhere in the contiguous comment block immediately
    // above the throw. Multi-line `// comment` annotations are common
    // (the marker line + the reason on the next 2-3 lines), so we
    // scan upward through consecutive blank-or-`//`-prefixed lines
    // and check each for the marker.
    let annotated = false;
    for (let prevIdx = i - 1; prevIdx >= 0; prevIdx--) {
      const prev = lines[prevIdx];
      const trimmed = prev.trim();
      if (trimmed === "") continue;
      if (!trimmed.startsWith("//")) break; // non-comment line — stop scanning
      if (ANNOTATION_RE.test(prev)) {
        annotated = true;
        break;
      }
    }
    if (annotated) continue;

    // Heuristic: throw inside a try block. Walk backward looking for
    // `try {` before hitting a function boundary or top-of-file.
    // This is intentionally loose — we'd rather under-flag (skip a
    // try-catched throw) than over-flag (false-positive a legitimate
    // catch). Operators add the annotation when the heuristic misses.
    let depth = 0;
    let inTry = false;
    for (let j = i - 1; j >= Math.max(0, i - 100); j--) {
      const prev = lines[j];
      // Hit a function boundary — stop walking up; not in a try.
      if (/^\s*(export\s+)?(async\s+)?function\b/.test(prev)) break;
      // Closing brace decreases depth (we're walking BACKWARD so a
      // close-brace seen first means we passed an inner block).
      if (/}\s*$/.test(prev)) depth++;
      // Open brace decreases depth back. If we've exited an inner
      // block AND see `try {`, the throw is inside the try.
      if (/\btry\s*\{/.test(prev) && depth === 0) {
        inTry = true;
        break;
      }
      if (/\{\s*$/.test(prev)) depth = Math.max(0, depth - 1);
    }
    if (inTry) continue;

    violations.push({
      file: file.replace(ROOT, "").replace(/\\/g, "/"),
      line: i + 1,
      preview: line.trim().slice(0, 120),
    });
  }
  return violations;
}

test("server actions / pages / auth helpers don't throw uncaught — bug class behind v1.4.2 + v1.7.3 + v1.8.1", () => {
  const files = collectScopedFiles();
  const allViolations: Violation[] = [];
  for (const file of files) {
    allViolations.push(...findViolations(file));
  }

  if (allViolations.length === 0) return;

  const formatted = allViolations
    .map((v) => `  ${v.file}:${v.line}\n    ${v.preview}`)
    .join("\n\n");

  assert.fail(
    `Found ${allViolations.length} uncaught \`throw new Error()\` in user-reachable surfaces.\n\n` +
      `Each one should either:\n` +
      `  1. Be wrapped in a try/catch that returns a structured error / redirects, OR\n` +
      `  2. Carry a \`// contract:throw-ok: <reason>\` annotation explaining why this throw is safe.\n\n` +
      `Bug class history:\n` +
      `  v1.4.2 — booking persist wiped form_fields → frontend showed empty form.\n` +
      `  v1.7.3 — getBillingUserById threw on missing users row → "This page couldn't load."\n` +
      `  v1.8.1 — billing portal action threw on no Stripe customer → same crash.\n\n` +
      `Violations:\n${formatted}`,
  );
});
