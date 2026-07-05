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

import { ARCHETYPES, type AestheticArchetypeId } from "../archetypes";
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

/** A service entry the navbar dropdown links to. */
export type NavServiceLink = { slug: string; name: string };

/**
 * Pure: build the Services-dropdown links for a workspace. Each becomes
 * `${homeHref}/services/${slug}` with homeHref's trailing slash normalized.
 * Skips entries with a blank slug or name. Exported for unit testing.
 */
export function buildServiceNavLinks(
  homeHref: string,
  pages: NavServiceLink[],
): { label: string; href: string }[] {
  if (!Array.isArray(pages)) return [];
  const base = homeHref === "/" ? "" : homeHref.replace(/\/+$/, "");
  return pages
    .filter((p) => typeof p?.slug === "string" && p.slug.trim() && typeof p?.name === "string" && p.name.trim())
    .map((p) => ({ label: p.name, href: `${base}/services/${p.slug.trim()}` }));
}

/**
 * Pure: the section anchors to render alongside the Services DROPDOWN. When
 * the dropdown is present (the workspace has service pages), the plain
 * "Services" anchor is redundant with it — drop it so the nav never shows
 * "Services" twice. When there's no dropdown, sections pass through unchanged
 * (the "Services" anchor is the only way to reach the section). Matches by
 * href OR label so a custom `sections` prop is handled too. Exported for
 * unit testing.
 */
export function sectionsForNav(
  sections: { label: string; href: string }[],
  hasServiceDropdown: boolean,
): { label: string; href: string }[] {
  if (!hasServiceDropdown) return sections;
  return sections.filter(
    (s) => s.href !== "#services" && s.label.trim().toLowerCase() !== "services",
  );
}

export type NavbarProps = {
  archetype: AestheticArchetypeId;
  businessName: string;
  /** Verbatim phone string — e.g. "(760) 893-9152". The tel: href is derived. */
  phone: string;
  /** City · City · City tagline shown under the wordmark on desktop. */
  serviceAreas?: string[];
  /** Anchor links — defaults to Services / Reviews / FAQ / Contact. */
  sections?: { label: string; href: string }[];
  /** Multi-page: when non-empty, render a Services dropdown linking to each
   *  service detail page. Empty/omitted → no dropdown (current behavior). */
  servicePages?: NavServiceLink[];
  /** Base href for the workspace home + service links. Default "/". On /w it
   *  is "/w/<slug>"; on the subdomain it stays "/". */
  homeHref?: string;
  /** Primary booking CTA rendered in the right actions area. When omitted (legacy
   *  payloads without nav.cta) the button is not rendered — no regression. */
  cta?: { label: string; href: string };
};

