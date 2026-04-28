/**
 * Landing renderer — `general-service-v1`.
 *
 * Reads a Blueprint and emits a complete HTML+CSS string for the public
 * workspace home page. One renderer for ALL verticals; vertical-specific
 * differences come from the blueprint's section selection + content (per
 * Phase 1 decision 5).
 *
 * Determinism: same blueprint input → same byte-identical output. No
 * dates, no random IDs, no environment lookups. The only externalities
 * are pure helpers (HTML escaping, theme token derivation).
 *
 * Light mode only in v1.
 *
 * Exported entry points:
 *   - renderGeneralServiceV1(blueprint) → { html, css }
 *
 * The output `html` is a `<main>` block (no surrounding <html><head>);
 * the output `css` is a stylesheet that compiles cleanly when injected
 * into the existing landing-page renderer's <style> tag. The caller
 * (createDefaultLandingPage) stores these in landing_pages.contentHtml
 * and landing_pages.contentCss.
 */

import type {
  Blueprint,
  CTA,
  LandingSection,
  SectionAbout,
  SectionEmergencyStrip,
  SectionFaq,
  SectionFooter,
  SectionHero,
  SectionMidCta,
  SectionServiceArea,
  SectionServicesGrid,
  SectionTestimonials,
  SectionTrustStrip,
  Testimonial,
  WeeklyHours,
} from "../types";
import { buildThemeTokens } from "../theme";

// ─── Public entry point ────────────────────────────────────────────────

export interface RenderedLanding {
  /** The <main> body HTML, without <html>/<head>/<body> wrappers. */
  html: string;
  /**
   * Stylesheet text. Includes the :root token block + all section styles.
   * Caller injects into a <style> tag (or stores on landing_pages.contentCss
   * which the existing renderer wraps automatically).
   */
  css: string;
}

export function renderGeneralServiceV1(blueprint: Blueprint): RenderedLanding {
  const themeCss = buildThemeTokens(blueprint.workspace.theme, { surface: "landing" });

  const sectionsHtml = blueprint.landing.sections
    .map((section) => renderSection(section, blueprint))
    .filter(Boolean)
    .join("\n");

  const html = `<main class="sf-landing">\n${sectionsHtml}\n</main>`;

  const css = [themeCss, BASE_CSS].join("\n\n");

  return { html, css };
}

// ─── Section dispatcher ────────────────────────────────────────────────

