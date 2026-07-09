// /tools/booking-friction-grader — free tool (the PostPlanify free-tools SEO
// motion): server-rendered GEO copy + FAQ around a small client-side scorecard
// island that grades how much friction stands between a customer and a booked
// appointment. Additive: no DB, no network.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { BookingFrictionGrader } from "@/components/seo/booking-friction-grader";
import { buildOgUrl } from "@/lib/seo/og-card";

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const TITLE = "Booking Friction Grader — free online booking scorecard";
const DESCRIPTION =
  "Free booking friction grader: answer 8 quick questions about how customers book with you and get a friction score, a letter grade, and a prioritized fix-it list for every booking leak.";

const OG_URL = buildOgUrl({ kind: "tool", name: "Booking Friction Grader", hook: "How much booking friction is costing you?" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/booking-friction-grader" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/booking-friction-grader", type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

// FAQ strings render via dangerouslySetInnerHTML (inline <strong> only).
// INVARIANT: keep these literal constants — never interpolate user/dynamic input.
const FAQ = [
  {
    q: "How is the friction score calculated?",
    a: "It's a <strong>heuristic self-assessment</strong>. Each answer carries a friction weight based on how much that gap tends to cost businesses in lost bookings, and the weights are added up and scaled to 0–100. It's built to point you at the biggest leaks — it does <strong>not</strong> inspect your real website or booking system.",
  },
  {
    q: "What counts as booking friction?",
    a: "Anything between a customer's intent and a confirmed appointment: having to call instead of booking online, a clunky mobile flow, too many steps, no after-hours response, no instant confirmation, or no reminders. Each one quietly loses a share of would-be bookings.",
  },
  {
    q: "How do I actually lower my booking friction?",
    a: "Give people a <strong>one-tap booking link</strong> they can finish on a phone, confirm the slot instantly, send automatic confirmations and reminders, and make sure after-hours interest still gets answered and booked. SeldonFrame does all of this out of the box.",
  },
];

export default function BookingFrictionGraderPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>Booking friction grader</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          Booking Friction Grader
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          Eight quick questions about how customers book with you. Get a friction score, a letter grade, and a prioritized
          list of exactly where you&apos;re losing bookings — plus a one-line fix for each. No signup needed.
        </p>
        <BookingFrictionGrader />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>How it works</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            <li>Answer questions about <strong>online booking</strong>, mobile ease, steps to book, after-hours response, confirmations, and lead capture</li>
            <li>The grader weights each answer by how much that gap tends to cost in lost bookings and returns a 0–100 score</li>
            <li>Every source of friction is listed <strong>worst first</strong>, each with a one-line fix</li>
          </ul>
          <p style={{ margin: "12px 0 0", fontSize: 13.5, color: "rgba(34,29,23,0.6)", lineHeight: 1.6 }}>
            The grade is a heuristic based only on your answers — it&apos;s a self-assessment, not a measurement of your live
            site or booking system.
          </p>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Why booking friction matters</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            Every extra step between a visitor and a booked appointment is a chance for them to give up and pick a competitor.
            Most booking intent happens <strong>after hours</strong> and <strong>on a phone</strong> — so if you can&apos;t be
            booked online in one tap, or nobody answers until you reopen, that interest quietly evaporates. Removing friction
            is usually the cheapest way to book more jobs from the traffic you already have.
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
              browse the free tools
            </Link>
            . Or read our guide to{" "}
            <Link href="/best/booking-system-for-small-business" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              the best booking system for small business
            </Link>
            .
          </p>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
