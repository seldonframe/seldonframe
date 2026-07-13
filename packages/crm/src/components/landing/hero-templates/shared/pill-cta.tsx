// v1.43.0 — Reusable pill CTAs in light and dark variants.
//
// Light templates (viktor-light, nexora-light, stellar-tabs-white) get the
// dark-on-light combination: dark pill button with white text, plus a
// secondary white-with-dark-border variant.
//
// Dark templates already use AppleButton from cinematic/ for primary CTAs.
// This module is the light-mode counterpart.

import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** Dark-on-light primary pill. White text, dark background, chevron. */
export function DarkPillCTA({
  href,
  label,
  className = "",
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={
        "group inline-flex items-center justify-center gap-2 rounded-[11px] " +
        "bg-[#0a0a0a] text-white font-medium text-sm px-6 py-3 " +
        "transition-all hover:bg-[#1a1a1a] active:scale-[0.98] " +
        className
      }
    >
      <span>{label}</span>
      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-[1px]" />
    </Link>
  );
}

/** White-on-light secondary pill. Soft shadow, dark text, no chevron. */
export function LightSecondaryCTA({
  href,
  label,
  className = "",
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center justify-center rounded-[11px] " +
        "bg-white text-[#0a0a0a] font-medium text-sm px-6 py-3 " +
        "shadow-[0_4px_30px_rgba(0,0,0,0.08)] transition-all " +
        "hover:shadow-[0_4px_30px_rgba(0,0,0,0.12)] hover:-translate-y-[1px] active:scale-[0.98] " +
        className
      }
    >
      {label}
    </Link>
  );
}

/** Outlined pill — used by templates that want a quieter secondary action. */
export function OutlinePillCTA({
  href,
  label,
  className = "",
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center justify-center rounded-[11px] " +
        "border border-[#0a0a0a]/15 text-[#0a0a0a] font-medium text-sm px-6 py-3 " +
        "transition-all hover:border-[#0a0a0a]/40 hover:bg-[#0a0a0a]/[0.02] active:scale-[0.98] " +
        className
      }
    >
      {label}
    </Link>
  );
}
