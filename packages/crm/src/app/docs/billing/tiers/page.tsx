// v1.30.2 — Docs article: Plan tiers.

import { ArticleShell, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Billing & plans"
      categoryHref="/docs"
      title="Plan tiers"
      lede="What's included at each tier and what triggers an upgrade. Detailed feature breakdown."
      githubPath="app/docs/billing/tiers/page.tsx"
    >
      <h2>Hobby ($0/mo)</h2>
      <ul>
        <li>1 workspace</li>
        <li>1 published agent (unlimited drafts)</li>
        <li>Up to 1,000 contacts</li>
        <li>SF subdomain only (no custom domain)</li>
        <li>"Powered by SeldonFrame" badge on public pages</li>
        <li>Community support (Discord)</li>
      </ul>

      <h2>Pro ($29/mo)</h2>
      <ul>
        <li>1 workspace, unlimited published agents</li>
        <li>Unlimited contacts</li>
        <li>Custom domain</li>
        <li>Hide "Powered by SeldonFrame" badge</li>
        <li>Broadcast email (up to 10k/mo through Resend)</li>
        <li>All automation triggers + actions</li>
        <li>Customer Portal</li>
        <li>Email support (24h response)</li>
      </ul>

      <h2>Agency ($99/mo)</h2>
      <ul>
        <li>Up to 50 client workspaces under one agency account</li>
        <li>Per-workspace custom domain</li>
        <li>White-label brand (your name + logo on the dashboard for clients)</li>
        <li>SSO (SAML / OIDC) for agency operators</li>
        <li>Bulk operations across client workspaces</li>
        <li>Priority support (4h response)</li>
        <li>SLA on uptime and incident response</li>
      </ul>

      <h2>What forces an upgrade</h2>
      <ul>
        <li>Hitting the contact / agent / workspace cap.</li>
        <li>Wanting a custom domain.</li>
        <li>Wanting to hide the SF badge on public pages.</li>
        <li>Sending broadcast email at scale.</li>
        <li>Hosting clients (agency mode).</li>
      </ul>

      <h2>Switching tiers</h2>
      <p>
        <InAppLink href="/settings/billing">Settings → Billing</InAppLink> →
        pick a new tier. Upgrades are immediate; downgrades take effect
        at the end of the current billing period. Stripe handles the
        proration.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/billing/pricing">Pricing</InAppLink></li>
        <li><InAppLink href="/docs/billing/invoices">Invoices & receipts</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
