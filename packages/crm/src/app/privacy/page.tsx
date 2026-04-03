import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — SeldonFrame",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold">Privacy Policy — SeldonFrame</h1>
      <p className="text-sm text-muted-foreground">Last updated: April 2026</p>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">1. Introduction</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          SeldonFrame (&quot;we,&quot; &quot;our,&quot; &quot;us&quot;) is a business identity operating system that helps service professionals
          manage their business. This includes CRM, booking, email, landing pages, and payment features — all connected
          through a single business identity layer called the &quot;soul.&quot; This Privacy Policy explains how we collect, use,
          and protect your information when you use SeldonFrame at app.seldonframe.com.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">2. What We Collect</h2>
        <ul className="list-disc space-y-3 pl-6 text-base leading-relaxed text-muted-foreground">
          <li>
            Account information: name, email address (collected during signup via Google OAuth or magic link email)
          </li>
          <li>
            Business information: business name, service types, pipeline stages, voice preferences, branding — all
            provided voluntarily during the soul wizard onboarding
          </li>
          <li>
            Client/contact data: names, emails, phone numbers, notes, and booking history that YOU add to your CRM
          </li>
          <li>Usage data: pages visited, features used, blocks installed (for improving the product)</li>
          <li>Payment information: processed by Stripe — we never store credit card numbers</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">3. How We Use Your Data</h2>
        <ul className="list-disc space-y-3 pl-6 text-base leading-relaxed text-muted-foreground">
          <li>To provide and personalize the SeldonFrame service</li>
          <li>To configure your business identity (soul) so all blocks adapt to your business</li>
          <li>To process bookings, send emails, and manage contacts on your behalf</li>
          <li>To improve the product based on usage patterns</li>
          <li>We do NOT sell your data to third parties</li>
          <li>We do NOT use your business or client data to train AI models</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">4. Google OAuth</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          When you sign in with Google, we receive your name and email address from your Google account. We do not
          access your Google contacts, calendar, drive, or any other Google services unless you explicitly connect them
          in Settings. We use Google OAuth solely for authentication.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">5. Data Storage and Security</h2>
        <ul className="list-disc space-y-3 pl-6 text-base leading-relaxed text-muted-foreground">
          <li>Data is stored on servers in the United States (Vercel, Neon PostgreSQL)</li>
          <li>All data is encrypted in transit (HTTPS/TLS)</li>
          <li>Sensitive credentials (API keys, integration tokens) are encrypted at rest</li>
          <li>We use industry-standard security practices</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">6. Your Rights</h2>
        <ul className="list-disc space-y-3 pl-6 text-base leading-relaxed text-muted-foreground">
          <li>You can export your data at any time</li>
          <li>You can delete your account and all associated data by contacting us</li>
          <li>You can disconnect Google OAuth at any time</li>
          <li>For self-hosted users: your data never leaves your own infrastructure</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">7. Third-Party Services</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          SeldonFrame integrates with third-party services only when you explicitly connect them:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-base leading-relaxed text-muted-foreground">
          <li>Stripe (payments)</li>
          <li>Resend (email delivery)</li>
          <li>Google Calendar (scheduling, optional)</li>
          <li>Twilio (SMS, optional)</li>
        </ul>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          We only share the minimum data necessary for each integration to function.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">8. Open Source</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          SeldonFrame is open source. The source code is available at github.com/seldonframe/crm. Self-hosted users
          control their own data entirely — no data is sent to SeldonFrame servers.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">9. Contact</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          For privacy questions: privacy@seldonframe.com
          <br />
          SeldonFrame is operated by Max Thule.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-10 text-xl font-semibold">10. Changes</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          We may update this policy. Changes will be posted on this page with an updated date.
        </p>
      </section>

      <footer className="mt-12 flex flex-wrap items-center gap-4 border-t border-[hsl(var(--border))] pt-6 text-sm text-muted-foreground">
        <Link href="/" className="underline-offset-4 hover:underline">
          Back to Home
        </Link>
        <Link href="/terms" className="underline-offset-4 hover:underline">
          Terms of Service
        </Link>
      </footer>
    </main>
  );
}
