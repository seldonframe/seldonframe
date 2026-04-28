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
 *
 * C3.1 visual elevation:
 *   - Cal Sans display + Instrument Serif italic accent + Inter body
 *   - Headline clamp(36px, 8vw, 72px), letter-spacing -0.03em
 *   - Pill (rounded-full) buttons with layered drop shadows
 *   - Inline SVG icons for service cards (no external assets)
 *   - Alternating section backgrounds for rhythm
 *   - Mid-CTA gradient background
 *   - FAQ "+"→"×" rotation, smooth open/close
 *   - Dark #1A1A2E footer with brand-tinted "Powered by"
 *   - Emergency strip deeper red #991B1B with phone-icon pulse
 *   - IntersectionObserver scroll-triggered fade-up animation
 *   - Sticky bottom call bar on mobile
 *
 * C3.1 placeholder resolution:
 *   - Templates ship with `[City]`, `[Owner Name]`, etc. placeholders so
 *     operators see structure without scaffolding fake data. The renderer
 *     hides any element whose copy still contains an unresolved bracket
 *     pattern — better an empty space than `[County] and surrounding
 *     counties` shown to a real customer. Once the operator runs
 *     update_landing_content the placeholders disappear and the elements
 *     come back.
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
    .filter((s) => s && s.length > 0)
    .join("\n");

  // ScrollObserver script is appended once after the <main>. Keeping it in
  // the rendered HTML (not a separate `js` field) lets landing_pages store
  // a single self-contained string and stays compatible with the existing
  // contentHtml / contentCss pipeline.
  const html = `<main class="sf-landing">\n${sectionsHtml}\n</main>\n${SCROLL_OBSERVER_SCRIPT}`;

  const css = [themeCss, BASE_CSS].join("\n\n");

  return { html, css };
}

// ─── Section dispatcher ────────────────────────────────────────────────

