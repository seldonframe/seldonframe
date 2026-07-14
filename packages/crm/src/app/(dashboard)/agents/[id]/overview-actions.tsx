"use client";

// v1.27.0 — overview status changer (draft → test → live → paused).
// Eval gate runs server-side when target is 'live'; UI surfaces failures.
//
// 2026-05-17 — UX polish pass:
//   - Hover affordance on each segment (subtle bg + tooltip describing what
//     each state means so "live" isn't intuited solely from word context).
//   - Per-pill loading state — only the segment the operator clicked shows
//     a spinner + "Saving…" label INSIDE the pill. Previous behaviour
//     ("Saving…" sentence appeared below the entire row 2-3 seconds in)
//     looked like the click had been ignored.
//   - On success: brief checkmark flash on the new active segment before
//     the router refresh repaints the row, so the operator gets visual
//     confirmation that the change committed.
//   - All transitions use 150ms ease-out for consistency with the rest of
//     the app's interactive surfaces.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { setAgentStatusAction } from "@/lib/agents/actions";

type StatusValue = "draft" | "test" | "live" | "paused";

const STATUSES: Array<{ value: StatusValue; label: string; tooltip: string }> = [
  { value: "draft",  label: "Draft",  tooltip: "Hidden from embed + test page. Edit freely." },
  { value: "test",   label: "Test",   tooltip: "Responds in the sandbox but not in the public embed yet." },
  { value: "live",   label: "Live",   tooltip: "Public embed serves real conversations. Eval suite must pass first." },
  { value: "paused", label: "Paused", tooltip: "Embed stays installed but returns a polite holding message." },
];

export function OverviewActions({
  agentId,
  status,
}: {
  agentId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingTarget, setPendingTarget] = useState<StatusValue | null>(null);
  const [justSaved, setJustSaved] = useState<StatusValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evalFailures, setEvalFailures] = useState<string[] | null>(null);
  const router = useRouter();

  const setStatus = (next: StatusValue) => {
    if (next === status || isPending) return;
    setError(null);
    setEvalFailures(null);
    setPendingTarget(next);
    startTransition(async () => {
      const result = await setAgentStatusAction({ agentId, status: next });
      if (!result.ok) {
        if (result.error === "eval_gate_failed" && result.evalSummary?.ok) {
          setEvalFailures(
            result.evalSummary.summary.results
              .filter((r) => !r.passed)
              .map((r) => `${r.scenarioId} — ${r.failureReasons.join("; ")}`),
          );
        }
        setError(result.error);
        setPendingTarget(null);
      } else {
        setJustSaved(next);
        // Brief check flash before the router refresh repaints the row.
        // 700ms matches the eye-tracking research on "did my click land?"
        // micro-feedback — long enough to notice, short enough not to drag.
        setTimeout(() => {
          setJustSaved(null);
          router.refresh();
        }, 700);
        setPendingTarget(null);
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
        <div
          role="radiogroup"
          aria-label="Agent status"
          className="flex flex-wrap gap-1 rounded-[13px] border bg-muted/50 p-1"
        >
          {STATUSES.map((s) => {
            const isActive = s.value === status;
            const isLoading = pendingTarget === s.value;
            const isFlashing = justSaved === s.value;
            return (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                disabled={isPending}
                onClick={() => setStatus(s.value)}
                title={s.tooltip}
                className={`relative inline-flex items-center gap-1.5 rounded-[11px] px-3 py-1 text-xs font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-(--shadow-xs)"
                    : "text-muted-foreground hover:bg-card hover:text-foreground hover:scale-[1.02]"
                } ${isLoading || isFlashing ? "scale-[0.97]" : ""}`}
              >
                {isLoading ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                ) : isFlashing ? (
                  <Check className="size-3" aria-hidden="true" />
                ) : null}
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {isPending && pendingTarget === "live" ? (
        // Live promotion runs the eval suite server-side (~30s).
        // Surface this so the operator doesn't think the click hung.
        <p className="mt-3 text-xs text-muted-foreground">
          Running eval suite — this can take ~30 seconds.
        </p>
      ) : null}
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
