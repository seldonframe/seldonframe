// v1.30.2 — Docs article: Pipeline & deals.

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Customers (CRM)"
      categoryHref="/docs"
      title="Pipeline & deals"
      lede="Track opportunities through stages. Drag deals across the kanban, close them, see your forecast. Pre-tuned for your vertical, fully customizable."
      githubPath="app/docs/customers/deals/page.tsx"
    >
      <h2>Stages</h2>
      <p>
        Each workspace gets a default pipeline tuned for its template
        (HVAC: New lead → Quote sent → Job scheduled → Job done →
        Invoice paid; Coach: Discovery booked → Proposal sent → Engaged →
        Renewing). Edit, reorder, or replace any of them in{" "}
        <InAppLink href="/settings/pipeline">Settings → Pipeline</InAppLink>.
      </p>

      <h2>Adding a deal</h2>
      <p>
        From a contact's profile, click "+ Deal." Or from the{" "}
        <InAppLink href="/deals">Deals</InAppLink> view, click "New deal"
        and pick a contact. Each deal needs a value, a stage, and an
        owner; everything else is optional.
      </p>

      <h2>Kanban view</h2>
      <p>
        The Deals page is a horizontal kanban — one column per stage,
        deals as cards. Drag a card to move it. Total $ value of each
        column shows at the top of the column.
      </p>

      <Callout variant="tip" title="Probability-weighted forecast">
        Each stage has a default close probability (10%, 25%, 50%, 80%,
        100%). Your dashboard's "weighted pipeline" multiplies deal
        value by stage probability — a more honest forecast than raw
        pipeline total.
      </Callout>

      <h2>Closing a deal</h2>
      <p>
        Drag to the final "won" stage. Or open the deal and click "Mark
        won." This fires whichever automations you have set up on close
        — usually a thank-you email, an invoice send via Stripe, and a
        review request 7 days later.
      </p>

      <h2>Lost deals</h2>
      <p>
        Lost deals stay in the database (you'll want them for re-engagement
        campaigns later). Mark a deal lost from its detail page; pick a
        reason (price, timing, lost to competitor, no response). Reasons
        feed your dashboard's "why we lose" report.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/customers/contacts">Adding customers</InAppLink></li>
        <li><InAppLink href="/docs/automation/rules">Automation rules</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