function renderSection(section: LandingSection, blueprint: Blueprint): string {
  switch (section.type) {
    case "emergency-strip":
      return renderEmergencyStrip(section, blueprint);
    case "hero":
      return renderHero(section, blueprint);
    case "trust-strip":
      return renderTrustStrip(section);
    case "services-grid":
      return renderServicesGrid(section);
    case "about":
      return renderAbout(section);
    case "mid-cta":
      return renderMidCta(section);
    case "testimonials":
      return renderTestimonials(section);
    case "service-area":
      return renderServiceArea(section);
    case "faq":
      return renderFaq(section);
    case "footer":
      return renderFooter(section, blueprint);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function ctaClass(kind: CTA["kind"]): string {
  switch (kind) {
    case "secondary":
      return "sf-btn sf-btn--secondary";
    case "ghost":
      return "sf-btn sf-btn--ghost";
    case "tel":
      return "sf-btn sf-btn--tel";
    case "primary":
    default:
      return "sf-btn sf-btn--primary";
  }
}

function renderCta(cta: CTA): string {
  const href = cta.href ?? "#";
  return `<a class="${ctaClass(cta.kind)}" href="${escapeAttr(href)}">${escapeHtml(cta.label)}</a>`;
}

function renderHoursList(hours: WeeklyHours): string {
  const dayLabels: Array<[keyof WeeklyHours, string]> = [
    ["mon", "Mon"],
    ["tue", "Tue"],
    ["wed", "Wed"],
    ["thu", "Thu"],
    ["fri", "Fri"],
    ["sat", "Sat"],
    ["sun", "Sun"],
  ];
  const rows = dayLabels
    .map(([key, label]) => {
      const range = hours[key];
      const value = range === null ? "Closed" : `${formatHour(range[0])} – ${formatHour(range[1])}`;
      return `<li><span class="sf-hours__day">${label}</span><span class="sf-hours__range">${escapeHtml(value)}</span></li>`;
    })
    .join("");
  return `<ul class="sf-hours">${rows}</ul>`;
}

function formatHour(h: number): string {
  // 24h → 12h with am/pm. 0 = 12am, 12 = 12pm, 24 = 12am next day (treated as 12am)
  const hour = h === 24 ? 0 : h;
  const period = hour < 12 || hour === 24 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${period}`;
}

function formatPhoneDisplay(e164: string): string {
  // E.164 like +18175551234 → "(817) 555-1234" for NANP, fallback to original.
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}

function ensureTelHref(href: string): string {
  if (href.startsWith("tel:")) return href;
  // Already-absolute-ish? Otherwise prepend tel:.
  return `tel:${href.replace(/[^+0-9]/g, "")}`;
}

// ─── Section renderers ────────────────────────────────────────────────

function renderEmergencyStrip(section: SectionEmergencyStrip, blueprint: Blueprint): string {
  const phone = blueprint.workspace.contact.emergencyPhone ?? blueprint.workspace.contact.phone;
  const phoneLabel = section.phoneLabel ?? formatPhoneDisplay(phone);
  return `<aside class="sf-emergency" role="alert">
  <span class="sf-emergency__label">${escapeHtml(section.label)}</span>
  <a class="sf-emergency__phone" href="${escapeAttr(ensureTelHref(phone))}">${escapeHtml(phoneLabel)}</a>
</aside>`;
}

function renderHero(section: SectionHero, blueprint: Blueprint): string {
  const variantClass = `sf-hero--${section.variant ?? "split-image-right"}`;
  const eyebrow = section.eyebrow
    ? `<p class="sf-hero__eyebrow">${escapeHtml(section.eyebrow)}</p>`
    : "";
  const subhead = section.subhead
    ? `<p class="sf-hero__subhead">${escapeHtml(section.subhead)}</p>`
    : "";
  const ctaSecondary = section.ctaSecondary ? renderCta(section.ctaSecondary) : "";
  const imageUrl = section.imageUrl ?? blueprint.workspace.theme.heroImageUrl ?? null;
  const image = imageUrl
    ? `<div class="sf-hero__image"><img src="${escapeAttr(imageUrl)}" alt="" loading="eager" /></div>`
    : `<div class="sf-hero__image sf-hero__image--placeholder" aria-hidden="true">
        <span class="sf-hero__placeholder-hint">Add a photo of your team or office</span>
      </div>`;
  return `<section class="sf-hero ${variantClass}">
  <div class="sf-hero__content">
    ${eyebrow}
    <h1 class="sf-hero__headline">${escapeHtml(section.headline)}</h1>
    ${subhead}
    <div class="sf-hero__ctas">
      ${renderCta(section.ctaPrimary)}
      ${ctaSecondary}
    </div>
  </div>
  ${image}
</section>`;
}

function renderTrustStrip(section: SectionTrustStrip): string {
  const items = section.items
    .map(
      (item) => `<li class="sf-trust__item">
      <span class="sf-trust__label">${escapeHtml(item.label)}</span>
    </li>`
    )
    .join("\n");
  return `<aside class="sf-trust">
  <ul class="sf-trust__list">
    ${items}
  </ul>
</aside>`;
}

function renderServicesGrid(section: SectionServicesGrid): string {
  const headline = section.headline ?? "Services";
  const subhead = section.subhead
    ? `<p class="sf-services__subhead">${escapeHtml(section.subhead)}</p>`
    : "";
  const layout = section.layout ?? "grid-3";
  const layoutClass = `sf-services--${layout}`;
  const items = section.items
    .map((item) => {
      const price = item.priceFrom
        ? `<p class="sf-service__price">${escapeHtml(item.priceFrom)}</p>`
        : "";
      const link = item.learnMoreUrl
        ? `<a class="sf-service__link" href="${escapeAttr(item.learnMoreUrl)}">Learn more →</a>`
        : "";
      return `<article class="sf-service">
      <h3 class="sf-service__title">${escapeHtml(item.title)}</h3>
      <p class="sf-service__description">${escapeHtml(item.description)}</p>
      ${price}
      ${link}
    </article>`;
    })
    .join("\n");
  return `<section class="sf-services ${layoutClass}">
  <header class="sf-services__header">
    <h2 class="sf-services__headline">${escapeHtml(headline)}</h2>
    ${subhead}
  </header>
  <div class="sf-services__grid">
    ${items}
  </div>
</section>`;
}

function renderAbout(section: SectionAbout): string {
  const photo = section.photoUrl
    ? `<div class="sf-about__photo"><img src="${escapeAttr(section.photoUrl)}" alt="" /></div>`
    : `<div class="sf-about__photo sf-about__photo--placeholder" aria-hidden="true">
        <span class="sf-about__placeholder-hint">Add a photo of your team</span>
      </div>`;
  const owner = section.ownerName
    ? `<p class="sf-about__owner"><strong>${escapeHtml(section.ownerName)}</strong>${
        section.ownerTitle ? `, <span class="sf-about__owner-title">${escapeHtml(section.ownerTitle)}</span>` : ""
      }</p>`
    : "";
  return `<section class="sf-about">
  ${photo}
  <div class="sf-about__copy">
    <h2 class="sf-about__headline">${escapeHtml(section.headline)}</h2>
    <p class="sf-about__body">${escapeHtml(section.body)}</p>
    ${owner}
  </div>
</section>`;
}

function renderMidCta(section: SectionMidCta): string {
  const subhead = section.subhead
    ? `<p class="sf-mid-cta__subhead">${escapeHtml(section.subhead)}</p>`
    : "";
  const primary = section.ctaPrimary ? renderCta(section.ctaPrimary) : "";
  const secondary = section.ctaSecondary ? renderCta(section.ctaSecondary) : "";
  return `<section class="sf-mid-cta">
  <div class="sf-mid-cta__inner">
    <h2 class="sf-mid-cta__headline">${escapeHtml(section.headline)}</h2>
    ${subhead}
    <div class="sf-mid-cta__ctas">
      ${primary}
      ${secondary}
    </div>
  </div>
</section>`;
}

function renderTestimonialCard(t: Testimonial): string {
  const role = t.authorRole ? `<span class="sf-quote__role">${escapeHtml(t.authorRole)}</span>` : "";
  const stars = t.rating
    ? `<span class="sf-quote__stars" aria-label="${t.rating} out of 5 stars">${"★".repeat(t.rating)}${"☆".repeat(5 - t.rating)}</span>`
    : "";
  return `<figure class="sf-quote">
    <blockquote class="sf-quote__text">${escapeHtml(t.quote)}</blockquote>
    <figcaption class="sf-quote__attribution">
      <strong class="sf-quote__name">${escapeHtml(t.authorName)}</strong>
      ${role}
      ${stars}
    </figcaption>
  </figure>`;
}

function renderTestimonials(section: SectionTestimonials): string {
  const headline = section.headline ?? "What our customers say";
  const featured = section.featured
    ? `<div class="sf-testimonials__featured">${renderTestimonialCard(section.featured)}</div>`
    : "";
  const grid = section.items.map((t) => renderTestimonialCard(t)).join("\n");
  return `<section class="sf-testimonials">
  <h2 class="sf-testimonials__headline">${escapeHtml(headline)}</h2>
  ${featured}
  <div class="sf-testimonials__grid">
    ${grid}
  </div>
</section>`;
}

function renderServiceArea(section: SectionServiceArea): string {
  const headline = section.headline ?? "Service area";
  const map = section.mapEmbedUrl
    ? `<div class="sf-service-area__map"><iframe src="${escapeAttr(section.mapEmbedUrl)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Service area map"></iframe></div>`
    : "";
  const cities =
    section.cities && section.cities.length > 0
      ? `<ul class="sf-service-area__cities">${section.cities
          .map((c) => `<li>${escapeHtml(c)}</li>`)
          .join("")}</ul>`
      : "";
  return `<section class="sf-service-area">
  <div class="sf-service-area__copy">
    <h2 class="sf-service-area__headline">${escapeHtml(headline)}</h2>
    <p class="sf-service-area__description">${escapeHtml(section.description)}</p>
    ${cities}
  </div>
  ${map}
</section>`;
}

function renderFaq(section: SectionFaq): string {
  const headline = section.headline ?? "Frequently asked questions";
  const items = section.items
    .map(
      (item) => `<details class="sf-faq__item">
      <summary class="sf-faq__question">${escapeHtml(item.question)}</summary>
      <div class="sf-faq__answer">${escapeHtml(item.answer)}</div>
    </details>`
    )
    .join("\n");
  return `<section class="sf-faq">
  <h2 class="sf-faq__headline">${escapeHtml(headline)}</h2>
  <div class="sf-faq__list">
    ${items}
  </div>
</section>`;
}

function renderFooter(section: SectionFooter, blueprint: Blueprint): string {
  const ws = blueprint.workspace;
  const phone = ws.contact.phone;
  const phoneDisplay = formatPhoneDisplay(phone);

  const showHours = section.showHours ?? true;
  const showAddress = section.showAddress ?? true;
  const showServiceArea = section.showServiceArea ?? true;

  const addressBlock =
    showAddress && ws.contact.address
      ? `<div class="sf-footer__col">
          <h3 class="sf-footer__heading">Visit</h3>
          <address class="sf-footer__address">
            ${escapeHtml(ws.contact.address.street)}<br />
            ${escapeHtml(ws.contact.address.city)}, ${escapeHtml(ws.contact.address.region)} ${escapeHtml(ws.contact.address.postalCode)}
          </address>
        </div>`
      : "";

  const hoursBlock = showHours
    ? `<div class="sf-footer__col">
        <h3 class="sf-footer__heading">Hours</h3>
        ${renderHoursList(ws.contact.hours)}
      </div>`
    : "";

  const serviceAreaBlock =
    showServiceArea && ws.contact.serviceArea
      ? `<div class="sf-footer__col">
          <h3 class="sf-footer__heading">Service area</h3>
          <p class="sf-footer__service-area">${escapeHtml(ws.contact.serviceArea)}</p>
        </div>`
      : "";

  const social = section.social && section.social.length > 0
    ? `<ul class="sf-footer__social">${section.social
        .map(
          (s) =>
            `<li><a href="${escapeAttr(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.network)}</a></li>`
        )
        .join("")}</ul>`
    : "";

  const legal = section.legal && section.legal.length > 0
    ? `<ul class="sf-footer__legal">${section.legal
        .map((l) => `<li><a href="${escapeAttr(l.href)}">${escapeHtml(l.label)}</a></li>`)
        .join("")}</ul>`
    : "";

  return `<footer class="sf-footer">
  <div class="sf-footer__top">
    <div class="sf-footer__col sf-footer__col--brand">
      <p class="sf-footer__name">${escapeHtml(ws.name)}</p>
      ${ws.tagline ? `<p class="sf-footer__tagline">${escapeHtml(ws.tagline)}</p>` : ""}
      <a class="sf-footer__phone" href="${escapeAttr(ensureTelHref(phone))}">${escapeHtml(phoneDisplay)}</a>
    </div>
    ${addressBlock}
    ${hoursBlock}
    ${serviceAreaBlock}
  </div>
  <div class="sf-footer__bottom">
    ${social}
    ${legal}
    <p class="sf-footer__poweredby">Powered by <a href="https://seldonframe.com" target="_blank" rel="noopener noreferrer">SeldonFrame</a></p>
  </div>
</footer>`;
}

// ─── Stylesheet ────────────────────────────────────────────────────────

/**
 * Base CSS for general-service-v1. Reads from --sf-* tokens emitted by
 * buildThemeTokens; only the layout/spacing/typography rules live here.
 *
 * Mobile-first: default styles target mobile, `@media (min-width: 768px)`
 * adds desktop. No dark mode — light only in v1.
 *
 * Critical decisions per Phase 1:
 *   - Hairline 1px borders, no shadows on static surfaces
 *   - Generous section padding (96-128px desktop)
 *   - Body type 17-18px, not 14-16px
 *   - Sticky mobile call bar via fixed position on small viewports
 */
const BASE_CSS = `/* === sf-landing — general-service-v1 === */
.sf-landing {
  background: var(--sf-bg-primary);
  color: var(--sf-fg-primary);
  font-family: var(--sf-font-body);
  font-size: 17px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.sf-landing * { box-sizing: border-box; }
.sf-landing h1, .sf-landing h2, .sf-landing h3 {
  font-family: var(--sf-font-display);
  color: var(--sf-fg-emphasis);
  letter-spacing: -0.02em;
  margin: 0;
}
.sf-landing p { margin: 0; }
.sf-landing a { color: inherit; }

/* CTA buttons */
.sf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 1.25rem;
  border-radius: var(--sf-radius-md);
  font-weight: 600;
  font-size: 0.9375rem;
  text-decoration: none;
  transition: background-color 120ms ease, color 120ms ease, transform 120ms ease;
  border: 1px solid transparent;
  cursor: pointer;
}
.sf-btn--primary {
  background: var(--sf-accent);
  color: var(--sf-accent-fg);
}
.sf-btn--primary:hover { background: var(--sf-accent-hover); }
.sf-btn--secondary {
  background: var(--sf-bg-primary);
  color: var(--sf-fg-emphasis);
  border-color: var(--sf-border-default);
}
.sf-btn--secondary:hover { background: var(--sf-bg-muted); }
.sf-btn--ghost {
  background: transparent;
  color: var(--sf-fg-emphasis);
}
.sf-btn--ghost:hover { background: var(--sf-bg-muted); }
.sf-btn--tel {
  background: var(--sf-bg-primary);
  color: var(--sf-fg-emphasis);
  border-color: var(--sf-border-default);
}
.sf-btn--tel:hover { background: var(--sf-bg-muted); }

/* Emergency strip */
.sf-emergency {
  background: var(--sf-danger);
  color: #ffffff;
  padding: 0.75rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-weight: 600;
  font-size: 0.9375rem;
}
.sf-emergency__label { opacity: 0.95; }
.sf-emergency__phone {
  color: #ffffff;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 4px;
}

/* Hero */
.sf-hero {
  display: grid;
  gap: var(--sf-space-12);
  padding: var(--sf-space-16) var(--sf-space-6);
  max-width: 1200px;
  margin: 0 auto;
}
.sf-hero__eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.75rem;
  color: var(--sf-fg-muted);
  margin-bottom: 1rem;
  font-weight: 600;
}
.sf-hero__headline {
  font-size: clamp(2.25rem, 5vw, 3.5rem);
  line-height: 1.05;
  font-weight: 700;
  margin-bottom: 1.25rem;
}
.sf-hero__subhead {
  font-size: 1.125rem;
  color: var(--sf-fg-muted);
  margin-bottom: 2rem;
  max-width: 36rem;
}
.sf-hero__ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.sf-hero__image {
  border-radius: var(--sf-radius-xl);
  overflow: hidden;
  background: var(--sf-bg-secondary);
  border: 1px solid var(--sf-border-subtle);
  aspect-ratio: 4 / 3;
}
.sf-hero__image img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sf-hero__image--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--sf-bg-secondary) 0%, var(--sf-bg-muted) 100%);
}
.sf-hero__placeholder-hint {
  color: var(--sf-fg-subtle);
  font-size: 0.875rem;
  font-style: italic;
  padding: 1rem;
  text-align: center;
}
@media (min-width: 768px) {
  .sf-hero { padding: var(--sf-space-24) var(--sf-space-8); grid-template-columns: 1fr 1fr; align-items: center; }
  .sf-hero--full-bleed { grid-template-columns: 1fr; max-width: none; padding: 0; }
  .sf-hero--full-bleed .sf-hero__image { aspect-ratio: 21 / 9; border-radius: 0; border: 0; }
  .sf-hero--full-bleed .sf-hero__content { padding: var(--sf-space-16) var(--sf-space-8); max-width: 1200px; margin: 0 auto; }
  .sf-hero--founder-portrait .sf-hero__image { aspect-ratio: 3 / 4; max-width: 24rem; }
}

