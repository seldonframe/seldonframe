"use client";

import { useState } from "react";
import type { CTAs, Soul } from "../_contract/types";
import { Icon } from "./icons";

// ── Sticky nav with mobile sheet ───────────────────────────────────────────
export function Nav({ data, ctas }: { data: Soul; ctas: CTAs }) {
  const [open, setOpen] = useState(false);
  const links: [string, string][] = [
    ["Sanctuary", "#about"],
    ["Rituals", "#services"],
    ["Gallery", "#gallery"],
    ["Contact", "#contact"],
  ];
  return (
    <header className="sf3-nav" id="top">
      <div className="sf3-wrap sf3-nav-in">
        <a className="sf3-brand" href="#top" aria-label={data.business_name}>
          <Icon.leaf className="sf3-brand-mark" /><span className="sf3-brand-name">{data.business_name}</span>
        </a>
        <nav className="sf3-nav-links" aria-label="Primary">{links.map(([l, h]) => (<a key={l} href={h}>{l}</a>))}</nav>
        <div className="sf3-nav-cta">
          {ctas.callHref && data.phone && <a className="sf3-link-call" href={ctas.callHref}>{data.phone}</a>}
          <a className="sf3-btn sf3-btn-solid" href={ctas.bookUrl}>Reserve</a>
          <button className="sf3-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(true)}><Icon.menu /></button>
        </div>
      </div>
      <div className={"sf3-sheet" + (open ? " is-open" : "")} role="dialog" aria-modal="true" aria-hidden={!open}>
        <div className="sf3-sheet-top sf3-wrap">
          <span className="sf3-brand"><Icon.leaf className="sf3-brand-mark" /><span className="sf3-brand-name">{data.business_name}</span></span>
          <button className="sf3-burger" aria-label="Close menu" onClick={() => setOpen(false)}><Icon.close /></button>
        </div>
        <nav className="sf3-sheet-links" aria-label="Mobile">{links.map(([l, h]) => (<a key={l} href={h} onClick={() => setOpen(false)}>{l}</a>))}</nav>
        <div className="sf3-sheet-foot">
          <a className="sf3-btn sf3-btn-solid sf3-btn-block" href={ctas.bookUrl} onClick={() => setOpen(false)}>Reserve</a>
          {ctas.callHref && data.phone && <a className="sf3-btn sf3-btn-line sf3-btn-block" href={ctas.callHref}><Icon.phone /> {data.phone}</a>}
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
    <section className="sf3-sec sf3-wrap" id="faq">
      <div className="sf3-faq-in">
        <div><p className="sf3-eyebrow">Good to know</p><h2 className="sf3-h2">Questions</h2></div>
        <div className="sf3-faq-list">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div className={"sf3-faq-item" + (isOpen ? " is-open" : "")} key={i}>
                <button className="sf3-faq-q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? -1 : i)}>
                  <span>{f.q}</span><Icon.chevron className="sf3-faq-chev" />
                </button>
                <div className="sf3-faq-a" role="region"><p>{f.a}</p></div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
