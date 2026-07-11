// Agent lifecycle slice (T6) — the 5-stage rail shell.
//
// Pure presentation (server-safe — no "use client", no hooks), mirroring
// EditorSection's convention so both the flag-off editor page and this
// flag-on ladder share the same calm-document rhythm. Adopts the handoff's
// numbered-stage + checkmark structure, restyled to the `--lc-*` tokens
// (agent-lifecycle.css) rather than the handoff's own CSS.

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { LifecycleStage } from "./stage-derivation";
import "./agent-lifecycle.css";

/** The compact rail at the top of the ladder — 5 numbered pills, filled +
 *  checked when complete. Presentational only; no interaction. */
export function LifecycleRail({ stages }: { stages: LifecycleStage[] }) {
  return (
    <ol className="sf-lifecycle flex flex-wrap items-center gap-2 text-xs" aria-label="Agent lifecycle">
      {stages.map((stage, i) => (
        <li key={stage.id} className="flex items-center gap-2">
          <a
            href={`#lc-${stage.id}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition-colors ${
              stage.complete
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-[var(--lc-line)] bg-[var(--lc-card)] text-[var(--lc-muted)] hover:text-[var(--lc-ink)]"
            }`}
          >
            {stage.complete ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <span aria-hidden className="font-mono text-[10px]">
                {stage.step}
              </span>
            )}
            {stage.title}
          </a>
          {i < stages.length - 1 && (
            <span aria-hidden className="text-[var(--lc-muted)]">
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** One numbered stage section — the ladder's per-stage card, styled with the
 *  `--lc-*` token layer. `complete` drives the border accent (see
 *  agent-lifecycle.css's [data-complete] rule); it never gates rendering —
 *  every stage is always visible, just marked done or not. */
export function LifecycleStageCard({
  stage,
  description,
  children,
}: {
  stage: LifecycleStage;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={`lc-${stage.id}`}
      data-complete={stage.complete}
      className="sf-lifecycle sf-lifecycle-stage scroll-mt-28 space-y-4 p-4 sm:p-5"
      aria-label={stage.title}
    >
      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold ${
              stage.complete
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-[var(--lc-line)] text-[var(--lc-muted)]"
            }`}
          >
            {stage.complete ? <Check className="size-3.5" /> : stage.step}
          </span>
          <h2 className="text-[1.2rem] font-semibold leading-tight tracking-tight text-[var(--lc-ink)]">
            {stage.title}
          </h2>
        </div>
        {description ? (
          <p className="max-w-2xl pl-10 text-sm leading-relaxed text-[var(--lc-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      <div className="space-y-4 pl-10">{children}</div>
    </section>
  );
}
