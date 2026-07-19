// packages/crm/src/components/landing/nav.tsx
//
// 2026-05-17 — Mobile hamburger. Was: 4 horizontal links + logo all
// rendered at every breakpoint, which on narrow phones (<375px) ran
// the links into the logo and dropped the "Start free" CTA off screen.
// Now: desktop keeps the same flat layout; mobile collapses everything
// behind a hamburger button that opens a full-width drop panel below
// the nav, with the same links + the primary CTA at the bottom.
//
// Marked "use client" because the mobile drawer needs useState. The
// nav itself stays sticky + accessible; the drawer collapses
// automatically when any link inside it is clicked so the user lands
// on the destination without an extra "close" gesture.
//
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

"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Menu, X } from "lucide-react";

type NavLink = { href: string; label: string; external?: boolean };

const NAV_LINKS: NavLink[] = [
  { href: "/pricing", label: "Pricing" },
  { href: "https://github.com/seldonframe/crm", label: "GitHub", external: true },
  { href: "/login", label: "Sign In" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 z-50 w-full border-b border-zinc-800/50 bg-[#09090b]/80 backdrop-blur-md"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-[#1F2B24] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-zinc-950 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[#1F2B24]"
      >
        Skip to main content
      </a>

      {/* Top row — logo + (desktop) link cluster + (mobile) hamburger. */}
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-zinc-100"
          onClick={() => setOpen(false)}
        >
          SeldonFrame
        </Link>

        {/* Desktop: all links visible inline. Hidden under md. */}
        <div className="hidden items-center gap-5 text-sm font-medium text-zinc-500 md:flex">
          {NAV_LINKS.map((link) =>
            link.external ? (
              <Link
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 transition-colors hover:text-zinc-200"
              >
                {link.label} <ExternalLink size={12} aria-hidden="true" />
              </Link>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-zinc-200"
              >
                {link.label}
              </Link>
            ),
          )}
          <Link
            href="/signup"
            className="rounded-lg bg-[#1F2B24] px-4 py-1.5 font-semibold text-zinc-950 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F2B24]"
          >
            Start free
          </Link>
        </div>

        {/* Mobile: hamburger that toggles the drawer below. Only one
            mobile-only "Start free" remains visible inline at all
            widths so the conversion path never costs an extra tap. */}
        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/signup"
            className="rounded-lg bg-[#1F2B24] px-3 py-1.5 text-sm font-semibold text-zinc-950 transition-opacity hover:opacity-90"
            onClick={() => setOpen(false)}
          >
            Start free
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="landing-nav-mobile-drawer"
            onClick={() => setOpen((prev) => !prev)}
            className="flex size-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer — full-width panel that drops below the nav row.
          Hidden on desktop (md:hidden). Animates via max-height to
          avoid layout shift in the surrounding sections. */}
      <div
        id="landing-nav-mobile-drawer"
        className={`md:hidden overflow-hidden border-t border-zinc-800/50 bg-[#09090b]/95 backdrop-blur-md transition-[max-height] duration-200 ease-out ${
          open ? "max-h-80" : "max-h-0"
        }`}
      >
        <ul className="flex flex-col gap-1 px-4 py-3 text-sm font-medium text-zinc-300">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              {link.external ? (
                <Link
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                  onClick={() => setOpen(false)}
                >
                  <span>{link.label}</span>
                  <ExternalLink size={14} aria-hidden="true" className="text-zinc-500" />
                </Link>
              ) : (
                <Link
                  href={link.href}
                  className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
