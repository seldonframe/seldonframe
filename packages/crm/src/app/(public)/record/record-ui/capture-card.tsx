// packages/crm/src/app/(public)/record/record-ui/capture-card.tsx
//
// Record v3 (S1) — the ONE primary capture card. Replaces the 6-card grid:
// record-client.tsx now renders exactly one <CaptureCard> for the first
// non-traced slot (empty/recording/uploading/compiling/failed) — never a
// grid of 6 empty boxes up front. Once that slot traces, it drops off the
// capture surface entirely and reappears as a compact row in
// <TracedList>; the next empty slot (if any) becomes the new capture card,
// reached via the recap panel's "+ Record an edge case" prompt rather than
// always being visible.
//
// Visually bigger than the old per-slot card (the v2 6-card grid, removed
// in this branch) — this is the single focal action on the page, matching
// Record.dc.html's big Record / Upload button. Record renders OUTLINED
// (transparent bg, 1px border, red dot) per the design — the teal fill is
// reserved for the claim/compile primary CTA elsewhere on the page.
//
// Test-critical copy (record-page-render.spec.ts) — do not rename:
//   - the Record button's text node must render as exactly "Record"
//   - the upload affordance's text must contain "or upload a recording"
"use client";

import type { ChangeEvent } from "react";
import type { RecorderSlot } from "../recorder-machine";
import { WaitCopy } from "./wait-copy";

