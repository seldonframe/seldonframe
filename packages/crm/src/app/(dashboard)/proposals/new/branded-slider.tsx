"use client";
// packages/crm/src/app/(dashboard)/proposals/new/branded-slider.tsx

import { useId, useState } from "react";

export function BrandedSlider({
  value,
  onChange,
  min,
  max,
  step,
  brandColor,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  brandColor: string;
  ariaLabel: string;
}) {
  const id = useId();
  const [isDragging, setIsDragging] = useState(false);
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div className="relative w-full h-8 flex items-center">
      {/* Background track */}
      <div className="absolute inset-x-0 h-1.5 rounded-full bg-muted" style={{ zIndex: 0 }} />
      {/* Filled track over background */}
      <div
        className="absolute h-1.5 left-0 rounded-full"
        style={{
          width: `${pct}%`,
          backgroundColor: brandColor,
          zIndex: 1,
        }}
      />
      {/* Native range input — invisible but functional, sits on top */}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseDown={() => setIsDragging(true)}
        onMouseUp={() => setIsDragging(false)}
        onTouchStart={() => setIsDragging(true)}
        onTouchEnd={() => setIsDragging(false)}
        aria-label={ariaLabel}
        className="branded-slider-input absolute inset-0 w-full opacity-0 cursor-pointer z-20"
        style={{ "--brand-color": brandColor } as React.CSSProperties}
      />
      {/* Visible thumb (positioned at value%) */}
      <div
        className="absolute h-4 w-4 rounded-full bg-white border-2 shadow-md transition-transform z-10"
        style={{
          left: `calc(${pct}% - 8px)`,
          borderColor: brandColor,
          transform: isDragging ? "scale(1.2)" : "scale(1)",
        }}
      />
    </div>
  );
}
