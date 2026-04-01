import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | SeldonFrame",
  description: "Privacy Policy for SeldonFrame.",
};

export default function PolicyPage() {
  return (
    <main className="web-section py-16 text-foreground">
      <div className="web-container max-w-3xl space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-[hsl(var(--color-text-secondary))]">Last updated: April 1, 2026</p>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">Overview</h2>
          <p className="text-[hsl(var(--color-text-secondary))]">
            SeldonFrame provides software for business operations, including CRM, automation, booking, and related workflow
            features. This policy explains what information we collect, why we collect it, and how we handle it.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">Data We Collect</h2>
          <ul className="list-disc space-y-2 pl-6 text-[hsl(var(--color-text-secondary))]">
            <li>Account data such as name, email address, avatar, and authentication identifiers.</li>
            <li>Workspace data you create while using SeldonFrame.</li>
            <li>Operational and security logs needed to run and protect the service.</li>
            <li>Subscription and billing metadata, when applicable.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">Google OAuth Information</h2>
          <p className="text-[hsl(var(--color-text-secondary))]">
            If you sign in with Google, we receive profile information such as your name, email address, and profile image.
            We use this information only to authenticate your account and provide SeldonFrame functionality.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">How We Use Data</h2>
          <ul className="list-disc space-y-2 pl-6 text-[hsl(var(--color-text-secondary))]">
            <li>To authenticate users and provide core product features.</li>
            <li>To maintain, improve, and secure the platform.</li>
            <li>To communicate service updates and support information.</li>
            <li>To comply with legal obligations.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">Data Sharing</h2>
          <p className="text-[hsl(var(--color-text-secondary))]">
            We do not sell personal information. We may share data with infrastructure, email, and payment providers strictly
            as needed to operate SeldonFrame.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">Your Rights</h2>
          <p className="text-[hsl(var(--color-text-secondary))]">
            You can request access, correction, export, or deletion of your account data by contacting us at the email below.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium">Contact</h2>
          <p className="text-[hsl(var(--color-text-secondary))]">
            Privacy inquiries: <a className="underline" href="mailto:support@seldonframe.com">support@seldonframe.com</a>
          </p>
        </section>
      </div>
    </main>
  );
}
