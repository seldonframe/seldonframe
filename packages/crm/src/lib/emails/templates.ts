export function renderPlainEmailTemplate({
  heading,
  body,
  ctaLabel,
  ctaHref,
}: {
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  const html = `
  <div style="font-family: Inter, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #0f172a; color: #e2e8f0; border-radius: 12px;">
    <h1 style="margin: 0 0 16px; font-size: 22px; line-height: 1.2;">${heading}</h1>
    <p style="margin: 0 0 18px; color: #cbd5e1; white-space: pre-wrap;">${body}</p>
    ${ctaLabel && ctaHref ? `<a href="${ctaHref}" style="display:inline-block;background:#22d3ee;color:#0f172a;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;">${ctaLabel}</a>` : ""}
  </div>
  `;

  const text = [heading, "", body, ctaLabel && ctaHref ? `${ctaLabel}: ${ctaHref}` : ""].filter(Boolean).join("\n");

  return { html, text };
}
