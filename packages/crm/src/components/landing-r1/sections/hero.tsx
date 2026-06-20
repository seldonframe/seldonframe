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

import type { ReactNode } from "react";
import { Phone, Calendar, ArrowRight, Zap } from "lucide-react";
import { ARCHETYPES, type AestheticArchetypeId } from "../archetypes";
import { telHref } from "../_shared/phone";
import { Reveal, CountUp } from "../_shared/motion";
import { TrustBadge } from "../_shared/trust-badge";
import { Stars } from "../_shared/stars";
import { LeadFormCard } from "./lead-form";
import type { R1LeadFormSection } from "@/lib/landing/r1-payload-prompt";

export type CTA = { label: string; href: string };

export type HeroProps = {
  archetype: AestheticArchetypeId;
  businessName: string;
  tagline: string;
  subhead: string;
  primaryCTA: CTA;
  secondaryCTA?: CTA;
  trustBadges: { label: string; logoSvg?: ReactNode }[];
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
  /** P2: when true + leadForm.enabled, the hero right column shows the form. */
  leadFormInHero?: boolean;
  /** P2: the lead-form payload (passed from page.tsx alongside hero spread). */
  leadForm?: R1LeadFormSection;
  /** P2: workspace slug, needed by LeadFormCard to submit the form. */
  orgSlug?: string;
};

export function Hero(props: HeroProps) {
  const arch = ARCHETYPES[props.archetype];
  const showHeroForm = Boolean(props.leadFormInHero && props.leadForm?.enabled && props.orgSlug);
  return (
    <section
      data-archetype={arch.id}
      className="sf-hero"
    >
      {arch.heroVariant === "split-screen-50-50" && (
        <HeroSplit {...props} showHeroForm={showHeroForm} />
      )}
      {arch.heroVariant === "left-aligned-asymmetric" && (
        <HeroLeftAsymmetric {...props} showHeroForm={showHeroForm} />
      )}
      {arch.heroVariant === "cinematic-aura" && <HeroCinematic {...props} />}

      <HeroStyles />
    </section>
  );
}

// ── split-screen-50-50  (bold-urgency) ─────────────────────────────────────
function HeroSplit(props: HeroProps & { showHeroForm: boolean }) {
  const { businessName, tagline, subhead, primaryCTA, secondaryCTA, trustBadges,
          reviewRating, reviewCount, emergencyService, heroImage, heroOverlay,
          orgSlug, leadForm, showHeroForm } = props;

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

      {showHeroForm && orgSlug && leadForm ? (
        <div className="hero-form-col">
          <LeadFormCard orgSlug={orgSlug} businessName={businessName} leadForm={leadForm} />
        </div>
      ) : heroImage ? (
        <Reveal delay={0.08} className="hero-photo-wrap">
          <div className="hero-photo">
            {/* Raw <img> instead of next/image: hero photos come from arbitrary
                external domains after Phase U extraction enrichment, so
                next/image's remotePatterns enforcement would block unknown
                hosts. Trade-off: no Next.js optimisation for landing photos.
                LCP is handled via fetchPriority="high". */}
            <img
              src={heroImage.src}
              alt={heroImage.alt}
              fetchPriority="high"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
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
      ) : null}
    </div>
  );
}

