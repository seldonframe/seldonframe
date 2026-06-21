// landing/chrome/sticky-mobile-bar.tsx
//
// Always-on conversion surface on mobile. Three primary CTAs in a row:
// Call · Text · Book. Each is its own button with a ≥ 48px tap target.
// Slides up on first scroll (>40px). Never dismissable — these surfaces are
// always-on per the R.2 brief.
//
// Visibility rules:
//   • Hidden at viewports ≥ 768px (`display: none` via CSS).
//   • Hidden for archetypes whose voice excludes phone-first conversion:
//     cinematic-aspirational (luxury), technical-restrained (B2B).
//   • If `smsHref` is missing, the Text button hides. Same for `bookHref` / Book.
//     Pass only `phone` and you get a single full-width "Call" button.

"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ARCHETYPES, type AestheticArchetypeId } from "../archetypes";
import { telHref } from "../_shared/phone";

const ARCHETYPES_WITHOUT_STICKY: AestheticArchetypeId[] = [
  "cinematic-aspirational",
  "technical-restrained",
];

export type StickyMobileBarProps = {
  archetype: AestheticArchetypeId;
  /** Verbatim phone string — required. The tel: href is derived. */
  phone: string;
  /** When absent, hide the Text button. When present, used as the sms: href. */
  smsHref?: string;
  /** When absent, hide the Book button. */
  bookHref?: string;
};

export function StickyMobileBar({
  archetype,
  phone,
  smsHref,
  bookHref,
}: StickyMobileBarProps) {
  const arch = ARCHETYPES[archetype];
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(false);
  // Track whether we've ever scrolled past the threshold; once we have, the
  // bar stays up (it's always-on per the brief).
  const everShown = useRef(false);

  useEffect(() => {
    if (reduce) {
      setVisible(true);
      return;
    }
    if (everShown.current) return;
    const onScroll = () => {
      if (everShown.current) return;
      if (window.scrollY > 40) {
        everShown.current = true;
        setVisible(true);
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Edge case: page already scrolled (back-nav, hash anchor, etc.)
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [reduce]);

  if (ARCHETYPES_WITHOUT_STICKY.includes(archetype)) return null;

  // Text button is shown ONLY when a non-empty sms: href is supplied.
  // No phone-derived fallback: an empty/absent smsHref means "no Text button"
  // (the Speed-to-Lead contract — the demo backfill sets it to the 839 line).
  const showText = typeof smsHref === "string" && smsHref.length > 0;
  const showBook = !!bookHref;
  // Total columns visible — drives the grid template.
  const cols = 1 + (showText ? 1 : 0) + (showBook ? 1 : 0);

  return (
    <nav
      data-archetype={arch.id}
      data-visible={visible ? "yes" : "no"}
      style={{ ["--sf-sticky-cols" as never]: String(cols) }}
      className="sf-sticky-mobile-bar"
      aria-label="Quick actions"
    >
      <a className="sf-sticky-btn sf-sticky-call" href={telHref(phone)} aria-label="Call now">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
        <span>Call</span>
      </a>

      {showText && (
        <a className="sf-sticky-btn sf-sticky-text" href={smsHref} aria-label="Text us">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Text</span>
        </a>
      )}

      {showBook && (
        <a className="sf-sticky-btn sf-sticky-book" href={bookHref} aria-label="Book online">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>Book</span>
        </a>
      )}

      {/* Global styled-jsx — class names are sf-sticky-* prefixed to avoid
          collisions. Scoped jsx breaks with reactCompiler:true (see navbar.tsx
          comment for the full explanation). Global mode matches the pattern
          used by all section components. */}
      <style jsx global>{`
        .sf-sticky-mobile-bar {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 40;
          padding: max(8px, env(safe-area-inset-bottom, 0px)) 8px 8px;
          background: color-mix(in oklab, var(--secondary) 92%, transparent);
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          border-top: 1px solid color-mix(in oklab, var(--secondary) 80%, #fff);
          display: grid;
          grid-template-columns: repeat(var(--sf-sticky-cols, 3), 1fr);
          gap: 6px;
          box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.18);
          font-family: var(--font-body);

          /* Slide-up motion */
          transform: translateY(100%);
          transition: transform 360ms cubic-bezier(0.16, 1, 0.3, 1);
          will-change: transform;
        }
        .sf-sticky-mobile-bar[data-visible="yes"] {
          transform: translateY(0);
        }

        @media (min-width: 768px) {
          .sf-sticky-mobile-bar { display: none; }
        }

        .sf-sticky-btn {
          min-height: 48px;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          padding: 8px 4px;
          border-radius: var(--radius-sm, 6px);
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: 0.01em;
          text-decoration: none;
          color: #fff;
          background: color-mix(in oklab, #fff 6%, transparent);
          border: 1px solid color-mix(in oklab, #fff 12%, transparent);
          transition: background 160ms ease, border-color 160ms ease;
        }
        .sf-sticky-btn:active { transform: translateY(1px); }
        .sf-sticky-btn span { line-height: 1; }
        .sf-sticky-btn svg { flex-shrink: 0; }

        .sf-sticky-call {
          background: var(--primary);
          color: var(--primary-ink, #fff);
          border-color: var(--primary);
        }
        .sf-sticky-call:hover { background: color-mix(in oklab, var(--primary) 88%, #000); }

        /* Text: solid secondary so it reads as a live, tappable action. */
        .sf-sticky-text {
          background: color-mix(in oklab, var(--secondary, #6b7280) 60%, transparent);
          border-color: color-mix(in oklab, var(--secondary, #6b7280) 80%, transparent);
          color: #fff;
        }
        .sf-sticky-text:hover {
          background: color-mix(in oklab, var(--secondary, #6b7280) 75%, transparent);
        }
        /* Book: accent-tinted so it reads as secondary CTA. */
        .sf-sticky-book {
          background: color-mix(in oklab, var(--positive, #34d399) 28%, transparent);
          border-color: color-mix(in oklab, var(--positive, #34d399) 50%, transparent);
          color: #fff;
        }
        .sf-sticky-book:hover {
          background: color-mix(in oklab, var(--positive, #34d399) 38%, transparent);
        }

        @media (prefers-reduced-motion: reduce) {
          .sf-sticky-mobile-bar {
            transition: none;
            transform: translateY(0);
          }
        }
      `}</style>
    </nav>
  );
}
