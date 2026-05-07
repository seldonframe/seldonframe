"use client";

// v1.27.0 — overview status changer (draft → test → live → paused).
// Eval gate runs server-side when target is 'live'; UI surfaces failures.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAgentStatusAction } from "@/lib/agents/actions";

const STATUSES = ["draft", "test", "live", "paused"] as const;

export function OverviewActions({
  agentId,
  status,
}: {
  agentId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [evalFailures, setEvalFailures] = useState<string[] | null>(null);
  const router = useRouter();

  const setStatus = (next: (typeof STATUSES)[number]) => {
    if (next === status) return;
    setError(null);
    setEvalFailures(null);
    startTransition(async () => {
      const result = await setAgentStatusAction({
        agentId,
        status: next,
      });
      if (!result.ok) {
        if (result.error === "eval_gate_failed" && result.evalSummary?.ok) {
          setEvalFailures(
            result.evalSummary.summary.results
              .filter((r) => !r.passed)
              .map((r) => `${r.scenarioId} — ${r.failureReasons.join("; ")}`),
          );
        }
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <article className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-card-title">Status</h2>
          <p className="text-xs text-muted-foreground">
            Promoting to <strong>live</strong> automatically runs the 8-scenario
            eval suite — needs ≥7/8 pass.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-full border bg-muted/50 p-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={isPending}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                s === status
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-card"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {isPending && (
        <p className="mt-3 text-xs text-muted-foreground">
          Saving…{" "}
          {evalFailures !== null
            ? "running eval suite (this can take ~30s)"
            : ""}
        </p>
      )}
      {error && (
        <div className="mt-3 rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          {error === "eval_gate_failed" ? (
            <>
              <p className="font-medium">
                Eval gate failed — agent stayed in current status.
              </p>
              {evalFailures && evalFailures.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {evalFailures.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2">
                Adjust your blueprint in <strong>Settings</strong> and try
                again, or visit <strong>Evals</strong> to see the full suite.
              </p>
            </>
          ) : (
            <p>{error}</p>
          )}
        </div>
      )}
    </article>
  );
}
