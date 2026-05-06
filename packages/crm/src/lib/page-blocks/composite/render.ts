// ============================================================================
// v1.12.0 — composite-block renderer (HTML + shared CSS)
// ============================================================================
//
// Walks a CompositeNode tree, emits semantic HTML using stable class
// names. CSS lives as ONE shared chunk (COMPOSITE_CSS) emitted once
// per page — no per-section CSS bloat. Theme integration via existing
// CSS custom properties (--sf-bg, --sf-text, --sf-border, --sf-primary,
// --sf-accent), so composite blocks respect the workspace's theme
// (light/dark/cinematic) for free.
//
// Security: all operator/LLM-supplied text passes through escapeHtml.
// No node kind emits raw HTML. URLs in image/href are length-capped
// at the schema layer; we additionally force `target="_blank"` and
// `rel="noopener noreferrer"` on external nav buttons.
//
// Embed resolution: workspace-data refs ('phone', 'services', 'faq',
// 'testimonials', 'hours') resolve from CompositeRenderContext. If
// the data is empty, we render a structured placeholder rather than
// crashing — the operator self-corrects on next regenerate.

import type { CompositeNode } from "./schema";

// ─── render context (workspace-data for embed resolution) ──────────────────

export interface CompositeRenderContext {
  /** E.164 form, used as the tel: link target. */
  workspace_phone: string;
  /** Display form, e.g. "(604) 555-0142". */
  workspace_phone_display: string;
  services: Array<{ name: string; description?: string }>;
  faq: Array<{ question: string; answer: string }>;
  testimonials: Array<{ quote: string; authorName?: string }>;
  /** Pre-formatted hours summary, e.g. "Mon–Sat 7:00–19:00". */
  hours_summary: string;
  /** Where button.action.kind=book points. */
  book_url: string;
  /** Where button.action.kind=intake points. */
  intake_url: string;
}

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Render a composite tree to an HTML string. Caller is responsible for
 * inserting COMPOSITE_CSS into the page once (e.g. when assembling the
 * full landing CSS bundle).
 */
export function renderCompositeTree(
  tree: CompositeNode,
  ctx: CompositeRenderContext,
): string {
  return renderNode(tree, ctx);
}

// ─── walker ─────────────────────────────────────────────────────────────────

function renderNode(node: CompositeNode, ctx: CompositeRenderContext): string {
  switch (node.kind) {
    case "section":
      return renderSection(node, ctx);
    case "row":
      return renderRow(node, ctx);
    case "col":
      return renderCol(node, ctx);
    case "card":
      return renderCard(node, ctx);
    case "heading":
      return renderHeading(node);
    case "text":
      return renderText(node);
    case "image":
      return renderImage(node);
    case "list":
      return renderList(node);
    case "button":
      return renderButton(node, ctx);
    case "stat":
      return renderStat(node);
    case "embed":
      return renderEmbed(node, ctx);
    case "divider":
      return `<hr class="sf-cmp-divider" aria-hidden="true">`;
    case "spacer": {
      const size = node.size ?? "md";
      return `<div class="sf-cmp-spacer sf-cmp-spacer-${size}" aria-hidden="true"></div>`;
    }
    default:
      // Permissive on read: unknown kinds (e.g. from a future schema
      // version persisted today) render as a visible "regenerate me"
      // placeholder rather than crashing the page.
      return `<div class="sf-cmp-unknown">[unknown primitive — please regenerate]</div>`;
  }
}

function renderSection(
  node: Extract<CompositeNode, { kind: "section" }>,
  ctx: CompositeRenderContext,
): string {
  const parts: string[] = [];
  const headerParts: string[] = [];
  if (node.eyebrow) {
    headerParts.push(`<div class="sf-cmp-eyebrow">${escapeHtml(node.eyebrow)}</div>`);
  }
  if (node.headline) {
    headerParts.push(`<h2 class="sf-cmp-headline">${escapeHtml(node.headline)}</h2>`);
  }
  if (node.subhead) {
    headerParts.push(`<p class="sf-cmp-subhead">${escapeHtml(node.subhead)}</p>`);
  }
  if (headerParts.length) {
    parts.push(`<header class="sf-cmp-section-header">${headerParts.join("")}</header>`);
  }
  for (const child of node.children) parts.push(renderNode(child, ctx));
  return `<section class="sf-cmp-section">${parts.join("")}</section>`;
}

