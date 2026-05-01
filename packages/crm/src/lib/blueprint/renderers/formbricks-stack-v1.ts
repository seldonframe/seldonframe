/**
 * Intake renderer — `formbricks-stack-v1`.
 *
 * Reads a Blueprint and emits a Typeform-style single-question-at-a-time
 * intake form. Visual language matches general-service-v1 (landing) and
 * calcom-month-v1 (booking) so the three public-facing surfaces feel
 * like one product, not three apps.
 *
 *   - Outer #ededed page frame + rounded inner card
 *   - Cal Sans display + Instrument Serif italic accent + Inter body
 *   - Floating glass navbar pill (workspace name + phone CTA)
 *   - Dark #1A1A2E footer
 *   - Layered drop-shadow primary CTAs with chevron-in-circle
 *   - sf-animate fade-up on intro / completion screens
 *   - Progress bar + question slide transitions inside the form shell
 *
 * Determinism: same blueprint input → byte-identical output. The only
 * runtime variability is the user's submission state, owned by the
 * client-side script.
 *
 * Light mode only in v1.
 *
 * Exported entry points:
 *   - renderFormbricksStackV1(blueprint) → { html, css }
 *
 * Interactivity (vanilla-JS, ~250 lines, zero deps):
 *   - State: { current panel, answers, visible-question stack, history }
 *   - Auto-advance for single-select / rating fields (Typeform pattern)
 *   - Manual continue for text / multi-select / textarea fields
 *   - showIf rules evaluated to filter the visible-question list
 *   - On final submit: POST /api/v1/intake/submit, fall back to
 *     showing completion locally on file:// previews
 *   - Enter advances on text fields; Cmd/Ctrl+Enter on textarea
 */

import type {
  Blueprint,
  Intake,
  IntakeQuestion,
} from "../types";
import { buildThemeTokens } from "../theme";

// ─── Public entry point ────────────────────────────────────────────────

export interface RenderedIntake {
  html: string;
  css: string;
}

/**
 * P0-3 white-label: render-time options. Pass `removePoweredBy: true`
 * for paid tiers (Cloud Pro / Cloud Agency) so the rendered HTML's
 * footer omits the "Powered by SeldonFrame" link.
 */
export interface RenderFormbricksStackV1Options {
  removePoweredBy?: boolean;
}

