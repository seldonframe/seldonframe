// v1.30.2 — Docs article: Custom fields.

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Customers (CRM)"
      categoryHref="/docs"
      title="Custom fields"
      lede="Track what your business actually cares about. Custom fields show up everywhere a contact does — kanban cards, form mappings, agent prompts."
      githubPath="app/docs/customers/custom-fields/page.tsx"
    >
      <h2>Field types</h2>
      <ul>
        <li><strong>Text</strong> — short string (e.g. "Service address").</li>
        <li><strong>Long text</strong> — multi-line notes.</li>
        <li><strong>Number</strong> — integer or decimal (e.g. "Square footage").</li>
        <li><strong>Currency</strong> — formatted with the workspace's default currency.</li>
        <li><strong>Date</strong> — calendar date (e.g. "Last service").</li>
        <li><strong>Single-select</strong> — pick one from a list (e.g. equipment brand).</li>
        <li><strong>Multi-select</strong> — pick many.</li>
        <li><strong>Boolean</strong> — yes/no toggle.</li>
        <li><strong>URL</strong> — clickable link.</li>
      </ul>

      <h2>Adding a field</h2>
      <p>
        <InAppLink href="/settings/fields">Settings → Custom fields</InAppLink>{" "}
        → "New field." Name, type, and (for selects) the option list.
        New fields appear on every contact retroactively, with a null
        value until you fill them in.
      </p>

      <Callout variant="tip" title="Through Claude Code">
        <em>"Add a 'Last invoice paid' date field to my contacts so I can
        track payment lag."</em>
      </Callout>

      <h2>Where they show up</h2>
      <ul>
        <li>Contact detail page (in a "Custom fields" section).</li>
        <li>Kanban deal cards (you pick which fields to surface).</li>
        <li>Form field mapping (so a form's "Service address" field auto-fills the contact's "Service address" custom field).</li>
        <li>Agent prompts — your chatbot can read custom fields when answering ("Hi Jane, last time we serviced your furnace was March — would you like to schedule maintenance?").</li>
        <li>CSV exports.</li>
      </ul>

      <h2>Renaming and deleting</h2>
      <p>
        Renaming a field is safe — all data is preserved, only the label
        changes. Deleting permanently removes the data from every contact
        — there's a confirmation step that lists how many records are
        affected.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/customers/contacts">Adding customers</InAppLink></li>
        <li><InAppLink href="/docs/customers/customer-portal">Customer Portal</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
