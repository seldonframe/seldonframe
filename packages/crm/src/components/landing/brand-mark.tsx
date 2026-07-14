// packages/crm/src/components/landing/brand-mark.tsx
//
// THE canonical Seldon mark for the landing surface (spec §3.4).
// Uses the deep-forest tile mark (public/brand/seldon-mark.svg — a rounded
// #1F2B24 square with the frame in white; its white glyph reads on both
// parchment and warm-dark). Wordmark is token-colored text so it re-themes
// with the mode flip.

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
      <Image src="/brand/seldon-mark.svg" alt="" width={size} height={size} className="rounded-[7px]" priority />
      <span className="text-[15.5px] font-medium tracking-[-0.01em] text-[var(--lp-ink)]">
        SeldonFrame
      </span>
      {withPathChip ? (
        <span className="lp-record-only font-mono text-[13.5px] text-[var(--lp-muted)]">/record</span>
      ) : null}
    </span>
  );
}
