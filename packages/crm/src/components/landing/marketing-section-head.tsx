// packages/crm/src/components/landing/marketing-section-head.tsx
//
// 2026-05-22 — Shared section header used by every marketing-* section
// ported from the Claude Design HTML mockup. Renders the eyebrow / H2 /
// subhead block in the same 1.4-to-1 grid (eyebrow+headline LEFT, sub
// RIGHT on lg+; stacked on mobile) the HTML uses for §3, §3B, §4, §5,
// §6, §7, §8, §10.
//
// The before:bg-current line is the underscore-style rule before the
// eyebrow text in the HTML mock.

import type { ReactNode } from "react";

export function MarketingSectionHead({
  eyebrow,
  headline,
  sub,
}: {
  eyebrow: string;
  headline: ReactNode;
  sub?: string;
}) {
  return (
    <div
      className={`mb-14 grid grid-cols-1 items-end gap-6 ${
        sub ? "min-[900px]:grid-cols-[1.4fr_1fr] min-[900px]:gap-14" : ""
      }`}
    >
      <div>
        <p className="m-0 mb-5 inline-flex items-center gap-2.5 font-mono text-[11.5px] font-medium uppercase tracking-[0.16em] text-[#2dd4bf] before:block before:h-px before:w-4 before:bg-current before:opacity-55">
          {eyebrow}
        </p>
        <h2 className="m-0 max-w-[900px] text-balance font-display text-[clamp(32px,4.4vw,52px)] font-semibold leading-[1.04] tracking-[-0.030em] text-zinc-50">
          {headline}
        </h2>
      </div>
      {sub ? (
        <p className="m-0 max-w-[640px] text-pretty text-[clamp(15px,1.4vw,17px)] leading-[1.6] text-zinc-400">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/** Inline accent helper — used inside the H2 to render the "muted"
 *  tail (the secondary clause in zinc-500 weight-500 from the HTML). */
export function MarketingHeadlineMuted({ children }: { children: ReactNode }) {
  return <span className="font-medium text-zinc-500">{children}</span>;
}
