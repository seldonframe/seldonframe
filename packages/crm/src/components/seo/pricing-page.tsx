// The "[Competitor] Pricing" template — /<slug>-pricing — the highest-intent
// keyword family in the SEO batch ("gohighlevel pricing", "kartra pricing").
// Honest, current, skimmable: what you'll REALLY pay, including the stacked
// add-ons/meters nobody else writes about plainly. Shares the visual language
// of alternative-page.tsx / seldonframe-vs-page.tsx (MKT tokens, TldrBox,
// emphasize(), MarkdownPointer, FAQPage JSON-LD, chrome).
//
// Content comes from lib/seo/competitor-pricing.ts (the researched facts
// registry) + lib/seo/alternative-pages.ts (name/category/cross-link data) +
// alternative-pages-extras.ts (CTA hrefs). No new facts invented here.

import type { CSSProperties, ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { MarkdownPointer } from "@/components/seo/markdown-pointer";
import { TldrBox } from "@/components/seo/tldr-box";
import { AuthorByline, articleLd } from "@/components/seo/author-byline";
import { monthYearToIso } from "@/lib/seo/month-iso";
import { emphasize } from "@/lib/seo/emphasize";
import { getCompetitorPricing, PRICING, type CompetitorPricing } from "@/lib/seo/competitor-pricing";
import { getCompetitor } from "@/lib/seo/alternative-pages";
import { START_HREF, DEMO_HREF } from "@/lib/seo/alternative-pages-extras";

/** "Starts at" TL;DR fact — quote-gated competitors say so plainly rather
 *  than showing an invented number. Pure + exported for the Markdown twin. */
export function startsAtLabel(p: CompetitorPricing): string {
  if (p.quoteGated && p.plans.every((pl) => /quote|contact sales|custom/i.test(pl.price))) {
    return "Quote-gated — no public pricing";
  }
  return p.plans[0]?.price ?? "Quote-gated — no public pricing";
}

/** Compose the 3-item FAQ every pricing page shares. Pure + exported so the
 *  Markdown twin and unit tests can reuse it without duplicating copy. */
export function composePricingFaq(p: CompetitorPricing, name: string): { q: string; a: string }[] {
  return [
    { q: `How much does ${name} cost?`, a: p.bottomLine },
    {
      q: `Does ${name} have a free plan?`,
      a: p.freeTier ? p.freeTier : `No — ${name} does not publish a permanent free tier.`,
    },
    {
      q: `What's the cheapest ${name} alternative?`,
      a: `SeldonFrame: $29/mo flat, unlimited workspaces, first workspace free forever, with AI and telephony on your own keys at raw provider cost — no meters. /alternative-to-${p.slug}`,
    },
  ];
}

export function CompetitorPricingPage({ slug }: { slug: string }): ReactElement {
  const p = getCompetitorPricing(slug);
  const c = getCompetitor(slug);
  const faq = composePricingFaq(p, c.name);
  const startsAt = startsAtLabel(p);

  const others = PRICING.filter((o) => o.slug !== p.slug);
  const crossLinks = others.slice(0, 3);

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  const h1 = `${c.name} Pricing (2026): What You'll Actually Pay`;
  const articleJsonLd = articleLd({
    headline: h1,
    description: c.heroSub,
    canonicalPath: `/${p.slug}-pricing`,
    dateModified: monthYearToIso(p.verified),
  });

  return (
    <div
      className="sf-mkt sf-pricingpage"
      style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}
    >
      <MarketplaceStyles />
      <PricingPageStyles />
      <MarkdownPointer href={`/${p.slug}-pricing.md`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <MarketplaceNav />

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "26px 32px 70px", width: "100%" }}>
        {/* breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.5)", marginBottom: 22 }}
        >
          <Link href="/alternatives" className="sf-link" style={{ color: "rgba(34,29,23,0.55)", textDecoration: "none" }}>
            Compare
          </Link>
          <span style={{ color: "rgba(34,29,23,0.3)" }}>/</span>
          <span style={{ color: "rgba(34,29,23,0.7)" }}>{`${c.name} pricing`}</span>
        </nav>

        {/* ── HERO ── */}
        <header style={{ paddingBottom: 30, borderBottom: `1px solid ${MKT.ink10}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: MKT.green, marginBottom: 12 }}>
            {`Pricing breakdown · checked ${p.verified}`}
          </div>
          <h1 className="sf-pricing-h1" style={{ margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, maxWidth: 800 }}>
            {h1}
          </h1>
          <p style={{ margin: "16px 0 0", fontSize: 18, lineHeight: 1.5, color: "rgba(34,29,23,0.7)", maxWidth: 700 }}>
            {c.heroSub}
          </p>
          <AuthorByline checked={p.verified} />
        </header>

        {/* ── TL;DR ── */}
        <section style={{ padding: "30px 0 8px" }}>
          <TldrBox
            items={[
              { icon: "💰", label: "Starts at", text: startsAt },
              { icon: "📈", label: "What stacks on top", text: p.stacks[0]?.detail ?? "No published add-ons" },
              { icon: "🪙", label: "SeldonFrame comparison", text: "$29/mo flat, unlimited workspaces — no meters" },
            ]}
          />
        </section>

        {/* ── PLAN CARDS ── */}
        <section style={{ padding: "20px 0 8px" }}>
          <h2 style={H2}>{`${c.name} plans`}</h2>
          <div className="sf-pricing-cards" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginTop: 20 }}>
            {p.plans.map((plan) => (
              <div
                key={plan.name}
                style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 16, padding: "20px 22px", background: "rgba(255,255,255,0.55)" }}
              >
                <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 800 }}>{plan.name}</h3>
                <div style={{ margin: "8px 0 6px", fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" }}>{emphasize(plan.price)}</div>
                <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "rgba(34,29,23,0.6)" }}>{plan.whoFor}</p>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {plan.limits.map((l) => (
                    <li key={l} style={{ fontSize: 13.5, lineHeight: 1.55, color: "rgba(34,29,23,0.72)", marginBottom: 5 }}>
                      <span style={{ color: MKT.green, fontWeight: 800, marginRight: 6 }}>·</span>
                      {emphasize(l)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── WHAT STACKS ON TOP (the money section) ── */}
        <section style={{ padding: "34px 0 8px" }}>
          <h2 style={H2}>What stacks on top</h2>
          <p style={{ margin: "10px 0 20px", fontSize: 15.5, color: "rgba(34,29,23,0.6)", maxWidth: 760 }}>
            The plan price is rarely the whole story. Here&apos;s every add-on and meter that adds to the sticker price.
            {" "}See how {c.name} compares against 24 other platforms on the interactive{" "}
            <Link href="/charts/crm-pricing-index" className="sf-link" style={{ color: MKT.green, fontWeight: 600, textDecoration: "underline" }}>
              CRM Pricing Index →
            </Link>
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760 }}>
            {p.stacks.map((s) => (
              <div
                key={s.label}
                style={{ border: `1px solid ${MKT.ink10}`, borderLeftWidth: 3, borderLeftColor: "#C0392B", borderRadius: 12, padding: "14px 18px", background: "rgba(255,255,255,0.55)" }}
              >
                <strong style={{ fontSize: 14.5, color: "rgba(34,29,23,0.9)" }}>{s.label}</strong>
                <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }}>{emphasize(s.detail)}</p>
              </div>
            ))}
          </div>
        </section>

        {(p.freeTier || p.annualNote) && (
          <section style={{ padding: "30px 0 8px" }}>
            {p.freeTier && (
              <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.6, color: "rgba(34,29,23,0.75)", maxWidth: 760 }}>
                <strong>Free tier:</strong> {emphasize(p.freeTier)}
              </p>
            )}
            {p.annualNote && (
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "rgba(34,29,23,0.75)", maxWidth: 760 }}>
                <strong>Annual billing:</strong> {emphasize(p.annualNote)}
              </p>
            )}
          </section>
        )}

        {/* ── HOW THIS COMPARES TO SELDONFRAME ── */}
        <section style={{ padding: "34px 0 8px" }}>
          <h2 style={H2}>How this compares to SeldonFrame</h2>
          <p style={{ margin: "14px 0 0", fontSize: 15.5, lineHeight: 1.65, color: "rgba(34,29,23,0.78)", maxWidth: 760 }}>
            {emphasize(
              `SeldonFrame is $29/mo flat, unlimited workspaces, with AI and telephony on your own keys at raw provider cost — the AI receptionist, website, CRM, and booking calendar all ship in one price, no meters to watch.`,
            )}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            <Link
              href={`/compare/seldonframe-vs-${c.slug}`}
              className="sf-link"
              style={{ fontSize: 13.5, fontWeight: 600, color: MKT.green, border: `1px solid rgba(31, 43, 36,0.35)`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(31, 43, 36,0.06)" }}
            >
              {`SeldonFrame vs ${c.name} — full comparison →`}
            </Link>
            <Link
              href={`/alternative-to-${c.slug}`}
              className="sf-link"
              style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.7)", border: `1px solid ${MKT.ink10}`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(255,255,255,0.5)" }}
            >
              {`${c.name} switching guide →`}
            </Link>
          </div>
          <CtaRow />
        </section>

        {/* ── FAQ ── */}
        <section style={{ padding: "34px 0 8px" }}>
          <h2 style={{ ...H2, marginBottom: 14 }}>Frequently asked questions</h2>
          {faq.map((item) => (
            <details
              key={item.q}
              style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}
            >
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{item.q}</summary>
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }}>{item.a}</p>
            </details>
          ))}
        </section>

        {/* ── SOURCES ── */}
        <section style={{ padding: "10px 0 8px" }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "rgba(34,29,23,0.5)", maxWidth: 760 }}>
            {"Prices checked "}
            {p.verified}
            {" on "}
            <a href={p.pricingUrl} rel="nofollow noopener" target="_blank" style={{ color: "rgba(34,29,23,0.6)" }}>
              {p.pricingUrl}
            </a>
          </p>
        </section>

        {/* ── FINAL CTA ── */}
        <section
          style={{ marginTop: 30, border: `1px solid ${MKT.ink10}`, borderRadius: 20, padding: "34px 32px", background: MKT.dark, color: MKT.paper, textAlign: "center" }}
        >
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>See what you&apos;d pay on SeldonFrame instead</h2>
          <p style={{ margin: "10px auto 0", fontSize: 15.5, lineHeight: 1.6, color: "rgba(246,242,234,0.75)", maxWidth: 560 }}>
            Paste a business&apos;s website and SeldonFrame builds the site, CRM, booking calendar and AI receptionist in about 3 minutes —
            free, before you sign up. Then it&apos;s $29/mo flat for unlimited workspaces.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 22 }}>
            <a href={START_HREF} style={{ background: MKT.green, color: "#fff", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
              Start for free
            </a>
            <a href={DEMO_HREF} style={{ border: "1.5px solid rgba(246,242,234,0.3)", color: MKT.paper, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
              Book a demo call
            </a>
          </div>
        </section>

        {/* ── CROSS-LINKS ── */}
        <section style={{ padding: "30px 0 8px" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>More pricing breakdowns</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {crossLinks.map((o) => {
              const oc = getCompetitor(o.slug);
              return (
                <Link
                  key={o.slug}
                  href={`/${o.slug}-pricing`}
                  className="sf-link"
                  style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.7)", border: `1px solid ${MKT.ink10}`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(255,255,255,0.5)" }}
                >
                  {`${oc.name} pricing`}
                </Link>
              );
            })}
            <Link
              href="/alternatives"
              className="sf-link"
              style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.7)", border: `1px solid ${MKT.ink10}`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(255,255,255,0.5)" }}
            >
              All comparisons
            </Link>
          </div>
        </section>
      </main>

      <MarketplaceFooter />
    </div>
  );
}

function CtaRow(): ReactElement {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 22 }}>
      <a href={START_HREF} style={{ background: MKT.ink, color: MKT.paper, padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
        Start for free
      </a>
      <a href={DEMO_HREF} style={{ border: `1.5px solid ${MKT.ink10}`, color: MKT.ink, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none", background: "rgba(255,255,255,0.5)" }}>
        Book a demo call
      </a>
    </div>
  );
}

const H2: CSSProperties = { margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" };

/** Scoped responsive tweaks (inline styles can't express media queries). */
function PricingPageStyles(): ReactElement {
  return (
    <style>{`
      @media (max-width: 720px) {
        .sf-pricingpage .sf-pricing-h1 { font-size: 30px !important; }
        .sf-pricingpage .sf-pricing-cards { grid-template-columns: 1fr !important; }
      }
    `}</style>
  );
}
