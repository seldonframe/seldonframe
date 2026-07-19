// /tools/ai-visibility-checker — free tool (the PostPlanify free-tools SEO
// motion): server-rendered GEO copy + FAQ around a client-side AI-visibility
// scorecard + prompt-generator island. Additive: no DB, no LLM calls.
//
// HONESTY (house rule never-lies): this page never claims we queried
// ChatGPT/Google/Perplexity or scanned the web. Part A is a self-assessment;
// Part B hands the user prompts to run themselves. Keep that explicit in copy.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { AiVisibilityChecker } from "@/components/seo/ai-visibility-checker";
import { buildOgUrl } from "@/lib/seo/og-card";

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const TITLE = "AI Visibility Checker — can ChatGPT recommend your business?";
const DESCRIPTION =
  "Free AI visibility checker: grade whether ChatGPT, Google's AI, and Perplexity can recommend your business, get a prioritized GEO fix list, then copy exact prompts to test your real visibility yourself.";

const OG_URL = buildOgUrl({ kind: "tool", name: "AI Visibility Checker", hook: "Can ChatGPT recommend your business?" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/ai-visibility-checker" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/ai-visibility-checker", type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

// FAQ strings render via dangerouslySetInnerHTML (inline <strong> only).
// INVARIANT: keep these literal constants — never interpolate user/dynamic input.
const FAQ = [
  {
    q: "What is GEO / AEO?",
    a: "GEO (generative engine optimization), sometimes called AEO (answer engine optimization), is making your business easy for AI assistants like <strong>ChatGPT</strong>, <strong>Google's AI Overviews</strong>, and <strong>Perplexity</strong> to understand and recommend. Instead of ranking on a page of blue links, you're trying to be the business the model names in its answer.",
  },
  {
    q: "How do I get cited by AI?",
    a: "Give models clear, verifiable facts about you: a complete Google Business Profile, plenty of recent reviews, consistent name/address/phone everywhere, plain-text answers to common questions, structured data (schema), and presence on third-party 'best {type} in {city}' lists. Generative engines synthesize answers from these public signals — the more consistent and machine-readable they are, the more confidently a model will name you.",
  },
  {
    q: "Does this tool actually query ChatGPT or Google?",
    a: "No. This is important: the scorecard is a <strong>self-assessment</strong> — it grades the answers you select, and we do not call any AI model or scan the web or your site. Part B then generates the exact prompts for you to paste into ChatGPT, Perplexity, or Google AI <strong>yourself</strong>, so you can see your real visibility firsthand. We hand you the ruler; we never claim to have measured for you.",
  },
];

export default function AiVisibilityCheckerPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>AI visibility checker</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 720 }}>
          Can ChatGPT recommend your business?
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 680 }}>
          Grade your AI visibility against the signals ChatGPT, Google's AI, and Perplexity use to decide who to cite —
          then copy exact prompts to test your real visibility yourself. It's a self-assessment: we never query any AI
          model or scan the web. No signup needed.
        </p>
        <AiVisibilityChecker />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>How it works</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            <li><strong>Part A — scorecard:</strong> answer eight questions about your visibility signals; the tool weights and grades them (0–100 + a letter)</li>
            <li>Every gap becomes a prioritized fix with one line on <strong>why generative engines lean on that signal</strong></li>
            <li><strong>Part B — test it yourself:</strong> enter your business type and city to generate exact prompts, each with a copy button, to paste into ChatGPT / Perplexity / Google AI</li>
            <li>Honest by design: no AI model is called here, and nothing is scanned — you run the prompts and see your real visibility firsthand</li>
          </ul>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Why AI visibility matters</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            More customers now ask an assistant "who's the <strong>best {"{type}"} in {"{city}"}</strong>?" instead of
            scrolling search results. If ChatGPT, Google's AI Overviews, or Perplexity can't find clear, consistent facts
            about you, they recommend a competitor by default. GEO is about being the business the model is confident
            enough to name.
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
            <Link href="/tools" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              browse all free tools
            </Link>
            . Or see our pick for the{" "}
            <Link href="/best/ai-agent-for-small-business" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              best AI agent for small business
            </Link>
            . Want the industry-wide version of this? See what AI recommends across 10 buyer questions on the{" "}
            <Link href="/charts/ai-recommendation-index" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              AI Recommendation Index
            </Link>
            . And if it's your whole site that needs a check, try the{" "}
            <Link href="/tools/website-grader" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              website grader
            </Link>
            .
          </p>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
