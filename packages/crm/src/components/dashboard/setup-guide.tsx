"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Sparkles,
  X,
} from "lucide-react";
import { dismissSetupGuide } from "@/lib/setup-guide/progress";
import type { SetupGuideProgress } from "@/lib/setup-guide/progress";
import { isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/stats-cards.tsx
    - card shell: "rounded-xl border bg-card"
  - templates/dashboard-2/components/dashboard/content.tsx
    - progress track: "bg-muted h-1.5 rounded-full"
*/

export function SetupGuide({ progress }: { progress: SetupGuideProgress }) {
  const { showDemoToast } = useDemoToast();
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(progress.dismissed);
  const [pending, startTransition] = useTransition();
  const targetPercentage = Math.round(
    (progress.completedCount / progress.totalCount) * 100,
  );
  const [animatedPct, setAnimatedPct] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedPct(targetPercentage), 150);
    return () => clearTimeout(timer);
  }, [targetPercentage]);

  if (dismissed || progress.allDone) {
    return null;
  }

  function handleDismiss() {
    startTransition(async () => {
      if (isDemoReadonlyClient) {
        showDemoToast();
        return;
      }

      await dismissSetupGuide();
      setDismissed(true);
    });
  }

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-xs ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate">
              Setup Guide
            </h2>
            <p className="text-xs text-muted-foreground">
              {progress.completedCount} of {progress.totalCount} completed
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 min-w-[120px]">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-700 ease-out"
                style={{ width: `${animatedPct}%` }}
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {animatedPct}%
            </span>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex size-7 items-center justify-center rounded-md hover:bg-accent transition-colors"
          >
            {expanded ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            disabled={pending}
            className="inline-flex size-7 items-center justify-center rounded-md hover:bg-accent transition-colors"
            title="Dismiss setup guide"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t px-4 py-3 sm:px-5 sm:py-4">
          <div className="sm:hidden mb-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-700 ease-out"
                  style={{ width: `${animatedPct}%` }}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {animatedPct}%
              </span>
            </div>
          </div>

          <ul className="space-y-1">
            {progress.tasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={task.href}
                  className={`flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                    task.completed
                      ? "opacity-60"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {task.completed ? (
                      <div className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" />
                      </div>
                    ) : (
                      <Circle className="size-5 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium ${
                        task.completed
                          ? "line-through text-muted-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {task.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {task.description}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
