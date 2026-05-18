// 2026-05-18 — branded customer-facing email template.
//
// Pre-2026-05-18 this was a dark-mode card with no logo, no business
// name, no address, no phone, no branding at all. Booking confirmations
// landed in customer inboxes looking like generic test emails which (a)
// made operators feel embarrassed to use the system and (b) made
// customers more likely to mark as spam.
//
// New shape: light mode (industry convention for customer-facing email —
// Cal.com, Calendly, Squarespace, every booking SaaS), optional logo
// header, brand-color accent line, body prose with auto-linkified URLs,
// optional CTA button, business footer (name + phone + address). The
// "Powered by SeldonFrame" badge only shows when the workspace plan
// requires it (free tier).

export type EmailBrandingInput = {
  /** Business / workspace name shown in the header + footer. */
  brandName?: string | null;
  /** Logo URL — when set renders centered above the heading. */
  logoUrl?: string | null;
  /** Primary brand color used as the accent line + CTA button bg. */
  primaryColor?: string | null;
  /** Phone shown in the footer for "questions? call us". */
  businessPhone?: string | null;
  /** Business address shown in the footer (city + state minimum). */
  businessAddress?: string | null;
  /** When false (paid plan), omit the "Powered by SeldonFrame" badge. */
  showPoweredBy?: boolean;
};

export function renderPlainEmailTemplate({
  heading,
  body,
  ctaLabel,
  ctaHref,
  branding,
}: {
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
  branding?: EmailBrandingInput;
}) {
  const brand = branding ?? {};
  const brandName = (brand.brandName ?? "").trim();
  const logoUrl = (brand.logoUrl ?? "").trim();
  const primary = (brand.primaryColor ?? "").trim() || "#0f172a";
  const phone = (brand.businessPhone ?? "").trim();
  const address = (brand.businessAddress ?? "").trim();
  const showPoweredBy = brand.showPoweredBy ?? true;

  // Linkify URLs in the body (basic — covers the booking page link the
  // LLM puts in confirmation copy). Wrap in <a> styled with primary
  // brand color so it's visually obvious it's clickable.
  const linkifiedBody = escapeHtml(body).replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) => `<a href="${url}" style="color:${primary};text-decoration:underline;">${url}</a>`,
  );

  const logoBlock = logoUrl
    ? `<div style="text-align:center;margin-bottom:24px;"><img src="${escapeAttr(logoUrl)}" alt="${escapeAttr(brandName || "Logo")}" style="max-height:48px;max-width:200px;object-fit:contain;" /></div>`
    : brandName
      ? `<div style="text-align:center;margin-bottom:20px;font-size:14px;font-weight:600;color:#475569;letter-spacing:0.02em;text-transform:uppercase;">${escapeHtml(brandName)}</div>`
      : "";

  const ctaBlock = ctaLabel && ctaHref
    ? `<div style="margin:28px 0 8px;text-align:left;"><a href="${escapeAttr(ctaHref)}" style="display:inline-block;background:${primary};color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(ctaLabel)}</a></div>`
    : "";

  const footerLines: string[] = [];
  if (brandName) footerLines.push(`<strong style="color:#0f172a;">${escapeHtml(brandName)}</strong>`);
  if (phone) footerLines.push(`<a href="tel:${escapeAttr(phone.replace(/[^\d+]/g, ""))}" style="color:#475569;text-decoration:none;">${escapeHtml(phone)}</a>`);
  if (address) footerLines.push(escapeHtml(address));
  const footerBlock = footerLines.length > 0
    ? `<div class="sf-footer" style="margin-top:32px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:13px;color:#64748b;line-height:1.6;">${footerLines.join(" · ")}</div>`
    : "";

  const poweredByBlock = showPoweredBy
    ? `<div style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:center;">Powered by SeldonFrame</div>`
    : "";

  // 2026-05-18 — color-scheme meta + style tag forces light rendering
  // even when the recipient's Gmail / iOS Mail / Outlook is in dark
  // mode. Without these, Gmail auto-inverts the colors and the white
  // card with dark text becomes a dark card with light text — the
  // "why does it still look dark mode" bug. The msoStyle / [data-ogsc]
  // selectors target Outlook + Gmail.com dark-theme processors.
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(heading)}</title>
<style>
  :root { color-scheme: light only; supported-color-schemes: light; }
  body, .sf-card { color-scheme: light only; }
  [data-ogsc] body { background:#f8fafc !important; }
  [data-ogsc] .sf-card { background:#ffffff !important; color:#0f172a !important; }
  [data-ogsc] .sf-body-text { color:#334155 !important; }
  [data-ogsc] .sf-heading { color:#0f172a !important; }
  [data-ogsc] .sf-footer { color:#64748b !important; }
</style>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color-scheme:light only;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div class="sf-card" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px 28px;box-shadow:0 1px 3px rgba(15,23,42,0.04);">
      ${logoBlock}
      <div style="height:3px;background:${primary};border-radius:2px;margin-bottom:24px;width:48px;"></div>
      <h1 class="sf-heading" style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0f172a;font-weight:600;">${escapeHtml(heading)}</h1>
      <div class="sf-body-text" style="margin:0 0 0;color:#334155;font-size:15px;line-height:1.65;white-space:pre-wrap;">${linkifiedBody}</div>
      ${ctaBlock}
      ${footerBlock}
    </div>
    ${poweredByBlock}
  </div>
</body></html>`;

  // Plain-text fallback. Mail clients that block HTML still get a
  // readable message.
  const textLines = [heading, "", body];
  if (ctaLabel && ctaHref) textLines.push("", `${ctaLabel}: ${ctaHref}`);
  if (footerLines.length > 0) {
    textLines.push("", "—");
    if (brandName) textLines.push(brandName);
    if (phone) textLines.push(phone);
    if (address) textLines.push(address);
  }
  const text = textLines.filter((line) => line !== undefined && line !== null).join("\n");

  return { html, text };
}

// Tiny escape helpers — we don't ship a templating engine for emails,
// just inline a few transforms to keep XSS off the table when operator
// soul / business name / address strings flow into the markup.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
