// landing-r1/sections/service-page.tsx
//
// The single per-service detail template, populated from one ServicePage.
// Archetype-themed via CSS vars only (no hard-coded hex). Layout:
//   hero (name + heroPhoto? + CTA placeholder where P2's intake form mounts)
//   → description (body[] blocks)
//   → testimonials (reuses the existing <Testimonials> component)
//   → CTA band
//   → map placeholder (P2 mounts the real Google Maps embed)
//
// The two P2 mount points are <div data-slot="intake"> and <div data-slot="map">
// — Phase 2 replaces their inner content; Phase 1 ships labeled placeholders so
// the page is complete and walkable now.

"use client";

import { Phone } from "lucide-react";
import { ARCHETYPES, type AestheticArchetypeId } from "../archetypes";
import { telHref } from "../_shared/phone";
import { Testimonials } from "./testimonials";
import type { ServicePage } from "@/lib/landing/r1-site-tree";

export type ServicePageTemplateProps = {
  archetype: AestheticArchetypeId;
  service: ServicePage;
  /** Verbatim phone for the CTA tel: link. */
  phone: string;
  /** Where the CTA buttons point (workspace-scoped, e.g. the booking URL). */
  ctaHref: string;
};

export function ServicePageTemplate({
  archetype,
  service,
  phone,
  ctaHref,
}: ServicePageTemplateProps) {
  const arch = ARCHETYPES[archetype];
  const hasTestimonials = Array.isArray(service.testimonials) && service.testimonials.length > 0;

  return (
    <main
      data-archetype={arch.id}
      className="sf-service"
    >
      {/* ── Hero ── */}
      <section className="sf-service-hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Service</span>
            <h1>{service.name}</h1>
            {service.summary && <p className="summary">{service.summary}</p>}
            <div className="hero-cta">
              <a className="btn btn-primary" href={ctaHref}>
                {service.ctaLabel}
              </a>
              <a className="btn btn-ghost" href={telHref(phone)}>
                <Phone size={18} strokeWidth={2.4} aria-hidden />
                {phone}
              </a>
            </div>
            {/* P2 mount point: the intake form renders here on the service hero. */}
            <div data-slot="intake" className="slot slot-intake" aria-hidden="true" />
          </div>
          <div className="hero-media">
            {service.heroPhoto ? (
              <img src={service.heroPhoto.src} alt={service.heroPhoto.alt} loading="eager" fetchPriority="high" />
            ) : (
              <div className="hero-media-ph" aria-hidden />
            )}
          </div>
        </div>
      </section>

      {/* ── Description (body blocks) ── */}
      {Array.isArray(service.body) && service.body.length > 0 && (
        <section className="sf-service-body">
          <div className="container body-col">
            {service.body.map((block, i) =>
              block.kind === "heading" ? (
                <h2 key={i}>{block.text}</h2>
              ) : (
                <p key={i}>{block.text}</p>
              ),
            )}
          </div>
        </section>
      )}

      {/* ── Testimonials (reuse existing component) ── */}
      {hasTestimonials && (
        <Testimonials
          archetype={archetype}
          heading={`What clients say about our ${service.name.toLowerCase()}`}
          testimonials={service.testimonials!}
        />
      )}

      {/* ── CTA band ── */}
      <section className="sf-service-cta">
        <div className="container cta-band">
          <div className="cta-text">
            <b>Ready to get started?</b>
            <span>Tell us about your project and we&apos;ll be in touch fast.</span>
          </div>
          <a className="btn btn-primary btn-xl" href={ctaHref}>
            {service.ctaLabel}
          </a>
        </div>
      </section>

      {/* P2 mount point: the Google Maps embed renders here. */}
      <section className="sf-service-map">
        <div className="container">
          <div data-slot="map" className="slot slot-map" aria-hidden="true" />
        </div>
      </section>

      <ServicePageStyles />
    </main>
  );
}

