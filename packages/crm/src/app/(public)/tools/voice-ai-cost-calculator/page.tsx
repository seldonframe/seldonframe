// /tools/voice-ai-cost-calculator — free tool (the PostPlanify free-tools
// SEO motion): server-rendered GEO copy + FAQ around a small client
// cost-comparison island. Additive: no DB.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { VoiceAiCostCalculator } from "@/components/seo/voice-ai-cost-calculator";
import { BuildWidget } from "@/components/seo/build-widget";
import { ChatGptCtaCard } from "@/components/seo/chatgpt-cta";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";
import { buildOgUrl } from "@/lib/seo/og-card";
import { getCompetitorPricing } from "@/lib/seo/competitor-pricing";

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const VAPI = getCompetitorPricing("vapi");

const TITLE = "Voice AI Cost Per Minute Calculator — the real AI phone agent cost";
const DESCRIPTION =
  "Free calculator: see the real per-minute cost of an AI phone agent — speech-to-text, LLM, text-to-speech, platform fee, and telephony stacked up — not just the advertised headline rate.";

const OG_URL = buildOgUrl({ kind: "tool", name: "Voice AI Cost Calculator", hook: "The $0.05/min rate is never the real rate" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/voice-ai-cost-calculator" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/voice-ai-cost-calculator", type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

// FAQ strings render via dangerouslySetInnerHTML (inline <strong> only).
// INVARIANT: keep these literal constants — never interpolate user/dynamic input.
const FAQ = [
  {
    q: "Why is the real voice AI cost per minute higher than the advertised rate?",
    a: "Most voice AI platforms advertise only their own hosting/platform fee — <strong>often around $0.05/min</strong> — but a real call also needs speech-to-text, an LLM, text-to-speech, and telephony, each billed separately. Stacked together, the real all-in rate commonly lands around <strong>$0.10-$0.30+/min</strong> depending on the models and provider you pick.",
  },
  {
    q: "What are the components of AI phone agent cost per minute?",
    a: "Five pieces typically stack per minute: <strong>speech-to-text</strong> (turning the caller's voice into text), the <strong>LLM</strong> (generating the response), <strong>text-to-speech</strong> (turning the response back into voice), the <strong>platform fee</strong> (the vendor's own cut), and <strong>telephony</strong> (the phone number and carrier minutes).",
  },
  {
    q: "Does the LLM model choice change the cost a lot?",
    a: "Yes — it's usually the single biggest swing factor. Reported LLM costs for voice range roughly <strong>$0.045-$0.16/min</strong> depending on which model you pick, more than a 3x spread on its own.",
  },
  {
    q: "Is a cheaper advertised rate always a worse deal?",
    a: "Not necessarily, but it's rarely the whole story. Always ask what's included in the advertised number — hosting-only rates look great until you add up the model, voice, and telephony costs that bill separately.",
  },
  {
    q: "How do I lower my AI phone agent's real cost per minute?",
    a: "Bring your own AI provider and telephony keys where possible so you pay each provider at raw cost instead of a marked-up bundle, and choose a smaller/cheaper LLM for simple calls. See our honest <a href=\"/compare/seldonframe-vs-vapi\">SeldonFrame vs Vapi</a> comparison and the full <a href=\"/vapi-pricing\">Vapi pricing breakdown</a> for what a flat-rate, bring-your-own-keys alternative looks like.",
  },
];

export default function VoiceAiCostCalculatorPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>Voice AI cost calculator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          Voice AI Cost Per Minute Calculator
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          The advertised rate is never the real rate. See the full stack — speech-to-text, LLM, text-to-speech,
          platform fee, telephony — and what it adds up to for your call volume.
        </p>
        <VoiceAiCostCalculator />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>How it works</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            This calculator breaks a voice AI call into its real cost components, using each platform's
            published/reported rates:
          </p>
          <ul style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            <li><strong>Speech-to-text</strong> — turning the caller's voice into text</li>
            <li><strong>LLM</strong> — generating the agent's response</li>
            <li><strong>Text-to-speech</strong> — turning the response back into voice</li>
            <li><strong>Platform fee</strong> — the vendor's own hosting cut</li>
            <li><strong>Telephony</strong> — the phone number and carrier minutes (optional toggle)</li>
          </ul>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            Stack them up and you get the real per-minute rate — usually well above the number on the pricing page.
          </p>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Why it matters</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            A platform advertising <strong>{VAPI.stacks[0]?.detail.match(/\$[\d.]+\/min/)?.[0] ?? "$0.05/min"}</strong> is
            usually only quoting its own hosting fee. The model, voice, and telephony providers all bill separately —
            budgeting off the headline number alone means underestimating your real bill.
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
            Source:{" "}
            <a href={VAPI.pricingUrl} target="_blank" rel="noopener noreferrer" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              Vapi's official pricing page
            </a>{" "}
            (verified {VAPI.verified}). Related:{" "}
            <Link href="/tools/ai-receptionist-cost-calculator" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              AI receptionist cost calculator
            </Link>
            ,{" "}
            <Link href="/vapi-pricing" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              full Vapi pricing breakdown
            </Link>
            , and{" "}
            <Link href="/compare/seldonframe-vs-vapi" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              SeldonFrame vs Vapi
            </Link>
            . Zoom out: see the full market on one chart —{" "}
            <Link href="/charts/crm-pricing-index" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              CRM Pricing Index →
            </Link>
          </p>
        </section>

        <BuildWidget ungatedBuildEnabled={isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: process.env.SF_WEB_UNGATED_BUILD })} />
        <ChatGptCtaCard />
      </main>
      <MarketplaceFooter />
    </div>
  );
}
