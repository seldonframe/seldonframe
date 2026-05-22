// landing/sections/footer.tsx
//
// Per-archetype footer with brand block + 3 link columns. Includes the
// "BIG PHONE" element (large mono number) for bold-urgency / similar — the
// brief calls for phone in nav, hero, and footer. Trust badges sit underneath
// the big phone with the same `logoSvg?: string` slot as elsewhere.
//
// Service-area links are wired but go to # for now; the LLM payload supplies
// the list and the operator's CRM later wires them to per-city landing pages.

import { Phone, Star } from "lucide-react";
import { ARCHETYPES, archetypeStyle, type AestheticArchetypeId } from "../archetypes";
import { telHref } from "../_shared/phone";
import { TrustBadge } from "../_shared/trust-badge";

export type FooterProps = {
  archetype: AestheticArchetypeId;
  businessName: string;
  tagline?: string;
  phone: string;            // verbatim from LLM — "(209) 555-0144"
  email?: string;
  address?: { line1: string; line2?: string; city: string; state: string; zip: string };
  serviceAreas?: string[];
  /** Each entry: ["Mon–Fri · 7am–7pm", ...]. Use one entry for 24/7. */
  weeklyHours?: { line: string; emergency?: boolean }[];
  license?: string;
  trustBadges?: { label: string; logoSvg?: string }[];
  /** Nav columns the operator can override; defaults to Services / Service area / Hours. */
  serviceLinks?: { label: string; href: string }[];
  socials?: { kind: "facebook" | "google" | "yelp" | "instagram"; href: string }[];
  /** Optional inline SVG for the brand mark; defaults to a generic icon. */
  brandMarkSvg?: string;
};

export function Footer(props: FooterProps) {
  const arch = ARCHETYPES[props.archetype];
  const {
    businessName, tagline, phone, address, serviceAreas, weeklyHours,
    license, trustBadges, serviceLinks, socials, brandMarkSvg,
  } = props;
  const year = new Date().getFullYear();

  return (
    <footer
      data-archetype={arch.id}
      style={archetypeStyle(arch.id)}
      className="sf-footer"
      id="footer"
    >
      <div className="container">
        <div className="top">
          {/* Brand + big phone */}
          <div className="brand-block">
            <a href="#top" className="brand">
              <span className="mark" aria-hidden>
                {brandMarkSvg ? (
                  <span dangerouslySetInnerHTML={{ __html: brandMarkSvg }} />
                ) : (
                  <DefaultMark />
                )}
              </span>
              <span className="name">
                {businessName}
                {serviceAreas && serviceAreas.length > 0 && (
                  <small>{serviceAreas.slice(0, 4).join(" · ")}</small>
                )}
              </span>
            </a>
            {tagline && <p className="tagline">{tagline}</p>}

            <a className="big-phone" href={telHref(phone)}>
              <Phone size={22} strokeWidth={2.4} aria-hidden />
              {phone}
            </a>

            {trustBadges && trustBadges.length > 0 && (
              <div className="badges">
                {trustBadges.map((b) => (
                  <TrustBadge key={b.label} label={b.label} logoSvg={b.logoSvg} variant="subtle" />
                ))}
              </div>
            )}
          </div>

          {/* Services */}
          {serviceLinks && serviceLinks.length > 0 && (
            <div className="col">
              <h4>Services</h4>
              <ul>
                {serviceLinks.map((l) => (
                  <li key={l.href}><a href={l.href}>{l.label}</a></li>
                ))}
              </ul>
            </div>
          )}

          {/* Service area */}
          {serviceAreas && serviceAreas.length > 0 && (
            <div className="col">
              <h4>Service area</h4>
              <ul>
                {serviceAreas.map((c) => (
                  <li key={c}><a href={`#service-area-${slugify(c)}`}>{c}</a></li>
                ))}
              </ul>
            </div>
          )}

          {/* Hours + office */}
          <div className="col">
            {weeklyHours && weeklyHours.length > 0 && (
              <>
                <h4>Hours</h4>
                <div className="hours">
                  {weeklyHours.map((h, i) => (
                    <span key={i} className={h.emergency ? "emergency" : undefined}>
                      {h.line}
                    </span>
                  ))}
                </div>
              </>
            )}
            {address && (
              <>
                <h4 style={{ marginTop: 22 }}>Office</h4>
                <div className="hours">
                  <span>{address.line1}</span>
                  {address.line2 && <span>{address.line2}</span>}
                  <span>{address.city}, {address.state} {address.zip}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bottom">
          <span>© {year} {businessName}. All rights reserved.</span>
          {license && <span className="license">{license}</span>}
          {socials && socials.length > 0 && (
            <span className="socials">
              {socials.map((s) => (
                <a key={s.href} href={s.href} aria-label={s.kind} target="_blank" rel="noopener noreferrer">
                  {s.kind === "facebook" && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                    </svg>
                  )}
                  {s.kind === "google" && <Star size={16} aria-hidden fill="currentColor" strokeWidth={0} />}
                  {(s.kind === "yelp" || s.kind === "instagram") && (
                    <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.06 }}>
                      {s.kind.toUpperCase()}
                    </span>
                  )}
                </a>
              ))}
            </span>
          )}
        </div>
      </div>

      <FooterStyles />
    </footer>
  );
}

