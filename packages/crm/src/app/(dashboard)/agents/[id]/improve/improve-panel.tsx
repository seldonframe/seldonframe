"use client";

// Improve verb + trust rail (2026-07-02) — Task 12: the Studio "Improve"
// panel (client island). Mirrors run-evals.tsx's
// (studio/agents/[id]/run-evals.tsx) client-island + server-action +
// loading/error conventions and its styling byte-for-byte: same card chrome,
// same BYOK-gate block, same useTransition-driven pending state.
//
// HOST PAGE NOTE (deviation from the brief's literal file path — see
// task-12-report.md "Concerns" for the full reasoning): the brief says to
// place this "alongside run-evals" on studio/agents/[id]/, but that page's
// `[id]` is an `agent_templates.id` (builder-owned product blueprint,
// scoped by `builderOrgId`) — a DIFFERENT table from the `agents.id` (DB
// table `agents`, org-scoped to the DEPLOYED workspace) that
// runImproveAction/applyImproveProposalAction/dismissImproveProposalAction
// require (agentImproveProposals.agentId FKs to `agents`, and T10's own MCP
// surface is literally `improve_agent({ agent_id })` against that same
// table). Passing a template id into these actions would always resolve
// `agent_not_found` — dead on arrival. This panel is instead hosted at
// (dashboard)/agents/[id]/improve/ — the EXISTING deployed-agent detail page
// (agent-tabs.tsx + layout.tsx), which already org-scopes exactly like this
// feature's actions do, and already has a sibling `evals` tab this adds
// an `improve` tab beside — the same "alongside evals" placement intent the
// brief describes, just on the id-correct host.
//
// One "Improve" button → runImproveAction(agentId) → renders (in order):
//   1. The PAIRED flip counts as the HEADLINE — "N scenarios improved · N
//      regressed · N unchanged" — NEVER an aggregate percentage (small-N
//      honesty rule, research addendum §2: at N≈24 only large effects are
//      real; an aggregate pass-rate delta reads as more significant than it
//      is).
//   2. The verdict chip, rendered EXACTLY as the action already computed it
//      (never recomputed here): "better" green ONLY per the honesty rule,
//      "inconclusive" neutral with the LITERAL copy "Small sample — apply on
//      judgment, not on the score.", "worse" amber/warning.
//   3. Failure clusters (mode + count + evidence).
//   4. The field diff (diffBlueprintFields — pure) between the CURRENT
//      blueprint and the proposal's patch. The patch itself is fetched via
//      the new getImproveProposalPatchAction (proposal-actions.ts) once a
//      proposalId is revealed — ImproveRunResult (T9) never carries the
//      patch inline; see that action's header for the full explanation.
//   5. Apply / Dismiss, wired to applyImproveProposalAction /
//      dismissImproveProposalAction, with pending/disabled states matching
//      run-evals.tsx's own button conventions.
//
// A run with no candidate (perfect baseline, or nothing proposed) shows the
// baseline stats + the `note` explaining why — no proposal to act on, so no
// Apply/Dismiss row renders (proposalId is null).

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import {
  runImproveAction,
  applyImproveProposalAction,
  dismissImproveProposalAction,
  type RunImproveActionResult,
} from "@/lib/agents/improve/actions";
import { getImproveProposalPatchAction } from "@/lib/agents/improve/proposal-actions";
import { diffBlueprintFields, type BlueprintFieldDiff } from "@/lib/agents/improve/diff-blueprint";
import type { AgentBlueprint } from "@/db/schema/agents";

type Ok = Extract<RunImproveActionResult, { ok: true }>;

const VERDICT_COPY: Record<
  NonNullable<Ok["verdict"]>,
  { label: string; note?: string }
> = {
  better: { label: "Better" },
  inconclusive: {
    label: "Inconclusive",
    note: "Small sample — apply on judgment, not on the score.",
  },
  worse: { label: "Worse" },
};

/** Verdict chip styling — "better" is the ONLY green state (small-N honesty
 *  rule); "inconclusive" is neutral; "worse" is a warning tone. Rendered
 *  exactly as the action's own `verdict` field encodes it — never
 *  recomputed here. */
