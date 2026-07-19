import Link from "next/link";
import { Sparkles } from "lucide-react";

/**
 * Agent truth slice (2026-07-16, Task 2) — replaces the "Custom Workflow —
 * COMING SOON" dead-end card on /automations. Max's live-run finding: "we
 * basically have two paths… right?" — the custom path already exists (Studio
 * describe-by-default + Record). The old card was navigation dishonesty (it
 * told operators a feature didn't exist yet when it did), not a real gap.
 *
 * Renders an ENABLED card (no "Coming soon" badge, no dashed border/opacity —
 * matches the archetype cards' full-strength chrome) with two real links:
 * "Describe it" → /studio/agents (the describe-by-default agent builder) and
 * "Record it" → /record (record-yourself-once). Both are real `<Link>`
 * elements always present in the markup (L-36 visibility invariant — never
 * conditionally hidden via CSS), so a screen reader / test can assert their
 * presence directly rather than a hidden-but-present decoy.
 */
export function TwoDoorsCard() {
  return (
    <div
      data-two-doors-card
      className="flex flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </span>
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Custom Agent
        </h3>
        <p className="line-clamp-3 text-xs text-muted-foreground">
          Build any workflow as an agent — describe it in Studio, or record
          yourself doing it once.
        </p>
      </div>
      <div className="mt-auto flex items-center gap-3 border-t border-border/60 pt-3 text-[11px] font-medium">
        <Link
          href="/studio/agents"
          data-two-doors-describe-link
          className="inline-flex items-center gap-1 text-foreground hover:underline"
        >
          Describe it &rarr;
        </Link>
        <Link
          href="/record"
          data-two-doors-record-link
          className="inline-flex items-center gap-1 text-foreground hover:underline"
        >
          Record it &rarr;
        </Link>
      </div>
    </div>
  );
}