function renderRow(
  node: Extract<CompositeNode, { kind: "row" }>,
  ctx: CompositeRenderContext,
): string {
  const cols = node.cols ?? 2;
  const inner = node.children.map((c) => renderNode(c, ctx)).join("");
  return `<div class="sf-cmp-row sf-cmp-row-${cols}">${inner}</div>`;
}

function renderCol(
  node: Extract<CompositeNode, { kind: "col" }>,
  ctx: CompositeRenderContext,
): string {
  const inner = node.children.map((c) => renderNode(c, ctx)).join("");
  return `<div class="sf-cmp-col">${inner}</div>`;
}

function renderCard(
  node: Extract<CompositeNode, { kind: "card" }>,
  ctx: CompositeRenderContext,
): string {
  const variant = node.variant ?? "default";
  const inner = node.children.map((c) => renderNode(c, ctx)).join("");
  return `<div class="sf-cmp-card sf-cmp-card-${variant}">${inner}</div>`;
}

function renderHeading(
  node: Extract<CompositeNode, { kind: "heading" }>,
): string {
  return `<h${node.level} class="sf-cmp-heading sf-cmp-h${node.level}">${escapeHtml(node.text)}</h${node.level}>`;
}

function renderText(node: Extract<CompositeNode, { kind: "text" }>): string {
  const cls = node.emphasis === "muted"
    ? "sf-cmp-text sf-cmp-text-muted"
    : node.emphasis === "bold"
      ? "sf-cmp-text sf-cmp-text-bold"
      : "sf-cmp-text";
  return `<p class="${cls}">${escapeHtml(node.text)}</p>`;
}

function renderImage(node: Extract<CompositeNode, { kind: "image" }>): string {
  // Note: schema caps url length but doesn't validate scheme. We
  // sanitize by escaping; the browser will refuse javascript: in href
  // by spec, and in src it's just broken (not exploitable).
  const url = escapeAttr(node.url);
  const alt = escapeAttr(node.alt ?? "");
  return `<img class="sf-cmp-image" src="${url}" alt="${alt}" loading="lazy">`;
}

function renderList(node: Extract<CompositeNode, { kind: "list" }>): string {
  const style = node.style ?? "bullet";
  const tag = style === "number" ? "ol" : "ul";
  const items = node.items
    .map((it) => `<li class="sf-cmp-list-item">${escapeHtml(it)}</li>`)
    .join("");
  return `<${tag} class="sf-cmp-list sf-cmp-list-${style}">${items}</${tag}>`;
}

function renderButton(
  node: Extract<CompositeNode, { kind: "button" }>,
  ctx: CompositeRenderContext,
): string {
  const label = escapeHtml(node.label);
  let href = "#";
  let extraAttrs = "";

  switch (node.action.kind) {
    case "navigate":
      href = escapeAttr(node.action.href);
      // External http(s) links open in new tab with safe rel.
      if (/^https?:\/\//i.test(node.action.href)) {
        extraAttrs = ` target="_blank" rel="noopener noreferrer"`;
      }
      break;
    case "book":
      href = escapeAttr(ctx.book_url);
      break;
    case "intake":
      href = escapeAttr(ctx.intake_url);
      break;
    case "phone":
      href = ctx.workspace_phone
        ? `tel:${escapeAttr(ctx.workspace_phone)}`
        : "#";
      break;
  }

  return `<a class="sf-cmp-button" href="${href}"${extraAttrs}>${label}</a>`;
}

function renderStat(node: Extract<CompositeNode, { kind: "stat" }>): string {
  return (
    `<div class="sf-cmp-stat">` +
    `<div class="sf-cmp-stat-value">${escapeHtml(node.value)}</div>` +
    `<div class="sf-cmp-stat-label">${escapeHtml(node.label)}</div>` +
    `</div>`
  );
}

