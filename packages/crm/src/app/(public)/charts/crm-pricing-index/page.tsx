// /charts/crm-pricing-index — the flagship interactive data page: real
// monthly cost vs business size for the competitors in the verified
// competitor-pricing registry (lib/seo/competitor-pricing.ts), re-verified
// monthly by the existing loop. Data-journalism honest: every number traces
// to that registry or the live /pricing ladder (lib/billing/plans.ts);
// quote-gated vendors are marked, never guessed.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { AuthorByline, articleLd } from "@/components/seo/author-byline";
import { PricingIndexChart } from "@/components/seo/pricing-index-chart";
import { buildOgUrl } from "@/lib/seo/og-card";
import { PRICING, LAST_UPDATED, getCompetitorPricing } from "@/lib/seo/competitor-pricing";
import { buildVendorSeries, sfBandForVendor } from "@/lib/seo/pricing-index";
import { COMPETITORS } from "@/lib/seo/alternative-pages";

const TITLE = "The CRM Pricing Index — What 25 CRMs Really Cost (Updated Monthly)";
const DESCRIPTION =
  "An interactive chart of real monthly CRM cost vs business size — HubSpot, GoHighLevel, Salesforce, Pipedrive, Keap and 20 more, re-verified monthly against each vendor's own pricing page. Quote-gated vendors are marked, never guessed.";