function renderSection(section: LandingSection, blueprint: Blueprint): string {
  switch (section.type) {
    case "emergency-strip":
      return renderEmergencyStrip(section, blueprint);
    case "hero":
      return renderHero(section);
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

/**
 * True if string contains an unresolved `[Bracketed Slot]` placeholder.
 * Templates use these for operator-supplied details (city, county, owner
 * name, etc.). Anything element rendering one of these should be hidden
 * until the operator fills it in via update_landing_content / NL tools.
 */
function hasPlaceholder(s: string): boolean {
  return /\[[^\]]+\]/.test(s);
}

/**
 * Returns `s` if it has no placeholders (and is non-empty), otherwise null.
 * Use to conditionally render a single piece of copy.
 */
function resolveOrHide(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (trimmed.length === 0) return null;
  if (hasPlaceholder(trimmed)) return null;
  return s;
}

/**
 * Renders a headline that supports `*italic accent*` markers — words wrapped
 * in single asterisks become Instrument-Serif italics inline with the
 * Cal-Sans display headline. Example:
 *
 *   "Software *for visionary minds*"  →  Software <em class="sf-italic">for visionary minds</em>
 *
 * Templates aren't required to use the marker; plain headlines render as-is.
 * HTML escaping happens BEFORE the asterisk processing, so user-supplied
 * `<script>` payloads stay escaped.
 */
function renderEmphasis(s: string): string {
  return escapeHtml(s).replace(/\*([^*]+)\*/g, '<em class="sf-italic">$1</em>');
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
  return `tel:${href.replace(/[^+0-9]/g, "")}`;
}

// ─── Inline SVG icons ─────────────────────────────────────────────────

/**
 * Maps blueprint icon names (drawn from the Lucide-style set used in
 * skills/templates/*.json) to inline SVG markup. Inline SVGs avoid an
 * external icon-font dependency, render byte-identically across all
 * runtimes, and inherit the page color via `currentColor`.
 *
 * Stroke width 1.75 reads as premium without being chunky.
 *
 * Unknown names fall back to a generic dot — never throws or returns
 * empty, so the renderer stays deterministic for arbitrary icon strings.
 */
function iconSvg(name: string | undefined): string {
  const key = (name ?? "").toLowerCase();
  const svg = ICON_MAP[key] ?? ICON_MAP._default;
  return `<span class="sf-icon" aria-hidden="true">${svg}</span>`;
}

// 24x24 viewBox, stroke 1.75, currentColor — single line definitions kept
// flat for readability + diffability.
const ICON_MAP: Record<string, string> = {
  wind: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>`,
  flame: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  settings2: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>`,
  calendarcheck: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/></svg>`,
  phonecall: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  star: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  shieldcheck: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  award: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>`,
  badgecheck: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg>`,
  _default: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/></svg>`,
};

// ─── Section renderers ────────────────────────────────────────────────

function renderEmergencyStrip(section: SectionEmergencyStrip, blueprint: Blueprint): string {
  const phone = blueprint.workspace.contact.emergencyPhone ?? blueprint.workspace.contact.phone;
  const phoneLabel = section.phoneLabel ?? formatPhoneDisplay(phone);
  if (hasPlaceholder(section.label) || hasPlaceholder(phoneLabel)) return "";
  return `<aside class="sf-emergency" role="alert">
  <span class="sf-emergency__icon" aria-hidden="true">${ICON_MAP.phonecall}</span>
  <span class="sf-emergency__label">${escapeHtml(section.label)}</span>
  <a class="sf-emergency__phone" href="${escapeAttr(ensureTelHref(phone))}">${escapeHtml(phoneLabel)}</a>
</aside>`;
}

function renderHero(section: SectionHero): string {
  // Hero is the most important above-the-fold real estate. C3.1 ditches the
  // gray-placeholder image column when no real image is provided — empty
  // boxes look amateur. Headline is required by the schema, so a hero
  // always has at least its core copy.
  if (hasPlaceholder(section.headline)) return "";

  const eyebrow = resolveOrHide(section.eyebrow);
  const subhead = resolveOrHide(section.subhead);
  const eyebrowHtml = eyebrow ? `<p class="sf-hero__eyebrow sf-animate">${escapeHtml(eyebrow)}</p>` : "";
  const subheadHtml = subhead
    ? `<p class="sf-hero__subhead sf-animate sf-delay-2">${escapeHtml(subhead)}</p>`
    : "";

  const ctaSecondary = section.ctaSecondary && !hasPlaceholder(section.ctaSecondary.label)
    ? renderCta(section.ctaSecondary)
    : "";

  // Variant kept on the wrapper for CSS hooks, but C3.1 uses a single
  // centered full-bleed layout regardless — image columns are out.
  const variantClass = `sf-hero--${section.variant ?? "split-image-right"}`;

  return `<section class="sf-hero ${variantClass}">
  <div class="sf-hero__content">
    ${eyebrowHtml}
    <h1 class="sf-hero__headline sf-animate sf-delay-1">${renderEmphasis(section.headline)}</h1>
    ${subheadHtml}
    <div class="sf-hero__ctas sf-animate sf-delay-3">
      ${renderCta(section.ctaPrimary)}
      ${ctaSecondary}
    </div>
  </div>
</section>`;
}

function renderTrustStrip(section: SectionTrustStrip): string {
  const visible = section.items.filter((it) => !hasPlaceholder(it.label));
  if (visible.length === 0) return "";

  const items = visible
    .map((item) => {
      const icon = item.icon ? iconSvg(item.icon) : "";
      return `<li class="sf-trust__item">
      ${icon}
      <span class="sf-trust__label">${escapeHtml(item.label)}</span>
    </li>`;
    })
    .join("\n");
  return `<aside class="sf-trust sf-animate">
  <ul class="sf-trust__list">
    ${items}
  </ul>
</aside>`;
}

function renderServicesGrid(section: SectionServicesGrid): string {
  const headline = section.headline ?? "Services";
  if (hasPlaceholder(headline)) return "";
  const subhead = resolveOrHide(section.subhead);
  const subheadHtml = subhead
    ? `<p class="sf-services__subhead">${escapeHtml(subhead)}</p>`
    : "";

  const visible = section.items.filter(
    (it) => !hasPlaceholder(it.title) && !hasPlaceholder(it.description)
  );
  if (visible.length === 0) return "";

  const layout = section.layout ?? "grid-3";
  const layoutClass = `sf-services--${layout}`;
  const items = visible
    .map((item, idx) => {
      const icon = iconSvg(item.icon);
      const price = item.priceFrom && !hasPlaceholder(item.priceFrom)
        ? `<p class="sf-service__price">${escapeHtml(item.priceFrom)}</p>`
        : "";
      const link = item.learnMoreUrl
        ? `<a class="sf-service__link" href="${escapeAttr(item.learnMoreUrl)}">Learn more →</a>`
        : "";
      // Stagger visible items for a subtle reveal cascade.
      const delay = `sf-delay-${(idx % 4) + 1}`;
      return `<article class="sf-service sf-animate ${delay}">
      <div class="sf-service__icon">${icon}</div>
      <h3 class="sf-service__title">${escapeHtml(item.title)}</h3>
      <p class="sf-service__description">${escapeHtml(item.description)}</p>
      ${price}
      ${link}
    </article>`;
    })
    .join("\n");
  return `<section class="sf-services ${layoutClass}">
  <header class="sf-services__header sf-animate">
    <h2 class="sf-services__headline">${renderEmphasis(headline)}</h2>
    ${subheadHtml}
  </header>
  <div class="sf-services__grid">
    ${items}
  </div>
</section>`;
}

function renderAbout(section: SectionAbout): string {
  // About body is the substance. If it still has placeholders the section
  // would read as half-finished — better to drop it until the operator
  // fills it in.
  if (hasPlaceholder(section.body) || hasPlaceholder(section.headline)) return "";

  const owner =
    section.ownerName && !hasPlaceholder(section.ownerName)
      ? `<p class="sf-about__owner"><strong>${escapeHtml(section.ownerName)}</strong>${
          section.ownerTitle && !hasPlaceholder(section.ownerTitle)
            ? `, <span class="sf-about__owner-title">${escapeHtml(section.ownerTitle)}</span>`
            : ""
        }</p>`
      : "";

  return `<section class="sf-about">
  <div class="sf-about__copy sf-animate">
    <h2 class="sf-about__headline">${renderEmphasis(section.headline)}</h2>
    <p class="sf-about__body">${escapeHtml(section.body)}</p>
    ${owner}
  </div>
</section>`;
}

function renderMidCta(section: SectionMidCta): string {
  if (hasPlaceholder(section.headline)) return "";
  const subhead = resolveOrHide(section.subhead);
  const subheadHtml = subhead
    ? `<p class="sf-mid-cta__subhead">${escapeHtml(subhead)}</p>`
    : "";
  const primary =
    section.ctaPrimary && !hasPlaceholder(section.ctaPrimary.label)
      ? renderCta(section.ctaPrimary)
      : "";
  const secondary =
    section.ctaSecondary && !hasPlaceholder(section.ctaSecondary.label)
      ? renderCta(section.ctaSecondary)
      : "";
  return `<section class="sf-mid-cta">
  <div class="sf-mid-cta__inner sf-animate">
    <h2 class="sf-mid-cta__headline">${renderEmphasis(section.headline)}</h2>
    ${subheadHtml}
    <div class="sf-mid-cta__ctas">
      ${primary}
      ${secondary}
    </div>
  </div>
</section>`;
}

function renderTestimonialCard(t: Testimonial, classes = ""): string {
  const role = t.authorRole && !hasPlaceholder(t.authorRole)
    ? `<span class="sf-quote__role">${escapeHtml(t.authorRole)}</span>`
    : "";
  const stars = t.rating
    ? `<span class="sf-quote__stars" aria-label="${t.rating} out of 5 stars">${"★".repeat(t.rating)}${"☆".repeat(5 - t.rating)}</span>`
    : "";
  return `<figure class="sf-quote ${classes}">
    ${stars}
    <blockquote class="sf-quote__text">${escapeHtml(t.quote)}</blockquote>
    <figcaption class="sf-quote__attribution">
      <strong class="sf-quote__name">${escapeHtml(t.authorName)}</strong>
      ${role}
    </figcaption>
  </figure>`;
}

function isResolvedTestimonial(t: Testimonial): boolean {
  return !hasPlaceholder(t.quote) && !hasPlaceholder(t.authorName);
}

function renderTestimonials(section: SectionTestimonials): string {
  const headline = section.headline ?? "What our customers say";
  if (hasPlaceholder(headline)) return "";
  const featured = section.featured && isResolvedTestimonial(section.featured) ? section.featured : null;
  const grid = section.items.filter(isResolvedTestimonial);
  // If everything is placeholder copy, hide the entire section.
  if (!featured && grid.length === 0) return "";

  const featuredHtml = featured
    ? `<div class="sf-testimonials__featured sf-animate">${renderTestimonialCard(featured, "sf-quote--featured")}</div>`
    : "";
  const gridHtml = grid
    .map((t, idx) => {
      const delay = `sf-delay-${(idx % 4) + 1}`;
      return renderTestimonialCard(t, `sf-animate ${delay}`);
    })
    .join("\n");

  const gridWrap = grid.length > 0
    ? `<div class="sf-testimonials__grid">${gridHtml}</div>`
    : "";

  return `<section class="sf-testimonials">
  <h2 class="sf-testimonials__headline sf-animate">${renderEmphasis(headline)}</h2>
  ${featuredHtml}
  ${gridWrap}
</section>`;
}

function renderServiceArea(section: SectionServiceArea): string {
  if (hasPlaceholder(section.description)) return "";
  const headline = section.headline ?? "Service area";
  if (hasPlaceholder(headline)) return "";

  const map = section.mapEmbedUrl
    ? `<div class="sf-service-area__map"><iframe src="${escapeAttr(section.mapEmbedUrl)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Service area map"></iframe></div>`
    : "";
  const cleanedCities = (section.cities ?? []).filter((c) => !hasPlaceholder(c));
  const cities =
    cleanedCities.length > 0
      ? `<ul class="sf-service-area__cities">${cleanedCities
          .map((c) => `<li>${escapeHtml(c)}</li>`)
          .join("")}</ul>`
      : "";
  return `<section class="sf-service-area">
  <div class="sf-service-area__copy sf-animate">
    <h2 class="sf-service-area__headline">${renderEmphasis(headline)}</h2>
    <p class="sf-service-area__description">${escapeHtml(section.description)}</p>
    ${cities}
  </div>
  ${map}
</section>`;
}

function renderFaq(section: SectionFaq): string {
  const headline = section.headline ?? "Frequently asked questions";
  if (hasPlaceholder(headline)) return "";

  const visible = section.items.filter(
    (it) => !hasPlaceholder(it.question) && !hasPlaceholder(it.answer)
  );
  if (visible.length === 0) return "";

  const items = visible
    .map(
      (item) => `<details class="sf-faq__item">
      <summary class="sf-faq__question">
        <span>${escapeHtml(item.question)}</span>
        <span class="sf-faq__chevron" aria-hidden="true"></span>
      </summary>
      <div class="sf-faq__answer">${escapeHtml(item.answer)}</div>
    </details>`
    )
    .join("\n");
  return `<section class="sf-faq">
  <h2 class="sf-faq__headline sf-animate">${renderEmphasis(headline)}</h2>
  <div class="sf-faq__list sf-animate sf-delay-1">
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

  const addr = ws.contact.address;
  const addressClean =
    showAddress &&
    !hasPlaceholder(addr.street) &&
    !hasPlaceholder(addr.city) &&
    !hasPlaceholder(addr.region) &&
    !hasPlaceholder(addr.postalCode);
  const addressBlock = addressClean
    ? `<div class="sf-footer__col">
          <h3 class="sf-footer__heading">Visit</h3>
          <address class="sf-footer__address">
            ${escapeHtml(addr.street)}<br />
            ${escapeHtml(addr.city)}, ${escapeHtml(addr.region)} ${escapeHtml(addr.postalCode)}
          </address>
        </div>`
    : "";

  const hoursBlock = showHours
    ? `<div class="sf-footer__col">
        <h3 class="sf-footer__heading">Hours</h3>
        ${renderHoursList(ws.contact.hours)}
      </div>`
    : "";

  const serviceAreaClean =
    showServiceArea && ws.contact.serviceArea && !hasPlaceholder(ws.contact.serviceArea);
  const serviceAreaBlock = serviceAreaClean
    ? `<div class="sf-footer__col">
          <h3 class="sf-footer__heading">Service area</h3>
          <p class="sf-footer__service-area">${escapeHtml(ws.contact.serviceArea ?? "")}</p>
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

  const tagline =
    ws.tagline && !hasPlaceholder(ws.tagline)
      ? `<p class="sf-footer__tagline">${escapeHtml(ws.tagline)}</p>`
      : "";

  return `<footer class="sf-footer">
  <div class="sf-footer__top">
    <div class="sf-footer__col sf-footer__col--brand">
      <p class="sf-footer__name">${escapeHtml(ws.name)}</p>
      ${tagline}
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

// ─── Scroll observer (animation) ───────────────────────────────────────

/**
 * Vanilla IntersectionObserver-driven fade-up. Anything tagged
 * `.sf-animate` gets the `--in` class once it crosses 10% into the
 * viewport. No animation library, no React rerender pressure.
 *
 * Includes a `prefers-reduced-motion` short-circuit so accessibility
 * users get content immediately without movement.
 *
 * Defined as a constant so the rendered HTML is byte-stable for the
 * deterministic-render test.
 */
const SCROLL_OBSERVER_SCRIPT = `<script data-sf-scroll-observer="general-service-v1">(function(){if(typeof window==='undefined')return;var d=document;var prefersReduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;var els=d.querySelectorAll('.sf-animate');if(prefersReduced||typeof IntersectionObserver==='undefined'){els.forEach(function(el){el.classList.add('sf-animate--in')});return}var obs=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('sf-animate--in');obs.unobserve(e.target)}})},{threshold:0.1,rootMargin:'0px 0px -40px 0px'});els.forEach(function(el){obs.observe(el)})})();</script>`;

// ─── Stylesheet ────────────────────────────────────────────────────────

/**
 * Base CSS for general-service-v1. Reads from --sf-* tokens emitted by
 * buildThemeTokens; only the layout/spacing/typography rules live here.
 *
 * Mobile-first: default styles target mobile, `@media (min-width: 768px)`
 * adds desktop. No dark mode — light only in v1.
 *
 * Critical decisions per Phase 1 + C3.1:
 *   - Cal Sans (display) + Instrument Serif (italic accent) + Inter (body)
 *   - Headline clamp(36px, 8vw, 72px), letter-spacing -0.03em
 *   - Layered drop-shadow primary buttons, pill rounded-full
 *   - Inline SVG icons with currentColor inherit
 *   - Section bg alternation for rhythm
 *   - Mid-CTA gradient, FAQ +/× rotation, dark #1A1A2E footer
 *   - IntersectionObserver-driven fade-up animations
 */
const BASE_CSS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap');

/* === sf-landing — general-service-v1 (C3.1) === */
.sf-landing {
  background: var(--sf-bg-primary);
  color: #505050;
  font-family: var(--sf-font-body);
  font-size: 17px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.sf-landing * { box-sizing: border-box; }
.sf-landing h1, .sf-landing h2, .sf-landing h3 {
  font-family: var(--sf-font-display);
  color: var(--sf-fg-emphasis);
  letter-spacing: -0.025em;
  margin: 0;
  font-weight: 600;
}
.sf-landing p { margin: 0; }
.sf-landing a { color: inherit; }
.sf-landing .sf-italic {
  font-family: var(--sf-font-serif);
  font-style: italic;
  font-weight: 400;
  letter-spacing: -0.01em;
}

/* Animations — initial state for IntersectionObserver targets */
@keyframes sfFadeInUp {
  from { opacity: 0; transform: translate3d(0, 16px, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
.sf-animate {
  opacity: 0;
  transform: translate3d(0, 16px, 0);
  transition: opacity 700ms cubic-bezier(0.22, 1, 0.36, 1), transform 700ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity, transform;
}
.sf-animate--in { opacity: 1; transform: translate3d(0, 0, 0); }
.sf-delay-1 { transition-delay: 80ms; }
.sf-delay-2 { transition-delay: 160ms; }
.sf-delay-3 { transition-delay: 240ms; }
.sf-delay-4 { transition-delay: 320ms; }
@media (prefers-reduced-motion: reduce) {
  .sf-animate { transition: none !important; opacity: 1 !important; transform: none !important; }
}

/* Inline icon wrapper — inherits currentColor from parent */
.sf-icon { display: inline-flex; align-items: center; justify-content: center; line-height: 0; }
.sf-icon svg { display: block; }

/* CTA buttons — pill rounded-full, layered shadows for depth */
.sf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  padding: 0 1.75rem;
  border-radius: 9999px;
  font-family: var(--sf-font-body);
  font-weight: 600;
  font-size: 0.9375rem;
  letter-spacing: -0.005em;
  text-decoration: none;
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
              box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1),
              background-color 180ms ease,
              color 180ms ease;
  border: 1px solid transparent;
  cursor: pointer;
  white-space: nowrap;
}
.sf-btn--primary {
  background: var(--sf-accent);
  color: var(--sf-accent-fg);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.10),
    0 4px 8px rgba(0, 0, 0, 0.08),
    0 12px 18px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}
.sf-btn--primary:hover {
  background: var(--sf-accent-hover);
  transform: translateY(-1px);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.12),
    0 8px 16px rgba(0, 0, 0, 0.10),
    0 18px 24px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);
}
.sf-btn--primary:active { transform: translateY(0); }
.sf-btn--secondary {
  background: #FFFFFF;
  color: var(--sf-fg-emphasis);
  border-color: var(--sf-border-default);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.sf-btn--secondary:hover {
  border-color: var(--sf-fg-emphasis);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}
.sf-btn--ghost {
  background: transparent;
  color: var(--sf-fg-emphasis);
}
.sf-btn--ghost:hover { background: rgba(0, 0, 0, 0.04); }
.sf-btn--tel {
  background: #FFFFFF;
  color: var(--sf-fg-emphasis);
  border-color: var(--sf-border-default);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.sf-btn--tel:hover {
  border-color: var(--sf-fg-emphasis);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

/* Emergency strip — deeper red, larger phone, pulse on icon */
.sf-emergency {
  background: #991B1B;
  color: #ffffff;
  padding: 0.875rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.875rem;
  font-weight: 600;
  font-size: 0.9375rem;
  letter-spacing: -0.005em;
  position: relative;
  z-index: 5;
}
.sf-emergency__icon {
  display: inline-flex;
  width: 18px;
  height: 18px;
  color: #ffffff;
  animation: sfPulse 2.4s ease-in-out infinite;
}
.sf-emergency__icon svg { width: 18px; height: 18px; }
@keyframes sfPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%      { transform: scale(1.18); opacity: 0.78; }
}
.sf-emergency__label { opacity: 0.96; }
.sf-emergency__phone {
  color: #ffffff;
  font-weight: 700;
  font-size: 1.0625rem;
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-thickness: 1.5px;
}
.sf-emergency__phone:hover { text-decoration-thickness: 2.5px; }

/* Hero — full-width centered, no image column */
.sf-hero {
  background: #FFFFFF;
  padding: clamp(4rem, 10vw, 8rem) 1.5rem clamp(3rem, 8vw, 6rem);
  text-align: center;
}
.sf-hero__content {
  max-width: 56rem;
  margin: 0 auto;
}
.sf-hero__eyebrow {
  display: inline-block;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.75rem;
  color: var(--sf-fg-muted);
  margin-bottom: 1.5rem;
  font-weight: 600;
  padding: 0.375rem 0.875rem;
  background: var(--sf-accent-soft);
  color: var(--sf-accent);
  border-radius: 9999px;
}
.sf-hero__headline {
  font-size: clamp(2.25rem, 8vw, 4.5rem);
  line-height: 1.05;
  letter-spacing: -0.03em;
  margin-bottom: 1.5rem;
  font-weight: 600;
  color: var(--sf-fg-emphasis);
  text-wrap: balance;
}
.sf-hero__subhead {
  font-size: clamp(1.0625rem, 1.6vw, 1.25rem);
  color: #505050;
  line-height: 1.55;
  margin: 0 auto 2.5rem;
  max-width: 38rem;
  text-wrap: pretty;
}
.sf-hero__ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
}

/* Trust strip — warm bg, subtle */
.sf-trust {
  background: #FAFAF7;
  border-top: 1px solid var(--sf-border-subtle);
  border-bottom: 1px solid var(--sf-border-subtle);
  padding: 1.5rem;
}
.sf-trust__list {
  list-style: none;
  margin: 0 auto;
  padding: 0;
  max-width: 1200px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: clamp(1rem, 3vw, 2.5rem);
  font-size: 0.875rem;
  color: var(--sf-fg-muted);
  font-weight: 500;
}
.sf-trust__item {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
}
.sf-trust__item .sf-icon {
  color: var(--sf-accent);
  width: 20px;
  height: 20px;
}

/* Services — section rhythm: white surface */
.sf-services {
  background: #FFFFFF;
  padding: clamp(4rem, 8vw, 7rem) 1.5rem;
}
.sf-services > * { max-width: 1200px; margin-left: auto; margin-right: auto; }
.sf-services__header { text-align: center; margin-bottom: clamp(2.5rem, 5vw, 4rem); max-width: 38rem; }
.sf-services__headline {
  font-size: clamp(1.75rem, 5vw, 3rem);
  line-height: 1.1;
  letter-spacing: -0.025em;
  margin-bottom: 1rem;
  font-weight: 600;
  text-wrap: balance;
}
.sf-services__subhead {
  color: #6B6B6B;
  font-size: 1.0625rem;
  line-height: 1.55;
}
.sf-services__grid {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: 1fr;
}
@media (min-width: 640px) {
  .sf-services__grid { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 1024px) {
  .sf-services--grid-3 .sf-services__grid { grid-template-columns: repeat(3, 1fr); }
  .sf-services--grid-4 .sf-services__grid { grid-template-columns: repeat(4, 1fr); }
}
.sf-service {
  background: #FFFFFF;
  border: 1px solid var(--sf-border-default);
  border-radius: 16px;
  padding: 1.75rem;
  transition: border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease;
}
.sf-service:hover {
  border-color: var(--sf-accent);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.05);
}
.sf-service__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--sf-accent-soft);
  color: var(--sf-accent);
  margin-bottom: 1.25rem;
}
.sf-service__icon svg { width: 22px; height: 22px; }
.sf-service__title {
  font-size: 1.25rem;
  letter-spacing: -0.015em;
  margin-bottom: 0.5rem;
  color: var(--sf-fg-emphasis);
  font-weight: 600;
}
.sf-service__description {
  color: #6B6B6B;
  font-size: 0.9375rem;
  line-height: 1.6;
}
.sf-service__price {
  color: var(--sf-accent);
  font-weight: 600;
  margin-top: 1rem;
  font-size: 0.875rem;
}
.sf-service__link {
  display: inline-block;
  margin-top: 1rem;
  color: var(--sf-accent);
  font-weight: 600;
  font-size: 0.875rem;
  text-decoration: none;
}
.sf-service__link:hover { text-decoration: underline; text-underline-offset: 3px; }

/* About — warm surface for rhythm */
.sf-about {
  background: #FAFAF7;
  padding: clamp(4rem, 8vw, 7rem) 1.5rem;
}
.sf-about__copy { max-width: 42rem; margin: 0 auto; text-align: center; }
.sf-about__headline {
  font-size: clamp(1.75rem, 5vw, 3rem);
  line-height: 1.1;
  letter-spacing: -0.025em;
  margin-bottom: 1.5rem;
  font-weight: 600;
  text-wrap: balance;
}
.sf-about__body {
  font-size: 1.0625rem;
  color: #505050;
  margin-bottom: 1.5rem;
  line-height: 1.7;
}
.sf-about__owner { color: var(--sf-fg-muted); font-size: 0.9375rem; }
.sf-about__owner strong { color: var(--sf-fg-emphasis); font-weight: 600; }
.sf-about__owner-title { font-weight: 400; }

/* Mid-CTA — accent-tinted gradient */
.sf-mid-cta {
  padding: clamp(4rem, 9vw, 7rem) 1.5rem;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--sf-accent) 8%, white),
    color-mix(in srgb, var(--sf-accent) 3%, white) 70%,
    #FFFFFF);
  text-align: center;
  position: relative;
}
.sf-mid-cta__inner { max-width: 38rem; margin: 0 auto; }
.sf-mid-cta__headline {
  font-size: clamp(1.75rem, 5vw, 3rem);
  line-height: 1.1;
  letter-spacing: -0.025em;
  margin-bottom: 1rem;
  font-weight: 600;
  text-wrap: balance;
}
.sf-mid-cta__subhead {
  color: #505050;
  margin-bottom: 2.25rem;
  font-size: 1.0625rem;
  line-height: 1.55;
}
.sf-mid-cta__ctas { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; }

/* Testimonials — white bg */
.sf-testimonials {
  background: #FFFFFF;
  padding: clamp(4rem, 8vw, 7rem) 1.5rem;
}
.sf-testimonials > * { max-width: 1200px; margin-left: auto; margin-right: auto; }
.sf-testimonials__headline {
  font-size: clamp(1.75rem, 5vw, 3rem);
  line-height: 1.1;
  letter-spacing: -0.025em;
  text-align: center;
  margin-bottom: clamp(2.5rem, 5vw, 4rem);
  font-weight: 600;
  text-wrap: balance;
}
.sf-testimonials__featured { max-width: 48rem; margin: 0 auto clamp(2rem, 4vw, 3rem); }
.sf-testimonials__featured .sf-quote__text { font-size: clamp(1.25rem, 2.5vw, 1.625rem); line-height: 1.45; }
.sf-testimonials__grid {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: 1fr;
}
@media (min-width: 768px) {
  .sf-testimonials__grid { grid-template-columns: repeat(3, 1fr); }
}
.sf-quote {
  background: #FAFAF7;
  border: 1px solid var(--sf-border-subtle);
  border-radius: 16px;
  padding: 1.75rem;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}
.sf-quote--featured {
  background: #FFFFFF;
  border: 1px solid var(--sf-border-default);
  padding: clamp(2rem, 4vw, 2.75rem);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.04);
}
.sf-quote__text {
  font-family: var(--sf-font-display);
  font-size: 1.0625rem;
  line-height: 1.55;
  color: var(--sf-fg-emphasis);
  margin: 0;
  font-style: normal;
  letter-spacing: -0.012em;
}
.sf-quote__attribution { display: flex; flex-direction: column; gap: 0.125rem; font-size: 0.875rem; }
.sf-quote__name { color: var(--sf-fg-emphasis); font-weight: 600; }
.sf-quote__role { color: var(--sf-fg-muted); }
.sf-quote__stars { color: #F59E0B; letter-spacing: 0.08em; font-size: 0.9375rem; }

/* Service area — warm surface */
.sf-service-area {
  background: #FAFAF7;
  padding: clamp(4rem, 8vw, 7rem) 1.5rem;
}
.sf-service-area > * { max-width: 1200px; margin-left: auto; margin-right: auto; }
.sf-service-area__copy { max-width: 42rem; margin: 0 auto; }
.sf-service-area__headline {
  font-size: clamp(1.625rem, 4.5vw, 2.5rem);
  line-height: 1.15;
  letter-spacing: -0.025em;
  margin-bottom: 1rem;
  font-weight: 600;
}
.sf-service-area__description {
  color: #505050;
  margin-bottom: 1.5rem;
  font-size: 1.0625rem;
  line-height: 1.6;
}
.sf-service-area__cities {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-wrap: wrap; gap: 0.5rem;
}
.sf-service-area__cities li {
  background: #FFFFFF;
  border: 1px solid var(--sf-border-default);
  border-radius: 9999px;
  padding: 0.375rem 0.875rem;
  font-size: 0.875rem;
  color: var(--sf-fg-muted);
}
.sf-service-area__map {
  margin-top: 2rem;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--sf-border-default);
  aspect-ratio: 16 / 9;
}
.sf-service-area__map iframe { width: 100%; height: 100%; border: 0; display: block; }

/* FAQ — clean accordion with +→× rotation */
.sf-faq {
  background: #FFFFFF;
  padding: clamp(4rem, 8vw, 7rem) 1.5rem;
}
.sf-faq > * { max-width: 48rem; margin-left: auto; margin-right: auto; }
.sf-faq__headline {
  font-size: clamp(1.75rem, 5vw, 3rem);
  line-height: 1.1;
  letter-spacing: -0.025em;
  text-align: center;
  margin-bottom: clamp(2.5rem, 5vw, 4rem);
  font-weight: 600;
  text-wrap: balance;
}
.sf-faq__list { display: flex; flex-direction: column; gap: 0; }
.sf-faq__item {
  border-bottom: 1px solid var(--sf-border-default);
  padding: 1.25rem 0;
}
.sf-faq__item:first-child { border-top: 1px solid var(--sf-border-default); }
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
  letter-spacing: -0.01em;
}
.sf-faq__question::-webkit-details-marker { display: none; }
.sf-faq__chevron {
  position: relative;
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
.sf-faq__chevron::before,
.sf-faq__chevron::after {
  content: "";
  position: absolute;
  background: var(--sf-fg-emphasis);
  border-radius: 1px;
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
.sf-faq__chevron::before {
  /* horizontal bar */
  top: 50%; left: 0; right: 0;
  height: 1.5px;
  transform: translateY(-50%);
}
.sf-faq__chevron::after {
  /* vertical bar */
  left: 50%; top: 0; bottom: 0;
  width: 1.5px;
  transform: translateX(-50%);
}
.sf-faq__item[open] .sf-faq__chevron { transform: rotate(45deg); }
.sf-faq__answer {
  margin-top: 1rem;
  color: #505050;
  font-size: 1rem;
  line-height: 1.65;
  max-width: 42rem;
}

/* Footer — dark with subtle top glow */
.sf-footer {
  background: #1A1A2E;
  color: #B5B5C2;
  padding: clamp(3.5rem, 7vw, 6rem) 1.5rem 2rem;
  font-size: 0.9375rem;
  position: relative;
  isolation: isolate;
}
.sf-footer::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--sf-accent) 60%, transparent), transparent);
  z-index: 1;
}
.sf-footer h3 { color: #FFFFFF; }
.sf-footer a { color: #B5B5C2; text-decoration: none; transition: color 150ms ease; }
.sf-footer a:hover { color: #FFFFFF; }
.sf-footer__top {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  gap: 2rem;
  grid-template-columns: 1fr;
}
@media (min-width: 768px) {
  .sf-footer__top { grid-template-columns: repeat(4, 1fr); gap: 2.5rem; }
}
.sf-footer__col--brand { display: flex; flex-direction: column; gap: 0.5rem; }
.sf-footer__name { font-family: var(--sf-font-display); font-size: 1.375rem; color: #FFFFFF; font-weight: 600; letter-spacing: -0.02em; }
.sf-footer__tagline { color: #8A8A99; font-size: 0.875rem; }
.sf-footer__phone { font-weight: 600; color: #FFFFFF !important; margin-top: 0.5rem; font-size: 1.0625rem; }
.sf-footer__heading { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.14em; margin: 0 0 0.875rem; font-weight: 600; }
.sf-footer__address { font-style: normal; line-height: 1.6; }
.sf-hours { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.375rem; }
.sf-hours li { display: flex; justify-content: space-between; gap: 1rem; font-size: 0.875rem; }
.sf-hours__day { color: #8A8A99; }
.sf-footer__service-area { color: #B5B5C2; line-height: 1.55; }
.sf-footer__bottom {
  max-width: 1200px;
  margin: 3rem auto 0;
  padding-top: 1.5rem;
  border-top: 1px solid #2D2D44;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.8125rem;
  color: #8A8A99;
}
.sf-footer__social, .sf-footer__legal {
  list-style: none; padding: 0; margin: 0;
  display: flex; gap: 1rem; flex-wrap: wrap;
}
.sf-footer__poweredby a {
  color: var(--sf-accent) !important;
  font-weight: 600;
}
.sf-footer__poweredby a:hover {
  color: var(--sf-accent-hover) !important;
}

/* Sticky mobile call bar — pinned phone CTA on small viewports */
@media (max-width: 767px) {
  .sf-landing { padding-bottom: 4rem; }
  .sf-hero__ctas .sf-btn--tel,
  .sf-mid-cta__ctas .sf-btn--tel {
    /* Inline sticky-bar CTAs stay inline; only the topmost tel-CTA goes sticky. */
    position: static;
    width: 100%;
  }
  .sf-hero { padding-top: clamp(3rem, 9vw, 5rem); padding-bottom: clamp(2.5rem, 7vw, 4rem); }
  .sf-hero__ctas .sf-btn { flex: 1 1 auto; }
}
`;