function verdictChipClass(verdict: NonNullable<Ok["verdict"]>): string {
  if (verdict === "better") {
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  }
  if (verdict === "worse") {
    return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
  return "bg-slate-500/15 text-slate-700 dark:text-slate-300";
}

export function ImprovePanel({
  agentId,
  currentBlueprint,
}: {
  agentId: string;
  /** The agent's CURRENT blueprint at page-load time — the "before" side of
   *  diffBlueprintFields. A proposal applied in a prior run may have moved
   *  this since; the panel doesn't need live sync (a page refresh after
   *  Apply/Dismiss re-fetches it via router.refresh-equivalent reload). */
  currentBlueprint: AgentBlueprint;
}) {
  const [running, startRun] = useTransition();
  const [resolving, startResolve] = useTransition();
  const [result, setResult] = useState<Ok | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [resolvedProposalId, setResolvedProposalId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState<string | null>(null);
  // The proposal's patch, fetched separately (getImproveProposalPatchAction)
  // since ImproveRunResult (T9) never carries the patch itself — see that
  // action's header for why. `undefined` = not fetched yet; `null` = fetch
  // failed/not found.
  const [patch, setPatch] = useState<Partial<AgentBlueprint> | null | undefined>(undefined);

  const run = () => {
    setError(null);
    setNeedsKey(false);
    setResolvedProposalId(null);
    setResolveError(null);
    setResolveNote(null);
    setPatch(undefined);
    startRun(async () => {
      try {
        const res = await runImproveAction(agentId);
        if (res.ok) {
          setResult(res);
        } else if (res.reason === "no_llm_key") {
          setNeedsKey(true);
          setResult(null);
        } else {
          const message = "message" in res ? res.message : undefined;
          setError(
            message ??
              `Couldn't run improve (${res.reason}). Try again in a moment.`,
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

  // A fresh run that produced a live proposal needs its patch fetched
  // separately (see the `patch` state note above) before the field diff can
  // render. Runs once per new proposalId.
  useEffect(() => {
    if (!result?.proposalId) {
      setPatch(undefined);
      return;
    }
    let cancelled = false;
    setPatch(undefined);
    getImproveProposalPatchAction(result.proposalId).then((res) => {
      if (cancelled) return;
      setPatch(res.ok ? res.patch : null);
    });
    return () => {
      cancelled = true;
    };
  }, [result?.proposalId]);

  const apply = (proposalId: string) => {
    setResolveError(null);
    setResolveNote(null);
    startResolve(async () => {
      const res = await applyImproveProposalAction(proposalId);
      if (res.ok) {
        setResolvedProposalId(proposalId);
        setResolveNote(
          res.note ? `Applied (v${res.version}, ${res.note}).` : `Applied — now v${res.version}.`,
        );
      } else {
        setResolveError(`Couldn't apply this proposal (${res.error}).`);
      }
    });
  };

  const dismiss = (proposalId: string) => {
    setResolveError(null);
    setResolveNote(null);
    startResolve(async () => {
      const res = await dismissImproveProposalAction(proposalId);
      if (res.ok) {
        setResolvedProposalId(proposalId);
        setResolveNote("Dismissed.");
      } else {
        setResolveError("Couldn't dismiss this proposal.");
      }
    });
  };

  const paired = result?.paired ?? null;
  const verdict = result?.verdict ?? null;
  const isResolved = result?.proposalId !== null && result?.proposalId === resolvedProposalId;

  const fieldDiff: BlueprintFieldDiff[] =
    result?.proposalId && !isResolved && patch
      ? diffBlueprintFields(currentBlueprint, patch)
      : [];

  return (
    <section className="rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5 space-y-4">
      <header className="flex flex-wrap items-start gap-3">
        <span
          className="inline-flex size-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
          aria-hidden
        >
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Improve
          </h2>
          <p className="text-[13px] text-muted-foreground max-w-2xl">
            Replays this agent&apos;s recent real conversations, clusters what
            went wrong, and proposes a blueprint patch with before/after
            scores. Nothing is applied automatically — you decide.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="crm-button-primary h-9 shrink-0 px-4 text-sm"
        >
          {running ? "Improving…" : "Improve"}
        </button>
      </header>

      {/* BYOK gate — improve is unbounded-COGS build/test work (two full
          eval replays), same posture as run-evals.tsx / RunEvalsCard. */}
      {needsKey && (
        <div className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-[13px] text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-200">
          <span aria-hidden className="pt-0.5 text-base leading-none">
            ✨
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Add your key to run improve</p>
            <p className="mt-0.5 opacity-90">
              Your first workspace stays free. Building, testing, and
              improving your own agents runs on your Anthropic key.
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
          Sourcing real conversations and replaying baseline + candidate…
          this can take up to a minute.
        </p>
      )}

      {result && (
        <div className="space-y-4">
          {/* No candidate ran at all (perfect baseline, or nothing
              proposed) — just the baseline + why. */}
          {paired === null && (
            <div className="space-y-1.5">
              <p className="text-sm text-foreground">
                Baseline: {Math.round(result.baseline.passRate * result.baseline.total)}{" "}
                of {result.baseline.total} scenarios passed.
              </p>
              {result.note && (
                <p className="text-[13px] text-muted-foreground">
                  {result.note === "nothing to improve"
                    ? "Nothing to improve — the baseline already passed every scenario."
                    : result.note}
                </p>
              )}
            </div>
          )}

          {/* PAIRED flip counts — the HEADLINE. Never an aggregate
              percentage (small-N honesty). */}
          {paired !== null && verdict !== null && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold tracking-tight text-foreground">
                  {paired.improved} scenario{paired.improved === 1 ? "" : "s"} improved
                  {" · "}
                  {paired.regressed} regressed
                  {" · "}
                  {paired.unchanged} unchanged
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${verdictChipClass(verdict)}`}
                >
                  {VERDICT_COPY[verdict].label}
                </span>
                {VERDICT_COPY[verdict].note && (
                  <span className="text-[13px] text-muted-foreground">
                    {VERDICT_COPY[verdict].note}
                  </span>
                )}
                {paired.criticalRegressed && (
                  <span className="text-[13px] text-rose-700 dark:text-rose-400">
                    A critical scenario regressed.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Failure clusters — mode + count + evidence. */}
          {result.clusters.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Failure clusters
              </h3>
              <ul className="space-y-1.5">
                {result.clusters.map((c) => (
                  <li
                    key={c.mode}
                    className="rounded-lg border border-border/60 bg-background/50 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-foreground">
                        {c.mode}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {c.count} scenario{c.count === 1 ? "" : "s"}
                      </span>
                    </div>
                    {c.evidence.length > 0 && (
                      <ul className="mt-1 space-y-0.5 pl-3 text-[11px] text-muted-foreground">
                        {c.evidence.map((e, i) => (
                          <li key={i}>• {e}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Field diff + Apply/Dismiss — only when there's a live
              proposal to act on. */}
          {result.proposalId && !isResolved && (
            <div className="space-y-3">
              {patch === undefined && (
                <p className="text-[13px] italic text-muted-foreground">
                  Loading proposed changes…
                </p>
              )}
              {patch === null && (
                <p className="text-[13px] text-rose-700 dark:text-rose-300">
                  Couldn&apos;t load the proposed changes. You can still apply
                  or dismiss below.
                </p>
              )}
              {fieldDiff.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Proposed changes
                  </h3>
                  <ul className="space-y-1.5">
                    {fieldDiff.map((d) => (
                      <li
                        key={d.field}
                        className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-[13px]"
                      >
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {d.field}
                        </span>
                        <div className="mt-1 flex flex-col gap-1">
                          <span className="text-rose-700/90 dark:text-rose-300/90">
                            − {d.before || "(none)"}
                          </span>
                          <span className="text-emerald-700/90 dark:text-emerald-300/90">
                            + {d.after}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {resolveError && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  {resolveError}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => apply(result.proposalId!)}
                  disabled={resolving}
                  className="crm-button-primary h-9 px-4 text-sm"
                >
                  {resolving ? "Working…" : "Apply"}
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(result.proposalId!)}
                  disabled={resolving}
                  className="crm-button-secondary h-9 px-4 text-sm"
                >
                  {resolving ? "Working…" : "Dismiss"}
                </button>
              </div>
            </div>
          )}

          {isResolved && resolveNote && (
            <p className="text-[13px] text-muted-foreground">{resolveNote}</p>
          )}
        </div>
      )}
    </section>
  );
}
