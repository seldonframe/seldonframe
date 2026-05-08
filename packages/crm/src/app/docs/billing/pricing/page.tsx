// v1.30.2 — Docs article: Pricing.

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Billing & plans"
      categoryHref="/docs"
      title="Pricing"
      lede="Three tiers. Free to start. You bring your own LLM and SMS keys, so SeldonFrame's price is purely the platform — no token markup, no per-message fees."
      githubPath="app/docs/billing/pricing/page.tsx"
    >
      <h2>The tiers</h2>
      <ul>
        <li><strong>Hobby — $0/mo.</strong> One workspace, one published agent, the SF subdomain, community support.</li>
        <li><strong>Pro — $29/mo.</strong> Unlimited agents, custom domains, broadcast email, automations, removeable "Powered by SeldonFrame" badge, email support.</li>
        <li><strong>Agency — $99/mo.</strong> Multi-tenant agency mode (host clients), SSO, white-label brand, priority support, and SLA.</li>
      </ul>

      <Callout variant="tip" title="Why so cheap">
        SeldonFrame doesn't markup AI tokens (you bring your own key)
        or SMS (you bring your own Twilio). The platform fee is just
        the platform — UI, durable workflows, hosting, eval gate. The
        marginal-cost structure is much friendlier than competitors
        that bundle AI + platform.
      </Callout>

      <h2>What's included on every tier</h2>
      <ul>
        <li>Full CRM (contacts, deals, custom fields, kanban).</li>
        <li>Public site at the SF subdomain.</li>
        <li>Forms, booking pages, automations.</li>
        <li>Stripe / Twilio / Resend / Google Calendar integrations.</li>
        <li>Claude Code / MCP access.</li>
        <li>Eval-gated agent publish.</li>
      </ul>

      <h2>What's BYOK</h2>
      <ul>
        <li><strong>LLM</strong> (Anthropic / OpenAI). You pay the provider directly.</li>
        <li><strong>SMS</strong> (Twilio). You pay Twilio directly.</li>
        <li><strong>Email</strong> (Resend). Free tier covers most small ops; paid tiers scale up.</li>
        <li><strong>Stripe</strong>. Stripe takes its standard 2.9% + 30¢ per transaction.</li>
      </ul>

      <p>
        SeldonFrame never holds your provider relationships — you can
        leave the platform tomorrow and your Anthropic / Twilio / Stripe
        accounts come with you.
      </p>

      <h2>Trying it out</h2>
      <p>
        The Hobby tier is free forever — sign up, build a workspace,
        publish an agent, take a real booking. Upgrade only when you
        outgrow the limits (custom domain, second published agent,
        broadcast email, multi-tenant).
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/billing/tiers">Plan tiers</InAppLink></li>
        <li><InAppLink href="/docs/billing/invoices">Invoices & receipts</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
