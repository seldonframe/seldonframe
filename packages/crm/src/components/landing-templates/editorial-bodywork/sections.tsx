import type { CTAs, Soul } from "../_contract/types";
import { Icon } from "./icons";
import { SmartImage } from "./ui";
import { sfDur, sfMoney, sfPhoto, sfAccent } from "./theme";

// ── Hero (split-screen, italic-accent headline — never centered) ───────────
export function Hero({ data, ctas }: { data: Soul; ctas: CTAs }) {
  const [a, b] = sfAccent(data.tagline || data.business_name);
  const eyebrow = data.service_area && data.service_area.length ? data.service_area[0] : data.certifications && data.certifications[0];
  return (
    <section className="sf4-hero">
      <div className="sf4-hero-left">
        <SmartImage photo={sfPhoto(data, "hero", 0)} role="bodywork image" label="bodywork image" />
        <div className="sf4-hero-scrim" aria-hidden="true" />
        <div className="sf4-hero-in">
          {eyebrow && <p className="sf4-hero-eyebrow">{eyebrow}</p>}
          <h1 className="sf4-hero-h1">{a}{b && <em>{b}</em>}</h1>
          {data.soul_description && <p className="sf4-hero-sub">{data.soul_description}</p>}
          <div className="sf4-hero-actions">
            <a className="sf4-btn sf4-btn-onimg-solid" href={ctas.bookUrl}>Book a Session <Icon.arrow /></a>
            <a className="sf4-btn sf4-btn-onimg" href="#services">View Treatments</a>
          </div>
        </div>
      </div>
      <div className="sf4-hero-right"><SmartImage photo={sfPhoto(data, "hero", 1)} role="detail image" label="detail image" /></div>
    </section>
  );
}

// ── Trust strip ────────────────────────────────────────────────────────────
export function TrustStrip({ data }: { data: Soul }) {
  const items: { b: string | null; sub: string }[] = [];
  if (data.review_rating != null) items.push({ b: data.review_rating.toFixed(1) + "★", sub: data.review_count ? data.review_count + " reviews" : "rated" });
  (data.trust_signals || []).forEach((s) => items.push({ b: null, sub: s }));
  if (!items.length) return null;
  return (
    <section className="sf4-trust" aria-label="Credentials">
      <div className="sf4-wrap sf4-trust-in">
        {items.map((it, i) => (
          <div className="sf4-trust-item" key={i}>{it.b ? <b>{it.b}</b> : <Icon.check />}{it.sub}</div>
        ))}
      </div>
    </section>
  );
}

