// v1.30.2 — Docs article: Custom domains.

import { ArticleShell, Callout, CodeBlock, InAppLink, Step } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Your business"
      categoryHref="/docs"
      title="Custom domains"
      lede="Replace your-name.app.seldonframe.com with www.yourbiz.com. SSL is automatic, takes 5 minutes."
      githubPath="app/docs/your-business/custom-domains/page.tsx"
    >
      <h2>Setup</h2>

      <Step n={1} title="Add the domain in SeldonFrame">
        <InAppLink href="/settings/domains">Settings → Domains</InAppLink>{" "}
        → "Add domain." Type <code>www.yourbiz.com</code>. SeldonFrame
        gives you the DNS records to add.
      </Step>

      <Step n={2} title="Add the DNS records at your registrar">
        Two records — a CNAME for www and an A record for the apex (root)
        domain pointing at our edge IP. Example:
        <CodeBlock>{`www    CNAME    cname.vercel-dns.com.
@      A        76.76.21.21`}</CodeBlock>
        Exact records depend on your hosting setup — the page in step 1
        shows the exact values for your domain.
      </Step>

      <Step n={3} title="Wait for DNS to propagate">
        Usually under 5 minutes, sometimes up to an hour. The Domains
        page shows a green check when verification succeeds.
      </Step>

      <Step n={4} title="SSL is automatic">
        Once DNS verifies, an SSL certificate is provisioned through
        Let's Encrypt automatically. Your site is HTTPS-only — there's
        no toggle for HTTP.
      </Step>

      <Callout variant="info" title="Apex vs www">
        We recommend using <code>www.yourbiz.com</code> as your primary
        and redirecting the apex (<code>yourbiz.com</code>) to it. This
        is more reliable than apex-as-primary because of how DNS handles
        A records vs CNAMEs at root. Both will work, but www-primary is
        less likely to have edge cases.
      </Callout>

      <h2>What works at your custom domain</h2>
      <ul>
        <li>All your public pages (landing pages, services, blog).</li>
        <li>Your booking pages.</li>
        <li>Your forms (when embedded as iframes from external sites,
            the iframe URL becomes your custom domain).</li>
        <li>The chatbot embed snippet — works the same as on the
            subdomain.</li>
      </ul>

      <h2>Subdomain still works</h2>
      <p>
        Your <code>your-name.app.seldonframe.com</code> subdomain stays
        live as a backup, even after you set up a custom domain. Useful
        for testing.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/your-business/branding">Branding & theme</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
