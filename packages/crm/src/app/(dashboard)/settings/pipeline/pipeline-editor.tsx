"use client";

// 2026-05-17 — Minimal pipeline editor for /settings/pipeline. The
// page was a 19-line read-only display before; operators couldn't
// actually edit their stages. Now: rename, reorder, adjust win
// probability, add/remove. Saves via saveDefaultPipelineStagesAction
// which revalidates /settings + /deals.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PipelineStage } from "@/db/schema";
import { saveDefaultPipelineStagesAction } from "@/lib/deals/actions";

const PALETTE = [
  "#9ca3af",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
];

export function PipelineEditor({
  initialStages,
  pipelineName,
}: {
  initialStages: PipelineStage[];
  pipelineName: string;
}) {
  const [stages, setStages] = useState<PipelineStage[]>(
    initialStages.length > 0
      ? initialStages
      : [{ name: "Lead", color: "#9ca3af", probability: 10 }],
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const router = useRouter();

  const updateStage = (idx: number, patch: Partial<PipelineStage>) => {
    setStages((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const move = (idx: number, dir: -1 | 1) => {
    setStages((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveDefaultPipelineStagesAction({ stages });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  };

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">
          Pipeline Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Stages that deals move through (lead → won). Applied to{" "}
          <span className="font-medium text-foreground">{pipelineName}</span>.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-3">
        {stages.map((stage, idx) => (
          <div
            key={idx}
            className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-[auto_1fr_auto_auto_auto]"
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Move up"
                disabled={idx === 0}
                onClick={() => move(idx, -1)}
                className="crm-button-ghost h-7 w-7 text-xs disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={idx === stages.length - 1}
                onClick={() => move(idx, 1)}
                className="crm-button-ghost h-7 w-7 text-xs disabled:opacity-30"
              >
                ↓
              </button>
            </div>

            <input
              type="text"
              value={stage.name}
              onChange={(e) => updateStage(idx, { name: e.target.value })}
              placeholder="Stage name (e.g. Qualified)"
              className="rounded border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
            />

            <div className="flex items-center gap-1">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => updateStage(idx, { color: c })}
                  aria-label={`Set color ${c}`}
                  className={`size-5 rounded-full border ${stage.color === c ? "border-foreground" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>

            <input
              type="number"
              min={0}
              max={100}
              value={stage.probability}
              onChange={(e) =>
                updateStage(idx, { probability: Number(e.target.value) })
              }
              className="w-20 rounded border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
              aria-label="Win probability %"
            />

            <button
              type="button"
              onClick={() => setStages(stages.filter((_, i) => i !== idx))}
              disabled={stages.length === 1}
              className="text-xs text-rose-600 hover:underline disabled:opacity-30"
            >
              Remove
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            setStages([
              ...stages,
              { name: "", color: "#9ca3af", probability: 50 },
            ])
          }
          className="crm-button-secondary h-9 px-3 text-sm"
        >
          + Add stage
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="crm-button-primary h-10 px-5 text-sm"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
        {savedAt ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            ✓ Saved
          </span>
        ) : null}
        {error ? (
          <span className="text-xs text-rose-600">Error: {error}</span>
        ) : null}
      </div>
    </section>
  );
}
