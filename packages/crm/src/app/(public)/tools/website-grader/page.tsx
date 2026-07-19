// /tools/website-grader — the flagship free tool: the Local Business Website
// Grader. Server-rendered SEO copy + FAQ around a client-side island that
// POSTs a URL to /api/tools/website-grader, which fetches it server-side
// (through the SSRF guard) and grades it on the 10 signals that actually
// win/lose jobs for a local service business.
//
// HONESTY (house rule never-lies): we fetch the page fresh on every grade and
// never persist the URL or its content — the FAQ says so explicitly.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { WebsiteGrader } from "@/components/seo/website-grader";
import { AuthorByline, articleLd } from "@/components/seo/author-byline";
import { buildOgUrl } from "@/lib/seo/og-card";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const TITLE = "Website Grader — free local business website scorecard";
const DESCRIPTION =
  "Free website grader for local service businesses: paste your URL and get a 0-100 score on the 10 things that actually win or lose jobs — click-to-call, booking, forms, schema, and more — with a plain-English fix for each.";

const OG_URL = buildOgUrl({ kind: "tool", name: "Website Grader", hook: "Does your site actually win jobs?" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/website-grader" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/website-grader", type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

const CHECKS_COPY: Array<{ label: string; blurb: string }> = [
  { label: "HTTPS", blurb: "your site is served securely, with http traffic redirected to https" },
  { label: "Click-to-call", blurb: "a tel: link lets a visitor call you in one tap on mobile" },
  { label: "Online booking", blurb: "a Book Now / Schedule link so leads can grab a slot after hours" },
  { label: "Lead form", blurb: "a way to submit contact info without calling" },
  { label: "Title & meta description", blurb: "the headline and blurb Google shows in search results" },
  { label: "Mobile viewport", blurb: "your layout renders correctly on a phone, not shrunk desktop" },
  { label: "LocalBusiness schema", blurb: "structured data that powers the Google map-pack card" },
  { label: "One H1", blurb: "a single clear heading stating what the page is about" },
  { label: "Image alt text", blurb: "job photos are readable by screen readers and search engines" },
  { label: "Response time", blurb: "a single-sample estimate of how fast the page responded" },
];

// FAQ strings render via dangerouslySetInnerHTML (inline <strong> only).
// INVARIANT: keep these literal constants — never interpolate user/dynamic input.
const FAQ = [
  {
    q: "What does the website grader check?",
    a: "Ten signals that actually move the needle for a local service business: <strong>HTTPS</strong>, a tappable phone number (<strong>click-to-call</strong>), <strong>online booking</strong>, a <strong>lead form</strong>, your <strong>title and meta description</strong>, a <strong>mobile viewport</strong> tag, <strong>LocalBusiness schema</strong>, exactly one <strong>H1</strong>, <strong>image alt text</strong> coverage, and a rough <strong>response time</strong>. Each one is weighted into a 0-100 score.",
  },
  {
    q: "Is the website grader free?",
    a: "Yes — no signup, no credit card. Paste a URL and get your score.",
  },
  {
    q: "Do you store my URL or my website's content?",
    a: "No. We fetch your page fresh, server-side, grade it in memory, and return the result — nothing is written to a database. Every grade is a clean read.",
  },
  {
    q: "Why do these 10 checks matter?",
    a: "Each one maps to a real way local businesses lose jobs: no click-to-call loses phone leads, no booking link loses after-hours leads, a missing lead form loses people who'd rather type than talk, missing schema means Google can't confidently show your hours and address, and a slow or unreadable mobile page just gets abandoned. These aren't vanity SEO checks — they're the mechanics of turning a visitor into a booked job.",
  },
  {
    q: "My score is low. Now what?",
    a: "Each failing or warning check comes with a plain-English fix you (or your web person) can make directly. Or skip the manual work entirely: SeldonFrame rebuilds your site with all 10 checks passing — booking, forms, and schema included — in about 3 minutes.",
  },
];

export default function WebsiteGraderPage(): ReactElement {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: stripHtml(f.a) } })),
  };
  const articleSchema = articleLd({
    headline: TITLE,
    description: DESCRIPTION,
    canonicalPath: "/tools/website-grader",
    dateModified: "2026-07-09",
  });
  const ungatedBuildEnabled = isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: process.env.SF_WEB_UNGATED_BUILD });

  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <MarketplaceNav />
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "34px 32px 70px", width: "100%" }}>
        <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 6, fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.5)", marginBottom: 20 }}>
          <Link href="/tools" className="sf-link" style={{ color: "rgba(34,29,23,0.55)", textDecoration: "none" }}>
            Free tools
          </Link>
          <span style={{ color: "rgba(34,29,23,0.3)" }}>/</span>
          <span style={{ color: "rgba(34,29,23,0.7)" }}>Website grader</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 720 }}>
          Does your website actually win jobs?
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 680 }}>
          Paste your business website below. We fetch it live and grade it 0-100 on the 10 things that turn a visitor
          into a booked job — click-to-call, online booking, a lead form, and more — with a plain-English fix for
          every gap. No signup needed.
        </p>
        <WebsiteGrader ungatedBuildEnabled={ungatedBuildEnabled} />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>What we check</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            {CHECKS_COPY.map((c) => (
              <li key={c.label}>
                <strong>{c.label}</strong> — {c.blurb}
              </li>
            ))}
          </ul>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
            What a good local business website has
          </h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            The best local sites make it embarrassingly easy to become a lead: a phone number you can tap, a booking
            link that works at midnight, a short form for people who'd rather type, and clean structured data so
            Google shows your hours and address with confidence. Everything else — animations, stock photography,
            clever copy — matters far less than these mechanics.
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
          <AuthorByline checked="July 2026" />
          <p style={{ margin: "22px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
            More free tools:{" "}
            <Link href="/tools/booking-friction-grader" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              booking friction grader
            </Link>
            ,{" "}
            <Link href="/tools/ai-visibility-checker" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              AI visibility checker
            </Link>
            , and the{" "}
            <Link href="/tools/missed-call-calculator" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              missed call calculator
            </Link>
            . Or{" "}
            <Link href="/tools" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              browse all free tools
            </Link>
            .
          </p>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
