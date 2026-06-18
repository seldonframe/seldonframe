// v1.30.2 — Docs article: Pricing.

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Billing & plans"
      categoryHref="/docs"
      title="Pricing"
      lede="Three flat, seat-based plans. AI is managed and included on every one — no key to paste, no per-token markup, no metered usage wallet. You always know what the bill is."
      githubPath="app/docs/billing/pricing/page.tsx"
    >
      <h2>The plans</h2>
      <ul>
        <li><strong>Builder — $19/mo.</strong> Up to 10 landing pages on your own domain, with your branding. A fast, polished website — no CRM, booking, or AI agents.</li>
        <li><strong>Workspace — $49/mo.</strong> One full AI front office: website + booking + intake + CRM + chatbot, wired together, with managed AI included.</li>
        <li><strong>Agency — $297/mo.</strong> White-label and resell. 10 client workspaces included (+$10/mo each beyond), your brand everywhere, plus an optional AI voice receptionist at +$99/mo per agent.</li>
      </ul>

      <Callout variant="tip" title="AI is included">
        Every hosted plan ships with managed AI — your chatbot, copy,
        and automations just work, with no provider key to paste and no
        token bill to watch. Pricing is flat and seat-based: predictable
        every month, with no metered usage wallet to top up.
      </Callout>

      <h2>What's included</h2>
      <ul>
        <li>Managed AI on every plan — no key, no markup, no usage wallet.</li>
        <li>Your website on your own domain, with your branding.</li>
        <li>On Workspace and Agency: full CRM (contacts, deals, custom fields, kanban), booking, intake, and a website chatbot.</li>
        <li>Forms, booking pages, automations, and durable workflows.</li>
        <li>Stripe / Twilio / Resend / Google Calendar integrations.</li>
        <li>Claude Code / MCP access — edit your whole site by chatting.</li>
        <li>Eval-gated agent publish.</li>
      </ul>

      <h2>What you bring</h2>
      <p>
        AI is on us. The only bring-your-own bits are:
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
        The hosted plans include managed AI. If you self-host SeldonFrame
        instead (free, under AGPL-3.0), you supply your own Anthropic or
        OpenAI key — that's the only path where BYOK applies. See{" "}
        <a href="/docs/integrations/llm">Anthropic / OpenAI</a>.
      </Callout>

      <h2>No contract</h2>
      <p>
        Plans are month-to-month — upgrade, downgrade, or cancel anytime.
        Your front office is live in 60 seconds from a URL, and you only
        move up a plan when you want more (a CRM, more client workspaces,
        a voice receptionist).
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/billing/tiers">Plan tiers</InAppLink></li>
        <li><InAppLink href="/docs/billing/invoices">Invoices & receipts</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
