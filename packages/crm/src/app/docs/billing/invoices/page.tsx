// v1.30.2 — Docs article: Invoices & receipts.

import { ArticleShell, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Billing & plans"
      categoryHref="/docs"
      title="Invoices & receipts"
      lede="Your SeldonFrame subscription is billed through Stripe. Receipts auto-email; invoices are downloadable from the dashboard."
      githubPath="app/docs/billing/invoices/page.tsx"
    >
      <h2>Where to find them</h2>
      <p>
        <InAppLink href="/settings/billing">Settings → Billing</InAppLink>{" "}
        → "Invoices & receipts" tab. Every charge from the last 12 months
        is listed with date, amount, status, and a "Download PDF" link.
      </p>

      <h2>Auto-emailed receipts</h2>
      <p>
        Stripe emails a receipt to your account email after every
        successful charge. If you need them sent to a different
        billing-contact email (e.g. your bookkeeper), set it in{" "}
        <a href="/settings/billing">Settings → Billing → Billing contact</a>.
      </p>

      <h2>Tax / VAT</h2>
      <p>
        SeldonFrame collects VAT for EU/UK customers (we have a Stripe
        Tax integration). Add your VAT ID in{" "}
        <a href="/settings/billing">Settings → Billing → Tax info</a>{" "}
        to have it appear on invoices and (where applicable) reverse-
        charge the VAT.
      </p>

      <h2>Failed payments</h2>
      <p>
        If a card fails, Stripe retries 3 times over 7 days. You'll get
        an email each time. After the third failure, your workspace
        moves to a 7-day grace period (still functional, banner warning);
        if not resolved, it pauses (read-only). Update your card to
        unpause immediately.
      </p>

      <h2>Cancelling</h2>
      <p>
        <InAppLink href="/settings/billing">Settings → Billing</InAppLink>{" "}
        → "Cancel plan." You drop to Hobby tier at the end of the
        current period. Your data stays — you can re-upgrade anytime.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/billing/pricing">Pricing</InAppLink></li>
        <li><InAppLink href="/docs/billing/tiers">Plan tiers</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