function renderEmbed(
  node: Extract<CompositeNode, { kind: "embed" }>,
  ctx: CompositeRenderContext,
): string {
  switch (node.ref) {
    case "phone": {
      const display = ctx.workspace_phone_display || ctx.workspace_phone;
      if (!display) return `<span class="sf-cmp-embed-empty">phone — not set</span>`;
      const tel = ctx.workspace_phone
        ? `tel:${escapeAttr(ctx.workspace_phone)}`
        : "";
      return tel
        ? `<a class="sf-cmp-embed sf-cmp-embed-phone" href="${tel}">${escapeHtml(display)}</a>`
        : `<span class="sf-cmp-embed sf-cmp-embed-phone">${escapeHtml(display)}</span>`;
    }
    case "services": {
      if (!ctx.services.length)
        return `<div class="sf-cmp-embed-empty">No services configured</div>`;
      const items = ctx.services
        .map(
          (s) =>
            `<li class="sf-cmp-list-item"><strong>${escapeHtml(s.name)}</strong>${s.description ? ` — ${escapeHtml(s.description)}` : ""}</li>`,
        )
        .join("");
      return `<ul class="sf-cmp-list sf-cmp-list-bullet sf-cmp-embed-services">${items}</ul>`;
    }
    case "faq": {
      if (!ctx.faq.length)
        return `<div class="sf-cmp-embed-empty">No FAQ configured</div>`;
      const items = ctx.faq
        .map(
          (f) =>
            `<details class="sf-cmp-embed-faq-item"><summary>${escapeHtml(f.question)}</summary><div class="sf-cmp-embed-faq-answer">${escapeHtml(f.answer)}</div></details>`,
        )
        .join("");
      return `<div class="sf-cmp-embed sf-cmp-embed-faq">${items}</div>`;
    }
    case "testimonials": {
      if (!ctx.testimonials.length)
        return `<div class="sf-cmp-embed-empty">No testimonials yet</div>`;
      const items = ctx.testimonials
        .map(
          (t) =>
            `<blockquote class="sf-cmp-embed-testimonial"><p>${escapeHtml(t.quote)}</p>${t.authorName ? `<cite>— ${escapeHtml(t.authorName)}</cite>` : ""}</blockquote>`,
        )
        .join("");
      return `<div class="sf-cmp-embed sf-cmp-embed-testimonials">${items}</div>`;
    }
    case "hours": {
      if (!ctx.hours_summary) return `<span class="sf-cmp-embed-empty">Hours not set</span>`;
      return `<span class="sf-cmp-embed sf-cmp-embed-hours">${escapeHtml(ctx.hours_summary)}</span>`;
    }
    default:
      return `<span class="sf-cmp-embed-empty">[unknown embed]</span>`;
  }
}

// ─── escape helpers ─────────────────────────────────────────────────────────
//
// Conservative HTML escaping for body text + attribute values. We don't
// have a templating engine — operator/LLM-supplied text goes through
// this on every emit to prevent XSS via headline/text/list-item/etc.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  // Same escapes as escapeHtml — entity-encoding is sufficient for
  // attribute values in double-quoted contexts. (We always emit attrs
  // double-quoted.)
  return escapeHtml(s);
}

// ─── shared CSS chunk (emitted once per page) ──────────────────────────────

