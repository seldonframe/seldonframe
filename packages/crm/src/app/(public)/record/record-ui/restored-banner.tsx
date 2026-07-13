// packages/crm/src/app/(public)/record/record-ui/restored-banner.tsx
//
// Recordings-column header row (Record.dc.html lines 73-79): an h2-weight
// "Your recordings" heading anchors the section — the "Restored from
// earlier · Start fresh" strip used to float on its own with no anchor
// (vision gate MAJOR, this fix wave), which read as an orphaned line above
// the capture card. "Start fresh" now only ever appears inline after
// "Restored from earlier", and only when the session actually came back
// through the rehydrate path (restored=true); a non-restored session shows
// the bare heading with no "Start fresh" text at all — this supersedes the
// earlier opus-review note (2026-07-12 #3) that kept "Start fresh" visible
// for any live session, since that reading left the button with nothing to
// anchor to when restored=false.
"use client";

export function RestoredBanner({
  restored,
  onStartFresh,
}: {
  restored: boolean;
  onStartFresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-3">
      <h2 className="text-[18px] font-[600] tracking-[-0.015em] text-[#E7E5DE]">Your recordings</h2>
      {restored ? (
        <span className="text-[13px] text-[#6B7280]">
          Restored from earlier ·{" "}
          <button
            type="button"
            onClick={onStartFresh}
            className="underline-offset-2 text-[#9CA3AF] hover:text-[#E7E5DE] hover:underline"
          >
            Start fresh
          </button>
        </span>
      ) : null}
    </div>
  );
}
