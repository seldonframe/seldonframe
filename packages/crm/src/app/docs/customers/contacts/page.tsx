// v1.30.2 — Docs article: Adding customers (contacts).

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Customers (CRM)"
      categoryHref="/docs"
      title="Adding customers"
      lede="Three ways to get contacts in: manual add, CSV import, and inbound (form / chatbot / API). They all land in the same Customers view."
      githubPath="app/docs/customers/contacts/page.tsx"
    >
      <h2>Manual add</h2>
      <p>
        <InAppLink href="/contacts">Customers</InAppLink> → "New customer."
        Name, email, phone are required. Stage and tags are optional but
        recommended (you'll thank yourself when you filter later).
      </p>

      <h2>CSV import</h2>
      <p>
        <InAppLink href="/contacts">Customers</InAppLink> → "Import." Drop
        a CSV. The importer auto-maps columns by header name (Name, Email,
        Phone, Company, etc.) and lets you remap anything it got wrong.
        Custom fields without a column-name match show up as "Skip" by
        default.
      </p>

      <Callout variant="tip" title="Dedupe on import">
        SeldonFrame dedupes on email by default (case-insensitive). A
        match merges the new row's data into the existing contact rather
        than creating a duplicate. Toggle this off in the import dialog
        if you have a use case for duplicates.
      </Callout>

      <h2>Inbound</h2>
      <p>
        Most contacts arrive automatically:
      </p>
      <ul>
        <li><strong>Form submissions</strong> create contacts at stage "new lead." See <a href="/docs/pages/forms">Forms & lead capture</a>.</li>
        <li><strong>Chatbot conversations</strong> that capture an email create a contact and link the conversation history to it.</li>
        <li><strong>Booking page submissions</strong> create both a contact and a booking record.</li>
        <li><strong>API / MCP</strong> — Claude Code can add contacts directly. <em>"Add John Smith (john@acme.com) as a qualified lead with a $5k deal attached."</em></li>
      </ul>

      <h2>Custom fields</h2>
      <p>
        Templates pre-fill custom fields for the vertical (HVAC: equipment
        age, last service; coach: goals, sessions completed). Add or
        remove fields anytime in{" "}
        <InAppLink href="/docs/customers/custom-fields">Custom fields</InAppLink>.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/customers/deals">Pipeline & deals</InAppLink></li>
        <li><InAppLink href="/docs/customers/custom-fields">Custom fields</InAppLink></li>
        <li><InAppLink href="/docs/customers/customer-portal">Customer Portal</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