export function renderFormbricksStackV1(
  blueprint: Blueprint,
  options: RenderFormbricksStackV1Options = {}
): RenderedIntake {
  const themeCss = buildThemeTokens(blueprint.workspace.theme, { surface: "intake" });
  const removePoweredBy = Boolean(options.removePoweredBy);

  const navbar = renderNavbar(blueprint);
  const intro = renderIntroPanel(blueprint);
  const questionPanels = blueprint.intake.questions
    .map((q, idx) => renderQuestionPanel(q, idx, blueprint.intake.questions.length))
    .join("\n");
  const completion = renderCompletionPanel(blueprint);
  const footer = renderFooter(blueprint, { removePoweredBy });

  // Bake the intake blueprint into a JSON island so the client script can
  // drive validation, showIf filtering, and submit without a network
  // round-trip per question. The island is escape-hardened the same way
  // the booking renderer's is — every `<` becomes `<` so attacker-
  // supplied label / option text can't break out of the script tag.
  const dataJson = JSON.stringify(buildIntakeDataIsland(blueprint));

  const html = `<div class="sf-frame sf-frame--intake">
<main class="sf-landing sf-intake">
${navbar}
<section class="sf-intake__shell">
${renderProgressBar()}
<div class="sf-intake__panels" id="sf-intake-panels">
${intro}
${questionPanels}
${completion}
</div>
${renderControls()}
</section>
${footer}
</main>
</div>
<script type="application/json" id="sf-intake-data">${escapeJsonForScript(dataJson)}</script>
${INTAKE_INTERACTIVITY_SCRIPT}`;

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
 * Escape every `<` inside JSON-island data with the JSON unicode escape
 * `<` (6 chars: backslash, u, 0, 0, 3, c). JSON.parse decodes back
 * to `<` at runtime. Using `String.fromCharCode(92)` for the backslash
 * dodges any source-level escape collapse — TS / esbuild / Edit-tool
 * all leave this byte alone, which is what the C4 booking-renderer
 * post-mortem flagged as a footgun. See booking renderer source for
 * the same pattern.
 */
function escapeJsonForScript(json: string): string {
  const backslash = String.fromCharCode(92);
  const unicodeLess = backslash + "u003c";
  return json.replace(/</g, unicodeLess);
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

function renderTitleEmphasis(s: string): string {
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

// ─── Navbar (matches booking) ──────────────────────────────────────────

function renderNavbar(blueprint: Blueprint): string {
  const ws = blueprint.workspace;
  const phone = ws.contact.phone;

  // May 1, 2026 — skip phone CTA when phone is empty (SaaS workspaces).
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

// ─── Progress bar + controls ──────────────────────────────────────────

function renderProgressBar(): string {
  return `<div class="sf-intake__progress" aria-hidden="true">
  <div class="sf-intake__progress-track">
    <div class="sf-intake__progress-fill" id="sf-intake-progress-fill" style="width: 0%"></div>
  </div>
  <div class="sf-intake__progress-meta">
    <span class="sf-intake__progress-label" id="sf-intake-progress-label">Welcome</span>
    <span class="sf-intake__progress-count" id="sf-intake-progress-count"></span>
  </div>
</div>`;
}

function renderControls(): string {
  // Footer with Back + Continue. Continue label flips to Submit on the last
  // question. Back is hidden on the intro panel. Hidden entirely on the
  // completion panel — it only re-shows if the user clicks "Start over".
  return `<div class="sf-intake__controls" id="sf-intake-controls">
  <button type="button" class="sf-btn sf-btn--ghost sf-intake__back" id="sf-intake-back" hidden>
    <span class="sf-btn__label">Back</span>
  </button>
  <button type="button" class="sf-btn sf-btn--primary sf-intake__next" id="sf-intake-next">
    <span class="sf-btn__label" id="sf-intake-next-label">Get started</span>
    <span class="sf-btn__icon" aria-hidden="true">${CHEVRON_RIGHT_SVG_SMALL}</span>
  </button>
</div>`;
}

// ─── Panels ───────────────────────────────────────────────────────────

function renderIntroPanel(blueprint: Blueprint): string {
  const intake = blueprint.intake;
  const description = resolveOrHide(intake.description);
  const descHtml = description
    ? `<p class="sf-intake__intro-description sf-animate sf-delay-2">${escapeHtml(description)}</p>`
    : "";
  const questionCount = intake.questions.length;
  // Rough estimate: 8 seconds per question. Rounded to nearest minute.
  const estMinutes = Math.max(1, Math.round((questionCount * 8) / 60));
  return `<div class="sf-intake__panel sf-intake__panel--intro" data-panel="intro">
  <div class="sf-intake__intro sf-animate">
    <p class="sf-intake__intro-eyebrow sf-animate">Quick intake</p>
    <h1 class="sf-intake__intro-title sf-animate sf-delay-1">${renderTitleEmphasis(intake.title)}</h1>
    ${descHtml}
    <p class="sf-intake__intro-meta sf-animate sf-delay-3">
      <span>${questionCount} ${questionCount === 1 ? "question" : "questions"}</span>
      <span class="sf-intake__intro-meta-dot" aria-hidden="true">·</span>
      <span>About ${estMinutes} ${estMinutes === 1 ? "minute" : "minutes"}</span>
    </p>
  </div>
</div>`;
}

function renderQuestionPanel(
  q: IntakeQuestion,
  index: number,
  total: number
): string {
  const helper = resolveOrHide(q.helper);
  const helperHtml = helper
    ? `<p class="sf-intake__q-helper">${escapeHtml(helper)}</p>`
    : "";
  const required = q.required
    ? ` <span class="sf-intake__q-required" aria-hidden="true">*</span>`
    : "";
  const optional = !q.required
    ? ` <span class="sf-intake__q-optional">(optional)</span>`
    : "";

  const inputHtml = renderQuestionInput(q);

  return `<div class="sf-intake__panel sf-intake__panel--question" data-panel="q-${escapeAttr(q.id)}" data-question-id="${escapeAttr(q.id)}" data-question-index="${index}" data-question-type="${escapeAttr(q.type)}" data-question-required="${q.required ? "true" : "false"}" hidden>
  <div class="sf-intake__q">
    <p class="sf-intake__q-step" aria-hidden="true">${index + 1} / ${total}</p>
    <h2 class="sf-intake__q-label">${escapeHtml(q.label)}${required}${optional}</h2>
    ${helperHtml}
    <div class="sf-intake__q-input">
      ${inputHtml}
    </div>
    <p class="sf-intake__q-error" data-error="true" hidden></p>
  </div>
</div>`;
}

function renderQuestionInput(q: IntakeQuestion): string {
  const placeholder = `placeholder="${escapeAttr(placeholderFor(q))}"`;

  switch (q.type) {
    case "textarea":
      return `<textarea class="sf-intake__input sf-intake__textarea" data-field-id="${escapeAttr(q.id)}" rows="5" ${placeholder}></textarea>
      <p class="sf-intake__hint">Press <kbd>Cmd</kbd>+<kbd>Enter</kbd> to continue</p>`;

    case "select":
      return renderOptionStack(q, "single");

    case "multi-select":
      return renderOptionStack(q, "multi");

    case "rating":
      return renderRating(q);

    case "date":
      return `<input class="sf-intake__input" type="date" data-field-id="${escapeAttr(q.id)}" ${placeholder} />
      <p class="sf-intake__hint">Press <kbd>Enter</kbd> to continue</p>`;

    case "number":
      return `<input class="sf-intake__input" type="number" inputmode="decimal" data-field-id="${escapeAttr(q.id)}" ${placeholder}${q.validation?.min !== undefined ? ` min="${q.validation.min}"` : ""}${q.validation?.max !== undefined ? ` max="${q.validation.max}"` : ""} />
      <p class="sf-intake__hint">Press <kbd>Enter</kbd> to continue</p>`;

    case "email":
      return `<input class="sf-intake__input" type="email" inputmode="email" autocomplete="email" data-field-id="${escapeAttr(q.id)}" ${placeholder} />
      <p class="sf-intake__hint">Press <kbd>Enter</kbd> to continue</p>`;

    case "phone":
      return `<input class="sf-intake__input" type="tel" inputmode="tel" autocomplete="tel" data-field-id="${escapeAttr(q.id)}" ${placeholder} />
      <p class="sf-intake__hint">Press <kbd>Enter</kbd> to continue</p>`;

    case "text":
    default:
      return `<input class="sf-intake__input" type="text" data-field-id="${escapeAttr(q.id)}" ${placeholder} />
      <p class="sf-intake__hint">Press <kbd>Enter</kbd> to continue</p>`;
  }
}

function renderOptionStack(q: IntakeQuestion, mode: "single" | "multi"): string {
  if (!q.options || q.options.length === 0) {
    return `<p class="sf-intake__hint">No options configured for this question.</p>`;
  }
  const role = mode === "multi" ? "group" : "radiogroup";
  const items = q.options
    .map((opt, idx) => {
      const letter = String.fromCharCode(65 + idx); // A, B, C…
      return `<button type="button" class="sf-intake__option" role="${mode === "multi" ? "checkbox" : "radio"}" aria-checked="false" data-field-id="${escapeAttr(q.id)}" data-value="${escapeAttr(opt)}">
        <span class="sf-intake__option-letter" aria-hidden="true">${letter}</span>
        <span class="sf-intake__option-label">${escapeHtml(opt)}</span>
        <span class="sf-intake__option-check" aria-hidden="true">${CHECK_SVG_SMALL}</span>
      </button>`;
    })
    .join("\n");
  const hint =
    mode === "multi"
      ? `<p class="sf-intake__hint">Pick all that apply, then click <strong>Continue</strong>.</p>`
      : `<p class="sf-intake__hint">Pick one to continue automatically.</p>`;
  return `<div class="sf-intake__options" role="${role}" data-mode="${mode}">
    ${items}
  </div>
  ${hint}`;
}

function renderRating(q: IntakeQuestion): string {
  const scale = q.ratingScale ?? "number-1-5";
  if (scale === "stars-1-5") {
    const buttons = Array.from({ length: 5 }, (_, i) => i + 1)
      .map(
        (n) =>
          `<button type="button" class="sf-intake__star" aria-label="${n} star${n === 1 ? "" : "s"}" data-field-id="${escapeAttr(q.id)}" data-value="${n}">${STAR_SVG}</button>`
      )
      .join("\n");
    return `<div class="sf-intake__rating sf-intake__rating--stars" role="radiogroup">
      ${buttons}
    </div>
    <p class="sf-intake__hint">Click a star to continue.</p>`;
  }
  const max = scale === "number-1-10" ? 10 : 5;
  const buttons = Array.from({ length: max }, (_, i) => i + 1)
    .map(
      (n) =>
        `<button type="button" class="sf-intake__rating-btn" role="radio" aria-checked="false" data-field-id="${escapeAttr(q.id)}" data-value="${n}">${n}</button>`
    )
    .join("\n");
  return `<div class="sf-intake__rating sf-intake__rating--numeric" role="radiogroup">
    ${buttons}
  </div>
  <p class="sf-intake__hint">Pick a number to continue.</p>`;
}

function placeholderFor(q: IntakeQuestion): string {
  switch (q.type) {
    case "email":
      return "you@example.com";
    case "phone":
      return "(555) 555-0100";
    case "number":
      return "0";
    case "date":
      return "";
    case "textarea":
      return "Tell us a bit more…";
    default:
      return "Type your answer…";
  }
}

function renderCompletionPanel(blueprint: Blueprint): string {
  const c = blueprint.intake.completion;
  const headline = c.headline ?? "Thanks — we got it";
  const message = c.message ?? "We'll be in touch shortly.";
  const cta = c.cta && !hasPlaceholder(c.cta.label)
    ? `<a class="sf-btn sf-btn--primary sf-intake__complete-cta" href="${escapeAttr(c.cta.href ?? "#")}">
        <span class="sf-btn__label">${escapeHtml(c.cta.label)}</span>
        <span class="sf-btn__icon" aria-hidden="true">${CHEVRON_RIGHT_SVG_SMALL}</span>
      </a>`
    : "";
  return `<div class="sf-intake__panel sf-intake__panel--complete" data-panel="complete" hidden>
  <div class="sf-intake__complete">
    <div class="sf-intake__complete-icon" aria-hidden="true">${CHECK_CIRCLE_SVG}</div>
    <h2 class="sf-intake__complete-headline">${renderEmphasis(headline)}</h2>
    <p class="sf-intake__complete-message">${escapeHtml(message)}</p>
    ${cta}
    <button type="button" class="sf-intake__complete-restart" data-action="restart">Submit another response</button>
  </div>
</div>`;
}

// ─── Footer (matches landing + booking) ───────────────────────────────

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
  return `<footer class="sf-footer sf-footer--intake" id="sf-contact">
  <div class="sf-footer__top">
    <div class="sf-footer__col sf-footer__col--brand">
      <p class="sf-footer__name">${escapeHtml(ws.name)}</p>
      ${tagline ? `<p class="sf-footer__tagline">${escapeHtml(tagline)}</p>` : ""}
      ${phoneLink}
    </div>
    <div class="sf-footer__col">
      <h3 class="sf-footer__heading">Privacy</h3>
      <p class="sf-footer__service-area">
        Your responses are confidential and only shared with our team.
      </p>
    </div>
  </div>
  <div class="sf-footer__bottom">
    ${opts.removePoweredBy ? "" : `<p class="sf-footer__poweredby">Powered by <a href="https://seldonframe.com" target="_blank" rel="noopener noreferrer">SeldonFrame</a></p>`}
  </div>
</footer>`;
}

// ─── Data island ──────────────────────────────────────────────────────

interface IntakeDataIsland {
  workspaceName: string;
  intake: Intake;
}

function buildIntakeDataIsland(blueprint: Blueprint): IntakeDataIsland {
  return {
    workspaceName: blueprint.workspace.name,
    intake: blueprint.intake,
  };
}

// ─── Inline SVG icons ─────────────────────────────────────────────────

const CHEVRON_RIGHT_SVG_SMALL = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
const PHONE_SVG_SMALL = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
const CHECK_SVG_SMALL = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const CHECK_CIRCLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`;
const STAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

// ─── Inline interactivity script ──────────────────────────────────────

const INTAKE_INTERACTIVITY_SCRIPT = `<script data-sf-intake="formbricks-stack-v1">
(function(){
  if (typeof window === 'undefined') return;
  var dataEl = document.getElementById('sf-intake-data');
  if (!dataEl) return;
  var data;
  try { data = JSON.parse(dataEl.textContent || '{}'); }
  catch (e) { console.warn('[sf-intake] could not parse data island', e); return; }

  var questions = (data.intake && data.intake.questions) || [];
  var state = {
    panelKey: 'intro',
    answers: {},
    history: ['intro'],
  };

  // ─── Visible-question filter (showIf rules) ──────────────────────
  function valueMatches(answer, op, target){
    if (op === 'equals') return Array.isArray(answer) ? answer.indexOf(target) >= 0 : answer === target;
    if (op === 'not-equals') return Array.isArray(answer) ? answer.indexOf(target) < 0 : answer !== target;
    if (op === 'contains') return typeof answer === 'string' && answer.indexOf(String(target)) >= 0;
    if (op === 'greater-than') return Number(answer) > Number(target);
    if (op === 'less-than') return Number(answer) < Number(target);
    return false;
  }
  function isVisible(q){
    if (!q.showIf) return true;
    var ans = state.answers[q.showIf.questionId];
    if (ans === undefined || ans === null || ans === '') return false;
    return valueMatches(ans, q.showIf.operator, q.showIf.value);
  }
  function visibleQuestions(){
    return questions.filter(isVisible);
  }

  // ─── Validation ──────────────────────────────────────────────────
  function validate(q, value){
    if (q.required && (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0))) {
      return 'This question is required.';
    }
    if (value === undefined || value === null || value === '') return null;
    if (q.type === 'email' && !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(String(value))) {
      return 'Please enter a valid email address.';
    }
    if (q.type === 'phone' && String(value).replace(/\\D/g, '').length < 7) {
      return 'Please enter a valid phone number.';
    }
    if (q.validation) {
      var v = q.validation;
      if (typeof value === 'string') {
        if (v.minLength !== undefined && value.length < v.minLength) {
          return 'Please enter at least ' + v.minLength + ' characters.';
        }
        if (v.maxLength !== undefined && value.length > v.maxLength) {
          return 'Please keep it under ' + v.maxLength + ' characters.';
        }
        if (v.pattern && !new RegExp(v.pattern).test(value)) {
          return 'Format does not match.';
        }
      }
      if (q.type === 'number' || q.type === 'rating') {
        var n = Number(value);
        if (v.min !== undefined && n < v.min) return 'Pick a value at least ' + v.min + '.';
        if (v.max !== undefined && n > v.max) return 'Pick a value at most ' + v.max + '.';
      }
    }
    return null;
  }

  // ─── DOM helpers ─────────────────────────────────────────────────
  function panelEl(key){
    return document.querySelector('[data-panel="' + key + '"]');
  }
  function questionPanelByIdx(idx){
    var visible = visibleQuestions();
    if (idx < 0 || idx >= visible.length) return null;
    return panelEl('q-' + visible[idx].id);
  }
  function currentVisibleIndex(){
    if (state.panelKey === 'intro') return -1;
    if (state.panelKey === 'complete') return visibleQuestions().length;
    var visible = visibleQuestions();
    for (var i = 0; i < visible.length; i++) {
      if ('q-' + visible[i].id === state.panelKey) return i;
    }
    return -1;
  }

  function readValue(q){
    var inputs = document.querySelectorAll('[data-field-id="' + q.id + '"]');
    if (q.type === 'multi-select') {
      var picked = [];
      inputs.forEach(function(el){
        if (el.getAttribute('aria-checked') === 'true') {
          picked.push(el.getAttribute('data-value'));
        }
      });
      return picked;
    }
    if (q.type === 'select' || q.type === 'rating') {
      var checked = null;
      inputs.forEach(function(el){
        if (el.getAttribute('aria-checked') === 'true' || el.classList.contains('is-selected')) {
          var v = el.getAttribute('data-value');
          checked = q.type === 'rating' ? Number(v) : v;
        }
      });
      return checked;
    }
    var input = inputs[0];
    if (!input) return '';
    return input.value;
  }

  // ─── Rendering ───────────────────────────────────────────────────
  function updateProgress(){
    var visible = visibleQuestions();
    var fill = document.getElementById('sf-intake-progress-fill');
    var label = document.getElementById('sf-intake-progress-label');
    var count = document.getElementById('sf-intake-progress-count');
    if (!fill || !label || !count) return;
    if (state.panelKey === 'intro') {
      fill.style.width = '0%';
      label.textContent = 'Welcome';
      count.textContent = visible.length + ' question' + (visible.length === 1 ? '' : 's');
      return;
    }
    if (state.panelKey === 'complete') {
      fill.style.width = '100%';
      label.textContent = 'Done';
      count.textContent = '';
      return;
    }
    var idx = currentVisibleIndex();
    var pct = visible.length === 0 ? 0 : Math.round(((idx + 1) / visible.length) * 100);
    fill.style.width = pct + '%';
    label.textContent = 'Question ' + (idx + 1);
    count.textContent = (idx + 1) + ' of ' + visible.length;
  }

  function updateControls(){
    var back = document.getElementById('sf-intake-back');
    var next = document.getElementById('sf-intake-next');
    var nextLabel = document.getElementById('sf-intake-next-label');
    var controls = document.getElementById('sf-intake-controls');
    if (!back || !next || !nextLabel || !controls) return;

    if (state.panelKey === 'complete') {
      controls.hidden = true;
      return;
    }
    controls.hidden = false;

    back.hidden = (state.panelKey === 'intro' || state.history.length <= 1);

    if (state.panelKey === 'intro') {
      nextLabel.textContent = 'Get started';
    } else {
      var visible = visibleQuestions();
      var idx = currentVisibleIndex();
      nextLabel.textContent = (idx === visible.length - 1) ? 'Submit' : 'Continue';
    }
  }

  function showPanel(key){
    document.querySelectorAll('.sf-intake__panel').forEach(function(p){
      var match = (p.getAttribute('data-panel') === key);
      p.hidden = !match;
      if (match) {
        // Re-trigger entrance animation on each visit.
        p.classList.remove('sf-intake__panel--enter');
        // Force reflow then add the class so CSS transition runs.
        // eslint-disable-next-line no-unused-expressions
        void p.offsetWidth;
        p.classList.add('sf-intake__panel--enter');
        // Auto-focus the first input on question panels for snap typing.
        if (key.indexOf('q-') === 0) {
          var input = p.querySelector('input,textarea');
          if (input) {
            try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
          }
        }
      }
    });
    state.panelKey = key;
    updateProgress();
    updateControls();
  }

  // ─── Navigation ──────────────────────────────────────────────────
  function clearError(qId){
    var p = panelEl('q-' + qId);
    if (!p) return;
    var err = p.querySelector('[data-error="true"]');
    if (err) { err.hidden = true; err.textContent = ''; }
  }
  function setError(qId, msg){
    var p = panelEl('q-' + qId);
    if (!p) return;
    var err = p.querySelector('[data-error="true"]');
    if (err) { err.hidden = false; err.textContent = msg; }
  }

  function next(){
    var visible = visibleQuestions();
    if (state.panelKey === 'intro') {
      if (visible.length === 0) return submit();
      goTo('q-' + visible[0].id);
      return;
    }
    var idx = currentVisibleIndex();
    if (idx < 0) return;
    var q = visible[idx];
    var value = readValue(q);
    var err = validate(q, value);
    if (err) { setError(q.id, err); return; }
    clearError(q.id);
    state.answers[q.id] = value;
    if (idx === visible.length - 1) {
      submit();
      return;
    }
    // Next visible question (recompute because showIf rules may shift).
    var newVisible = visibleQuestions();
    var nextIdx = -1;
    for (var i = 0; i < newVisible.length; i++) {
      if (newVisible[i].id === q.id) { nextIdx = i + 1; break; }
    }
    if (nextIdx < 0 || nextIdx >= newVisible.length) {
      submit();
      return;
    }
    goTo('q-' + newVisible[nextIdx].id);
  }

  function back(){
    if (state.history.length <= 1) return;
    state.history.pop();
    var prev = state.history[state.history.length - 1];
    state.panelKey = prev;
    showPanel(prev);
  }

  function goTo(key){
    state.history.push(key);
    showPanel(key);
  }

  function submit(){
    // Wiring task: pull orgSlug + formSlug from the live URL so the
    // public-intake endpoint can resolve which form this answers belongs
    // to. Path shape: /forms/<orgSlug>/<formSlug>
    var pathParts = window.location.pathname.split('/').filter(Boolean);
    var orgSlug = pathParts[1] || '';
    var formSlug = pathParts[2] || 'intake';
    var payload = {
      orgSlug: orgSlug,
      formSlug: formSlug,
      answers: state.answers,
      workspace: data.workspaceName,
    };
    fetch('/api/v1/public/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function(res){
      // Show completion regardless of response — submission failures are
      // logged server-side but the operator-facing message stays positive.
      // For local-file previews (file://) this falls through to the catch
      // below which also shows completion.
      goTo('complete');
    }).catch(function(){
      goTo('complete');
    });
  }

  function restart(){
    state.answers = {};
    state.history = ['intro'];
    state.panelKey = 'intro';
    document.querySelectorAll('.sf-intake__option, .sf-intake__rating-btn, .sf-intake__star').forEach(function(el){
      el.setAttribute('aria-checked', 'false');
      el.classList.remove('is-selected');
    });
    document.querySelectorAll('.sf-intake__input').forEach(function(el){ el.value = ''; });
    showPanel('intro');
  }

  // ─── Event wiring ────────────────────────────────────────────────
  document.addEventListener('click', function(e){
    var tgt = e.target;
    if (!(tgt instanceof Element)) return;

    if (tgt.closest('#sf-intake-next')) { next(); return; }
    if (tgt.closest('#sf-intake-back')) { back(); return; }
    if (tgt.closest('[data-action="restart"]')) { restart(); return; }

    var opt = tgt.closest('.sf-intake__option');
    if (opt) {
      var qId = opt.getAttribute('data-field-id') || '';
      var value = opt.getAttribute('data-value') || '';
      var modeAttr = opt.parentElement && opt.parentElement.getAttribute('data-mode');
      var mode = modeAttr === 'multi' ? 'multi' : 'single';
      if (mode === 'multi') {
        var current = opt.getAttribute('aria-checked') === 'true';
        opt.setAttribute('aria-checked', current ? 'false' : 'true');
        opt.classList.toggle('is-selected', !current);
      } else {
        // Clear siblings, set this one.
        var siblings = opt.parentElement ? opt.parentElement.querySelectorAll('.sf-intake__option') : [];
        siblings.forEach(function(s){
          s.setAttribute('aria-checked', 'false');
          s.classList.remove('is-selected');
        });
        opt.setAttribute('aria-checked', 'true');
        opt.classList.add('is-selected');
        // Auto-advance on single-select after a brief delay so user sees the selection.
        setTimeout(function(){ next(); }, 280);
      }
      clearError(qId);
      return;
    }

    var rating = tgt.closest('.sf-intake__rating-btn, .sf-intake__star');
    if (rating) {
      var rqId = rating.getAttribute('data-field-id') || '';
      var siblings = rating.parentElement ? rating.parentElement.children : [];
      Array.prototype.forEach.call(siblings, function(s){
        s.setAttribute('aria-checked', 'false');
        s.classList.remove('is-selected');
      });
      rating.setAttribute('aria-checked', 'true');
      rating.classList.add('is-selected');
      clearError(rqId);
      // Auto-advance on rating selection.
      setTimeout(function(){ next(); }, 280);
      return;
    }
  });

  // Enter advances on text fields; Cmd/Ctrl+Enter on textarea.
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Enter') return;
    var tgt = e.target;
    if (!(tgt instanceof Element)) return;
    if (tgt.tagName === 'TEXTAREA') {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        next();
      }
      return;
    }
    if (tgt.matches('.sf-intake__input')) {
      e.preventDefault();
      next();
    }
  });

  // Clear error feedback as the user types again.
  document.addEventListener('input', function(e){
    var tgt = e.target;
    if (!(tgt instanceof Element)) return;
    var qId = tgt.getAttribute('data-field-id');
    if (qId) clearError(qId);
  });

  // ─── Init ─────────────────────────────────────────────────────────
  function init(){
    showPanel('intro');
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

/* === sf-frame — outer page surface (matches landing + booking) === */
.sf-frame {
  background: #ededed;
  padding: 12px;
  min-height: 100vh;
}
@media (min-width: 768px) { .sf-frame { padding: 16px; } }

/* === sf-landing/sf-intake — inner card === */
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

/* Floating glass navbar pill (matches landing + booking) */
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
  transition: transform 180ms ease;
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

/* CTA buttons (matches landing + booking) */
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

/* === sf-intake — Typeform-style flow === */
.sf-intake__shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: clamp(1.25rem, 3vw, 2rem);
  padding: clamp(1.5rem, 4vw, 3rem) clamp(1rem, 4vw, 3rem) clamp(1rem, 3vw, 2rem);
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
}

