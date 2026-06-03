"use client";

import { useState } from "react";
import type { CTAs, Soul } from "../_contract/types";
import { Icon } from "./icons";

// ── Sticky nav with mobile sheet ───────────────────────────────────────────
export function Nav({ data, ctas }: { data: Soul; ctas: CTAs }) {
  const [open, setOpen] = useState(false);
  const links: [string, string][] = [
    ["About", "#about"],
    ["Treatments", "#services"],
    ["Reviews", "#reviews"],
    ["Contact", "#contact"],
  ];
  return (
    <header className="sf4-nav" id="top">
      <div className="sf4-wrap sf4-nav-in">
        <a className="sf4-brand" href="#top" aria-label={data.business_name}>
          <Icon.mark className="sf4-brand-mark" /><span className="sf4-brand-name">{data.business_name}</span>
        </a>
        <nav className="sf4-nav-links" aria-label="Primary">{links.map(([l, h]) => (<a key={l} href={h}>{l}</a>))}</nav>
        <div className="sf4-nav-cta">
          {ctas.callHref && data.phone && <a className="sf4-link-call" href={ctas.callHref}><Icon.phone /> {data.phone}</a>}
          <a className="sf4-btn sf4-btn-primary" href={ctas.bookUrl}>Book a Session</a>
          <button className="sf4-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(true)}><Icon.menu /></button>
        </div>
      </div>
      <div className={"sf4-sheet" + (open ? " is-open" : "")} role="dialog" aria-modal="true" aria-hidden={!open}>
        <div className="sf4-sheet-top sf4-wrap">
          <span className="sf4-brand"><Icon.mark className="sf4-brand-mark" /><span className="sf4-brand-name">{data.business_name}</span></span>
          <button className="sf4-burger" aria-label="Close menu" onClick={() => setOpen(false)}><Icon.close /></button>
        </div>
        <nav className="sf4-sheet-links" aria-label="Mobile">{links.map(([l, h]) => (<a key={l} href={h} onClick={() => setOpen(false)}>{l}</a>))}</nav>
        <div className="sf4-sheet-foot">
          <a className="sf4-btn sf4-btn-primary sf4-btn-block" href={ctas.bookUrl} onClick={() => setOpen(false)}>Book a Session</a>
          {ctas.callHref && data.phone && <a className="sf4-btn sf4-btn-outline sf4-btn-block" href={ctas.callHref}><Icon.phone /> {data.phone}</a>}
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
    <section className="sf4-sec sf4-wrap" id="faq">
      <div className="sf4-faq-in">
        <div><p className="sf4-eyebrow">Good to know</p><h2 className="sf4-h2">Before you <em>book</em></h2></div>
        <div className="sf4-faq-list">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div className={"sf4-faq-item" + (isOpen ? " is-open" : "")} key={i}>
                <button className="sf4-faq-q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? -1 : i)}>
                  <span>{f.q}</span><Icon.chevron className="sf4-faq-chev" />
                </button>
                <div className="sf4-faq-a" role="region"><p>{f.a}</p></div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
