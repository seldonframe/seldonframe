// landing/sections/services-grid.tsx
//
// Per-archetype services grid. The LAYOUT is the same across all 7 archetypes
// (asymmetric grid — explicitly NOT a 3-equal-card horizontal grid, which is
// universally banned). Theming is via CSS vars; the visual character changes
// because var(--primary) / var(--font-headline) / etc. change per archetype.
//
// Service tiles use striped SVG placeholders (mirrors ImageSprite from
// animations.jsx). Photos there add weight without conversion lift per the
// brief's Q4 default. The card-bg variant injects an optional logo glyph.

"use client";

import { ArrowRight, Phone } from "lucide-react";
import { ARCHETYPES, archetypeStyle, type AestheticArchetypeId } from "../archetypes";
import { telHref } from "../_shared/phone";
import { StaggerGroup, StaggerItem, Reveal } from "../_shared/motion";
import type { ReactNode } from "react";

export type Service = {
  /** Stable id from the LLM payload. */
  id?: string;
  name: string;
  description: string;
  /** Optional inline SVG (string) for the corner icon tile. */
  iconSvg?: string;
  /** Optional photo override. When omitted, the striped placeholder is used. */
  photo?: { src: string; alt: string };
};

export type ServicesGridProps = {
  archetype: AestheticArchetypeId;
  /** Pre-eyebrow ("What we fix" / "Our services"). */
  eyebrow?: string;
  /** Section heading. */
  heading: string;
  /** 1-2 sentence lede displayed in the second column on desktop. */
  intro?: string;
  /** 4-8 services. Asymmetric grid expects exactly 4 for the canonical layout. */
  services: Service[];
  /** Closing CTA + phone — the same urgency principle as everywhere else. */
  cta?: {
    label: string;
    href: string;
    /** Body copy shown to the left of the CTA. Bold-urgency leans "Not sure what you need?". */
    text?: { title: string; sub: string };
  };
};

export function ServicesGrid(props: ServicesGridProps) {
  const { archetype, eyebrow = "What we fix", heading, intro, services, cta } = props;
  const arch = ARCHETYPES[archetype];

  return (
    <section
      data-archetype={arch.id}
      style={archetypeStyle(arch.id)}
      className="sf-services"
      id="services"
    >
      <div className="container">
        <div className="head">
          <Reveal>
            <div>
              <span className="eyebrow">{eyebrow}</span>
              <h2>{heading}</h2>
            </div>
          </Reveal>
          {intro && (
            <Reveal delay={0.08}>
              <p className="lede">{intro}</p>
            </Reveal>
          )}
        </div>

        <StaggerGroup className="grid">
          {services.map((s, i) => (
            <StaggerItem key={s.id ?? s.name} className={cardClassForIndex(i, services.length)}>
              <ServiceCard service={s} />
            </StaggerItem>
          ))}
        </StaggerGroup>

        {cta && (
          <div className="footer-cta">
            {cta.text && (
              <div className="text">
                <b>{cta.text.title}</b>
                {cta.text.sub}
              </div>
            )}
            <a
              className="btn btn-primary btn-xl btn-pulse"
              href={cta.href.startsWith("tel:") ? cta.href : cta.href}
            >
              <Phone size={20} strokeWidth={2.4} aria-hidden />
              {cta.label}
            </a>
          </div>
        )}
      </div>

      <ServicesStyles />
    </section>
  );
}

// ── Service card ───────────────────────────────────────────────────────────
function ServiceCard({ service }: { service: Service }) {
  return (
    <article className="card">
      <div className="placeholder">
        {service.iconSvg ? (
          <span
            className="icon-tile"
            aria-hidden
            dangerouslySetInnerHTML={{ __html: service.iconSvg }}
          />
        ) : (
          <span className="icon-tile" aria-hidden>
            <DefaultGlyph />
          </span>
        )}
        <span className="ph-label">photo · {service.name.toLowerCase()}</span>
      </div>
      <div className="body">
        <h3>{service.name}</h3>
        <p>{service.description}</p>
        <a className="more" href={`#service-${slugify(service.name)}`}>
          Learn more
          <ArrowRight size={14} strokeWidth={2.4} aria-hidden />
        </a>
      </div>
    </article>
  );
}

function DefaultGlyph() {
  // Minimal generic icon — Lucide Wrench style.
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  );
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Asymmetric grid — first card spans 2 rows, second card spans 2 cols.
// For services.length === 4 this produces a clean L-shape. For other counts,
// extra cards fall through as standard cells.
function cardClassForIndex(i: number, total: number): string | undefined {
  if (total < 4) return undefined;
  if (i === 0) return "is-large";
  if (i === 1) return "is-wide";
  return undefined;
}

