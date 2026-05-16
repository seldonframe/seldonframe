import Link from "next/link";
import { ExternalLink } from "lucide-react";

// Cut C Phase 1 — Nav refresh.
// Adds a primary "Start free" CTA so signup is one click from any
// scroll position. Sign In and GitHub remain secondary.
export function LandingNav() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-zinc-800/50 bg-[#09090b]/80 backdrop-blur-md">
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
            GitHub <ExternalLink size={12} />
          </Link>
          <Link href="/login" className="transition-colors hover:text-zinc-200">
            Sign In
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-[#14b8a6] px-4 py-1.5 font-semibold text-white transition-opacity hover:opacity-90"
          >
            Start free
          </Link>
        </div>
      </div>
    </nav>
  );
}
