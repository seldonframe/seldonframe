"use client";

import { useState } from "react";
import type { CTAs, Soul } from "../_contract/types";
import { Icon } from "./icons";
import { sfPromo, sfFirstName } from "./theme";

// ── Sticky nav with promo pill + mobile sheet ──────────────────────────────
export function Nav({ data, ctas }: { data: Soul; ctas: CTAs }) {
  const [open, setOpen] = useState(false);
  const promo = sfPromo(data);
  const mono = sfFirstName(data.business_name).slice(0, 1);
  const links: [string, string][] = [
    ["Meet Me", "#about"],
    ["Classes", "#services"],
    ["Reviews", "#reviews"],
    ["Contact", "#contact"],
  ];
  return (
    <header className="sf2-nav" id="top">
      <div className="sf2-wrap sf2-nav-in">
        <a className="sf2-brand" href="#top" aria-label={data.business_name}>
          <span className="sf2-brand-mark">{mono}</span>
          <span className="sf2-brand-name">{data.business_name}</span>
        </a>
        <nav className="sf2-nav-mid" aria-label="Primary">{links.map(([l, h]) => (<a key={l} href={h}>{l}</a>))}</nav>
        <div className="sf2-nav-cta">
          {promo && <span className="sf2-promo"><Icon.heart /> {promo}</span>}
          <a className="sf2-btn sf2-btn-primary" href={ctas.bookUrl}>Book a Class</a>
          <button className="sf2-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(true)}><Icon.menu /></button>
        </div>
      </div>
      <div className={"sf2-sheet" + (open ? " is-open" : "")} role="dialog" aria-modal="true" aria-hidden={!open}>
        <div className="sf2-sheet-top sf2-wrap">
          <span className="sf2-brand"><span className="sf2-brand-mark">{mono}</span><span className="sf2-brand-name">{data.business_name}</span></span>
          <button className="sf2-burger" aria-label="Close menu" onClick={() => setOpen(false)}><Icon.close /></button>
        </div>
        <nav className="sf2-sheet-links" aria-label="Mobile">{links.map(([l, h]) => (<a key={l} href={h} onClick={() => setOpen(false)}>{l}</a>))}</nav>
        <div className="sf2-sheet-foot">
          <a className="sf2-btn sf2-btn-primary sf2-btn-block" href={ctas.bookUrl} onClick={() => setOpen(false)}>Book a Class</a>
          {ctas.callHref && data.phone && <a className="sf2-btn sf2-btn-ghost sf2-btn-block" href={ctas.callHref}><Icon.phone /> {data.phone}</a>}
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
    <section className="sf2-sec sf2-wrap" id="faq">
      <div className="sf2-faq-in">
        <div><p className="sf2-eyebrow">Good to know</p><h2 className="sf2-h2">Your questions, answered</h2></div>
        <div className="sf2-faq-list">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div className={"sf2-faq-item" + (isOpen ? " is-open" : "")} key={i}>
                <button className="sf2-faq-q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? -1 : i)}>
                  <span>{f.q}</span><Icon.chevron className="sf2-faq-chev" />
                </button>
                <div className="sf2-faq-a" role="region"><p>{f.a}</p></div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
