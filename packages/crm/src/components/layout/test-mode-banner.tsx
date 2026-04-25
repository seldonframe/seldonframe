// Workspace test-mode banner.
// SLICE 8 C5 per audit §5.2 + gate G-8-3.
//
// Composed over the DemoBanner pattern (caution color tone), but
// triggered by workspace state (org.testMode) instead of env var.
// Renders only when test mode is active.
//
// Composition pattern follows L-17 0.94x UI multiplier baseline
// (SLICE 4a precedent for composition over primitives).

import Link from "next/link";

export function TestModeBanner({ testMode }: { testMode: boolean }) {
  if (!testMode) return null;

  return (
    <div className="crm-card mb-4 flex flex-wrap items-center justify-between gap-3 border-caution/40 bg-caution/10 p-3 text-sm">
      <p className="text-[hsl(var(--color-text-secondary))]">
        <span className="font-medium text-foreground">Test mode active</span>{" "}
        — external messages and payments use sandbox endpoints
      </p>
      <Link
        href="/settings/test-mode"
        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-caution/20"
      >
        Disable test mode
      </Link>
    </div>
  );
}
