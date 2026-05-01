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
 * The output `html` is a `<div class="sf-frame">` block (no surrounding
 * <html><head>); the output `css` is a stylesheet that compiles cleanly
 * when injected into the existing landing-page renderer's <style> tag.
 *
 * ─── C3.1 visual elevation ────────────────────────────────────────────
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
 *   - Placeholder slot resolution (hide elements with [Brackets])
 *
 * ─── C3.2 visual elevation ────────────────────────────────────────────
 *   - Outer #ededed page frame with `rounded-3xl overflow-hidden` inner
 *     card (Convix pattern — major premium tell)
 *   - Auto-promoted reviews badge above hero headline (4.9 stars · 1,200+
 *     Google reviews) lifted from the trust-strip's first matching item,
 *     with three accent-tinted overlapping avatars
 *   - Floating glass navbar pill (auto-derived links from visible
 *     sections + workspace phone CTA on right)
 *   - Primary-CTA gets chevron-in-circle on the right (Convix / Bloom /
 *     Stellar pattern) with translateX(2px) on hover
 *   - Auto-italicize last word of hero headline (3+ words) using
 *     Instrument Serif when no explicit `*X*` markers given
 *   - Two decorative blurred radial-gradient glows behind hero in accent
 *   - Four 6px corner accents on hero card
 *   - Word-by-word scroll-driven reveal on the featured testimonial
 *     quote (color: 0.25 → 1.0 opacity scrubbed by scroll position)
 *   - Inner-stroke `box-shadow inset` borders on service + testimonial
 *     cards (1.5px white-alpha) for premium depth
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
import type { DesignTokens } from "@/lib/page-schema/design-tokens";
import {
  buildCinematicCss,
  buildFontLink,
  isCinematicMode,
} from "./cinematic-overlay";
import {
  buildLightCss,
  buildLightFontLink,
  isLightMode,
} from "./light-overlay";
import {
  hasIcon as hasLucideIcon,
  iconForTitle as lucideIconForTitle,
  renderIcon as renderLucideIcon,
} from "./lucide-icons";

// ─── Public entry point ────────────────────────────────────────────────

export interface RenderedLanding {
  /** The <main> body HTML (wrapped in <div class="sf-frame">). */
  html: string;
  /**
   * Stylesheet text. Includes the :root token block + all section styles.
   * Caller injects into a <style> tag (or stores on landing_pages.contentCss
   * which the existing renderer wraps automatically).
   */
  css: string;
  /**
   * Optional <head> fragment — Google Fonts <link> tags + preconnect when
   * the cinematic overlay is active. The page-rendering layer should inject
   * this into the served document's <head>. May be an empty string.
   */
  head?: string;
}

/**
 * Render-time options. Stay separate from the Blueprint type so the
 * Blueprint can be persisted unchanged (in `landing_pages.blueprint_json`)
 * while flags like `removePoweredBy` are derived per-render from the
 * workspace's current plan tier.
 */
export interface RenderGeneralServiceV1Options {
  /**
   * P0-3 white-label: when true, the footer's "Powered by SeldonFrame"
   * link is omitted from the rendered HTML. Set by the seed flow / plan
   * change re-render based on `canRemoveBranding(plan)` from the
   * entitlements layer. Defaults to false (free + starter tiers see
   * the badge).
   */
  removePoweredBy?: boolean;
  /**
   * May 1, 2026 — DesignTokens for the cinematic overlay. When present
   * and `tokens.mode === "dark"` + `tokens.effects.glassmorphism`, the
   * renderer:
   *   - Tags the root frame with `sf-cinematic` class
   *   - Appends the cinematic CSS overlay to the output stylesheet
   *   - Returns Google Fonts <link> tags via the new `head` field
   *
   * When omitted or in light mode, the renderer's output is byte-identical
   * to pre-tokens behavior — existing local-service workspaces unaffected.
   */
  tokens?: DesignTokens;
}

interface RenderContext {
  /** Trust-strip item promoted to the hero reviews badge, if any. */
  promotedReviewItem: { icon?: string; label: string } | null;
  /** P0-3: whether to include the "Powered by SeldonFrame" footer link. */
  removePoweredBy: boolean;
  /** May 1, 2026 — true when the cinematic CSS overlay is active (dark
   *  mode + glassmorphism). Used by section renderers to gate effects
   *  like the SaaS hero dashboard mockup. */
  cinematic: boolean;
  /** Workspace business type, derived from blueprint.workspace.industry.
   *  Section renderers branch on this to render type-specific decoration
   *  (e.g., the dashboard mockup for SaaS). */
  businessType: "local_service" | "professional_service" | "saas" | "agency" | "ecommerce" | "other";
}

