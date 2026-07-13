// packages/crm/src/app/(public)/record/record-ui/recap-panel.tsx
//
// "What Seldon understood" recap: flow title + goal, per-step honest badges
// (green→Automatable / yellow→Needs approval / red→Stays with you), branches,
// open questions, the Ask Seldon chat, and the approve/compile CTA. All data
// comes from RecorderState (flowModel/coverage/openQuestions/interview) plus
// a handful of local record-client.tsx input/pending states — this component
// dispatches nothing itself.
//
// Test-critical copy (record-page-render.spec.ts): the wrapping element must
// keep aria-label="Recap", and the chat section must render the text
// "Ask Seldon" — both only ever render while state.phase is "recap" or
// "approved", never on initial landing.
"use client";

import type { ChangeEvent } from "react";
import type { CoverageEntry, CoverageTier, FlowModel } from "@/lib/recordings/trace-schema";
import type { InterviewTurn, RecorderState } from "../recorder-machine";
import { summarizeCoverage } from "../recorder-machine";
import { TIER_COLOR, TIER_LABEL } from "./tiers";

export function RecapPanel({
  phase,
  flowModel,
  coverage,
  openQuestions,
  interview,
  interviewInput,
  interviewPending,
  interviewError,
  isAuthed,
  compiling,
  compiledTemplateId,
  claimHref,
  onInterviewInputChange,
  onInterviewSend,
  onInterviewRetry,
  onCompileNow,
  onCompileAgent,
  onApprove,
  edgeCasePrompt,
}: {
  phase: RecorderState["phase"];
  flowModel: FlowModel | null;
  coverage: CoverageEntry[];
  openQuestions: string[];
  interview: InterviewTurn[];
  interviewInput: string;
  interviewPending: boolean;
  interviewError: string | null;
  isAuthed: boolean;
  compiling: boolean;
  compiledTemplateId: string | null;
  claimHref: string;
  onInterviewInputChange: (value: string) => void;
  onInterviewSend: () => void;
  onInterviewRetry: () => void;
  onCompileNow: () => void;
  onCompileAgent: () => void;
  onApprove: () => void;
  /** Record v3 (S1) — "Make it trustworthy" row. Absent (undefined) hides
   *  the row entirely: no slot traced yet, a slot is mid-capture, or all
   *  MAX_RECORDINGS_PER_SESSION slots are used. record-client.tsx computes
   *  the visibility rule; this component just renders whatever it's given. */
  edgeCasePrompt?: {
    onRecord: () => void;
    onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
    supportsScreenCapture: boolean;
  };
}) {
  const summary = summarizeCoverage(coverage);

  return (
    <section
      aria-label="Recap"
      className="flex flex-1 flex-col gap-5 rounded-[16px] border border-[rgba(231,229,222,.12)] bg-[#12171533] p-5"
    >
      <div>
        <p className="text-[10px] font-[600] uppercase tracking-[0.12em] text-[#14B8A6]">
          What Seldon understood
        </p>
        <h2 className="mt-2.5 text-[15px] font-[600] text-[#F5F4F0]">{flowModel?.title ?? "Your workflow"}</h2>
        <p className="mt-1 text-[13px] text-[#9CA3AF]">{flowModel?.goal}</p>
        <p className="mt-2.5 text-[12px] text-[#9CA3AF]">
          <span style={{ color: TIER_COLOR.green }}>{summary.automatable} automatable</span>
          {" · "}
          <span style={{ color: TIER_COLOR.yellow }}>{summary.needsApproval} need approval</span>
          {" · "}
          <span style={{ color: TIER_COLOR.red }}>{summary.staysWithYou} stay with you</span>
        </p>
      </div>

      <ol className="flex flex-col gap-2">
        {flowModel?.steps.map((step) => {
          const entry = coverage.find((c) => c.stepIndex === step.index);
          const tier: CoverageTier = entry?.tier ?? "red";
          return (
            <li
              key={step.index}
              className="flex items-start gap-2.5 rounded-[10px] border border-[rgba(231,229,222,.08)] p-2.5"
            >
              <span
                className="mt-1 inline-block size-2 shrink-0 rounded-full"
                style={{ backgroundColor: TIER_COLOR[tier] }}
                aria-hidden
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13.5px] text-[#E7E5DE]">{step.action}</p>
                  <span className="rounded-[4px] border border-[rgba(231,229,222,.14)] px-1.5 py-px text-[10px] text-[#9CA3AF]">
                    {step.app}
                  </span>
                  <span className="text-[11px] font-[600]" style={{ color: TIER_COLOR[tier] }}>
                    {TIER_LABEL[tier]}
                  </span>
                </div>
                {entry?.reason ? <p className="mt-1 text-[12px] text-[#9CA3AF]">{entry.reason}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>

      {flowModel?.branches && flowModel.branches.length > 0 ? (
        <div>
          <h3 className="text-[12px] font-[600] uppercase tracking-[0.05em] text-[#9CA3AF]">Branches</h3>
          <ul className="mt-1.5 flex flex-col gap-1">
            {flowModel.branches.map((branch, i) => (
              <li key={i} className="text-[12.5px] text-[#E7E5DE]">
                {branch.condition} → {branch.behavior}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {openQuestions.length > 0 ? (
        <div>
          <h3 className="text-[12px] font-[600] uppercase tracking-[0.05em] text-[#9CA3AF]">
            Open questions ({openQuestions.length})
          </h3>
          <ul className="mt-1.5 flex flex-col gap-1">
            {openQuestions.map((q, i) => (
              <li key={i} className="text-[12.5px] text-[#EAB308]">
                {q}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Review minor #5: the edge-case prompt must not linger once the
          flow has moved past recap (e.g. phase "approved") — gated here too,
          not just at the record-client.tsx call site, so this component's
          own contract holds regardless of caller. */}
      {edgeCasePrompt && phase === "recap" ? (
        <div className="flex flex-col gap-2.5 rounded-[10px] border border-[rgba(20,184,166,.22)] bg-[#14B8A60D] p-3">
          <div>
            <p className="text-[13px] font-[600] text-[#F5F4F0]">Make it trustworthy</p>
            <p className="mt-0.5 text-[12.5px] leading-[1.5] text-[#9CA3AF]">
              Anything ever go differently? Record that too — edge cases make the agent trustworthy.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {edgeCasePrompt.supportsScreenCapture ? (
              <button
                type="button"
                onClick={edgeCasePrompt.onRecord}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-[rgba(231,229,222,.16)] bg-transparent px-4 text-[12.5px] font-[600] text-[#E7E5DE]"
              >
                <span className="size-1.5 rounded-full bg-[#EF4444]" aria-hidden />
                + Record an edge case
              </button>
            ) : null}
            <label className="cursor-pointer text-[12.5px] text-[#9CA3AF] underline-offset-2 hover:text-[#E7E5DE] hover:underline">
              or upload
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={edgeCasePrompt.onFileChange}
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-[12px] font-[600] uppercase tracking-[0.05em] text-[#9CA3AF]">Ask Seldon</h3>
        <div className="flex max-h-[180px] flex-col gap-1.5 overflow-y-auto">
          {interview.map((turn, i) => (
            <p key={i} className={`text-[13px] ${turn.role === "user" ? "text-[#E7E5DE]" : "text-[#14B8A6]"}`}>
              <strong>{turn.role === "user" ? "You: " : "Seldon: "}</strong>
              {turn.text}
            </p>
          ))}
          {interviewPending ? (
            <p className="text-[13px] italic text-[#6B7280]">Seldon is updating the flow&hellip;</p>
          ) : null}
          {interviewError ? (
            <p role="alert" className="text-[13px] text-[#EF4444]">
              {interviewError}{" "}
              <button
                type="button"
                onClick={onInterviewRetry}
                className="underline underline-offset-2 hover:text-[#F5F4F0]"
              >
                Retry
              </button>
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={interviewInput}
            disabled={interviewPending}
            onChange={(e) => onInterviewInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onInterviewSend();
              }
            }}
            placeholder="Answer an open question or add detail..."
            className="flex-1 rounded-[10px] border border-[rgba(231,229,222,.12)] bg-transparent px-3 py-2 text-[13px] text-[#E7E5DE] outline-none placeholder:text-[#6B7280] disabled:opacity-50"
          />
          <button
            type="button"
            disabled={interviewPending}
            onClick={onInterviewSend}
            className="rounded-[10px] bg-[#14B8A6] px-3 py-2 text-[13px] font-[600] text-[#0B0F0E] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>

      {/* record v3 S3 — sticky bottom claim/compile CTA on mobile (<720px)
          once the recap is ready; desktop keeps it inline in the panel. */}
      {phase === "recap" ? (
        <div className="sticky bottom-0 -mx-5 -mb-5 border-t border-[rgba(231,229,222,.08)] bg-[#0B0F0E]/95 px-5 py-3 backdrop-blur min-[720px]:static min-[720px]:m-0 min-[720px]:border-0 min-[720px]:bg-transparent min-[720px]:p-0 min-[720px]:backdrop-blur-none">
          {isAuthed ? (
            <button
              type="button"
              disabled={compiling}
              onClick={onCompileNow}
              className="mt-1 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-[#14B8A6] px-5 py-3 text-[14px] font-[600] text-[#0B0F0E] disabled:opacity-50 min-[720px]:w-auto"
            >
              {compiling ? "Compiling..." : "Looks right — compile my agent"}
            </button>
          ) : (
            <a
              href={claimHref}
              onClick={onApprove}
              className="mt-1 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-[#14B8A6] px-5 py-3 text-[14px] font-[600] text-[#0B0F0E] min-[720px]:w-auto"
            >
              Looks right — claim &amp; compile my agent
            </a>
          )}
        </div>
      ) : null}

      {phase === "approved" && !compiledTemplateId ? (
        <button
          type="button"
          disabled={compiling}
          onClick={onCompileAgent}
          className="mt-1 inline-flex items-center justify-center gap-2.5 rounded-full bg-[#14B8A6] px-5 py-3 text-[14px] font-[600] text-[#0B0F0E] disabled:opacity-50"
        >
          {compiling ? "Compiling..." : "Compile my agent"}
        </button>
      ) : null}

      {compiledTemplateId ? (
        <div className="mt-1 flex flex-col gap-2">
          <p className="text-[13.5px] font-[600] text-[#F5F4F0]">Your agent is compiled</p>
          <a
            href={`/studio/agents/${compiledTemplateId}`}
            className="inline-flex items-center justify-center gap-2.5 rounded-full bg-[#14B8A6] px-5 py-3 text-[14px] font-[600] text-[#0B0F0E]"
          >
            Open your agent
          </a>
          <p className="text-[12px] text-[#9CA3AF]">
            It was compiled from your recording — run its evals and test it before publishing. It&apos;s a
            draft.
          </p>
        </div>
      ) : null}
    </section>
  );
}