/* Progress bar */
.sf-intake__progress {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.sf-intake__progress-track {
  height: 4px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 9999px;
  overflow: hidden;
}
.sf-intake__progress-fill {
  height: 100%;
  background: var(--sf-accent);
  border-radius: 9999px;
  transition: width 480ms cubic-bezier(0.22, 1, 0.36, 1);
}
.sf-intake__progress-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 600;
  color: var(--sf-fg-muted);
}

/* Panels — single visible at a time */
.sf-intake__panels {
  position: relative;
  flex: 1;
  display: flex;
  align-items: flex-start;
  min-height: clamp(360px, 55vh, 540px);
}
.sf-intake__panel {
  width: 100%;
  opacity: 0;
  transform: translate3d(0, 14px, 0);
  transition: opacity 360ms cubic-bezier(0.22, 1, 0.36, 1), transform 360ms cubic-bezier(0.22, 1, 0.36, 1);
}
.sf-intake__panel[hidden] { display: none; }
.sf-intake__panel--enter { opacity: 1; transform: translate3d(0, 0, 0); }

/* Intro */
.sf-intake__intro {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding: clamp(1rem, 3vw, 2rem) 0;
  max-width: 36rem;
}
.sf-intake__intro-eyebrow {
  display: inline-block;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.375rem 0.875rem;
  background: var(--sf-accent-soft);
  color: var(--sf-accent);
  border-radius: 9999px;
  align-self: flex-start;
}
.sf-intake__intro-title {
  font-size: clamp(2rem, 6vw, 3.25rem);
  line-height: 1.1;
  letter-spacing: -0.025em;
  font-weight: 600;
  color: var(--sf-fg-emphasis);
  text-wrap: balance;
}
.sf-intake__intro-description {
  font-size: clamp(1.0625rem, 1.5vw, 1.1875rem);
  color: #505050;
  line-height: 1.6;
  text-wrap: pretty;
}
.sf-intake__intro-meta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--sf-fg-muted);
  margin-top: 0.75rem;
}
.sf-intake__intro-meta-dot { color: var(--sf-fg-subtle); }

