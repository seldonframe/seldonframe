import type { CTAs, Soul } from "../_contract/types";
import { Icon } from "./icons";
import { SmartImage } from "./ui";
import { sfDur, sfMoney, sfPhoto } from "./theme";

// ── Hero (cinematic, asymmetric — copy lower-left, never centered) ─────────
export function Hero({ data, ctas }: { data: Soul; ctas: CTAs }) {
  const eyebrow = data.service_area && data.service_area.length ? data.service_area[0] : data.certifications && data.certifications[0];
  return (
    <section className="sf3-hero">
      <div className="sf3-hero-media">
        <SmartImage photo={sfPhoto(data, "hero")} role="cinematic image" label="cinematic image" />
        <div className="sf3-hero-scrim" aria-hidden="true" />
      </div>
      <div className="sf3-hero-in">
        <div className="sf3-wrap" style={{ padding: 0 }}>
          {eyebrow && <p className="sf3-hero-eyebrow sf3-reveal">{eyebrow}</p>}
          <h1 className="sf3-hero-h1 sf3-reveal sf3-reveal-2">{data.tagline || data.business_name}</h1>
          {data.soul_description && <p className="sf3-hero-sub sf3-reveal sf3-reveal-3">{data.soul_description}</p>}
          <div className="sf3-hero-actions sf3-reveal sf3-reveal-3">
            <a className="sf3-btn sf3-btn-onimg-solid" href={ctas.bookUrl}>Reserve a Visit</a>
            {data.review_rating != null && (
              <span className="sf3-hero-meta"><Icon.star /> {data.review_rating.toFixed(1)}{data.review_count != null && ` · ${data.review_count} reviews`}</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Trust strip ────────────────────────────────────────────────────────────
export function TrustStrip({ data }: { data: Soul }) {
  const items: { b: string | null; sub: string }[] = [];
  if (data.review_rating != null) items.push({ b: data.review_rating.toFixed(1), sub: data.review_count ? data.review_count + " reviews" : "rated" });
  (data.certifications || []).forEach((s) => items.push({ b: null, sub: s }));
  (data.trust_signals || []).slice(0, 2).forEach((s) => items.push({ b: null, sub: s }));
  if (!items.length) return null;
  return (
    <section className="sf3-trust" aria-label="Credentials">
      <div className="sf3-wrap sf3-trust-in">
        {items.map((it, i) => (
          <span className="sf3-trust-item" key={i}>{it.b ? <b>{it.b}</b> : <Icon.leaf />}{it.sub}</span>
        ))}
      </div>
    </section>
  );
}

// ── Intro (negative-space statement) ───────────────────────────────────────
export function Intro({ data }: { data: Soul }) {
  if (!data.soul_description) return null;
  return (
    <section className="sf3-sec sf3-wrap">
      <div className="sf3-intro">
        <p className="sf3-eyebrow">The Sanctuary</p>
        <h2 className="sf3-h2">A space designed for the simple, restorative act of slowing down.</h2>
      </div>
    </section>
  );
}

// ── Services (numbered vignettes, alternating) ─────────────────────────────
export function Services({ data, ctas }: { data: Soul; ctas: CTAs }) {
  const list = data.offerings || [];
  if (!list.length) return null;
  return (
    <section className="sf3-sec sf3-wrap" id="services">
      <div className="sf3-intro" style={{ marginBottom: 8 }}>
        <p className="sf3-eyebrow">Rituals</p><h2 className="sf3-h2">Treatments</h2>
      </div>
      <div>
        {list.map((o, i) => (
          <article className="sf3-vig" key={o.name}>
            <div className="sf3-vig-media"><SmartImage photo={sfPhoto(data, "service", i)} role="treatment" label={o.name} /></div>
            <div className="sf3-vig-body">
              <span className="sf3-vig-num">{String(i + 1).padStart(2, "0")} —</span>
              <h3 className="sf3-vig-name">{o.name}</h3>
              {o.description && <p className="sf3-vig-desc">{o.description}</p>}
              {(sfMoney(o.price, o.currency) || sfDur(o.duration_minutes)) && (
                <div className="sf3-vig-meta">
                  {sfMoney(o.price, o.currency) && <span className="sf3-vig-price">{sfMoney(o.price, o.currency)}</span>}
                  {sfDur(o.duration_minutes) && <span className="sf3-vig-dur"><Icon.clock /> {sfDur(o.duration_minutes)}</span>}
                </div>
              )}
              <a className="sf3-link" href={ctas.bookUrl}>Reserve <Icon.arrow /></a>
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
    <section className="sf3-sec sf3-wrap" id="about">
      <div className="sf3-about">
        <div className="sf3-about-media"><SmartImage photo={sfPhoto(data, "about")} role="practitioner portrait" label="practitioner portrait" /></div>
        <div>
          <p className="sf3-eyebrow">Our Philosophy</p>
          <h2 className="sf3-h2" style={{ marginBottom: 24 }}>Care that meets you where you are</h2>
          {data.soul_description && <p className="sf3-about-text">{data.soul_description}</p>}
          {(data.certifications || []).length > 0 && (
            <ul className="sf3-creds">{data.certifications!.map((c) => (<li key={c}><Icon.check /> {c}</li>))}</ul>
          )}
          <a className="sf3-link" href={ctas.intakeUrl || ctas.bookUrl}>Our story <Icon.arrow /></a>
        </div>
      </div>
    </section>
  );
}

// ── Gallery (added section for this archetype) ─────────────────────────────
export function Gallery({ data }: { data: Soul }) {
  const gal = (data.photos || []).filter((p) => p && p.role === "gallery");
  const slots = [0, 1, 2, 3];
  return (
    <section className="sf3-sec sf3-wrap" id="gallery">
      <div className="sf3-intro" style={{ marginBottom: 32 }}>
        <p className="sf3-eyebrow">The Space</p><h2 className="sf3-h2">A glimpse inside</h2>
      </div>
      <div className="sf3-gallery">
        {slots.map((n) => (
          <div className={"sf3-gal sf3-gal-" + (n + 1)} key={n}>
            <SmartImage photo={gal[n]} role="gallery" label={"gallery 0" + (n + 1)} decorative={n !== 0} />
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Testimonial (single cinematic quote) ───────────────────────────────────
export function Testimonials({ data }: { data: Soul }) {
  const t = data.testimonials || [];
  if (!t.length) return null;
  const lead = t[0];
  return (
    <section className="sf3-sec sf3-wrap" id="reviews">
      <figure className="sf3-quote">
        <span className="sf3-quote-mark">{"\u201C"}</span>
        <blockquote>{lead.text}</blockquote>
        <figcaption>{"\u2014 " + lead.name}</figcaption>
      </figure>
    </section>
  );
}

// ── CTA band ───────────────────────────────────────────────────────────────
export function CtaBand({ data, ctas }: { data: Soul; ctas: CTAs }) {
  return (
    <section className="sf3-cta" id="contact">
      <div className="sf3-cta-media"><SmartImage photo={sfPhoto(data, "gallery", 1)} role="texture" label="texture" decorative /></div>
      <div className="sf3-cta-scrim" aria-hidden="true" />
      <div className="sf3-wrap sf3-cta-in">
        <p className="sf3-cta-eyebrow">Your ritual awaits</p>
        <h2 className="sf3-cta-h">Return to yourself</h2>
        <div className="sf3-cta-actions">
          <a className="sf3-btn sf3-btn-onimg-solid" href={ctas.bookUrl}>Reserve a Visit</a>
          {ctas.callHref && data.phone && <a className="sf3-btn sf3-btn-onimg" href={ctas.callHref}><Icon.phone /> {data.phone}</a>}
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
    cols.push(["Hours", data.hours.map((h) => (h.close ? `${h.day} \u00B7 ${h.open}\u2013${h.close}` : `${h.day} \u00B7 ${h.open}`)), "text"]);
  cols.push(["Follow", ["Instagram", "Journal"], "link"]);
  return (
    <footer className="sf3-foot">
      <div className="sf3-wrap sf3-foot-in">
        <div className="sf3-foot-brand">
          <span className="sf3-brand"><Icon.leaf className="sf3-brand-mark" /><span className="sf3-brand-name">{data.business_name}</span></span>
          {data.tagline && <p className="sf3-foot-tag">{data.tagline}</p>}
          <a className="sf3-btn sf3-btn-line" style={{ color: "var(--sf-bg)", borderColor: "color-mix(in oklab,var(--sf-bg) 40%,transparent)" }} href={ctas.bookUrl}>Reserve</a>
        </div>
        <div className="sf3-foot-cols">
          {cols.map(([h, items, kind]) => (
            <div className="sf3-foot-col" key={h}>
              <h3>{h}</h3>
              <ul>{items.map((x, i) => (<li key={i}>{kind === "link" ? <a href={ctas.bookUrl}>{x}</a> : x}</li>))}</ul>
            </div>
          ))}
        </div>
      </div>
      <div className="sf3-wrap sf3-foot-legal">
        <span>{"\u00A9 " + new Date().getFullYear() + " " + data.business_name}</span>
        <span>Privacy · Accessibility</span>
      </div>
    </footer>
  );
}

// ── Sticky mobile bar ──────────────────────────────────────────────────────
export function MobileBar({ data, ctas }: { data: Soul; ctas: CTAs }) {
  return (
    <div className="sf3-mbar" aria-label="Quick actions">
      {ctas.callHref && data.phone && <a className="sf3-mbar-call" href={ctas.callHref}><Icon.phone /> Call</a>}
      <a className="sf3-mbar-book" href={ctas.bookUrl}>Reserve</a>
    </div>
  );
}
