"use client";

// Agent lifecycle slice (T4, page restructure) — Max's direct feedback:
// "page way too long." Replaces the always-open five-stage ladder with a
// ONE-STAGE-OPEN accordion: the ladder chips (ladder.tsx's LifecycleRail)
// become the nav — clicking a chip opens that stage and collapses every
// other stage to a one-line summary row (stage name + status glyph + key
// fact, e.g. "Gmail connected" / "evals 100%" / "last run failed", from
// stage-derivation.ts's deriveLifecycleStageSummaries). Default-open stage
// is the first incomplete one (defaultOpenStageId).
//
// State is a single `openId` — trivial enough for useState per CLAUDE.md's
// "don't abstract on first occurrence"; a reducer would just wrap one
// setState call. The header rail and the stage list live in ONE client
// component (not two siblings) so both can read/write the same openId
// without lifting state through a server-rendered parent.
//
// Bodies are passed in pre-rendered (server components resolved by the page
// before this client component mounts) — this component only controls
// which one is visible, never fetches or computes stage content itself.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { TemplateStatusBadge } from "../../status-badge";
import type { AgentTemplateStatus } from "@/db/schema/agent-templates";
import type { LifecycleStage, LifecycleStageId } from "./stage-derivation";
import "./agent-lifecycle.css";

export function AgentLifecycleAccordion({
  templateName,
  templateStatus,
  intro,
  stages,
  summaries,
  descriptions,
  bodies,
  defaultOpenId,
}: {
  templateName: string;
  templateStatus: AgentTemplateStatus | string;
  intro: ReactNode;
  stages: LifecycleStage[];
  summaries: Record<LifecycleStageId, string>;
  descriptions: Record<LifecycleStageId, string>;
  bodies: Record<LifecycleStageId, ReactNode>;
  defaultOpenId: LifecycleStageId;
}) {
  const [openId, setOpenId] = useState<LifecycleStageId>(defaultOpenId);

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
        </div>
        <div className="mt-3">
          {/* The rail IS the nav now — clicking a chip opens that stage
              below (rather than only #anchor-scrolling to an already-open
              section). */}
          <ol className="sf-lifecycle flex flex-wrap items-center gap-2 text-xs" aria-label="Agent lifecycle">
            {stages.map((stage, i) => (
              <li key={stage.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpenId(stage.id)}
                  aria-current={openId === stage.id ? "step" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition-colors ${
                    openId === stage.id
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : stage.complete
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

      <div className="mx-auto max-w-3xl space-y-4 pt-6 pb-24">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{intro}</p>

        {stages.map((stage) => {
          const isOpen = openId === stage.id;
          return (
            <section
              key={stage.id}
              id={`lc-${stage.id}`}
              data-complete={stage.complete}
              className="sf-lifecycle sf-lifecycle-stage scroll-mt-28"
              aria-label={stage.title}
            >
              <button
                type="button"
                onClick={() => setOpenId(stage.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 p-4 text-left sm:p-5"
              >
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
                <h2 className="text-[1.05rem] font-semibold leading-tight tracking-tight text-[var(--lc-ink)]">
                  {stage.title}
                </h2>
                <span className="ml-auto truncate text-xs text-[var(--lc-muted)]">
                  {summaries[stage.id]}
                </span>
              </button>
              {/* F-A fix: every stage body stays MOUNTED (never conditionally
                  rendered null) — only its visibility toggles. The old
                  `{isOpen ? <div>…</div> : null}` unmounted the closed
                  stages' React trees on every chip click, including
                  AgentTemplateEditor's local state (greeting, script, FAQ)
                  nested inside the Learned stage's body — an operator's
                  unsaved edits were silently dropped the moment they clicked
                  another chip. */}
              <div
                className={`space-y-4 px-4 pb-4 pl-[3.75rem] sm:px-5 sm:pb-5 sm:pl-[4.25rem] ${isOpen ? "" : "hidden"}`}
              >
                {descriptions[stage.id] ? (
                  <p className="-mt-2 max-w-2xl text-sm leading-relaxed text-[var(--lc-muted)]">
                    {descriptions[stage.id]}
                  </p>
                ) : null}
                {bodies[stage.id]}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
