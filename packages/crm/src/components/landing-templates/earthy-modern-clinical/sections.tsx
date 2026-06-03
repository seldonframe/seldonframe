import type { CTAs, Soul } from "../_contract/types";
import { Icon } from "./icons";
import { SmartImage } from "./ui";
import { sfDur, sfMoney, sfPhoto } from "./theme";

// â”€â”€ Hero (split / asymmetric â€” never centered) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function Hero({ data, ctas }: { data: Soul; ctas: CTAs }) {
  const hero = sfPhoto(data, "hero");
  const eyebrow = data.service_area && data.service_area.length
    ? "Now welcoming patients Â· " + data.service_area[0]
    : data.certifications && data.certifications[0];
  return (
    <section className="sf5-hero">
      <div className="sf5-hero-media">
        <SmartImage photo={hero} role="hero portrait" label="hero portrait" className="sf5-hero-img" />
        <div className="sf5-hero-scrim" aria-hidden="true" />
      </div>
      <div className="sf5-hero-body">
        {eyebrow && <p className="sf5-eyebrow">{eyebrow}</p>}
        <h1 className="sf5-hero-h1">{data.tagline || data.business_name}</h1>
        {data.soul_description && <p className="sf5-hero-sub">{data.soul_description}</p>}
        <div className="sf5-hero-actions">
          <a className="sf5-btn sf5-btn-primary sf5-btn-lg" href={ctas.bookUrl}>Book a Session <Icon.arrow /></a>
          {ctas.callHref && data.phone
            ? <a className="sf5-btn sf5-btn-outline sf5-btn-lg" href={ctas.callHref}><Icon.phone /> {data.phone}</a>
            : <a className="sf5-btn sf5-btn-outline sf5-btn-lg" href="#services">View Services</a>}
        </div>
        {(data.review_rating != null || data.certifications) && (
          <ul className="sf5-hero-chips">
            {data.review_rating != null && (
              <li><span className="sf5-stars"><Icon.star /></span><b>{data.review_rating.toFixed(1)}</b>
                {data.review_count != null && <span className="sf5-muted">Â· {data.review_count} reviews</span>}</li>
            )}
            {data.certifications && data.certifications[0] && (
              <li><Icon.check className="sf5-chip-ic" /><span>{data.certifications[0]}</span></li>
            )}
            {data.same_day && <li><Icon.check className="sf5-chip-ic" /><span>Same-week appointments</span></li>}
          </ul>
        )}
      </div>
    </section>
  );
}

