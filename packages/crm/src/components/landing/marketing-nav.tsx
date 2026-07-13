// packages/crm/src/components/landing/marketing-nav.tsx
//
// Redesign 2026-06-18 — warm light aesthetic matching seldonstudio.com.
// Paper/parchment surface (--lp-card, brightens on scroll), Hanken Grotesk
// sans, SeldonFrame green (--lp-accent) as accent (replaces teal #14b8a6).
//
// Token migration 2026-07-13 — all landing colors moved to `--lp-*` CSS
// vars (see landing-theme.css) so the nav is dark-capable for /record.
//
// Shopify-homepage redesign (2026-07-06) — single CTA, minimal nav. The
// center nav links, the "For agencies →" button, and the mobile drawer
// (now unnecessary with no nav links) are removed. Right cluster is just
// a subtle "Log in" link + one primary CTA ("Start for free" → /signup).

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BrandMark } from "./brand-mark";

/** The four money hubs — nav-level internal links so crawlers reach the SEO
 *  tree from every marketing page, not only via the footer. Rendered ALWAYS
 *  (CSS-hidden when closed) so the links exist in the SSR HTML — per the
 *  lessons.md rule: client-only conditional renders hide content from
 *  crawlers/LLMs. */
const RESOURCE_LINKS = [
  { href: "/alternatives", label: "Compare & pricing breakdowns" },
  { href: "/best", label: "Best-of guides" },
  { href: "/tools", label: "Free tools" },
  { href: "/ai-agents", label: "AI agent library" },
] as const;

export function MarketingNav() {
  const [solid, setSolid] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const resourcesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!resourcesOpen) return;
    const onDown = (e: MouseEvent) => {
      if (resourcesRef.current && !resourcesRef.current.contains(e.target as Node)) setResourcesOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setResourcesOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [resourcesOpen]);

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
          ? "border-[var(--lp-border-soft)] bg-[color-mix(in_oklab,var(--lp-card)_90%,transparent)] backdrop-blur-md backdrop-saturate-150 shadow-[0_1px_0_color-mix(in_oklab,var(--lp-ink)_6%,transparent)]"
          : "border-transparent bg-transparent"
      }`}
    >
      {/* Skip link for keyboard nav */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-full focus:bg-[var(--lp-accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--lp-card)]"
      >
        Skip to main content
      </a>

      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-6 px-6 py-4 md:px-8 lg:px-12 lg:py-[18px]">
        {/* Brand */}
        <Link href="/" aria-label="SeldonFrame — home">
          <BrandMark withPathChip />
        </Link>

        {/* Right cluster — Resources dropdown + subtle Log in + one primary CTA */}
        <div className="inline-flex items-center gap-2 md:gap-3">
          <div ref={resourcesRef} className="relative hidden md:block">
            <button
              type="button"
              aria-expanded={resourcesOpen}
              aria-haspopup="true"
              onClick={() => setResourcesOpen((v) => !v)}
              className="inline-flex h-[34px] items-center gap-1 whitespace-nowrap rounded-full px-3 text-[13.5px] font-medium text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-ink)]"
            >
              Resources
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className={`transition-transform ${resourcesOpen ? "rotate-180" : ""}`}>
                <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {/* Always rendered; CSS-hidden when closed so crawlers see the links. */}
            <div
              className={`absolute right-0 top-[calc(100%+8px)] w-60 rounded-2xl border border-[var(--lp-border-soft)] bg-[var(--lp-card)] p-2 shadow-[0_8px_30px_color-mix(in_oklab,var(--lp-ink)_12%,transparent)] transition-[opacity,transform] duration-150 ${
                resourcesOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0 pointer-events-none"
              }`}
            >
              {RESOURCE_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  tabIndex={resourcesOpen ? 0 : -1}
                  onClick={() => setResourcesOpen(false)}
                  className="block rounded-xl px-3 py-2 text-[13.5px] font-medium text-[var(--lp-ink)]/80 transition-colors hover:bg-[var(--lp-accent-soft)] hover:text-[var(--lp-ink)]"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
          <Link
            href="/login"
            className="hidden h-[34px] items-center whitespace-nowrap rounded-full border border-[var(--lp-border)] bg-transparent px-4 text-[13.5px] font-medium text-[var(--lp-muted)] transition-colors hover:border-[color-mix(in_oklab,var(--lp-ink)_28%,transparent)] hover:text-[var(--lp-ink)] sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[var(--lp-cta-bg)] px-4 text-[13.5px] font-semibold text-[var(--lp-cta-ink)] shadow-[0_1px_2px_color-mix(in_oklab,var(--lp-ink)_10%,transparent),0_6px_16px_color-mix(in_oklab,var(--lp-ink)_10%,transparent),0_18px_40px_color-mix(in_oklab,var(--lp-ink)_6%,transparent),inset_0_1.5px_0_rgba(255,255,255,.12)] transition-all hover:-translate-y-px hover:shadow-[0_2px_4px_color-mix(in_oklab,var(--lp-ink)_12%,transparent),0_12px_26px_color-mix(in_oklab,var(--lp-ink)_14%,transparent),inset_0_1.5px_0_rgba(255,255,255,.14)] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]"
          >
            <span className="size-1.5 rounded-full bg-[var(--lp-accent)]" aria-hidden />
            Start for free
          </Link>
        </div>
      </div>
    </header>
  );
}
