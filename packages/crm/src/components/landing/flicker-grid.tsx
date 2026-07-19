// packages/crm/src/components/landing/flicker-grid.tsx
//
// A flickering dot-grid backdrop, in the spirit of Magic UI's FlickeringGrid
// but implemented in pure CSS rather than canvas. The canvas version needs a
// hydrated client effect to size itself; a CSS grid renders from the SSR HTML
// with no JS at all, so it's robust regardless of hydration and needs no
// per-cell rAF loop.
//
// Three offset dot layers, each stepping its opacity on a different cadence,
// read as a grid whose cells twinkle. `color` is themed by the caller via a
// CSS var. Reduced-motion freezes all layers to a calm resting opacity.
//
// Decorative only (aria-hidden). Not load-bearing content.

import { cn } from "@/lib/utils";

export function FlickerGrid({
  color = "#1F2B24",
  className,
}: {
  /** Dot color (hex/rgb). */
  color?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("sf-fg", className)}
      style={{ ["--sf-fg-color" as string]: color }}
      aria-hidden
    >
      <span className="sf-fg-layer sf-fg-a" />
      <span className="sf-fg-layer sf-fg-b" />
      <span className="sf-fg-layer sf-fg-c" />
      <style>{`
        .sf-fg { position: absolute; inset: 0; overflow: hidden; }
        .sf-fg-layer {
          position: absolute; inset: -11px;
          background-image: radial-gradient(circle, var(--sf-fg-color) 1px, transparent 1.7px);
          background-size: 11px 11px;
          will-change: opacity;
        }
        .sf-fg-a { opacity: .14; animation: sf-fg-a 3.1s steps(1) infinite; }
        .sf-fg-b { background-position: 5px 6px; opacity: .10; animation: sf-fg-b 2.3s steps(1) infinite; }
        .sf-fg-c { background-position: 3px 8px; opacity: .07; animation: sf-fg-c 4.3s steps(1) infinite; }
        @keyframes sf-fg-a { 0%,100% { opacity: .15 } 25% { opacity: .06 } 50% { opacity: .18 } 75% { opacity: .09 } }
        @keyframes sf-fg-b { 0%,100% { opacity: .07 } 33% { opacity: .15 } 66% { opacity: .05 } }
        @keyframes sf-fg-c { 0%,100% { opacity: .05 } 40% { opacity: .12 } 80% { opacity: .04 } }
        @media (prefers-reduced-motion: reduce) {
          .sf-fg-a, .sf-fg-b, .sf-fg-c { animation: none; }
        }
      `}</style>
    </div>
  );
}
