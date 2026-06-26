// Agent Loop — L2 Verify (maker ≠ checker gate) — the pure verify model.
//
// This module is the pure core of the Verify primitive: a separate, strict
// CHECKER that gates an agent's output before it is sent/saved, so the maker
// (the client's agent) never grades its own homework. Deterministic rubric
// checks (length, must-include the review link/name, no leftover placeholder)
// run in-process and are the always-on gate; an OPTIONAL async `Checker`
// (an LLM/`run_agent_evals` judge) can be dependency-injected for judgment
// cases. The two are AND-ed — both must pass.
//
// It is intentionally PURE:
//   • no I/O — it inspects a string against a rubric, nothing else;
//   • no clock, no env, no "use server";
//   • NEVER throws — a malformed regex makes THAT check fail (it does not blow
//     up the gate), and a `Checker` that throws fails CLOSED (pass:false) so a
//     broken grader blocks the send rather than waving a bad message through.
// Safe from a Server Component, action, route handler, runtime, or test.

/**
 * One rubric check. The deterministic kinds are evaluated against the output
 * string; an optional `label` lets the rubric author give a check a friendlier
 * name in failure messages (e.g. "review link" instead of the raw URL).
 */
export type VerifyCheck =
  | { kind: "max_length"; max: number }
  | { kind: "min_length"; min: number }
  | { kind: "must_include"; value: string; label?: string }
  | { kind: "must_include_any"; values: string[]; label?: string }
  | { kind: "must_match"; pattern: string; flags?: string; label?: string }
  | { kind: "must_not_include"; value: string; label?: string };

/** A rubric is just an ordered list of checks; every one must pass. */
export type VerifyRubric = { checks: VerifyCheck[] };

/** The per-check verdict, with an optional human-readable `detail` for fails. */
export type VerifyCheckResult = { check: VerifyCheck; pass: boolean; detail?: string };

/**
 * The composed verdict: `pass` (all checks passed), the per-check `results`,
 * and `failures` — one human-readable string per FAILED check (operator-facing).
 */
export type VerifyResult = { pass: boolean; results: VerifyCheckResult[]; failures: string[] };

/**
 * An optional async grader (LLM / `run_agent_evals`) DI'd into `verifyOutput`.
 * It returns its own `VerifyResult`, which is AND-ed with the deterministic
 * result. It MAY throw — `verifyOutput` catches that and fails closed.
 */
export type Checker = (output: string, rubric: VerifyRubric) => Promise<VerifyResult>;

/** Truncate a value for inclusion in a failure message so a giant URL/blob
 *  doesn't dominate the line. Keeps short values verbatim. */
function preview(value: string, max = 80): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * Evaluate ONE check against the output. Returns `{ pass, detail? }`. Never
 * throws: a malformed `must_match` regex is caught and reported as a failed
 * check carrying the error in `detail`.
 *
 * `detail` is set on a FAILED check and is the basis for the human-readable
 * `failures` line; a passing check needs no detail.
 */
function evaluateCheck(output: string, check: VerifyCheck): VerifyCheckResult {
  switch (check.kind) {
    case "max_length": {
      const len = output.length;
      const pass = len <= check.max;
      return pass ? { check, pass } : { check, pass, detail: `too long: ${len} > ${check.max}` };
    }
    case "min_length": {
      const len = output.length;
      const pass = len >= check.min;
      return pass ? { check, pass } : { check, pass, detail: `too short: ${len} < ${check.min}` };
    }
    case "must_include": {
      const pass = output.includes(check.value);
      const what = check.label ? `${check.label} (${preview(check.value)})` : `"${preview(check.value)}"`;
      return pass ? { check, pass } : { check, pass, detail: `missing required text ${what}` };
    }
    case "must_include_any": {
      const pass = check.values.some((v) => output.includes(v));
      const list = check.values.map((v) => `"${preview(v)}"`).join(", ");
      const what = check.label ? `${check.label} (one of ${list})` : `one of ${list}`;
      return pass ? { check, pass } : { check, pass, detail: `missing required text — needs ${what}` };
    }
    case "must_not_include": {
      const pass = !output.includes(check.value);
      const what = check.label ? `${check.label} ("${preview(check.value)}")` : `"${preview(check.value)}"`;
      return pass ? { check, pass } : { check, pass, detail: `contains forbidden text ${what}` };
    }
    case "must_match": {
      let re: RegExp;
      try {
        re = new RegExp(check.pattern, check.flags);
      } catch (err) {
        // A bad pattern is a rubric-author error — fail the check, never throw.
        const msg = err instanceof Error ? err.message : String(err);
        const what = check.label ? `${check.label} ` : "";
        return { check, pass: false, detail: `invalid pattern ${what}/${check.pattern}/: ${msg}` };
      }
      const pass = re.test(output);
      const what = check.label ? `${check.label} (/${check.pattern}/)` : `/${check.pattern}/`;
      return pass ? { check, pass } : { check, pass, detail: `does not match required pattern ${what}` };
    }
    default: {
      // Exhaustiveness guard: an unknown kind is treated as a failed check
      // rather than throwing, so a forward-compat rubric never breaks the gate.
      const unknown = check as { kind?: unknown };
      return { check, pass: false, detail: `unknown check kind: ${String(unknown.kind)}` };
    }
  }
}

/**
 * Run every deterministic check against `output` and compose the verdict.
 * `pass` is true iff ALL checks pass (vacuously true for an empty rubric).
 * `failures` is one human-readable string per failed check (its `detail`,
 * with a fallback). NEVER throws.
 */
export function runDeterministicChecks(output: string, rubric: VerifyRubric): VerifyResult {
  const text = typeof output === "string" ? output : String(output ?? "");
  const checks = rubric?.checks ?? [];
  const results = checks.map((check) => evaluateCheck(text, check));
  const failures = results
    .filter((r) => !r.pass)
    .map((r) => r.detail ?? `failed check: ${r.check.kind}`);
  return { pass: results.every((r) => r.pass), results, failures };
}

/**
 * The full gate: run the deterministic checks and, if a `checker` is supplied,
 * ALSO run it and AND the two results (both must pass). A `checker` that throws
 * fails CLOSED — its layer becomes `{ pass:false, failures:["checker_error"] }`
 * — so a broken grader blocks the message rather than letting it through.
 * With no checker, the result is exactly the deterministic result. NEVER throws.
 */
export async function verifyOutput(
  output: string,
  rubric: VerifyRubric,
  checker?: Checker,
): Promise<VerifyResult> {
  const deterministic = runDeterministicChecks(output, rubric);
  if (!checker) return deterministic;

  let checkerResult: VerifyResult;
  try {
    const raw = await checker(output, rubric);
    // Defend against a checker that resolves with a malformed/empty result.
    checkerResult = {
      pass: Boolean(raw?.pass),
      results: Array.isArray(raw?.results) ? raw.results : [],
      failures: Array.isArray(raw?.failures) ? raw.failures : [],
    };
  } catch {
    // Fail closed: a throwing grader must block, not wave through.
    checkerResult = { pass: false, results: [], failures: ["checker_error"] };
  }

  return {
    pass: deterministic.pass && checkerResult.pass,
    results: [...deterministic.results, ...checkerResult.results],
    failures: [...deterministic.failures, ...checkerResult.failures],
  };
}