export function Navbar({
  archetype,
  businessName,
  phone,
  serviceAreas,
  sections = DEFAULT_SECTIONS,
  servicePages,
  homeHref = "/",
  cta,
}: NavbarProps) {
  if (ARCHETYPES_WITHOUT_NAVBAR.includes(archetype)) return null;

  const arch = ARCHETYPES[archetype];
  const serviceLinks = buildServiceNavLinks(homeHref, servicePages ?? []);
  // When the Services dropdown is shown, the plain "Services" anchor in
  // `sections` duplicates it — drop it so the nav never shows "Services"
  // twice (bug caught by vision-verify on a live r1 site, 2026-07-05).
  const anchorSections = sectionsForNav(sections, serviceLinks.length > 0);
  const areaLine = serviceAreas && serviceAreas.length > 0
    ? serviceAreas.slice(0, 4).join(" · ")
    : null;

  return (
    <header
      role="banner"
      data-archetype={arch.id}
      className="sf-navbar"
    >
      <div className="sf-navbar-inner">
        {/* Left: wordmark + optional service-area tagline */}
        <div className="sf-navbar-brand">
          <a className="sf-navbar-wordmark" href={homeHref} aria-label={`${businessName} — home`}>
            {businessName.toUpperCase()}
          </a>
          {areaLine && (
            <span className="sf-navbar-area" aria-hidden>
              {areaLine}
            </span>
          )}
        </div>

        {/* Center: Services dropdown (when multi-page) + section anchors —
            hidden on mobile. */}
        <nav className="sf-navbar-links" aria-label="Page sections">
          {serviceLinks.length > 0 && (
            <div className="sf-navbar-dropdown">
              <button type="button" className="sf-navbar-link sf-navbar-dropdown-trigger">
                Services
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <div className="sf-navbar-menu">
                {serviceLinks.map((l) => (
                  <a key={l.href} className="sf-navbar-menu-item" href={l.href}>
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
          )}
          {anchorSections.map((s) => (
            <a key={s.href} className="sf-navbar-link" href={s.href}>
              {s.label}
            </a>
          ))}
        </nav>

        {/* Right: booking CTA (primary) + phone CTA */}
        <div className="sf-navbar-actions">
          {cta && (
            <a
              className="sf-navbar-cta"
              href={cta.href}
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
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span className="sf-navbar-cta-label">{cta.label}</span>
            </a>
          )}
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
      </div>

      {/* Global styled-jsx — class names are sf-navbar-* prefixed to avoid
          collisions. Scoped jsx breaks with reactCompiler:true because the
          React Compiler extracts JSX expressions (e.g. sections.map callbacks)
          into memoized sub-functions, so the styled-jsx SWC scope-hash is
          injected into the <style> block but NOT re-injected into the elements
          in the extracted sub-function — causing a selector mismatch and
          zero style application. Global mode is the correct pattern for any
          component whose JSX spans multiple functions/callbacks; this matches
          what hero.tsx, faq.tsx, footer.tsx, services-grid.tsx, and
          testimonials.tsx already do for the same reason. */}
      <style jsx global>{`
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

        /* ── Services dropdown (CSS-only; opens on hover + keyboard focus) ── */
        .sf-navbar-dropdown {
          position: relative;
          display: inline-flex;
        }
        .sf-navbar-dropdown-trigger {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: none;
          border: none;
          cursor: pointer;
          font: inherit;
        }
        .sf-navbar-dropdown-trigger svg { transition: transform 140ms ease; }
        .sf-navbar-dropdown:hover .sf-navbar-dropdown-trigger svg,
        .sf-navbar-dropdown:focus-within .sf-navbar-dropdown-trigger svg {
          transform: rotate(180deg);
        }
        .sf-navbar-menu {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          min-width: 220px;
          max-width: min(320px, calc(100vw - 32px));
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 10px 30px color-mix(in oklab, var(--text) 14%, transparent);
          padding: 6px;
          display: grid;
          gap: 2px;
          opacity: 0;
          visibility: hidden;
          transform: translateY(-4px);
          transition: opacity 140ms ease, transform 140ms ease, visibility 140ms;
          z-index: 60;
        }
        .sf-navbar-dropdown:hover .sf-navbar-menu,
        .sf-navbar-dropdown:focus-within .sf-navbar-menu {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
        }
        .sf-navbar-menu-item {
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 13.5px;
          font-weight: 500;
          color: color-mix(in oklab, var(--text) 80%, transparent);
          text-decoration: none;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sf-navbar-menu-item:hover {
          background: color-mix(in oklab, var(--text) 6%, transparent);
          color: var(--text);
        }
        @media (prefers-reduced-motion: reduce) {
          .sf-navbar-menu,
          .sf-navbar-dropdown-trigger svg { transition: none; }
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

        /* ── Right actions wrapper (book CTA + phone) ── */
        .sf-navbar-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        /* ── Booking CTA button (primary, filled) ── */
        .sf-navbar-cta {
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
        .sf-navbar-cta:hover {
          background: color-mix(in oklab, var(--primary) 84%, #000);
          box-shadow: 0 4px 12px color-mix(in oklab, var(--primary) 28%, transparent);
        }
        .sf-navbar-cta:active {
          transform: translateY(1px);
        }

        /* Hide the label on very small screens — icon only. */
        .sf-navbar-cta-label {
          display: none;
        }
        @media (min-width: 420px) {
          .sf-navbar-cta-label {
            display: inline;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sf-navbar-cta {
            transition: none;
          }
          .sf-navbar-cta:active {
            transform: none;
          }
        }
      `}</style>
    </header>
  );
}
