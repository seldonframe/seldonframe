"use client";

// "Make it fit anybody" — the Sell-card generalization panel (Task 3).
//
// Sits in the agent lifecycle "Sell" stage (mounted from sell-stage.tsx,
// alongside ListOnMarketplace), so a builder can turn their recorded agent's
// personal literals ("yo max check this out", a personal email/phone) into
// declared `{token}` fill-in variables BEFORE listing on the marketplace or
// deploying to a client. Propose → review (edit/accept per row) → apply.
// Never auto-applies — every row is operator-confirmed.
//
// Split into presentational pieces (`GeneralizationWarningRow`,
// `GeneralizationReviewList`) so the review-list rendering and the warning
// visibility are directly renderToString-testable without exercising the
// stateful orchestration (mirrors the repo's SLICE 4a renderToString
// convention — no jsdom).

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Wand2 } from "lucide-react";
import {
  proposeTemplateGeneralizationAction,
  applyTemplateGeneralizationAction,
} from "@/lib/agent-templates/generalize-actions";
import type { ProposedSubstitution } from "@/lib/agent-templates/generalize";

export type ReviewRow = ProposedSubstitution & { accepted: boolean };

/** Every typed error `proposeTemplateGeneralizationAction` can return
 *  (generalize-actions.ts's `ProposeTemplateGeneralizationResult["error"]`,
 *  duplicated here rather than imported so this stays a pure, dependency-free
 *  mapping — importing the "use server" action module's types is fine, but
 *  the VALUE mapping below must not accidentally pull in server-only code). */
export type ProposeTemplateGeneralizationError =
  | "unauthorized"
  | "template_not_found"
  | "empty_skill_md"
  | "llm_failed"
  | "malformed_llm_output";

/**
 * Agent truth slice (Task 1) — map each typed propose error to a distinct,
 * honest message. Before this fix ALL FIVE errors rendered the same generic
 * "Couldn't check for personal details. Try again." (Max's real failure was
 * an LLM/model issue that looked identical to "no key configured" or "bad
 * auth" — undiagnosable from the UI alone). Pure; never throws.
 */
export function mapProposeGeneralizationError(
  error: ProposeTemplateGeneralizationError,
): string {
  switch (error) {
    case "empty_skill_md":
      return "This agent has no instructions to check.";
    case "unauthorized":
      return "You don't have access to this template.";
    case "template_not_found":
      return "This agent's template couldn't be found.";
    case "llm_failed":
      return "The AI check couldn't run (model or key issue on our side) — try again in a minute.";
    case "malformed_llm_output":
      return "The AI returned something unusable — try again.";
    default:
      return "Couldn't check for personal details. Try again.";
  }
}

/** The non-blocking "this looks personal" nudge (design item 5). Renders
 *  nothing when `show` is false — visibility is a prop, never CSS
 *  display:none, so an L-36 test can assert the element's ABSENCE, not just
 *  a hidden class (the invariant this repo caught a real bug on before). */
export function GeneralizationWarningRow({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p
      data-generalize-warning
      className="mt-1 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300"
    >
      <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        This agent contains your personal details — run &quot;Make it fit
        anybody&quot; first.
      </span>
    </p>
  );
}

/** The review list: one row per proposed substitution, current value →
 *  editable {token}, with an include checkbox. Pure/presentational — the
 *  stateful parent owns the row array and the edit callbacks. */
export function GeneralizationReviewList({
  rows,
  onToggle,
  onEditToken,
  onEditDescription,
  onEditExample,
}: {
  rows: ReviewRow[];
  onToggle?: (index: number) => void;
  onEditToken?: (index: number, value: string) => void;
  onEditDescription?: (index: number, value: string) => void;
  onEditExample?: (index: number, value: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p data-generalize-empty className="text-xs text-muted-foreground">
        No personal details found — this agent looks ready to share as-is.
      </p>
    );
  }

  return (
    <ul data-generalize-review-list className="space-y-2">
      {rows.map((row, i) => (
        <li
          key={i}
          data-generalize-review-row
          className="rounded-md border border-border bg-background p-2.5 text-xs"
        >
          <label className="flex flex-wrap items-center gap-2">
            <input
              type="checkbox"
              checked={row.accepted}
              onChange={() => onToggle?.(i)}
              data-generalize-row-checkbox
              aria-label={`Include ${row.currentValue}`}
            />
            <span data-generalize-current-value className="font-mono text-foreground">
              {row.currentValue}
            </span>
            <span aria-hidden>&rarr;</span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden>{"{"}</span>
              <input
                type="text"
                value={row.token}
                onChange={(e) => onEditToken?.(i, e.target.value)}
                data-generalize-row-token
                aria-label="Variable name"
                className="w-32 rounded border border-border bg-transparent px-1 font-mono"
              />
              <span aria-hidden>{"}"}</span>
            </span>
          </label>
          <input
            type="text"
            value={row.description}
            onChange={(e) => onEditDescription?.(i, e.target.value)}
            data-generalize-row-description
            aria-label="Description"
            placeholder="What a deploying client should fill in"
            className="mt-1.5 w-full rounded border border-border bg-transparent px-1.5 py-1"
          />
          <input
            type="text"
            value={row.example}
            onChange={(e) => onEditExample?.(i, e.target.value)}
            data-generalize-row-example
            aria-label="Example value"
            placeholder="Example value"
            className="mt-1 w-full rounded border border-border bg-transparent px-1.5 py-1"
          />
        </li>
      ))}
    </ul>
  );
}

