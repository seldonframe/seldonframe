// v1.30.2 — Docs article: Email templates.

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Email & Automation"
      categoryHref="/docs"
      title="Email templates"
      lede="Reusable, brand-themed templates. Variables pull from contact / deal / booking. Edit once, use everywhere."
      githubPath="app/docs/automation/email-templates/page.tsx"
    >
      <h2>What ships by default</h2>
      <p>
        Each template includes pre-built ones for:
      </p>
      <ul>
        <li>Booking confirmation</li>
        <li>24h booking reminder</li>
        <li>Quote follow-up</li>
        <li>Deal-won thank you</li>
        <li>Deal-lost re-engagement (90 days later)</li>
        <li>Review request (after job completion)</li>
        <li>Payment receipt</li>
      </ul>

      <h2>Editing</h2>
      <p>
        <InAppLink href="/emails/templates">Email → Templates</InAppLink>{" "}
        → pick a template. WYSIWYG editor with your brand applied.
        Variables wrap in curlies: <code>{`{{contact.first_name}}`}</code>,{" "}
        <code>{`{{booking.starts_at}}`}</code>, <code>{`{{deal.value}}`}</code>.
      </p>

      <Callout variant="tip" title="Preview before send">
        Hit "Preview as..." and pick a real contact. The template renders
        with their data so you can sanity-check before broadcasting.
      </Callout>

      <h2>Plain-text fallback</h2>
      <p>
        Every template has an auto-generated plain-text version (for
        deliverability — gmail and others penalize HTML-only). You can
        override the auto-generated text per template.
      </p>

      <h2>Through Claude Code</h2>
      <p>
        <em>"Create an email template called 'Maintenance reminder' that
        reminds customers their HVAC is due for a yearly check, references
        their last service date, and offers a $50-off coupon."</em>
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/automation/email">Send email</InAppLink></li>
        <li><InAppLink href="/docs/automation/rules">Automation rules</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
