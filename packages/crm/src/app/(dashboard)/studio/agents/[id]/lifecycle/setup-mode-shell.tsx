"use client";

// Agent setup mode slice (T1 + T2) — the one-stage-per-screen funnel shown
// when the template's lifecycle is incomplete (setup-mode.ts's
// resolveLifecycleMode). Reuses the SAME stepper chip markup + stage bodies
// as the compact home accordion (agent-lifecycle-accordion.tsx) — this is a
// different LAYOUT over identical data, never a fork of the stage content.
//
// Screen contract per spec §1: stage title + one-line why -> the stage body
// (already mounted, nothing from other stages renders) -> ONE primary CTA
// (each body owns its own primary action) + "skip for now". Auto-advance:
// while the open stage is incomplete, poll the server (router.refresh(),
// which re-derives `stages` server-side — the page is force-dynamic) every
// few seconds; when the stage's OWN completion flips true, show a brief
// success beat then advance via the pure setupAdvanceReducer — never a
// hard jump mid-read.

import { useEffect, useReducer, useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { TemplateStatusBadge } from "../../status-badge";
import type { AgentTemplateStatus } from "@/db/schema/agent-templates";
import type { LifecycleStage, LifecycleStageId } from "./stage-derivation";
import { setupAdvanceReducer, type SetupAdvanceState } from "./setup-mode";
import "./agent-lifecycle.css";

const POLL_MS = 4000;
const SUCCESS_BEAT_MS = 900;

export function SetupModeShell({
  templateId,
  templateName,
  templateStatus,
  stages,
  summaries,
  descriptions,
  bodies,
  initialStageId,
}: {
  templateId: string;
  templateName: string;
  templateStatus: AgentTemplateStatus | string;
  stages: LifecycleStage[];
  summaries: Record<LifecycleStageId, string>;
  descriptions: Record<LifecycleStageId, string>;
  bodies: Record<LifecycleStageId, ReactNode>;
  initialStageId: LifecycleStageId;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, dispatch] = useReducer(setupAdvanceReducer, {
    stageId: initialStageId,
    beat: "idle",
  } as SetupAdvanceState);

  const stage = stages.find((s) => s.id === state.stageId) ?? stages[0];
  const wasCompleteRef = useRef(stage.complete);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the URL in sync with the open stage (deep-link/refresh/back work —
  // spec §1) without piling up history entries for every internal advance.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("stage", state.stageId);
    window.history.replaceState(window.history.state, "", url.toString());
  }, [state.stageId]);

  // Auto-advance: when THIS stage's derived completion flips true (a poll
  // tick brought fresh `stages` in from the server), fire the success beat,
  // then advance on the next idle tick — never a hard jump mid-read.
  useEffect(() => {
    if (!wasCompleteRef.current && stage.complete) {
      dispatch({ type: "STAGE_COMPLETED" });
      const timer = setTimeout(() => dispatch({ type: "CONTINUE", stages }), SUCCESS_BEAT_MS);
      wasCompleteRef.current = true;
      return () => clearTimeout(timer);
    }
    wasCompleteRef.current = stage.complete;
    return undefined;
    // stages is a fresh array every server render; comparing stage.complete
    // (a primitive) is what actually drives this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.complete]);

  // Poll for fresh completion state while the open stage is incomplete —
  // stage actions (connect, run, etc.) write via server actions elsewhere
  // on the page; a refresh re-derives `stages` from the DB (force-dynamic).
  useEffect(() => {
    const schedule = () => {
      pollTimerRef.current = setTimeout(() => {
        startTransition(() => router.refresh());
        schedule();
      }, POLL_MS);
    };
    if (!stage.complete) schedule();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [stage.complete, stage.id, router, startTransition]);

  const goto = (id: LifecycleStageId) => dispatch({ type: "GOTO", stageId: id });
  const skip = () => dispatch({ type: "CONTINUE", stages });

  return (
    <section className="sf-lifecycle animate-page-enter">
      <div className="sticky top-0 z-10 -mx-4 mb-2 border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link
            href="/studio/agents"
            aria-label="Back to Agents"
            className="crm-topbar-icon-btn size-9 shrink-0"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/studio/agents"
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              Agents
            </Link>
            <span aria-hidden className="text-xs text-muted-foreground">
              /
            </span>
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-[17px]">
              {templateName}
            </h1>
            <TemplateStatusBadge status={templateStatus} />
          </div>
          <Link
            href={`/studio/agents/${templateId}?view=full`}
            className="ml-auto shrink-0 text-xs text-muted-foreground hover:text-foreground"
          >
            View full page
          </Link>
        </div>
        <div className="mt-3">
          {/* Stepper — the existing 5 chips, clickable nav, completion
              glyphs (spec §1). Same visual language as the home accordion's
              rail, duplicated here (not imported) since this header block
              also carries the sticky top bar the accordion doesn't need in
              setup mode — see the accordion for the shared chip styling. */}
          <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Agent setup steps">
            {stages.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goto(s.id)}
                  aria-current={stage.id === s.id ? "step" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition-colors ${
                    stage.id === s.id
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : s.complete
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-[var(--lc-line)] bg-[var(--lc-card)] text-[var(--lc-muted)] hover:text-[var(--lc-ink)]"
                  }`}
                >
                  {s.complete ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <span aria-hidden className="font-mono text-[10px]">
                      {s.step}
                    </span>
                  )}
                  {s.title}
                </button>
                {i < stages.length - 1 && (
                  <span aria-hidden className="text-[var(--lc-muted)]">
                    →
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* ONE stage per screen — nothing from other stages renders. */}
      <div className="mx-auto max-w-2xl space-y-4 pt-8 pb-24">
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--lc-ink)]">{stage.title}</h2>
          {descriptions[stage.id] ? (
            <p className="text-sm leading-relaxed text-[var(--lc-muted)]">{descriptions[stage.id]}</p>
          ) : null}
        </div>

        <div className="space-y-4">{bodies[stage.id]}</div>

        {state.beat === "success" ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <Check className="size-4" aria-hidden /> Nice — {stage.title.toLowerCase()} is done.
          </p>
        ) : null}

        <div className="flex items-center gap-4 pt-2">
          <button
            type="button"
            onClick={skip}
            className="text-xs text-[var(--lc-muted)] underline-offset-2 hover:text-[var(--lc-ink)] hover:underline"
          >
            Skip for now
          </button>
          <span className="text-xs text-[var(--lc-muted)]">{summaries[stage.id]}</span>
        </div>
      </div>
    </section>
  );
}