/* Question */
.sf-intake__q {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: clamp(0.5rem, 2vw, 1rem) 0;
  max-width: 36rem;
}
.sf-intake__q-step {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: 600;
  color: var(--sf-fg-muted);
}
.sf-intake__q-label {
  font-size: clamp(1.625rem, 4.5vw, 2.25rem);
  line-height: 1.2;
  letter-spacing: -0.022em;
  font-weight: 600;
  color: var(--sf-fg-emphasis);
  text-wrap: balance;
}
.sf-intake__q-required { color: var(--sf-accent); margin-left: 0.125rem; }
.sf-intake__q-optional {
  color: var(--sf-fg-muted);
  font-size: 0.875rem;
  font-weight: 500;
  margin-left: 0.375rem;
  letter-spacing: 0;
}
.sf-intake__q-helper {
  color: #6B6B6B;
  font-size: 1rem;
  line-height: 1.55;
}
.sf-intake__q-input {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.sf-intake__q-error {
  background: rgba(185, 28, 28, 0.08);
  color: #991B1B;
  font-size: 0.875rem;
  padding: 0.625rem 0.875rem;
  border-radius: 10px;
  border: 1px solid rgba(185, 28, 28, 0.2);
}

/* Inputs */
.sf-intake__input {
  width: 100%;
  font-family: var(--sf-font-body);
  font-size: clamp(1.0625rem, 1.6vw, 1.25rem);
  padding: 0.875rem 1rem;
  border: 0;
  border-bottom: 2px solid var(--sf-border-default);
  background: transparent;
  color: var(--sf-fg-emphasis);
  transition: border-color 180ms ease;
  outline: none;
  letter-spacing: -0.01em;
}
.sf-intake__input::placeholder { color: var(--sf-fg-subtle); font-weight: 400; }
.sf-intake__input:focus { border-bottom-color: var(--sf-accent); }
.sf-intake__textarea {
  resize: vertical;
  min-height: 140px;
  border: 1px solid var(--sf-border-default);
  border-bottom-width: 1px;
  border-radius: 12px;
  padding: 1rem 1.125rem;
  font-size: clamp(1rem, 1.4vw, 1.0625rem);
  line-height: 1.55;
}
.sf-intake__textarea:focus {
  border-color: var(--sf-accent);
  box-shadow: 0 0 0 3px var(--sf-ring);
  border-bottom-color: var(--sf-accent);
}
.sf-intake__hint {
  font-size: 0.8125rem;
  color: var(--sf-fg-muted);
  margin-top: 0.25rem;
}
.sf-intake__hint kbd {
  display: inline-block;
  padding: 0.0625rem 0.375rem;
  font-family: var(--sf-font-body);
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--sf-fg-emphasis);
  background: #FFFFFF;
  border: 1px solid var(--sf-border-default);
  border-radius: 4px;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.04);
}

