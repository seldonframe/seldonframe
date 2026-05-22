// landing/sections/testimonials.tsx
//
// Rotating testimonial ticker. Auto-advances every 6s; pauses when the user
// hovers a card or interacts with the dots. Reduced-motion users get a
// static stack and the dots become page-jump anchors instead.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ARCHETYPES, archetypeStyle, type AestheticArchetypeId } from "../archetypes";
import { Reveal, CountUp } from "../_shared/motion";
import { Stars } from "../_shared/stars";

export type Testimonial = {
  id?: string;
  quote: string;
  /** "Sarah K." */
  name: string;
  /** "Roseville, CA" — optional. */
  city?: string;
  rating?: number;
  /** "AC repair", "Furnace install" — shown as a chip on the right. */
  service?: string;
  /** Reserved Phase R.2 — optional photo overrides the initial avatar. */
  photo?: { src: string; alt: string };
};

export type TestimonialsProps = {
  archetype: AestheticArchetypeId;
  eyebrow?: string;
  heading: string;
  /** 3-8 items. Renders all; auto-rotates one visible at a time. */
  testimonials: Testimonial[];
  /** Summary card next to the heading. */
  reviewSummary?: {
    rating: number;
    count: number;
    /** Comma-separated sources — "Google · Yelp · BBB". */
    sources?: string;
  };
  /**
   * How long each card stays visible. When omitted, defaults to 6000ms
   * (or 8000ms for archetypes with motionPreset "editorial" — derived
   * automatically from the registry).
   */
  intervalMs?: number;
};

const DEFAULT_INTERVAL = 6000;
const EDITORIAL_INTERVAL = 8000; // editorial-warm / cinematic-aspirational lean slow

export function Testimonials({
  archetype,
  eyebrow = "What neighbors say",
  heading,
  testimonials,
  reviewSummary,
  intervalMs,
}: TestimonialsProps) {
  const arch = ARCHETYPES[archetype];
  const reduce = useReducedMotion();
  // If the caller didn't provide an explicit interval, derive it from the
  // archetype's motionPreset. "editorial" = slower (8s); everything else 6s.
  const resolvedInterval = intervalMs ??
    (arch.motionPreset === "editorial" ? EDITORIAL_INTERVAL : DEFAULT_INTERVAL);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const tref = useRef<number | null>(null);

  const advance = useCallback(() => {
    setCurrent((c) => (c + 1) % Math.max(1, testimonials.length));
  }, [testimonials.length]);

  useEffect(() => {
    if (reduce || paused || testimonials.length < 2) return;
    tref.current = window.setInterval(advance, resolvedInterval);
    return () => {
      if (tref.current != null) window.clearInterval(tref.current);
    };
  }, [advance, resolvedInterval, reduce, paused, testimonials.length]);

  return (
    <section
      data-archetype={arch.id}
      style={archetypeStyle(arch.id)}
      className="sf-testimonials"
      id="testimonials"
    >
      <div className="container">
        <div className="head">
          <Reveal>
            <div>
              <span className="eyebrow">{eyebrow}</span>
              <h2>{heading}</h2>
            </div>
          </Reveal>
          {reviewSummary && (
            <Reveal delay={0.08}>
              <div className="summary-card">
                <div className="row1">
                  <div className="rating">
                    <CountUp value={reviewSummary.rating} decimals={1} />
                  </div>
                  <div className="stack">
                    <Stars value={reviewSummary.rating} size={14} />
                    <small>
                      on <CountUp value={reviewSummary.count} /> verified reviews
                    </small>
                  </div>
                </div>
                {reviewSummary.sources && <span className="src">{reviewSummary.sources}</span>}
              </div>
            </Reveal>
          )}
        </div>

        <div
          className="tx-viewport"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
          aria-live="polite"
        >
          {testimonials.map((t, i) => (
            <article
              key={t.id ?? `${t.name}-${i}`}
              className={`tx-card${i === current ? " is-active" : ""}`}
              aria-hidden={i !== current}
            >
              {t.rating != null && <Stars value={t.rating} size={14} />}
              <blockquote>{t.quote}</blockquote>
              <div className="who">
                <span className="avatar" aria-hidden>
                  {initials(t.name)}
                </span>
                <div>
                  <div className="name">{t.name}</div>
                  {t.city && <div className="loc">{t.city}</div>}
                </div>
                {t.service && <span className="tag">{t.service}</span>}
              </div>
            </article>
          ))}
        </div>

        {testimonials.length > 1 && (
          <div className="tx-dots" role="tablist" aria-label="Testimonial controls">
            {testimonials.map((_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === current}
                aria-label={`Show testimonial ${i + 1}`}
                className={i === current ? "is-active" : undefined}
                onClick={() => setCurrent(i)}
              />
            ))}
          </div>
        )}
      </div>

      <TestimonialsStyles />
    </section>
  );
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("");
}

