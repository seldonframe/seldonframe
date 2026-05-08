// v1.30.2 — Docs article: Resend (email).

import { ArticleShell, Callout, CodeBlock, InAppLink, Step } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Integrations"
      categoryHref="/docs"
      title="Resend (email)"
      lede="Send transactional and marketing email from your own domain. SeldonFrame uses Resend under the hood — fast, deliverable, modern API."
      githubPath="app/docs/integrations/resend/page.tsx"
    >
      <h2>Setup</h2>

      <Step n={1} title="Get a Resend API key">
        Go to{" "}
        <a href="https://resend.com/" target="_blank" rel="noopener">resend.com</a>,
        create an account, and create an API key.
      </Step>

      <Step n={2} title="Add a sending domain">
        In Resend's dashboard → Domains → "Add domain." Enter your
        domain (e.g. <code>yourbiz.com</code>). Resend gives you DNS
        records (SPF, DKIM, DMARC) to add at your registrar.
      </Step>

      <Step n={3} title="Add the DNS records">
        Three TXT records typically — exact values come from the Resend
        dashboard. Example shape:
        <CodeBlock>{`TXT  send._domainkey   <DKIM record>
TXT  resend._domainkey  <DKIM record>
TXT  @                  v=spf1 include:resend.com ~all`}</CodeBlock>
      </Step>

      <Step n={4} title="Connect Resend to SeldonFrame">
        <InAppLink href="/settings/integrations">Settings → Integrations</InAppLink>{" "}
        → Resend → paste your API key and the domain you verified.
      </Step>

      <Callout variant="warn" title="Don't skip DKIM">
        Email deliverability without DKIM is rough. Gmail and Microsoft
        will quietly route you to spam. Always verify DKIM before sending
        marketing email.
      </Callout>

      <h2>What sends through Resend</h2>
      <ul>
        <li>Booking confirmations and reminders.</li>
        <li>Forms confirmations.</li>
        <li>Customer Portal magic-link logins.</li>
        <li>One-off and broadcast emails.</li>
        <li>Agent-triggered follow-ups.</li>
      </ul>

      <h2>From-name and reply-to</h2>
      <p>
        Default from-name is your workspace's display name. Default
        reply-to is your account email. Override per-template or per-send.
      </p>

      <h2>Costs</h2>
      <p>
        Resend bills you directly. The free tier covers 100 emails/day
        — enough for booking reminders for a small operation. Paid tiers
        scale up from there.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/automation/email">Send email</InAppLink></li>
        <li><InAppLink href="/docs/automation/email-templates">Email templates</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
