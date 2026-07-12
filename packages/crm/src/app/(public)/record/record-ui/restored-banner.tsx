// packages/crm/src/app/(public)/record/record-ui/restored-banner.tsx
//
// "Restored from earlier · Start fresh" strip — shown only where the
// existing rehydrate path (record-client.tsx's stored-session GET) landed,
// i.e. record-client sets restoredSession=true after a successful REHYDRATED
// dispatch. Purely presentational; handleStartFresh already exists and is
// passed in unchanged.
"use client";

export function RestoredBanner({ onStartFresh }: { onStartFresh: () => void }) {
  return (
    <p className="text-[13px] text-[#6B7280]">
      Restored from earlier ·{" "}
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
