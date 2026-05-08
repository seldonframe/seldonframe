// /terms — terms of service.
// v1.31.3 — minimum-viable TOS so the footer link doesn't 404.
// Plain English; no boilerplate disguising what we actually require.
// Replace with a lawyer-reviewed full TOS before scaling beyond
// launch-week traffic.

import type { Metadata } from "next";
import { MarketingShell } from "../marketing-shell";

export const metadata: Metadata = {
  title: "Terms — SeldonFrame",
  description: "Terms of service for using SeldonFrame.",
};

export default function TermsPage() {
  return (
    <MarketingShell>
      <article className="max-w-[720px] mx-auto px-5 md:px-12 py-16 md:py-24">
        <header className="mb-10">
          <p className="text-[12px] uppercase tracking-[0.12em] text-[#71717a] font-mono mb-3">Last updated · May 7, 2026</p>
          <h1 className="text-[clamp(30px,4vw,46px)] font-bold tracking-[-0.035em] text-[#fafafa] mb-4 leading-[1.1]">
            Terms of Service
          </h1>
          <p className="text-[16px] text-[#a1a1aa] leading-[1.7]">
            By signing up for SeldonFrame, you agree to these terms.
            They&apos;re short on purpose. Email{" "}
            <a href="mailto:hello@seldonframe.com" className="text-[#1FAE85] hover:underline">hello@seldonframe.com</a>{" "}
            if anything is unclear.
          </p>
        </header>

        <div className="marketing-prose">
          <h2>Your account</h2>
          <p>
            You&apos;re responsible for keeping your login credentials
            secure and for everything that happens under your account.
            Don&apos;t share your account with people who shouldn&apos;t have
            access. If you suspect unauthorized access, email{" "}
            <a href="mailto:security@seldonframe.com">security@seldonframe.com</a>.
          </p>

          <h2>What you can use SeldonFrame for</h2>
          <p>
            Run your own legitimate business operations or your
            clients&apos;. Build websites, CRMs, agents, automations,
            booking flows, customer portals — anything within the
            product&apos;s capabilities. Both for-profit and non-profit
            uses are fine.
          </p>

          <h2>What you can&apos;t use it for</h2>
          <ul>
            <li>Building products that send unsolicited bulk email or SMS (spam).</li>
            <li>Hosting illegal content or operations (varies by jurisdiction; if it&apos;s illegal where you operate, don&apos;t).</li>
            <li>Building agents intended to deceive end-users about being human (regulatory rules vary by jurisdiction; comply with your local AI-disclosure laws).</li>
            <li>Reverse-engineering, scraping, or attempting to bypass rate limits or eval-gate protections.</li>
            <li>Reselling SeldonFrame access to third parties as &quot;your own platform&quot; without an Agency-tier subscription.</li>
          </ul>
          <p>
            We may suspend or terminate accounts that violate these
            rules. We&apos;ll email you first when possible.
          </p>

          <h2>Your data, your code, your keys</h2>
          <p>
            Workspace data is yours. You can export it anytime from{" "}
            <a href="/settings">Settings → Export</a>. The SeldonFrame
            source code is open source under the MIT License — you can
            self-host, fork, modify. Your LLM provider keys are yours;
            we never share them with anyone, including the LLM provider
            themselves (your key authenticates directly to them).
          </p>

          <h2>Billing</h2>
          <p>
            Hobby tier is free. Paid tiers (Pro, Agency) are billed
            monthly through Stripe. Cancel anytime from{" "}
            <a href="/settings">Settings → Billing</a> — you drop to
            Hobby at the end of the current period, no proration of
            unused time. Failed payments retry 3 times over 7 days; if
            none succeed, the account moves to a 7-day grace period
            (read-only); after that, paused.
          </p>

          <h2>Service level</h2>
          <p>
            We aim for 99.9% uptime on the production app and the
            *.app.seldonframe.com workspace subdomains. We don&apos;t
            currently offer formal SLAs except on the Agency tier
            (separate written agreement). Status, incidents, and
            scheduled maintenance are posted at{" "}
            <a href="https://status.seldonframe.com" target="_blank" rel="noopener noreferrer">status.seldonframe.com</a>.
          </p>

          <h2>Liability</h2>
          <p>
            SeldonFrame is provided &quot;as is.&quot; We work hard to make
            it reliable, but we can&apos;t promise it&apos;s bug-free or that
            your agents will behave perfectly in every situation. Our
            liability for any claim is limited to the fees you paid
            us in the 12 months preceding the claim. You&apos;re responsible
            for the actions of agents you publish — set the eval-gate
            threshold appropriately for the stakes of your domain.
          </p>

          <h2>Changes</h2>
          <p>
            We may update these terms. If anything changes materially,
            we&apos;ll email you and update the date at the top. Continued
            use after a change means you accept the new version.
          </p>

          <h2>Contact</h2>
          <p>
            <a href="mailto:hello@seldonframe.com">hello@seldonframe.com</a>{" "}
            for general questions or concerns about these terms.
          </p>
        </div>
      </article>
    </MarketingShell>
  );
}
