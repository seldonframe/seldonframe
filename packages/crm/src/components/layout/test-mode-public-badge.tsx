// Customer-facing "Demo / Test environment" badge.
// SLICE 8 C6 per audit §5.3 + gate G-8-3 (Option B: customer badge).
//
// Rendered inline with PoweredByBadge in public surfaces (booking
// page, portal). Tone: discreet (caution color), not alarming.
// Composition over existing tag/chip styles.

export function TestModePublicBadge({ testMode }: { testMode: boolean }) {
  if (!testMode) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-caution/40 bg-caution/10 px-2.5 py-0.5 text-xs font-medium text-caution">
      Demo / Test environment
    </span>
  );
}