/* Trust strip */
.sf-trust {
  background: var(--sf-bg-secondary);
  border-top: 1px solid var(--sf-border-subtle);
  border-bottom: 1px solid var(--sf-border-subtle);
  padding: var(--sf-space-4) var(--sf-space-6);
}
.sf-trust__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--sf-space-6);
  font-size: 0.875rem;
  color: var(--sf-fg-muted);
  font-weight: 500;
}
.sf-trust__item { white-space: nowrap; }

/* Services grid */
.sf-services {
  padding: var(--sf-space-16) var(--sf-space-6);
  max-width: 1200px;
  margin: 0 auto;
}
.sf-services__header { text-align: center; margin-bottom: var(--sf-space-12); }
.sf-services__headline { font-size: clamp(1.75rem, 3.5vw, 2.5rem); margin-bottom: 0.75rem; }
.sf-services__subhead { color: var(--sf-fg-muted); max-width: 36rem; margin: 0 auto; }
.sf-services__grid {
  display: grid;
  gap: var(--sf-space-6);
  grid-template-columns: 1fr;
}
@media (min-width: 768px) {
  .sf-services { padding: var(--sf-space-24) var(--sf-space-8); }
  .sf-services--grid-3 .sf-services__grid { grid-template-columns: repeat(3, 1fr); }
  .sf-services--grid-4 .sf-services__grid { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 1024px) {
  .sf-services--grid-4 .sf-services__grid { grid-template-columns: repeat(4, 1fr); }
}
.sf-service {
  background: var(--sf-bg-primary);
  border: 1px solid var(--sf-border-default);
  border-radius: var(--sf-radius-lg);
  padding: var(--sf-space-6);
  transition: border-color 150ms ease;
}
.sf-service:hover { border-color: var(--sf-border-strong); }
.sf-service__title { font-size: 1.25rem; margin-bottom: 0.5rem; }
.sf-service__description { color: var(--sf-fg-muted); font-size: 0.9375rem; }
.sf-service__price { color: var(--sf-accent); font-weight: 600; margin-top: 1rem; font-size: 0.875rem; }
.sf-service__link {
  display: inline-block;
  margin-top: 1rem;
  color: var(--sf-accent);
  font-weight: 600;
  font-size: 0.875rem;
  text-decoration: none;
}
.sf-service__link:hover { text-decoration: underline; }

/* About */
.sf-about {
  background: var(--sf-bg-secondary);
  padding: var(--sf-space-16) var(--sf-space-6);
}
.sf-about > * { max-width: 1200px; margin: 0 auto; }
.sf-about__photo {
  border-radius: var(--sf-radius-xl);
  overflow: hidden;
  margin-bottom: var(--sf-space-8);
  aspect-ratio: 3 / 2;
  background: var(--sf-bg-muted);
  border: 1px solid var(--sf-border-subtle);
}
.sf-about__photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sf-about__photo--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--sf-bg-secondary) 0%, var(--sf-bg-muted) 100%);
}
.sf-about__placeholder-hint {
  color: var(--sf-fg-subtle);
  font-size: 0.875rem;
  font-style: italic;
  padding: 1rem;
  text-align: center;
}
.sf-about__copy { max-width: 36rem; margin: 0 auto; }
.sf-about__headline { font-size: clamp(1.75rem, 3.5vw, 2.5rem); margin-bottom: 1rem; }
.sf-about__body { font-size: 1.0625rem; color: var(--sf-fg-primary); margin-bottom: 1.25rem; }
.sf-about__owner { color: var(--sf-fg-muted); }
.sf-about__owner-title { font-weight: 400; }
@media (min-width: 768px) {
  .sf-about { padding: var(--sf-space-24) var(--sf-space-8); }
  .sf-about > * { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sf-space-12); align-items: center; }
  .sf-about__photo { margin-bottom: 0; }
}