function ServicePageStyles() {
  return (
    // global: styled-jsx scope is per-function (see faq.tsx rationale), so a
    // dedicated *Styles helper must use global mode.
    <style jsx global>{`
      .sf-service {
        background: var(--bg);
        color: var(--text);
        font-family: var(--font-body);
      }
      .container {
        max-width: 1200px; margin: 0 auto;
        padding-left: 20px; padding-right: 20px;
      }
      @media (min-width: 768px) { .container { padding-left: 32px; padding-right: 32px; } }
      @media (min-width: 1024px) { .container { padding-left: 48px; padding-right: 48px; } }

      /* Hero */
      .sf-service-hero { padding: 48px 0; }
      @media (min-width: 768px) { .sf-service-hero { padding: 72px 0; } }
      .hero-grid { display: grid; grid-template-columns: 1fr; gap: 32px; align-items: center; }
      @media (min-width: 900px) { .hero-grid { grid-template-columns: 1.1fr 1fr; gap: 48px; } }
      .eyebrow {
        font-size: 11.5px; font-weight: 600; letter-spacing: 0.14em;
        text-transform: uppercase; color: var(--primary);
      }
      .hero-copy h1 {
        margin: 12px 0 0;
        font-family: var(--font-headline); font-weight: 800;
        font-size: clamp(34px, 5vw, 56px); letter-spacing: -0.022em;
        line-height: 1.02; text-wrap: balance;
      }
      .hero-copy .summary {
        margin: 16px 0 0; font-size: 17px; line-height: 1.55;
        color: color-mix(in oklab, var(--text) 72%, transparent); max-width: 520px;
      }
      .hero-cta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }

      .btn {
        display: inline-flex; align-items: center; gap: 8px;
        height: 46px; padding: 0 20px; border-radius: 8px;
        font-weight: 600; font-size: 15px; text-decoration: none;
        transition: background 140ms ease, box-shadow 160ms ease, transform 120ms ease;
      }
      .btn-xl { height: 52px; padding: 0 26px; font-size: 16px; }
      .btn-primary { background: var(--primary); color: var(--primary-ink, #fff); }
      .btn-primary:hover { background: color-mix(in oklab, var(--primary) 84%, #000); }
      .btn-primary:active { transform: translateY(1px); }
      .btn-ghost {
        background: transparent; color: var(--text);
        border: 1px solid var(--border);
      }
      .btn-ghost:hover { border-color: var(--primary); color: var(--primary); }

      .slot-intake {
        margin-top: 28px; min-height: 64px;
        border: 1px dashed color-mix(in oklab, var(--text) 24%, transparent);
        border-radius: 10px;
      }

      .hero-media img,
      .hero-media-ph {
        width: 100%; aspect-ratio: 4 / 3; object-fit: cover;
        border-radius: 14px; border: 1px solid var(--border); display: block;
      }
      .hero-media-ph {
        background: repeating-linear-gradient(
          135deg, var(--surface-deep) 0 12px,
          color-mix(in oklab, var(--surface-deep) 60%, var(--bg)) 12px 24px
        );
      }

      /* Body */
      .sf-service-body { padding: 8px 0 48px; }
      @media (min-width: 768px) { .sf-service-body { padding: 8px 0 72px; } }
      .body-col { max-width: 760px; }
      .body-col h2 {
        margin: 32px 0 12px; font-family: var(--font-headline);
        font-weight: 800; font-size: clamp(24px, 3vw, 32px);
        letter-spacing: -0.015em; line-height: 1.1;
      }
      .body-col h2:first-child { margin-top: 0; }
      .body-col p {
        margin: 0 0 16px; font-size: 16.5px; line-height: 1.65;
        color: color-mix(in oklab, var(--text) 82%, transparent);
      }

      /* CTA band */
      .sf-service-cta { padding: 0 0 48px; }
      @media (min-width: 768px) { .sf-service-cta { padding: 0 0 72px; } }
      .cta-band {
        background: var(--secondary); color: #fff;
        border-radius: 16px; padding: 28px;
        display: flex; flex-direction: column; gap: 18px; align-items: flex-start;
      }
      @media (min-width: 768px) {
        .cta-band { flex-direction: row; align-items: center; justify-content: space-between; }
      }
      .cta-text b {
        display: block; font-family: var(--font-headline); font-weight: 800;
        font-size: 22px; margin-bottom: 4px; letter-spacing: -0.015em;
      }
      .cta-text span { color: rgba(255,255,255,0.82); font-size: 15px; }

      /* Map */
      .sf-service-map { padding: 0 0 64px; }
      .slot-map {
        width: 100%; aspect-ratio: 16 / 7; min-height: 220px;
        border-radius: 14px; border: 1px dashed color-mix(in oklab, var(--text) 24%, transparent);
        background: var(--surface);
      }

      @media (prefers-reduced-motion: reduce) {
        .btn { transition: none; }
        .btn-primary:active { transform: none; }
      }
    `}</style>
  );
}