export const COMPOSITE_CSS = `/* v1.12 composite blocks — shared stylesheet */
.sf-cmp-section {
  padding: clamp(48px, 8vw, 120px) clamp(20px, 4vw, 80px);
  color: var(--sf-text);
  background: var(--sf-bg);
}
.sf-cmp-section-header {
  max-width: 720px;
  margin: 0 auto clamp(24px, 4vw, 48px);
  text-align: center;
}
.sf-cmp-eyebrow {
  display: inline-block;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 12px;
  font-weight: 600;
  color: var(--sf-primary);
  margin-bottom: 12px;
}
.sf-cmp-headline {
  font-size: clamp(28px, 4vw, 48px);
  line-height: 1.15;
  font-weight: 700;
  margin: 0 0 16px;
  color: var(--sf-text);
}
.sf-cmp-subhead {
  font-size: clamp(16px, 1.5vw, 19px);
  line-height: 1.5;
  margin: 0;
  color: var(--sf-text);
  opacity: 0.8;
}
.sf-cmp-row {
  display: grid;
  gap: clamp(16px, 2vw, 32px);
  max-width: 1200px;
  margin: 0 auto;
}
.sf-cmp-row-2 { grid-template-columns: repeat(2, 1fr); }
.sf-cmp-row-3 { grid-template-columns: repeat(3, 1fr); }
.sf-cmp-row-4 { grid-template-columns: repeat(4, 1fr); }
@media (max-width: 768px) {
  .sf-cmp-row-2, .sf-cmp-row-3, .sf-cmp-row-4 {
    grid-template-columns: 1fr;
  }
}
.sf-cmp-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sf-cmp-card {
  padding: clamp(20px, 2vw, 32px);
  border-radius: 12px;
  border: 1px solid var(--sf-border);
  background: var(--sf-bg);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sf-cmp-card-muted {
  background: color-mix(in oklab, var(--sf-bg) 92%, var(--sf-text) 8%);
  opacity: 0.85;
}
.sf-cmp-card-primary {
  border-color: var(--sf-primary);
  background: color-mix(in oklab, var(--sf-bg) 95%, var(--sf-primary) 5%);
}
.sf-cmp-heading { margin: 0; color: var(--sf-text); }
.sf-cmp-h1 { font-size: clamp(24px, 3vw, 36px); font-weight: 700; }
.sf-cmp-h2 { font-size: clamp(20px, 2.5vw, 28px); font-weight: 700; }
.sf-cmp-h3 { font-size: clamp(18px, 2vw, 22px); font-weight: 600; }
.sf-cmp-text { margin: 0; line-height: 1.6; color: var(--sf-text); }
.sf-cmp-text-muted { opacity: 0.7; }
.sf-cmp-text-bold { font-weight: 600; }
.sf-cmp-image {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  display: block;
}
.sf-cmp-list {
  margin: 0;
  padding-left: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sf-cmp-list-bullet { padding-left: 1.25em; list-style: disc; }
.sf-cmp-list-number { padding-left: 1.5em; list-style: decimal; }
.sf-cmp-list-check .sf-cmp-list-item { padding-left: 28px; position: relative; }
.sf-cmp-list-check .sf-cmp-list-item::before {
  content: "✓";
  position: absolute; left: 0;
  color: var(--sf-primary);
  font-weight: 700;
}
.sf-cmp-list-x .sf-cmp-list-item { padding-left: 28px; position: relative; opacity: 0.75; }
.sf-cmp-list-x .sf-cmp-list-item::before {
  content: "✗";
  position: absolute; left: 0;
  color: color-mix(in oklab, var(--sf-text) 60%, transparent);
}
.sf-cmp-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 24px;
  border-radius: 999px;
  background: var(--sf-primary);
  color: var(--sf-bg);
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s ease;
  align-self: flex-start;
}
.sf-cmp-button:hover {
  background: var(--sf-accent);
}
.sf-cmp-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
}
.sf-cmp-stat-value {
  font-size: clamp(36px, 5vw, 56px);
  font-weight: 700;
  color: var(--sf-primary);
  line-height: 1;
}
.sf-cmp-stat-label {
  font-size: 14px;
  color: var(--sf-text);
  opacity: 0.8;
}
.sf-cmp-divider {
  border: 0;
  border-top: 1px solid var(--sf-border);
  margin: 32px 0;
}
.sf-cmp-spacer-sm { height: 16px; }
.sf-cmp-spacer-md { height: 32px; }
.sf-cmp-spacer-lg { height: 64px; }
.sf-cmp-embed-empty {
  padding: 12px 16px;
  border: 1px dashed var(--sf-border);
  border-radius: 8px;
  color: var(--sf-text);
  opacity: 0.6;
  font-size: 14px;
}
.sf-cmp-embed-faq-item {
  border-bottom: 1px solid var(--sf-border);
  padding: 12px 0;
}
.sf-cmp-embed-faq-item summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--sf-text);
}
.sf-cmp-embed-faq-answer {
  margin-top: 8px;
  color: var(--sf-text);
  opacity: 0.85;
}
.sf-cmp-embed-testimonial {
  border-left: 3px solid var(--sf-primary);
  padding-left: 16px;
  margin: 0 0 16px;
}
.sf-cmp-embed-testimonial cite {
  display: block;
  margin-top: 8px;
  font-style: normal;
  opacity: 0.7;
  font-size: 14px;
}
.sf-cmp-unknown {
  padding: 16px;
  border: 2px dashed orange;
  color: orange;
  font-family: ui-monospace, monospace;
  font-size: 13px;
  border-radius: 8px;
}

/* v1.14 — cinematic-mode overrides. The base CSS uses var(--sf-text)
 * which can resolve dark in workspaces whose theme tokens were tuned
 * for light backgrounds; on the cinematic dark backdrop those would
 * render dark-on-dark and become unreadable. Mirrors the override
 * pattern in cinematic-overlay.ts for typed sections. */
.sf-frame.sf-cinematic .sf-cmp-section {
  color: rgba(255, 255, 255, 0.92);
  background: transparent;
}
.sf-frame.sf-cinematic .sf-cmp-headline,
.sf-frame.sf-cinematic .sf-cmp-heading {
  color: rgba(255, 255, 255, 0.96);
}
.sf-frame.sf-cinematic .sf-cmp-subhead {
  color: rgba(255, 255, 255, 0.72);
}
.sf-frame.sf-cinematic .sf-cmp-text {
  color: rgba(255, 255, 255, 0.82);
}
.sf-frame.sf-cinematic .sf-cmp-text-muted {
  color: rgba(255, 255, 255, 0.55);
}
.sf-frame.sf-cinematic .sf-cmp-card {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(8px);
}
.sf-frame.sf-cinematic .sf-cmp-card-muted {
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.08);
}
.sf-frame.sf-cinematic .sf-cmp-card-primary {
  background: color-mix(in oklab, transparent 90%, var(--sf-primary) 10%);
  border-color: var(--sf-primary);
}
.sf-frame.sf-cinematic .sf-cmp-divider {
  border-top-color: rgba(255, 255, 255, 0.12);
}
.sf-frame.sf-cinematic .sf-cmp-list-x .sf-cmp-list-item::before {
  color: rgba(255, 255, 255, 0.45);
}
.sf-frame.sf-cinematic .sf-cmp-stat-label {
  color: rgba(255, 255, 255, 0.7);
}
.sf-frame.sf-cinematic .sf-cmp-embed-empty {
  border-color: rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.55);
}
.sf-frame.sf-cinematic .sf-cmp-embed-faq-item {
  border-bottom-color: rgba(255, 255, 255, 0.12);
}
.sf-frame.sf-cinematic .sf-cmp-embed-faq-item summary {
  color: rgba(255, 255, 255, 0.92);
}
.sf-frame.sf-cinematic .sf-cmp-embed-faq-answer {
  color: rgba(255, 255, 255, 0.78);
}

/* Light-mode overrides parallel cinematic for symmetry. Light pages
 * use buildLightCss; the base var(--sf-text) usually works there but
 * we pin explicit values for predictability. */
.sf-frame.sf-light .sf-cmp-section {
  color: #1a1a2e;
}
.sf-frame.sf-light .sf-cmp-headline,
.sf-frame.sf-light .sf-cmp-heading {
  color: #0a0a1f;
}
.sf-frame.sf-light .sf-cmp-subhead,
.sf-frame.sf-light .sf-cmp-text {
  color: rgba(26, 26, 46, 0.82);
}
.sf-frame.sf-light .sf-cmp-text-muted {
  color: rgba(26, 26, 46, 0.55);
}
.sf-frame.sf-light .sf-cmp-card {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.sf-frame.sf-light .sf-cmp-card-muted {
  background: #f7f7fa;
  border-color: rgba(0, 0, 0, 0.06);
}
.sf-frame.sf-light .sf-cmp-stat-label {
  color: rgba(26, 26, 46, 0.7);
}
`;