// ── Services (numbered priced rows, per-row Book — conversion-clear) ────────
export function Services({ data, ctas }: { data: Soul; ctas: CTAs }) {
  const list = data.offerings || [];
  if (!list.length) return null;
  return (
    <section className="sf4-sec sf4-wrap" id="services">
      <div className="sf4-sec-head"><p className="sf4-eyebrow">Treatments</p><h2 className="sf4-h2">Bodywork, <em>tailored</em> to you</h2></div>
      <div className="sf4-treat">
        {list.map((o, i) => (
          <article className="sf4-row" key={o.name}>
            <div className="sf4-row-lead">
              <span className="sf4-row-num">{String(i + 1).padStart(2, "0")}</span>
              <div className="sf4-row-thumb"><SmartImage photo={sfPhoto(data, "service", i)} role="treatment" label={o.name} /></div>
              <div className="sf4-row-info">
                <h3 className="sf4-row-name">{o.name}</h3>
                {o.description && <p className="sf4-row-desc">{o.description}</p>}
              </div>
            </div>
            <div className="sf4-row-end">
              <div className="sf4-row-meta">
                {sfMoney(o.price, o.currency) && <span className="sf4-row-price">{sfMoney(o.price, o.currency)}</span>}
                {sfDur(o.duration_minutes) && <span className="sf4-row-dur"><Icon.clock /> {sfDur(o.duration_minutes)}</span>}
              </div>
              <a className="sf4-btn sf4-btn-outline sf4-btn-sm" href={ctas.bookUrl}>Book</a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ── About (split editorial) ────────────────────────────────────────────────
export function About({ data, ctas }: { data: Soul; ctas: CTAs }) {
  if (!data.soul_description && !(data.certifications || []).length) return null;
  return (
    <section className="sf4-sec sf4-wrap" id="about">
      <div className="sf4-about">
        <div className="sf4-about-media"><SmartImage photo={sfPhoto(data, "about")} role="therapist portrait" label="therapist portrait" /></div>
        <div>
          <p className="sf4-eyebrow">The Practice</p>
          <h2 className="sf4-h2" style={{ marginBottom: 22 }}>Hands that <em>listen</em></h2>
          {data.soul_description && <p className="sf4-about-text">{data.soul_description}</p>}
          {(data.certifications || []).length > 0 && (
            <ul className="sf4-creds">{data.certifications!.map((c) => (<li key={c}><Icon.check /> {c}</li>))}</ul>
          )}
          <a className="sf4-btn sf4-btn-dark" href={ctas.intakeUrl || ctas.bookUrl}>About the studio <Icon.arrow /></a>
        </div>
      </div>
    </section>
  );
}

// ── Stats ──────────────────────────────────────────────────────────────────
export function Stats({ data }: { data: Soul }) {
  const s: [string, string][] = [];
  if (data.review_count != null) s.push([data.review_count.toLocaleString() + "+", "Sessions given"]);
  if (data.review_rating != null) s.push([data.review_rating.toFixed(1), "Average rating"]);
  if (data.offerings && data.offerings.length) s.push([String(data.offerings.length), "Modalities"]);
  if (s.length < 2) return null;
  return (
    <section className="sf4-stats" aria-label="By the numbers">
      <div className="sf4-wrap sf4-stats-in">
        {s.map(([n, l], i) => (<div className="sf4-stat" key={i}><span className="sf4-stat-n">{n}</span><span className="sf4-stat-l">{l}</span></div>))}
      </div>
    </section>
  );
}

// ── Testimonials ───────────────────────────────────────────────────────────
export function Testimonials({ data }: { data: Soul }) {
  const t = data.testimonials || [];
  if (!t.length) return null;
  return (
    <section className="sf4-sec sf4-wrap" id="reviews">
      <div className="sf4-sec-head"><p className="sf4-eyebrow">Reviews</p><h2 className="sf4-h2">Felt, not just <em>heard</em></h2></div>
      <div className="sf4-rev-grid">
        {t.slice(0, 4).map((r, i) => (
          <figure className="sf4-rev" key={i}>
            <span className="sf4-rev-stars"><Icon.star /><Icon.star /><Icon.star /><Icon.star /><Icon.star /></span>
            <blockquote>{"\u201C" + r.text + "\u201D"}</blockquote>
            <figcaption>{"\u2014 " + r.name}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

// ── CTA band ───────────────────────────────────────────────────────────────
export function CtaBand({ data, ctas }: { data: Soul; ctas: CTAs }) {
  return (
    <section className="sf4-cta" id="contact">
      <div className="sf4-cta-media"><SmartImage photo={sfPhoto(data, "gallery")} role="texture" label="texture" decorative /></div>
      <div className="sf4-cta-scrim" aria-hidden="true" />
      <div className="sf4-wrap sf4-cta-in">
        <h2 className="sf4-cta-h">Find <em>your</em> quiet</h2>
        <p className="sf4-cta-sub">Relief, recovery, and longevity — book a session that's built around your body.</p>
        <div className="sf4-hero-actions">
          <a className="sf4-btn sf4-btn-onimg-solid" href={ctas.bookUrl}>Book a Session <Icon.arrow /></a>
          {ctas.callHref && data.phone && <a className="sf4-btn sf4-btn-onimg" href={ctas.callHref}><Icon.phone /> {data.phone}</a>}
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
  if (data.service_area && data.service_area.length) cols.push(["Service Area", data.service_area, "text"]);
  if (data.hours && data.hours.length)
    cols.push(["Hours", data.hours.map((h) => (h.close ? `${h.day}: ${h.open} \u2013 ${h.close}` : `${h.day}: ${h.open}`)), "text"]);
  cols.push(["Follow", ["Instagram", "Facebook"], "link"]);
  return (
    <footer className="sf4-foot">
      <div className="sf4-wrap sf4-foot-in">
        <div className="sf4-foot-brand">
          <span className="sf4-brand"><Icon.mark className="sf4-brand-mark" /><span className="sf4-brand-name">{data.business_name}</span></span>
          {data.tagline && <p className="sf4-foot-tag">{data.tagline}</p>}
          <a className="sf4-btn sf4-btn-primary" href={ctas.bookUrl}>Book a Session</a>
        </div>
        <div className="sf4-foot-cols">
          {cols.map(([h, items, kind]) => (
            <div className="sf4-foot-col" key={h}>
              <h3>{h}</h3>
              <ul>{items.map((x, i) => (<li key={i}>{kind === "link" ? <a href={ctas.bookUrl}>{x}</a> : x}</li>))}</ul>
            </div>
          ))}
        </div>
      </div>
      <div className="sf4-wrap sf4-foot-legal">
        <span>{"\u00A9 " + new Date().getFullYear() + " " + data.business_name}</span>
        <span>Privacy · Accessibility · Terms</span>
      </div>
    </footer>
  );
}

// ── Sticky mobile bar ──────────────────────────────────────────────────────
export function MobileBar({ data, ctas }: { data: Soul; ctas: CTAs }) {
  return (
    <div className="sf4-mbar" aria-label="Quick actions">
      {ctas.callHref && data.phone && <a className="sf4-mbar-call" href={ctas.callHref}><Icon.phone /> Call</a>}
      <a className="sf4-mbar-book" href={ctas.bookUrl}>Book a Session</a>
    </div>
  );
}
