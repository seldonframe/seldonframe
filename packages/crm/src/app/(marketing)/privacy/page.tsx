// /privacy — privacy notice.
// v1.31.3 — minimum-viable privacy notice so the footer link doesn't
// 404. Plain English; no boilerplate disguising what we actually do.
// Replace with a lawyer-reviewed full policy before scaling beyond
// launch-week traffic.

import type { Metadata } from "next";
import { MarketingShell } from "../marketing-shell";

export const metadata: Metadata = {
  title: "Privacy — SeldonFrame",
  description: "How SeldonFrame handles your data and your customers' data.",
};

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <article className="max-w-[720px] mx-auto px-5 md:px-12 py-16 md:py-24">
        <header className="mb-10">
          <p className="text-[12px] uppercase tracking-[0.12em] text-[#71717a] font-mono mb-3">Last updated · May 7, 2026</p>
          <h1 className="text-[clamp(30px,4vw,46px)] font-bold tracking-[-0.035em] text-[#fafafa] mb-4 leading-[1.1]">
            Privacy
          </h1>
          <p className="text-[16px] text-[#a1a1aa] leading-[1.7]">
            Plain English. What we collect, what we don&apos;t, and what we do
            with it. If anything is unclear, email{" "}
            <a href="mailto:hello@seldonframe.com" className="text-[#1FAE85] hover:underline">hello@seldonframe.com</a>.
          </p>
        </header>

        <div className="marketing-prose">
          <h2>What we collect</h2>
          <ul>
            <li>
              <strong>Account info</strong> — your name, email, hashed
              password (or OAuth identifier if you sign in with Google).
            </li>
            <li>
              <strong>Workspace data</strong> — everything you create in
              SeldonFrame: contacts, deals, bookings, agents, page
              content, automations, conversation transcripts.
            </li>
            <li>
              <strong>Usage telemetry</strong> — anonymous metrics
              (page views, feature usage, error rates). No third-party
              tracking pixels.
            </li>
          </ul>

          <h2>What we don&apos;t collect</h2>
          <ul>
            <li>Your LLM provider keys are encrypted at rest with a per-deployment key. We can&apos;t read them in plaintext.</li>
            <li>Your customers&apos; payment data — Stripe handles cards directly; we never see them.</li>
            <li>Browser fingerprints, behavioral ad-tech profiles, cross-site identifiers.</li>
          </ul>

          <h2>How we use it</h2>
          <p>
            Workspace data is yours. We use it only to operate the
            product: render your dashboard, run your agents, send
            emails on your behalf. We don&apos;t train models on it. We
            don&apos;t sell it. We don&apos;t aggregate it for analytics products.
          </p>
          <p>
            Account info is used to authenticate you and to email you
            about your account (security alerts, billing changes).
            Usage telemetry helps us debug and improve the product.
          </p>

          <h2>Where it lives</h2>
          <p>
            Database: Postgres on Neon (US-East). Backups: encrypted,
            7-day rolling. App: Vercel (US-East primary, global edge).
            File uploads: Vercel Blob. LLM calls: routed directly from
            our backend to your provider (Anthropic, OpenAI) using your
            key — provider data-handling policies apply for the
            content of those calls.
          </p>

          <h2>Sub-processors</h2>
          <p>
            We use the following third-party services to operate
            SeldonFrame: Vercel (hosting), Neon (database), Anthropic
            and OpenAI (LLM inference, via your keys), Stripe
            (payments), Resend (email), Twilio (SMS), Sentry (error
            tracking). Each has their own privacy notice; we hold each
            to a DPA where required.
          </p>

          <h2>Your rights</h2>
          <p>
            Export your data anytime from{" "}
            <a href="/settings">Settings → Export</a>. Delete your
            account from{" "}
            <a href="/settings">Settings → Account</a> — workspace data
            is purged within 30 days; backups roll off within 7 days
            of the next cycle. Email{" "}
            <a href="mailto:privacy@seldonframe.com">privacy@seldonframe.com</a>{" "}
            for any other request.
          </p>

          <h2>Changes</h2>
          <p>
            If we change anything material, we&apos;ll email you and post
            the change here. The current effective date is at the top
            of this page.
          </p>

          <h2>Contact</h2>
          <p>
            <a href="mailto:hello@seldonframe.com">hello@seldonframe.com</a>{" "}
            for general questions.{" "}
            <a href="mailto:privacy@seldonframe.com">privacy@seldonframe.com</a>{" "}
            for privacy-specific requests.
          </p>
        </div>
      </article>
    </MarketingShell>
  );
}
