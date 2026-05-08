// v1.30.2 — Docs article: Branding & theme.

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Your business"
      categoryHref="/docs"
      title="Branding & theme"
      lede="One brand, applied everywhere. Logo, primary color, name — they propagate to your dashboard, public site, chatbot, emails, and PDFs in real time."
      githubPath="app/docs/your-business/branding/page.tsx"
    >
      <h2>What you can set</h2>
      <ul>
        <li><strong>Logo</strong> — SVG preferred, or PNG with transparent background. Square, ~512×512.</li>
        <li><strong>Wordmark</strong> — your business name as logotype, used in the dashboard sidebar and email signatures.</li>
        <li><strong>Primary color</strong> — the accent color used in CTAs, links, and the chatbot bubble.</li>
        <li><strong>Display name</strong> — shown to customers in emails, the chatbot greeting, booking confirmations.</li>
        <li><strong>Theme mode</strong> — light, dark, or system-default for your dashboard. Public site is always light unless you override per-page.</li>
      </ul>

      <p>
        Set it all in <InAppLink href="/settings/branding">Settings → Branding</InAppLink>.
      </p>

      <Callout variant="tip" title="Brand-isolated assets">
        SeldonFrame's own brand (the SF icon you see when you're not in a
        specific workspace) is separated from per-workspace brand. If
        you're an agency, your client's chatbot/site shows their brand,
        not SF's.
      </Callout>

      <h2>Per-page overrides</h2>
      <p>
        Most pages inherit the workspace brand. For exceptions (a
        promotional landing page that's intentionally off-brand, a dark-
        themed pricing page), each page has its own theme override in
        the page editor.
      </p>

      <h2>Email branding</h2>
      <p>
        Outgoing email uses your wordmark in the header and your primary
        color for buttons. Plain-text fallbacks include your business
        name and a footer with your address (legally required for
        marketing email — see{" "}
        <a href="/docs/automation/email">Send email</a>).
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/your-business/custom-domains">Custom domains</InAppLink></li>
        <li><InAppLink href="/docs/automation/email-templates">Email templates</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
