"use client";

// Vendored from Magic UI (https://magicui.design/docs/components/animated-shiny-text)
// per the repo's motion Adaptation Contract:
//  - The base + shine colors are CSS vars (--shiny-base / --shiny-shine) so
//    each caller themes it (cream shimmer on the forest CTA; an ink shimmer on
//    light-bg headings) instead of the upstream's hardcoded neutral/white.
//  - motion-reduce: the sweep is dropped and the text renders at --shiny-base
//    (a readable resting color), never mid-sweep.
//  - The `shiny-text` keyframe is registered in globals.css @theme (alongside
//    the marquee keyframes) — Tailwind v4 theme animation, no new dependency.
//
// text is transparent + bg-clip-text, so the gradient IS the text. The gradient
// tiles at 200% width and is --shiny-base across its whole span except a thin
// --shiny-shine band at its centre, so EVERY glyph is always at least the
// readable base colour (never an uncovered/transparent gap) while the band
// sweeps across. shimmerWidth is retained for API compat but the coverage is
// driven by the 200% tile, not the band width.

import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AnimatedShinyText({
  children,
  className,
  base = "rgba(34, 29, 23, 0.72)",
  shine = "rgba(34, 29, 23, 1)",
  shimmerWidth = 130,
}: {
  children: ReactNode;
  className?: string;
  /** Resting text color (also the reduced-motion color). */
  base?: string;
  /** The brighter band that sweeps across. */
  shine?: string;
  shimmerWidth?: number;
}) {
  return (
    <span
      style={
        {
          "--shiny-width": `${shimmerWidth}px`,
          "--shiny-base": base,
          "--shiny-shine": shine,
        } as CSSProperties
      }
      className={cn(
        "bg-clip-text text-transparent [background-repeat:repeat] [background-size:200%_100%]",
        "[background-image:linear-gradient(110deg,var(--shiny-base)_0%,var(--shiny-base)_43%,var(--shiny-shine)_50%,var(--shiny-base)_57%,var(--shiny-base)_100%)]",
        "motion-safe:animate-shiny-text",
        "motion-reduce:bg-none motion-reduce:text-[color:var(--shiny-base)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