export function renderGeneralServiceV1(
  blueprint: Blueprint,
  options: RenderGeneralServiceV1Options = {}
): RenderedLanding {
  const themeCss = buildThemeTokens(blueprint.workspace.theme, { surface: "landing" });

  const ctx: RenderContext = {
    promotedReviewItem: findReviewItem(blueprint.landing.sections),
    removePoweredBy: Boolean(options.removePoweredBy),
    cinematic: Boolean(options.tokens && isCinematicMode(options.tokens)),
    businessType: classifyIndustryToBusinessType(blueprint.workspace.industry),
  };

  // First pass: render every section so we know which survive placeholder
  // resolution. Navbar links derive from this set so anchors only appear
  // for sections that actually rendered.
  const renderedSections = blueprint.landing.sections
    .map((section) => ({ section, html: renderSection(section, blueprint, ctx) }))
    .filter((rs) => rs.html.length > 0);

  const navbar = renderNavbar(blueprint, deriveNavItems(renderedSections));

  // Emergency strip stays above the navbar so it's the absolute topmost
  // element — alert sections should never be visually demoted by chrome.
  const emergencyHtml = renderedSections.find((rs) => rs.section.type === "emergency-strip")?.html ?? "";
  const otherSectionsHtml = renderedSections
    .filter((rs) => rs.section.type !== "emergency-strip")
    .map((rs) => rs.html)
    .join("\n");

  const innerHtml = `<main class="sf-landing">
${emergencyHtml}
${navbar}
${otherSectionsHtml}
</main>`;

  // May 1, 2026 — overlay branching. The renderer supports three visual
  // modes:
  //   1. Legacy (no tokens) — existing local-service workspaces, byte-
  //      identical pre-tokens output.
  //   2. Cinematic — tokens.mode === "dark" + glassmorphism. Dark
  //      backgrounds, glass nav, blur-in animations, Instrument Serif.
  //   3. Light/Professional — tokens.mode === "light". White bg with
  //      dark hero band, Inter throughout, white service cards with
  //      hover-lift. Used for local_service / professional_service /
  //      ecommerce defaults.
  // Each mode tags the root frame with a distinct class so the overlay
  // CSS scopes to that mode only.
  const cinematic = options.tokens && isCinematicMode(options.tokens);
  const lightMode = options.tokens && !cinematic && isLightMode(options.tokens);
  const frameClass = cinematic
    ? "sf-frame sf-cinematic"
    : lightMode
      ? "sf-frame sf-light"
      : "sf-frame";

  const html = `<div class="${frameClass}">
${innerHtml}
</div>
${SCROLL_OBSERVER_SCRIPT}`;

  const cssChunks: string[] = [themeCss, BASE_CSS];
  if (options.tokens && cinematic) {
    cssChunks.push(buildCinematicCss(options.tokens));
  } else if (options.tokens && lightMode) {
    cssChunks.push(buildLightCss(options.tokens));
  }
  const css = cssChunks.join("\n\n");

  // Google Fonts <link> tag. Cinematic loads Instrument Serif + Barlow;
  // light mode loads Inter. Legacy path emits no link (system fonts).
  let head = "";
  if (options.tokens && cinematic) {
    head = buildFontLink(options.tokens);
  } else if (options.tokens && lightMode) {
    head = buildLightFontLink(options.tokens);
  }

  return { html, css, head };
}

// ─── Section dispatcher ────────────────────────────────────────────────

function renderSection(section: LandingSection, blueprint: Blueprint, ctx: RenderContext): string {
  switch (section.type) {
    case "emergency-strip":
      return renderEmergencyStrip(section, blueprint);
    case "hero":
      return renderHero(section, ctx);
    case "trust-strip":
      return renderTrustStrip(section, ctx);
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
    case "partners":
      return renderPartnersStrip(section);
    case "footer":
      return renderFooter(section, blueprint, ctx);
  }
}

/**
 * Partners strip — horizontal "Built on" / "Trusted by" row of company
 * names rendered as italic display-font text. Pure HTML/CSS, no images.
 * Cinematic mode styles it via .sf-partners CSS in the cinematic overlay.
 */
