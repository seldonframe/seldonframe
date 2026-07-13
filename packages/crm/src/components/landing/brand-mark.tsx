// packages/crm/src/components/landing/brand-mark.tsx
//
// THE canonical SeldonFrame mark for the landing surface (spec §3.4).
// Uses the real brand asset (public/brand/seldonframe-icon.svg — its
// #1FAE85 green reads on both parchment and warm-dark), wordmark as
// token-colored text so it re-themes with the mode flip.

import Image from "next/image";

export function BrandMark({
  size = 26,
  withPathChip = false,
}: {
  size?: number;
  withPathChip?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5 leading-none">
      <Image src="/brand/seldonframe-icon.svg" alt="" width={size} height={size} priority />
      <span className="text-[15.5px] font-medium tracking-[-0.01em] text-[var(--lp-ink)]">
        SeldonFrame
      </span>
      {withPathChip ? (
        <span className="lp-record-only font-mono text-[13.5px] text-[var(--lp-muted)]">/record</span>
      ) : null}
    </span>
  );
}
