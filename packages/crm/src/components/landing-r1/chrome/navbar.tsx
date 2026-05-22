// landing/chrome/navbar.tsx
//
// Sticky top navigation bar for R-framework landing pages.
//
// Renders ABOVE the EmergencyStrip (when present) — both are sticky so
// they stack naturally (emergency on top at z-index:60, navbar below at
// z-index:50).
//
// Visibility rules — hidden for archetypes whose voice doesn't fit a
// phone-first sticky nav. Matches the StickyMobileBar exclusion list:
//   • cinematic-aspirational — luxury voice; phone-first nav breaks tone
//   • technical-restrained   — B2B voice; anchor nav is noise
//
// Mobile (<768px): wordmark only on left, phone CTA on right.
//   The StickyMobileBar handles bottom-of-screen anchor nav for mobile.
// Desktop: wordmark + city tagline left, section anchors center, phone CTA right.

"use client";

import { ARCHETYPES, archetypeStyle, type AestheticArchetypeId } from "../archetypes";
import { telHref } from "../_shared/phone";

const ARCHETYPES_WITHOUT_NAVBAR: AestheticArchetypeId[] = [
  "cinematic-aspirational",
  "technical-restrained",
];

const DEFAULT_SECTIONS = [
  { label: "Services", href: "#services" },
  { label: "Reviews", href: "#reviews" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
];

export type NavbarProps = {
  archetype: AestheticArchetypeId;
  businessName: string;
  /** Verbatim phone string — e.g. "(760) 893-9152". The tel: href is derived. */
  phone: string;
  /** City · City · City tagline shown under the wordmark on desktop. */
  serviceAreas?: string[];
  /** Anchor links — defaults to Services / Reviews / FAQ / Contact. */
  sections?: { label: string; href: string }[];
};

export function Navbar({
  archetype,
  businessName,
  phone,
  serviceAreas,
  sections = DEFAULT_SECTIONS,
}: NavbarProps) {
  if (ARCHETYPES_WITHOUT_NAVBAR.includes(archetype)) return null;

  const arch = ARCHETYPES[archetype];
  const areaLine = serviceAreas && serviceAreas.length > 0
    ? serviceAreas.slice(0, 4).join(" · ")
    : null;

  return (
    <header
      role="banner"
      data-archetype={arch.id}
      style={archetypeStyle(arch.id)}
      className="sf-navbar"
    >
      <div className="sf-navbar-inner">
        {/* Left: wordmark + optional service-area tagline */}
        <div className="sf-navbar-brand">
          <a className="sf-navbar-wordmark" href="/" aria-label={`${businessName} — home`}>
            {businessName.toUpperCase()}
          </a>
          {areaLine && (
            <span className="sf-navbar-area" aria-hidden>
              {areaLine}
            </span>
          )}
        </div>

        {/* Center: section anchors — hidden on mobile */}
        <nav className="sf-navbar-links" aria-label="Page sections">
          {sections.map((s) => (
            <a key={s.href} className="sf-navbar-link" href={s.href}>
              {s.label}
            </a>
          ))}
        </nav>

        {/* Right: phone CTA */}
        <a
          className="sf-navbar-phone"
          href={telHref(phone)}
          aria-label={`Call us at ${phone}`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          <span className="sf-navbar-phone-num">{phone}</span>
        </a>
      </div>

      {/* Local-scope styled-jsx — same pattern as EmergencyStrip. Class names
          are sf-navbar-* prefixed. Archetype tokens via CSS vars only. */}
      <style jsx>{`
        .sf-navbar {
          position: sticky;
          top: 0;
          z-index: 50;
          background: var(--bg);
          border-bottom: 1px solid var(--border);
          font-family: var(--font-body);
        }

        .sf-navbar-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 20px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        @media (min-width: 768px) {
          .sf-navbar-inner { padding: 0 32px; }
        }
        @media (min-width: 1024px) {
          .sf-navbar-inner { padding: 0 48px; height: 60px; }
        }

        /* ── Brand / wordmark ── */
        .sf-navbar-brand {
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
        }
        .sf-navbar-wordmark {
          font-family: var(--font-headline);
          font-weight: 800;
          font-size: 14px;
          letter-spacing: 0.08em;
          color: var(--text);
          text-decoration: none;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 220px;
          transition: color 140ms ease;
        }
        .sf-navbar-wordmark:hover {
          color: var(--primary);
        }
        .sf-navbar-area {
          font-family: var(--font-body);
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: 0.04em;
          color: color-mix(in oklab, var(--text) 45%, transparent);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 220px;
        }

        /* ── Center anchor links (desktop only) ── */
        .sf-navbar-links {
          display: none;
        }
        @media (min-width: 768px) {
          .sf-navbar-links {
            display: flex;
            align-items: center;
            gap: 4px;
          }
        }
        .sf-navbar-link {
          padding: 6px 12px;
          font-size: 13.5px;
          font-weight: 500;
          color: color-mix(in oklab, var(--text) 72%, transparent);
          text-decoration: none;
          border-radius: 6px;
          transition: color 140ms ease, background 140ms ease;
          white-space: nowrap;
        }
        .sf-navbar-link:hover {
          color: var(--text);
          background: color-mix(in oklab, var(--text) 6%, transparent);
        }
        @media (prefers-reduced-motion: reduce) {
          .sf-navbar-link {
            transition: none;
          }
        }

        /* ── Right: phone CTA button ── */
        .sf-navbar-phone {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          height: 36px;
          padding: 0 14px;
          background: var(--primary);
          color: var(--primary-ink, #fff);
          border-radius: 6px;
          font-family: var(--font-body);
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.005em;
          text-decoration: none;
          white-space: nowrap;
          flex-shrink: 0;
          transition: background 140ms ease, box-shadow 160ms ease;
        }
        .sf-navbar-phone:hover {
          background: color-mix(in oklab, var(--primary) 84%, #000);
          box-shadow: 0 4px 12px color-mix(in oklab, var(--primary) 28%, transparent);
        }
        .sf-navbar-phone:active {
          transform: translateY(1px);
        }

        /* Hide the phone number digits on very small screens — icon only. */
        .sf-navbar-phone-num {
          display: none;
        }
        @media (min-width: 420px) {
          .sf-navbar-phone-num {
            display: inline;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sf-navbar-phone {
            transition: none;
          }
          .sf-navbar-phone:active {
            transform: none;
          }
        }
      `}</style>
    </header>
  );
}
