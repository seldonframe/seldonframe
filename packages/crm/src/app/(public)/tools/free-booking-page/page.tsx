// /tools/free-booking-page — free tool (the PostPlanify free-tools SEO
// motion): pure landing surface over the shipped cal.diy booking product that
// ships inside every free workspace. No new product code — this markets the
// same install_caldiy_booking flow already live.
//
// HONESTY (house rule never-lies): reminders ship as email by default; SMS
// reminders require the workspace to have a connected phone number, so we
// never claim SMS "just works" out of the box. Calendly/HubSpot free-tier
// facts are hedged ("as listed", "~") since competitor pricing pages change.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { AuthorByline, articleLd } from "@/components/seo/author-byline";
import { BuildWidget } from "@/components/seo/build-widget";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";
import { buildOgUrl } from "@/lib/seo/og-card";

/** FAQ answers use a few <strong>/<a> tags for readability; JSON-LD wants
 *  plain text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const TITLE = "Free Booking Page for Small Business — live in 3 minutes";
const DESCRIPTION =
  "Get a free online booking page for your small business: your own subdomain, appointment types, an intake form, and CRM sync — live in about 3 minutes. A Calendly alternative that comes with the CRM already built in.";
const CANONICAL = "/tools/free-booking-page";

const OG_URL = buildOgUrl({ kind: "tool", name: "Free Booking Page", hook: "A booking page, live in 3 minutes — free." });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: { title: TITLE, description: DESCRIPTION, url: CANONICAL, type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

// FAQ strings render via dangerouslySetInnerHTML (inline <strong>/<a> only).
// INVARIANT: keep these literal constants — never interpolate user/dynamic input.
const FAQ = [
  {
    q: "Is the booking page really free?",
    a: "Yes. Your first workspace — booking page included — is <strong>free forever</strong>. $29/mo unlocks unlimited workspaces if you ever need more than one.",
  },
  {
    q: "Do reminders and confirmations work out of the box?",
    a: "Email reminders and confirmations are included from the start. <strong>SMS reminders need a connected phone number</strong> — once you connect one, text reminders turn on for the same bookings.",
  },
  {
    q: "Can customers book multiple appointment types?",
    a: "Yes. Set up as many appointment types as you offer — different durations, different services — and customers pick the right one when they book.",
  },
  {
    q: "Does it sync to a CRM?",
    a: "Yes, automatically. Every booking creates or updates a contact in your built-in CRM, so you're not copying names and numbers between two tools.",
  },
  {
    q: "How is this different from Calendly's free plan?",
    a: "Calendly's free plan is listed as one event type per user, with no CRM behind it. SeldonFrame's free booking page supports multiple appointment types and comes with a CRM and intake form already connected — see the full field-by-field breakdown on the <a href=\"/alternatives\">alternatives hub</a>.",
  },
  {
    q: "Can I use my own domain for booking?",
    a: "Your booking page starts on a free <code>&lt;yourbusiness&gt;.app.seldonframe.com</code> subdomain, and you can connect a custom domain you already own once you're ready.",
  },
];

const DATE_MODIFIED = "2026-07-09";

export default function FreeBookingPagePage(): ReactElement {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: stripHtml(f.a) } })),
  };
  const articleSchema = articleLd({
    headline: TITLE,
    description: DESCRIPTION,
    canonicalPath: CANONICAL,
    dateModified: DATE_MODIFIED,
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>Free booking page</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 720 }}>
          Get your free booking page in 3 minutes.
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 680 }}>
          A real online booking page on your own subdomain — appointment types, an intake form, and a CRM that files
          every booking automatically. Free to start,{" "}
          {ungatedBuildEnabled ? "no signup or credit card required to see it built." : "no credit card required to start."}
        </p>

        <BuildWidget ungatedBuildEnabled={ungatedBuildEnabled} heading="Get your booking page free" />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>What's included</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            <li>A <strong>booking page</strong> on your own <code>&lt;yourbusiness&gt;.app.seldonframe.com</code> subdomain</li>
            <li>As many <strong>appointment types</strong> as you offer, each with its own duration and details</li>
            <li><strong>Email reminders and confirmations</strong>, included from the start — <strong>SMS reminders</strong> turn on once you connect a phone number</li>
            <li>An <strong>intake form</strong> that collects what you need before the appointment</li>
            <li>Automatic <strong>CRM sync</strong> — every booking creates or updates a contact, no copy-paste</li>
          </ul>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Free booking pages, compared</h2>
          <p style={{ margin: "0 0 14px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            Hedged where a competitor's free-tier terms can change — check their pricing page for the current details
            before you decide.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 520 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${MKT.ink10}` }}>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Free plan</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700, color: MKT.green }}>SeldonFrame</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Calendly free</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>HubSpot Meetings free</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: `1px solid ${MKT.ink10}` }}>
                  <td style={{ padding: "10px 12px" }}>Appointment types</td>
                  <td style={{ padding: "10px 12px" }}>Multiple</td>
                  <td style={{ padding: "10px 12px" }}>~1 event type, as listed</td>
                  <td style={{ padding: "10px 12px" }}>1 meeting link, as listed</td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${MKT.ink10}` }}>
                  <td style={{ padding: "10px 12px" }}>CRM included</td>
                  <td style={{ padding: "10px 12px" }}>Yes, built in</td>
                  <td style={{ padding: "10px 12px" }}>No</td>
                  <td style={{ padding: "10px 12px" }}>Basic HubSpot free CRM</td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${MKT.ink10}` }}>
                  <td style={{ padding: "10px 12px" }}>Intake form</td>
                  <td style={{ padding: "10px 12px" }}>Yes, built in</td>
                  <td style={{ padding: "10px 12px" }}>Basic booking questions</td>
                  <td style={{ padding: "10px 12px" }}>Basic booking questions</td>
                </tr>
                <tr>
                  <td style={{ padding: "10px 12px" }}>Reminders</td>
                  <td style={{ padding: "10px 12px" }}>Email included, SMS with a connected number</td>
                  <td style={{ padding: "10px 12px" }}>Email, as listed</td>
                  <td style={{ padding: "10px 12px" }}>Email, as listed</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <AuthorByline checked="July 2026" />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
          {FAQ.map((f) => (
            <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{f.q}</summary>
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }} dangerouslySetInnerHTML={{ __html: f.a }} />
            </details>
          ))}
          <p style={{ margin: "22px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
            See what a no-show is really costing you with the{" "}
            <Link href="/tools/no-show-cost-calculator" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              No-Show Cost Calculator
            </Link>
            , grade your current setup with the{" "}
            <Link href="/tools/booking-friction-grader" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              Booking Friction Grader
            </Link>
            , or see our pick for the{" "}
            <Link href="/best/booking-system-for-small-business" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              best booking system for small business
            </Link>
            .
          </p>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
