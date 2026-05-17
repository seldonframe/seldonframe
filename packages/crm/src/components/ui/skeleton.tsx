// 2026-05-17 — Shared Skeleton primitive.
//
// One place for loading placeholders so every dashboard surface
// shimmers the same way. Pairs with the .crm-skeleton utility class
// in globals.css (which handles the gradient + animation + the
// prefers-reduced-motion fallback).
//
// Usage:
//   <Skeleton className="h-4 w-32" />            — single row
//   <SkeletonLines lines={3} className="w-64" /> — multiple lines
//   <SkeletonCard />                              — card placeholder
//
// Keep this dumb. If a surface needs a custom shape, compose with
// className — don't add props.

import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {}

/** Shimmering placeholder block. Sized via className. */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  function Skeleton({ className = "", ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={`crm-skeleton ${className}`.trim()}
        aria-hidden
        {...rest}
      />
    );
  },
);

/** Stack of skeleton lines with progressively narrower widths so the
 *  result reads as "paragraph loading" instead of "perfect bars". */
export function SkeletonLines({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`.trim()} aria-busy>
      {Array.from({ length: lines }).map((_, idx) => (
        <Skeleton
          key={idx}
          className="h-3"
          style={{
            width:
              idx === lines - 1 ? "60%" : idx === 0 ? "92%" : `${80 + ((idx * 7) % 12)}%`,
          }}
        />
      ))}
    </div>
  );
}

/** Card-shaped placeholder for grid layouts (dashboard widgets, list
 *  pages). Matches the standard .crm-card metrics — same border
 *  radius and padding so swapping skeleton → content doesn't
 *  reflow. */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-border/80 bg-card/60 p-5 ${className}`.trim()}
      aria-busy
    >
      <Skeleton className="h-4 w-1/3" />
      <SkeletonLines lines={3} className="mt-4" />
    </div>
  );
}
