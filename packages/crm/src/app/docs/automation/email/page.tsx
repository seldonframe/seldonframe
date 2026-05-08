// v1.30.2 — Docs article: Send email.

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Email & Automation"
      categoryHref="/docs"
      title="Send email"
      lede="One-off and broadcast email from your domain. Powered by Resend, branded with your wordmark, deliverable to inboxes."
      githubPath="app/docs/automation/email/page.tsx"
    >
      <h2>Setup</h2>
      <p>
        Connect Resend in <InAppLink href="/settings/integrations">Settings → Integrations</InAppLink>.
        See <a href="/docs/integrations/resend">Resend setup</a> for the DNS
        records you need to add (SPF, DKIM, DMARC) for deliverability.
      </p>

      <h2>One-off email</h2>
      <p>
        From a contact page, click "Send email." Pick a template (or
        write fresh). Attach files. Send.
      </p>
      <p>
        From <InAppLink href="/emails">Email</InAppLink> → "New broadcast,"
        you can email a filtered slice of your CRM ("all customers in
        stage 'won' from the last 90 days who don't have an active deal").
        Preview and send.
      </p>

      <Callout variant="warn" title="Marketing email rules">
        US/EU law (CAN-SPAM, GDPR) requires a physical address in the
        footer of marketing email and a working unsubscribe link in
        every send. SeldonFrame adds both automatically — set your
        business address in{" "}
        <a href="/settings/branding">Settings → Branding</a>.
      </Callout>

      <h2>From your AI agent</h2>
      <p>
        If your published agent has the <code>send_followup_email</code>{" "}
        tool, it can send templated emails on your behalf — e.g.
        "Thanks for booking; here's what to expect." All such sends are
        logged and gated by the same eval rules as the rest of the
        agent.
      </p>

      <h2>Inbound email</h2>
      <p>
        Forwarding inbound replies into your CRM is on the roadmap.
        Today, inbound goes wherever your DNS MX records point; outbound
        is the focus.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/automation/email-templates">Email templates</InAppLink></li>
        <li><InAppLink href="/docs/automation/rules">Automation rules</InAppLink></li>
        <li><InAppLink href="/docs/integrations/resend">Resend setup</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
