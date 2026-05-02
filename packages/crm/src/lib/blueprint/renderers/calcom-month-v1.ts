/**
 * Booking renderer — `calcom-month-v1`.
 *
 * Reads a Blueprint and emits a complete HTML+CSS+JS string for the
 * public booking page. Cal.com-style two-column layout: event details
 * on the left, scheduler (calendar → time slots → form → confirmation)
 * on the right. Stacks vertically on mobile.
 *
 * Visual language matches general-service-v1 (C3.x):
 *   - Outer #ededed page frame + rounded inner card
 *   - Cal Sans display + Instrument Serif italic accent + Inter body
 *   - Layered drop-shadow primary CTAs with chevron-in-circle
 *   - Floating glass navbar pill
 *   - Dark #1A1A2E footer with brand-tinted "Powered by"
 *   - IntersectionObserver fade-up animations
 *
 * Determinism: same blueprint input → same byte-identical output. The
 * only runtime variable is the user's timezone (detected client-side
 * for the timezone selector default — does NOT affect the rendered
 * HTML/CSS, just the post-load JS state).
 *
 * Light mode only in v1.
 *
 * Exported entry points:
 *   - renderCalcomMonthV1(blueprint) → { html, css }
 *
 * Interactivity is delivered via a vanilla-JS `<script>` block appended
 * after the body. It owns:
 *   - Calendar grid render (current month + next month, navigation)
 *   - Slot generation from blueprint.availability.weekly + lead-time
 *     + blackout rules
 *   - State machine: calendar → slots → form → confirmation
 *   - Form POST to /api/v1/bookings/create (mock-friendly: confirmation
 *     still shows on local-file previews where the API isn't reachable)
 *   - Timezone detection + selector
 */

import type {
  Blueprint,
  Booking,
  BookingFormField,
  WeeklyHours,
} from "../types";
import { buildThemeTokens } from "../theme";

// ─── Public entry point ────────────────────────────────────────────────

export interface RenderedBooking {
  html: string;
  css: string;
}

/**
 * P0-3 white-label: render-time options. Pass `removePoweredBy: true`
 * for paid tiers (Cloud Pro / Cloud Agency) so the rendered HTML's
 * footer omits the "Powered by SeldonFrame" link.
 */
export interface RenderCalcomMonthV1Options {
  removePoweredBy?: boolean;
}

export function renderCalcomMonthV1(
  blueprint: Blueprint,
  options: RenderCalcomMonthV1Options = {}
): RenderedBooking {
  const themeCss = buildThemeTokens(blueprint.workspace.theme, { surface: "booking" });
  const removePoweredBy = Boolean(options.removePoweredBy);

  const navbar = renderNavbar(blueprint);
  const eventDetails = renderEventDetails(blueprint);
  const scheduler = renderScheduler(blueprint);
  const footer = renderFooter(blueprint, { removePoweredBy });

  // Bake the booking blueprint chunks JS needs (availability, lead time,
  // form fields, confirmation copy) into a single JSON island so the
  // client script doesn't need a network call to know what's bookable.
  const bookingDataJson = JSON.stringify(buildBookingDataIsland(blueprint));

  const html = `<div class="sf-frame sf-frame--booking">
<main class="sf-landing sf-booking">
${navbar}
<section class="sf-booking__layout">
${eventDetails}
${scheduler}
</section>
${footer}
</main>
</div>
<script type="application/json" id="sf-booking-data">${escapeJsonForScript(bookingDataJson)}</script>
${BOOKING_INTERACTIVITY_SCRIPT}`;

  const css = [themeCss, BASE_CSS].join("\n\n");
  return { html, css };
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
 * JSON inside a `<script>` tag must defuse anything an HTML parser could
 * interpret as a tag boundary. Replacing every `<` with the JSON unicode
 * escape `<` is the safe-by-default choice — JSON.parse turns it
 * back into `<` at runtime, but the literal `<` never appears in the
 * served HTML, so neither `</script>` nor `<!--` nor an attacker-planted
 * `<script>alert(...)` payload can break out of the data island. Same
 * defense Next.js uses for its RSC payload.
 */
function escapeJsonForScript(json: string): string {
  // Replacing every `<` with its JSON unicode escape neutralizes
  // any tag boundary an attacker could plant in user-supplied data:
  // the browser sees the literal text and JSON.parse decodes back
  // to `<` at runtime. The line-separator chars (U+2028, U+2029)
  // are safe inside a JSON island (parsed by JSON.parse, not eval)
  // so we keep this single-replace tight.
  return json.replace(/</g, "\\u003c");
}

function hasPlaceholder(s: string | null | undefined): boolean {
  if (!s) return false;
  return /\[[^\]]+\]/.test(s);
}

function resolveOrHide(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (trimmed.length === 0) return null;
  if (hasPlaceholder(trimmed)) return null;
  return s;
}

