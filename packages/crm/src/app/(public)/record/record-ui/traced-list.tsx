// packages/crm/src/app/(public)/record/record-ui/traced-list.tsx
//
// Record v3 (S1) — compact stacked list of already-traced recordings.
// Sits below the single <CaptureCard>: once a slot traces, it moves here
// (thumbnail + editable label + "Traced · N steps" + a re-record link)
// instead of staying visible as its own big card. Presentation only —
// every handler is passed in from record-client.tsx unchanged.
"use client";

import type { RecorderSlot } from "../recorder-machine";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export function TracedList({
  slots,
  canStart,
  sessionReady,
  stepsFound,
  durationMsBySlot,
  onLabelChange,
  onRerecord,
}: {
  /** Already-filtered to status === "traced", in slotIndex order. */
  slots: RecorderSlot[];
  canStart: boolean;
  sessionReady: boolean;
  /** flowModel.steps.length — the merged flow's total, shared across every
   *  row (attributed to the flow, not a per-recording count). */
  stepsFound: number;
  durationMsBySlot: Record<number, number | undefined>;
  onLabelChange: (slotIndex: number, label: string) => void;
  onRerecord: (slotIndex: number) => void;
}) {
  if (slots.length === 0) return null;

  return (
    <ul aria-label="Traced recordings" className="flex flex-col gap-2.5">
      {slots.map((slot) => {
        const durationMs = durationMsBySlot[slot.slotIndex] ?? null;
        return (
          <li
            key={slot.slotIndex}
            className="flex items-center gap-3.5 rounded-[10px] border p-3"
            style={{ borderColor: "var(--lp-border-soft)", background: "var(--lp-card)" }}
          >
            <div
              className="relative h-10 w-[64px] shrink-0 overflow-hidden rounded-[6px]"
              style={{ background: "var(--lp-card)" }}
            >
              {durationMs !== null ? (
                <span
                  className="absolute bottom-1 right-1 rounded-[3px] px-1 text-[9px] tabular-nums"
                  style={{ background: "rgba(11,15,14,.82)", color: "var(--lp-ink)" }}
                >
                  {formatElapsed(durationMs)}
                </span>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <input
                type="text"
                value={slot.label ?? ""}
                onChange={(e) => onLabelChange(slot.slotIndex, e.target.value)}
                aria-label="Recording label"
                placeholder={slot.slotIndex === 0 ? "Happy path" : `Edge case ${slot.slotIndex}`}
                className="-ml-1 truncate rounded-[6px] bg-transparent px-1 py-0.5 text-[13.5px] font-[600] outline-none"
                style={{ color: "var(--lp-ink)" }}
              />
              <span className="text-[13.5px]" style={{ color: "var(--lp-accent)" }}>
                Traced · flow so far: {stepsFound} step{stepsFound === 1 ? "" : "s"}
              </span>
            </div>
            <button
              type="button"
              disabled={!canStart || !sessionReady}
              onClick={() => onRerecord(slot.slotIndex)}
              className="shrink-0 text-[13.5px] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline"
              style={{ color: "var(--lp-muted)" }}
            >
              Re-record
            </button>
          </li>
        );
      })}
    </ul>
  );
}
