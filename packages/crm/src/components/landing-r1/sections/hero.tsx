// landing/sections/hero.tsx
//
// Per-archetype hero section. Switches LAYOUT on archetype.heroVariant:
//   • split-screen-50-50  → bold-urgency                       (✅ Phase R.1)
//   • left-aligned-asymmetric → editorial-warm, clinical-trust,
//                                soft-residential, brutalist     (Phase R.1.2)
//   • cinematic-aura     → cinematic-aspirational, technical-restrained
//                                                                (Phase R.1.2)
//
// Theming is 100% via CSS vars emitted by archetypeStyle(). This file does
// not hard-code hex anywhere.

"use client";

import Image from "next/image";
import { Phone, Calendar, ArrowRight, Zap } from "lucide-react";
import { ARCHETYPES, archetypeStyle, type AestheticArchetypeId } from "../archetypes";
import { telHref } from "../_shared/phone";
import { Reveal, CountUp } from "../_shared/motion";
import { TrustBadge } from "../_shared/trust-badge";
import { Stars } from "../_shared/stars";

export type CTA = { label: string; href: string };

export type HeroProps = {
  archetype: AestheticArchetypeId;
  businessName: string;
  tagline: string;
  subhead: string;
  primaryCTA: CTA;
  secondaryCTA?: CTA;
  trustBadges: { label: string; logoSvg?: string }[];
  reviewRating?: number;
  reviewCount?: number;
  emergencyService?: boolean;
  heroImage?: { src: string; alt: string };
  /** Optional on-photo callout (name + price/tag). LLM may omit. */
  heroOverlay?: {
    techName: string;
    techMeta: string;
    callout?: string;
  };
};

export function Hero(props: HeroProps) {
  const arch = ARCHETYPES[props.archetype];
  return (
    <section
      data-archetype={arch.id}
      style={archetypeStyle(arch.id)}
      className="sf-hero"
    >
      {arch.heroVariant === "split-screen-50-50" && <HeroSplit {...props} />}
      {arch.heroVariant === "left-aligned-asymmetric" && <HeroLeftAsymmetric {...props} />}
      {arch.heroVariant === "cinematic-aura" && <HeroCinematic {...props} />}

      <HeroStyles />
    </section>
  );
}

// ── split-screen-50-50  (bold-urgency) ─────────────────────────────────────
function HeroSplit(props: HeroProps) {
  const { businessName, tagline, subhead, primaryCTA, secondaryCTA, trustBadges,
          reviewRating, reviewCount, emergencyService, heroImage, heroOverlay } = props;

  // Bold-urgency tagline pattern: split on the first sentence terminator and
  // render the back half as the accent line. If the LLM doesn't follow that
  // pattern we just render the whole tagline at base color.
  const taglineParts = splitTagline(tagline);

  return (
    <div className="hero-split container">
      <div className="hero-text">
        {emergencyService && (
          <Reveal>
            <span className="badge-emergency">
              <span className="dot" aria-hidden />
              Same-day service · 60 min response
            </span>
          </Reveal>
        )}
        <Reveal delay={0.06}>
          <h1 className="hero-headline" aria-label={`${businessName}: ${tagline}`}>
            {taglineParts.head}
            {taglineParts.tail && (
              <span className="accent"> {taglineParts.tail}</span>
            )}
          </h1>
        </Reveal>
        <Reveal delay={0.14}>
          <p className="hero-lede">{subhead}</p>
        </Reveal>

        <Reveal delay={0.22}>
          <div className="cta-row">
            <a
              className="btn btn-primary btn-xl btn-pulse"
              href={primaryCTA.href.startsWith("tel:") ? primaryCTA.href : primaryCTA.href}
            >
              <Phone size={20} aria-hidden strokeWidth={2.4} />
              {primaryCTA.label}
            </a>
            {secondaryCTA && (
              <a className="btn btn-secondary btn-xl" href={secondaryCTA.href}>
                <Calendar size={18} aria-hidden strokeWidth={2.4} />
                {secondaryCTA.label}
              </a>
            )}
          </div>
        </Reveal>

        <div className="trust-strip">
          {reviewRating != null && reviewCount != null && (
            <Reveal delay={0.28}>
              <TrustBadge label={`${reviewRating} · ${reviewCount} reviews`} variant="rating">
                <Stars value={reviewRating} size={12} />
                <b style={{ fontWeight: 700 }}>
                  <CountUp value={reviewRating} decimals={1} />
                </b>
                <small style={{
                  color: "color-mix(in oklab, #fff 60%, transparent)",
                  fontWeight: 500,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                }}>
                  <CountUp value={reviewCount} /> reviews
                </small>
              </TrustBadge>
            </Reveal>
          )}
          {trustBadges.map((b, i) => (
            <Reveal key={b.label} delay={0.32 + i * 0.04}>
              <TrustBadge label={b.label} logoSvg={b.logoSvg} />
            </Reveal>
          ))}
        </div>
      </div>

      {heroImage && (
        <Reveal delay={0.08} className="hero-photo-wrap">
          <div className="hero-photo">
            <Image
              src={heroImage.src}
              alt={heroImage.alt}
              fill
              priority
              sizes="(max-width: 1023px) 100vw, 50vw"
              style={{ objectFit: "cover" }}
            />
            <div className="photo-badge-live">
              <span className="dot" aria-hidden />
              On call now
            </div>
            {heroOverlay && (
              <div className="photo-who">
                <div>
                  <b>{heroOverlay.techName}</b>
                  <small>{heroOverlay.techMeta}</small>
                </div>
                {heroOverlay.callout && (
                  <span className="photo-callout">{heroOverlay.callout}</span>
                )}
              </div>
            )}
          </div>
        </Reveal>
      )}
    </div>
  );
}

