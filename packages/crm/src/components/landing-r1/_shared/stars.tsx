// landing/_shared/stars.tsx
//
// Rendered as a row of filled / unfilled stars. Pure CSS — no JS animation
// (counter animations live on the rating NUMBER, not the stars).

import { Star } from "lucide-react";

export function Stars({
  value,
  outOf = 5,
  size = 14,
  className,
}: {
  value: number;
  outOf?: number;
  size?: number;
  className?: string;
}) {
  const filled = Math.round(value);
  return (
    <span
      className={className}
      style={{ display: "inline-flex", gap: 2, color: "#fbbf24" }}
      aria-label={`${value} out of ${outOf} stars`}
    >
      {Array.from({ length: outOf }).map((_, i) => (
        <Star
          key={i}
          size={size}
          strokeWidth={0}
          fill={i < filled ? "currentColor" : "color-mix(in oklab, currentColor 22%, transparent)"}
          aria-hidden
        />
      ))}
    </span>
  );
}
