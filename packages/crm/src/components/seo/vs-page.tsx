// The third-party "X vs Y" comparison template (/compare/<a>-vs-<b>) — the
// PostPlanify compare-directory motion: an honest side-by-side of two
// COMPETITORS, ending with SeldonFrame as the "if you need what both do"
// answer. Fully server-rendered from the registries; Markdown twin at
// /compare/<a>-vs-<b>.md.

import type { CSSProperties, ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { MarkdownPointer } from "@/components/seo/markdown-pointer";
import { COMPARISON_LABELS, SF_COLUMN, LAST_UPDATED, type Competitor } from "@/lib/seo/alternative-pages";
import { getExtras, START_HREF, DEMO_HREF, type VsPair, vsSlug } from "@/lib/seo/alternative-pages-extras";

export function VsPage({ pair, a, b }: { pair: VsPair; a: Competitor; b: Competitor }): ReactElement {
  const xa = getExtras(a.slug);
  const xb = getExtras(b.slug);

  return (
    <div
      className="sf-mkt sf-vspage"
      style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}
    >
      <MarketplaceStyles />
      <style>{`
        @media (max-width: 720px) {
          .sf-vspage .sf-vs-h1 { font-size: 30px !important; }
          .sf-vspage .sf-vs-cards { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <MarkdownPointer href={`/compare/${vsSlug(pair)}.md`} />
      <MarketplaceNav />

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "26px 32px 70px", width: "100%" }}>
        <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.5)", marginBottom: 22 }}>
          <Link href="/alternatives" className="sf-link" style={{ color: "rgba(34,29,23,0.55)", textDecoration: "none" }}>
            Compare
          </Link>
          <span style={{ color: "rgba(34,29,23,0.3)" }}>/</span>
          <span style={{ color: "rgba(34,29,23,0.7)" }}>{`${a.name} vs ${b.name}`}</span>
        </nav>

        <header style={{ paddingBottom: 30, borderBottom: `1px solid ${MKT.ink10}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: MKT.green, marginBottom: 12 }}>
            {`Head to head · updated ${LAST_UPDATED}`}
          </div>
          <h1 className="sf-vs-h1" style={{ margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, maxWidth: 780 }}>
            {`${a.name} vs ${b.name}: What You Need to Know`}
          </h1>
          <p style={{ margin: "16px 0 0", fontSize: 18, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 700 }}>{pair.angle}</p>
        </header>

        {/* the two contenders */}
        <section className="sf-vs-cards" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: "32px 0 8px" }}>
          {[{ c: a, x: xa }, { c: b, x: xb }].map(({ c, x }) => (
            <div key={c.slug} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 16, padding: "20px 22px", background: "rgba(255,255,255,0.55)" }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{c.name}</h2>
              <p style={{ margin: "8px 0 12px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.7)" }}>{c.oneLiner}</p>
              <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
                <div><strong>Best for:</strong> {c.them.bestFor}</div>
                <div><strong>Pricing:</strong> {c.them.pricingModel}</div>
              </div>
              <div style={{ margin: "12px 0 4px", fontSize: 11.5, fontWeight: 800, letterSpacing: "0.1em", color: MKT.green }}>STRONGEST WHEN</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {x.chooseThem.slice(0, 3).map((item) => (
                  <li key={item} style={{ fontSize: 13.5, lineHeight: 1.55, color: "rgba(34,29,23,0.72)", marginBottom: 6 }}>
                    <span style={{ color: MKT.green, fontWeight: 800, marginRight: 7 }}>+</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href={`/alternative-to-${c.slug}`} className="sf-link" style={{ display: "inline-block", marginTop: 12, fontSize: 13.5, fontWeight: 700, color: MKT.green, textDecoration: "none" }}>
                {`Full ${c.name} vs SeldonFrame breakdown →`}
              </Link>
            </div>
          ))}
        </section>

        {/* the 4-column table */}
        <section style={{ padding: "32px 0 8px" }}>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>{`${a.name} vs ${b.name} vs SeldonFrame`}</h2>
          <div style={{ overflowX: "auto", border: `1px solid ${MKT.ink10}`, borderRadius: 16, background: "rgba(255,255,255,0.55)", marginTop: 18 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760, fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: "19%" }}>Features</th>
                  <th style={{ ...TH, width: "27%" }}>{a.name}</th>
                  <th style={{ ...TH, width: "27%" }}>{b.name}</th>
                  <th style={{ ...TH, width: "27%", background: MKT.green10, color: MKT.green }}>SeldonFrame</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_LABELS.map((row) => (
                  <tr key={row.key}>
                    <td style={{ ...TD, fontWeight: 700 }}>{row.label}</td>
                    <td style={{ ...TD, color: "rgba(34,29,23,0.66)" }}>{a.them[row.key]}</td>
                    <td style={{ ...TD, color: "rgba(34,29,23,0.66)" }}>{b.them[row.key]}</td>
                    <td style={{ ...TD, background: "rgba(0,137,123,0.05)", color: "rgba(34,29,23,0.85)", fontWeight: 500 }}>{SF_COLUMN[row.key]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* the both-worlds plug */}
        <section
          style={{ marginTop: 36, border: `1px solid ${MKT.ink10}`, borderRadius: 20, padding: "30px 30px", background: MKT.dark, color: MKT.paper }}
        >
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {`Need what both ${a.name} and ${b.name} do?`}
          </h2>
          <p style={{ margin: "10px 0 0", fontSize: 15.5, lineHeight: 1.65, color: "rgba(246,242,234,0.78)", maxWidth: 720 }}>
            Most people running this comparison actually need the outcome underneath both tools: calls and chats answered, leads
            qualified, jobs booked into a real calendar and CRM, on a site the client owns. SeldonFrame ships that whole front
            office from one conversation — $29/mo flat, unlimited workspaces, your own AI keys at raw cost, whitelabel included.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
            <a href={START_HREF} style={{ background: MKT.green, color: "#fff", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
              Start for free
            </a>
            <a href={DEMO_HREF} style={{ border: "1.5px solid rgba(246,242,234,0.3)", color: MKT.paper, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
              Book a demo call
            </a>
          </div>
        </section>
      </main>

      <MarketplaceFooter />
    </div>
  );
}

const TH: CSSProperties = { textAlign: "left", padding: "13px 16px", fontSize: 12.5, fontWeight: 800, letterSpacing: "0.02em", borderBottom: "1px solid rgba(34,29,23,0.10)" };
const TD: CSSProperties = { padding: "12px 16px", verticalAlign: "top", lineHeight: 1.5, borderBottom: "1px solid rgba(34,29,23,0.07)" };
