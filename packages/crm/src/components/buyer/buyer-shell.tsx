// Marketplace buyer surface — the focused shell (server component).
//
// The chrome the buyer sees after they purchase an agent: the REAL SeldonFrame
// brand mark + wordmark, a cream-paper background, the teal accent published as
// CSS custom properties, and NOTHING from the agency app (no sidebar, no client
// list, no agency nav). It frames both the setup wizard and the "My Agent" home.
//
// Ports the header of the Claude Design onboarding export — but swaps that
// export's placeholder 2×2 dot logo for the real `SeldonFrameMark`, and its
// violet `--accent` for the brand teal `#00897B` (via `buyerCssVars`). Loads
// `MarketplaceStyles` so the marketplace fonts (incl. DM Mono for the numbers the
// design sets in mono) and the `.sf-*` animation helpers are available, keeping
// the buyer surface visually continuous with the storefront they came from.
//
// Mobile-first: the wordmark's second word collapses on narrow screens, the body
// is a single centered column, and all sizing uses clamp()/responsive padding.

import type { ReactNode } from "react";
import Link from "next/link";

import { SeldonFrameMark } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { BUYER, buyerCssVars } from "@/components/buyer/theme";

export type BuyerShellProps = {
  children: ReactNode;
  /** When set, a quiet top-right "Finish later" link to this href (the wizard's
   *  resumable exit). Absent on the home (nothing to finish). */
  finishLaterHref?: string;
  /** The muted second word after the wordmark ("Setup" in the wizard, none on the
   *  home). Hidden on mobile to keep the header tight. */
  wordmarkSuffix?: string;
};

/**
 * The buyer surface chrome. Publishes the teal accent + paper palette as CSS
 * vars on its root so every descendant (the ported step screens) themes off
 * `var(--accent)` / `var(--paper)` exactly like the Claude Design did, then
 * renders a slim brand header + the page body.
 */
export function BuyerShell({
  children,
  finishLaterHref,
  wordmarkSuffix,
}: BuyerShellProps) {
  return (
    <div
      style={{
        ...(buyerCssVars() as React.CSSProperties),
        minHeight: "100vh",
        background: BUYER.paper,
        color: BUYER.ink,
        fontFamily: BUYER.fontSans,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* DM Mono + Hanken + the .sf-* animation classes (continuity with the
          marketplace storefront the buyer just purchased from). */}
      <MarketplaceStyles />

      {/* Brand header — the REAL mark + "SeldonFrame" wordmark. Links home so a
          confused buyer is never trapped. */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          maxWidth: 620,
          margin: "0 auto",
          padding: "18px 20px 0",
        }}
      >
        <Link
          href="/"
          aria-label="SeldonFrame — home"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
            textDecoration: "none",
            color: BUYER.ink,
          }}
        >
          <SeldonFrameMark size={23} />
          <span style={{ fontWeight: 600, fontSize: 15.5, letterSpacing: "-0.01em" }}>
            SeldonFrame
          </span>
          {wordmarkSuffix ? (
            <span
              className="sf-mkt-navword"
              style={{
                fontWeight: 500,
                fontSize: 15.5,
                letterSpacing: "-0.01em",
                color: BUYER.ink3,
              }}
            >
              {wordmarkSuffix}
            </span>
          ) : null}
        </Link>

        {finishLaterHref ? (
          <Link
            href={finishLaterHref}
            style={{
              fontFamily: BUYER.fontSans,
              fontSize: 14,
              fontWeight: 500,
              color: BUYER.ink3,
              textDecoration: "none",
            }}
          >
            Finish later
          </Link>
        ) : null}
      </header>

      <main>{children}</main>
    </div>
  );
}
