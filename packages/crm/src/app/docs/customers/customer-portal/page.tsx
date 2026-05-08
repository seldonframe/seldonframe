// v1.30.2 — Docs article: Customer Portal.

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Customers (CRM)"
      categoryHref="/docs"
      title="Customer Portal"
      lede="A self-serve area where your customers manage their bookings, see invoices, message your agent, and update their info. One link, one login."
      githubPath="app/docs/customers/customer-portal/page.tsx"
    >
      <h2>What customers see</h2>
      <p>
        When a customer logs into your portal, they see:
      </p>
      <ul>
        <li>Their upcoming bookings, with reschedule and cancel links.</li>
        <li>Past bookings and the work-orders attached.</li>
        <li>Outstanding invoices and a "Pay now" button (when Stripe is connected).</li>
        <li>A messaging thread with your AI agent — picking up where the chatbot left off.</li>
        <li>Their contact info, editable.</li>
      </ul>

      <h2>How they get in</h2>
      <p>
        Passwordless. They enter their email; SeldonFrame emails them a
        magic link; they click and they're in. No accounts to manage on
        your side — the contact record in your CRM is their account.
      </p>

      <Callout variant="info" title="Brand-themed, on your domain">
        The portal lives at <code>portal.yourbiz.com</code> (or
        <code>your-name.app.seldonframe.com/portal</code>). Same brand
        colors, logo, and theme as your public site.
      </Callout>

      <h2>What you control</h2>
      <p>
        In <InAppLink href="/settings/portal">Settings → Customer Portal</InAppLink>:
      </p>
      <ul>
        <li>Toggle the portal on/off.</li>
        <li>Choose which sections appear (bookings, invoices, messages, profile).</li>
        <li>Custom welcome message.</li>
        <li>Whether self-service rescheduling is allowed (or only via your agent).</li>
      </ul>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/customers/contacts">Adding customers</InAppLink></li>
        <li><InAppLink href="/docs/integrations/stripe">Stripe (payments)</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