function autoItalicizeLastWord(s: string): string {
  if (/\*[^*]+\*/.test(s)) return s;
  const parts = s.split(/(\s+)/);
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

function renderEmphasis(s: string): string {
  return escapeHtml(s).replace(/\*([^*]+)\*/g, '<em class="sf-italic">$1</em>');
}

function renderEventTitleEmphasis(s: string): string {
  return renderEmphasis(autoItalicizeLastWord(s));
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

function locationLabel(location: Booking["eventType"]["location"]): string {
  if (!location) return "Online";
  switch (location.kind) {
    case "on-site-customer":
      return "On-site at your location";
    case "on-site-business":
      return "On-site at our location";
    case "phone":
      return "Phone call — we'll call you";
    case "video":
      return location.videoProvider === "zoom"
        ? "Zoom video call"
        : location.videoProvider === "google-meet"
          ? "Google Meet video call"
          : location.videoProvider === "microsoft-teams"
            ? "Microsoft Teams call"
            : "Video call — link sent at booking";
    case "hybrid":
      return "Hybrid — we'll confirm format with you";
    default:
      return "Details confirmed at booking";
  }
}

function renderHoursSummary(hours: WeeklyHours): string {
  const days: Array<[keyof WeeklyHours, string]> = [
    ["mon", "Mon"],
    ["tue", "Tue"],
    ["wed", "Wed"],
    ["thu", "Thu"],
    ["fri", "Fri"],
    ["sat", "Sat"],
    ["sun", "Sun"],
  ];
  // Compress consecutive days with identical hours: "Mon–Fri 7am – 7pm".
  // Falls back to per-day if hours aren't groupable.
  const rangeKey = (k: keyof WeeklyHours) => {
    const r = hours[k];
    return r === null ? "closed" : `${r[0]}-${r[1]}`;
  };
  const groups: Array<{ key: string; days: string[] }> = [];
  for (const [k, label] of days) {
    const key = rangeKey(k);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.days.push(label);
    else groups.push({ key, days: [label] });
  }
  return groups
    .map((g) => {
      if (g.key === "closed") return null; // skip closed days in summary
      const [h1, h2] = g.key.split("-").map((n) => parseInt(n, 10));
      const range = `${formatHour(h1)} – ${formatHour(h2)}`;
      const span = g.days.length === 1 ? g.days[0] : `${g.days[0]}–${g.days[g.days.length - 1]}`;
      return `${span} ${range}`;
    })
    .filter(Boolean)
    .join(" · ");
}

function formatHour(h: number): string {
  const hour = h === 24 ? 0 : h;
  const period = hour < 12 || hour === 24 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${period}`;
}

// ─── Navbar (simplified — brand + phone CTA only) ──────────────────────

function renderNavbar(blueprint: Blueprint): string {
  const ws = blueprint.workspace;
  const phone = ws.contact.phone;

  // May 1, 2026 — skip phone CTA when phone is empty (SaaS, pro-services,
  // agencies). Existing local-service blueprints carry valid E.164 phones
  // and remain unchanged.
  const phoneCtaHtml = isUsablePhone(phone)
    ? `<a class="sf-navbar__cta" href="${escapeAttr(ensureTelHref(phone))}">
    <span class="sf-navbar__cta-label">${escapeHtml(formatPhoneDisplay(phone))}</span>
    <span class="sf-navbar__cta-icon" aria-hidden="true">${PHONE_SVG_SMALL}</span>
  </a>`
    : "";

  return `<nav class="sf-navbar sf-animate" aria-label="Primary">
  <a class="sf-navbar__brand" href="/">${escapeHtml(ws.name)}</a>
  ${phoneCtaHtml}
</nav>`;
}

function isUsablePhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const trimmed = phone.trim();
  return trimmed.length > 0 && trimmed !== "+";
}

// ─── Event details (left column) ──────────────────────────────────────

function renderEventDetails(blueprint: Blueprint): string {
  const ws = blueprint.workspace;
  const ev = blueprint.booking.eventType;
  const description = resolveOrHide(ev.description);
  const descriptionHtml = description
    ? `<p class="sf-event__description">${escapeHtml(description)}</p>`
    : "";

  const tagline = resolveOrHide(ws.tagline);
  const taglineHtml = tagline
    ? `<p class="sf-event__tagline">${escapeHtml(tagline)}</p>`
    : "";

  const hoursSummary = renderHoursSummary(ws.contact.hours);
  const hoursHtml = hoursSummary
    ? `<li class="sf-event__meta-item">
        <span class="sf-event__meta-icon" aria-hidden="true">${ICON_HOURS}</span>
        <span class="sf-event__meta-text">${escapeHtml(hoursSummary)}</span>
      </li>`
    : "";

  return `<aside class="sf-event sf-animate sf-delay-1" id="sf-event-details">
  <p class="sf-event__eyebrow">Schedule a meeting</p>
  <h1 class="sf-event__title">${renderEventTitleEmphasis(ev.title)}</h1>
  ${taglineHtml}
  ${descriptionHtml}
  <ul class="sf-event__meta">
    <li class="sf-event__meta-item">
      <span class="sf-event__meta-icon" aria-hidden="true">${ICON_CLOCK}</span>
      <span class="sf-event__meta-text">${ev.durationMinutes} minutes</span>
    </li>
    <li class="sf-event__meta-item">
      <span class="sf-event__meta-icon" aria-hidden="true">${ICON_MAP_PIN}</span>
      <span class="sf-event__meta-text">${escapeHtml(locationLabel(ev.location))}</span>
    </li>
    ${hoursHtml}
    <li class="sf-event__meta-item sf-event__tz">
      <span class="sf-event__meta-icon" aria-hidden="true">${ICON_GLOBE}</span>
      <span class="sf-event__meta-text">
        <label class="sf-event__tz-label" for="sf-tz-select">Timezone</label>
        <select id="sf-tz-select" class="sf-event__tz-select" aria-label="Timezone">
          <option value="auto" data-default="true">Detecting…</option>
        </select>
      </span>
    </li>
  </ul>
  <div class="sf-event__brand">
    <span class="sf-event__brand-label">Booking with</span>
    <strong class="sf-event__brand-name">${escapeHtml(ws.name)}</strong>
  </div>
</aside>`;
}

// ─── Scheduler (right column) ─────────────────────────────────────────

function renderScheduler(blueprint: Blueprint): string {
  const calendar = renderCalendarShell();
  const slots = renderSlotsShell();
  const form = renderFormShell(blueprint);
  const confirmation = renderConfirmationShell(blueprint);

  return `<section class="sf-scheduler sf-animate sf-delay-2" id="sf-scheduler">
  <header class="sf-scheduler__steps" aria-label="Booking steps">
    <ol>
      <li class="sf-scheduler__step is-active" data-step="date"><span>1</span> Pick a date</li>
      <li class="sf-scheduler__step" data-step="time"><span>2</span> Choose a time</li>
      <li class="sf-scheduler__step" data-step="form"><span>3</span> Confirm details</li>
    </ol>
  </header>
  <div class="sf-scheduler__panel" data-panel="calendar">${calendar}</div>
  <div class="sf-scheduler__panel" data-panel="slots" hidden>${slots}</div>
  <div class="sf-scheduler__panel" data-panel="form" hidden>${form}</div>
  <div class="sf-scheduler__panel" data-panel="confirmation" hidden>${confirmation}</div>
</section>`;
}

function renderCalendarShell(): string {
  // Day-of-week headers (Mon-first to match international convention +
  // the WeeklyHours shape). The grid body is generated by the client JS
  // — keeping it server-empty avoids rendering a stale month if the
  // page is cached.
  const dayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    .map((d) => `<div class="sf-cal__dow" aria-hidden="true">${d}</div>`)
    .join("");
  return `<div class="sf-cal" id="sf-cal">
    <div class="sf-cal__header">
      <button type="button" class="sf-cal__nav sf-cal__nav--prev" aria-label="Previous month">
        ${ICON_CHEVRON_LEFT}
      </button>
      <h2 class="sf-cal__month" id="sf-cal-month">Loading…</h2>
      <button type="button" class="sf-cal__nav sf-cal__nav--next" aria-label="Next month">
        ${ICON_CHEVRON_RIGHT}
      </button>
    </div>
    <div class="sf-cal__grid">
      <div class="sf-cal__dow-row">${dayHeaders}</div>
      <div class="sf-cal__days" id="sf-cal-days" role="grid" aria-label="Choose a date"></div>
    </div>
  </div>`;
}

function renderSlotsShell(): string {
  return `<div class="sf-slots">
    <header class="sf-slots__header">
      <button type="button" class="sf-back-link" data-action="back-to-calendar">
        ${ICON_CHEVRON_LEFT_SMALL} <span>Back to calendar</span>
      </button>
      <h2 class="sf-slots__heading" id="sf-slots-heading">Available times</h2>
      <p class="sf-slots__subhead" id="sf-slots-subhead"></p>
    </header>
    <div class="sf-slots__grid" id="sf-slots-grid" role="list"></div>
    <p class="sf-slots__empty" id="sf-slots-empty" hidden>
      No times available on this day. Try another date.
    </p>
  </div>`;
}

function renderFormShell(blueprint: Blueprint): string {
  const fields = blueprint.booking.formFields
    .map((f) => renderFormField(f))
    .join("\n");
  return `<form class="sf-form" id="sf-booking-form" novalidate>
    <header class="sf-form__header">
      <button type="button" class="sf-back-link" data-action="back-to-slots">
        ${ICON_CHEVRON_LEFT_SMALL} <span>Back to times</span>
      </button>
      <h2 class="sf-form__heading">Confirm your booking</h2>
      <p class="sf-form__summary" id="sf-form-summary"></p>
    </header>
    <div class="sf-form__fields">
${fields}
    </div>
    <p class="sf-form__error" id="sf-form-error" role="alert" hidden></p>
    <div class="sf-form__actions">
      <button type="submit" class="sf-btn sf-btn--primary sf-form__submit">
        <span class="sf-btn__label">Confirm booking</span>
        <span class="sf-btn__icon" aria-hidden="true">${CHEVRON_RIGHT_SVG_SMALL}</span>
      </button>
    </div>
  </form>`;
}

function renderFormField(field: BookingFormField): string {
  const id = `sf-f-${field.id}`;
  const required = field.required ? "required" : "";
  const requiredMark = field.required
    ? ` <span class="sf-form__required" aria-hidden="true">*</span>`
    : "";
  const placeholder = field.placeholder ? `placeholder="${escapeAttr(field.placeholder)}"` : "";
  const labelHtml = `<label class="sf-form__label" for="${id}">${escapeHtml(field.label)}${requiredMark}</label>`;

  if (field.type === "textarea") {
    return `<div class="sf-form__field">
      ${labelHtml}
      <textarea class="sf-form__input sf-form__textarea" id="${id}" name="${escapeAttr(field.id)}" rows="4" ${placeholder} ${required}></textarea>
    </div>`;
  }

  if (field.type === "select" && field.options) {
    const options = field.options
      .map((opt) => `<option value="${escapeAttr(opt)}">${escapeHtml(opt)}</option>`)
      .join("");
    return `<div class="sf-form__field">
      ${labelHtml}
      <div class="sf-form__select-wrap">
        <select class="sf-form__input sf-form__select" id="${id}" name="${escapeAttr(field.id)}" ${required}>
          <option value="" disabled selected>Choose one…</option>
          ${options}
        </select>
        <span class="sf-form__select-chevron" aria-hidden="true">${ICON_CHEVRON_DOWN}</span>
      </div>
    </div>`;
  }

  // text / email / phone
  const inputType =
    field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text";
  const inputMode = field.type === "phone" ? `inputmode="tel"` : "";
  return `<div class="sf-form__field">
      ${labelHtml}
      <input class="sf-form__input" id="${id}" name="${escapeAttr(field.id)}" type="${inputType}" ${inputMode} ${placeholder} ${required} />
    </div>`;
}

function renderConfirmationShell(blueprint: Blueprint): string {
  const c = blueprint.booking.confirmation;
  const headline = c.headline ?? "Your booking is confirmed";
  const message =
    c.message ??
    "Check your email for the confirmation. We'll see you at the scheduled time.";
  return `<div class="sf-confirm" id="sf-confirm-panel">
    <div class="sf-confirm__icon" aria-hidden="true">${ICON_CHECK_CIRCLE}</div>
    <h2 class="sf-confirm__headline">${renderEmphasis(headline)}</h2>
    <p class="sf-confirm__message">${escapeHtml(message)}</p>
    <dl class="sf-confirm__details" id="sf-confirm-details"></dl>
    <button type="button" class="sf-btn sf-btn--ghost sf-confirm__again" data-action="book-again">
      <span class="sf-btn__label">Book another time</span>
    </button>
  </div>`;
}

// ─── Footer (matches landing) ─────────────────────────────────────────

function renderFooter(
  blueprint: Blueprint,
  opts: { removePoweredBy: boolean }
): string {
  const ws = blueprint.workspace;
  const phone = ws.contact.phone;
  const tagline = resolveOrHide(ws.tagline);
  const phoneLink = isUsablePhone(phone)
    ? `<a class="sf-footer__phone" href="${escapeAttr(ensureTelHref(phone))}">${escapeHtml(formatPhoneDisplay(phone))}</a>`
    : "";
  return `<footer class="sf-footer sf-footer--booking" id="sf-contact">
  <div class="sf-footer__top">
    <div class="sf-footer__col sf-footer__col--brand">
      <p class="sf-footer__name">${escapeHtml(ws.name)}</p>
      ${tagline ? `<p class="sf-footer__tagline">${escapeHtml(tagline)}</p>` : ""}
      ${phoneLink}
    </div>
    <div class="sf-footer__col">
      <h3 class="sf-footer__heading">Need help?</h3>
      <p class="sf-footer__service-area">
        Call or text us — we answer the phone during business hours.
      </p>
    </div>
  </div>
  <div class="sf-footer__bottom">
    ${opts.removePoweredBy ? "" : `<p class="sf-footer__poweredby">Powered by <a href="https://seldonframe.com" target="_blank" rel="noopener noreferrer">SeldonFrame</a></p>`}
  </div>
</footer>`;
}

// ─── Booking-data island for the client JS ────────────────────────────

interface BookingDataIsland {
  eventType: {
    title: string;
    durationMinutes: number;
    bufferMinutes: number;
  };
  availability: {
    weekly: WeeklyHours;
    blackoutDates: string[];
    leadTimeHours: number;
    advanceWindowDays: number;
  };
  workspaceTimezone: string;
  workspaceName: string;
}

function buildBookingDataIsland(blueprint: Blueprint): BookingDataIsland {
  const a = blueprint.booking.availability;
  return {
    eventType: {
      title: blueprint.booking.eventType.title,
      durationMinutes: blueprint.booking.eventType.durationMinutes,
      bufferMinutes: blueprint.booking.eventType.bufferMinutes ?? 0,
    },
    availability: {
      weekly: a.weekly,
      blackoutDates: a.blackoutDates ?? [],
      leadTimeHours: a.leadTimeHours ?? 0,
      advanceWindowDays: a.advanceWindowDays ?? 30,
    },
    workspaceTimezone: blueprint.workspace.contact.timezone,
    workspaceName: blueprint.workspace.name,
  };
}

// ─── Inline SVG icons ─────────────────────────────────────────────────

const ICON_CLOCK = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

const ICON_MAP_PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

const ICON_GLOBE = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/></svg>`;

const ICON_HOURS = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>`;

const ICON_CHEVRON_LEFT = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;

const ICON_CHEVRON_LEFT_SMALL = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;

const ICON_CHEVRON_RIGHT = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

const CHEVRON_RIGHT_SVG_SMALL = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

const ICON_CHEVRON_DOWN = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;

const ICON_CHECK_CIRCLE = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`;

const PHONE_SVG_SMALL = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

// ─── Inline interactivity script ──────────────────────────────────────

/**
 * Vanilla-JS booking flow: calendar render, slot generation, state
 * transitions, form submit, timezone selector. ~250 lines, no deps.
 *
 * Design notes:
 *   - Slot generation is fully client-side using the availability island.
 *     A real production deploy would still want a server-side check
 *     against `bookings` rows on submit (handled by the route handler at
 *     /api/v1/bookings/create) — this client computation is for the UI
 *     state only, never trusted for booking conflict resolution.
 *   - Timezone uses Intl.DateTimeFormat for detection. Selector lists
 *     `Intl.supportedValuesOf("timeZone")` when available, falls back to
 *     a curated set otherwise. Value changes only re-render the slot
 *     LABELS — slot generation operates in workspace local time.
 *   - State machine: calendar (default) → slots (date click) →
 *     form (slot click) → confirmation (submit).
 */
const BOOKING_INTERACTIVITY_SCRIPT = `<script data-sf-booking="calcom-month-v1">
(function(){
  if (typeof window === 'undefined') return;
  var dataEl = document.getElementById('sf-booking-data');
  if (!dataEl) return;
  var data;
  try { data = JSON.parse(dataEl.textContent || '{}'); }
  catch (e) { console.warn('[sf-booking] could not parse data island', e); return; }

  var DAYS = ['sun','mon','tue','wed','thu','fri','sat'];
  var DAY_LABELS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var MONTH_LABELS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  var state = {
    viewYear: 0,
    viewMonth: 0,
    selectedDate: null,
    selectedSlot: null,
    timezone: data.workspaceTimezone || 'UTC',
  };

  function pad2(n){ return n < 10 ? '0' + n : '' + n; }
  function ymd(d){ return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function startOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n){ var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function isSameDay(a, b){ return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  function dowKey(date){ return DAYS[date.getDay()]; }

  function isAvailableDate(date){
    var today = startOfDay(new Date());
    var leadMs = (data.availability.leadTimeHours || 0) * 3600 * 1000;
    var earliest = new Date(Date.now() + leadMs);
    if (date < startOfDay(earliest)) return false;
    var advance = data.availability.advanceWindowDays || 30;
    var latest = addDays(today, advance);
    if (date > latest) return false;
    var iso = ymd(date);
    if ((data.availability.blackoutDates || []).indexOf(iso) >= 0) return false;
    var range = data.availability.weekly[dowKey(date)];
    if (!range) return false;
    return true;
  }

  function generateSlots(date){
    var range = data.availability.weekly[dowKey(date)];
    if (!range) return [];
    var startHour = range[0], endHour = range[1];
    var dur = data.eventType.durationMinutes;
    var buf = data.eventType.bufferMinutes || 0;
    var step = dur + buf;
    var leadMs = (data.availability.leadTimeHours || 0) * 3600 * 1000;
    var earliest = new Date(Date.now() + leadMs);
    var slots = [];
    for (var minutes = startHour * 60; minutes + dur <= endHour * 60; minutes += step) {
      var slot = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60);
      if (slot < earliest) continue;
      slots.push(slot);
    }
    return slots;
  }

  function formatTime(date, tz){
    try {
      return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(date);
    } catch (e) {
      return date.getHours() + ':' + pad2(date.getMinutes());
    }
  }

  function formatLongDate(date){
    return DAY_LABELS[date.getDay()] + ', ' + MONTH_LABELS[date.getMonth()] + ' ' + date.getDate();
  }

  // ─── Calendar render ─────────────────────────────────────────────
  function renderCalendar(){
    var monthEl = document.getElementById('sf-cal-month');
    var daysEl = document.getElementById('sf-cal-days');
    if (!monthEl || !daysEl) return;
    monthEl.textContent = MONTH_LABELS[state.viewMonth] + ' ' + state.viewYear;

    var firstDay = new Date(state.viewYear, state.viewMonth, 1);
    var startDow = (firstDay.getDay() + 6) % 7; // shift Sun=0 → Mon=0
    var lastDate = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
    var today = startOfDay(new Date());

    var html = '';
    for (var i = 0; i < startDow; i++) {
      html += '<div class="sf-cal__day sf-cal__day--blank" aria-hidden="true"></div>';
    }
    for (var d = 1; d <= lastDate; d++) {
      var date = new Date(state.viewYear, state.viewMonth, d);
      var available = isAvailableDate(date);
      var isToday = isSameDay(date, today);
      var isSelected = state.selectedDate && isSameDay(date, state.selectedDate);
      var classes = ['sf-cal__day'];
      if (!available) classes.push('sf-cal__day--unavailable');
      if (isToday) classes.push('sf-cal__day--today');
      if (isSelected) classes.push('sf-cal__day--selected');
      var disabled = available ? '' : 'disabled aria-disabled="true"';
      html += '<button type="button" class="' + classes.join(' ') + '" data-date="' + ymd(date) + '" ' + disabled + '><span>' + d + '</span></button>';
    }
    daysEl.innerHTML = html;
  }

  // ─── Slots render ────────────────────────────────────────────────
  function renderSlots(){
    var heading = document.getElementById('sf-slots-heading');
    var subhead = document.getElementById('sf-slots-subhead');
    var grid = document.getElementById('sf-slots-grid');
    var empty = document.getElementById('sf-slots-empty');
    if (!grid || !state.selectedDate) return;

    if (heading) heading.textContent = formatLongDate(state.selectedDate);
    if (subhead) subhead.textContent = data.eventType.durationMinutes + ' minute slots, shown in ' + niceTzLabel(state.timezone) + tzContextSuffix();

    var slots = generateSlots(state.selectedDate);
    if (slots.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    grid.innerHTML = slots.map(function(s){
      return '<button type="button" class="sf-slot" data-iso="' + s.toISOString() + '" data-h="' + s.getHours() + '" data-m="' + s.getMinutes() + '">' +
        formatTime(s, state.timezone) +
      '</button>';
    }).join('');
  }

  // ─── State transitions ───────────────────────────────────────────
  var STEP_ORDER = ['date','time','form'];
  function activateStep(step){
    document.querySelectorAll('.sf-scheduler__step').forEach(function(el){
      var idx = STEP_ORDER.indexOf(el.dataset.step);
      var current = STEP_ORDER.indexOf(step);
      el.classList.toggle('is-active', idx === current);
      el.classList.toggle('is-complete', idx >= 0 && idx < current);
    });
  }
  function showPanel(name){
    document.querySelectorAll('.sf-scheduler__panel').forEach(function(p){
      p.hidden = (p.dataset.panel !== name);
      if (p.dataset.panel === name) {
        // Re-trigger fade-in by toggling the animate class.
        p.classList.remove('sf-animate--in');
        requestAnimationFrame(function(){ p.classList.add('sf-animate', 'sf-animate--in'); });
      }
    });
  }

  function selectDate(iso){
    var parts = iso.split('-').map(function(n){ return parseInt(n, 10); });
    state.selectedDate = new Date(parts[0], parts[1] - 1, parts[2]);
    renderCalendar();
    renderSlots();
    activateStep('time');
    showPanel('slots');
  }
  function selectSlot(iso){
    state.selectedSlot = new Date(iso);
    var summary = document.getElementById('sf-form-summary');
    if (summary) summary.textContent =
      formatLongDate(state.selectedSlot) + ' at ' + formatTime(state.selectedSlot, state.timezone) +
      ' · ' + data.eventType.durationMinutes + ' min · ' + data.workspaceName;
    activateStep('form');
    showPanel('form');
  }
  function backToCalendar(){
    activateStep('date');
    showPanel('calendar');
  }
  function backToSlots(){
    activateStep('time');
    showPanel('slots');
  }

  // ─── Form submit ─────────────────────────────────────────────────
  function submitForm(e){
    e.preventDefault();
    var form = document.getElementById('sf-booking-form');
    var error = document.getElementById('sf-form-error');
    var submit = form ? form.querySelector('.sf-form__submit') : null;
    if (!form) return;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    if (error) { error.hidden = true; error.textContent = ''; }
    if (submit) submit.disabled = true;

    var fd = new FormData(form);
    // Wiring task: pull orgSlug + bookingSlug from the live URL so the
    // public-bookings endpoint can resolve the workspace. Path shape:
    // /book/<orgSlug>/<bookingSlug>
    var pathParts = window.location.pathname.split('/').filter(Boolean);
    var orgSlug = pathParts[1] || '';
    var bookingSlug = pathParts[2] || 'default';
    var payload = {
      orgSlug: orgSlug,
      bookingSlug: bookingSlug,
      slot: state.selectedSlot ? state.selectedSlot.toISOString() : null,
    };
    fd.forEach(function(v, k){ payload[k] = v; });

    fetch('/api/v1/public/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function(res){
      if (!res.ok) throw new Error('Booking failed');
      return res.json();
    }).then(function(){
      showConfirmation();
    }).catch(function(){
      // Local-file preview / API not reachable: still show confirmation.
      // The submit-error is shown only if we have a real network error
      // we can recover from in production deploys.
      if (window.location.protocol === 'file:' || window.location.hostname === 'localhost') {
        showConfirmation();
      } else if (error) {
        error.textContent = "Couldn't book that time — try again, or call us directly.";
        error.hidden = false;
        if (submit) submit.disabled = false;
      } else if (submit) {
        submit.disabled = false;
      }
    });
  }

  function showConfirmation(){
    var details = document.getElementById('sf-confirm-details');
    if (details && state.selectedSlot) {
      details.innerHTML =
        '<div><dt>When</dt><dd>' + formatLongDate(state.selectedSlot) + ' · ' + formatTime(state.selectedSlot, state.timezone) + '</dd></div>' +
        '<div><dt>Duration</dt><dd>' + data.eventType.durationMinutes + ' minutes</dd></div>' +
        '<div><dt>With</dt><dd>' + (data.workspaceName || '—') + '</dd></div>';
    }
    document.querySelectorAll('.sf-scheduler__step').forEach(function(el){
      el.classList.add('is-complete');
      el.classList.remove('is-active');
    });
    showPanel('confirmation');
  }

  function bookAgain(){
    state.selectedDate = null;
    state.selectedSlot = null;
    activateStep('date');
    renderCalendar();
    showPanel('calendar');
  }

  // ─── Timezone ───────────────────────────────────────────────────
  function niceTzLabel(tz){
    if (!tz) return 'local time';
    return tz.replace(/_/g, ' ');
  }

  // v1.1.5 / Issue #7 — read ?tz= override from the page URL so the
  // operator can paste a shareable link in their preferred zone.
  function readTzFromUrl(){
    try {
      var params = new URLSearchParams(window.location.search);
      var v = params.get('tz');
      return v && v.trim().length > 0 ? v.trim() : '';
    } catch (e) { return ''; }
  }

  function setupTimezone(){
    var sel = document.getElementById('sf-tz-select');
    if (!sel) return;

    // v1.1.5 / Issue #7 — default to the WORKSPACE's timezone (not the
    // visitor's browser TZ). Booking pages should show times in the
    // business's local time so a customer in NYC booking with a Texas
    // dental practice sees "9 AM Central" — the practice's hours, not
    // the visitor's morning. Visitor-driven TZ is wrong for trades /
    // services / dental: the appointment happens at the practice's
    // location, not the visitor's. URL ?tz= override wins so shareable
    // links in a different zone still work.
    var urlTz = readTzFromUrl();
    var detected = (Intl && Intl.DateTimeFormat) ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
    state.timezone = urlTz || data.workspaceTimezone || detected || 'UTC';

    var zones = [];
    try {
      if (Intl && typeof Intl.supportedValuesOf === 'function') {
        zones = Intl.supportedValuesOf('timeZone');
      }
    } catch (e) { zones = []; }
    if (zones.length === 0) {
      // Curated fallback covering NA / EU / APAC.
      zones = ['America/Los_Angeles','America/Denver','America/Chicago','America/New_York','America/Toronto','America/Mexico_City','Europe/London','Europe/Paris','Europe/Berlin','Europe/Madrid','Asia/Dubai','Asia/Kolkata','Asia/Singapore','Asia/Tokyo','Australia/Sydney','UTC'];
    }
    sel.innerHTML = zones.map(function(z){
      var sel = z === state.timezone ? ' selected' : '';
      return '<option value="' + z + '"' + sel + '>' + niceTzLabel(z) + '</option>';
    }).join('');
    sel.addEventListener('change', function(){
      state.timezone = sel.value;
      if (state.selectedDate) renderSlots();
    });
  }

  // v1.1.5 / Issue #7 — append a friendly suffix when the visitor's
  // current TZ matches the workspace TZ ("local time") or differs
  // ("workspace local time"). Helps the visitor understand why slots
  // look different from their wall clock.
  function tzContextSuffix(){
    var ws = data.workspaceTimezone;
    if (!ws || state.timezone === ws) return '';
    return ' (workspace: ' + niceTzLabel(ws) + ')';
  }

  // ─── Wiring ─────────────────────────────────────────────────────
  function init(){
    var now = new Date();
    state.viewYear = now.getFullYear();
    state.viewMonth = now.getMonth();
    setupTimezone();
    renderCalendar();

    document.addEventListener('click', function(e){
      var tgt = e.target;
      if (!(tgt instanceof Element)) return;
      var dayBtn = tgt.closest('.sf-cal__day');
      if (dayBtn && !dayBtn.classList.contains('sf-cal__day--unavailable') && !dayBtn.classList.contains('sf-cal__day--blank')) {
        selectDate(dayBtn.getAttribute('data-date') || '');
        return;
      }
      var slot = tgt.closest('.sf-slot');
      if (slot) {
        selectSlot(slot.getAttribute('data-iso') || '');
        return;
      }
      if (tgt.closest('.sf-cal__nav--prev')) {
        var py = state.viewYear, pm = state.viewMonth - 1;
        if (pm < 0) { pm = 11; py -= 1; }
        state.viewYear = py; state.viewMonth = pm;
        renderCalendar();
        return;
      }
      if (tgt.closest('.sf-cal__nav--next')) {
        var ny = state.viewYear, nm = state.viewMonth + 1;
        if (nm > 11) { nm = 0; ny += 1; }
        state.viewYear = ny; state.viewMonth = nm;
        renderCalendar();
        return;
      }
      var action = tgt.closest('[data-action]');
      if (action) {
        var name = action.getAttribute('data-action');
        if (name === 'back-to-calendar') backToCalendar();
        else if (name === 'back-to-slots') backToSlots();
        else if (name === 'book-again') bookAgain();
      }
    });

    var form = document.getElementById('sf-booking-form');
    if (form) form.addEventListener('submit', submitForm);

    // Trigger fade-up on top-level animated elements.
    document.querySelectorAll('.sf-animate').forEach(function(el){
      requestAnimationFrame(function(){ el.classList.add('sf-animate--in'); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
</script>`;

// ─── Stylesheet ────────────────────────────────────────────────────────

const BASE_CSS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap');

/* === sf-frame — outer page surface (matches landing) === */
.sf-frame {
  background: #ededed;
  padding: 12px;
  min-height: 100vh;
}
@media (min-width: 768px) { .sf-frame { padding: 16px; } }

/* === sf-landing/sf-booking — inner card === */
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
  display: flex;
  flex-direction: column;
}
@media (min-width: 768px) { .sf-landing { border-radius: 32px; } }
.sf-landing * { box-sizing: border-box; }
.sf-landing h1, .sf-landing h2, .sf-landing h3 {
  font-family: var(--sf-font-display);
  color: var(--sf-fg-emphasis);
  letter-spacing: -0.025em;
  margin: 0;
  font-weight: 600;
}
.sf-landing p { margin: 0; }
.sf-landing :where(a) { color: inherit; text-decoration: none; }
.sf-landing .sf-italic {
  font-family: var(--sf-font-serif);
  font-style: italic;
  font-weight: 400;
  letter-spacing: -0.01em;
}

/* Animations */
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
@media (prefers-reduced-motion: reduce) {
  .sf-animate { transition: none !important; opacity: 1 !important; transform: none !important; }
}

/* Floating glass navbar pill */
.sf-navbar {
  display: flex;
  align-items: center;
  gap: 1rem;
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
.sf-navbar__cta-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.18);
}
@media (max-width: 480px) { .sf-navbar__cta-label { display: none; } }

/* CTA buttons (matches landing C3.2 — same layered shadows) */
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
.sf-btn[disabled] { opacity: 0.5; cursor: not-allowed; }
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
.sf-btn--primary:hover:not([disabled]) {
  background: var(--sf-accent-hover);
  transform: translateY(-1px);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.12),
    0 8px 16px rgba(0, 0, 0, 0.10),
    0 18px 24px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);
}
.sf-btn--primary:hover:not([disabled]) .sf-btn__icon { transform: translateX(2px); background: rgba(255, 255, 255, 0.26); }
.sf-btn--ghost {
  background: transparent;
  color: var(--sf-fg-emphasis);
  border: 1px solid var(--sf-border-default);
}
.sf-btn--ghost:hover { background: rgba(0, 0, 0, 0.04); }

