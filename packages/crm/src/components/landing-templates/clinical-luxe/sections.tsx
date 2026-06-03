import type { CTAs, Soul } from "../_contract/types";
import { Icon } from "./icons";
import { SmartImage } from "./ui";
import { sfDur, sfMoney, sfPhoto } from "./theme";

// ── Hero (full-bleed clinic photography, left-anchored copy — never centered) ─
export function Hero({ data, ctas }: { data: Soul; ctas: CTAs }) {
  const hero = sfPhoto(data, "hero");
  const eyebrow = data.service_area && data.service_area.length
    ? data.service_area.slice(0, 3).join("  ·  ")
    : data.certifications && data.certifications[0];
  return (
    <section className="sf1-hero">
      <div className="sf1-hero-media">
        <SmartImage photo={hero} role="clinic interior" label="clinic interior" />
        <div className="sf1-hero-scrim" aria-hidden="true" />
      </div>
      <div className="sf1-hero-in sf1-wrap">
        {eyebrow && <p className="sf1-hero-eyebrow">{eyebrow}</p>}
        <h1 className="sf1-hero-h1">{data.tagline || data.business_name}</h1>
        {data.soul_description && <p className="sf1-hero-sub">{data.soul_description}</p>}
        <div className="sf1-hero-actions">
          <a className="sf1-btn sf1-btn-gold-onimg" href={ctas.bookUrl}>Book an Appointment <Icon.arrow /></a>
          {ctas.callHref && data.phone
            ? <a className="sf1-btn sf1-btn-onimg" href={ctas.callHref}><Icon.phone /> {data.phone}</a>
            : <a className="sf1-btn sf1-btn-onimg" href="#services">View Treatments</a>}
        </div>
        {(data.review_rating != null || data.certifications) && (
          <ul className="sf1-hero-chips">
            {data.review_rating != null && (
              <li><span className="sf1-hero-stars"><Icon.star /></span><b>{data.review_rating.toFixed(1)}</b>
                {data.review_count != null && <span> / {data.review_count} reviews</span>}</li>
            )}
            {data.certifications && data.certifications[0] && <li><Icon.check /><span>{data.certifications[0]}</span></li>}
            {data.trust_signals && data.trust_signals[0] && <li><Icon.check /><span>{data.trust_signals[0]}</span></li>}
          </ul>
        )}
      </div>
    </section>
  );
}

