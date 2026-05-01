// ============================================================================
// Cinematic CSS overlay — applied when DesignTokens.mode = "dark" + glassmorphism.
// ============================================================================
//
// May 1, 2026 — primitives architecture renderer upgrade. The legacy V1
// renderer produces clean light-mode HTML. To get cinematic-quality output
// (Velorah / Nexora vibe — dark, glass-pill nav, blur-in entrance, italic
// editorial display fonts) without rewriting the renderer, we overlay CSS
// scoped under `.sf-frame.sf-cinematic`.
//
// Existing local-service workspaces stay byte-identical — they don't get
// the `sf-cinematic` class on the root frame, so none of these rules
// activate.
//
// Pure HTML + CSS + the existing inline IntersectionObserver script. No
// React runtime, no Framer Motion, no build step.

import type { DesignTokens } from "@/lib/page-schema/design-tokens";

/**
 * Build a Google Fonts <link> tag based on the typography tokens. Returns
 * empty string for fonts already shipped via system stacks (Inter is
 * loaded site-wide; system-ui is local). For Instrument Serif, we always
 * include `ital@0;1` so headings can use italic.
 */
export function buildFontLink(tokens: DesignTokens): string {
  const families = new Set<string>();

  const display = tokens.typography.display;
  const body = tokens.typography.body;

  if (display && display.toLowerCase() !== "system-ui") {
    families.add(googleFontFamilyParam(display, /*italic*/ true));
  }
  if (body && body.toLowerCase() !== "system-ui" && body !== display) {
    families.add(googleFontFamilyParam(body, /*italic*/ false));
  }

  if (families.size === 0) return "";

  const familyParams = Array.from(families).join("&family=");
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=${familyParams}&display=swap" rel="stylesheet">`;
}

function googleFontFamilyParam(family: string, withItalic: boolean): string {
  const encoded = family.replace(/\s+/g, "+");
  // Editorial / display fonts get italic variants for the Instrument Serif
  // headline treatment. Body fonts only need weight axes.
  if (withItalic) {
    return `${encoded}:ital,wght@0,400;0,500;0,600;1,400;1,500`;
  }
  return `${encoded}:wght@300;400;500;600`;
}

/**
 * Cinematic CSS — appended to the rendered output's stylesheet whenever
 * the renderer is in cinematic mode (tokens.mode === "dark" + tokens
 * .effects.glassmorphism). Scoped under `.sf-frame.sf-cinematic` so it
 * only activates on workspaces that opted in.
 *
 * Substitution: `{{accent}}` → tokens.palette.accent, `{{display}}` →
 * tokens.typography.display, `{{body}}` → tokens.typography.body.
 */
