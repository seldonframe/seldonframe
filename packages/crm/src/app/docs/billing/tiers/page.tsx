// v1.30.2 — Docs article: Plan tiers.

import { ArticleShell, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Billing & plans"
      categoryHref="/docs"
      title="Plan tiers"
      lede="What's included at each plan and what triggers a move up. Detailed feature breakdown. Every hosted plan includes managed AI — no key, no usage wallet."
      githubPath="app/docs/billing/tiers/page.tsx"
    >
      <h2>Builder ($19/mo)</h2>
      <ul>
        <li>Up to 10 landing pages</li>
        <li>Your own custom domain</li>
        <li>Your branding (logo, colors, fonts)</li>
        <li>Edit your whole site by chatting — no code</li>
        <li>Managed AI included (no key to paste)</li>
        <li>No CRM, booking, or AI agents (move to Workspace for those)</li>
        <li>Community support (Discord)</li>
      </ul>

      <h2>Workspace ($49/mo)</h2>
      <ul>
        <li>One full AI front office: website + booking + intake + CRM + chatbot</li>
        <li>Custom domain + your branding</li>
        <li>Full CRM — contacts, deals, custom fields, kanban, customer portal</li>
        <li>Booking page + intake forms, wired to the CRM</li>
        <li>Website chatbot that books against the real calendar</li>
        <li>Missed-call text-back so you never lose a lead</li>
        <li>Managed AI included (no key, no usage wallet)</li>
        <li>Email support (24h response)</li>
      </ul>

      <h2>Agency ($297/mo)</h2>
      <ul>
        <li>10 client workspaces included, +$10/mo each beyond</li>
        <li>White-label brand (your name + logo across the dashboard your clients see)</li>
        <li>Per-workspace custom domains</li>
        <li>Optional AI voice receptionist at +$99/mo per agent</li>
        <li>Bulk operations across client workspaces</li>
        <li>Managed AI included on every client workspace</li>
        <li>Priority support (4h response)</li>
      </ul>

      <h2>What triggers a move up</h2>
      <ul>
        <li>Needing a CRM, booking, and a chatbot — not just landing pages (Builder → Workspace).</li>
        <li>Wanting to white-label and resell to clients (→ Agency).</li>
        <li>Going past 10 client workspaces (+$10/mo each on Agency).</li>
        <li>Adding an AI voice receptionist that answers the phone (+$99/mo per agent).</li>
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
