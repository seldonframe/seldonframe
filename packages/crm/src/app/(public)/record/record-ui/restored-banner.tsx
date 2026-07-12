// packages/crm/src/app/(public)/record/record-ui/restored-banner.tsx
//
// "Restored from earlier · Start fresh" strip. The "Restored from earlier"
// text renders only when the session actually came back through the
// rehydrate path (restored=true); the "Start fresh" escape hatch renders for
// ANY live session — the pre-v2 UI offered it whenever a sessionId existed,
// and narrowing it to restored sessions was a regression (opus review
// 2026-07-12 #3). Purely presentational; handleStartFresh passed in unchanged.
"use client";

export function RestoredBanner({
  restored,
  onStartFresh,
}: {
  restored: boolean;
  onStartFresh: () => void;
}) {
  return (
    <p className="text-[13px] text-[#6B7280]">
      {restored ? <>Restored from earlier · </> : null}
      <button
        type="button"
        onClick={onStartFresh}
        className="underline-offset-2 text-[#9CA3AF] hover:text-[#E7E5DE] hover:underline"
      >
        Start fresh
      </button>
    </p>
  );
}