// â”€â”€ Trust strip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function TrustStrip({ data }: { data: Soul }) {
  const items: { lead: string | null; sub: string }[] = [];
  if (data.review_rating != null)
    items.push({ lead: data.review_rating.toFixed(1) + "â˜…", sub: data.review_count ? data.review_count + " patient reviews" : "Patient rating" });
  (data.trust_signals || []).forEach((s) => items.push({ lead: null, sub: s }));
  if (!items.length) return null;
  return (
    <section className="sf5-trust" aria-label="Why patients trust us">
      <div className="sf5-wrap sf5-trust-in">
        {items.map((it, i) => (
          <div className="sf5-trust-item" key={i}>
            {it.lead ? <span className="sf5-trust-lead">{it.lead}</span> : <Icon.check className="sf5-trust-ic" />}
            <span className="sf5-trust-sub">{it.sub}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// â”€â”€ Services (varied card sizes â€” first card spans full width) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function Services({ data, ctas }: { data: Soul; ctas: CTAs }) {
  const list = data.offerings || [];
  if (!list.length) return null;
  const [feat, ...rest] = list;
  return (
    <section className="sf5-services" id="services">
      <div className="sf5-wrap">
        <div className="sf5-sec-head">
          <div>
            <p className="sf5-eyebrow">Services</p>
            <h2 className="sf5-h2">Paths to<br />Pain-Free Living</h2>
          </div>
          <a className="sf5-btn sf5-btn-secondary" href="#services">Explore all services <Icon.arrow /></a>
        </div>
        <div className="sf5-svc-grid">
          <article className="sf5-svc sf5-svc--feature">
            <div className="sf5-svc-media"><SmartImage photo={sfPhoto(data, "service", 0)} role="service" label={feat.name} /></div>
            <div className="sf5-svc-body">
              <div className="sf5-svc-top">
                <h3 className="sf5-svc-name">{feat.name}</h3>
                {feat.description && <p className="sf5-svc-desc">{feat.description}</p>}
              </div>
              <div className="sf5-svc-meta">
                {sfDur(feat.duration_minutes) && <span><Icon.clock /> {sfDur(feat.duration_minutes)}</span>}
                {sfMoney(feat.price, feat.currency) && <span className="sf5-price">{sfMoney(feat.price, feat.currency)}</span>}
              </div>
              <a className="sf5-btn sf5-btn-primary" href={ctas.bookUrl}>Book now</a>
            </div>
          </article>
          {rest.map((o, i) => (
            <article className="sf5-svc sf5-svc--sm" key={o.name}>
              <div className="sf5-svc-media"><SmartImage photo={sfPhoto(data, "service", i + 1)} role="service" label={o.name} /></div>
              <div className="sf5-svc-body">
                <h3 className="sf5-svc-name">{o.name}</h3>
                {o.description && <p className="sf5-svc-desc">{o.description}</p>}
                <div className="sf5-svc-meta">
                  {sfDur(o.duration_minutes) && <span><Icon.clock /> {sfDur(o.duration_minutes)}</span>}
                  {sfMoney(o.price, o.currency) && <span className="sf5-price">{sfMoney(o.price, o.currency)}</span>}
                </div>
                <a className="sf5-svc-book" href={ctas.bookUrl}>Book now <Icon.arrow /></a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// â”€â”€ About (color panel + portrait) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function About({ data, ctas }: { data: Soul; ctas: CTAs }) {
  if (!data.soul_description && !(data.certifications || []).length) return null;
  const portrait = sfPhoto(data, "about");
  const lead = (data.certifications && data.certifications[0]) || "Lead Specialist";
  return (
    <section className="sf5-about" id="about">
      <div className="sf5-about-panel">
        <h2 className="sf5-h2 sf5-on-primary">Your Partner<br />in Health</h2>
        <div className="sf5-about-copy">
          <p className="sf5-about-role">{lead}</p>
          <p className="sf5-about-text">{data.soul_description}</p>
          {(data.certifications || []).length > 0 && (
            <ul className="sf5-creds">
              {data.certifications!.map((c) => (<li key={c}><Icon.check /> {c}</li>))}
            </ul>
          )}
          <a className="sf5-btn sf5-btn-on-primary" href={ctas.intakeUrl || ctas.bookUrl}>Read my story</a>
        </div>
      </div>
      <div className="sf5-about-media">
        <SmartImage photo={portrait} role="practitioner portrait" label="practitioner portrait" />
      </div>
    </section>
  );
}

// â”€â”€ Stats (optional proof) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function Stats({ data }: { data: Soul }) {
  const stats: [string, string][] = [];
  if (data.review_count != null) stats.push([data.review_count.toLocaleString() + "+", "Patients cared for"]);
  if (data.review_rating != null) stats.push([data.review_rating.toFixed(1), "Average rating"]);
  if (data.service_area && data.service_area.length) stats.push([String(data.service_area.length), "Communities served"]);
  if (stats.length < 2) return null;
  return (
    <section className="sf5-stats" aria-label="By the numbers">
      <div className="sf5-wrap sf5-stats-in">
        {stats.map(([n, l], i) => (
          <div className="sf5-stat" key={i}><span className="sf5-stat-n">{n}</span><span className="sf5-stat-l">{l}</span></div>
        ))}
      </div>
    </section>
  );
}

// â”€â”€ Testimonials â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function Testimonials({ data }: { data: Soul }) {
  const t = data.testimonials || [];
  if (!t.length) return null;
  return (
    <section className="sf5-revs" id="reviews">
      <div className="sf5-wrap">
        <h2 className="sf5-h2">What Our<br />Patients Say</h2>
        <div className="sf5-rev-grid">
          {t.slice(0, 4).map((r, i) => (
            <figure className="sf5-rev" key={i}>
              <span className="sf5-stars sf5-rev-stars"><Icon.star /><Icon.star /><Icon.star /><Icon.star /><Icon.star /></span>
              <blockquote>{"\u201C" + r.text + "\u201D"}</blockquote>
              <figcaption>{"\u2014 " + r.name}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

// â”€â”€ CTA band (over warm texture) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function CtaBand({ data, ctas }: { data: Soul; ctas: CTAs }) {
  return (
    <section className="sf5-cta" id="contact">
      <div className="sf5-cta-media"><SmartImage photo={sfPhoto(data, "gallery")} role="texture" label="warm texture" decorative /></div>
      <div className="sf5-cta-scrim" aria-hidden="true" />
      <div className="sf5-wrap sf5-cta-in">
        <h2 className="sf5-cta-h">Ready to<br />Feel Your Best?</h2>
        <p className="sf5-cta-sub">Your journey to a healthier, more comfortable life starts here.</p>
        <div className="sf5-hero-actions">
          <a className="sf5-btn sf5-btn-primary sf5-btn-lg" href={ctas.bookUrl}>Book a Session <Icon.arrow /></a>
          {ctas.callHref && data.phone && <a className="sf5-btn sf5-btn-on-dark sf5-btn-lg" href={ctas.callHref}><Icon.phone /> {data.phone}</a>}
        </div>
      </div>
    </section>
  );
}

// â”€â”€ Footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function Footer({ data, ctas }: { data: Soul; ctas: CTAs }) {
  const cols: [string, string[], "text" | "link"][] = [];
  const contact: string[] = [];
  if (data.address) contact.push(data.address);
  if (data.phone) contact.push(data.phone);
  if (data.email) contact.push(data.email);
  if (contact.length) cols.push(["Contact", contact, "text"]);
  if (data.service_area && data.service_area.length) cols.push(["Service area", data.service_area, "text"]);
  if (data.hours && data.hours.length)
    cols.push(["Hours", data.hours.map((h) => (h.close ? `${h.day}: ${h.open} \u2013 ${h.close}` : `${h.day}: ${h.open}`)), "text"]);
  cols.push(["Follow", ["Instagram", "Facebook"], "link"]);
  return (
    <footer className="sf5-foot">
      <div className="sf5-wrap sf5-foot-in">
        <div className="sf5-foot-brand">
          <span className="sf5-brand sf5-brand--foot"><Icon.mark className="sf5-brand-mark" />{data.business_name}</span>
          {data.tagline && <p className="sf5-foot-tag">{data.tagline}</p>}
          <a className="sf5-btn sf5-btn-primary" href={ctas.bookUrl}>Book a Session</a>
        </div>
        <div className="sf5-foot-cols">
          {cols.map(([h, items, kind]) => (
            <div className="sf5-foot-col" key={h}>
              <h3>{h}</h3>
              <ul>{items.map((x, i) => (<li key={i}>{kind === "link" ? <a href={ctas.bookUrl}>{x}</a> : x}</li>))}</ul>
            </div>
          ))}
        </div>
      </div>
      <div className="sf5-wrap sf5-foot-legal">
        <span>{"\u00A9 " + new Date().getFullYear() + " " + data.business_name + ". All rights reserved."}</span>
        <span>Privacy Â· Accessibility Â· Terms</span>
      </div>
    </footer>
  );
}

// â”€â”€ Sticky mobile action bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function MobileBar({ data, ctas }: { data: Soul; ctas: CTAs }) {
  return (
    <div className="sf5-mbar" aria-label="Quick actions">
      {ctas.callHref && data.phone && <a className="sf5-mbar-call" href={ctas.callHref}><Icon.phone /> Call</a>}
      <a className="sf5-mbar-book" href={ctas.bookUrl}>Book a Session</a>
    </div>
  );
}