/* Back link (small text-button) */
.sf-back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  background: none;
  border: 0;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--sf-fg-muted);
  font-weight: 500;
  padding: 0.25rem 0;
  font-family: var(--sf-font-body);
}
.sf-back-link:hover { color: var(--sf-fg-emphasis); }

/* === Booking layout === */
.sf-booking__layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  padding: clamp(1.5rem, 4vw, 3rem);
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
  flex: 1;
}
@media (min-width: 900px) {
  .sf-booking__layout {
    grid-template-columns: 380px 1fr;
    gap: 2rem;
  }
}

/* Event details (left) */
.sf-event {
  background: #FFFFFF;
  border: 1px solid var(--sf-border-default);
  border-radius: 20px;
  padding: clamp(1.5rem, 3vw, 2rem);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6), 0 1px 2px rgba(0, 0, 0, 0.03);
  align-self: start;
  position: sticky;
  top: 1rem;
}
@media (max-width: 899px) {
  .sf-event { position: static; }
}
.sf-event__eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--sf-accent);
  margin-bottom: 0.875rem;
  display: inline-block;
  padding: 0.375rem 0.75rem;
  background: var(--sf-accent-soft);
  border-radius: 9999px;
}
.sf-event__title {
  font-size: clamp(1.625rem, 3.5vw, 2.25rem);
  line-height: 1.1;
  letter-spacing: -0.025em;
  font-weight: 600;
  margin-bottom: 0.75rem;
  text-wrap: balance;
}
.sf-event__tagline {
  color: #6B6B6B;
  font-size: 0.9375rem;
  margin-bottom: 0.875rem;
  font-style: italic;
}
.sf-event__description {
  color: #505050;
  font-size: 1rem;
  line-height: 1.6;
  margin-bottom: 1.5rem;
}
.sf-event__meta {
  list-style: none;
  padding: 0;
  margin: 0 0 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  border-top: 1px solid var(--sf-border-subtle);
  padding-top: 1.5rem;
}
.sf-event__meta-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.9375rem;
  color: var(--sf-fg-emphasis);
  font-weight: 500;
}
.sf-event__meta-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--sf-accent-soft);
  color: var(--sf-accent);
  flex-shrink: 0;
}
.sf-event__tz {
  align-items: stretch;
}
.sf-event__tz .sf-event__meta-text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  flex: 1;
}
.sf-event__tz-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--sf-fg-muted);
  font-weight: 600;
}
.sf-event__tz-select {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: 0;
  font-family: var(--sf-font-body);
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--sf-fg-emphasis);
  padding: 0;
  cursor: pointer;
  width: 100%;
}
.sf-event__tz-select:focus { outline: 2px solid var(--sf-ring); outline-offset: 2px; border-radius: 4px; }
.sf-event__brand {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  font-size: 0.8125rem;
  color: var(--sf-fg-muted);
  border-top: 1px solid var(--sf-border-subtle);
  padding-top: 1.25rem;
}
.sf-event__brand-label {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.6875rem;
  font-weight: 600;
}
.sf-event__brand-name {
  color: var(--sf-fg-emphasis);
  font-weight: 600;
  font-size: 1rem;
}

