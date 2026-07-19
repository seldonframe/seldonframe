// v1.41.0 — White pill primary CTA for the cinematic-aura hero.
//
// Modeled on the Aura reference's <AppleButton>: white background, black
// text, rounded-full, ChevronRight that slides 1px right on group hover.
// Renders as a Next.js <Link> so the route is intercepted client-side.

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function AppleButton({
  href,
  label,
  full = false,
}: {
  href: string;
  label: string;
  /** If true, fills its container's width. Default: hugs content. */
  full?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "group inline-flex items-center justify-center gap-2 rounded-[11px] " +
        "bg-white text-black font-medium text-sm px-5 py-3 " +
        "transition-all hover:bg-white/90 active:scale-[0.98] " +
        (full ? "w-full " : "")
      }
    >
      <span>{label}</span>
      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-[1px]" />
    </Link>
  );
}
