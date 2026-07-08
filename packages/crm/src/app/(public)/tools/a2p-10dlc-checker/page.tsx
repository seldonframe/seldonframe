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

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

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
    a: "It stands for Application-to-Person messaging on 10-digit long code numbers. US carriers require it for businesses texting from regular local numbers. It means registering a <strong>Brand</strong> and a <strong>Campaign</strong> with The Campaign Registry.",
  },
  {
    q: "What happens if I text without registering?",
    a: "Carriers now heavily filter or block unregistered texts. Your messages can silently fail to deliver, and providers like Twilio increasingly require registration before you can send at all.",
  },
  {
    q: "Can a sole proprietorship register for 10DLC?",
    a: "Yes. But sole-proprietor registration comes with <strong>lower throughput limits</strong> and more restricted use cases than a business registered with an EIN. If you text a lot, registering as a proper business pays off.",
  },
  {
    q: "What opt-in language do I actually need?",
    a: "Your consent flow needs to: name your business, state roughly how often you'll text, include \"<strong>message and data rates may apply</strong>,\" and explain how to reply STOP or HELP. Missing any of these is a common reason campaigns get rejected.",
  },
  {
    q: "How long does registration take?",
    a: "Brand registration is often near-instant to a few business days. Campaign approval varies — plan for anywhere from same-day to a couple of weeks, especially for higher-risk categories.",
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
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: stripHtml(f.a) } })),
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
          Nine quick yes/no questions about your texting setup. Get a readiness score and a clear fix-it list for every
          gap. No signup needed.
        </p>
        <A2p10dlcChecker />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>How it works</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            <li>Answer questions about your <strong>Brand</strong> and <strong>Campaign</strong> registration, opt-in practices, and content rules</li>
            <li>The checker scores your answers</li>
            <li>Every "no" or "not sure" gets a plain-English explanation of why it matters and what to do</li>
          </ul>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Why it matters</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            Carriers actively filter and block unregistered texts. That means your <strong>appointment reminders</strong>,
            <strong> review requests</strong>, and <strong>follow-up texts</strong> can silently fail to arrive. A few
            minutes of registration up front stops that from happening.
          </p>
        </section>

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
          {FAQ.map((f) => (
            <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{f.q}</summary>
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }} dangerouslySetInnerHTML={{ __html: f.a }} />
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