function renderPartnersStrip(section: import("../types").SectionPartners): string {
  if (!section.items || section.items.length === 0) return "";
  const eyebrow = section.eyebrow ? section.eyebrow : "Built on";
  const itemsHtml = section.items
    .map((item) => {
      if (item.href) {
        return `<a class="sf-partner" href="${escapeAttr(item.href)}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a>`;
      }
      return `<span class="sf-partner">${escapeHtml(item.name)}</span>`;
    })
    .join('<span class="sf-partner__sep" aria-hidden="true">·</span>');
  return `<section class="sf-partners sf-animate" id="sf-partners">
  <p class="sf-partners__eyebrow">${escapeHtml(eyebrow)}</p>
  <div class="sf-partners__row">${itemsHtml}</div>
</section>`;
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
 * Cal-Sans display headline. HTML escaping happens BEFORE the asterisk
 * processing, so user-supplied `<script>` payloads stay escaped.
 */
function renderEmphasis(s: string): string {
  return escapeHtml(s).replace(/\*([^*]+)\*/g, '<em class="sf-italic">$1</em>');
}

/**
 * Auto-italicize the last word of a headline that has no explicit `*X*`
 * markers AND is at least 3 words long. Hero-only — applying this to every
 * section headline would feel like over-styled noise.
 *
 * Trailing punctuation (`.`, `!`, `?`, etc.) stays outside the italic span
 * because Instrument Serif terminal punctuation looks sloppy compared to
 * Cal Sans terminal punctuation.
 */
function autoItalicizeLastWord(s: string): string {
  if (/\*[^*]+\*/.test(s)) return s; // operator already specified accent
  const parts = s.split(/(\s+)/); // keep separators
  const wordIdxs = parts
    .map((p, i) => (/\S/.test(p) ? i : -1))
    .filter((i) => i >= 0);
  if (wordIdxs.length < 3) return s;
  const lastIdx = wordIdxs[wordIdxs.length - 1];
  const lastWord = parts[lastIdx];
  const m = lastWord.match(/^(.+?)([.,!?:;]+)?$/);
  if (!m) return s;
  const [, core, punct = ""] = m;
  parts[lastIdx] = `*${core}*${punct}`;
  return parts.join("");
}

function renderHeroHeadline(s: string): string {
  return renderEmphasis(autoItalicizeLastWord(s));
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

/**
 * Primary CTAs render with a chevron-in-circle on the right (Convix /
 * Bloom / Stellar pattern). Other variants stay flat — too many right-side
 * affordances starts looking gimmicky.
 */
function renderCta(cta: CTA): string {
  const href = cta.href ?? "#";
  const cls = ctaClass(cta.kind);
  const showChevron = cta.kind === "primary" || cta.kind === undefined;
  const chevron = showChevron
    ? `<span class="sf-btn__icon" aria-hidden="true">${CHEVRON_RIGHT_SVG_SMALL}</span>`
    : "";
  return `<a class="${cls}" href="${escapeAttr(href)}"><span class="sf-btn__label">${escapeHtml(cta.label)}</span>${chevron}</a>`;
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
  const hour = h === 24 ? 0 : h;
  const period = hour < 12 || hour === 24 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${period}`;
}

function formatPhoneDisplay(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}

function ensureTelHref(href: string): string {
  if (href.startsWith("tel:")) return href;
  return `tel:${href.replace(/[^+0-9]/g, "")}`;
}

/**
 * Splits a string into `<span class="sf-quote-word">`-wrapped words for
 * scroll-driven word reveal. Whitespace becomes its own (un-spanned)
 * segment so the word spacing is preserved when individual word opacity
 * changes mid-scroll.
 */
function splitIntoWords(s: string): string {
  return escapeHtml(s)
    .split(/(\s+)/)
    .map((part) => (/\S/.test(part) ? `<span class="sf-quote-word">${part}</span>` : part))
    .join("");
}

// ─── Render context ───────────────────────────────────────────────────

const REVIEW_PATTERN =
  /(\d+(?:\.\d+)?\s*(?:stars?|\/\s*5)|\d+(?:,\d+)?\+?\s*(?:google\s*)?reviews?)/i;

function findReviewItem(
  sections: LandingSection[]
): { icon?: string; label: string } | null {
  for (const s of sections) {
    if (s.type !== "trust-strip") continue;
    for (const item of s.items) {
      if (hasPlaceholder(item.label)) continue;
      if (REVIEW_PATTERN.test(item.label)) {
        return item;
      }
    }
  }
  return null;
}

// ─── Inline SVG icons ─────────────────────────────────────────────────

function iconSvg(name: string | undefined): string {
  const key = (name ?? "").toLowerCase();
  // May 1, 2026 — Lucide-first icon resolution. The legacy ICON_MAP
  // (chrome icons: phonecall, star, shieldcheck, etc.) stays as a
  // fallback for the trust-strip + emergency-strip + reviews-badge that
  // reference it directly. New content cards (services, features, stats)
  // resolve through Lucide first so item.icon = "calendar" → the proper
  // calendar SVG, not the generic placeholder.
  if (hasLucideIcon(name)) {
    return `<span class="sf-icon" aria-hidden="true">${renderLucideIcon(name as string)}</span>`;
  }
  const svg = ICON_MAP[key] ?? ICON_MAP._default;
  return `<span class="sf-icon" aria-hidden="true">${svg}</span>`;
}

/**
 * Icon for a content card. Honors `item.icon` if known (Lucide or chrome
 * map); otherwise infers from the item title via `iconForTitle`. Always
 * returns a non-empty SVG — better than a blank slot when the operator's
 * Soul didn't carry icon hints.
 */
function iconForContentItem(item: { icon?: string; title?: string }): string {
  if (item.icon && (hasLucideIcon(item.icon) || ICON_MAP[item.icon.toLowerCase()])) {
    return iconSvg(item.icon);
  }
  return `<span class="sf-icon" aria-hidden="true">${renderLucideIcon(lucideIconForTitle(item.title))}</span>`;
}

const CHEVRON_RIGHT_SVG_SMALL = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

const PHONE_SVG_SMALL = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

// 24x24 viewBox, stroke 1.75, currentColor.
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
  chevronright: CHEVRON_RIGHT_SVG_SMALL,
  _default: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/></svg>`,
};

// ─── Navbar ────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
}

function deriveNavItems(
  rendered: Array<{ section: LandingSection; html: string }>
): NavItem[] {
  // May 1, 2026 — dedupe by href so multiple services-grid sections
  // (features + stats both render as services-grid) don't emit
  // duplicate "Services" links. Stats sections get a distinct href
  // (#sf-stats) so they appear as a separate "Stats" entry.
  const items: NavItem[] = [];
  const seenHrefs = new Set<string>();
  const push = (item: NavItem) => {
    if (seenHrefs.has(item.href)) return;
    seenHrefs.add(item.href);
    items.push(item);
  };

  for (const { section } of rendered) {
    switch (section.type) {
      case "services-grid": {
        // Stats grids vs feature/services grids: stats get id="sf-stats"
        // and don't belong in nav (they're scroll context, not a
        // destination). Use the layout flag we extended in Blueprint.
        if (section.layout === "stats") {
          // Skip — stats anchors aren't useful as nav targets.
          break;
        }
        // The renderer's own headline drives the nav label so SaaS
        // workspaces with intent="features" show "Features" and local-
        // service ones with intent="services" show "Services". Default
        // to "Services" when headline is missing.
        const label = section.headline?.trim() || "Services";
        push({ label, href: "#sf-services" });
        break;
      }
      case "about":
        push({ label: "About", href: "#sf-about" });
        break;
      case "testimonials":
        push({ label: "Reviews", href: "#sf-reviews" });
        break;
      case "faq":
        push({ label: "FAQ", href: "#sf-faq" });
        break;
    }
  }
  // Always anchor "Contact" to the footer if a footer rendered.
  if (rendered.some((rs) => rs.section.type === "footer")) {
    push({ label: "Contact", href: "#sf-contact" });
  }
  return items;
}

function renderNavbar(blueprint: Blueprint, items: NavItem[]): string {
  const ws = blueprint.workspace;
  const phone = ws.contact.phone;

  const linksHtml = items.length
    ? `<ul class="sf-navbar__links">
        ${items
          .map(
            (it) =>
              `<li><a class="sf-navbar__link" href="${escapeAttr(it.href)}">${escapeHtml(it.label)}</a></li>`
          )
          .join("\n")}
      </ul>`
    : "";

  // April 30, 2026 — primitives architecture A5/B2. Workspaces with no
  // phone (SaaS, pro-services, agencies that don't take inbound calls)
  // skip the phone CTA entirely. Existing local-service workspaces always
  // ship with a phone in their Blueprint, so this branch is a no-op for
  // them.
  const phoneCtaHtml = isUsablePhone(phone)
    ? `<a class="sf-navbar__cta" href="${escapeAttr(ensureTelHref(phone))}">
    <span class="sf-navbar__cta-label">${escapeHtml(formatPhoneDisplay(phone))}</span>
    <span class="sf-navbar__cta-icon" aria-hidden="true">${PHONE_SVG_SMALL}</span>
  </a>`
    : "";

  return `<nav class="sf-navbar sf-animate" aria-label="Primary">
  <a class="sf-navbar__brand" href="#sf-hero">${escapeHtml(ws.name)}</a>
  ${linksHtml}
  ${phoneCtaHtml}
</nav>`;
}

// May 1, 2026 — Map a workspace industry string to a business type, so
// section renderers can branch on type (e.g., emit the dashboard mockup
// for SaaS hero, skip phone footer for SaaS). Mirrors the keyword map
// in lib/page-schema/classify-business.ts but reads from the legacy
// Blueprint.workspace.industry field.
function classifyIndustryToBusinessType(
  industry: string | null | undefined
): RenderContext["businessType"] {
  if (!industry) return "other";
  const v = industry.toLowerCase();
  if (v.includes("saas") || v.includes("developer") || v.includes("software")) return "saas";
  if (v.includes("agency") || v.includes("studio")) return "agency";
  if (v.includes("ecommerce") || v.includes("shop") || v.includes("retail")) return "ecommerce";
  if (
    v.includes("hvac") ||
    v.includes("plumb") ||
    v.includes("roof") ||
    v.includes("clean") ||
    v.includes("repair") ||
    v.includes("general-service")
  ) {
    return "local_service";
  }
  if (
    v.includes("professional") ||
    v.includes("coach") ||
    v.includes("legal") ||
    v.includes("therapy")
  ) {
    return "professional_service";
  }
  return "other";
}

// True if the phone string looks usable for a tel: link. Defends the
// renderer against new pipelines (PageSchema → blueprintFromSchema)
// that produce blueprints with empty phones for SaaS / pro-services
// workspaces. Existing local-service blueprints all carry valid E.164
// phones so this is a no-op for them.
function isUsablePhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const trimmed = phone.trim();
  return trimmed.length > 0 && trimmed !== "+";
}

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

