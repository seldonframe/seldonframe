// /tools/a2p-10dlc-checker — free tool (the PostPlanify free-tools SEO
// motion): server-rendered GEO copy + FAQ around a small client compliance
// quiz island. Additive: no DB.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { A2p10dlcChecker } from "@/components/seo/a2p-10dlc-checker";

const TITLE = "A2P 10DLC Compliance Checker — free readiness quiz";
const DESCRIPTION =
  "Free A2P 10DLC compliance checker: answer 9 quick questions about your business texting setup and get a readiness score plus practical fixes for every gap.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/a2p-10dlc-checker" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/a2p-10dlc-checker", type: "website" },
};

const FAQ = [
  {
    q: "What is A2P 10DLC?",
    a: "Application-to-Person messaging on 10-digit long code numbers. It's the framework US carriers require for businesses sending text messages from regular local numbers, involving Brand and Campaign registration with The Campaign Registry.",
  },
  {
    q: "What happens if I text without registering?",
    a: "Unregistered A2P traffic on 10DLC numbers is now heavily filtered or blocked outright by major US carriers. Messages may silently fail to deliver, and providers like Twilio increasingly require registration before allowing sustained messaging traffic.",
  },
  {
    q: "Can a sole proprietorship register for 10DLC?",
    a: "Yes, there's a sole-proprietor registration path, but it comes with lower throughput limits and more restricted use cases than an EIN-registered business. If texting volume matters to you, registering as a proper business entity pays off.",
  },
  {
    q: "What opt-in language do I actually need?",
    a: "Your consent flow should name your business, state approximate message frequency, include \"message and data rates may apply,\" and explain how to reply STOP to opt out or HELP for support. Missing any of these is a common cause of campaign rejection.",
  },
  {
    q: "How long does registration take?",
    a: "Brand registration is often near-instant to a few business days. Campaign approval timelines vary by use case and provider — plan for anywhere from same-day to a couple of weeks, especially for higher-risk categories.",
  },
  {
    q: "Is this checker legal advice?",
    a: "No — it's educational information to help you self-assess common gaps. 10DLC requirements evolve regularly; always confirm current rules with your messaging provider (e.g. Twilio) before registering.",
  },
];

export default function A2p10dlcCheckerPage(): ReactElement {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <MarketplaceNav />
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "34px 32px 70px", width: "100%" }}>
        <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 6, fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.5)", marginBottom: 20 }}>
          <Link href="/tools" className="sf-link" style={{ color: "rgba(34,29,23,0.55)", textDecoration: "none" }}>
            Free tools
          </Link>
          <span style={{ color: "rgba(34,29,23,0.3)" }}>/</span>
          <span style={{ color: "rgba(34,29,23,0.7)" }}>A2P 10DLC compliance checker</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          A2P 10DLC Compliance Checker
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          Nine quick yes/no questions about your business texting setup. Get a readiness score and a concrete fix-it list
          for every gap — no signup required.
        </p>
        <A2p10dlcChecker />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>How it works</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            Answer each question about your Brand and Campaign registration, opt-in practices, and content policies. The
            checker scores your answers and flags every "no" or "not sure" with a plain-English explanation of why it
            matters and what to do next.
          </p>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Why it matters</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            Carriers actively filter and throttle unregistered or non-compliant A2P traffic — meaning appointment
            reminders, review requests, and lead follow-up texts can silently fail to deliver. A few minutes of
            registration work up front avoids messages that quietly never arrive.
          </p>
        </section>

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
          {FAQ.map((f) => (
            <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{f.q}</summary>
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }}>{f.a}</p>
            </details>
          ))}
          <p style={{ margin: "22px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
            More free tools:{" "}
            <Link href="/tools/ai-receptionist-cost-calculator" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              AI receptionist cost calculator
            </Link>
            . See how SeldonFrame compares on{" "}
            <Link href="/alternatives" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              the alternatives page
            </Link>
            .
          </p>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
