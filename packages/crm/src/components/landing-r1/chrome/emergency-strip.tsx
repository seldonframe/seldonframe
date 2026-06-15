// landing/chrome/emergency-strip.tsx
//
// Full-width ribbon at the very top of the page, above everything else.
// Renders only when:
//   • show === true (explicit override), OR
//   • show is undefined AND archetype is in the URGENCY_SUPPORTED set.
//
// Dark surface, archetype's primary as the pulsing dot + phone link accent.
// Mobile collapses the trailing CALL block under the message; desktop puts
// them on one row.

"use client";

import { ARCHETYPES, archetypeStyle, type AestheticArchetypeId } from "../archetypes";
import { telHref } from "../_shared/phone";

const URGENCY_SUPPORTED: AestheticArchetypeId[] = [
  "bold-urgency",
  "soft-residential", // optional — only when the fixture sets show: true
];

export type EmergencyStripProps = {
  archetype: AestheticArchetypeId;
  /** Body copy. The default is "24/7 emergency service — we come out tonight". */
  message: string;
  /** Verbatim phone string — "(209) 555-0144". The tel: href is derived. */
  phone: string;
  /**
   * Explicit show override. When undefined we derive from the archetype:
   *  • bold-urgency → true
   *  • soft-residential → false (must opt in explicitly)
   *  • everyone else → false
   */
  show?: boolean;
};

export function EmergencyStrip({ archetype, message, phone, show }: EmergencyStripProps) {
  const arch = ARCHETYPES[archetype];

  const shouldShow = show !== undefined
    ? show
    : archetype === "bold-urgency"; // soft-residential must opt in via `show: true`

  if (!shouldShow) return null;
  // Defensive: never render on archetypes whose voice doesn't support urgency.
  if (!URGENCY_SUPPORTED.includes(archetype)) return null;

  return (
    <aside
      role="region"
      aria-label="Emergency service"
      data-archetype={arch.id}
      style={archetypeStyle(arch.id)}
      className="sf-emergency-strip"
    >
      <div className="sf-emergency-inner">
        <div className="sf-emergency-message">
          <span className="sf-emergency-dot" aria-hidden />
          <span>{message}</span>
        </div>
        <a className="sf-emergency-cta" href={telHref(phone)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          Call now {phone}
        </a>
      </div>

      {/* Global styled-jsx — class names are sf-emergency-* prefixed to avoid
          collisions. Scoped jsx breaks with reactCompiler:true (see navbar.tsx
          comment for the full explanation). Global mode matches the pattern
          used by all section components. */}
      <style jsx global>{`
        .sf-emergency-strip {
          background: var(--secondary);
          color: #fff;
          font-family: var(--font-body);
          font-size: 13px;
          font-weight: 500;
          line-height: 1.4;
        }
        .sf-emergency-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 9px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }
        @media (min-width: 768px) { .sf-emergency-inner { padding: 9px 32px; } }
        @media (min-width: 1024px) { .sf-emergency-inner { padding: 9px 48px; } }

        .sf-emergency-message {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .sf-emergency-dot {
          width: 8px;
          height: 8px;
          border-radius: 4px;
          background: var(--primary);
          box-shadow: 0 0 0 4px color-mix(in oklab, var(--primary) 22%, transparent);
          animation: sf-emergency-blink 1.4s ease-in-out infinite;
        }
        @keyframes sf-emergency-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }

        .sf-emergency-cta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--primary);
          font-family: var(--font-mono);
          font-weight: 500;
          font-size: 12.5px;
          letter-spacing: 0.005em;
          text-decoration: none;
          transition: color 140ms ease;
        }
        .sf-emergency-cta:hover {
          text-decoration: underline;
          color: color-mix(in oklab, var(--primary) 80%, #fff);
        }

        @media (prefers-reduced-motion: reduce) {
          .sf-emergency-dot { animation: none; }
        }
      `}</style>
    </aside>
  );
}
