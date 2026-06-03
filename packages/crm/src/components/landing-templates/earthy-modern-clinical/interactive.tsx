"use client";

import { useState } from "react";
import type { CTAs, Soul } from "../_contract/types";
import { Icon } from "./icons";

// ── Sticky nav with mobile sheet ───────────────────────────────────────────
export function Nav({ data, ctas }: { data: Soul; ctas: CTAs }) {
  const [open, setOpen] = useState(false);
  const links: [string, string][] = [
    ["About", "#about"],
    ["Services", "#services"],
    ["Reviews", "#reviews"],
    ["Contact", "#contact"],
  ];
  return (
    <header className="sf5-nav" id="top">
      <div className="sf5-wrap sf5-nav-in">
        <a className="sf5-brand" href="#top" aria-label={data.business_name}>
          <Icon.mark className="sf5-brand-mark" />
          <span>{data.business_name}</span>
        </a>
        <nav className="sf5-nav-links" aria-label="Primary">
          {links.map(([l, h]) => (<a key={l} href={h}>{l}</a>))}
        </nav>
        <div className="sf5-nav-cta">
          {ctas.callHref && data.phone && (
            <a className="sf5-link-call" href={ctas.callHref}><Icon.phone /> <span>{data.phone}</span></a>
          )}
          <a className="sf5-btn sf5-btn-primary" href={ctas.bookUrl}>Book a Session</a>
          <button className="sf5-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(true)}><Icon.menu /></button>
        </div>
      </div>
      <div className={"sf5-sheet" + (open ? " is-open" : "")} role="dialog" aria-modal="true" aria-hidden={!open}>
        <div className="sf5-sheet-top sf5-wrap">
          <span className="sf5-brand"><Icon.mark className="sf5-brand-mark" />{data.business_name}</span>
          <button className="sf5-burger" aria-label="Close menu" onClick={() => setOpen(false)}><Icon.close /></button>
        </div>
        <nav className="sf5-sheet-links" aria-label="Mobile">
          {links.map(([l, h]) => (<a key={l} href={h} onClick={() => setOpen(false)}>{l}</a>))}
        </nav>
        <div className="sf5-sheet-foot">
          <a className="sf5-btn sf5-btn-primary sf5-btn-block" href={ctas.bookUrl} onClick={() => setOpen(false)}>Book a Session</a>
          {ctas.callHref && data.phone && (
            <a className="sf5-btn sf5-btn-ghost sf5-btn-block" href={ctas.callHref}><Icon.phone /> {data.phone}</a>
          )}
        </div>
      </div>
    </header>
  );
}

// ── FAQ accordion ──────────────────────────────────────────────────────────
export function Faq({ data }: { data: Soul }) {
  const faqs = data.faqs || [];
  const [open, setOpen] = useState(0);
  if (!faqs.length) return null;
  return (
    <section className="sf5-faq" id="faq">
      <div className="sf5-wrap sf5-faq-in">
        <div className="sf5-faq-aside">
          <p className="sf5-eyebrow">Good to know</p>
          <h2 className="sf5-h2">Questions,<br />answered</h2>
        </div>
        <div className="sf5-faq-list">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div className={"sf5-faq-item" + (isOpen ? " is-open" : "")} key={i}>
                <button className="sf5-faq-q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? -1 : i)}>
                  <span>{f.q}</span><Icon.chevron className="sf5-faq-chev" />
                </button>
                <div className="sf5-faq-a" role="region"><p>{f.a}</p></div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
