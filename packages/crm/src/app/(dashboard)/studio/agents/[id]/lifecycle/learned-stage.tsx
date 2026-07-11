"use client";

// Agent lifecycle slice (T7) — Stage 01 "Learned": the Q&A record +
// continue-the-interview editing.
//
// Non-recording templates (built from a text description, not /record) get
// a compact "built from your description" card and no interview UI — the
// spec's explicit non-goal is only recording-derived templates carry a
// linked session to keep teaching.

import { useState, useTransition } from "react";
import { continueInterviewAction } from "@/lib/agent-templates/interview-actions";

export type AnsweredQuestionView = { question: string | null; answer: string; answeredAt: string };

export type LearnedStageProvenance = {
  goal: string | null;
  stepCount: number;
  automatable: number;
  needsApproval: number;
  staysWithYou: number;
  clarifications: number;
};

export function LearnedStage({
  templateId,
  hasRecording,
  provenance,
  initialAnsweredQuestions,
  initialOpenQuestions,
}: {
  templateId: string;
  hasRecording: boolean;
  provenance: LearnedStageProvenance | null;
  initialAnsweredQuestions: AnsweredQuestionView[];
  initialOpenQuestions: string[];
}) {
  const [answered, setAnswered] = useState(initialAnsweredQuestions);
  const [openQuestions, setOpenQuestions] = useState(initialOpenQuestions);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<{ text: string; applied: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startPending] = useTransition();

  if (!hasRecording) {
    return (
      <div className="rounded-lg border border-[var(--lc-line)] bg-[var(--lc-surface)]/40 p-3 text-sm text-[var(--lc-muted)]">
        Built from your description — no recording to keep teaching.
      </div>
    );
  }

  const send = () => {
    const text = message.trim();
    if (!text) return;
    setError(null);
    setReply(null);
    startPending(async () => {
      const result = await continueInterviewAction({ templateId, message: text });
      if (!result.ok) {
        setError(
          result.error === "extraction_unavailable"
            ? "Couldn't reach the interview model — try again in a moment."
            : "Couldn't apply that — try rephrasing.",
        );
        return;
      }
      setReply({ text: result.reply, applied: result.applied });
      setOpenQuestions(result.openQuestions);
      if (result.applied) {
        setAnswered((prev) => [...prev, { question: null, answer: text, answeredAt: new Date().toISOString() }]);
        setMessage("");
      }
    });
  };

  return (
    <div className="space-y-4">
      {provenance ? (
        <p className="text-sm leading-relaxed text-[var(--lc-muted)]">
          {provenance.goal ?? "Learned from your recording."} · {provenance.stepCount} step
          {provenance.stepCount === 1 ? "" : "s"} · {provenance.automatable} automatable /{" "}
          {provenance.needsApproval} need approval / {provenance.staysWithYou} stay with you
          {provenance.clarifications > 0
            ? ` · ${provenance.clarifications} clarification${provenance.clarifications === 1 ? "" : "s"}`
            : ""}
        </p>
      ) : null}

      {answered.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--lc-muted)]">What you've taught it:</p>
          <ul className="space-y-2">
            {answered.map((qa, i) => (
              <li key={i} className="rounded-lg border border-[var(--lc-line)] bg-[var(--lc-surface)]/30 p-2.5 text-sm">
                {qa.question ? (
                  <p className="font-medium text-[var(--lc-ink)]">{qa.question}</p>
                ) : null}
                <p className="text-[var(--lc-muted)]">{qa.answer}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {openQuestions.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-[var(--lc-muted)]">Still open:</p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-[var(--lc-muted)]">
            {openQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="lc-keep-teaching" className="text-xs font-medium text-[var(--lc-ink)]">
          Keep teaching it
        </label>
        <div className="flex flex-wrap items-start gap-2">
          <textarea
            id="lc-keep-teaching"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="e.g. If the client is out of state, always ask for a photo first."
            className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={pending || message.trim().length === 0}
            className="crm-button-secondary h-9 shrink-0 px-4 text-sm"
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
        {reply ? (
          <p
            className={`text-xs ${reply.applied ? "text-emerald-700 dark:text-emerald-400" : "text-[var(--lc-muted)]"}`}
          >
            {reply.text}
          </p>
        ) : null}
        {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
      </div>
    </div>
  );
}