function TestimonialsStyles() {
  return (
    // global: see faq.tsx for the rationale — styled-jsx scope is per-function,
    // so styles in this dedicated *Styles helper would otherwise apply to
    // nothing.
    <style jsx global>{`
      .sf-testimonials {
        background: var(--surface);
        color: var(--text);
        font-family: var(--font-body);
        border-top: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
        padding-top: 56px; padding-bottom: 56px;
      }
      @media (min-width: 768px) { .sf-testimonials { padding-top: 88px; padding-bottom: 88px; } }
      .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
      @media (min-width: 768px) { .container { padding: 0 32px; } }
      @media (min-width: 1024px) { .container { padding: 0 48px; } }

      .head {
        display: grid; grid-template-columns: 1fr; gap: 22px;
        align-items: end; margin-bottom: 36px;
      }
      @media (min-width: 768px) { .head { grid-template-columns: 1.4fr 1fr; } }

      .eyebrow {
        font-size: 11.5px; font-weight: 600;
        letter-spacing: 0.14em; text-transform: uppercase;
        color: var(--primary);
      }
      h2 {
        margin: 12px 0 0;
        font-family: var(--font-headline);
        font-weight: 800;
        font-size: clamp(32px, 4.4vw, 46px);
        letter-spacing: -0.022em;
        line-height: 1.02;
      }

      .summary-card {
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg, 14px);
        padding: 18px 20px;
        box-shadow: 0 2px 12px color-mix(in oklab, var(--text) 6%, transparent);
      }
      .summary-card .row1 { display: flex; align-items: center; gap: 14px; }
      .summary-card .rating {
        font-family: var(--font-headline);
        font-weight: 800; font-size: 40px;
        line-height: 1; letter-spacing: -0.025em;
        color: var(--text);
      }
      .summary-card .stack { display: flex; flex-direction: column; gap: 3px; }
      .summary-card small {
        font-size: 12.5px;
        color: color-mix(in oklab, var(--text) 60%, transparent);
        font-weight: 500;
      }
      .summary-card .src {
        margin-top: 12px;
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 10px;
        background: var(--surface-deep);
        border-radius: 999px;
        font-size: 11px; font-weight: 600;
        letter-spacing: 0.04em; text-transform: uppercase;
        color: color-mix(in oklab, var(--text) 65%, transparent);
      }

      .tx-viewport { position: relative; min-height: 280px; }
      .tx-card {
        position: absolute; inset: 0;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg, 14px);
        padding: 28px;
        display: flex; flex-direction: column; gap: 18px;
        box-shadow: 0 2px 12px color-mix(in oklab, var(--text) 6%, transparent);
        opacity: 0; transform: translateY(8px); pointer-events: none;
        transition: opacity 360ms ease, transform 360ms ease;
      }
      .tx-card.is-active { opacity: 1; transform: translateY(0); pointer-events: auto; }
      @media (min-width: 768px) { .tx-card { padding: 32px; } }

      .tx-card blockquote {
        margin: 0;
        font-family: var(--font-headline);
        font-weight: 600;
        font-size: clamp(18px, 1.9vw, 22px);
        letter-spacing: -0.015em;
        color: var(--text);
        line-height: 1.35;
        text-wrap: pretty;
      }
      .tx-card blockquote::before { content: '“'; color: var(--primary); margin-right: 2px; }
      .tx-card blockquote::after  { content: '”'; color: var(--primary); margin-left: 2px; }

      .tx-card .who {
        display: flex; align-items: center; gap: 12px;
        margin-top: auto;
      }
      .tx-card .avatar {
        width: 40px; height: 40px;
        border-radius: 50%;
        background: var(--primary); color: var(--primary-ink, #fff);
        display: inline-flex; align-items: center; justify-content: center;
        font-family: var(--font-headline);
        font-weight: 800; font-size: 15px;
      }
      .tx-card .who .name { font-weight: 600; font-size: 14.5px; }
      .tx-card .who .loc {
        font-size: 12.5px;
        color: color-mix(in oklab, var(--text) 55%, transparent);
      }
      .tx-card .tag {
        margin-left: auto;
        padding: 4px 10px;
        background: var(--surface-deep);
        border-radius: 999px;
        font-size: 11px; font-weight: 600;
        letter-spacing: 0.04em; text-transform: uppercase;
        color: color-mix(in oklab, var(--text) 65%, transparent);
      }

      .tx-dots {
        display: flex; justify-content: center; gap: 8px;
        margin-top: 22px;
      }
      .tx-dots button {
        width: 28px; height: 4px;
        border: 0; background: var(--border);
        border-radius: 2px; padding: 0;
        cursor: pointer;
        transition: background 180ms, width 180ms;
      }
      .tx-dots button.is-active { background: var(--primary); width: 40px; }

      @media (prefers-reduced-motion: reduce) {
        .tx-card { transition: none; }
      }
    `}</style>
  );
}
