// landing/_shared/trust-badge.tsx
//
// Text-only trust pill with optional logoSvg slot.
// Per the brief: real BBB / Google / Yelp logos have trademark + per-state
// display rules; Phase R.1 ships text-only badges. The `logoSvg` slot is
// reserved for Phase R.2 (or operator manual override).

"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type TrustBadgeProps = {
  /** Display text — e.g. "Licensed C-20 #897432", "BBB A+". */
  label: string;
  /**
   * Optional logo slot. Accepts any ReactNode — inline <svg>, <Image> from
   * next/image, a Lucide icon component, or null. When omitted the default
   * check icon renders. Same pattern as shadcn icon props elsewhere.
   */
  logoSvg?: ReactNode;
  /** "rating" variant uses the inverted (dark) chip used for the review summary. */
  variant?: "default" | "rating" | "subtle";
  /** Extra className for layout overrides. */
  className?: string;
  children?: ReactNode;
};

export function TrustBadge({
  label,
  logoSvg,
  variant = "default",
  className,
  children,
}: TrustBadgeProps) {
  const icon = logoSvg !== undefined
    ? <span className="badge-logo" aria-hidden>{logoSvg}</span>
    : <Check className="badge-check" size={14} aria-hidden strokeWidth={2.4} />;

  return (
    <span
      className={cn(
        "trust-badge",
        variant === "rating" && "trust-badge--rating",
        variant === "subtle" && "trust-badge--subtle",
        className,
      )}
    >
      {variant === "rating" ? null : icon}
      {children ?? <span>{label}</span>}

      <style jsx>{`
        .trust-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 6px 11px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 999px;
          font-size: 12.5px;
          font-weight: 500;
          color: color-mix(in oklab, var(--text) 75%, transparent);
          font-family: var(--font-body);
        }
        .trust-badge :global(.badge-check),
        .trust-badge :global(.badge-logo svg) {
          color: var(--primary);
          flex-shrink: 0;
        }
        .trust-badge--rating {
          background: var(--secondary);
          color: #fff;
          border-color: var(--secondary);
          padding: 6px 13px 6px 11px;
        }
        .trust-badge--subtle {
          background: var(--surface);
          border-color: var(--border);
          color: color-mix(in oklab, var(--text) 65%, transparent);
        }
      `}</style>
    </span>
  );
}
