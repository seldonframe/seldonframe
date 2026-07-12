// packages/crm/src/app/(public)/record/record-ui/slot-card.tsx
//
// One recording slot's card — state chip, live recording timer/frame count,
// transcript snippet, thumbnail+duration once traced, "Re-record"
// affordance. Presentation only: every prop below is data record-client.tsx
// already holds in its reducer state or local component state; this
// component adds no I/O and dispatches no reducer actions itself (all
// handlers are passed in from record-client.tsx unchanged).
//
// Test-critical copy (packages/crm/tests/unit/recordings/record-page-render.spec.ts)
// — do not rename without updating that spec:
//   - the "Record" button's text node must render as exactly "Record"
//   - the upload affordance's text must contain "or upload a recording"
"use client";

import type { ChangeEvent } from "react";
import type { RecorderSlot } from "../recorder-machine";

const STATUS_TAG: Record<RecorderSlot["status"], { label: string; color: string }> = {
  empty: { label: "Empty", color: "rgba(231,229,222,.4)" },
  recording: { label: "Recording", color: "#EF4444" },
  uploading: { label: "Uploading", color: "#9CA3AF" },
  compiling: { label: "Compiling", color: "#14B8A6" },
  traced: { label: "Traced", color: "#14B8A6" },
  failed: { label: "Failed", color: "#EF4444" },
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export function SlotCard({
  slot,
  isActive,
  canStart,
  sessionReady,
  supportsScreenCapture,
  elapsedMs,
  durationMs,
  stepsFound,
  fallbackText,
  pendingUpload,
  uploadProgress,
  onRecord,
  onStop,
  onFileChange,
  onLabelChange,
  onFallbackTextChange,
  onProcessUpload,
  onCancelUpload,
}: {
  slot: RecorderSlot;
  isActive: boolean;
  canStart: boolean;
  sessionReady: boolean;
  supportsScreenCapture: boolean;
  /** Live elapsed ms while this slot is "recording" — null otherwise. */
  elapsedMs: number | null;
  /** Recorded/uploaded clip length once known (set once finalizeRecording's
   *  durationMs lands) — used for the traced-state thumbnail overlay. */
  durationMs: number | null;
  /** flowModel.steps.length as of this slot's most recent trace — the flow's
   *  known step count, not a per-recording count (no pipeline data exists
   *  for the latter without a compiler change). */
  stepsFound: number;
  fallbackText: string;
  pendingUpload: File | undefined;
  uploadProgress: { done: number; total: number } | undefined;
  onRecord: () => void;
  onStop: () => void;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onLabelChange: (label: string) => void;
  onFallbackTextChange: (text: string) => void;
  onProcessUpload: () => void;
  onCancelUpload: () => void;
}) {
  const tag = STATUS_TAG[slot.status];
  const isEmptyNoUpload = slot.status === "empty" && !pendingUpload;
  const isEmptyWithUpload = slot.status === "empty" && !!pendingUpload;
  const frameEstimate = elapsedMs !== null ? Math.floor(elapsedMs / 1000) : 0;

  return (
    <div
      className="flex min-h-[148px] flex-col gap-3 rounded-[12px] border p-4"
      style={{
        borderColor:
          slot.status === "failed"
            ? "rgba(239,68,68,.35)"
            : slot.status === "recording"
              ? "rgba(239,68,68,.25)"
              : "rgba(231,229,222,.1)",
        background: "#0F1413",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        {slot.status === "traced" ? (
          <input
            type="text"
            value={slot.label ?? ""}
            onChange={(e) => onLabelChange(e.target.value)}
            aria-label="Recording label"
            className="-ml-1.5 flex-1 rounded-[6px] bg-transparent px-1.5 py-0.5 text-[14px] font-[600] text-[#E7E5DE] outline-none"
          />
        ) : (
          <input
            type="text"
            value={slot.label ?? ""}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder={slot.slotIndex === 0 ? "Happy path" : `Edge case ${slot.slotIndex}`}
            className="flex-1 bg-transparent text-[14px] font-[600] text-[#E7E5DE] outline-none placeholder:font-[400] placeholder:text-[#6B7280]"
          />
        )}
        <span
          className="shrink-0 text-[10px] font-[600] uppercase tracking-[0.1em]"
          style={{ color: tag.color }}
        >
          {tag.label}
        </span>
      </div>

      {/* empty */}
      {isEmptyNoUpload ? (
        <div className="flex flex-1 flex-col gap-3">
          {slot.error ? <p className="text-[12.5px] text-[#EF4444]">{slot.error}</p> : null}
          {supportsScreenCapture ? (
            <div className="flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                disabled={!canStart || !sessionReady}
                onClick={onRecord}
                className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[rgba(231,229,222,.16)] bg-transparent px-4 text-[13px] font-[600] text-[#E7E5DE] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="size-2 rounded-full bg-[#EF4444]" aria-hidden />
                Record
              </button>
              <label className="inline-flex h-10 cursor-pointer items-center text-[13px] text-[#9CA3AF] underline-offset-2 hover:text-[#E7E5DE] hover:underline">
                or upload a recording
                <input type="file" accept="video/*" className="sr-only" onChange={onFileChange} />
              </label>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-[8px] border border-[rgba(231,229,222,.16)] bg-transparent px-4 text-center text-[14px] font-[600] text-[#E7E5DE]">
                Upload a screen recording
                <input type="file" accept="video/*" className="sr-only" onChange={onFileChange} />
              </label>
              <p className="text-[12px] leading-[1.45] text-[#9CA3AF]">
                Record your screen with your phone&apos;s built-in recorder, then upload it here.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* uploaded-file pending: required summary before processing */}
      {isEmptyWithUpload ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={fallbackText}
            onChange={(e) => onFallbackTextChange(e.target.value)}
            placeholder="Describe what you did in this recording (required — uploaded files have no live transcript)"
            className="h-16 w-full resize-none rounded-[10px] border border-[rgba(231,229,222,.12)] bg-transparent p-2.5 text-[13px] text-[#E7E5DE] outline-none placeholder:text-[#6B7280]"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!fallbackText.trim()}
              onClick={onProcessUpload}
              className="inline-flex h-11 items-center justify-center rounded-full bg-[#14B8A6] px-4 text-[13px] font-[600] text-[#0B0F0E] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Process recording
            </button>
            <button
              type="button"
              onClick={onCancelUpload}
              className="text-[12.5px] text-[#6B7280] hover:text-[#9CA3AF]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* recording */}
      {slot.status === "recording" ? (
        <div className="flex flex-1 flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="size-2.5 animate-pulse rounded-full bg-[#EF4444]" aria-hidden />
            <span className="text-[13px] font-[600] text-[#EF4444]">Recording</span>
            <span className="ml-auto text-[19px] font-[600] tabular-nums tracking-[-0.01em] text-[#E7E5DE]">
              {formatElapsed(elapsedMs ?? 0)}
            </span>
          </div>
          {/* 1fps capture ⇒ frames ≈ elapsed seconds; it's an estimate, say so
              (review #4 — never state an estimate as an exact count). */}
          <p className="text-[12px] tabular-nums text-[#9CA3AF]">≈{frameEstimate} frames captured</p>
          {isActive ? (
            <textarea
              value={fallbackText}
              onChange={(e) => onFallbackTextChange(e.target.value)}
              placeholder="Describe what you did (used if your browser can't transcribe speech)"
              className="h-14 w-full resize-none rounded-[10px] border-t border-[rgba(231,229,222,.07)] bg-transparent p-2.5 pt-2.5 font-mono text-[12px] leading-[1.5] text-[#9CA3AF] outline-none placeholder:text-[#6B7280]"
            />
          ) : null}
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-11 items-center justify-center rounded-[8px] border-none bg-[#E7E5DE] text-[14px] font-[600] text-[#0B0F0E]"
          >
            Stop &amp; compile
          </button>
        </div>
      ) : null}

      {/* uploading */}
      {slot.status === "uploading" ? (
        <div className="flex flex-1 flex-col justify-center gap-2">
          <p className="text-[12.5px] text-[#9CA3AF]">
            {uploadProgress
              ? `Reading your recording… ${uploadProgress.done}/${uploadProgress.total}`
              : "Uploading…"}
          </p>
        </div>
      ) : null}

      {/* compiling */}
      {slot.status === "compiling" ? (
        <div className="flex flex-1 items-center gap-2.5">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#14B8A6"
            strokeWidth="2"
            strokeLinecap="round"
            className="animate-spin"
            aria-hidden
          >
            <path d="M21 12a9 9 0 1 1-6.2-8.56" />
          </svg>
          <span className="text-[13px] font-[500] text-[#14B8A6]">Compiling — tracing your steps</span>
        </div>
      ) : null}

      {/* traced */}
      {slot.status === "traced" ? (
        <div className="flex flex-1 gap-3.5">
          <div className="relative h-12 w-[76px] shrink-0 overflow-hidden rounded-[6px] bg-[#1B2220]">
            {durationMs !== null ? (
              <span className="absolute bottom-1 right-1 rounded-[3px] bg-[rgba(11,15,14,.82)] px-1 text-[9px] tabular-nums text-[#E7E5DE]">
                {formatElapsed(durationMs)}
              </span>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[12px] text-[#14B8A6]">
              {/* stepsFound is the MERGED flow's total — attribute it to the
                  flow, not this recording (review #4). */}
              Traced · flow so far: {stepsFound} step{stepsFound === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              disabled={!canStart || !sessionReady}
              onClick={onRecord}
              className="text-left text-[12px] text-[#6B7280] underline-offset-2 hover:text-[#9CA3AF] hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline"
            >
              Re-record
            </button>
          </div>
        </div>
      ) : null}

      {/* failed */}
      {slot.status === "failed" ? (
        <div className="flex flex-1 flex-col gap-2.5">
          <p className="text-[12.5px] leading-[1.5] text-[#9CA3AF]">{slot.error}</p>
          <button
            type="button"
            disabled={!canStart || !sessionReady}
            onClick={onRecord}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-[rgba(231,229,222,.16)] bg-transparent text-[13px] font-[600] text-[#E7E5DE] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="size-2 rounded-full bg-[#EF4444]" aria-hidden />
            Re-record
          </button>
        </div>
      ) : null}

      {slot.whatChanged && slot.whatChanged.length > 0 ? (
        <ul className="list-disc pl-4 text-[12.5px] text-[#14B8A6]">
          {slot.whatChanged.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