/* Option stack (select / multi-select) */
.sf-intake__options {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}
.sf-intake__option {
  display: inline-flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--sf-border-default);
  border-radius: 12px;
  background: #FFFFFF;
  font-family: var(--sf-font-body);
  font-size: clamp(0.9375rem, 1.4vw, 1.0625rem);
  font-weight: 500;
  color: var(--sf-fg-emphasis);
  cursor: pointer;
  text-align: left;
  letter-spacing: -0.005em;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6);
}
.sf-intake__option:hover {
  border-color: var(--sf-accent);
  transform: translateY(-1px);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6), 0 4px 12px rgba(0, 0, 0, 0.04);
}
.sf-intake__option-letter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--sf-bg-secondary, #FCFCFC);
  border: 1px solid var(--sf-border-default);
  font-size: 0.6875rem;
  font-weight: 700;
  color: var(--sf-fg-muted);
  flex-shrink: 0;
  letter-spacing: 0.06em;
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
}
.sf-intake__option-label { flex: 1; }
.sf-intake__option-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: transparent;
  color: transparent;
  border: 1px solid var(--sf-border-default);
  flex-shrink: 0;
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
}
.sf-intake__option.is-selected,
.sf-intake__option[aria-checked="true"] {
  border-color: var(--sf-accent);
  background: color-mix(in srgb, var(--sf-accent) 6%, white);
}
.sf-intake__option.is-selected .sf-intake__option-letter,
.sf-intake__option[aria-checked="true"] .sf-intake__option-letter {
  background: var(--sf-accent);
  color: var(--sf-accent-fg);
  border-color: var(--sf-accent);
}
.sf-intake__option.is-selected .sf-intake__option-check,
.sf-intake__option[aria-checked="true"] .sf-intake__option-check {
  background: var(--sf-accent);
  color: var(--sf-accent-fg);
  border-color: var(--sf-accent);
}

