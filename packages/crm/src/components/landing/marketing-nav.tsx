// packages/crm/src/components/landing/marketing-nav.tsx
//
// Redesign 2026-06-18 — warm light aesthetic matching seldonstudio.com.
// Paper/parchment surface (#F6F2EA → #FFFDFA on scroll), Hanken Grotesk
// sans, SeldonFrame green (#00897B) as accent (replaces teal #14b8a6).
// Dual CTAs: "Start building" (SMB self-serve) + "For agencies →"
// (white-label reseller path).

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

type NavLink = { href: string; label: string };

const NAV_LINKS: readonly NavLink[] = [
  { href: "#build", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#modules", label: "Features" },
  { href: "#agencies", label: "Agencies" },
  { href: "#faq", label: "FAQ" },
];

export function MarketingNav() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      aria-label="Primary navigation"
      data-solid={solid ? "yes" : "no"}
      className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-200 ease-out ${
        solid
          ? "border-[rgba(34,29,23,.10)] bg-[#FFFDFA]/90 backdrop-blur-md backdrop-saturate-150 shadow-[0_1px_0_rgba(34,29,23,.06)]"
          : "border-transparent bg-transparent"
      }`}
    >
      {/* Skip link for keyboard nav */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-full focus:bg-[#00897B] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#FFFDFA]"
      >
        Skip to main content
      </a>

      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-6 px-6 py-4 md:px-8 lg:px-12 lg:py-[18px]">
        {/* Brand */}
        <Link
          href="/"
          aria-label="SeldonFrame — home"
          className="inline-flex items-center gap-2.5 text-[15.5px] font-medium leading-none tracking-[-0.01em] text-[#221D17]"
        >
          <svg width="24" height="30" viewBox="0 0 70 88" fill="none" aria-hidden>
            <rect x="0" y="0" width="34" height="16" rx="3" fill="#4DB6AC" />
            <rect x="36" y="0" width="34" height="16" rx="3" fill="#00897B" />
            <rect x="0" y="18" width="34" height="16" rx="3" fill="#00796B" />
            <rect x="0" y="36" width="34" height="16" rx="3" fill="#00897B" />
            <rect x="36" y="36" width="34" height="16" rx="3" fill="#00796B" />
            <rect x="36" y="54" width="34" height="16" rx="3" fill="#00695C" />
            <rect x="0" y="72" width="34" height="16" rx="3" fill="#00796B" />
            <rect x="36" y="72" width="34" height="16" rx="3" fill="#004D40" />
          </svg>
          <span>SeldonFrame</span>
        </Link>

        {/* Desktop center nav */}
        <nav aria-label="Sections" className="hidden items-center gap-6 min-[900px]:inline-flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[14px] font-medium text-[#6E665A] transition-colors hover:text-[#221D17]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right cluster */}
        <div className="inline-flex items-center gap-2 md:gap-3">
          <Link
            href="/login"
            className="hidden h-[34px] items-center rounded-full border border-[rgba(34,29,23,.18)] bg-transparent px-4 text-[13.5px] font-medium text-[#6E665A] transition-colors hover:border-[rgba(34,29,23,.28)] hover:text-[#221D17] sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="#agencies"
            className="hidden h-[34px] items-center rounded-full border border-[rgba(34,29,23,.18)] bg-transparent px-4 text-[13.5px] font-medium text-[#00897B] transition-colors hover:border-[#00897B]/40 hover:text-[#00695C] md:inline-flex"
          >
            For agencies →
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[#1F2B24] px-4 text-[13.5px] font-semibold text-[#F6F2EA] shadow-[0_1px_2px_rgba(34,29,23,.10),0_6px_16px_rgba(34,29,23,.10),0_18px_40px_rgba(34,29,23,.06),inset_0_1.5px_0_rgba(255,255,255,.12)] transition-all hover:-translate-y-px hover:shadow-[0_2px_4px_rgba(34,29,23,.12),0_12px_26px_rgba(34,29,23,.14),inset_0_1.5px_0_rgba(255,255,255,.14)] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00897B]"
          >
            <span className="size-1.5 rounded-full bg-[#00897B]" aria-hidden />
            Start building
          </Link>

          {/* Mobile menu toggle */}
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="marketing-nav-drawer"
            onClick={() => setOpen((p) => !p)}
            className="flex size-9 items-center justify-center rounded-full border border-[rgba(34,29,23,.14)] bg-[#FFFDFA] text-[#6E665A] transition-colors hover:text-[#221D17] min-[900px]:hidden"
          >
            {open ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        id="marketing-nav-drawer"
        className={`overflow-hidden border-t border-[rgba(34,29,23,.08)] bg-[#FFFDFA]/97 backdrop-blur-md transition-[max-height] duration-200 ease-out min-[900px]:hidden ${
          open ? "max-h-80" : "max-h-0"
        }`}
      >
        <ul className="flex flex-col gap-1 px-4 py-3 text-[14px] font-medium text-[#6E665A]">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-[#EFE9DD] hover:text-[#221D17]"
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-[#EFE9DD] hover:text-[#221D17] sm:hidden"
            >
              Log in
            </Link>
          </li>
          <li className="mt-2 border-t border-[rgba(34,29,23,.08)] pt-2">
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="block rounded-full bg-[#1F2B24] px-4 py-2.5 text-center text-[#F6F2EA]"
            >
              Start building
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