/* === Scheduler (right) === */
.sf-scheduler {
  background: #FFFFFF;
  border: 1px solid var(--sf-border-default);
  border-radius: 20px;
  padding: clamp(1.25rem, 3vw, 2rem);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6), 0 1px 2px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
}
.sf-scheduler__steps {
  border-bottom: 1px solid var(--sf-border-subtle);
  padding-bottom: 1.25rem;
  margin-bottom: 1.5rem;
}
.sf-scheduler__steps ol {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--sf-fg-muted);
  flex-wrap: wrap;
}
.sf-scheduler__step {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  background: var(--sf-bg-secondary, #FCFCFC);
  border: 1px solid var(--sf-border-subtle);
  font-weight: 500;
}
.sf-scheduler__step span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--sf-bg-emphasis, #EBEBEB);
  color: var(--sf-fg-muted);
  font-size: 0.75rem;
  font-weight: 700;
}
.sf-scheduler__step.is-active {
  background: var(--sf-accent-soft);
  border-color: color-mix(in srgb, var(--sf-accent) 20%, transparent);
  color: var(--sf-accent);
}
.sf-scheduler__step.is-active span {
  background: var(--sf-accent);
  color: var(--sf-accent-fg);
}
.sf-scheduler__step.is-complete {
  background: #FFFFFF;
  border-color: var(--sf-border-default);
}
.sf-scheduler__step.is-complete span {
  background: #15803D;
  color: #FFFFFF;
}
.sf-scheduler__panel { animation-fill-mode: forwards; }
.sf-scheduler__panel[hidden] { display: none; }

