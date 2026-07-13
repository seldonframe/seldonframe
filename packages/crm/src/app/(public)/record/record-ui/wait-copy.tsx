// packages/crm/src/app/(public)/record/record-ui/wait-copy.tsx
//
// Record v3 (S2b) — rotating, honest wait-copy shown while a slot is
// "uploading" or "compiling". Cycles a small set of stage-flavored lines
// every ~2.5s so the several-second upload/trace round trip feels alive
// instead of a frozen spinner. This is flavor text ONLY — never a fake
// progress claim. The real progress (frame upload count) still renders
// alongside it when available (uploadProgress), unchanged from before.
"use client";

import { useEffect, useState } from "react";

export const WAIT_COPY_INTERVAL_MS = 2500;

const UPLOADING_LINES = [
  "Reading your recording…",
  "Listening to your narration…",
];

const COMPILING_LINES = [
  "Mapping the steps you took…",
  "Working out what's safe to automate…",
];

export function WaitCopy({
  status,
  uploadProgress,
}: {
  status: "uploading" | "compiling";
  uploadProgress?: { done: number; total: number };
}) {
  const lines = status === "uploading" ? UPLOADING_LINES : COMPILING_LINES;
  const [idx, setIdx] = useState(0);

  // Reset to the first line whenever the status set changes (e.g. uploading
  // -> compiling) so the rotation always starts from that stage's first
  // line rather than carrying over a stale index.
  useEffect(() => {
    setIdx(0);
  }, [status]);

  useEffect(() => {
    if (lines.length <= 1) return;
    const timer = setInterval(() => {
      setIdx((i) => (i + 1) % lines.length);
    }, WAIT_COPY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [lines]);

  const progressSuffix =
    status === "uploading" && uploadProgress ? ` ${uploadProgress.done}/${uploadProgress.total}` : "";

  return (
    <p aria-live="polite" className="text-[13px] text-[#9CA3AF]">
      {lines[idx]}
      {progressSuffix}
    </p>
  );
}
