// v1.30.2 — Docs article: Pricing.

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Billing & plans"
      categoryHref="/docs"
      title="Pricing"
      lede="Five flat plans, no metered usage wallet — BYOK on Builder/Agency keeps AI cost at provider price, Managed runs on SeldonFrame's keys (fair use). You always know what the bill is."
      githubPath="app/docs/billing/pricing/page.tsx"
    >
      <h2>The plans</h2>
      <ul>
        <li><strong>Builder — $29/mo.</strong> Unlimited workspaces for businesses you operate: website + booking + intake + CRM + AI agents, BYOK. No client sub-accounts, no white-label, no client portal.</li>
        <li><strong>Managed — $49/mo.</strong> One workspace, same full front office, runs on SeldonFrame's keys (fair use) — no key to paste.</li>
        <li><strong>Agency Starter — $99/mo.</strong> Everything in Builder, plus full white-label, a branded client portal, and 10 client sub-accounts.</li>
        <li><strong>Agency Growth — $199/mo.</strong> 30 client sub-accounts, one-click deploy to all clients, priority support.</li>
        <li><strong>Agency Scale — $299/mo.</strong> Unlimited client sub-accounts, API + MCP access, marketplace rent-out.</li>
      </ul>

      <Callout variant="tip" title="Flat, no per-workspace overage">
        Every plan is a flat monthly price — no per-client-workspace add-on
        fee and no per-agent voice-receptionist surcharge. The voice
        receptionist is included; usage runs on your own AI/Twilio keys
        (Builder/Agency) or SeldonFrame's keys under fair use (Managed), at
        provider cost.
      </Callout>

      <h2>What's included</h2>
      <ul>
        <li>Full CRM (contacts, deals, custom fields, kanban), booking, intake, and AI agents on every plan.</li>
        <li>Your website on your own domain, with your branding (custom domain + remove-branding on every plan).</li>
        <li>On Agency Starter and above: full white-label, branded client portal, client sub-accounts.</li>
        <li>Forms, booking pages, automations, and durable workflows.</li>
        <li>Stripe / Twilio / Resend / Google Calendar integrations.</li>
        <li>Claude Code / MCP access — edit your whole site by chatting.</li>
        <li>Eval-gated agent publish.</li>
      </ul>

      <h2>What you bring</h2>
      <p>
        Builder and Agency plans are BYOK — you bring your own AI and (optionally)
        Twilio keys, so cost stays at provider price. Managed runs on
        SeldonFrame's keys under fair use. The other bring-your-own bits are:
      </p>
      <ul>
        <li><strong>Stripe</strong> — your connected account, so payouts land in your bank. Stripe takes its standard 2.9% + 30¢ per transaction.</li>
        <li><strong>Twilio (optional)</strong> — bring your own number if you want SMS and missed-call text-back on your own line. Otherwise the platform handles messaging for you.</li>
      </ul>

      <p>
        SeldonFrame never holds your provider relationships — you can
        leave the platform tomorrow and your Stripe and Twilio accounts
        come with you.
      </p>

      <Callout variant="info" title="Self-hosting? Bring your own key">
        If you self-host SeldonFrame instead (free, under AGPL-3.0), you
        supply your own Anthropic or OpenAI key regardless of tier. See{" "}
        <a href="/docs/integrations/llm">Anthropic / OpenAI</a>.
      </Callout>

      <h2>No contract</h2>
      <p>
        Plans are month-to-month — upgrade, downgrade, or cancel anytime.
        Your front office is live in 60 seconds from a URL, and you only
        move up a plan when you want more (client sub-accounts, white-label,
        higher sub-account limits).
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/billing/tiers">Plan tiers</InAppLink></li>
        <li><InAppLink href="/docs/billing/invoices">Invoices & receipts</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
