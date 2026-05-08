// v1.30.2 — Docs article: Forms & lead capture.

import { ArticleShell, Callout, InAppLink, Step } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Pages & website"
      categoryHref="/docs"
      title="Forms & lead capture"
      lede="Build intake forms in 30 seconds. Submissions land in your CRM, fire automations, and notify your team. No third-party form builder needed."
      githubPath="app/docs/pages/forms/page.tsx"
    >
      <h2>The basics</h2>
      <p>
        A form in SeldonFrame is a list of fields plus a destination. The
        fields collect data from a visitor; the destination decides what
        happens with it (create a contact, attach to a deal, fire a
        Zap-style automation, send a confirmation email).
      </p>

      <Step n={1} title="Create the form">
        <InAppLink href="/forms">Forms</InAppLink> → "New form." Give it a
        name like "Quote request."
      </Step>
      <Step n={2} title="Add fields">
        Standard fields (name, email, phone) auto-map to CRM fields.
        Custom fields ("Service needed", "Square footage", "Budget") become
        custom contact fields automatically.
      </Step>
      <Step n={3} title="Set the destination">
        <ul>
          <li><strong>Create contact</strong> with stage "new lead" (default).</li>
          <li><strong>Create deal</strong> at $value, attached to the contact.</li>
          <li><strong>Fire automation</strong> — see <a href="/docs/automation/rules">Automation rules</a>.</li>
          <li><strong>Send email</strong> — confirmation to the submitter, notification to you.</li>
        </ul>
      </Step>
      <Step n={4} title="Embed it">
        Drop the form on any SF page (it's a block). Or copy the embed
        snippet and paste on an external site:
        <pre className="my-3 overflow-x-auto rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          {`<iframe src="https://app.seldonframe.com/embed/form/frm_abc123" width="100%" height="500"></iframe>`}
        </pre>
      </Step>

      <Callout variant="tip" title="Spam protection built in">
        Every submission is scored for spam (honeypot field, rate limiting,
        common spam-pattern detection). Suspicious submissions land in
        Forms → Quarantine instead of your CRM. Review and approve or
        delete.
      </Callout>

      <h2>Conditional logic</h2>
      <p>
        Fields can show or hide based on prior answers. Example: ask
        "Service needed?" → if "Furnace repair," show "Age of unit?";
        if "AC install," show "Square footage?". Set up in the form
        builder under each field's "Show when" rule.
      </p>

      <h2>Multi-step forms</h2>
      <p>
        Long forms convert badly. Split a 12-field form into 3 steps of
        4 fields. The submission is one record in your CRM regardless.
        Toggle "Multi-step" in the form's Layout settings.
      </p>

      <h2>Through Claude Code</h2>
      <p>
        <em>"Build me a quote-request form with name, email, phone, service
        needed (HVAC repair / install / maintenance), and 'when do you need
        it' (this week / this month / planning ahead). Notify me at
        owner@acmehvac.com on every submission."</em>
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/pages/booking">Booking pages</InAppLink></li>
        <li><InAppLink href="/docs/automation/rules">Automation rules</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
