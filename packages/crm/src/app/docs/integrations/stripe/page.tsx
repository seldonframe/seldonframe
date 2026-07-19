// v1.30.2 — Docs article: Stripe (payments).

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Integrations"
      categoryHref="/docs"
      title="Stripe (payments)"
      lede="Connect Stripe to invoice customers, accept payments through your booking pages, and trigger automations on paid / failed events."
      githubPath="app/docs/integrations/stripe/page.tsx"
    >
      <h2>Setup</h2>
      <p>
        <InAppLink href="/settings/integrations">Settings → Integrations</InAppLink>{" "}
        → Stripe → "Connect with Stripe." Stripe Connect OAuth — you
        approve from your Stripe dashboard, redirect back, done.
      </p>

      <h2>What you can do</h2>
      <ul>
        <li>
          <strong>Send invoices.</strong> From a deal or booking, click
          "Send invoice." Stripe creates the invoice; SeldonFrame emails
          a paylink to the customer.
        </li>
        <li>
          <strong>Accept payment on booking.</strong> Toggle "Charge at
          booking" on a booking type to require a card / payment before
          the slot is reserved.
        </li>
        <li>
          <strong>Subscriptions.</strong> Create monthly / yearly
          subscriptions for clients on retainer. Auto-renews via Stripe.
        </li>
        <li>
          <strong>Payment-triggered automations.</strong> "When invoice
          paid → send thank-you + move deal to Won + log to revenue
          report."
        </li>
      </ul>

      <Callout variant="info" title="Test mode vs. live mode">
        SeldonFrame respects the mode of the Stripe key you connect. If
        you connect a test-mode account, all charges are test charges
        (no real money moves). Useful for dry-runs.
      </Callout>

      <h2>What you don't have to do</h2>
      <ul>
        <li>You don't enter card numbers — customers do, on Stripe-hosted pages. SeldonFrame is never PCI scope.</li>
        <li>You don't reconcile manually — Stripe payouts to your bank are independent of Seldon.</li>
      </ul>

      <h2>Refunds</h2>
      <p>
        Refunds go through your Stripe dashboard (we don't currently
        wrap that flow). When you refund there, SeldonFrame's webhook
        receives <code>charge.refunded</code> and updates the deal /
        invoice status.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/customers/customer-portal">Customer Portal</InAppLink></li>
        <li><InAppLink href="/docs/automation/rules">Automation rules</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