/* Calendar */
.sf-cal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.sf-cal__month {
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--sf-fg-emphasis);
  text-align: center;
  flex: 1;
}
.sf-cal__nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 9999px;
  border: 1px solid var(--sf-border-default);
  background: #FFFFFF;
  cursor: pointer;
  color: var(--sf-fg-emphasis);
  transition: background 150ms ease, border-color 150ms ease;
}
.sf-cal__nav:hover { background: var(--sf-bg-secondary, #FCFCFC); border-color: var(--sf-fg-emphasis); }
.sf-cal__grid { display: flex; flex-direction: column; gap: 0.5rem; }
.sf-cal__dow-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.25rem;
  text-align: center;
}
.sf-cal__dow {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--sf-fg-muted);
  text-transform: uppercase;
  padding: 0.25rem 0;
}
.sf-cal__days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.25rem;
}
.sf-cal__day {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  border: 0;
  background: transparent;
  font-family: var(--sf-font-body);
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--sf-fg-emphasis);
  border-radius: 12px;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, transform 150ms ease;
  position: relative;
  font-feature-settings: "tnum";
}
.sf-cal__day:hover:not(.sf-cal__day--unavailable):not(.sf-cal__day--blank) {
  background: var(--sf-accent-soft);
  color: var(--sf-accent);
}
.sf-cal__day--today::after {
  content: "";
  position: absolute;
  bottom: 6px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--sf-accent);
}
.sf-cal__day--selected,
.sf-cal__day--selected:hover {
  background: var(--sf-accent);
  color: var(--sf-accent-fg);
  transform: scale(1.02);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--sf-accent) 30%, transparent);
}
.sf-cal__day--selected.sf-cal__day--today::after { background: var(--sf-accent-fg); }
.sf-cal__day--unavailable {
  color: var(--sf-fg-subtle);
  cursor: not-allowed;
  text-decoration: line-through;
  text-decoration-color: var(--sf-border-subtle);
}
.sf-cal__day--blank { cursor: default; }

