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
    <header className="sf1-nav" id="top">
      <div className="sf1-wrap sf1-nav-in">
        <a className="sf1-brand" href="#top" aria-label={data.business_name}>
          <Icon.mark className="sf1-brand-mark" /><span className="sf1-brand-name">{data.business_name}</span>
        </a>
        <nav className="sf1-nav-links" aria-label="Primary">{links.map(([l, h]) => (<a key={l} href={h}>{l}</a>))}</nav>
        <div className="sf1-nav-cta">
          {ctas.callHref && data.phone && <a className="sf1-link-call" href={ctas.callHref}><Icon.phone /> {data.phone}</a>}
          <a className="sf1-btn sf1-btn-primary" href={ctas.bookUrl}>Book Now</a>
          <button className="sf1-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(true)}><Icon.menu /></button>
        </div>
      </div>
      <div className={"sf1-sheet" + (open ? " is-open" : "")} role="dialog" aria-modal="true" aria-hidden={!open}>
        <div className="sf1-sheet-top sf1-wrap">
          <span className="sf1-brand"><Icon.mark className="sf1-brand-mark" /><span className="sf1-brand-name">{data.business_name}</span></span>
          <button className="sf1-burger" aria-label="Close menu" onClick={() => setOpen(false)}><Icon.close /></button>
        </div>
        <nav className="sf1-sheet-links" aria-label="Mobile">{links.map(([l, h]) => (<a key={l} href={h} onClick={() => setOpen(false)}>{l}</a>))}</nav>
        <div className="sf1-sheet-foot">
          <a className="sf1-btn sf1-btn-primary sf1-btn-block" href={ctas.bookUrl} onClick={() => setOpen(false)}>Book Now</a>
          {ctas.callHref && data.phone && <a className="sf1-btn sf1-btn-outline sf1-btn-block" href={ctas.callHref}><Icon.phone /> {data.phone}</a>}
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
    <section className="sf1-sec sf1-wrap" id="faq">
      <div className="sf1-faq-in">
        <div><p className="sf1-eyebrow">Good to know</p><h2 className="sf1-h2">Questions, answered</h2></div>
        <div className="sf1-faq-list">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div className={"sf1-faq-item" + (isOpen ? " is-open" : "")} key={i}>
                <button className="sf1-faq-q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? -1 : i)}>
                  <span>{f.q}</span><Icon.chevron className="sf1-faq-chev" />
                </button>
                <div className="sf1-faq-a" role="region"><p>{f.a}</p></div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