function renderHero(section: SectionHero, ctx: RenderContext): string {
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

  const reviewsBadge = ctx.promotedReviewItem
    ? renderReviewsBadge(ctx.promotedReviewItem.label)
    : "";

  // May 1, 2026 — SaaS hero dashboard mockup. Decorative inline HTML/CSS
  // showing a fake admin dashboard so the hero doesn't end at the CTAs.
  // Only renders when business type === "saas" AND cinematic overlay is
  // active (the styling needs the dark background to look right). Pure
  // CSS, pointer-events:none — purely a visual element.
  const dashboardMockup =
    ctx.cinematic && ctx.businessType === "saas"
      ? renderHeroDashboardMockup()
      : "";

  return `<section class="sf-hero" id="sf-hero">
  <span class="sf-hero__corner sf-hero__corner--tl" aria-hidden="true"></span>
  <span class="sf-hero__corner sf-hero__corner--tr" aria-hidden="true"></span>
  <span class="sf-hero__corner sf-hero__corner--bl" aria-hidden="true"></span>
  <span class="sf-hero__corner sf-hero__corner--br" aria-hidden="true"></span>
  <span class="sf-hero__glow sf-hero__glow--1" aria-hidden="true"></span>
  <span class="sf-hero__glow sf-hero__glow--2" aria-hidden="true"></span>
  <div class="sf-hero__content">
    ${reviewsBadge}
    ${eyebrowHtml}
    <h1 class="sf-hero__headline sf-animate sf-delay-1">${renderHeroHeadline(section.headline)}</h1>
    ${subheadHtml}
    <div class="sf-hero__ctas sf-animate sf-delay-3">
      ${renderCta(section.ctaPrimary)}
      ${ctaSecondary}
    </div>
    ${dashboardMockup}
  </div>
</section>`;
}