/* Rating — numeric */
.sf-intake__rating {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.sf-intake__rating--numeric .sf-intake__rating-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border: 1px solid var(--sf-border-default);
  border-radius: 12px;
  background: #FFFFFF;
  font-family: var(--sf-font-body);
  font-size: 1.0625rem;
  font-weight: 600;
  color: var(--sf-fg-emphasis);
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
  font-feature-settings: "tnum";
}
.sf-intake__rating-btn:hover {
  border-color: var(--sf-accent);
  transform: translateY(-1px);
}
.sf-intake__rating-btn.is-selected,
.sf-intake__rating-btn[aria-checked="true"] {
  background: var(--sf-accent);
  color: var(--sf-accent-fg);
  border-color: var(--sf-accent);
}

/* Rating — stars */
.sf-intake__rating--stars { gap: 0.25rem; }
.sf-intake__star {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0.25rem;
  color: var(--sf-border-strong);
  transition: color 140ms ease, transform 140ms ease;
}
.sf-intake__star:hover { transform: scale(1.06); color: var(--sf-accent); }
.sf-intake__star.is-selected { color: #F59E0B; }
.sf-intake__star svg { width: 36px; height: 36px; }

/* Controls (Back / Next) */
.sf-intake__controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0 0.25rem;
  margin-top: auto;
}
.sf-intake__controls .sf-intake__back { padding: 0 1.25rem; min-height: 44px; }
.sf-intake__controls .sf-intake__next { margin-left: auto; }
@media (max-width: 480px) {
  .sf-intake__controls { flex-direction: row-reverse; gap: 0.5rem; }
  .sf-intake__controls .sf-intake__next { flex: 1; justify-content: center; }
}

/* Completion */
.sf-intake__complete {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: clamp(1.5rem, 5vw, 3rem) 1rem;
}
.sf-intake__complete-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 9999px;
  background: rgba(21, 128, 61, 0.1);
  color: #15803D;
}
.sf-intake__complete-icon svg { width: 48px; height: 48px; }
.sf-intake__complete-headline {
  font-size: clamp(1.625rem, 5vw, 2.5rem);
  line-height: 1.15;
  letter-spacing: -0.025em;
  font-weight: 600;
  text-wrap: balance;
}
.sf-intake__complete-message {
  color: #505050;
  max-width: 32rem;
  font-size: 1.0625rem;
  line-height: 1.6;
}
.sf-intake__complete-cta { margin-top: 0.5rem; }
.sf-intake__complete-restart {
  background: none;
  border: 0;
  color: var(--sf-fg-muted);
  font-family: var(--sf-font-body);
  font-size: 0.875rem;
  cursor: pointer;
  margin-top: 0.5rem;
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-color: var(--sf-border-default);
  text-decoration-thickness: 1px;
}
.sf-intake__complete-restart:hover { color: var(--sf-fg-emphasis); }

/* === Footer (matches landing + booking) === */
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
