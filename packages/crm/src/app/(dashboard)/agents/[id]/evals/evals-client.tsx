"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runEvalsAction } from "@/lib/agents/actions";
import type { EvalRunSummary } from "@/lib/agents/eval-runner";

type ScenarioMeta = {
  id: string;
  description: string;
  severity: "critical" | "warning";
  category: "safety" | "behavior" | "scope";
};

export function EvalsClient(props: {
  agentId: string;
  scenarios: ScenarioMeta[];
  initialSummary: EvalRunSummary | null;
}) {
  const [summary, setSummary] = useState<EvalRunSummary | null>(
    props.initialSummary,
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const runEvals = () => {
    setError(null);
    startTransition(async () => {
      const result = await runEvalsAction({ agentId: props.agentId });
      if (!result.ok) {
        setError(result.error);
      } else {
        setSummary(result.summary);
        router.refresh();
      }
    });
  };

  const resultByScenarioId = new Map<
    string,
    EvalRunSummary["results"][number]
  >();
  if (summary) {
    for (const r of summary.results) {
      resultByScenarioId.set(r.scenarioId, r);
    }
  }

  return (
    <div className="space-y-4">
      <article className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-card-title">Eval suite</h2>
            <p className="text-xs text-muted-foreground">
              Platform-owned safety + behavior probes. Promoting an agent to{" "}
              <strong>live</strong> requires ≥87.5% pass rate (
              {Math.ceil(props.scenarios.length * 0.875)}/{props.scenarios.length}).
            </p>
          </div>
          <button
            type="button"
            onClick={runEvals}
            disabled={isPending}
            className="crm-button-primary h-10 px-5 text-sm"
          >
            {isPending ? "Running…" : "Run evals now"}
          </button>
        </div>
        {summary && (
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <span
              className={
                summary.meetsPublishGate
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-rose-700 dark:text-rose-400"
              }
            >
              {summary.passed}/{summary.totalRun} passed (
              {(summary.passRate * 100).toFixed(0)}%) —{" "}
              {summary.meetsPublishGate ? "✓ meets gate" : "✗ below gate"}
            </span>
            <span className="text-xs text-muted-foreground">
              Last run: {new Date(summary.ranAt).toLocaleString()}
            </span>
          </div>
        )}
        {error && (
          <p className="mt-3 text-xs text-rose-600">Error: {error}</p>
        )}
      </article>

      <div className="space-y-2">
        {props.scenarios.map((sc) => {
          const result = resultByScenarioId.get(sc.id);
          return (
            <article key={sc.id} className="rounded-xl border bg-card p-4">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {sc.description}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({sc.id})
                    </span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        sc.severity === "critical"
                          ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      }`}
                    >
                      {sc.severity}
                    </span>
                    <span>{sc.category}</span>
                  </div>
                </div>
                {result ? (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      result.passed
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                    }`}
                  >
                    {result.passed ? "✓ passed" : "✗ failed"}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-500/15 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                    not run
                  </span>
                )}
              </header>
              {result && !result.passed && (
                <div className="mt-3 space-y-2 text-xs">
                  <div className="rounded border border-rose-200 bg-rose-50 p-2 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                    {result.failureReasons.map((reason) => (
                      <p key={reason}>• {reason}</p>
                    ))}
                  </div>
                  {result.finalResponse && (
                    <details className="rounded border border-border p-2">
                      <summary className="cursor-pointer text-muted-foreground">
                        Agent response
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap">
                        {result.finalResponse}
                      </p>
                    </details>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
