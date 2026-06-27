"use client";

// Agent Loop — L4 Generate-by-Default — Task T4: the "Describe your agent" panel.
//
// The generate-by-DEFAULT surface that sits at the TOP of the new-agent flow:
// one sentence → a complete, guard-railed, verified agent template. This is the
// thin client wrapper over the already-tested generateAgentDraftAction
// (lib/agents/generate/actions.ts → { sentence } → { ok, templateId, warnings }).
// SF's deterministic assembler wires the trigger + channel + guardrails + the
// quality (verify) rubric — the builder just describes the outcome in English.
//
// NOTE: this is DISTINCT from the sibling NewAgentButton modal, which drives the
// OTHER generateAgentDraftAction (the BYOK { prompt, surface } → { patch } editor
// refiner in lib/agent-templates/actions.ts). Different action, different shape;
// the starter pack + that modal stay intact below as the fallback path.
//
// Flow on Generate:
//   • empty / whitespace sentence → button disabled (no call),
//   • { ok:false } → inline error,
//   • { ok:true } with NO warnings → route straight to the editor (?new=1),
//   • { ok:true } WITH warnings → show them as an amber banner here, then a
//     "Continue to editor" button routes (we DON'T auto-navigate, or the
//     "set your review URL before going live" notice would flash past unseen).
//
// Reuses the design-system chrome: rounded-xl border bg-card panel, the
// crm-button-primary CTA, the amber notice style from list-on-marketplace.tsx,
// and the useTransition + action-calling pattern from the rest of Studio.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, AlertTriangle, ArrowRight, Plug, ListChecks } from "lucide-react";
import { generateAgentDraftAction } from "@/lib/agents/generate/actions";

const PLACEHOLDER =
  "Answer missed calls and text the customer back to book the job…";

// Rotating status copy shown on the Generate button while the draft is written,
// so the multi-second LLM-classify + assemble feels alive instead of frozen.
// Cycled every GEN_STATUS_INTERVAL_MS while pending. Mirrors the Studio convention.
const GEN_STATUS_MESSAGES = [
  "Reading your sentence…",
  "Picking the trigger + channel…",
  "Wiring the guardrails…",
  "Adding the quality checks…",
  "Assembling your agent…",
];
const GEN_STATUS_INTERVAL_MS = 1500;

export function DescribeAgent() {
  const router = useRouter();
  const [sentence, setSentence] = useState("");
  const [error, setError] = useState<string | null>(null);
  // When the action returns warnings, we hold them + the new template id here so
  // the builder can read them before continuing (instead of an auto-navigate
  // that would flash the notice past). null = no pending hand-off.
  const [pendingResult, setPendingResult] = useState<{
    templateId: string;
    warnings: string[];
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Rotating loader-copy index: reset to 0 each time generation starts, advance
  // on an interval while pending, clear the interval when pending ends/unmounts.
  const [statusIdx, setStatusIdx] = useState(0);
  useEffect(() => {
    if (!isPending) return;
    setStatusIdx(0);
    const id = setInterval(() => {
      setStatusIdx((i) => (i + 1) % GEN_STATUS_MESSAGES.length);
    }, GEN_STATUS_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPending]);

  const trimmed = sentence.trim();
  const canGenerate = trimmed.length > 0 && !isPending;

  const editorHref = (templateId: string) =>
    `/studio/agents/${templateId}?new=1`;

  const generate = () => {
    setError(null);
    setPendingResult(null);
    if (!trimmed) return; // button is disabled, but guard anyway.
    startTransition(async () => {
      const result = await generateAgentDraftAction({ sentence: trimmed });
      if (!result.ok) {
        setError(messageForError(result.error));
        return;
      }
      // Success. If there are warnings, surface them and let the builder click
      // through; otherwise go straight to the editor.
      if (result.warnings.length > 0) {
        setPendingResult({
          templateId: result.templateId,
          warnings: result.warnings,
        });
        return;
      }
      router.push(editorHref(result.templateId));
    });
  };

  return (
    // Calm hero (Claude Design direction A): the generator IS the page's
    // centerpiece. A quiet eyebrow + accent-soft sparkle badge, an oversized
    // borderless textarea that reads like a prompt, then a hairline footer with
    // the "uses your connected tools" reassurance + the Generate CTA. Tokens map
    // to LIVE SeldonFrame vars (bg-card / border-border / bg-primary/10 / etc.).
    <section
      aria-labelledby="describe-agent-heading"
      className="rounded-2xl border border-border bg-card p-6 shadow-(--shadow-xs) sm:p-7"
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          aria-hidden
        >
          <Sparkles className="size-4" />
        </span>
        <span
          id="describe-agent-heading"
          className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground"
        >
          Describe your agent
        </span>
      </div>

      <label htmlFor="describe-agent-input" className="sr-only">
        Describe your agent in one sentence
      </label>
      <textarea
        id="describe-agent-input"
        value={sentence}
        onChange={(e) => {
          setSentence(e.target.value);
          // A new edit invalidates a prior error or pending hand-off.
          if (error) setError(null);
          if (pendingResult) setPendingResult(null);
        }}
        rows={2}
        placeholder={PLACEHOLDER}
        disabled={isPending}
        className="w-full resize-none border-none bg-transparent p-0 text-lg leading-relaxed tracking-tight text-foreground outline-none placeholder:text-muted-foreground/70 focus:outline-none disabled:opacity-60 sm:text-xl"
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Plug className="size-3.5 shrink-0" aria-hidden />
          Uses your connected tools — Calendar, SMS, email
        </span>
        <button
          type="button"
          onClick={generate}
          disabled={!canGenerate}
          className="crm-button-primary inline-flex h-11 items-center gap-2 px-5 text-sm disabled:opacity-60"
        >
          <Sparkles className={`size-4 ${isPending ? "animate-pulse" : ""}`} />
          {isPending ? GEN_STATUS_MESSAGES[statusIdx] : "Generate agent"}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {/* Warnings hand-off: the agent WAS created (it's safe + guard-railed); these
          are "before you go live" reminders the assembler surfaced. Shown as a calm
          amber checklist (Claude Design "Finish before going live"), then a button
          to continue to the editor. */}
      {pendingResult && (
        <div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <ListChecks className="size-4 shrink-0" aria-hidden />
            Finish before going live
          </div>
          <ul className="space-y-1.5">
            {pendingResult.warnings.map((w, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300"
              >
                <AlertTriangle
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden
                />
                {w}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => router.push(editorHref(pendingResult.templateId))}
            className="crm-button-primary mt-3.5 inline-flex h-9 items-center gap-1.5 px-4 text-sm"
          >
            Continue to editor
            <ArrowRight className="size-4" />
          </button>
        </div>
      )}
    </section>
  );
}

/** Map the action's error codes to builder-facing copy. The action returns
 *  "empty_sentence" (guarded against here), "unauthorized", or a create-path
 *  error string; anything unknown falls through to a generic retry message. */
function messageForError(code: string): string {
  switch (code) {
    case "empty_sentence":
      return "Describe what your agent should do first.";
    case "unauthorized":
      return "Please sign in to build an agent.";
    default:
      return "Couldn't generate your agent — try rephrasing, then generate again.";
  }
}
