// ============================================================================
// Light/Professional CSS overlay — applied when DesignTokens.mode === "light".
// ============================================================================
//
// May 1, 2026 — second visual mode for the general-service-v1 renderer.
// Targets local services (HVAC, plumber, dental) and professional services
// (lawyer, coach, consultant). Reference patterns from Platinum Plumbing,
// Metro Flow Plumbing, A-Star HVAC, DFW Smiles Dental.
//
// Visual signatures:
//   - Inter for everything (no serif — service businesses need to feel
//     reliable + modern, not editorial)
//   - Dark hero band on a white page — creates contrast, makes white body
//     sections feel cleaner
//   - Dark CTA section mirrors the hero (top + bottom dark bookends)
//   - Service cards: white bg, subtle shadow, rounded, hover-lift
//   - Stats bar: huge accent-colored numbers, uppercase muted labels
//   - Trust badges: pill shape with check icons, accent-light bg
//   - Alternating section bg (#fff / #f8f9fa) for vertical rhythm
//
// Activation: tokens.mode === "light" — does NOT require glassmorphism
// (cinematic only — these are different aesthetic universes). Existing
// local-service workspaces with no token-driven render path stay byte-
// identical because they don't pass through the new pipeline.

import type { DesignTokens } from "@/lib/page-schema/design-tokens";