export function CaptureCard({
  slot,
  isActive,
  canStart,
  sessionReady,
  supportsScreenCapture,
  elapsedMs,
  fallbackText,
  pendingUpload,
  uploadProgress,
  onRecord,
  onStop,
  onFileChange,
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
  fallbackText: string;
  pendingUpload: File | undefined;
  uploadProgress: { done: number; total: number } | undefined;
  onRecord: () => void;
  onStop: () => void;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onFallbackTextChange: (text: string) => void;
  onProcessUpload: () => void;
  onCancelUpload: () => void;
}) {
  const isEmptyNoUpload = slot.status === "empty" && !pendingUpload;
  const isEmptyWithUpload = slot.status === "empty" && !!pendingUpload;
  const frameEstimate = elapsedMs !== null ? Math.floor(elapsedMs / 1000) : 0;
  const isFirstRecording = slot.slotIndex === 0;

  return (
    <div
      className="flex w-full flex-col items-center gap-4 rounded-[14px] border p-6 text-center sm:p-8"
      style={{
        borderColor:
          slot.status === "failed"
            ? "rgba(239,68,68,.35)"
            : slot.status === "recording"
              ? "rgba(239,68,68,.25)"
              : "var(--lp-border-soft)",
        background: "var(--lp-card)",
      }}
    >
      {isEmptyNoUpload ? (
        <div className="flex w-full flex-col items-center gap-4">
          <p className="max-w-[46ch] text-pretty text-[13.5px] leading-[1.55]" style={{ color: "var(--lp-body)" }}>
            {isFirstRecording
              ? "One normal, successful run — start to finish, talking out loud."
              : "Anything ever go differently? Record that too — edge cases make the agent trustworthy."}
          </p>
          {slot.error ? <p className="text-[13.5px]" style={{ color: "#EF4444" }}>{slot.error}</p> : null}
          {supportsScreenCapture ? (
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                disabled={!canStart || !sessionReady}
                onClick={onRecord}
                className="inline-flex h-14 items-center gap-2.5 rounded-full border border-[color:var(--lp-border)] bg-transparent px-7 text-[15px] font-[600] text-[color:var(--lp-ink)] hover:border-[color:var(--lp-ink)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="size-2 rounded-full bg-[#F87171]" aria-hidden />
                Record
              </button>
              <label
                className="cursor-pointer text-[13.5px] underline-offset-2 hover:underline"
                style={{ color: "var(--lp-body)" }}
              >
                or upload a recording
                <input type="file" accept="video/*" className="sr-only" onChange={onFileChange} />
              </label>
            </div>
          ) : (
            <div className="flex w-full max-w-[360px] flex-col gap-2">
              <label className="inline-flex h-12 cursor-pointer items-center justify-center rounded-full border border-[color:var(--lp-border)] bg-transparent px-5 text-center text-[14px] font-[600] text-[color:var(--lp-ink)] hover:border-[color:var(--lp-ink)]">
                Upload a screen recording
                <input type="file" accept="video/*" className="sr-only" onChange={onFileChange} />
              </label>
              <p className="text-[13.5px] leading-[1.55]" style={{ color: "var(--lp-body)" }}>
                Record your screen with your phone&apos;s built-in recorder, then upload it here.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {isEmptyWithUpload ? (
        <div className="flex w-full max-w-[480px] flex-col gap-2.5">
          <textarea
            value={fallbackText}
            onChange={(e) => onFallbackTextChange(e.target.value)}
            placeholder="Describe what you did in this recording (required — uploaded files have no live transcript)"
            className="h-16 w-full resize-none rounded-[10px] border bg-transparent p-2.5 text-[13.5px] outline-none"
            style={{ borderColor: "var(--lp-border-soft)", color: "var(--lp-ink)" }}
          />
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={!fallbackText.trim()}
              onClick={onProcessUpload}
              className="inline-flex h-11 items-center justify-center rounded-full px-5 text-[13.5px] font-[600] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--lp-accent)", color: "var(--lp-on-accent)" }}
            >
              Process recording
            </button>
            <button
              type="button"
              onClick={onCancelUpload}
              className="text-[13.5px]"
              style={{ color: "var(--lp-muted)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {slot.status === "recording" ? (
        <div className="flex w-full max-w-[480px] flex-col items-center gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="size-2.5 animate-pulse rounded-full bg-[#EF4444]" aria-hidden />
            <span className="text-[13.5px] font-[600] text-[#EF4444]">Recording</span>
            <span
              className="text-[19px] font-[600] tabular-nums tracking-[-0.01em]"
              style={{ color: "var(--lp-ink)" }}
            >
              {formatElapsed(elapsedMs ?? 0)}
            </span>
          </div>
          {/* 1fps capture ⇒ frames ≈ elapsed seconds; it's an estimate, say so. */}
          <p className="text-[13.5px] tabular-nums" style={{ color: "var(--lp-body)" }}>
            ≈{frameEstimate} frames captured
          </p>
          {isActive ? (
            <textarea
              value={fallbackText}
              onChange={(e) => onFallbackTextChange(e.target.value)}
              placeholder="Describe what you did (used if your browser can't transcribe speech)"
              className="h-14 w-full resize-none rounded-[10px] border-t bg-transparent p-2.5 pt-2.5 font-mono text-[13.5px] leading-[1.55] outline-none"
              style={{ borderColor: "var(--lp-border-soft)", color: "var(--lp-body)" }}
            />
          ) : null}
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-12 items-center justify-center rounded-full border-none px-6 text-[14px] font-[600]"
            style={{ background: "var(--lp-ink)", color: "var(--lp-bg)" }}
          >
            Stop &amp; compile
          </button>
        </div>
      ) : null}

      {slot.status === "uploading" || slot.status === "compiling" ? (
        <div className="flex w-full max-w-[480px] flex-col items-center gap-2.5 py-2">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--lp-accent)"
            strokeWidth="2"
            strokeLinecap="round"
            className="animate-spin"
            aria-hidden
          >
            <path d="M21 12a9 9 0 1 1-6.2-8.56" />
          </svg>
          <WaitCopy status={slot.status} uploadProgress={uploadProgress} />
        </div>
      ) : null}

      {slot.status === "failed" ? (
        <div className="flex w-full max-w-[480px] flex-col items-center gap-2.5">
          <p className="text-[13.5px] leading-[1.55]" style={{ color: "var(--lp-body)" }}>{slot.error}</p>
          <button
            type="button"
            disabled={!canStart || !sessionReady}
            onClick={onRecord}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border bg-transparent px-6 text-[13.5px] font-[600] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ borderColor: "var(--lp-border)", color: "var(--lp-ink)" }}
          >
            <span className="size-2 rounded-full bg-[#EF4444]" aria-hidden />
            Re-record
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}