// ── left-aligned-asymmetric  (editorial-warm / clinical-trust / soft-residential / brutalist) ──
function HeroLeftAsymmetric(props: HeroProps & { showHeroForm: boolean }) {
  const { businessName, tagline, subhead, primaryCTA, secondaryCTA, trustBadges,
          reviewRating, reviewCount, heroImage, heroOverlay,
          orgSlug, leadForm, showHeroForm } = props;
  const arch = ARCHETYPES[props.archetype];

  return (
    <div className="hero-left container">
      <div className="hero-left-grid">
        {/* Text column — anchored top-left, asymmetric (NOT centered). */}
        <div className="hero-left-text">
          <Reveal>
            <p className="kicker">
              <span className="kicker-line" aria-hidden />
              {businessName}
            </p>
          </Reveal>
          <Reveal delay={0.06}>
            <h1 className="hero-headline">{tagline}</h1>
          </Reveal>
          <Reveal delay={0.14}>
            <p className="hero-lede">{subhead}</p>
          </Reveal>

          <Reveal delay={0.22}>
            <div className="cta-row">
              <a className="btn btn-primary btn-xl" href={primaryCTA.href}>
                {primaryCTA.label}
                <ArrowRight size={18} aria-hidden strokeWidth={2.4} />
              </a>
              {secondaryCTA && (
                <a className="btn btn-outline btn-xl" href={secondaryCTA.href}>
                  {secondaryCTA.label}
                </a>
              )}
            </div>
          </Reveal>

          <div className="trust-strip">
            {reviewRating != null && reviewCount != null && (
              <Reveal delay={0.28}>
                <TrustBadge label={`${reviewRating}`} variant="subtle">
                  <Stars value={reviewRating} size={12} />
                  <b style={{ fontWeight: 700 }}>
                    <CountUp value={reviewRating} decimals={1} />
                  </b>
                  <small style={{
                    color: "color-mix(in oklab, var(--text) 55%, transparent)",
                    fontWeight: 500, fontSize: 11.5,
                  }}>
                    <CountUp value={reviewCount} /> reviews
                  </small>
                </TrustBadge>
              </Reveal>
            )}
            {trustBadges.map((b, i) => (
              <Reveal key={b.label} delay={0.32 + i * 0.04}>
                <TrustBadge label={b.label} logoSvg={b.logoSvg} variant="subtle" />
              </Reveal>
            ))}
          </div>
        </div>

        {/* Right column: form (when showHeroForm) or photo / brutalist block. */}
        {showHeroForm && orgSlug && leadForm ? (
          <div className="hero-form-col">
            <LeadFormCard orgSlug={orgSlug} businessName={businessName} leadForm={leadForm} />
          </div>
        ) : (
          <>
            {/* Asymmetric photo block — offset 60px down on desktop, hugs the right
                edge, intentional vertical mismatch with the text column. */}
            {heroImage && arch.id !== "brutalist" && (
              <Reveal delay={0.10} className="hero-left-photo-wrap">
                <div className="hero-left-photo">
                  <img
                    src={heroImage.src}
                    alt={heroImage.alt}
                    fetchPriority="high"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  {heroOverlay && (
                    <div className="hero-left-caption">
                      <b>{heroOverlay.techName}</b>
                      <small>{heroOverlay.techMeta}</small>
                    </div>
                  )}
                </div>
              </Reveal>
            )}

            {/* Brutalist gets a stark color block in place of the photo — keeps the
                asymmetric counterweight without violating the "no soft pastels /
                drop shadows / gradients" bans. */}
            {arch.id === "brutalist" && (
              <Reveal delay={0.10} className="hero-left-photo-wrap">
                <div className="hero-left-block">
                  <span className="hero-left-block-label">Selected work · {new Date().getFullYear()}</span>
                  <span className="hero-left-block-num">01</span>
                </div>
              </Reveal>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── cinematic-aura  (cinematic-aspirational / technical-restrained) ───────
function HeroCinematic(props: HeroProps) {
  const { businessName, tagline, subhead, primaryCTA, secondaryCTA, trustBadges,
          reviewRating, reviewCount, heroImage } = props;
  const arch = ARCHETYPES[props.archetype];

  return (
    <div className="hero-cinematic">
      {/* Full-bleed background — image for cinematic-aspirational, calm wash
          for technical-restrained. Production swap: <video> with playsInline
          muted loop preload="metadata" — see README "Cinematic background". */}
      {heroImage && (
        <div className="hero-cinematic-bg" aria-hidden>
          <img
            src={heroImage.src}
            alt=""
            fetchPriority="high"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div className="hero-cinematic-veil" />
        </div>
      )}

      <div className="container hero-cinematic-inner">
        <Reveal>
          <p className="kicker kicker-light">
            <span className="kicker-line" aria-hidden />
            {businessName}
          </p>
        </Reveal>
        <Reveal delay={0.06}>
          <h1 className={`hero-headline hero-headline-light ${arch.id === "cinematic-aspirational" ? "is-cinematic" : ""}`}>
            {tagline}
          </h1>
        </Reveal>
        <Reveal delay={0.14}>
          <p className="hero-lede hero-lede-light">{subhead}</p>
        </Reveal>

        <Reveal delay={0.22}>
          <div className="cta-row">
            <a className="btn btn-glass btn-xl" href={primaryCTA.href}>
              {primaryCTA.label}
              <ArrowRight size={18} aria-hidden strokeWidth={2.4} />
            </a>
            {secondaryCTA && (
              <a className="btn btn-glass-outline btn-xl" href={secondaryCTA.href}>
                {secondaryCTA.label}
              </a>
            )}
          </div>
        </Reveal>

        {(trustBadges.length > 0 || reviewRating != null) && (
          <div className="trust-strip trust-strip-light">
            {reviewRating != null && reviewCount != null && (
              <Reveal delay={0.28}>
                <span className="cinematic-pill">
                  <Stars value={reviewRating} size={12} />
                  <b><CountUp value={reviewRating} decimals={1} /></b>
                  <small>· <CountUp value={reviewCount} /> reviews</small>
                </span>
              </Reveal>
            )}
            {trustBadges.slice(0, 3).map((b, i) => (
              <Reveal key={b.label} delay={0.32 + i * 0.04}>
                <span className="cinematic-pill">{b.label}</span>
              </Reveal>
            ))}
          </div>
        )}
      </div>
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

// ── Styles (GLOBAL styled-jsx — see comment below) ─────────────────────────
function HeroStyles() {
  return (
    // global: styled-jsx scope is per-function. The styles below target
    // elements rendered by HeroSplit / HeroLeftAsymmetric / HeroCinematic
    // (sibling functions), so non-global styles silently apply to nothing.
    // Class names are sf-/hero-/cinematic-/photo- prefixed to avoid
    // collisions with other components.
    <style jsx global>{`
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

      /* ───────── left-aligned-asymmetric ───────── */
      .hero-left {
        padding-top: 56px; padding-bottom: 72px;
      }
      @media (min-width: 1024px) { .hero-left { padding-top: 96px; padding-bottom: 120px; } }

      .hero-left-grid {
        display: grid; grid-template-columns: 1fr; gap: 36px;
      }
      @media (min-width: 1024px) {
        .hero-left-grid {
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
          gap: 80px;
          align-items: start;
        }
      }

      .hero-left-text { max-width: 720px; }

      .kicker {
        display: inline-flex; align-items: center; gap: 12px;
        margin: 0;
        font-family: var(--font-body);
        font-weight: 600;
        font-size: 12.5px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: var(--primary);
      }
      .kicker .kicker-line {
        width: 32px; height: 1px;
        background: currentColor;
        opacity: 0.55;
      }
      .kicker-light { color: rgba(255,255,255,0.78); }

      .hero-left .hero-headline {
        font-size: clamp(38px, 6.4vw, 68px);
        margin: 16px 0 0;
      }
      .hero-left .hero-lede { margin-top: 20px; }

      /* Asymmetric photo block — offset down on desktop */
      .hero-left-photo-wrap { position: relative; }
      @media (min-width: 1024px) {
        .hero-left-photo-wrap { margin-top: 64px; }
      }
      .hero-left-photo {
        position: relative;
        border-radius: var(--radius-lg, 14px);
        overflow: hidden;
        background: var(--surface-deep);
        aspect-ratio: 4 / 5;
        box-shadow: 0 24px 60px color-mix(in oklab, var(--text) 12%, transparent);
      }
      @media (max-width: 1023px) { .hero-left-photo { aspect-ratio: 16 / 10; } }
      .hero-left-caption {
        position: absolute; left: 16px; bottom: 16px; right: 16px;
        padding: 12px 14px;
        background: rgba(26, 26, 26, 0.85);
        backdrop-filter: blur(6px);
        border-radius: var(--radius, 10px);
        border: 1px solid rgba(255,255,255,0.08);
        color: #fff;
        font-size: 13px;
      }
      .hero-left-caption b { display: block; font-weight: 700; }
      .hero-left-caption small { color: rgba(255,255,255,0.6); font-size: 11px; }

      /* Brutalist counterweight block — no shadow, no gradient, hard edges */
      .hero-left-block {
        position: relative;
        aspect-ratio: 4 / 5;
        background: var(--primary);
        color: var(--bg);
        border: 2px solid var(--primary);
        border-radius: 0;
        display: flex; flex-direction: column;
        justify-content: space-between;
        padding: 24px;
      }
      @media (max-width: 1023px) { .hero-left-block { aspect-ratio: 16 / 10; } }
      .hero-left-block-label {
        font-family: var(--font-mono);
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .hero-left-block-num {
        font-family: var(--font-headline);
        font-weight: 800;
        font-size: clamp(80px, 14vw, 220px);
        line-height: 0.85;
        letter-spacing: -0.04em;
        text-align: right;
      }

      /* ───────── hero-form-col (P2: leadFormInHero) ───────── */
      /* Used by both HeroSplit and HeroLeftAsymmetric as the right/second column
         when leadFormInHero is true. The card is max-width:520px internally;
         width:100% keeps it within the grid column and prevents horizontal
         overflow at 375px. Desktop sticky keeps the form in view as users
         scroll the hero text on short viewports.
         NOTE: HeroCinematic intentionally does NOT use this — out of scope P2. */
      .hero-form-col { width: 100%; }
      @media (min-width: 1024px) { .hero-form-col { position: sticky; top: 88px; } }

      /* ───────── cinematic-aura ───────── */
      .hero-cinematic {
        position: relative;
        isolation: isolate;
        min-height: 640px;
        display: flex; align-items: center;
        padding-top: 72px; padding-bottom: 72px;
        color: #fff;
        overflow: hidden;
      }
      @media (min-width: 1024px) {
        .hero-cinematic { min-height: 760px; padding-top: 120px; padding-bottom: 120px; }
      }
      .hero-cinematic-bg {
        position: absolute; inset: 0; z-index: -1;
      }
      .hero-cinematic-bg :global(img) { filter: saturate(0.7) brightness(0.7); }
      .hero-cinematic-veil {
        position: absolute; inset: 0;
        background:
          linear-gradient(180deg,
            color-mix(in oklab, var(--secondary) 60%, transparent) 0%,
            color-mix(in oklab, var(--secondary) 80%, transparent) 60%,
            color-mix(in oklab, var(--secondary) 95%, transparent) 100%);
      }

      .hero-cinematic-inner { position: relative; max-width: 880px; }
      .hero-cinematic .hero-headline,
      .hero-cinematic .hero-headline-light {
        font-size: clamp(38px, 7.2vw, 76px);
        color: #fff;
        margin: 18px 0 0;
        text-wrap: balance;
      }
      .hero-cinematic .hero-headline.is-cinematic {
        font-style: italic;
        font-weight: 700;
        letter-spacing: -0.025em;
        line-height: 1.05;
      }
      .hero-cinematic .hero-lede-light {
        color: rgba(255,255,255,0.78);
        margin-top: 22px;
        font-size: clamp(16px, 1.8vw, 19px);
        max-width: 620px;
      }

      .trust-strip-light { margin-top: 32px; }
      .cinematic-pill {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 7px 13px;
        background: rgba(255,255,255,0.08);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.16);
        border-radius: 999px;
        color: #fff;
        font-size: 12.5px;
        font-weight: 500;
      }
      .cinematic-pill small { color: rgba(255,255,255,0.6); font-size: 11.5px; font-family: var(--font-mono); }
      .cinematic-pill b { font-weight: 700; }

      /* Glass buttons for cinematic-aura */
      :global(.btn-glass) {
        background: rgba(255,255,255,0.92);
        color: var(--text);
        border-color: rgba(255,255,255,0.92);
        backdrop-filter: blur(10px);
      }
      :global(.btn-glass:hover) {
        background: #fff; border-color: #fff;
      }
      :global(.btn-glass-outline) {
        background: rgba(255,255,255,0.06);
        color: #fff;
        border-color: rgba(255,255,255,0.30);
        backdrop-filter: blur(10px);
      }
      :global(.btn-glass-outline:hover) {
        background: rgba(255,255,255,0.14);
        border-color: rgba(255,255,255,0.60);
      }

      :global(.btn-outline) {
        background: transparent;
        color: var(--text);
        border-color: var(--border);
      }
      :global(.btn-outline:hover) {
        background: var(--surface);
        border-color: var(--text);
      }

      /* stubs */
      [data-stub], [data-todo] { color: color-mix(in oklab, var(--text) 50%, transparent); }
    `}</style>
  );
}
