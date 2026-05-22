// packages/crm/src/components/landing/marketing-nav.tsx
//
// 2026-05-22 — Port of the Claude Design HTML mockup nav (handoff
// `seldonframe-home.html` §Nav). Replaces the older
// `LandingNav` on the marketing surface. Sticky top bar with a
// transparent-to-solid transition on scrollY > 80. Logo links to
// "#top", center links anchor to in-page sections, right side has
// Log in (outline) and Get started (teal CTA).
//
// The HTML mock included a hard-coded "1.4k" GitHub stars chip — per
// the handoff README and task #82's truth-pass principle (no fake
// numbers ship), the chip is REMOVED here entirely. A real
// `GitHubStarsBadge` component exists at
// `components/landing/github-stars-badge.tsx` if we ever want to
// wire a real GitHub-API-fetched count, but it doesn't ship in the
// nav today.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

type NavLink = { href: string; label: string };

const NAV_LINKS: readonly NavLink[] = [
  { href: "#build", label: "Build" },
  { href: "#pricing", label: "Pricing" },
  { href: "#modules", label: "Modules" },
  { href: "#faq", label: "FAQ" },
];

export function MarketingNav() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      aria-label="Primary"
      data-solid={solid ? "yes" : "no"}
      className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-200 ease-out ${
        solid
          ? "border-zinc-800 bg-[#09090b]/80 backdrop-blur-md backdrop-saturate-150"
          : "border-transparent bg-transparent"
      }`}
    >
      {/* Skip link for keyboard nav */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-[#14b8a6] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#08332f]"
      >
        Skip to main content
      </a>

      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-6 px-5 py-3.5 md:px-8 md:py-4 lg:px-12 lg:py-[18px]">
        <Link
          href="/"
          aria-label="SeldonFrame — home"
          className="inline-flex items-center gap-2.5 text-base font-semibold leading-none tracking-tight text-zinc-100"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="#14b8a6" strokeWidth="1.6" />
            <path d="M8 12L11 15L16 9" stroke="#14b8a6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            Seldon<span className="font-medium text-zinc-500">Frame</span>
          </span>
        </Link>

        {/* Desktop center nav */}
        <nav aria-label="Sections" className="hidden items-center gap-6 min-[900px]:inline-flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right cluster */}
        <div className="inline-flex items-center gap-2.5 md:gap-3">
          <Link
            href="/login"
            className="hidden h-[34px] items-center rounded-lg border border-zinc-800 bg-transparent px-3 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100 sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#14b8a6] px-3.5 text-sm font-semibold text-[#08332f] shadow-[0_6px_24px_rgba(20,184,166,0.22)] transition-all hover:bg-[#2dd4bf] hover:shadow-[0_10px_28px_rgba(20,184,166,0.32)] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14b8a6]"
          >
            Get started
          </Link>

          {/* Mobile menu toggle */}
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="marketing-nav-drawer"
            onClick={() => setOpen((p) => !p)}
            className="flex size-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 min-[900px]:hidden"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        id="marketing-nav-drawer"
        className={`overflow-hidden border-t border-zinc-800/50 bg-[#09090b]/95 backdrop-blur-md transition-[max-height] duration-200 ease-out min-[900px]:hidden ${
          open ? "max-h-80" : "max-h-0"
        }`}
      >
        <ul className="flex flex-col gap-1 px-4 py-3 text-sm font-medium text-zinc-300">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-zinc-900 hover:text-zinc-100 sm:hidden"
            >
              Log in
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