export type GeneralizeTemplateCardProps = {
  templateId: string;
  /** Computed server-side (the page reads the org's own contact fields +
   *  the template's customSkillMd/templateVariables — cheap heuristic, see
   *  design item 5): the template still contains the org's own email/phone
   *  literal AND has never been generalized. Never a hard block — the
   *  operator may intend to keep their own details. */
  showPersonalDetailsWarning: boolean;
};

/** The full propose -> review -> apply card, mounted in the Sell stage. */
export function GeneralizeTemplateCard(props: GeneralizeTemplateCardProps) {
  const [open, setOpen] = useState(false);
  const [proposing, startProposing] = useTransition();
  const [applying, startApplying] = useTransition();
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const propose = () => {
    setError(null);
    setRows(null);
    setApplied(false);
    startProposing(async () => {
      const result = await proposeTemplateGeneralizationAction({ templateId: props.templateId });
      if (!result.ok) {
        setError(mapProposeGeneralizationError(result.error));
        return;
      }
      setRows(result.proposals.map((p) => ({ ...p, accepted: true })));
    });
  };

  const apply = () => {
    if (!rows) return;
    const accepted = rows.filter((r) => r.accepted);
    if (accepted.length === 0) {
      setError("Select at least one row to apply.");
      return;
    }
    setError(null);
    startApplying(async () => {
      const result = await applyTemplateGeneralizationAction({
        templateId: props.templateId,
        rows: accepted.map(({ token, currentValue, description, example }) => ({
          token,
          currentValue,
          description,
          example,
        })),
      });
      if (!result.ok) {
        setError(
          result.error === "literal_not_found"
            ? "One of the selected values no longer appears in the script — refresh and try again."
            : result.error === "duplicate_token"
              ? "Two rows share the same variable name — rename one."
              : result.error === "no_rows"
                ? "Select at least one row to apply."
                : "Couldn't apply. Try again.",
        );
        return;
      }
      setApplied(true);
      setRows(null);
    });
  };

  return (
    <div
      className="rounded-lg border border-[var(--lc-line)] bg-[var(--lc-surface)]/30 p-3.5"
      data-generalize-card
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--lc-ink)]">Make it fit anybody</p>
          <p className="text-xs text-[var(--lc-muted)]">
            Find personal details in this agent&apos;s instructions and turn them into
            fill-in variables any client can set at deploy time.
          </p>
          <GeneralizationWarningRow show={props.showPersonalDetailsWarning && !open} />
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            propose();
          }}
          disabled={proposing}
          className="crm-button-secondary inline-flex h-9 shrink-0 items-center gap-1.5 px-4 text-xs disabled:opacity-60"
          data-generalize-check-button
        >
          <Wand2 className="size-3.5" aria-hidden />
          {proposing ? "Checking…" : "Check for personal details"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3 border-t border-[var(--lc-line)] pt-3">
          {error ? (
            <p data-generalize-error className="text-xs text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}
          {applied ? (
            <p
              data-generalize-applied
              className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
            >
              <Check className="size-3.5" aria-hidden />
              Generalized — your own agent keeps working unchanged.
            </p>
          ) : null}
          {rows ? (
            <>
              <GeneralizationReviewList
                rows={rows}
                onToggle={(i) =>
                  setRows((prev) =>
                    prev ? prev.map((r, idx) => (idx === i ? { ...r, accepted: !r.accepted } : r)) : null,
                  )
                }
                onEditToken={(i, v) =>
                  setRows((prev) => (prev ? prev.map((r, idx) => (idx === i ? { ...r, token: v } : r)) : null))
                }
                onEditDescription={(i, v) =>
                  setRows((prev) =>
                    prev ? prev.map((r, idx) => (idx === i ? { ...r, description: v } : r)) : null,
                  )
                }
                onEditExample={(i, v) =>
                  setRows((prev) => (prev ? prev.map((r, idx) => (idx === i ? { ...r, example: v } : r)) : null))
                }
              />
              {rows.length > 0 ? (
                <button
                  type="button"
                  onClick={apply}
                  disabled={applying}
                  className="crm-button-primary h-9 px-4 text-xs disabled:opacity-60"
                  data-generalize-apply-button
                >
                  {applying ? "Applying…" : "Apply"}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
