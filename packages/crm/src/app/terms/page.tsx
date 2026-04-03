import Link from "next/link";

export const metadata = {
  title: "Terms of Service — SeldonFrame",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold">Terms of Service — SeldonFrame</h1>
      <p className="text-sm text-muted-foreground">Last updated: April 2026</p>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">1. What is SeldonFrame</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          SeldonFrame is a business identity operating system. It provides CRM, booking, landing pages, email, and
          payment tools — all connected through a single business identity layer called the &quot;soul.&quot; You configure your
          soul once, and every feature adapts to your business automatically. If a feature you need doesn&apos;t exist,
          you can describe it and the AI-powered &quot;Seldon It&quot; feature will build it for you.
        </p>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">SeldonFrame is available as:</p>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-base leading-relaxed text-muted-foreground">
          <li>A free, open-source self-hosted version</li>
          <li>A managed cloud service at app.seldonframe.com</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">2. Accounts</h2>
        <ul className="list-disc space-y-3 pl-6 text-base leading-relaxed text-muted-foreground">
          <li>You must provide accurate information during signup</li>
          <li>You are responsible for maintaining the security of your account</li>
          <li>One account per person; business accounts belong to the business</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">3. Acceptable Use</h2>
        <ul className="list-disc space-y-3 pl-6 text-base leading-relaxed text-muted-foreground">
          <li>Use SeldonFrame for lawful business purposes</li>
          <li>Do not use the platform to send spam or unsolicited communications</li>
          <li>Do not attempt to access other users&apos; data</li>
          <li>Do not reverse engineer or attack the service</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">4. Your Data</h2>
        <ul className="list-disc space-y-3 pl-6 text-base leading-relaxed text-muted-foreground">
          <li>You own your data (contacts, bookings, emails, soul configuration)</li>
          <li>We do not claim ownership of any content you create</li>
          <li>
            You grant us a limited license to host and process your data solely to provide the service
          </li>
          <li>You can export or delete your data at any time</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">5. Subscription and Billing</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          Paid plans are billed monthly or annually through Stripe. You can cancel at any time. Cancellation takes
          effect at the end of the current billing period. Refunds are handled on a case-by-case basis.
        </p>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Plans: Starter ($49/month), Cloud Pro ($99/month), Pro 3-20 ($149-449/month). Self-hosted is free forever.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">6. Seldon It (AI Features)</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          The Seldon It feature uses AI (Anthropic Claude) to generate custom software blocks based on your
          description. Generated blocks run within your SeldonFrame instance. AI-generated code is provided as-is. You
          should review generated features before using them with real client data.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">7. Marketplace</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          Pro users may list blocks, frameworks, themes, and soul packs on the SeldonFrame marketplace. Sellers keep
          100% of sales revenue. SeldonFrame takes 0% commission. Sellers are responsible for the quality and accuracy
          of their listings.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">8. Affiliate Program</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          Users may earn 30% recurring commission on subscriptions generated through their referral link. Commission is
          paid monthly via Stripe Connect. SeldonFrame reserves the right to modify the affiliate program terms.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">9. Open Source License</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          The SeldonFrame source code is available under the Business Source License (BSL). You may self-host, modify,
          and contribute to SeldonFrame. You may deploy SeldonFrame for your own business or your clients&apos;
          businesses. You may NOT operate a competing hosted service based on the SeldonFrame codebase.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">10. Limitation of Liability</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          SeldonFrame is provided &quot;as is.&quot; We do our best to keep the service reliable and secure, but we cannot
          guarantee 100% uptime or error-free operation. We are not liable for any indirect, incidental, or
          consequential damages.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">11. Termination</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          We may suspend or terminate accounts that violate these terms. You may close your account at any time. Upon
          termination, your data will be deleted within 30 days unless you request an export.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">12. Contact</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          For questions: support@seldonframe.com
          <br />
          SeldonFrame is operated by Max Thule.
        </p>
      </section>

      <footer className="mt-12 flex flex-wrap items-center gap-4 border-t border-[hsl(var(--border))] pt-6 text-sm text-muted-foreground">
        <Link href="/" className="underline-offset-4 hover:underline">
          Back to Home
        </Link>
        <Link href="/privacy" className="underline-offset-4 hover:underline">
          Privacy Policy
        </Link>
      </footer>
    </main>
  );
}