/* Mid CTA */
.sf-mid-cta {
  padding: var(--sf-space-16) var(--sf-space-6);
  background: var(--sf-accent-soft);
  text-align: center;
}
.sf-mid-cta__inner { max-width: 36rem; margin: 0 auto; }
.sf-mid-cta__headline { font-size: clamp(1.75rem, 3.5vw, 2.5rem); margin-bottom: 0.75rem; }
.sf-mid-cta__subhead { color: var(--sf-fg-muted); margin-bottom: 2rem; font-size: 1.0625rem; }
.sf-mid-cta__ctas { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; }
@media (min-width: 768px) { .sf-mid-cta { padding: var(--sf-space-24) var(--sf-space-8); } }

/* Testimonials */
.sf-testimonials {
  padding: var(--sf-space-16) var(--sf-space-6);
  max-width: 1200px;
  margin: 0 auto;
}
.sf-testimonials__headline { font-size: clamp(1.75rem, 3.5vw, 2.5rem); text-align: center; margin-bottom: var(--sf-space-12); }
.sf-testimonials__featured { max-width: 48rem; margin: 0 auto var(--sf-space-12); }
.sf-testimonials__featured .sf-quote__text { font-size: 1.5rem; line-height: 1.4; }
.sf-testimonials__grid {
  display: grid;
  gap: var(--sf-space-6);
  grid-template-columns: 1fr;
}
@media (min-width: 768px) {
  .sf-testimonials { padding: var(--sf-space-24) var(--sf-space-8); }
  .sf-testimonials__grid { grid-template-columns: repeat(3, 1fr); }
}
.sf-quote {
  background: var(--sf-bg-secondary);
  border: 1px solid var(--sf-border-subtle);
  border-radius: var(--sf-radius-lg);
  padding: var(--sf-space-6);
  margin: 0;
}
.sf-quote__text {
  font-family: var(--sf-font-display);
  font-size: 1.0625rem;
  line-height: 1.5;
  color: var(--sf-fg-emphasis);
  margin: 0 0 1.25rem;
  font-style: normal;
}
.sf-quote__attribution { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; }
.sf-quote__name { color: var(--sf-fg-emphasis); font-weight: 600; }
.sf-quote__role { color: var(--sf-fg-muted); }
.sf-quote__stars { color: #f59e0b; letter-spacing: 0.05em; margin-top: 0.25rem; }

/* Service area */
.sf-service-area {
  background: var(--sf-bg-secondary);
  padding: var(--sf-space-16) var(--sf-space-6);
}
.sf-service-area > * { max-width: 1200px; margin: 0 auto; }
.sf-service-area__headline { font-size: clamp(1.5rem, 3vw, 2rem); margin-bottom: 0.75rem; }
.sf-service-area__description { color: var(--sf-fg-muted); margin-bottom: 1.25rem; max-width: 42rem; }
.sf-service-area__cities {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-wrap: wrap; gap: 0.5rem;
}
.sf-service-area__cities li {
  background: var(--sf-bg-primary);
  border: 1px solid var(--sf-border-subtle);
  border-radius: var(--sf-radius-pill);
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
  color: var(--sf-fg-muted);
}
.sf-service-area__map {
  margin-top: var(--sf-space-8);
  border-radius: var(--sf-radius-lg);
  overflow: hidden;
  border: 1px solid var(--sf-border-subtle);
  aspect-ratio: 16 / 9;
}
.sf-service-area__map iframe { width: 100%; height: 100%; border: 0; display: block; }
@media (min-width: 768px) { .sf-service-area { padding: var(--sf-space-24) var(--sf-space-8); } }

/* FAQ */
.sf-faq {
  padding: var(--sf-space-16) var(--sf-space-6);
  max-width: 48rem;
  margin: 0 auto;
}
.sf-faq__headline { font-size: clamp(1.75rem, 3.5vw, 2.5rem); text-align: center; margin-bottom: var(--sf-space-12); }
.sf-faq__list { display: flex; flex-direction: column; gap: 0; }
.sf-faq__item {
  border-bottom: 1px solid var(--sf-border-subtle);
  padding: var(--sf-space-4) 0;
}
.sf-faq__item:first-child { border-top: 1px solid var(--sf-border-subtle); }
.sf-faq__question {
  cursor: pointer;
  font-weight: 600;
  font-size: 1.0625rem;
  color: var(--sf-fg-emphasis);
  list-style: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.sf-faq__question::-webkit-details-marker { display: none; }
.sf-faq__question::after {
  content: "+";
  font-weight: 400;
  font-size: 1.5rem;
  color: var(--sf-fg-subtle);
  transition: transform 200ms ease;
}
.sf-faq__item[open] .sf-faq__question::after { transform: rotate(45deg); }
.sf-faq__answer {
  margin-top: 1rem;
  color: var(--sf-fg-muted);
  font-size: 1rem;
  line-height: 1.6;
}
@media (min-width: 768px) { .sf-faq { padding: var(--sf-space-24) var(--sf-space-8); } }

/* Footer */
.sf-footer {
  background: var(--sf-fg-emphasis);
  color: #d4d4d4;
  padding: var(--sf-space-16) var(--sf-space-6) var(--sf-space-8);
  font-size: 0.9375rem;
}
.sf-footer h3 { color: #ffffff; }
.sf-footer a { color: #d4d4d4; text-decoration: none; }
.sf-footer a:hover { color: #ffffff; }
.sf-footer__top {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  gap: var(--sf-space-8);
  grid-template-columns: 1fr;
}
@media (min-width: 768px) {
  .sf-footer { padding: var(--sf-space-24) var(--sf-space-8) var(--sf-space-8); }
  .sf-footer__top { grid-template-columns: repeat(4, 1fr); }
}
.sf-footer__col--brand { display: flex; flex-direction: column; gap: 0.5rem; }
.sf-footer__name { font-family: var(--sf-font-display); font-size: 1.25rem; color: #ffffff; font-weight: 600; }
.sf-footer__tagline { color: #999999; font-size: 0.875rem; }
.sf-footer__phone { font-weight: 600; color: #ffffff !important; margin-top: 0.5rem; }
.sf-footer__heading { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.12em; margin: 0 0 0.75rem; font-weight: 600; }
.sf-footer__address { font-style: normal; line-height: 1.6; }
.sf-hours { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.sf-hours li { display: flex; justify-content: space-between; gap: 1rem; }
.sf-hours__day { color: #999999; }
.sf-footer__service-area { color: #d4d4d4; }
.sf-footer__bottom {
  max-width: 1200px;
  margin: var(--sf-space-12) auto 0;
  padding-top: var(--sf-space-6);
  border-top: 1px solid #333333;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.8125rem;
  color: #999999;
}
.sf-footer__social, .sf-footer__legal { list-style: none; padding: 0; margin: 0; display: flex; gap: 1rem; flex-wrap: wrap; }
.sf-footer__poweredby a { color: #ffffff; }

/* Sticky mobile call bar — only on mobile when hero has a phone CTA */
@media (max-width: 767px) {
  .sf-landing { padding-bottom: 4rem; }
  .sf-btn--tel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    margin: 0;
    border-radius: 0;
    height: 3.5rem;
    background: var(--sf-accent);
    color: var(--sf-accent-fg);
    border: 0;
    font-size: 1rem;
    font-weight: 700;
    z-index: 50;
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
  }
  .sf-hero__ctas .sf-btn--tel { position: static; width: 100%; box-shadow: none; }
}
`;