/**
 * Render a fake admin dashboard preview as inline HTML. Used in SaaS hero
 * sections to give visual weight below the CTAs without requiring an
 * actual screenshot asset. Pure CSS — no pointer events, no real data.
 */
function renderHeroDashboardMockup(): string {
  return `<div class="sf-hero__mockup sf-animate sf-delay-4" aria-hidden="true">
    <div class="sf-mockup__chrome">
      <span class="sf-mockup__dot"></span>
      <span class="sf-mockup__dot"></span>
      <span class="sf-mockup__dot"></span>
      <span class="sf-mockup__url">app.seldonframe.com/dashboard</span>
    </div>
    <div class="sf-mockup__body">
      <aside class="sf-mockup__sidebar">
        <p class="sf-mockup__brand">SeldonFrame</p>
        <ul class="sf-mockup__nav">
          <li class="sf-mockup__nav-item is-active">Dashboard</li>
          <li class="sf-mockup__nav-item">Contacts</li>
          <li class="sf-mockup__nav-item">Deals</li>
          <li class="sf-mockup__nav-item">Automations</li>
          <li class="sf-mockup__nav-item">Settings</li>
        </ul>
      </aside>
      <main class="sf-mockup__main">
        <p class="sf-mockup__greeting">Welcome back</p>
        <div class="sf-mockup__stats">
          <div class="sf-mockup__stat"><span class="sf-mockup__stat-num">128</span><span class="sf-mockup__stat-label">Contacts</span></div>
          <div class="sf-mockup__stat"><span class="sf-mockup__stat-num">42</span><span class="sf-mockup__stat-label">Active deals</span></div>
          <div class="sf-mockup__stat"><span class="sf-mockup__stat-num">$24k</span><span class="sf-mockup__stat-label">MRR</span></div>
        </div>
        <table class="sf-mockup__table">
          <thead>
            <tr><th>Contact</th><th>Stage</th><th>Value</th></tr>
          </thead>
          <tbody>
            <tr><td>Maxime H.</td><td><span class="sf-mockup__pill">Demo</span></td><td>$2,400</td></tr>
            <tr><td>Sarah K.</td><td><span class="sf-mockup__pill">Trial</span></td><td>$1,800</td></tr>
            <tr><td>James P.</td><td><span class="sf-mockup__pill">Won</span></td><td>$3,600</td></tr>
          </tbody>
        </table>
      </main>
    </div>
  </div>`;
}

/**
 * Reviews badge: combines an "overlapping avatars" trio with the rating
 * label pulled from the trust-strip. Placed above the hero headline.
 *
 * The avatar gradients are pure CSS — three accent-derived radial fills
 * stacked with -10px overlap and a 2px ring of the page background. No
 * external image asset needed.
 */
function renderReviewsBadge(label: string): string {
  // Try to coerce label like "4.9 stars · 1,200+ Google reviews" into a
  // star count + tail. If we can't pull a number out, just render the
  // whole label as the badge body (still readable).
  const ratingMatch = label.match(/(\d+(?:\.\d+)?)\s*(?:stars?|\/\s*5)/i);
  const ratingValue = ratingMatch ? parseFloat(ratingMatch[1]) : null;
  const stars = ratingValue
    ? `<span class="sf-hero__reviews-stars" aria-hidden="true">${"★".repeat(Math.round(ratingValue))}${"☆".repeat(5 - Math.round(ratingValue))}</span>`
    : "";
  return `<div class="sf-hero__reviews sf-animate">
  <span class="sf-hero__reviews-avatars" aria-hidden="true">
    <span class="sf-hero__reviews-avatar"></span>
    <span class="sf-hero__reviews-avatar"></span>
    <span class="sf-hero__reviews-avatar"></span>
  </span>
  ${stars}
  <span class="sf-hero__reviews-label">${escapeHtml(label)}</span>
</div>`;
}