// ── Styles ─────────────────────────────────────────────────────────────────
function ServicesStyles() {
  return (
    <style jsx>{`
      .sf-services {
        background: var(--bg);
        color: var(--text);
        font-family: var(--font-body);
        padding-top: 56px; padding-bottom: 56px;
      }
      @media (min-width: 768px) { .sf-services { padding-top: 88px; padding-bottom: 88px; } }

      .container {
        max-width: 1200px; margin: 0 auto;
        padding-left: 20px; padding-right: 20px;
      }
      @media (min-width: 768px) { .container { padding-left: 32px; padding-right: 32px; } }
      @media (min-width: 1024px) { .container { padding-left: 48px; padding-right: 48px; } }

      .head {
        display: grid; grid-template-columns: 1fr;
        gap: 18px; align-items: end;
        margin-bottom: 40px;
      }
      @media (min-width: 768px) {
        .head { grid-template-columns: 1.5fr 1fr; gap: 36px; }
      }

      .eyebrow {
        font-size: 11.5px; font-weight: 600;
        letter-spacing: 0.14em; text-transform: uppercase;
        color: var(--primary);
      }

      .head h2 {
        margin: 12px 0 0;
        font-family: var(--font-headline);
        font-weight: 800;
        font-size: clamp(32px, 4.6vw, 48px);
        letter-spacing: -0.022em;
        line-height: 1.02;
        text-wrap: balance;
      }

      .lede {
        margin: 0;
        font-size: 16px;
        line-height: 1.55;
        color: color-mix(in oklab, var(--text) 68%, transparent);
      }

      /* Asymmetric grid — NEVER 3-equal-card. */
      .grid {
        display: grid; grid-template-columns: 1fr; gap: 16px;
      }
      @media (min-width: 640px) { .grid { grid-template-columns: repeat(2, 1fr); gap: 18px; } }
      @media (min-width: 1024px) {
        .grid {
          grid-template-columns: 1.4fr 1fr 1fr;
          grid-template-rows: auto auto;
          gap: 20px;
        }
        .grid > :global(.is-large) { grid-row: span 2; }
        .grid > :global(.is-wide)  { grid-column: 2 / 4; }
      }

      :global(.card) {
        position: relative;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg, 14px);
        padding: 22px;
        display: flex; flex-direction: column; gap: 14px;
        overflow: hidden;
        transition: transform 220ms ease, box-shadow 220ms ease, border-color 180ms ease;
      }
      :global(.card:hover) {
        transform: translateY(-3px);
        box-shadow: 0 6px 20px color-mix(in oklab, var(--primary) 18%, transparent);
        border-color: var(--primary);
      }

      .grid > :global(.is-large .card) {
        background: radial-gradient(140% 90% at 0% 0%, color-mix(in oklab, var(--primary) 7%, var(--bg)), var(--bg));
        border-color: color-mix(in oklab, var(--primary) 18%, var(--border));
      }
      .grid > :global(.is-wide .card) {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
      }
      @media (max-width: 1023px) {
        .grid > :global(.is-wide .card) { grid-template-columns: 1fr; }
      }

      :global(.placeholder) {
        width: 100%; aspect-ratio: 16 / 9;
        background: repeating-linear-gradient(
          135deg,
          var(--surface-deep) 0 10px,
          color-mix(in oklab, var(--surface-deep) 60%, var(--bg)) 10px 20px
        );
        border-radius: var(--radius, 10px);
        display: flex; align-items: flex-end; justify-content: flex-start;
        padding: 14px;
        position: relative;
        border: 1px solid var(--border);
      }
      .grid > :global(.is-large .placeholder) { aspect-ratio: 5 / 4; }
      .grid > :global(.is-wide .placeholder) { aspect-ratio: auto; height: 100%; min-height: 180px; }

      :global(.ph-label) {
        font-family: var(--font-mono);
        font-size: 10.5px; font-weight: 500;
        text-transform: uppercase; letter-spacing: 0.06em;
        color: color-mix(in oklab, var(--text) 50%, transparent);
        background: var(--bg);
        padding: 3px 8px; border-radius: 4px;
        border: 1px solid var(--border);
      }

      :global(.icon-tile) {
        position: absolute; top: 14px; right: 14px;
        width: 38px; height: 38px;
        display: inline-flex; align-items: center; justify-content: center;
        background: var(--primary); color: var(--primary-ink, #fff);
        border-radius: var(--radius-sm, 6px);
        box-shadow: 0 4px 10px color-mix(in oklab, var(--primary) 25%, transparent);
      }

      :global(.card .body) { display: flex; flex-direction: column; gap: 8px; flex: 1; }
      :global(.card h3) {
        margin: 0;
        font-family: var(--font-headline);
        font-weight: 800;
        font-size: 22px;
        letter-spacing: -0.015em;
        line-height: 1.1;
      }
      .grid > :global(.is-large .card h3) { font-size: clamp(26px, 2.4vw, 32px); }
      :global(.card p) {
        margin: 0;
        font-size: 14.5px;
        color: color-mix(in oklab, var(--text) 65%, transparent);
        line-height: 1.5;
        flex: 1;
      }
      :global(.card .more) {
        display: inline-flex; align-items: center; gap: 6px;
        font-weight: 600; font-size: 13.5px;
        color: var(--primary);
        margin-top: 2px;
      }
      :global(.card .more svg) { transition: transform 180ms ease; }
      :global(.card:hover .more svg) { transform: translateX(4px); }

      .footer-cta {
        margin-top: 40px;
        padding: 24px;
        background: var(--secondary); color: #fff;
        border-radius: var(--radius-lg, 14px);
        display: flex; flex-direction: column; gap: 16px;
        align-items: flex-start;
      }
      @media (min-width: 768px) {
        .footer-cta { flex-direction: row; align-items: center; justify-content: space-between; }
      }
      .footer-cta .text {
        font-size: 16px; font-weight: 500; max-width: 480px;
      }
      .footer-cta .text b {
        display: block;
        font-family: var(--font-headline); font-weight: 800;
        font-size: 22px; margin-bottom: 4px; letter-spacing: -0.015em;
      }

      @media (prefers-reduced-motion: reduce) {
        :global(.card) { transition: none; }
        :global(.card:hover) { transform: none; }
      }
    `}</style>
  );
}