/* Time slots */
.sf-slots__header { margin-bottom: 1.25rem; }
.sf-slots__heading {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--sf-fg-emphasis);
  margin: 0.5rem 0 0.25rem;
}
.sf-slots__subhead {
  color: var(--sf-fg-muted);
  font-size: 0.8125rem;
}
.sf-slots__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 0.625rem;
}
.sf-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.875rem 1rem;
  border-radius: 12px;
  border: 1px solid var(--sf-border-default);
  background: #FFFFFF;
  font-family: var(--sf-font-body);
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--sf-fg-emphasis);
  cursor: pointer;
  letter-spacing: -0.005em;
  transition: background 150ms ease, color 150ms ease, border-color 150ms ease, transform 150ms ease, box-shadow 150ms ease;
  font-feature-settings: "tnum";
}
.sf-slot:hover {
  border-color: var(--sf-accent);
  color: var(--sf-accent);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
.sf-slot:active { transform: translateY(0); }
.sf-slots__empty {
  color: var(--sf-fg-muted);
  font-size: 0.9375rem;
  text-align: center;
  padding: 2rem 1rem;
  background: var(--sf-bg-secondary, #FCFCFC);
  border-radius: 12px;
  border: 1px dashed var(--sf-border-default);
}

/* Form */
.sf-form { display: flex; flex-direction: column; gap: 1.25rem; }
.sf-form__header { display: flex; flex-direction: column; gap: 0.375rem; }
.sf-form__heading {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--sf-fg-emphasis);
  margin: 0.5rem 0 0;
}
.sf-form__summary {
  color: var(--sf-fg-muted);
  font-size: 0.875rem;
  font-weight: 500;
}
.sf-form__fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.sf-form__field { display: flex; flex-direction: column; gap: 0.375rem; }
.sf-form__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--sf-fg-emphasis);
  letter-spacing: -0.005em;
}
.sf-form__required { color: #B91C1C; margin-left: 0.125rem; }
.sf-form__input {
  font-family: var(--sf-font-body);
  font-size: 0.9375rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--sf-border-default);
  border-radius: 10px;
  background: #FFFFFF;
  color: var(--sf-fg-emphasis);
  transition: border-color 150ms ease, box-shadow 150ms ease;
  width: 100%;
  box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.02);
}
.sf-form__input::placeholder { color: var(--sf-fg-subtle); }
.sf-form__input:focus {
  outline: none;
  border-color: var(--sf-accent);
  box-shadow: 0 0 0 3px var(--sf-ring);
}
.sf-form__textarea { resize: vertical; min-height: 100px; }
.sf-form__select-wrap { position: relative; }
.sf-form__select {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 2.5rem;
  cursor: pointer;
}
.sf-form__select-chevron {
  position: absolute;
  right: 0.875rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--sf-fg-muted);
  pointer-events: none;
}
.sf-form__error {
  background: rgba(185, 28, 28, 0.08);
  color: #991B1B;
  font-size: 0.875rem;
  padding: 0.75rem 0.875rem;
  border-radius: 10px;
  border: 1px solid rgba(185, 28, 28, 0.2);
}
.sf-form__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.5rem;
}
.sf-form__submit { width: auto; }
@media (max-width: 480px) {
  .sf-form__actions { justify-content: stretch; }
  .sf-form__submit { flex: 1; }
}

