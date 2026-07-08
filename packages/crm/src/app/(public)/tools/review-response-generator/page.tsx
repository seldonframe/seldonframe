// /tools/review-response-generator — free tool (the PostPlanify free-tools
// SEO motion): server-rendered GEO copy + FAQ around a small client template
// generator island. Additive: no DB, no AI calls — hand-written templates.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { ReviewResponseGenerator } from "@/components/seo/review-response-generator";

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const TITLE = "Google Review Response Generator — free, no signup";
const DESCRIPTION =
  "Free Google review response generator: pick a star rating and scenario, get a well-written response you can copy and post — no AI, no signup, just genuinely good templates.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/review-response-generator" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/review-response-generator", type: "website" },
};

const FAQ = [
  {
    q: "Should I respond to every Google review?",
    a: "Yes. Responding to both good and bad reviews shows future customers — and Google's ranking algorithm — that you're paying attention. A thoughtful reply to a negative review often builds <strong>more</strong> trust than having no negative reviews at all.",
  },
  {
    q: "How fast should I respond to a negative review?",
    a: "Aim for <strong>24-48 hours</strong>. A quick, calm response shows other readers you took it seriously, and gives the reviewer a chance to update their review once it's fixed.",
  },
  {
    q: "Should I argue with an unfair review in my response?",
    a: "No. Arguing in public rarely changes the reviewer's mind and looks bad to everyone else reading it. Say sorry for the experience without admitting fault, then move the conversation to phone or email.",
  },
  {
    q: "What if the review is fake or about the wrong business?",
    a: "Stay polite and factual: say you couldn't find a matching visit in your records, and invite them to reach out directly. You can also flag the review to Google if it clearly breaks their rules.",
  },
  {
    q: "Does this tool use AI to write responses?",
    a: "No. Every response comes from <strong>hand-written templates</strong> picked based on your star rating, scenario, and tone. Nothing is sent to a server or AI model — it all happens in your browser.",
  },
  {
    q: "Can I edit the generated response?",
    a: "Yes, and you should. Treat it as a strong first draft. Add specifics about what happened, then copy and paste it into Google.",
  },
];

export default function ReviewResponseGeneratorPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>Google review response generator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          Google Review Response Generator
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          Pick a star rating, a scenario, and a tone. Get a genuinely well-written response you can copy, tweak, and
          post. No AI, no signup.
        </p>
        <ReviewResponseGenerator />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>How it works</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            <li>Every rating and scenario has several <strong>hand-written</strong> response variants</li>
            <li>Good reviews get a genuine thank-you</li>
            <li>Complaints get an apology without admitting fault, a move to take the talk offline, and never an argument</li>
            <li>Click "Regenerate" to see another variant</li>
          </ul>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Why it matters</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            Most owners freeze up on negative reviews. They either ignore them or fire back defensively — both cost
            trust with future customers reading the thread. A <strong>calm, professional reply</strong> takes the sting
            out, and often matters more to buyers than the original complaint.
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
            Now go get more reviews to respond to:{" "}
            <Link href="/tools/google-review-link-generator" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              generate your review link
            </Link>
            . And make sure every caller gets answered too —{" "}
            <Link href="/best/ai-receptionist-for-small-business" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              the best AI receptionist for small business
            </Link>
            .
          </p>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