function DefaultMark() {
  // A neutral square mark — the operator should override via brandMarkSvg.
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function FooterStyles() {
  return (
    <style jsx>{`
      .sf-footer {
        background: var(--secondary);
        color: rgba(255,255,255,0.78);
        font-family: var(--font-body);
        padding: 56px 0 96px;
        font-size: 14px;
      }
      @media (min-width: 768px) { .sf-footer { padding: 80px 0 56px; } }

      .container {
        max-width: 1200px; margin: 0 auto;
        padding: 0 20px;
      }
      @media (min-width: 768px) { .container { padding: 0 32px; } }
      @media (min-width: 1024px) { .container { padding: 0 48px; } }

      .top {
        display: grid; gap: 36px;
        grid-template-columns: 1fr;
      }
      @media (min-width: 768px) {
        .top { grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 48px; }
      }

      h4 {
        margin: 0 0 12px;
        font-family: var(--font-headline);
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.55);
      }

      .brand-block .brand { color: #fff; display: inline-flex; align-items: center; gap: 12px; }
      .brand-block .brand .mark {
        width: 40px; height: 40px;
        display: inline-flex; align-items: center; justify-content: center;
        background: var(--primary); color: var(--primary-ink, #fff);
        border-radius: var(--radius-sm, 6px);
      }
      .brand-block .brand .name {
        display: inline-flex; flex-direction: column; gap: 3px;
        font-family: var(--font-headline);
        font-weight: 800; font-size: 17px;
        letter-spacing: -0.015em;
      }
      .brand-block .brand .name small {
        font-family: var(--font-body);
        font-size: 11px; font-weight: 500;
        color: rgba(255,255,255,0.55);
        letter-spacing: 0.005em;
        text-transform: none;
      }
      .brand-block .tagline {
        margin: 16px 0 0;
        color: rgba(255,255,255,0.62);
        font-size: 14px;
        line-height: 1.55;
        max-width: 380px;
      }

      .big-phone {
        display: inline-flex; align-items: center; gap: 12px;
        margin-top: 18px;
        padding: 14px 18px;
        background: var(--primary);
        color: var(--primary-ink, #fff);
        border-radius: var(--radius, 10px);
        font-family: var(--font-mono);
        font-weight: 500;
        font-size: 20px;
        letter-spacing: -0.01em;
        box-shadow: 0 8px 20px color-mix(in oklab, var(--primary) 28%, transparent);
      }

      .badges {
        display: flex; flex-wrap: wrap; gap: 8px;
        margin-top: 18px;
      }

      .col ul {
        list-style: none; padding: 0; margin: 0;
        display: flex; flex-direction: column; gap: 8px;
      }
      .col a {
        color: rgba(255,255,255,0.72);
        text-decoration: none;
        transition: color 140ms;
      }
      .col a:hover { color: #fff; }

      .hours { display: flex; flex-direction: column; gap: 5px; color: rgba(255,255,255,0.72); }
      .hours .emergency { color: #34d399; font-weight: 600; }

      .bottom {
        margin-top: 48px;
        padding-top: 22px;
        border-top: 1px solid rgba(255,255,255,0.10);
        display: flex; justify-content: space-between; flex-wrap: wrap;
        gap: 12px;
        font-size: 12.5px;
        color: rgba(255,255,255,0.5);
      }
      .bottom .license {
        font-family: var(--font-mono);
        letter-spacing: 0.005em;
      }
      .bottom .socials {
        display: inline-flex; align-items: center; gap: 14px;
      }
      .bottom .socials a {
        color: rgba(255,255,255,0.5);
        transition: color 140ms;
      }
      .bottom .socials a:hover { color: #fff; }
    `}</style>
  );
}