/* Confirmation */
.sf-confirm {
  text-align: center;
  padding: clamp(1.5rem, 4vw, 3rem) 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}
.sf-confirm__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 9999px;
  background: rgba(21, 128, 61, 0.1);
  color: #15803D;
}
.sf-confirm__icon svg { width: 48px; height: 48px; }
.sf-confirm__headline {
  font-size: clamp(1.5rem, 4vw, 2.25rem);
  line-height: 1.15;
  letter-spacing: -0.025em;
  font-weight: 600;
  text-wrap: balance;
}
.sf-confirm__message {
  color: #505050;
  max-width: 32rem;
  font-size: 1rem;
  line-height: 1.6;
}
.sf-confirm__details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 1rem 0 1.5rem;
  width: 100%;
  max-width: 24rem;
  background: var(--sf-bg-secondary, #FCFCFC);
  border: 1px solid var(--sf-border-subtle);
  border-radius: 16px;
  padding: 1rem 1.25rem;
}
.sf-confirm__details > div {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
}
.sf-confirm__details dt {
  color: var(--sf-fg-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.6875rem;
  padding-top: 0.125rem;
}
.sf-confirm__details dd {
  margin: 0;
  color: var(--sf-fg-emphasis);
  font-weight: 600;
  text-align: right;
}

/* === Footer (matches landing) === */
.sf-footer {
  background: #1A1A2E;
  color: #B5B5C2;
  padding: clamp(2rem, 5vw, 3rem) 1.5rem 2rem;
  font-size: 0.9375rem;
  position: relative;
  isolation: isolate;
  margin-top: auto;
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
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  gap: 2rem;
  grid-template-columns: 1fr;
}
@media (min-width: 768px) {
  .sf-footer__top { grid-template-columns: 1fr 1fr; gap: 2.5rem; }
}
.sf-footer__col--brand { display: flex; flex-direction: column; gap: 0.5rem; }
.sf-footer__name { font-family: var(--sf-font-display); font-size: 1.25rem; color: #FFFFFF; font-weight: 600; letter-spacing: -0.02em; }
.sf-footer__tagline { color: #8A8A99; font-size: 0.875rem; }
.sf-footer__phone { font-weight: 600; color: #FFFFFF !important; margin-top: 0.5rem; font-size: 1.0625rem; }
.sf-footer__heading { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.14em; margin: 0 0 0.875rem; font-weight: 600; }
.sf-footer__service-area { color: #B5B5C2; line-height: 1.55; }
.sf-footer__bottom {
  max-width: 1100px;
  margin: 2rem auto 0;
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
.sf-footer__poweredby a { color: var(--sf-accent) !important; font-weight: 600; }
.sf-footer__poweredby a:hover { color: var(--sf-accent-hover) !important; }
`;
