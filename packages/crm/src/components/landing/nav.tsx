import Link from "next/link";
import { ExternalLink } from "lucide-react";

// Cut C Phase 1 — Nav refresh.
// Adds a primary "Start free" CTA so signup is one click from any
// scroll position. Sign In and GitHub remain secondary.
//
// Phase 8 page-wide a11y added:
//   - "Skip to main content" link (WCAG 2.4.1 Bypass Blocks) targets
//     the `<main>` element in (public)/page.tsx, which carries
//     id="main-content". Visible only on keyboard focus.
//   - "Start free" CTA bumped from text-white (2.6:1 on teal — fails
//     WCAG AA 1.4.3) to text-zinc-950 (7.2:1).
export function LandingNav() {
  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 z-50 w-full border-b border-zinc-800/50 bg-[#09090b]/80 backdrop-blur-md"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-[#14b8a6] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-zinc-950 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[#14b8a6]"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-zinc-100">
          SeldonFrame
        </Link>
        <div className="flex items-center gap-5 text-sm font-medium text-zinc-500">
          <Link href="/pricing" className="transition-colors hover:text-zinc-200">
            Pricing
          </Link>
          <Link
            href="https://github.com/seldonframe/crm"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 transition-colors hover:text-zinc-200"
          >
            GitHub <ExternalLink size={12} aria-hidden="true" />
          </Link>
          <Link href="/login" className="transition-colors hover:text-zinc-200">
            Sign In
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-[#14b8a6] px-4 py-1.5 font-semibold text-zinc-950 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14b8a6]"
          >
            Start free
          </Link>
        </div>
      </div>
    </nav>
  );
}