const CANONICAL = "/charts/crm-pricing-index";
const OG_URL = buildOgUrl({ kind: "tool", name: "The CRM Pricing Index", hook: "What 25 CRMs really cost, by business size" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: { title: TITLE, description: DESCRIPTION, url: CANONICAL, type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const FAQ: { q: string; a: string }[] = [
  {
    q: "Where do these prices come from?",
    a: "Every number traces to that vendor's own public pricing page, tracked in our <a href=\"/alternatives\">competitor-pricing registry</a> — the same data that drives each individual <code>/&lt;vendor&gt;-pricing</code> breakdown. An automated check re-verifies the registry monthly against the live pages; the \"as listed\" date on each chart point shows exactly when that number was last confirmed.",
  },
  {
    q: "Why do some vendors show a dashed \"quote-gated\" marker instead of a number?",
    a: "Some vendors (Salesforce Enterprise, Synthflow, Podium, and others) don't publish a self-serve price for that tier — you have to talk to sales. Rather than guess, we mark the point as quote-gated. Any third-party reported figure for those vendors is noted as \"reported\", never charted as a confirmed number.",
  },
  {
    q: "How is SeldonFrame's price shown fairly against every other vendor?",
    a: "SeldonFrame's shaded band always uses the tier closest to what each vendor implies: solo/DIY tools compare against Builder ($29/mo), a single managed workspace compares against Managed ($49/mo), and multi-client agency platforms (GoHighLevel, Vendasta, Stammer AI) compare against the Agency ladder ($99&ndash;$299/mo) &mdash; keyed to their own sub-account or client count. We never chart our cheapest tier against a competitor's most expensive one.",
  },
  {
    q: "What business size does the chart use?",
    a: "You control it &mdash; drag the contacts slider (500 / 2,000 / 10,000 / 50,000) or the seats slider (1 / 3 / 10) and every vendor's estimate recalculates using that vendor's own pricing structure (per-contact, per-seat, or flat).",
  },
  {
    q: "How often is this updated?",
    a: `The registry was last fully re-verified in ${LAST_UPDATED}. A scheduled monthly check re-confirms every vendor's public price and updates the "verified" date shown in each chart tooltip and the data table below.`,
  },
];

export default function CrmPricingIndexPage(): ReactElement {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: stripHtml(f.a) } })),
  };
  const articleSchema = articleLd({
    headline: TITLE,
    description: DESCRIPTION,
    canonicalPath: CANONICAL,
    dateModified: LAST_UPDATED,
  });

  const tableSize = { contacts: 2_000, seats: 1 };
  const series = buildVendorSeries(tableSize);

  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <MarketplaceNav />
      <main style={{ maxWidth: 920, margin: "0 auto", padding: "34px 32px 70px", width: "100%" }}>
        <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 6, fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.5)", marginBottom: 20 }}>
          <Link href="/charts" className="sf-link" style={{ color: "rgba(34,29,23,0.55)", textDecoration: "none" }}>
            Charts
          </Link>
          <span style={{ color: "rgba(34,29,23,0.3)" }}>/</span>
          <span style={{ color: "rgba(34,29,23,0.7)" }}>CRM Pricing Index</span>
        </nav>

        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: MKT.green, marginBottom: 12 }}>
          {`Live chart · updated ${LAST_UPDATED}`}
        </div>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 760 }}>
          The CRM Pricing Index
        </h1>
        <p style={{ margin: "14px 0 4px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 680 }}>
          What 25 CRMs and AI front-office tools really cost, by business size — re-verified monthly against each
          vendor's own pricing page.
        </p>
        <AuthorByline checked={LAST_UPDATED} />

        <section style={{ padding: "28px 0 0" }}>
          <PricingIndexChart />
        </section>

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Methodology</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            Every number on this chart traces to that vendor's own published pricing page, tracked in the same{" "}
            <Link href="/alternatives" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              competitor-pricing registry
            </Link>{" "}
            that drives each individual vendor's pricing breakdown page. An automated check re-verifies every price
            monthly; where a vendor's page is quote-gated, we say so plainly instead of inventing a number. Per-seat
            and per-contact vendors are estimated honestly at the assumption shown in each tooltip — the chart
            recalculates live as you move the sliders.
          </p>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            SeldonFrame's own comparison band uses the live tier ladder from{" "}
            <Link href="/pricing" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              /pricing
            </Link>{" "}
            (Builder $29 · Managed $49 · Agency Starter $99 · Agency Growth $199 · Agency Scale $299) — mapped to
            whichever tier is closest to what each visible vendor implies, never our cheapest tier against a
            competitor's most expensive.
          </p>
        </section>

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
            Full data table
          </h2>
          <p style={{ margin: "0 0 16px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
            At {tableSize.contacts.toLocaleString()} contacts, {tableSize.seats} seat — the chart's default size. Use
            the sliders above for other sizes.
          </p>
          <div style={{ overflowX: "auto", border: `1px solid ${MKT.ink10}`, borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: "rgba(31, 43, 36,0.06)" }}>
                  {["Vendor", "Est. monthly cost", "Assumption", "Seldon comparison band", "Last verified", "Source"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: MKT.ink, borderBottom: `1px solid ${MKT.ink10}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {series.map((s) => {
                  const pricing = getCompetitorPricing(s.slug);
                  const point = s.points[0];
                  const band = sfBandForVendor(s.slug, tableSize);
                  const competitor = COMPETITORS.find((c) => c.slug === s.slug);
                  const cost = point.quoteGated || point.costMonthly === null ? "Quote-gated" : `$${point.costMonthly}/mo`;
                  return (
                    <tr key={s.slug} style={{ borderBottom: `1px solid ${MKT.ink10}` }}>
                      <td style={{ padding: "10px 14px", fontWeight: 700 }}>
                        {competitor ? (
                          <Link href={`/${s.slug}-pricing`} className="sf-link" style={{ color: MKT.ink, textDecoration: "none" }}>
                            {s.name}
                          </Link>
                        ) : (
                          s.name
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>{cost}</td>
                      <td style={{ padding: "10px 14px", color: "rgba(34,29,23,0.65)" }}>{point.assumption}</td>
                      <td style={{ padding: "10px 14px", color: MKT.green, fontWeight: 700 }}>
                        ${band.low}–${band.high}/mo
                      </td>
                      <td style={{ padding: "10px 14px", color: "rgba(34,29,23,0.6)" }}>{pricing.verified}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <a href={pricing.pricingUrl} target="_blank" rel="noopener noreferrer" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
                          source →
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
          {FAQ.map((f) => (
            <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{f.q}</summary>
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }} dangerouslySetInnerHTML={{ __html: f.a }} />
            </details>
          ))}
        </section>

        <section style={{ padding: "32px 0 0" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>Related</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Link href="/tools/hubspot-pricing-calculator" className="sf-link" style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.7)", border: `1px solid ${MKT.ink10}`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(255,255,255,0.5)" }}>
              HubSpot Pricing Calculator
            </Link>
            <Link href="/tools/gohighlevel-cost-calculator" className="sf-link" style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.7)", border: `1px solid ${MKT.ink10}`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(255,255,255,0.5)" }}>
              GoHighLevel Cost Calculator
            </Link>
            <Link href="/alternatives" className="sf-link" style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.7)", border: `1px solid ${MKT.ink10}`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(255,255,255,0.5)" }}>
              All comparisons
            </Link>
            <Link href="/best/crm-for-small-business" className="sf-link" style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.7)", border: `1px solid ${MKT.ink10}`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(255,255,255,0.5)" }}>
              Best CRM for Small Business
            </Link>
            {PRICING.map((p) => (
              <Link
                key={p.slug}
                href={`/${p.slug}-pricing`}
                className="sf-link"
                style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.7)", border: `1px solid ${MKT.ink10}`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(255,255,255,0.5)" }}
              >
                {p.slug}-pricing
              </Link>
            ))}
          </div>
        </section>

        <p style={{ margin: "32px 0 0", fontSize: 13, color: "rgba(34,29,23,0.5)" }}>
          Also available as{" "}
          <a href="/charts/crm-pricing-index.md" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
            clean Markdown
          </a>{" "}
          for AI tools and agents.
        </p>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
