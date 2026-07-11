"use client";

// Agent Eval Harness — E5: the minimal "Run evals" surface (client island).
//
// A single card on the template editor: one "Run evals" button → runAgentEvalsAction
// → render the pass rate + a per-scenario ✓/✗ list with the failed check names + a
// note that failures were recorded as Brain lessons. Deliberately minimal — a richer
// dashboard (history, transcripts, the deterministic-vs-LLM breakdown) is a follow-up.
//
// Mirrors the test sandbox's BYOK handling: running evals is unbounded-COGS build
// work, so on no_llm_key it shows the same actionable "add your key" prompt linking
// to Settings (the first workspace stays free; building/testing agents needs a key).

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import {
  runAgentEvalsAction,
  type RunAgentEvalsActionResult,
} from "@/lib/agent-templates/eval-actions";

type Ok = Extract<RunAgentEvalsActionResult, { ok: true }>;

// T5 (Max: "takes too much time") — rotating status copy on the button while
// evals run, so the several-seconds LLM round trip (author scenarios, chat
// with the agent N times, grade each transcript) feels alive instead of a
// frozen "Running…". Mirrors editor-client.tsx's REFINE_STATUS_MESSAGES
// rotation (same interval-reset-on-pending / clear-on-settle pattern).
const RUN_EVALS_STATUS_MESSAGES = [
  "Generating scenarios…",
  "Simulating your customers…",
  "Replaying your recording…",
  "Grading transcripts…",
];
const RUN_EVALS_STATUS_INTERVAL_MS = 2500;

export function RunEvalsCard({ templateId }: { templateId: string }) {
  const [running, startRun] = useTransition();
  const [result, setResult] = useState<Ok | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  // Rotating loader copy index for the "Run evals" button. Resets to 0 when
  // a run starts, advances on an interval while pending, and clears the
  // interval on settle (running -> false) or unmount. Plain client timer —
  // the FINAL result rendering below is unchanged.
  const [statusIdx, setStatusIdx] = useState(0);
  useEffect(() => {
    if (!running) return;
    setStatusIdx(0);
    const id = setInterval(() => {
      setStatusIdx((i) => (i + 1) % RUN_EVALS_STATUS_MESSAGES.length);
    }, RUN_EVALS_STATUS_INTERVAL_MS);
    return () => clearInterval(id);
  }, [running]);

  const run = () => {
    setError(null);
    setNeedsKey(false);
    startRun(async () => {
      try {
        const res = await runAgentEvalsAction(templateId);
        if (res.ok) {
          setResult(res);
        } else if (res.error === "no_llm_key") {
          setNeedsKey(true);
          setResult(null);
        } else {
          setError(
            res.message ??
              `Couldn't run evals (${res.error}). Try again in a moment.`,
          );
          setResult(null);
        }
      } catch (err) {
        setError(
          `Connection error: ${err instanceof Error ? err.message : String(err)}`,
        );
        setResult(null);
      }
    });
  };

  const pct =
    result && result.summary.total > 0
      ? Math.round(result.summary.passRate * 100)
      : 0;
  const allPassed =
    result !== null && result.summary.total > 0 && result.summary.passed === result.summary.total;

  return (
    <section className="rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5 space-y-4">
      <header className="flex flex-wrap items-start gap-3">
        <span
          className="inline-flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          aria-hidden
        >
          <ClipboardCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Run evals
          </h2>
          <p className="text-[13px] text-muted-foreground max-w-2xl">
            Play this agent against realistic customers (sandboxed — nothing is
            booked or sent). You get a pass rate and exactly what failed; every
            failure is recorded as a lesson so the next version improves.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="crm-button-primary h-9 shrink-0 px-4 text-sm"
        >
          {running ? RUN_EVALS_STATUS_MESSAGES[statusIdx] : "Run evals"}
        </button>
      </header>

      {/* BYOK gate — running evals is unbounded-COGS build/test work. */}
      {needsKey && (
        <div className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-[13px] text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-200">
          <span aria-hidden className="pt-0.5 text-base leading-none">
            ✨
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Add your key to run evals</p>
            <p className="mt-0.5 opacity-90">
              Your first workspace stays free. Building, testing, and evaluating
              your own agents runs on your Anthropic key.
            </p>
          </div>
          <Link
            href="/settings/integrations/llm"
            className="shrink-0 rounded-md border border-current/30 px-3 py-1 text-xs font-medium hover:bg-current/10"
          >
            Add your key &rarr;
          </Link>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      )}

      {running && !result && (
        <p className="text-[13px] italic text-muted-foreground">
          Authoring scenarios and chatting with the agent… this takes a few
          seconds.
        </p>
      )}

      {result && (
        <div className="space-y-3">
          {/* Pass-rate headline. */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className={`text-2xl font-semibold tracking-tight ${
                allPassed
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-foreground"
              }`}
            >
              {pct}%
            </span>
            <span className="text-[13px] text-muted-foreground">
              {result.summary.passed} of {result.summary.total} scenarios passed
            </span>
          </div>

          {/* Per-scenario ✓/✗. */}
          <ul className="space-y-1.5">
            {result.scenarios.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-background/50 px-3 py-2"
              >
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className={`pt-0.5 text-sm leading-none ${
                      s.passed
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {s.passed ? "✓" : "✗"}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] text-foreground">
                    {s.title}
                  </span>
                </div>
                {!s.passed && s.failedChecks.length > 0 && (
                  <p className="pl-6 text-[11px] text-rose-700/90 dark:text-rose-300/90">
                    Failed: {s.failedChecks.join(" · ")}
                  </p>
                )}
                {!s.passed && s.failedChecks.length === 0 && s.notes && (
                  <p className="pl-6 text-[11px] text-muted-foreground">
                    {s.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {result.lessonsRecorded > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {result.lessonsRecorded} failure
              {result.lessonsRecorded === 1 ? "" : "s"} recorded as{" "}
              {result.lessonsRecorded === 1 ? "a lesson" : "lessons"} — the next
              version of this agent will learn from them.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