const LIGHT_TEMPLATE = `
/* ========================================================================
   LIGHT/PROFESSIONAL OVERLAY — May 1, 2026
   Activated when .sf-frame has .sf-light class.
   ======================================================================== */

.sf-frame.sf-light {
  background: #ffffff;
  color: #1a1a2e;
  font-family: '{{body}}', system-ui, -apple-system, sans-serif;
  --sf-light-accent: {{accent}};
  --sf-light-accent-light: color-mix(in srgb, {{accent}} 10%, white);
  --sf-light-accent-dark: color-mix(in srgb, {{accent}} 100%, black 18%);
  --sf-light-bg: #ffffff;
  --sf-light-bg-alt: #f8f9fa;
  --sf-light-text: #1a1a2e;
  --sf-light-text-muted: #6b7280;
  --sf-light-text-subtle: #9ca3af;
  --sf-light-border: #e5e7eb;
  --sf-light-card-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05);
  --sf-light-card-shadow-hover: 0 12px 28px rgba(0,0,0,0.10);
  --sf-light-hero-bg: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

/* Inter for all headings (no serif in light mode) ----------------------- */
.sf-frame.sf-light h1,
.sf-frame.sf-light h2,
.sf-frame.sf-light h3,
.sf-frame.sf-light .sf-hero__headline,
.sf-frame.sf-light .sf-services__headline,
.sf-frame.sf-light .sf-faq__headline,
.sf-frame.sf-light .sf-mid-cta__headline {
  font-family: '{{body}}', system-ui, -apple-system, sans-serif;
  font-weight: 800;
  letter-spacing: -0.02em;
  font-style: normal;
}

/* Floating light nav (white pill with subtle shadow) -------------------- */
.sf-frame.sf-light .sf-navbar {
  position: sticky;
  top: 0;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--sf-light-border);
  padding: 1rem 2rem;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  z-index: 50;
  width: 100%;
  box-sizing: border-box;
  border-radius: 0;
}
.sf-frame.sf-light .sf-navbar__brand {
  font-weight: 800;
  font-size: 1.125rem;
  color: var(--sf-light-text);
  letter-spacing: -0.02em;
}
.sf-frame.sf-light .sf-navbar__links {
  display: flex;
  gap: 1.5rem;
  margin: 0 0 0 auto;
  padding: 0;
  list-style: none;
}
.sf-frame.sf-light .sf-navbar__link {
  color: var(--sf-light-text-muted);
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
  transition: color 0.2s ease;
}
.sf-frame.sf-light .sf-navbar__link:hover {
  color: var(--sf-light-text);
}
.sf-frame.sf-light .sf-navbar__cta {
  background: var(--sf-light-accent);
  color: white;
  border-radius: 9999px;
  padding: 0.625rem 1.25rem;
  font-weight: 600;
  font-size: 0.9375rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  transition: background 0.2s ease, transform 0.2s ease;
}
.sf-frame.sf-light .sf-navbar__cta:hover {
  background: var(--sf-light-accent-dark);
  transform: translateY(-1px);
}

/* Dark hero band on light page ------------------------------------------ */
.sf-frame.sf-light .sf-hero {
  background: var(--sf-light-hero-bg);
  color: white;
  padding: 6rem 2rem 5rem;
  min-height: auto;
  position: relative;
  overflow: hidden;
}
.sf-frame.sf-light .sf-hero__corner,
.sf-frame.sf-light .sf-hero__glow,
.sf-frame.sf-light .sf-hero__reviews {
  display: none;
}
.sf-frame.sf-light .sf-hero__content {
  max-width: 1100px;
  margin: 0 auto;
  text-align: left;
}
.sf-frame.sf-light .sf-hero__headline {
  color: white;
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.025em;
  max-width: 720px;
}
.sf-frame.sf-light .sf-hero__subhead {
  color: rgba(255, 255, 255, 0.78);
  font-size: clamp(1rem, 1.6vw, 1.1875rem);
  margin-top: 1rem;
  max-width: 560px;
  line-height: 1.6;
  font-style: normal;
}
.sf-frame.sf-light .sf-hero__ctas {
  display: flex;
  gap: 0.75rem;
  margin-top: 2rem;
  flex-wrap: wrap;
}
.sf-frame.sf-light .sf-btn {
  border-radius: 0.5rem;
  padding: 0.875rem 1.75rem;
  font-size: 0.9375rem;
  font-weight: 600;
  font-family: '{{body}}', system-ui, sans-serif;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.sf-frame.sf-light .sf-btn--primary {
  background: var(--sf-light-accent);
  color: white;
}
.sf-frame.sf-light .sf-btn--primary:hover {
  background: var(--sf-light-accent-dark);
  transform: translateY(-1px);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--sf-light-accent) 30%, transparent);
}
.sf-frame.sf-light .sf-btn--secondary {
  background: transparent;
  color: white;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
}
.sf-frame.sf-light .sf-btn--secondary:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.5);
}

/* Trust strip on light bg ----------------------------------------------- */
.sf-frame.sf-light .sf-trust {
  background: var(--sf-light-bg) !important;
  border-top: none !important;
  border-bottom: 1px solid var(--sf-light-border) !important;
  padding: 1.5rem 2rem;
}
.sf-frame.sf-light .sf-trust__list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  max-width: 1100px;
  margin: 0 auto;
  list-style: none;
  padding: 0;
}
.sf-frame.sf-light .sf-trust__item {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  background: var(--sf-light-accent-light);
  border: 1px solid color-mix(in srgb, var(--sf-light-accent) 18%, transparent);
  color: var(--sf-light-accent-dark);
  border-radius: 9999px;
  padding: 0.375rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 500;
}
.sf-frame.sf-light .sf-trust__label { color: inherit; }

/* Stats bar — huge accent numbers --------------------------------------- */
.sf-frame.sf-light .sf-services--stats {
  background: var(--sf-light-bg);
  padding: 3rem 2rem;
  border-bottom: 1px solid var(--sf-light-border);
}
.sf-frame.sf-light .sf-stats__grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 3rem;
  max-width: 1100px;
  margin: 0 auto;
}
.sf-frame.sf-light .sf-stat {
  text-align: center;
  padding: 0.5rem 0.75rem;
}
.sf-frame.sf-light .sf-stat__value {
  font-size: clamp(1.75rem, 3vw, 2.5rem);
  font-weight: 800;
  color: var(--sf-light-accent);
  line-height: 1;
  letter-spacing: -0.02em;
  margin: 0;
  background: none;
  -webkit-background-clip: initial;
  -webkit-text-fill-color: initial;
}
.sf-frame.sf-light .sf-stat__label {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--sf-light-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Services grid — white cards with hover lift --------------------------- */
.sf-frame.sf-light .sf-services {
  background: var(--sf-light-bg-alt);
  padding: 5rem 2rem;
  border-top: 1px solid var(--sf-light-border);
}
.sf-frame.sf-light .sf-services--stats {
  background: var(--sf-light-bg);
}
.sf-frame.sf-light .sf-services__header {
  max-width: 1100px;
  margin: 0 auto 3rem;
  text-align: center;
}
.sf-frame.sf-light .sf-services__headline {
  font-size: clamp(1.75rem, 3.5vw, 2.5rem);
  color: var(--sf-light-text);
  font-weight: 800;
}
.sf-frame.sf-light .sf-services__grid {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
}
.sf-frame.sf-light .sf-service {
  background: white;
  border: 1px solid var(--sf-light-border);
  border-radius: 0.875rem;
  padding: 1.75rem 1.5rem;
  text-align: center;
  box-shadow: var(--sf-light-card-shadow);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.sf-frame.sf-light .sf-service:hover {
  transform: translateY(-4px);
  box-shadow: var(--sf-light-card-shadow-hover);
}
.sf-frame.sf-light .sf-service__icon {
  width: 3rem;
  height: 3rem;
  border-radius: 0.625rem;
  background: var(--sf-light-accent-light);
  color: var(--sf-light-accent-dark);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1rem;
}
.sf-frame.sf-light .sf-service__icon svg {
  width: 1.375rem;
  height: 1.375rem;
}
.sf-frame.sf-light .sf-service__title {
  font-size: 1.0625rem;
  font-weight: 700;
  color: var(--sf-light-text);
  margin: 0 0 0.5rem;
}
.sf-frame.sf-light .sf-service__description {
  font-size: 0.9375rem;
  color: var(--sf-light-text-muted);
  line-height: 1.55;
  margin: 0;
}

/* About + testimonials -------------------------------------------------- */
.sf-frame.sf-light .sf-about,
.sf-frame.sf-light .sf-reviews {
  background: var(--sf-light-bg);
  padding: 5rem 2rem;
  color: var(--sf-light-text);
}
.sf-frame.sf-light .sf-about__inner,
.sf-frame.sf-light .sf-reviews__inner {
  max-width: 1100px;
  margin: 0 auto;
}
.sf-frame.sf-light .sf-about__body,
.sf-frame.sf-light .sf-reviews__body {
  color: var(--sf-light-text-muted);
}

/* FAQ ------------------------------------------------------------------ */
.sf-frame.sf-light .sf-faq {
  background: var(--sf-light-bg-alt);
  padding: 5rem 2rem;
  border-top: 1px solid var(--sf-light-border);
}
.sf-frame.sf-light .sf-faq__headline {
  text-align: center;
  font-size: clamp(1.75rem, 3.5vw, 2.5rem);
  color: var(--sf-light-text);
  margin-bottom: 2rem;
}
.sf-frame.sf-light .sf-faq__list {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.sf-frame.sf-light .sf-faq__item {
  background: white;
  border: 1px solid var(--sf-light-border);
  border-radius: 0.625rem;
  padding: 1rem 1.25rem;
  box-shadow: var(--sf-light-card-shadow);
}
.sf-frame.sf-light .sf-faq__question {
  color: var(--sf-light-text);
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sf-frame.sf-light .sf-faq__question::-webkit-details-marker {
  display: none;
}
.sf-frame.sf-light .sf-faq__chevron::before {
  content: '+';
  font-size: 1.25rem;
  color: var(--sf-light-text-muted);
  transition: transform 0.2s ease;
  display: inline-block;
}
.sf-frame.sf-light .sf-faq__item[open] .sf-faq__chevron::before {
  transform: rotate(45deg);
}
.sf-frame.sf-light .sf-faq__answer {
  color: var(--sf-light-text-muted);
  margin-top: 0.75rem;
  line-height: 1.6;
  font-size: 0.9375rem;
}

/* Mid CTA — dark band mirrors the hero ---------------------------------- */
.sf-frame.sf-light .sf-mid-cta {
  background: var(--sf-light-hero-bg);
  color: white;
  padding: 5rem 2rem;
  text-align: center;
}
.sf-frame.sf-light .sf-mid-cta__inner {
  max-width: 720px;
  margin: 0 auto;
}
.sf-frame.sf-light .sf-mid-cta__headline {
  color: white;
  font-size: clamp(1.75rem, 4vw, 2.75rem);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.sf-frame.sf-light .sf-mid-cta__subhead {
  color: rgba(255, 255, 255, 0.7);
  font-size: 1.0625rem;
  margin-top: 0.75rem;
}
.sf-frame.sf-light .sf-mid-cta__ctas {
  margin-top: 2rem;
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  flex-wrap: wrap;
}
.sf-frame.sf-light .sf-mid-cta .sf-btn--primary {
  background: var(--sf-light-accent);
  color: white;
}

/* Partners ribbon — minimal dark text on white -------------------------- */
.sf-frame.sf-light .sf-partners {
  background: var(--sf-light-bg);
  padding: 3rem 2rem;
  text-align: center;
}
.sf-frame.sf-light .sf-partners__eyebrow {
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sf-light-text-subtle);
  margin: 0 0 1.25rem;
}
.sf-frame.sf-light .sf-partners__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  max-width: 1100px;
  margin: 0 auto;
}
.sf-frame.sf-light .sf-partner {
  font-weight: 700;
  font-size: 1rem;
  color: var(--sf-light-text-muted);
  letter-spacing: -0.01em;
  text-decoration: none;
}
.sf-frame.sf-light .sf-partner__sep {
  color: var(--sf-light-text-subtle);
}

/* Footer --------------------------------------------------------------- */
.sf-frame.sf-light .sf-footer {
  background: var(--sf-light-bg);
  border-top: 1px solid var(--sf-light-border);
  padding: 2.5rem 2rem;
  color: var(--sf-light-text-muted);
}
.sf-frame.sf-light .sf-footer__name {
  color: var(--sf-light-text);
  font-weight: 700;
}
.sf-frame.sf-light .sf-footer__tagline {
  color: var(--sf-light-text-muted);
}
.sf-frame.sf-light .sf-footer__phone {
  color: var(--sf-light-accent) !important;
  font-weight: 700;
  text-decoration: none;
}
.sf-frame.sf-light .sf-footer__poweredby {
  color: var(--sf-light-text-subtle);
  margin-top: 1rem;
  font-size: 0.8125rem;
}
.sf-frame.sf-light .sf-footer__poweredby a {
  color: var(--sf-light-text-muted);
}

/* Animations — subtle fade-up only (no blur-in) ------------------------- */
@keyframes sf-light-fade-up {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
.sf-frame.sf-light .sf-animate { opacity: 0; }
.sf-frame.sf-light .sf-animate--in {
  animation: sf-light-fade-up 0.6s ease-out forwards;
  opacity: 1;
}
.sf-frame.sf-light .sf-animate.sf-delay-1 { animation-delay: 0.05s; }
.sf-frame.sf-light .sf-animate.sf-delay-2 { animation-delay: 0.15s; }
.sf-frame.sf-light .sf-animate.sf-delay-3 { animation-delay: 0.25s; }
.sf-frame.sf-light .sf-animate.sf-delay-4 { animation-delay: 0.35s; }

@media (prefers-reduced-motion: reduce) {
  .sf-frame.sf-light .sf-animate,
  .sf-frame.sf-light .sf-animate--in {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}

/* Mobile tweaks -------------------------------------------------------- */
@media (max-width: 768px) {
  .sf-frame.sf-light .sf-navbar { padding: 0.75rem 1rem; gap: 0.75rem; }
  .sf-frame.sf-light .sf-navbar__links { display: none; }
  .sf-frame.sf-light .sf-hero { padding: 4rem 1.25rem 3rem; }
  .sf-frame.sf-light .sf-services,
  .sf-frame.sf-light .sf-about,
  .sf-frame.sf-light .sf-faq,
  .sf-frame.sf-light .sf-mid-cta,
  .sf-frame.sf-light .sf-partners {
    padding: 3rem 1.25rem;
  }
  .sf-frame.sf-light .sf-stats__grid { gap: 1.5rem; }
}
`;

/** Build the light overlay CSS by substituting tokens. Returns empty
 *  string when light mode isn't active. */
export function buildLightCss(tokens: DesignTokens): string {
  if (!isLightMode(tokens)) return "";
  return LIGHT_TEMPLATE
    .replaceAll("{{accent}}", tokens.palette.accent || "#0d9488")
    .replaceAll("{{body}}", escapeFontName(tokens.typography.body));
}

/** Light overlay activates whenever tokens.mode === "light". This is the
 *  default for local_service / professional_service / ecommerce. */
export function isLightMode(tokens: DesignTokens): boolean {
  return tokens.mode === "light";
}

/** Build a Google Fonts link for light mode. Always loads Inter (the
 *  light overlay hardcodes Inter for headings + body — no editorial
 *  serif). */
export function buildLightFontLink(tokens: DesignTokens): string {
  if (!isLightMode(tokens)) return "";
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">`;
}

function escapeFontName(name: string): string {
  return (name || "Inter").replace(/[^A-Za-z0-9 \-]/g, "").trim() || "Inter";
}