// ── Trust strip ────────────────────────────────────────────────────────────
export function TrustStrip({ data }: { data: Soul }) {
  const items: { lead: string | null; sub: string }[] = [];
  if (data.review_rating != null)
    items.push({ lead: data.review_rating.toFixed(1) + "★", sub: data.review_count ? data.review_count + " reviews" : "rating" });
  (data.trust_signals || []).forEach((s) => items.push({ lead: null, sub: s }));
  (data.certifications || []).slice(0, 1).forEach((s) => items.push({ lead: null, sub: s }));
  if (!items.length) return null;
  return (
    <section className="sf1-trust" aria-label="Credentials">
      <div className="sf1-wrap sf1-trust-in">
        {items.map((it, i) => (
          <div className="sf1-trust-item" key={i}>
            {it.lead ? <span className="sf1-trust-lead">{it.lead}</span> : <Icon.check />}
            <span>{it.sub}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Services (editorial alternating rows; varied — not a 3-equal grid) ──────
export function Services({ data, ctas }: { data: Soul; ctas: CTAs }) {
  const list = data.offerings || [];
  if (!list.length) return null;
  return (
    <section className="sf1-sec sf1-wrap" id="services">
      <div className="sf1-sec-head">
        <p className="sf1-eyebrow">Treatments</p>
        <h2 className="sf1-h2">Considered care, expertly delivered</h2>
      </div>
      <div className="sf1-rows">
        {list.map((o, i) => (
          <article className="sf1-row" key={o.name}>
            <div className="sf1-row-media"><SmartImage photo={sfPhoto(data, "service", i)} role="treatment" label={o.name} /></div>
            <div className="sf1-row-body">
              <span className="sf1-row-num">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="sf1-row-name">{o.name}</h3>
              {o.description && <p className="sf1-row-desc">{o.description}</p>}
              {(sfMoney(o.price, o.currency) || sfDur(o.duration_minutes)) && (
                <div className="sf1-row-meta">
                  {sfMoney(o.price, o.currency) && <span className="sf1-price">{sfMoney(o.price, o.currency)}</span>}
                  {sfDur(o.duration_minutes) && <span className="sf1-dur"><Icon.clock /> {sfDur(o.duration_minutes)}</span>}
                </div>
              )}
              <a className="sf1-btn sf1-btn-outline" href={ctas.bookUrl}>Book this treatment <Icon.arrow /></a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ── About ──────────────────────────────────────────────────────────────────
export function About({ data, ctas }: { data: Soul; ctas: CTAs }) {
  if (!data.soul_description && !(data.certifications || []).length) return null;
  return (
    <section className="sf1-about" id="about">
      <div className="sf1-about-media"><SmartImage photo={sfPhoto(data, "about")} role="practitioner portrait" label="practitioner portrait" /></div>
      <div className="sf1-about-body">
        <p className="sf1-eyebrow">Our Practice</p>
        <h2 className="sf1-h2">Expertise you can feel at ease with</h2>
        {data.soul_description && <p className="sf1-about-text">{data.soul_description}</p>}
        {(data.certifications || []).length > 0 && (
          <ul className="sf1-creds">{data.certifications!.map((c) => (<li key={c}><Icon.check /> {c}</li>))}</ul>
        )}
        <a className="sf1-btn sf1-btn-dark" href={ctas.intakeUrl || ctas.bookUrl}>Meet the team <Icon.arrow /></a>
      </div>
    </section>
  );
}

// ── Stats ──────────────────────────────────────────────────────────────────
export function Stats({ data }: { data: Soul }) {
  const s: [string, string][] = [];
  if (data.review_count != null) s.push([data.review_count.toLocaleString() + "+", "Patients seen"]);
  if (data.review_rating != null) s.push([data.review_rating.toFixed(1), "Average rating"]);
  if (data.service_area && data.service_area.length) s.push([String(data.service_area.length), "Communities served"]);
  if (s.length < 2) return null;
  return (
    <section className="sf1-stats" aria-label="By the numbers">
      <div className="sf1-wrap sf1-stats-in">
        {s.map(([n, l], i) => (<div className="sf1-stat" key={i}><span className="sf1-stat-n">{n}</span><span className="sf1-stat-l">{l}</span></div>))}
      </div>
    </section>
  );
}

// ── Testimonials ───────────────────────────────────────────────────────────
export function Testimonials({ data }: { data: Soul }) {
  const t = data.testimonials || [];
  if (!t.length) return null;
  return (
    <section className="sf1-revs sf1-wrap" id="reviews">
      <div className="sf1-sec-head"><p className="sf1-eyebrow">Patient Stories</p><h2 className="sf1-h2">In their words</h2></div>
      <div className="sf1-rev-grid">
        {t.slice(0, 4).map((r, i) => (
          <figure className="sf1-rev" key={i}>
            <span className="sf1-rev-stars"><Icon.star /><Icon.star /><Icon.star /><Icon.star /><Icon.star /></span>
            <blockquote>{"\u201C" + r.text + "\u201D"}</blockquote>
            <figcaption>{r.name}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

// ── CTA band ───────────────────────────────────────────────────────────────
export function CtaBand({ data, ctas }: { data: Soul; ctas: CTAs }) {
  return (
    <section className="sf1-cta" id="contact">
      <div className="sf1-cta-media"><SmartImage photo={sfPhoto(data, "gallery")} role="texture" label="texture" decorative /></div>
      <div className="sf1-cta-scrim" aria-hidden="true" />
      <div className="sf1-wrap sf1-cta-in">
        <h2 className="sf1-cta-h">Begin with a consultation</h2>
        <p className="sf1-cta-sub">Personalized, board-certified care — book online in minutes.</p>
        <div className="sf1-hero-actions">
          <a className="sf1-btn sf1-btn-gold-onimg" href={ctas.bookUrl}>Book an Appointment <Icon.arrow /></a>
          {ctas.callHref && data.phone && <a className="sf1-btn sf1-btn-onimg" href={ctas.callHref}><Icon.phone /> {data.phone}</a>}
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
    <footer className="sf1-foot">
      <div className="sf1-wrap sf1-foot-in">
        <div className="sf1-foot-brand">
          <span className="sf1-brand"><Icon.mark className="sf1-brand-mark" /><span className="sf1-brand-name">{data.business_name}</span></span>
          {data.tagline && <p className="sf1-foot-tag">{data.tagline}</p>}
          <a className="sf1-btn sf1-btn-primary" href={ctas.bookUrl}>Book Now</a>
        </div>
        <div className="sf1-foot-cols">
          {cols.map(([h, items, kind]) => (
            <div className="sf1-foot-col" key={h}>
              <h3>{h}</h3>
              <ul>{items.map((x, i) => (<li key={i}>{kind === "link" ? <a href={ctas.bookUrl}>{x}</a> : x}</li>))}</ul>
            </div>
          ))}
        </div>
      </div>
      <div className="sf1-wrap sf1-foot-legal">
        <span>{"\u00A9 " + new Date().getFullYear() + " " + data.business_name}</span>
        <span>Privacy · Accessibility · Terms</span>
      </div>
    </footer>
  );
}

// ── Sticky mobile bar ──────────────────────────────────────────────────────
export function MobileBar({ data, ctas }: { data: Soul; ctas: CTAs }) {
  return (
    <div className="sf1-mbar" aria-label="Quick actions">
      {ctas.callHref && data.phone && <a className="sf1-mbar-call" href={ctas.callHref}><Icon.phone /> Call</a>}
      <a className="sf1-mbar-book" href={ctas.bookUrl}>Book Now</a>
    </div>
  );
}
