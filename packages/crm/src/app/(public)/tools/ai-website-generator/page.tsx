// /tools/ai-website-generator — free tool (the PostPlanify free-tools SEO
// motion): pure landing surface over the shipped paste→build product. No new
// product code here — this markets create_workspace_from_url /
// create_workspace_from_google_paste, the same flow the homepage hero and
// /try already run. Server-rendered GEO copy + FAQ, flag-aware CTA.
//
// HONESTY (house rule never-lies): only promise what's shipped — hosted
// website, booking page (cal.diy), intake form (Formbricks), CRM. AI
// receptionist is "ready to add", not "included and live", since it needs a
// phone number / telephony setup the free build doesn't provision.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { AuthorByline, articleLd } from "@/components/seo/author-byline";
import { BuildWidget } from "@/components/seo/build-widget";
import { ChatGptCtaCard } from "@/components/seo/chatgpt-cta";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";
import { buildOgUrl } from "@/lib/seo/og-card";

/** FAQ answers use a few <strong>/<a> tags for readability; JSON-LD wants
 *  plain text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const TITLE = "AI Website Generator for Service Businesses — free, in 3 minutes";
const DESCRIPTION =
  "Free AI website generator built for local service businesses: paste your Google Business Profile or describe your business, and get a real hosted website, booking page, intake form and CRM — live in about 3 minutes.";
const CANONICAL = "/tools/ai-website-generator";

const OG_URL = buildOgUrl({ kind: "tool", name: "AI Website Generator", hook: "Paste your business. Get a real website in 3 minutes." });

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
    q: "Is it really free?",
    a: "Yes. Your first workspace — website, booking page, intake form, and CRM — is <strong>free forever</strong>. $29/mo unlocks unlimited workspaces if you ever need more than one. No credit card is required to build your first site.",
  },
  {
    q: "Do I need to know how to code?",
    a: "No. You paste your Google Business Profile link or a short description of your business, and the generator builds the pages, copy, and structure for you. You can edit anything afterward in plain language — no code editor required.",
  },
  {
    q: "Can I use my own domain?",
    a: "Yes. Every workspace starts on a free <code>&lt;yourbusiness&gt;.app.seldonframe.com</code> subdomain, and you can connect a custom domain you already own once you're ready.",
  },
  {
    q: "What if I already have a website?",
    a: "Paste your existing site's URL instead of a Google Business Profile — the generator reads it and rebuilds a faster, booking-ready version with the CRM and intake form wired in. If you just want to know how your current site scores first, try the <a href=\"/tools/website-grader\">Local Business Website Grader</a>.",
  },
  {
    q: "How is this different from Wix, Framer, or HubSpot's AI website builder?",
    a: "Those tools are genuinely good at generating a page. SeldonFrame generates the page <strong>and</strong> wires up the machinery behind it in the same step: a booking calendar, an intake form, and a CRM that all talk to each other — so a visitor can go from landing page to booked appointment without you connecting anything extra.",
  },
  {
    q: "What happens to my site if I never pay?",
    a: "It stays live on your free subdomain. The $29/mo plan is for builders who want more than one workspace or a custom domain — it isn't a countdown timer on the site you already built.",
  },
];

const DATE_MODIFIED = "2026-07-09";

export default function AiWebsiteGeneratorPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>AI website generator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 720 }}>
          Paste your business. Get a real website in 3 minutes.
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 680 }}>
          Paste your Google Business Profile link (or just describe what you do) and this AI website generator builds
          you a real, hosted website — plus the booking page, intake form, and CRM behind it. Free, and{" "}
          {ungatedBuildEnabled ? "no signup or credit card required to see it built." : "no credit card required to start."}
        </p>

        <BuildWidget ungatedBuildEnabled={ungatedBuildEnabled} heading="Build your website free" />
        <ChatGptCtaCard />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>How it works</h2>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            <li><strong>Paste or describe.</strong> Drop in your Google Business Profile link, your existing website, or just a couple of sentences about what your business does.</li>
            <li><strong>The generator builds it.</strong> In about 3 minutes you get a real, hosted website with pages, copy, and a matching booking calendar and intake form — not a mockup.</li>
            <li><strong>Claim it, or don't.</strong> The site is live and usable right away. Claim it when you want to keep editing, connect a domain, or add more.</li>
          </ol>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>What you get</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            <li>A real <strong>hosted website</strong> on your own subdomain — not a template preview you have to export</li>
            <li>A <strong>booking page</strong> customers can use to grab a real appointment slot</li>
            <li>An <strong>intake form</strong> that captures the details you need before the first conversation</li>
            <li>A <strong>CRM</strong> that files every visitor, form fill, and booking in one place automatically</li>
            <li>An <strong>AI receptionist</strong>, ready to turn on when you want one answering calls or chats for you</li>
          </ul>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>AI website generators vs SeldonFrame</h2>
          <p style={{ margin: "0 0 14px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            Tools like Wix's AI site builder, Framer AI, and HubSpot's AI website generator are genuinely good at one
            job: turning a prompt into a page fast. That's real, and worth using if a page is all you need.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 480 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${MKT.ink10}` }}>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>What you need</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Typical AI website generator</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700, color: MKT.green }}>SeldonFrame</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: `1px solid ${MKT.ink10}` }}>
                  <td style={{ padding: "10px 12px" }}>A generated page</td>
                  <td style={{ padding: "10px 12px" }}>Yes</td>
                  <td style={{ padding: "10px 12px" }}>Yes</td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${MKT.ink10}` }}>
                  <td style={{ padding: "10px 12px" }}>Booking calendar wired in</td>
                  <td style={{ padding: "10px 12px" }}>Usually a separate app or plugin</td>
                  <td style={{ padding: "10px 12px" }}>Included, connected to the site</td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${MKT.ink10}` }}>
                  <td style={{ padding: "10px 12px" }}>Lead intake + CRM</td>
                  <td style={{ padding: "10px 12px" }}>Usually a separate tool</td>
                  <td style={{ padding: "10px 12px" }}>Included, syncs automatically</td>
                </tr>
                <tr>
                  <td style={{ padding: "10px 12px" }}>AI receptionist path</td>
                  <td style={{ padding: "10px 12px" }}>Not offered</td>
                  <td style={{ padding: "10px 12px" }}>Ready to add when you want it</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ margin: "14px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "rgba(34,29,23,0.6)" }}>
            The honest read: pick a plain AI website generator if a page is genuinely all you need. Pick SeldonFrame
            when you want the page and the booking/CRM machinery behind it built at the same time, so a lead can go
            from visit to booked appointment without you stitching tools together.
          </p>
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
            Already have a site?{" "}
            <Link href="/tools/website-grader" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              grade it free
            </Link>
            . Or check your{" "}
            <Link href="/tools/booking-friction-grader" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              booking friction score
            </Link>
            , browse the{" "}
            <Link href="/guides" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              guides hub
            </Link>
            , or see how SeldonFrame compares on the{" "}
            <Link href="/alternatives" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              alternatives page
            </Link>
            .
          </p>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