function renderTrustStrip(section: SectionTrustStrip, ctx: RenderContext): string {
  const promoted = ctx.promotedReviewItem;
  const visible = section.items.filter((it) => {
    if (hasPlaceholder(it.label)) return false;
    // Skip the item we promoted to the hero so we don't repeat it.
    if (promoted && it === promoted) return false;
    if (promoted && it.label === promoted.label) return false;
    return true;
  });
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
  // May 1, 2026 — stats layout: when section.layout === "stats", render
  // each item as a large-number / label pair instead of an icon card.
  // Used for "by the numbers" sections — e.g., SaaS pages showing
  // 75+ MCP tools / 2,100+ tests / 6 archetypes / 2 min deploy.
  const isStats = layout === "stats";
  const items = visible
    .map((item, idx) => {
      if (isStats) {
        // Stats card: title becomes the large number ("75+"), description
        // becomes the label below ("MCP Tools"). No icon, no link, no price.
        const delay = `sf-delay-${(idx % 4) + 1}`;
        return `<article class="sf-stat sf-animate ${delay}">
      <p class="sf-stat__value">${escapeHtml(item.title)}</p>
      <p class="sf-stat__label">${escapeHtml(item.description)}</p>
    </article>`;
      }
      const icon = iconForContentItem(item);
      const price = item.priceFrom && !hasPlaceholder(item.priceFrom)
        ? `<p class="sf-service__price">${escapeHtml(item.priceFrom)}</p>`
        : "";
      const link = item.learnMoreUrl
        ? `<a class="sf-service__link" href="${escapeAttr(item.learnMoreUrl)}">Learn more →</a>`
        : "";
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
  // Stats sections get a distinct id so the duplicate-id concern doesn't
  // bite (legacy services grid hardcodes id="sf-services"). Stats lives
  // at id="sf-stats" so nav anchors and CSS scoping stay clean.
  const sectionId = isStats ? "sf-stats" : "sf-services";
  const gridClass = isStats ? "sf-stats__grid" : "sf-services__grid";
  return `<section class="sf-services ${layoutClass}" id="${sectionId}">
  <header class="sf-services__header sf-animate">
    <h2 class="sf-services__headline">${renderEmphasis(headline)}</h2>
    ${subheadHtml}
  </header>
  <div class="${gridClass}">
    ${items}
  </div>
</section>`;
}

function renderAbout(section: SectionAbout): string {
  if (hasPlaceholder(section.body) || hasPlaceholder(section.headline)) return "";

  const owner =
    section.ownerName && !hasPlaceholder(section.ownerName)
      ? `<p class="sf-about__owner"><strong>${escapeHtml(section.ownerName)}</strong>${
          section.ownerTitle && !hasPlaceholder(section.ownerTitle)
            ? `, <span class="sf-about__owner-title">${escapeHtml(section.ownerTitle)}</span>`
            : ""
        }</p>`
      : "";

  return `<section class="sf-about" id="sf-about">
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

function renderTestimonialCard(t: Testimonial, classes = "", featured = false): string {
  const role = t.authorRole && !hasPlaceholder(t.authorRole)
    ? `<span class="sf-quote__role">${escapeHtml(t.authorRole)}</span>`
    : "";
  const stars = t.rating
    ? `<span class="sf-quote__stars" aria-label="${t.rating} out of 5 stars">${"★".repeat(t.rating)}${"☆".repeat(5 - t.rating)}</span>`
    : "";
  const quoteHtml = featured ? splitIntoWords(t.quote) : escapeHtml(t.quote);
  return `<figure class="sf-quote ${classes}">
    ${stars}
    <blockquote class="sf-quote__text">${quoteHtml}</blockquote>
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
  if (!featured && grid.length === 0) return "";

  const featuredHtml = featured
    ? `<div class="sf-testimonials__featured sf-animate">${renderTestimonialCard(featured, "sf-quote--featured", true)}</div>`
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

  return `<section class="sf-testimonials" id="sf-reviews">
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
  return `<section class="sf-faq" id="sf-faq">
  <h2 class="sf-faq__headline sf-animate">${renderEmphasis(headline)}</h2>
  <div class="sf-faq__list sf-animate sf-delay-1">
    ${items}
  </div>
</section>`;
}

function renderFooter(section: SectionFooter, blueprint: Blueprint, ctx: RenderContext): string {
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

  // April 30, 2026 — primitives architecture A5/B2. Skip the phone link
  // entirely on workspaces with no phone (SaaS, pro-services, agencies).
  // Same isUsablePhone() guard as renderNavbar — keeps existing local-
  // service blueprints visually unchanged.
  const phoneLink = isUsablePhone(phone)
    ? `<a class="sf-footer__phone" href="${escapeAttr(ensureTelHref(phone))}">${escapeHtml(phoneDisplay)}</a>`
    : "";

  return `<footer class="sf-footer" id="sf-contact">
  <div class="sf-footer__top">
    <div class="sf-footer__col sf-footer__col--brand">
      <p class="sf-footer__name">${escapeHtml(ws.name)}</p>
      ${tagline}
      ${phoneLink}
    </div>
    ${addressBlock}
    ${hoursBlock}
    ${serviceAreaBlock}
  </div>
  <div class="sf-footer__bottom">
    ${social}
    ${legal}
    ${ctx.removePoweredBy ? "" : `<p class="sf-footer__poweredby">Powered by <a href="https://seldonframe.com" target="_blank" rel="noopener noreferrer">SeldonFrame</a></p>`}
  </div>
</footer>`;
}

// ─── Scroll observer + word reveal (animation) ────────────────────────

/**
 * Vanilla IntersectionObserver-driven fade-up + word-by-word scroll
 * reveal on featured testimonial.
 *
 * - Anything tagged `.sf-animate` gets `--in` once it crosses 10% into
 *   the viewport.
 * - Featured-quote words (`.sf-quote--featured .sf-quote-word`) scrub
 *   opacity from 0.25 → 1.0 based on viewport position, sequentially
 *   across the quote.
 * - `prefers-reduced-motion` short-circuits both — content shows fully
 *   on load.
 */
const SCROLL_OBSERVER_SCRIPT = `<script data-sf-scroll-observer="general-service-v1">(function(){if(typeof window==='undefined')return;var d=document;var prefersReduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;var animateEls=d.querySelectorAll('.sf-animate');if(prefersReduced||typeof IntersectionObserver==='undefined'){animateEls.forEach(function(el){el.classList.add('sf-animate--in')});var allWords=d.querySelectorAll('.sf-quote-word');allWords.forEach(function(w){w.style.opacity='1'});return}var obs=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('sf-animate--in');obs.unobserve(e.target)}})},{threshold:0.1,rootMargin:'0px 0px -40px 0px'});animateEls.forEach(function(el){obs.observe(el)});var quoteContainers=d.querySelectorAll('.sf-quote--featured .sf-quote__text');if(quoteContainers.length){var ticking=false;var update=function(){ticking=false;var vh=window.innerHeight||d.documentElement.clientHeight;quoteContainers.forEach(function(el){var rect=el.getBoundingClientRect();var startY=vh;var endY=vh*0.35;var prog=(startY-rect.top)/(startY-endY);if(prog<0)prog=0;if(prog>1)prog=1;var words=el.querySelectorAll('.sf-quote-word');var n=words.length;if(!n)return;words.forEach(function(w,i){var ws=i/n;var we=(i+1)/n;var wp=(prog-ws)/(we-ws);if(wp<0)wp=0;if(wp>1)wp=1;w.style.opacity=(0.25+wp*0.75).toFixed(3)})})};var schedule=function(){if(!ticking){window.requestAnimationFrame(update);ticking=true}};window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule,{passive:true});update()}})();</script>`;

// ─── Stylesheet ────────────────────────────────────────────────────────

const BASE_CSS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap');

/* === sf-frame — outer page surface (Convix premium pattern) === */
.sf-frame {
  background: #ededed;
  padding: 12px;
  min-height: 100vh;
}
@media (min-width: 768px) { .sf-frame { padding: 16px; } }

/* === sf-landing — general-service-v1 (C3.2) === */
.sf-landing {
  background: var(--sf-bg-primary);
  color: #505050;
  font-family: var(--sf-font-body);
  font-size: 17px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 12px 32px rgba(0, 0, 0, 0.04);
  scroll-behavior: smooth;
}
@media (min-width: 768px) {
  .sf-landing { border-radius: 32px; }
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
/* :where() zeros out the .sf-landing portion of specificity so per-class
   button/link rules below (color, etc.) reliably win the cascade. */
.sf-landing :where(a) { color: inherit; text-decoration: none; }
.sf-landing .sf-italic {
  font-family: var(--sf-font-serif);
  font-style: italic;
  font-weight: 400;
  letter-spacing: -0.01em;
}

/* Animations — initial state for IntersectionObserver targets */
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

/* === Floating glass navbar pill === */
.sf-navbar {
  display: flex;
  align-items: center;
  gap: clamp(0.75rem, 2vw, 1.5rem);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: saturate(140%) blur(12px);
  -webkit-backdrop-filter: saturate(140%) blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.04);
  border-radius: 9999px;
  padding: 0.5rem 0.5rem 0.5rem 1.25rem;
  margin: 1.25rem auto 0;
  max-width: 760px;
  width: calc(100% - 2rem);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03), 0 8px 24px rgba(0, 0, 0, 0.04);
  position: relative;
  z-index: 20;
}
.sf-navbar__brand {
  font-family: var(--sf-font-display);
  font-weight: 600;
  font-size: 1rem;
  letter-spacing: -0.02em;
  color: var(--sf-fg-emphasis);
  white-space: nowrap;
  flex-shrink: 0;
}
.sf-navbar__links {
  display: none;
  flex: 1;
  justify-content: center;
  gap: 1.5rem;
  list-style: none;
  margin: 0;
  padding: 0;
}
@media (min-width: 768px) { .sf-navbar__links { display: flex; } }
.sf-navbar__link {
  color: var(--sf-fg-muted);
  font-size: 0.875rem;
  font-weight: 500;
  transition: color 150ms ease;
}
.sf-navbar__link:hover { color: var(--sf-fg-emphasis); }
.sf-navbar__cta {
  margin-left: auto;
  background: var(--sf-fg-emphasis);
  color: #FFFFFF;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.5rem 0.5rem 1rem;
  border-radius: 9999px;
  font-weight: 600;
  font-size: 0.875rem;
  letter-spacing: -0.005em;
  transition: background 180ms ease, transform 180ms ease;
  flex-shrink: 0;
}
.sf-navbar__cta:hover { transform: translateY(-1px); }
.sf-navbar__cta-label { white-space: nowrap; }
@media (max-width: 480px) { .sf-navbar__cta-label { display: none; } }
.sf-navbar__cta-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.18);
}

/* CTA buttons — pill rounded-full, layered shadows + chevron-in-circle on primary */
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
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
              box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1),
              background-color 180ms ease,
              color 180ms ease;
  border: 1px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  gap: 0.5rem;
}
.sf-btn__label { display: inline-block; }
.sf-btn__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 9999px;
  margin-left: 0.375rem;
  margin-right: -0.625rem;
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
  background: rgba(255, 255, 255, 0.18);
  flex-shrink: 0;
}
.sf-btn__icon svg { width: 14px; height: 14px; }
.sf-btn--primary {
  background: var(--sf-accent);
  color: var(--sf-accent-fg);
  padding: 0 0.5rem 0 1.5rem;
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
.sf-btn--primary:hover .sf-btn__icon { transform: translateX(2px); background: rgba(255, 255, 255, 0.26); }
.sf-btn--primary:active { transform: translateY(0); }
.sf-btn--secondary {
  background: #FFFFFF;
  color: var(--sf-fg-emphasis);
  border-color: var(--sf-border-default);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), inset 0 0 0 1px rgba(0, 0, 0, 0.02);
}
.sf-btn--secondary:hover {
  border-color: var(--sf-fg-emphasis);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06), inset 0 0 0 1px rgba(0, 0, 0, 0.02);
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
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), inset 0 0 0 1px rgba(0, 0, 0, 0.02);
}
.sf-btn--tel:hover {
  border-color: var(--sf-fg-emphasis);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06), inset 0 0 0 1px rgba(0, 0, 0, 0.02);
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
  z-index: 10;
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

/* === Hero — full-width centered, with corner accents + glow gradients === */
.sf-hero {
  background: #FFFFFF;
  padding: clamp(3rem, 8vw, 6rem) 1.5rem clamp(3rem, 8vw, 6rem);
  text-align: center;
  position: relative;
  overflow: hidden;
}
.sf-hero__corner {
  position: absolute;
  width: 7px;
  height: 7px;
  background: var(--sf-fg-emphasis);
  z-index: 3;
  pointer-events: none;
  opacity: 0.85;
}
.sf-hero__corner--tl { top: 28px; left: 28px; }
.sf-hero__corner--tr { top: 28px; right: 28px; }
.sf-hero__corner--bl { bottom: 28px; left: 28px; }
.sf-hero__corner--br { bottom: 28px; right: 28px; }
@media (max-width: 640px) {
  .sf-hero__corner--tl { top: 16px; left: 16px; }
  .sf-hero__corner--tr { top: 16px; right: 16px; }
  .sf-hero__corner--bl { bottom: 16px; left: 16px; }
  .sf-hero__corner--br { bottom: 16px; right: 16px; }
}
.sf-hero__glow {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
  filter: blur(80px);
  opacity: 0.55;
}
.sf-hero__glow--1 {
  top: -10%;
  left: 5%;
  width: 520px;
  height: 520px;
  background: radial-gradient(circle, color-mix(in srgb, var(--sf-accent) 30%, transparent), transparent 70%);
}
.sf-hero__glow--2 {
  bottom: -20%;
  right: 5%;
  width: 460px;
  height: 460px;
  background: radial-gradient(circle, color-mix(in srgb, var(--sf-accent) 18%, transparent), transparent 70%);
}
.sf-hero__content {
  max-width: 56rem;
  margin: 0 auto;
  position: relative;
  z-index: 2;
}
.sf-hero__reviews {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 9999px;
  padding: 0.4rem 0.875rem 0.4rem 0.4rem;
  font-size: 0.8125rem;
  color: var(--sf-fg-muted);
  font-weight: 500;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  flex-wrap: wrap;
}
.sf-hero__reviews-avatars {
  display: inline-flex;
  align-items: center;
}
.sf-hero__reviews-avatar {
  display: inline-block;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid #FFFFFF;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.sf-hero__reviews-avatar:nth-child(1) {
  background: radial-gradient(circle at 30% 30%,
    color-mix(in srgb, var(--sf-accent) 60%, white),
    var(--sf-accent));
}
.sf-hero__reviews-avatar:nth-child(2) {
  margin-left: -10px;
  background: radial-gradient(circle at 30% 30%,
    color-mix(in srgb, var(--sf-accent) 25%, white),
    color-mix(in srgb, var(--sf-accent) 70%, #4B5563));
}
.sf-hero__reviews-avatar:nth-child(3) {
  margin-left: -10px;
  background: radial-gradient(circle at 30% 30%,
    color-mix(in srgb, var(--sf-accent) 80%, white),
    color-mix(in srgb, var(--sf-accent) 50%, #1F2937));
}
.sf-hero__reviews-stars {
  color: #F59E0B;
  letter-spacing: 0.05em;
  font-size: 0.8125rem;
}
.sf-hero__reviews-label {
  color: var(--sf-fg-emphasis);
  font-weight: 600;
}
.sf-hero__eyebrow {
  display: inline-block;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.75rem;
  margin-bottom: 1.25rem;
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
  scroll-margin-top: 80px;
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
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6);
}
.sf-service:hover {
  border-color: var(--sf-accent);
  transform: translateY(-2px);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.6),
    0 8px 24px rgba(0, 0, 0, 0.05);
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
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--sf-accent) 12%, transparent);
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
}
.sf-service__link:hover { text-decoration: underline; text-underline-offset: 3px; }

/* About — warm surface for rhythm */
.sf-about {
  background: #FAFAF7;
  padding: clamp(4rem, 8vw, 7rem) 1.5rem;
  scroll-margin-top: 80px;
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
  scroll-margin-top: 80px;
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
.sf-testimonials__featured .sf-quote__text {
  font-size: clamp(1.5rem, 3vw, 2.125rem);
  line-height: 1.35;
}
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
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6);
}
.sf-quote--featured {
  background: #FFFFFF;
  border: 1px solid var(--sf-border-default);
  padding: clamp(2rem, 4vw, 3rem);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.7),
    0 12px 32px rgba(0, 0, 0, 0.04);
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
/* Word-by-word scroll reveal for featured quote */
.sf-quote--featured .sf-quote-word {
  opacity: 0.25;
  transition: opacity 200ms ease;
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
  scroll-margin-top: 80px;
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
  top: 50%; left: 0; right: 0;
  height: 1.5px;
  transform: translateY(-50%);
}
.sf-faq__chevron::after {
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
  scroll-margin-top: 80px;
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
.sf-footer a { color: #B5B5C2; transition: color 150ms ease; }
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

/* Mobile responsive tweaks */
@media (max-width: 767px) {
  .sf-navbar { gap: 0.5rem; padding-left: 1rem; }
  .sf-hero__ctas .sf-btn { flex: 1 1 auto; }
  .sf-hero__reviews { font-size: 0.75rem; padding: 0.35rem 0.75rem 0.35rem 0.35rem; }
  .sf-hero__reviews-avatar { width: 24px; height: 24px; }
}
`;
