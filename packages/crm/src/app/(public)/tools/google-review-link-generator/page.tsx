// /tools/google-review-link-generator — free tool (the PostPlanify free-tools
// SEO motion): server-rendered GEO copy + FAQ around a small client link/QR
// generator island. Additive: no DB, no network calls except the third-party
// QR image.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { GoogleReviewLinkGenerator } from "@/components/seo/google-review-link-generator";

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const TITLE = "Google Review Link Generator — free direct review link + QR code";
const DESCRIPTION =
  "Free Google review link generator: turn your Place ID or Maps URL into a direct write-a-review link and a printable QR code, in seconds — no signup required.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/google-review-link-generator" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/google-review-link-generator", type: "website" },
};

// FAQ strings render via dangerouslySetInnerHTML (inline <strong> only).
// INVARIANT: keep these literal constants — never interpolate user/dynamic input.
const FAQ = [
  {
    q: "What is a Google review link?",
    a: "It's a direct link that opens the \"Write a review\" box for your business on Google. No searching needed. Format: https://search.google.com/local/writereview?placeid=YOUR_PLACE_ID.",
  },
  {
    q: "How do I find my Google Place ID?",
    a: "Use Google's free Place ID Finder tool. Search your business name and address, and the Place ID shows up under the map. You can also copy it from some Google Maps share links.",
  },
  {
    q: "Is this tool free and does it store my data?",
    a: "Yes. It's <strong>completely free</strong> and runs in your browser. Nothing you type is sent to or stored by SeldonFrame. The QR code image comes from a free third-party service (api.qrserver.com).",
  },
  {
    q: "Where should I put my review link or QR code?",
    a: "The best spots: a text or email right after service, a receipt or invoice footer, a table tent or counter sign (QR code), and your email signature.",
  },
  {
    q: "Why aren't customers leaving reviews even when I ask?",
    a: "Friction is the biggest killer. If someone has to search for your business, find it, then tap through to the review box, most give up. A direct link or QR code removes every one of those steps.",
  },
  {
    q: "Can I use this for Facebook or Yelp too?",
    a: "This tool is built for Google review links, since Google is the most-searched review site for local businesses. Facebook and Yelp each have their own direct review link formats you can build the same way.",
  },
];

export default function GoogleReviewLinkGeneratorPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>Google review link generator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          Google Review Link Generator
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          Turn your Google Business Profile into a one-tap review link and a printable QR code. Paste your Place ID or
          Maps URL below. Nothing leaves your browser.
        </p>
        <GoogleReviewLinkGenerator />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>How it works</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            <li>Every business on Google Maps has a unique <strong>Place ID</strong></li>
            <li>Google supports a direct link that opens the "Write a review" box for your exact business — no searching needed</li>
            <li>This tool builds that link for you and turns it into a scannable <strong>QR code</strong></li>
            <li>Asking for a review goes from five taps to <strong>one</strong></li>
          </ul>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Why it matters</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            Reviews compound. More recent <strong>5-star reviews</strong> help your ranking and conversion on Google. The
            biggest lever isn't asking more — it's <strong>removing friction</strong> from the ask. A direct link or a QR
            code on a receipt turns a 2-minute chore into a <strong>10-second tap</strong>.
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
            <Link href="/tools/review-response-generator" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              write a review response
            </Link>{" "}
            or{" "}
            <Link href="/tools/missed-call-calculator" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              calculate missed-call cost
            </Link>
            . Once the reviews start coming in, see{" "}
            <Link href="/best/ai-receptionist-for-small-business" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              the best AI receptionist for small business
            </Link>{" "}
            to make sure every one of those new callers gets answered too.
          </p>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
