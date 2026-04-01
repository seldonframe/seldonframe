import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | SeldonFrame",
  description: "Terms of Service for SeldonFrame.",
};

export default function TermsOfServicePage() {
  return (
    <main className="web-section py-16 text-foreground">
      <div className="web-container max-w-3xl space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-[hsl(var(--color-text-secondary))]">Last updated: April 1, 2026</p>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">Acceptance of Terms</h2>
          <p className="text-[hsl(var(--color-text-secondary))]">
            By accessing or using SeldonFrame, you agree to these Terms of Service. If you do not agree, do not use the
            service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">Service Description</h2>
          <p className="text-[hsl(var(--color-text-secondary))]">
            SeldonFrame provides software tools for business operations, including CRM, workflows, booking, and related
            functionality. Features may evolve over time.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">Accounts and Security</h2>
          <ul className="list-disc space-y-2 pl-6 text-[hsl(var(--color-text-secondary))]">
            <li>You are responsible for account access and activity under your credentials.</li>
            <li>You must provide accurate account information.</li>
            <li>You must promptly notify us of unauthorized account use.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">Acceptable Use</h2>
          <ul className="list-disc space-y-2 pl-6 text-[hsl(var(--color-text-secondary))]">
            <li>Do not use the service for unlawful, abusive, or fraudulent activity.</li>
            <li>Do not attempt to disrupt, reverse engineer, or compromise the platform.</li>
            <li>Do not misuse third-party integrations connected through SeldonFrame.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">Billing</h2>
          <p className="text-[hsl(var(--color-text-secondary))]">
            Paid features are governed by the pricing and billing terms presented at purchase. You are responsible for any
            applicable taxes and fees.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">Intellectual Property</h2>
          <p className="text-[hsl(var(--color-text-secondary))]">
            SeldonFrame and related content are protected by applicable intellectual property laws. Open-source components are
            governed by their respective licenses.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">Disclaimer and Limitation of Liability</h2>
          <p className="text-[hsl(var(--color-text-secondary))]">
            The service is provided on an "as is" and "as available" basis. To the maximum extent permitted by law, we
            disclaim warranties and limit liability for indirect or consequential damages.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">Changes and Contact</h2>
          <p className="text-[hsl(var(--color-text-secondary))]">
            We may update these terms from time to time. Questions: <a className="underline" href="mailto:support@seldonframe.com">support@seldonframe.com</a>
          </p>
        </section>
      </div>
    </main>
  );
}
