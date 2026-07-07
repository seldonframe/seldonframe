// packages/crm/src/components/landing/marketing-nav.tsx
//
// Redesign 2026-06-18 — warm light aesthetic matching seldonstudio.com.
// Paper/parchment surface (#F6F2EA → #FFFDFA on scroll), Hanken Grotesk
// sans, SeldonFrame green (#00897B) as accent (replaces teal #14b8a6).
//
// Shopify-homepage redesign (2026-07-06) — single CTA, minimal nav. The
// center nav links, the "For agencies →" button, and the mobile drawer
// (now unnecessary with no nav links) are removed. Right cluster is just
// a subtle "Log in" link + one primary CTA ("Start for free" → /signup).

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function MarketingNav() {
  const [solid, setSolid] = useState(false);

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
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none" aria-hidden>
            <line x1="22" y1="22" x2="58" y2="22" stroke="#00897B" strokeWidth="6" strokeLinecap="round" />
            <line x1="78" y1="42" x2="78" y2="78" stroke="#00897B" strokeWidth="6" strokeLinecap="round" />
            <line x1="78" y1="78" x2="22" y2="78" stroke="#00897B" strokeWidth="6" strokeLinecap="round" />
            <line x1="22" y1="78" x2="22" y2="22" stroke="#00897B" strokeWidth="6" strokeLinecap="round" />
            <circle cx="22" cy="22" r="7" fill="#00897B" />
            <circle cx="78" cy="22" r="7" fill="none" stroke="#00897B" strokeWidth="6" />
            <circle cx="78" cy="78" r="7" fill="#00897B" />
            <circle cx="22" cy="78" r="7" fill="#00897B" />
          </svg>
          <span>SeldonFrame</span>
        </Link>

        {/* Right cluster — subtle Log in + one primary CTA */}
        <div className="inline-flex items-center gap-2 md:gap-3">
          <Link
            href="/login"
            className="hidden h-[34px] items-center whitespace-nowrap rounded-full border border-[rgba(34,29,23,.18)] bg-transparent px-4 text-[13.5px] font-medium text-[#6E665A] transition-colors hover:border-[rgba(34,29,23,.28)] hover:text-[#221D17] sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#1F2B24] px-4 text-[13.5px] font-semibold text-[#F6F2EA] shadow-[0_1px_2px_rgba(34,29,23,.10),0_6px_16px_rgba(34,29,23,.10),0_18px_40px_rgba(34,29,23,.06),inset_0_1.5px_0_rgba(255,255,255,.12)] transition-all hover:-translate-y-px hover:shadow-[0_2px_4px_rgba(34,29,23,.12),0_12px_26px_rgba(34,29,23,.14),inset_0_1.5px_0_rgba(255,255,255,.14)] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00897B]"
          >
            <span className="size-1.5 rounded-full bg-[#00897B]" aria-hidden />
            Start for free
          </Link>
        </div>
      </div>
    </header>
  );
}
