// landing/sections/faq.tsx
//
// Uses the shadcn/ui Accordion wrapper at @/components/ui/accordion, which in
// this project wraps @base-ui/react (NOT @radix-ui/react-accordion).
//
// Base UI API differences vs. Radix:
//   • No `type="single"` / `collapsible` props — single-open is the default
//     (multiple=false). We don't pass `multiple` so only one opens at a time.
//   • `defaultValue` takes a string[] (array), not a single string.
//   • `AccordionItem value` works the same.
//
// We dress the trigger/content to match the bold-urgency / per-archetype tone
// via the CSS-var contract; the underlying Base UI accordion handles the height
// animation, keyboard nav, and ARIA wiring.

"use client";

import { Phone, ChevronDown } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ARCHETYPES, archetypeStyle, type AestheticArchetypeId } from "../archetypes";
import { Reveal } from "../_shared/motion";

export type FaqItem = {
  id?: string;
  question: string;
  answer: string;
};

export type FaqProps = {
  archetype: AestheticArchetypeId;
  eyebrow?: string;
  heading: string;
  intro?: string;
  items: FaqItem[];
  /** Optional closing block — for bold-urgency the default is a phone CTA. */
  cta?: {
    title: string;
    sub: string;
    label: string;
    href: string;
  };
  /** Slug of the item to expand by default. Defaults to the first item. */
  defaultOpenId?: string;
};

export function Faq({
  archetype,
  eyebrow = "Quick answers",
  heading,
  intro,
  items,
  cta,
  defaultOpenId,
}: FaqProps) {
  const arch = ARCHETYPES[archetype];
  const itemKey = (it: FaqItem, i: number) => it.id ?? `faq-${i}`;
  const initial = defaultOpenId ?? (items[0] ? itemKey(items[0], 0) : undefined);

  return (
    <section
      data-archetype={arch.id}
      style={archetypeStyle(arch.id)}
      className="sf-faq"
      id="faq"
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

        {/* Base UI defaultValue takes string[] not string */}
        <Accordion
          defaultValue={initial ? [initial] : undefined}
          className="faq-list"
        >
          {items.map((it, i) => (
            <AccordionItem
              key={itemKey(it, i)}
              value={itemKey(it, i)}
              className="faq-item"
            >
              <AccordionTrigger className="faq-trigger">
                <span className="q">{it.question}</span>
                <span className="chev" aria-hidden>
                  <ChevronDown size={14} strokeWidth={2.4} />
                </span>
              </AccordionTrigger>
              <AccordionContent className="faq-answer">
                {it.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {cta && (
          <div className="footer-cta">
            <div className="text">
              {cta.title}
              <small>{cta.sub}</small>
            </div>
            <a className="btn btn-primary" href={cta.href}>
              <Phone size={18} strokeWidth={2.4} aria-hidden />
              {cta.label}
            </a>
          </div>
        )}
      </div>

      <FaqStyles />
    </section>
  );
}

function FaqStyles() {
  return (
    <style jsx>{`
      .sf-faq {
        background: var(--bg);
        color: var(--text);
        font-family: var(--font-body);
        padding-top: 56px; padding-bottom: 56px;
      }
      @media (min-width: 768px) { .sf-faq { padding-top: 88px; padding-bottom: 88px; } }
      .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
      @media (min-width: 768px) { .container { padding: 0 32px; } }
      @media (min-width: 1024px) { .container { padding: 0 48px; } }

      .head {
        display: grid; grid-template-columns: 1fr;
        gap: 20px; align-items: end; margin-bottom: 36px;
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
        letter-spacing: -0.022em; line-height: 1.02;
      }
      .lede {
        margin: 0;
        font-size: 16px;
        color: color-mix(in oklab, var(--text) 70%, transparent);
      }

      .faq-list {
        display: flex; flex-direction: column; gap: 10px;
        max-width: 880px;
      }

      :global(.faq-item) {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius, 10px);
        overflow: hidden;
        transition: border-color 180ms, box-shadow 180ms, background 180ms;
      }
      :global(.faq-item[data-state="open"]) {
        border-color: var(--primary);
        background: var(--bg);
        box-shadow: 0 2px 12px color-mix(in oklab, var(--text) 6%, transparent);
      }

      :global(.faq-trigger) {
        all: unset;
        list-style: none;
        cursor: pointer;
        padding: 18px 20px;
        display: flex; align-items: center; justify-content: space-between;
        gap: 16px;
        font-weight: 600; font-size: 16px;
        letter-spacing: -0.01em;
        color: var(--text);
        width: 100%;
      }
      :global(.faq-trigger .chev) {
        display: inline-flex; align-items: center; justify-content: center;
        width: 28px; height: 28px;
        border-radius: 999px;
        background: var(--bg);
        border: 1px solid var(--border);
        color: var(--text); flex-shrink: 0;
        transition: transform 220ms ease, background 180ms, color 180ms, border-color 180ms;
      }
      :global(.faq-item[data-state="open"] .faq-trigger .chev) {
        transform: rotate(180deg);
        background: var(--primary);
        color: var(--primary-ink, #fff);
        border-color: var(--primary);
      }

      :global(.faq-answer) {
        padding: 0 20px 20px;
        color: color-mix(in oklab, var(--text) 70%, transparent);
        font-size: 15px;
        line-height: 1.6;
        max-width: 760px;
      }

      .footer-cta {
        margin-top: 36px;
        padding: 22px 24px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg, 14px);
        display: flex; flex-direction: column; gap: 14px;
        align-items: flex-start;
      }
      @media (min-width: 640px) {
        .footer-cta { flex-direction: row; align-items: center; justify-content: space-between; }
      }
      .footer-cta .text { font-weight: 600; font-size: 16px; }
      .footer-cta .text small {
        display: block; font-weight: 500;
        color: color-mix(in oklab, var(--text) 60%, transparent);
        margin-top: 3px; font-size: 13.5px;
      }
    `}</style>
  );
}