// ── left-aligned-asymmetric  (4 archetypes — Phase R.1.2 polish) ──────────
function HeroLeftAsymmetric(props: HeroProps) {
  // Scaffold — same content surface as split, but a single-column asymmetric
  // layout with the photo offset 60% of the way down on the right edge. Phase
  // R.1.2 will iterate this against editorial-warm / clinical-trust / soft-
  // residential / brutalist references.
  return (
    <div className="hero-left container">
      <h1 className="hero-headline" data-stub>{props.tagline}</h1>
      <p className="hero-lede" data-stub>{props.subhead}</p>
      <div className="cta-row">
        <a className="btn btn-primary btn-xl" href={props.primaryCTA.href}>{props.primaryCTA.label}</a>
        {props.secondaryCTA && <a className="btn btn-secondary btn-xl" href={props.secondaryCTA.href}>{props.secondaryCTA.label}</a>}
      </div>
      <p data-todo>TODO Phase R.1.2 — refine for editorial-warm / clinical-trust / soft-residential / brutalist.</p>
    </div>
  );
}

// ── cinematic-aura  (2 archetypes — Phase R.1.2) ──────────────────────────
function HeroCinematic(props: HeroProps) {
  return (
    <div className="hero-cinematic container">
      <h1 className="hero-headline" data-stub>{props.tagline}</h1>
      <p className="hero-lede" data-stub>{props.subhead}</p>
      <p data-todo>TODO Phase R.1.2 — refine for cinematic-aspirational / technical-restrained.</p>
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────
function splitTagline(tagline: string): { head: string; tail?: string } {
  // Bold-urgency taglines are typically two-clause: "AC down? We'll be there in 60 minutes."
  // We render the second clause in the accent color. Fallback: render whole.
  const match = tagline.match(/^(.+?[.?!])\s+(.+)$/);
  if (!match) return { head: tagline };
  return { head: match[1], tail: match[2] };
}

// ── Styles (scoped via styled-jsx) ─────────────────────────────────────────
function HeroStyles() {
  return (
    <style jsx>{`
      .sf-hero { background: var(--bg); border-bottom: 1px solid var(--border); color: var(--text); font-family: var(--font-body); }

      .container {
        max-width: 1200px; margin: 0 auto;
        padding-left: 20px; padding-right: 20px;
      }
      @media (min-width: 768px) { .container { padding-left: 32px; padding-right: 32px; } }
      @media (min-width: 1024px) { .container { padding-left: 48px; padding-right: 48px; } }

      /* split-screen-50-50 */
      .hero-split {
        display: grid; grid-template-columns: 1fr; gap: 36px;
        padding-top: 48px; padding-bottom: 56px;
      }
      @media (min-width: 1024px) {
        .hero-split {
          grid-template-columns: 1fr 1fr;       /* TRUE 50-50 */
          gap: 56px;
          padding-top: 88px; padding-bottom: 96px;
          align-items: center;
        }
      }

      .badge-emergency {
        display: inline-flex; align-items: center; gap: 8px;
        background: color-mix(in oklab, var(--primary) 12%, var(--bg));
        border: 1px solid color-mix(in oklab, var(--primary) 35%, transparent);
        color: color-mix(in oklab, var(--primary) 80%, var(--text));
        padding: 6px 12px;
        border-radius: 999px;
        font-weight: 600; font-size: 12.5px;
      }
      .badge-emergency :global(.dot), .photo-badge-live :global(.dot) {
        width: 6px; height: 6px; border-radius: 3px;
        background: var(--primary);
        animation: sf-blink 1.4s ease-in-out infinite;
      }

      .hero-headline {
        margin: 18px 0 0;
        font-family: var(--font-headline);
        font-weight: 800;
        font-size: clamp(34px, 6vw, 60px);
        letter-spacing: -0.022em;
        line-height: 1.02;
        text-wrap: balance;
      }
      .hero-headline :global(.accent) {
        color: var(--primary);
        display: block;
      }

      .hero-lede {
        margin: 18px 0 0;
        max-width: 540px;
        font-size: clamp(16px, 1.6vw, 18px);
        color: color-mix(in oklab, var(--text) 70%, transparent);
        line-height: 1.55;
        text-wrap: pretty;
      }

      .cta-row {
        display: flex; flex-wrap: wrap; gap: 10px;
        margin-top: 26px;
      }
      .cta-row :global(.btn) { flex: 1 1 auto; min-width: 180px; }

      .trust-strip {
        margin-top: 28px;
        display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      }

      .hero-photo-wrap { display: block; }
      .hero-photo {
        position: relative;
        border-radius: var(--radius-lg, 14px);
        overflow: hidden;
        background: var(--surface-deep);
        aspect-ratio: 4 / 5;
      }
      @media (max-width: 1023px) { .hero-photo { aspect-ratio: 16 / 10; } }

      .photo-badge-live {
        position: absolute; left: 16px; top: 16px;
        display: inline-flex; align-items: center; gap: 8px;
        padding: 7px 13px;
        background: rgba(26, 26, 26, 0.88);
        backdrop-filter: blur(6px);
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 999px;
        color: #fff;
        font-size: 11px; font-weight: 600;
        letter-spacing: 0.04em; text-transform: uppercase;
      }
      .photo-badge-live :global(.dot) {
        width: 7px; height: 7px; border-radius: 4px; background: #34d399;
        box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.18);
      }

      .photo-who {
        position: absolute; left: 16px; right: 16px; bottom: 16px;
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        background: rgba(26, 26, 26, 0.88);
        backdrop-filter: blur(6px);
        color: #fff; font-size: 13px;
        border-radius: var(--radius, 10px);
        border: 1px solid rgba(255,255,255,0.10);
      }
      .photo-who b { display: block; font-weight: 700; font-size: 13.5px; }
      .photo-who small { color: rgba(255,255,255,0.62); font-size: 11px; }
      .photo-callout {
        font-family: var(--font-mono);
        font-size: 12px; color: #fbbf24; font-weight: 500;
        text-align: right; flex-shrink: 0;
      }

      /* Shared button styles — these are also used by the rest of the
         landing surface. In production we promote these to a shared
         landing-buttons.css module. */
      :global(.btn) {
        display: inline-flex; align-items: center; justify-content: center;
        gap: 10px; height: 52px; padding: 0 22px;
        border: 1.5px solid transparent; border-radius: var(--radius, 10px);
        font-family: var(--font-body); font-size: 15px; font-weight: 600;
        letter-spacing: -0.005em; white-space: nowrap;
        transition: transform 120ms, box-shadow 180ms, background-color 160ms, color 160ms, border-color 160ms;
        cursor: pointer;
      }
      :global(.btn:active) { transform: translateY(1px); }
      :global(.btn-xl) { height: 60px; padding: 0 28px; font-size: 16px; }
      :global(.btn-primary) {
        background: var(--primary); color: var(--primary-ink, #fff);
        border-color: var(--primary);
        box-shadow: 0 4px 14px color-mix(in oklab, var(--primary) 30%, transparent);
      }
      :global(.btn-primary:hover) {
        background: color-mix(in oklab, var(--primary) 82%, #000);
        border-color: color-mix(in oklab, var(--primary) 82%, #000);
      }
      :global(.btn-secondary) {
        background: var(--secondary); color: var(--secondary-ink, #fff);
        border-color: var(--secondary);
      }
      :global(.btn-secondary:hover) {
        background: color-mix(in oklab, var(--secondary) 90%, var(--text));
      }
      :global(.btn-pulse) { position: relative; isolation: isolate; }
      :global(.btn-pulse::after) {
        content: ''; position: absolute; inset: -3px;
        border-radius: calc(var(--radius, 10px) + 3px);
        border: 2px solid var(--primary);
        opacity: 0; z-index: -1;
        animation: sf-pulse 2.2s ease-out infinite;
      }
      @keyframes sf-pulse {
        0%   { transform: scale(0.96); opacity: 0.55; }
        70%  { transform: scale(1.06); opacity: 0; }
        100% { transform: scale(1.06); opacity: 0; }
      }
      @keyframes sf-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.35; }
      }
      @media (prefers-reduced-motion: reduce) {
        :global(.btn-pulse::after) { display: none; }
        .photo-badge-live :global(.dot),
        .badge-emergency :global(.dot) { animation: none; }
      }

      /* stubs */
      [data-stub], [data-todo] { color: color-mix(in oklab, var(--text) 50%, transparent); }
    `}</style>
  );
}
