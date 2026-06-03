import type { CTAs, Soul } from "../_contract/types";
import { Icon } from "./icons";
import { SmartImage } from "./ui";
import { sfDur, sfMoney, sfPhoto, sfPromo, sfFirstName } from "./theme";

// ── Hero (split, airy — never centered) ────────────────────────────────────
export function Hero({ data, ctas }: { data: Soul; ctas: CTAs }) {
  const promo = sfPromo(data);
  const eyebrow = data.service_area && data.service_area.length
    ? (data.certifications && data.certifications[0] ? data.certifications[0] + " · " + data.service_area[0] : data.service_area[0])
    : data.certifications && data.certifications[0];
  return (
    <section className="sf2-hero">
      <div className="sf2-hero-body">
        {eyebrow && <p className="sf2-eyebrow">{eyebrow}</p>}
        <h1 className="sf2-hero-h1">{data.tagline || data.business_name}</h1>
        {data.soul_description && <p className="sf2-hero-sub">{data.soul_description}</p>}
        <div className="sf2-hero-actions">
          <a className="sf2-btn sf2-btn-primary" href={ctas.bookUrl}>Book a Class <Icon.arrow /></a>
          {promo
            ? <span className="sf2-hero-note"><Icon.heart /> {promo}</span>
            : (ctas.callHref && data.phone && <a className="sf2-btn sf2-btn-soft" href={ctas.callHref}><Icon.phone /> {data.phone}</a>)}
        </div>
        {(data.trust_signals || data.certifications) && (
          <ul className="sf2-hero-chips">
            {(data.trust_signals || []).slice(0, 3).map((s, i) => (<li key={i}><Icon.check /> {s}</li>))}
          </ul>
        )}
      </div>
      <div className="sf2-hero-media">
        <div className="sf2-hero-photo">
          <SmartImage photo={sfPhoto(data, "hero")} role="lifestyle photo" label="lifestyle photo" />
          {data.review_rating != null && (
            <div className="sf2-hero-badge">
              <span className="sf2-stars"><Icon.star /><Icon.star /><Icon.star /><Icon.star /><Icon.star /></span>
              <div><b>{data.review_rating.toFixed(1)}</b>{data.review_count != null && <small>{data.review_count} happy clients</small>}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Trust strip ────────────────────────────────────────────────────────────
import { Fragment } from "react";
export function TrustStrip({ data }: { data: Soul }) {
  const items: { lead: string | null; sub: string }[] = [];
  if (data.review_rating != null)
    items.push({ lead: data.review_rating.toFixed(1) + "★", sub: data.review_count ? data.review_count + " reviews" : "rated" });
  (data.certifications || []).forEach((s) => items.push({ lead: null, sub: s }));
  (data.trust_signals || []).slice(0, 2).forEach((s) => items.push({ lead: null, sub: s }));
  if (!items.length) return null;
  return (
    <section className="sf2-trust" aria-label="Credentials">
      <div className="sf2-wrap sf2-trust-in">
        {items.map((it, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="sf2-trust-dot" />}
            <span className="sf2-trust-item">{it.lead ? <span className="sf2-lead">{it.lead}</span> : <Icon.check />}{it.sub}</span>
          </Fragment>
        ))}
      </div>
    </section>
  );
}

// ── Services (varied rounded cards; first card wide) ───────────────────────
export function Services({ data, ctas }: { data: Soul; ctas: CTAs }) {
  const list = data.offerings || [];
  if (!list.length) return null;
  const [feat, ...rest] = list;
  return (
    <section className="sf2-sec sf2-wrap" id="services">
      <div className="sf2-sec-head"><p className="sf2-eyebrow">Classes & Coaching</p><h2 className="sf2-h2">Find the class that fits your stage</h2></div>
      <div className="sf2-svc-grid">
        <article className="sf2-svc sf2-svc--wide">
          <div className="sf2-svc-media"><SmartImage photo={sfPhoto(data, "service", 0)} role="class" label={feat.name} /></div>
          <div className="sf2-svc-body">
            <h3 className="sf2-svc-name">{feat.name}</h3>
            {feat.description && <p className="sf2-svc-desc">{feat.description}</p>}
            <div className="sf2-svc-meta">
              {sfMoney(feat.price, feat.currency) && <span className="sf2-price">{sfMoney(feat.price, feat.currency)}</span>}
              {sfDur(feat.duration_minutes) && <span className="sf2-dur"><Icon.clock /> {sfDur(feat.duration_minutes)}</span>}
            </div>
            <a className="sf2-btn sf2-btn-primary" href={ctas.bookUrl}>Book this class <Icon.arrow /></a>
          </div>
        </article>
        {rest.map((o, i) => (
          <article className="sf2-svc" key={o.name}>
            <div className="sf2-svc-media"><SmartImage photo={sfPhoto(data, "service", i + 1)} role="class" label={o.name} /></div>
            <div className="sf2-svc-body">
              <h3 className="sf2-svc-name">{o.name}</h3>
              {o.description && <p className="sf2-svc-desc">{o.description}</p>}
              <div className="sf2-svc-meta">
                {sfMoney(o.price, o.currency) && <span className="sf2-price">{sfMoney(o.price, o.currency)}</span>}
                {sfDur(o.duration_minutes) && <span className="sf2-dur"><Icon.clock /> {sfDur(o.duration_minutes)}</span>}
              </div>
              <a className="sf2-btn sf2-btn-soft" href={ctas.bookUrl}>Book <Icon.arrow /></a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ── About ("Hi, I'm …" personal block) ─────────────────────────────────────
export function About({ data, ctas }: { data: Soul; ctas: CTAs }) {
  if (!data.soul_description && !(data.certifications || []).length) return null;
  const first = sfFirstName(data.business_name);
  return (
    <section className="sf2-sec sf2-wrap" id="about">
      <div className="sf2-about">
        <div className="sf2-about-media"><SmartImage photo={sfPhoto(data, "about")} role="portrait" label={first + " — portrait"} /></div>
        <div>
          <p className="sf2-eyebrow">Meet your coach</p>
          <h2 className="sf2-about-hi">Hi, I'm {first} 👋</h2>
          {data.soul_description && <p className="sf2-about-text">{data.soul_description}</p>}
          {(data.certifications || []).length > 0 && (
            <ul className="sf2-creds">{data.certifications!.map((c) => (<li key={c}><Icon.check /> {c}</li>))}</ul>
          )}
          <a className="sf2-btn sf2-btn-dark" href={ctas.intakeUrl || ctas.bookUrl}>My story <Icon.arrow /></a>
        </div>
      </div>
    </section>
  );
}

// ── Stats ──────────────────────────────────────────────────────────────────
export function Stats({ data }: { data: Soul }) {
  const s: [string, string][] = [];
  if (data.review_count != null) s.push([data.review_count.toLocaleString() + "+", "Women coached"]);
  if (data.review_rating != null) s.push([data.review_rating.toFixed(1) + "★", "Average rating"]);
  if (data.offerings && data.offerings.length) s.push([String(data.offerings.length), "Class formats"]);
  if (data.service_area && data.service_area.length) s.push([String(data.service_area.length), "Neighborhoods"]);
  if (s.length < 2) return null;
  return (
    <section className="sf2-sec sf2-wrap" aria-label="By the numbers">
      <div className="sf2-stats-in">
        {s.map(([n, l], i) => (<div className="sf2-stat" key={i}><span className="sf2-stat-n">{n}</span><span className="sf2-stat-l">{l}</span></div>))}
      </div>
    </section>
  );
}

// ── Testimonials ───────────────────────────────────────────────────────────
export function Testimonials({ data }: { data: Soul }) {
  const t = data.testimonials || [];
  if (!t.length) return null;
  return (
    <section className="sf2-sec sf2-wrap" id="reviews">
      <div className="sf2-sec-head"><p className="sf2-eyebrow">Happy clients</p><h2 className="sf2-h2">Loved by mums like you</h2></div>
      <div className="sf2-rev-grid">
        {t.slice(0, 3).map((r, i) => (
          <figure className="sf2-rev" key={i}>
            <span className="sf2-rev-stars"><Icon.star /><Icon.star /><Icon.star /><Icon.star /><Icon.star /></span>
            <blockquote>{"\u201C" + r.text + "\u201D"}</blockquote>
            <figcaption><span className="sf2-rev-av">{(r.name || "?").slice(0, 1)}</span>{r.name}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

// ── CTA card ───────────────────────────────────────────────────────────────
export function CtaBand({ data, ctas }: { data: Soul; ctas: CTAs }) {
  return (
    <section className="sf2-cta sf2-wrap" id="contact">
      <div className="sf2-cta-card">
        <h2 className="sf2-cta-h">Ready to feel strong again?</h2>
        <p className="sf2-cta-sub">Your first class is on me. Let's move together — at every stage.</p>
        <div className="sf2-cta-actions">
          <a className="sf2-btn sf2-btn-onrose" href={ctas.bookUrl}>Book a Class <Icon.arrow /></a>
          {ctas.callHref && data.phone && <a className="sf2-btn sf2-btn-onrose-out" href={ctas.callHref}><Icon.phone /> {data.phone}</a>}
        </div>
      </div>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────
export function Footer({ data, ctas }: { data: Soul; ctas: CTAs }) {
  const cols: [string, string[], "text" | "link"][] = [];
  const contact: string[] = [];
  if (data.address) contact.push(data.address);
  if (data.phone) contact.push(data.phone);
  if (data.email) contact.push(data.email);
  if (contact.length) cols.push(["Contact", contact, "text"]);
  if (data.service_area && data.service_area.length) cols.push(["Where I Teach", data.service_area, "text"]);
  if (data.hours && data.hours.length)
    cols.push(["Hours", data.hours.map((h) => (h.close ? `${h.day}: ${h.open} \u2013 ${h.close}` : `${h.day}: ${h.open}`)), "text"]);
  cols.push(["Follow", ["Instagram", "TikTok"], "link"]);
  return (
    <footer className="sf2-foot">
      <div className="sf2-wrap sf2-foot-in">
        <div className="sf2-foot-brand">
          <span className="sf2-brand"><span className="sf2-brand-mark">{sfFirstName(data.business_name).slice(0, 1)}</span><span className="sf2-brand-name">{data.business_name}</span></span>
          {data.tagline && <p className="sf2-foot-tag">{data.tagline}</p>}
          <a className="sf2-btn sf2-btn-primary" href={ctas.bookUrl}>Book a Class</a>
        </div>
        <div className="sf2-foot-cols">
          {cols.map(([h, items, kind]) => (
            <div className="sf2-foot-col" key={h}>
              <h3>{h}</h3>
              <ul>{items.map((x, i) => (<li key={i}>{kind === "link" ? <a href={ctas.bookUrl}>{x}</a> : x}</li>))}</ul>
            </div>
          ))}
        </div>
      </div>
      <div className="sf2-wrap sf2-foot-legal">
        <span>{"\u00A9 " + new Date().getFullYear() + " " + data.business_name}</span>
        <span>Privacy · Accessibility · Terms</span>
      </div>
    </footer>
  );
}

// ── Sticky mobile bar ──────────────────────────────────────────────────────
export function MobileBar({ data, ctas }: { data: Soul; ctas: CTAs }) {
  return (
    <div className="sf2-mbar" aria-label="Quick actions">
      {ctas.callHref && data.phone && <a className="sf2-mbar-call" href={ctas.callHref}><Icon.phone /> Call</a>}
      <a className="sf2-mbar-book" href={ctas.bookUrl}>Book a Class</a>
    </div>
  );
}