const CINEMATIC_TEMPLATE = `
/* ========================================================================
   CINEMATIC OVERLAY — May 1, 2026 primitives architecture
   Activated when .sf-frame has .sf-cinematic class (scoped overrides only).
   ======================================================================== */

.sf-frame.sf-cinematic {
  background: #060608;
  color: #f5f5f7;
  font-family: '{{body}}', system-ui, -apple-system, sans-serif;
  --sf-cinematic-accent: {{accent}};
  --sf-cinematic-text: #f5f5f7;
  --sf-cinematic-text-muted: rgba(245, 245, 247, 0.65);
  --sf-cinematic-text-subtle: rgba(245, 245, 247, 0.45);
  --sf-cinematic-bg: #060608;
  --sf-cinematic-bg-elevated: rgba(255, 255, 255, 0.02);
  --sf-cinematic-border: rgba(255, 255, 255, 0.08);
}

/* Display-font typography for headings + italic accent on hero ----------- */
.sf-frame.sf-cinematic h1,
.sf-frame.sf-cinematic h2,
.sf-frame.sf-cinematic h3,
.sf-frame.sf-cinematic .sf-hero__headline,
.sf-frame.sf-cinematic .sf-services__headline,
.sf-frame.sf-cinematic .sf-faq__headline,
.sf-frame.sf-cinematic .sf-mid-cta__headline {
  font-family: '{{display}}', 'Times New Roman', serif;
  font-weight: 400;
  letter-spacing: -0.02em;
}
.sf-frame.sf-cinematic .sf-hero__headline {
  font-style: italic;
  font-size: clamp(2.5rem, 6.5vw, 5.25rem);
  line-height: 0.98;
  letter-spacing: -0.035em;
  max-width: 18ch;
  color: var(--sf-cinematic-text);
}
.sf-frame.sf-cinematic .sf-hero__subhead,
.sf-frame.sf-cinematic .sf-mid-cta__subhead {
  color: var(--sf-cinematic-text-muted);
  font-family: '{{body}}', system-ui, sans-serif;
  font-style: normal;
  max-width: 56ch;
}

/* Liquid glass primitives ------------------------------------------------- */
.sf-frame.sf-cinematic .sf-glass,
.sf-frame.sf-cinematic .sf-navbar,
.sf-frame.sf-cinematic .sf-trust__list {
  background: rgba(255, 255, 255, 0.025);
  background-blend-mode: luminosity;
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.08),
    0 6px 24px rgba(0, 0, 0, 0.25);
}
.sf-frame.sf-cinematic .sf-glass-strong,
.sf-frame.sf-cinematic .sf-btn--primary,
.sf-frame.sf-cinematic .sf-mid-cta__ctas .sf-btn--primary {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(40px) saturate(160%);
  -webkit-backdrop-filter: blur(40px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.18),
    0 8px 32px rgba(0, 0, 0, 0.4);
  color: var(--sf-cinematic-text);
}

/* Floating glass-pill nav ------------------------------------------------- */
.sf-frame.sf-cinematic .sf-navbar {
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  width: min(1100px, calc(100vw - 2rem));
  border-radius: 9999px;
  padding: 0.5rem 1.25rem;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
.sf-frame.sf-cinematic .sf-navbar__brand {
  font-family: '{{display}}', serif;
  font-style: italic;
  font-size: 1.125rem;
  color: var(--sf-cinematic-text);
}
.sf-frame.sf-cinematic .sf-navbar__links {
  display: flex;
  gap: 1.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.sf-frame.sf-cinematic .sf-navbar__link {
  color: var(--sf-cinematic-text-muted);
  font-size: 0.875rem;
  transition: color 0.2s ease;
}
.sf-frame.sf-cinematic .sf-navbar__link:hover {
  color: var(--sf-cinematic-text);
}

/* Hero ------------------------------------------------------------------- */
.sf-frame.sf-cinematic .sf-hero {
  background: radial-gradient(
      ellipse 80% 60% at 50% 0%,
      color-mix(in srgb, var(--sf-cinematic-accent) 18%, transparent) 0%,
      transparent 70%
    ),
    var(--sf-cinematic-bg);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 8rem 2rem 4rem;
  position: relative;
  overflow: hidden;
}
.sf-frame.sf-cinematic .sf-hero__content {
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
  position: relative;
  z-index: 2;
}
.sf-frame.sf-cinematic .sf-hero__corner,
.sf-frame.sf-cinematic .sf-hero__glow,
.sf-frame.sf-cinematic .sf-hero__reviews {
  display: none; /* We use our own gradient depth instead. */
}
.sf-frame.sf-cinematic .sf-hero__ctas {
  display: flex;
  gap: 1rem;
  margin-top: 2.5rem;
  flex-wrap: wrap;
}
.sf-frame.sf-cinematic .sf-btn {
  border-radius: 9999px;
  padding: 0.875rem 1.75rem;
  font-size: 0.9375rem;
  font-weight: 500;
  font-family: '{{body}}', system-ui, sans-serif;
  letter-spacing: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.sf-frame.sf-cinematic .sf-btn--primary {
  color: var(--sf-cinematic-text);
}
.sf-frame.sf-cinematic .sf-btn--secondary {
  background: transparent;
  border: 1px solid var(--sf-cinematic-border);
  color: var(--sf-cinematic-text-muted);
}
.sf-frame.sf-cinematic .sf-btn:hover {
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.2),
    0 12px 36px rgba(0, 0, 0, 0.5);
}

/* Trust strip — rendered as glass pills ---------------------------------- */
.sf-frame.sf-cinematic .sf-trust {
  margin-top: 4rem;
  padding: 0 2rem;
}
.sf-frame.sf-cinematic .sf-trust__list {
  display: flex;
  gap: 0;
  padding: 0.5rem 0.75rem;
  border-radius: 9999px;
  width: fit-content;
  margin: 0 auto;
  list-style: none;
  flex-wrap: wrap;
  justify-content: center;
}
.sf-frame.sf-cinematic .sf-trust__item {
  padding: 0.5rem 1.25rem;
  position: relative;
  color: var(--sf-cinematic-text-muted);
  font-size: 0.8125rem;
  font-weight: 500;
}
.sf-frame.sf-cinematic .sf-trust__item:not(:last-child)::after {
  content: '';
  position: absolute;
  right: 0;
  top: 25%;
  bottom: 25%;
  width: 1px;
  background: rgba(255, 255, 255, 0.12);
}
.sf-frame.sf-cinematic .sf-trust__label {
  color: inherit;
}

/* Services / features grid — glass cards --------------------------------- */
.sf-frame.sf-cinematic .sf-services {
  background: var(--sf-cinematic-bg);
  padding: 6rem 2rem;
}
.sf-frame.sf-cinematic .sf-services__header {
  max-width: 1100px;
  margin: 0 auto 3rem;
  text-align: center;
}
.sf-frame.sf-cinematic .sf-services__headline {
  font-size: clamp(1.875rem, 4vw, 3rem);
  font-style: italic;
  color: var(--sf-cinematic-text);
}
.sf-frame.sf-cinematic .sf-services__grid {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}
.sf-frame.sf-cinematic .sf-service {
  background: rgba(255, 255, 255, 0.025);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--sf-cinematic-border);
  border-radius: 1.25rem;
  padding: 2rem;
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.06),
    0 4px 16px rgba(0, 0, 0, 0.2);
  transition: transform 0.3s ease, border-color 0.3s ease;
}
.sf-frame.sf-cinematic .sf-service:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.16);
}
.sf-frame.sf-cinematic .sf-service__title {
  font-family: '{{display}}', serif;
  font-size: 1.375rem;
  color: var(--sf-cinematic-text);
  margin: 0.75rem 0 0.5rem;
  letter-spacing: -0.02em;
}
.sf-frame.sf-cinematic .sf-service__description {
  color: var(--sf-cinematic-text-muted);
  font-size: 0.9375rem;
  line-height: 1.5;
}
.sf-frame.sf-cinematic .sf-service__icon {
  color: var(--sf-cinematic-accent);
}

/* About + testimonials --------------------------------------------------- */
.sf-frame.sf-cinematic .sf-about,
.sf-frame.sf-cinematic .sf-reviews {
  background: var(--sf-cinematic-bg);
  padding: 6rem 2rem;
  color: var(--sf-cinematic-text);
}
.sf-frame.sf-cinematic .sf-about__inner,
.sf-frame.sf-cinematic .sf-reviews__inner {
  max-width: 1100px;
  margin: 0 auto;
}
.sf-frame.sf-cinematic .sf-about__body,
.sf-frame.sf-cinematic .sf-reviews__body {
  color: var(--sf-cinematic-text-muted);
}

/* FAQ ------------------------------------------------------------------- */
.sf-frame.sf-cinematic .sf-faq {
  background: var(--sf-cinematic-bg);
  padding: 6rem 2rem;
}
.sf-frame.sf-cinematic .sf-faq__headline {
  text-align: center;
  font-style: italic;
  font-size: clamp(1.875rem, 4vw, 3rem);
  margin-bottom: 2.5rem;
}
.sf-frame.sf-cinematic .sf-faq__list {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.sf-frame.sf-cinematic .sf-faq__item {
  background: rgba(255, 255, 255, 0.025);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--sf-cinematic-border);
  border-radius: 1rem;
  padding: 1.25rem 1.5rem;
}
.sf-frame.sf-cinematic .sf-faq__question {
  color: var(--sf-cinematic-text);
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  list-style: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.sf-frame.sf-cinematic .sf-faq__question::-webkit-details-marker {
  display: none;
}
.sf-frame.sf-cinematic .sf-faq__chevron::before {
  content: '+';
  font-size: 1.25rem;
  color: var(--sf-cinematic-text-muted);
  transition: transform 0.2s ease;
  display: inline-block;
}
.sf-frame.sf-cinematic .sf-faq__item[open] .sf-faq__chevron::before {
  transform: rotate(45deg);
}
.sf-frame.sf-cinematic .sf-faq__answer {
  color: var(--sf-cinematic-text-muted);
  margin-top: 0.75rem;
  line-height: 1.6;
}

/* Mid CTA — cinematic break ---------------------------------------------- */
.sf-frame.sf-cinematic .sf-mid-cta {
  background: radial-gradient(
      ellipse 60% 70% at 50% 50%,
      color-mix(in srgb, var(--sf-cinematic-accent) 22%, transparent) 0%,
      transparent 80%
    ),
    var(--sf-cinematic-bg);
  padding: 8rem 2rem;
  text-align: center;
}
.sf-frame.sf-cinematic .sf-mid-cta__inner {
  max-width: 720px;
  margin: 0 auto;
}
.sf-frame.sf-cinematic .sf-mid-cta__headline {
  font-style: italic;
  font-size: clamp(2rem, 5vw, 3.5rem);
  color: var(--sf-cinematic-text);
  letter-spacing: -0.025em;
  line-height: 1.05;
}
.sf-frame.sf-cinematic .sf-mid-cta__subhead {
  margin-top: 1rem;
  font-size: 1.125rem;
}
.sf-frame.sf-cinematic .sf-mid-cta__ctas {
  margin-top: 2rem;
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

/* Footer ---------------------------------------------------------------- */
.sf-frame.sf-cinematic .sf-footer {
  background: #050507;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding: 3rem 2rem;
  color: var(--sf-cinematic-text-subtle);
}
.sf-frame.sf-cinematic .sf-footer__name {
  color: var(--sf-cinematic-text);
  font-family: '{{display}}', serif;
  font-style: italic;
}
.sf-frame.sf-cinematic .sf-footer__tagline {
  color: var(--sf-cinematic-text-muted);
}
.sf-frame.sf-cinematic .sf-footer__poweredby {
  color: var(--sf-cinematic-text-subtle);
  margin-top: 1.5rem;
  font-size: 0.8125rem;
}
.sf-frame.sf-cinematic .sf-footer__poweredby a {
  color: var(--sf-cinematic-text-muted);
}

/* Animations ------------------------------------------------------------ */
@keyframes sf-cinematic-blur-in {
  from {
    opacity: 0;
    filter: blur(12px);
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0);
  }
}
@keyframes sf-cinematic-fade-rise {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Cinematic redefinition of the existing sf-animate system. The legacy CSS
   uses a translate3d-based fade-up; cinematic mode swaps to blur-in for the
   hero headline and fade-rise for everything else. */
.sf-frame.sf-cinematic .sf-animate {
  opacity: 0;
}
.sf-frame.sf-cinematic .sf-animate--in {
  animation: sf-cinematic-fade-rise 0.7s ease-out forwards;
  opacity: 1;
}
.sf-frame.sf-cinematic .sf-hero__headline.sf-animate--in {
  animation: sf-cinematic-blur-in 0.9s ease-out forwards;
}
.sf-frame.sf-cinematic .sf-animate.sf-delay-1 { animation-delay: 0.1s; }
.sf-frame.sf-cinematic .sf-animate.sf-delay-2 { animation-delay: 0.25s; }
.sf-frame.sf-cinematic .sf-animate.sf-delay-3 { animation-delay: 0.4s; }
.sf-frame.sf-cinematic .sf-animate.sf-delay-4 { animation-delay: 0.55s; }

/* Above-the-fold hero animations fire on initial paint via class addition
   from the existing IntersectionObserver script; for prefers-reduced-motion
   the script applies sf-animate--in immediately. */
@media (prefers-reduced-motion: reduce) {
  .sf-frame.sf-cinematic .sf-animate,
  .sf-frame.sf-cinematic .sf-animate--in {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
    filter: none !important;
  }
}

/* Body padding so fixed-pill nav doesn't overlap content ------------------ */
.sf-frame.sf-cinematic .sf-landing {
  padding-top: 0;
}

/* Stats section — large-number cards inside a glass row ------------------ */
.sf-frame.sf-cinematic .sf-services--stats {
  background: var(--sf-cinematic-bg);
  padding: 5rem 2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.sf-frame.sf-cinematic .sf-stats__grid {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  background: rgba(255, 255, 255, 0.025);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--sf-cinematic-border);
  border-radius: 1.5rem;
  padding: 2.5rem 1.5rem;
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.06),
    0 4px 16px rgba(0, 0, 0, 0.2);
}
.sf-frame.sf-cinematic .sf-stat {
  text-align: center;
  padding: 0.5rem 1rem;
  position: relative;
}
.sf-frame.sf-cinematic .sf-stat:not(:last-child)::after {
  content: '';
  position: absolute;
  right: -0.5rem;
  top: 25%;
  bottom: 25%;
  width: 1px;
  background: rgba(255, 255, 255, 0.08);
}
@media (max-width: 768px) {
  .sf-frame.sf-cinematic .sf-stat::after { display: none; }
}
.sf-frame.sf-cinematic .sf-stat__value {
  font-family: '{{display}}', serif;
  font-style: italic;
  font-size: clamp(2.25rem, 5vw, 3.25rem);
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--sf-cinematic-text);
  margin: 0;
  background: linear-gradient(180deg, var(--sf-cinematic-text) 0%, color-mix(in srgb, var(--sf-cinematic-accent) 40%, var(--sf-cinematic-text)) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.sf-frame.sf-cinematic .sf-stat__label {
  margin: 0.5rem 0 0;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--sf-cinematic-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Hero dashboard mockup (SaaS only) -------------------------------------- */
.sf-frame.sf-cinematic .sf-hero__mockup {
  margin: 4rem auto 0;
  max-width: min(880px, 90%);
  border-radius: 1rem;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.12),
    0 24px 96px rgba(0, 0, 0, 0.5),
    0 4px 16px color-mix(in srgb, var(--sf-cinematic-accent) 25%, transparent);
  transform: perspective(1600px) rotateX(8deg);
  transform-origin: center top;
  pointer-events: none;
  user-select: none;
}
.sf-frame.sf-cinematic .sf-mockup__chrome {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.sf-frame.sf-cinematic .sf-mockup__dot {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
}
.sf-frame.sf-cinematic .sf-mockup__url {
  margin-left: 0.75rem;
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.4);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}
.sf-frame.sf-cinematic .sf-mockup__body {
  display: grid;
  grid-template-columns: 160px 1fr;
  min-height: 280px;
}
.sf-frame.sf-cinematic .sf-mockup__sidebar {
  padding: 1rem 0.875rem;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.2);
}
.sf-frame.sf-cinematic .sf-mockup__brand {
  font-family: '{{display}}', serif;
  font-style: italic;
  font-size: 0.8125rem;
  color: var(--sf-cinematic-text);
  margin: 0 0 0.875rem 0.25rem;
}
.sf-frame.sf-cinematic .sf-mockup__nav {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}
.sf-frame.sf-cinematic .sf-mockup__nav-item {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.45);
  padding: 0.375rem 0.625rem;
  border-radius: 0.375rem;
}
.sf-frame.sf-cinematic .sf-mockup__nav-item.is-active {
  color: var(--sf-cinematic-text);
  background: rgba(255, 255, 255, 0.04);
}
.sf-frame.sf-cinematic .sf-mockup__main {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.sf-frame.sf-cinematic .sf-mockup__greeting {
  font-family: '{{display}}', serif;
  font-style: italic;
  font-size: 0.9375rem;
  color: var(--sf-cinematic-text);
  margin: 0;
}
.sf-frame.sf-cinematic .sf-mockup__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}
.sf-frame.sf-cinematic .sf-mockup__stat {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}
.sf-frame.sf-cinematic .sf-mockup__stat-num {
  font-family: '{{display}}', serif;
  font-style: italic;
  font-size: 0.9375rem;
  color: var(--sf-cinematic-text);
}
.sf-frame.sf-cinematic .sf-mockup__stat-label {
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.sf-frame.sf-cinematic .sf-mockup__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.6875rem;
  color: var(--sf-cinematic-text-muted);
}
.sf-frame.sf-cinematic .sf-mockup__table th {
  text-align: left;
  font-weight: 500;
  padding: 0.375rem 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.6rem;
}
.sf-frame.sf-cinematic .sf-mockup__table td {
  padding: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.sf-frame.sf-cinematic .sf-mockup__pill {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--sf-cinematic-accent) 18%, transparent);
  color: color-mix(in srgb, var(--sf-cinematic-accent) 90%, white);
  font-size: 0.625rem;
  font-weight: 500;
}

/* Lucide icon styling in feature cards ----------------------------------- */
.sf-frame.sf-cinematic .sf-service__icon {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--sf-cinematic-accent) 14%, transparent);
  color: color-mix(in srgb, var(--sf-cinematic-accent) 95%, white);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  border: 1px solid color-mix(in srgb, var(--sf-cinematic-accent) 25%, transparent);
}
.sf-frame.sf-cinematic .sf-service__icon svg {
  width: 1.25rem;
  height: 1.25rem;
}

/* Section rhythm — consistent vertical spacing between blocks ------------ */
.sf-frame.sf-cinematic .sf-services + .sf-services,
.sf-frame.sf-cinematic .sf-services + .sf-about,
.sf-frame.sf-cinematic .sf-services + .sf-faq,
.sf-frame.sf-cinematic .sf-about + .sf-services,
.sf-frame.sf-cinematic .sf-about + .sf-faq,
.sf-frame.sf-cinematic .sf-faq + .sf-mid-cta,
.sf-frame.sf-cinematic .sf-mid-cta + .sf-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

/* Mobile tweaks --------------------------------------------------------- */
@media (max-width: 768px) {
  .sf-frame.sf-cinematic .sf-navbar {
    width: calc(100vw - 1rem);
    padding: 0.5rem 1rem;
    gap: 0.75rem;
  }
  .sf-frame.sf-cinematic .sf-navbar__links {
    display: none;
  }
  .sf-frame.sf-cinematic .sf-hero {
    padding: 7rem 1.5rem 3rem;
    min-height: 88vh;
  }
  .sf-frame.sf-cinematic .sf-services,
  .sf-frame.sf-cinematic .sf-about,
  .sf-frame.sf-cinematic .sf-faq,
  .sf-frame.sf-cinematic .sf-mid-cta {
    padding: 4rem 1.5rem;
  }
  .sf-frame.sf-cinematic .sf-hero__mockup {
    transform: none;
    margin-top: 2.5rem;
  }
  .sf-frame.sf-cinematic .sf-mockup__body {
    grid-template-columns: 1fr;
  }
  .sf-frame.sf-cinematic .sf-mockup__sidebar {
    display: none;
  }
}
`;

/**
 * Build the cinematic CSS block by substituting tokens. Returns the empty
 * string when cinematic mode isn't active — the caller appends conditionally.
 */
export function buildCinematicCss(tokens: DesignTokens): string {
  if (!isCinematicMode(tokens)) return "";
  return CINEMATIC_TEMPLATE
    .replaceAll("{{accent}}", tokens.palette.accent || "#14b8a6")
    .replaceAll("{{display}}", escapeFontName(tokens.typography.display))
    .replaceAll("{{body}}", escapeFontName(tokens.typography.body));
}

/** Cinematic mode is active when both flags are on: dark mode AND
 *  glassmorphism opt-in. Everything else stays in the legacy light-mode
 *  pipeline. */
export function isCinematicMode(tokens: DesignTokens): boolean {
  return tokens.mode === "dark" && tokens.effects.glassmorphism === true;
}

function escapeFontName(name: string): string {
  // Quoting + CSS-injection-safety: only allow letter, digit, space, hyphen.
  return (name || "Inter").replace(/[^A-Za-z0-9 \-]/g, "").trim() || "Inter";
}
