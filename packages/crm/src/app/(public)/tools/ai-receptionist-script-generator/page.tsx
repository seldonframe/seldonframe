// /tools/ai-receptionist-script-generator — free tool (the PostPlanify
// free-tools SEO motion): server-rendered GEO copy + FAQ around a small client
// template generator island. The generated call script IS a live demo of what
// SeldonFrame deploys onto a real phone number or web chat. Additive: no DB, no
// AI calls — pure client-side string composition from the operator's inputs.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { AiReceptionistScriptGenerator } from "@/components/seo/ai-receptionist-script-generator";
import { buildOgUrl } from "@/lib/seo/og-card";

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const TITLE = "AI Receptionist Script Generator — free, no signup";
const DESCRIPTION =
  "Free AI receptionist script generator: pick your business type, hours, and goal, and get a complete call script — greeting, qualifying questions, booking, objection handling, and after-hours fallback — that you can copy, edit, and deploy.";

const OG_URL = buildOgUrl({ kind: "tool", name: "AI Receptionist Script Generator", hook: "A complete call script for any business in seconds" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/ai-receptionist-script-generator" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/ai-receptionist-script-generator", type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

// FAQ strings render via dangerouslySetInnerHTML (inline <strong> only).
// INVARIANT: keep these literal constants — never interpolate user/dynamic input.
const FAQ = [
  {
    q: "Is this script ready to put on a live phone line as-is?",
    a: "Treat it as a strong <strong>starting template</strong>, not a finished agent. A production receptionist also needs to be grounded in your real services and prices, forced to read details back for confirmation, and wrapped in guardrails so it never invents an answer or over-promises. That reliability layer is exactly what SeldonFrame adds — the script is the skeleton, not the whole thing.",
  },
  {
    q: "Does this tool use AI to write the script?",
    a: "No. The whole script is assembled in your browser from a proven call structure and the details you enter — <strong>no AI model and no network calls</strong>. It's deterministic: the same inputs always produce the same script, so you can trust exactly what it says.",
  },
  {
    q: "How do I turn this script into a real AI receptionist?",
    a: "Deploy it as an actual agent on a phone number or web chat. In SeldonFrame you point the agent at your booking calendar and CRM, ground it in your services, and it answers calls 24/7 — booking, capturing leads, and texting back after hours. You can <strong>build your first workspace free</strong> and paste this script straight in as the starting point.",
  },
];

export default function AiReceptionistScriptGeneratorPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>AI receptionist script generator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          AI Receptionist Script Generator
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          Describe your business and get a complete AI receptionist call script — greeting,
          qualifying questions, booking, objection handling, and an after-hours fallback. Copy it,
          edit it, then make it real on a live phone number or web chat.
        </p>
        <AiReceptionistScriptGenerator />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>What's in the script</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            <li>A <strong>greeting and identity</strong> that honestly names the agent as a virtual assistant</li>
            <li>Three to four <strong>qualifying questions tailored to your business type</strong> — the ones a good front desk actually asks</li>
            <li>A <strong>booking, lead-capture, or FAQ handoff</strong> step matched to your primary goal</li>
            <li>A calm <strong>"just looking" / objection handle</strong> that still captures the contact</li>
            <li>An <strong>after-hours fallback</strong> — text back, take a message, or book anyway</li>
          </ul>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>A template, not a finished agent</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            This script is a genuinely good skeleton, but a script alone isn't a reliable
            receptionist. On a live line it needs to be <strong>grounded</strong> in your real
            services and prices, made to <strong>read details back</strong> before it commits to
            anything, and fenced with <strong>guardrails</strong> so it never guesses or
            over-promises. SeldonFrame adds that reliability layer — and connects the agent to your
            calendar and CRM so a booking on the call becomes a real appointment.
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
            Explore more{" "}
            <Link href="/tools" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              free tools
            </Link>
            , or see how a real{" "}
            <Link href="/ai-agents/ai-receptionist" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              AI receptionist
            </Link>{" "}
            answers every call for you.
          </p>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
