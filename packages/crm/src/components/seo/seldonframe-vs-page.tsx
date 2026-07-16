// The flagship first-person "SeldonFrame vs X" head-to-head template
// (/compare/seldonframe-vs-<slug>) — a DEEP page composed entirely from the
// existing alternative-pages registry + extras, sharing the visual language
// of alternative-page.tsx (hero, comparison table, pros/cons, switch steps,
// FAQ + JSON-LD) but written first-person: SeldonFrame vs one named
// competitor, honest both ways. Markdown twin at
// /compare/seldonframe-vs-<slug>.md (lib/seo/seldonframe-vs-markdown.ts).
//
// Content comes ONLY from lib/seo/alternative-pages.ts +
// alternative-pages-extras.ts — no new facts, never-lies (SF cons stay
// visible, the competitor is credited via whenTheyWin).

import type { CSSProperties, ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { MarkdownPointer } from "@/components/seo/markdown-pointer";
import { TldrBox } from "@/components/seo/tldr-box";
import { FrontOfficeFlow } from "@/components/seo/front-office-flow";
import { PricingSourceLine } from "@/components/seo/alternative-page";
import { BuildWidget } from "@/components/seo/build-widget";
import { AuthorByline, articleLd } from "@/components/seo/author-byline";
import { monthYearToIso } from "@/lib/seo/month-iso";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";
import { emphasize } from "@/lib/seo/emphasize";
import {
  COMPETITORS,
  COMPARISON_LABELS,
  SF_COLUMN,
  SHARED_FAQ,
  LAST_UPDATED,
  type Competitor,
  type AltFaqItem,
} from "@/lib/seo/alternative-pages";
import {
  getExtras,
  SF_PROS,
  SF_CONS,
  SWITCH_STEPS,
  START_HREF,
  DEMO_HREF,
} from "@/lib/seo/alternative-pages-extras";

/** Distinct intro paragraphs for the vs family — composed from registry facts,
 *  NOT c.intro (the /alternative-to page owns those verbatim), so the two
 *  indexable pages per competitor never share body copy (near-duplicate
 *  hygiene). Pure + exported for the Markdown twin and unit tests. */
export function composeSeldonframeVsIntro(c: Competitor): [string, string] {
  return [
    `${c.name} and SeldonFrame usually end up on the same shortlist for different reasons. ${c.oneLiner} SeldonFrame comes at the same problem from the other direction: one flat $29/mo workspace where the AI receptionist, website, CRM, booking calendar and intake forms arrive pre-wired — generated from a single conversation in about 3 minutes.`,
    `${c.whenTheyWin} SeldonFrame's case is the opposite one: when the outcome you're buying is answered calls, qualified leads and jobs booked into a CRM you own, that whole front office ships on day one and the economics stay flat as you grow. The rest of this page walks the differences row by row — pricing model, the AI receptionist, the business system behind it, whitelabel, and what switching actually takes.`,
  ];
}

/** Compose the two extra FAQ items unique to the SeldonFrame-vs-X template
 *  (on top of the competitor's own faq[] + SHARED_FAQ). Pure + exported so it
 *  can be unit-tested and reused by the Markdown twin. */
export function composeSeldonframeVsFaq(c: Competitor): AltFaqItem[] {
  return [
    {
      q: `Is SeldonFrame a good ${c.name} alternative?`,
      a: `For most agencies and builders, yes — SeldonFrame replaces the AI-front-office job (answering, qualifying, booking, tracking in a CRM) at $29/mo flat instead of ${c.name}'s stacked pricing. See the full switching guide: /alternative-to-${c.slug}.`,
    },
    {
      q: `How much does ${c.name} cost compared to SeldonFrame?`,
      a: `${c.name}: ${c.them.pricingModel}. SeldonFrame: $29/mo flat, unlimited workspaces, first workspace free forever, with AI and telephony on your own keys at raw provider cost — no per-minute or per-credit meter.`,
    },
  ];
}

export function SeldonFrameVsPage({ competitor }: { competitor: Competitor }): ReactElement {
  const c = competitor;
  const x = getExtras(c.slug);
  const faq = [...c.faq, ...composeSeldonframeVsFaq(c), ...SHARED_FAQ];
  const year = LAST_UPDATED.split(" ").pop() ?? "2026";
  const h1 = `SeldonFrame vs ${c.name}: Which Should You Choose? (${year})`;

  const others = COMPETITORS.filter((o) => o.slug !== c.slug);
  const sameCategory = others.filter((o) => o.category === c.category);
  const rest = others.filter((o) => o.category !== c.category);
  const crossLinks = [...sameCategory, ...rest].slice(0, 4);

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  const softwareLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "SeldonFrame",
    applicationCategory: "BusinessApplication",
    description: `SeldonFrame vs ${c.name}: AI receptionist, website, CRM and booking in one flat $29/mo platform, compared head to head.`,
    offers: { "@type": "Offer", price: "29", priceCurrency: "USD" },
    provider: { "@type": "Organization", name: "SeldonFrame", url: "https://seldonframe.com" },
  };
  const articleJsonLd = articleLd({
    headline: h1,
    description: c.heroSub,
    canonicalPath: `/compare/seldonframe-vs-${c.slug}`,
    dateModified: monthYearToIso(LAST_UPDATED),
  });

  return (
    <div
      className="sf-mkt sf-sfvspage"
      style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}
    >
      <MarketplaceStyles />
      <SfVsPageStyles />
      <MarkdownPointer href={`/compare/seldonframe-vs-${c.slug}.md`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd) }} />
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>{`SeldonFrame vs ${c.name}`}</span>
        </nav>

        {/* ── HERO ── */}
        <header style={{ paddingBottom: 30, borderBottom: `1px solid ${MKT.ink10}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: MKT.green, marginBottom: 12 }}>
            {`Head to head · updated ${LAST_UPDATED}`}
          </div>
          <h1 className="sf-sfvs-h1" style={{ margin: 0, fontSize: 42, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.06, maxWidth: 800 }}>
            {h1}
          </h1>
          <p style={{ margin: "16px 0 0", fontSize: 18.5, lineHeight: 1.5, color: "rgba(34,29,23,0.7)", maxWidth: 700 }}>{c.heroSub}</p>
          <AuthorByline checked={LAST_UPDATED} />
        </header>

        {/* ── HONEST INTRO (composed for the vs family — see composeSeldonframeVsIntro) ── */}
        <section style={{ padding: "34px 0 8px" }}>
          {composeSeldonframeVsIntro(c).map((para, i) => (
            <p key={i} style={{ margin: "0 0 16px", fontSize: 16.5, lineHeight: 1.65, color: "rgba(34,29,23,0.78)", maxWidth: 760 }}>
              {emphasize(para)}
            </p>
          ))}
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.55)", maxWidth: 760, fontStyle: "italic" }}>
            {`We make SeldonFrame, so read this comparison with that in mind — but we've tried to be specific about where ${c.name} genuinely wins below, not just where it doesn't.`}
          </p>
          <TldrBox
            items={[
              { icon: "💰", label: `${c.name} pricing`, text: c.them.pricingModel },
              { icon: "💰", label: "SeldonFrame pricing", text: "$29/mo flat, unlimited workspaces, first workspace free forever" },
              { icon: "👍", label: `Pick ${c.name} if`, text: x.chooseThem[0] },
              { icon: "🏆", label: "Pick SeldonFrame if", text: x.chooseSf[0] },
            ]}
          />
        </section>

        {/* ── EVIDENCE-ORDERED DEEP-DIVE SECTIONS (OPTIONAL — only present when
            the competitor supplies evidenceSections; every other competitor
            page is unaffected) ── */}
        {c.evidenceSections && c.evidenceSections.length > 0 ? (
          <section style={{ padding: "34px 0 8px" }}>
            <h2 style={H2}>{`${c.name}, evidence first`}</h2>
            {c.evidenceSections.map((sec) => (
              <div key={sec.title} style={{ marginTop: 22, maxWidth: 760 }}>
                <h3 style={{ margin: 0, fontSize: 18.5, fontWeight: 800 }}>{sec.title}</h3>
                {sec.paragraphs.map((p, i) => (
                  <p key={i} style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.78)" }}>
                    {emphasize(p)}
                  </p>
                ))}
                {sec.quote ? (
                  <blockquote
                    style={{
                      margin: "12px 0 0",
                      padding: "12px 18px",
                      borderLeft: `3px solid ${MKT.green}`,
                      background: MKT.green10,
                      borderRadius: "0 10px 10px 0",
                      fontSize: 14.5,
                      lineHeight: 1.6,
                      fontStyle: "italic",
                      color: "rgba(34,29,23,0.82)",
                    }}
                  >
                    {`"${sec.quote.text}"`}
                    <div style={{ marginTop: 6, fontSize: 12.5, fontStyle: "normal", fontWeight: 600 }}>
                      <a href={sec.quote.href} rel="nofollow noopener" className="sf-link" style={{ color: MKT.green, textDecoration: "underline" }}>
                        {sec.quote.source}
                      </a>
                      {" — accessed July 2026"}
                    </div>
                  </blockquote>
                ) : null}
                {sec.contrast ? (
                  <p style={{ margin: "10px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.7)" }}>
                    <strong style={{ color: MKT.green }}>SeldonFrame: </strong>
                    {emphasize(sec.contrast)}
                  </p>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {/* ── HONESTY BOX (OPTIONAL — the never-lies proof) ── */}
        {c.honestyBox ? (
          <section style={{ padding: "20px 0 8px" }}>
            <div
              style={{
                border: `1.5px solid ${MKT.ink10}`,
                borderRadius: 16,
                padding: "20px 24px",
                background: "rgba(255,255,255,0.6)",
                maxWidth: 760,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 800 }}>{c.honestyBox.title}</h3>
              <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
                {c.honestyBox.items.map((item) => (
                  <li key={item} style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(34,29,23,0.75)", marginBottom: 8 }}>
                    <span style={{ color: MKT.green, fontWeight: 800, marginRight: 8 }}>✓</span>
                    {emphasize(item)}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ── THE TWO CONTENDERS ── */}
        <section className="sf-sfvs-cards" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: "10px 0 8px" }}>
          <div style={{ border: "1.5px solid rgba(31, 43, 36,0.4)", borderRadius: 16, padding: "22px 24px", background: "rgba(31, 43, 36,0.05)" }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: MKT.green }}>★ SeldonFrame</span>
            <h2 style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 800 }}>SeldonFrame</h2>
            <p style={{ margin: "8px 0 12px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.75)" }}>
              $29/mo flat · unlimited workspaces · first workspace free forever
            </p>
            <div style={{ margin: "12px 0 4px", fontSize: 11.5, fontWeight: 800, letterSpacing: "0.1em", color: MKT.green }}>TOP REASONS TO CHOOSE IT</div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {SF_PROS.slice(0, 3).map((item) => (
                <li key={item} style={{ fontSize: 13.5, lineHeight: 1.55, color: "rgba(34,29,23,0.75)", marginBottom: 6 }}>
                  <span style={{ color: MKT.green, fontWeight: 800, marginRight: 7 }}>+</span>
                  {item}
                </li>
              ))}
            </ul>
            <div style={{ margin: "14px 0 4px", fontSize: 11.5, fontWeight: 800, letterSpacing: "0.1em", color: MKT.green }}>STRONGEST WHEN</div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {x.chooseSf.slice(0, 3).map((item) => (
                <li key={item} style={{ fontSize: 13.5, lineHeight: 1.55, color: "rgba(34,29,23,0.75)", marginBottom: 6 }}>
                  <span style={{ color: MKT.green, fontWeight: 800, marginRight: 7 }}>+</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 16, padding: "22px 24px", background: "rgba(255,255,255,0.55)" }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(34,29,23,0.45)" }}>{c.category}</span>
            <h2 style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 800 }}>{c.name}</h2>
            <p style={{ margin: "8px 0 12px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.75)" }}>{c.them.pricingModel}</p>
            <div style={{ margin: "12px 0 4px", fontSize: 11.5, fontWeight: 800, letterSpacing: "0.1em", color: "rgba(34,29,23,0.5)" }}>TOP REASONS TO CHOOSE IT</div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {x.pros.slice(0, 3).map((item) => (
                <li key={item} style={{ fontSize: 13.5, lineHeight: 1.55, color: "rgba(34,29,23,0.75)", marginBottom: 6 }}>
                  <span style={{ color: "rgba(34,29,23,0.5)", fontWeight: 800, marginRight: 7 }}>+</span>
                  {item}
                </li>
              ))}
            </ul>
            <div style={{ margin: "14px 0 4px", fontSize: 11.5, fontWeight: 800, letterSpacing: "0.1em", color: "rgba(34,29,23,0.5)" }}>STRONGEST WHEN</div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {x.chooseThem.slice(0, 3).map((item) => (
                <li key={item} style={{ fontSize: 13.5, lineHeight: 1.55, color: "rgba(34,29,23,0.75)", marginBottom: 6 }}>
                  <span style={{ color: "rgba(34,29,23,0.5)", fontWeight: 800, marginRight: 7 }}>+</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── COMPARISON TABLE ── */}
        <section style={{ padding: "34px 0 8px" }}>
          <h2 style={H2}>{`SeldonFrame vs ${c.name}: full feature & pricing breakdown`}</h2>
          <div style={{ overflowX: "auto", border: `1px solid ${MKT.ink10}`, borderRadius: 16, background: "rgba(255,255,255,0.55)", marginTop: 18 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640, fontSize: 14.5 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: "24%" }}>Features</th>
                  <th style={{ ...TH, width: "38%", background: MKT.green10, color: MKT.green }}>
                    <span style={{ fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 2 }}>
                      ★ Recommended
                    </span>
                    SeldonFrame
                  </th>
                  <th style={{ ...TH, width: "38%" }}>{c.name}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_LABELS.map((row) => (
                  <tr key={row.key}>
                    <td style={{ ...TD, fontWeight: 700 }}>{row.label}</td>
                    <td style={{ ...TD, background: "rgba(31, 43, 36,0.05)", color: "rgba(34,29,23,0.85)", fontWeight: 500 }}>
                      {emphasize(SF_COLUMN[row.key])}
                    </td>
                    <td style={{ ...TD, color: "rgba(34,29,23,0.66)" }}>{emphasize(c.them[row.key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CtaRow />
          <FrontOfficeFlow competitorName={c.name} competitorCategory={c.category} />
          <PricingSourceLine name={c.name} url={c.pricingSourceUrl} />
          <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.6, color: "rgba(34,29,23,0.55)" }}>
            {`See how ${c.name} stacks up against 24 other platforms on the `}
            <Link href="/charts/crm-pricing-index" className="sf-link" style={{ color: MKT.green, fontWeight: 600, textDecoration: "underline" }}>
              interactive CRM Pricing Index →
            </Link>
          </p>
        </section>

        {/* ── WHERE THEY WIN ── */}
        <section style={{ padding: "34px 0 8px" }}>
          <h2 style={H2}>{`Where ${c.name} wins`}</h2>
          <ul style={{ ...UL, marginTop: 16, maxWidth: 760 }}>
            {x.pros.map((p) => (
              <li key={p} style={LI}>
                <span style={{ color: "rgba(34,29,23,0.5)", fontWeight: 800, marginRight: 8 }}>+</span>
                {emphasize(p)}
              </li>
            ))}
          </ul>
          <p
            style={{ margin: "16px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.68)", background: MKT.ink05, borderRadius: 12, padding: "14px 18px", maxWidth: 760, borderLeft: `3px solid ${MKT.ink10}` }}
          >
            <strong style={{ color: "rgba(34,29,23,0.82)" }}>The honest take:</strong> {c.whenTheyWin}
          </p>
        </section>

        {/* ── WHERE SELDONFRAME WINS ── */}
        <section style={{ padding: "34px 0 8px" }}>
          <h2 style={H2}>{`Where SeldonFrame wins`}</h2>
          <div className="sf-sfvs-cards" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            {c.switchReasons.map((reason) => (
              <div
                key={reason.title}
                style={{ border: `1px solid ${MKT.ink10}`, borderLeftWidth: 3, borderLeftColor: MKT.green, borderRadius: 14, padding: "18px 20px", background: "rgba(255,255,255,0.55)" }}
              >
                <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 800 }}>{reason.title}</h3>
                <p style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.7)" }}>{reason.body}</p>
              </div>
            ))}
          </div>
          <CtaRow />
        </section>

        {/* ── PROS & CONS, BOTH SIDES ── */}
        <section style={{ padding: "34px 0 8px" }}>
          <h2 style={H2}>{`Pros & cons, side by side`}</h2>
          <div className="sf-sfvs-cards" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <ProsConsCard title="SeldonFrame" pros={SF_PROS} cons={SF_CONS} highlight />
            <ProsConsCard title={c.name} pros={x.pros} cons={x.cons} />
          </div>
        </section>

        {/* ── HOW TO SWITCH ── */}
        <section style={{ padding: "34px 0 8px" }}>
          <h2 style={H2}>{`How to switch from ${c.name} to SeldonFrame`}</h2>
          <ol style={{ margin: "20px 0 0", padding: 0, listStyle: "none", maxWidth: 760 }}>
            {SWITCH_STEPS.map((step, i) => (
              <li key={step.title} style={{ display: "flex", gap: 16, marginBottom: 18 }}>
                <span
                  style={{ flex: "0 0 auto", width: 30, height: 30, borderRadius: 999, background: MKT.green10, color: MKT.green, fontWeight: 800, fontSize: 14.5, display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  {i + 1}
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{step.title}</h3>
                  <p style={{ margin: "6px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.7)" }}>
                    {i === 1 ? x.switchNote : step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
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

        <BuildWidget ungatedBuildEnabled={isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: process.env.SF_WEB_UNGATED_BUILD })} />

        {/* ── FINAL CTA ── */}
        <section
          style={{ marginTop: 30, border: `1px solid ${MKT.ink10}`, borderRadius: 20, padding: "34px 32px", background: MKT.dark, color: MKT.paper, textAlign: "center" }}
        >
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>
            See it side by side before you decide
          </h2>
          <p style={{ margin: "10px auto 0", fontSize: 15.5, lineHeight: 1.6, color: "rgba(246,242,234,0.75)", maxWidth: 560 }}>
            Paste a business's website and SeldonFrame builds the site, CRM, booking calendar and AI receptionist in about 3 minutes —
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
          <h2 style={{ margin: "0 0 14px", fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>Keep exploring</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Link
              href={`/alternative-to-${c.slug}`}
              className="sf-link"
              style={{ fontSize: 13.5, fontWeight: 600, color: MKT.green, border: `1px solid rgba(31, 43, 36,0.35)`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(31, 43, 36,0.06)" }}
            >
              {`Prefer the switching guide? Full ${c.name} alternative breakdown →`}
            </Link>
            {crossLinks.map((o) => (
              <Link
                key={o.slug}
                href={`/compare/seldonframe-vs-${o.slug}`}
                className="sf-link"
                style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.7)", border: `1px solid ${MKT.ink10}`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(255,255,255,0.5)" }}
              >
                {`SeldonFrame vs ${o.name}`}
              </Link>
            ))}
            <Link
              href="/alternatives"
              className="sf-link"
              style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.7)", border: `1px solid ${MKT.ink10}`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(255,255,255,0.5)" }}
            >
              All comparisons
            </Link>
            <Link
              href="/tools"
              className="sf-link"
              style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.7)", border: `1px solid ${MKT.ink10}`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(255,255,255,0.5)" }}
            >
              Free tools
            </Link>
          </div>
        </section>
      </main>

      <MarketplaceFooter />
    </div>
  );
}

/** The mid-page dual CTA row (used after the table and the switch-reasons section). */
function CtaRow(): ReactElement {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 28 }}>
      <a href={START_HREF} style={{ background: MKT.ink, color: MKT.paper, padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
        Start for free
      </a>
      <a href={DEMO_HREF} style={{ border: `1.5px solid ${MKT.ink10}`, color: MKT.ink, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none", background: "rgba(255,255,255,0.5)" }}>
        Book a demo call
      </a>
    </div>
  );
}

function ProsConsCard({ title, pros, cons, highlight }: { title: string; pros: string[]; cons: string[]; highlight?: boolean }): ReactElement {
  return (
    <div
      style={{ border: `1px solid ${highlight ? "rgba(31, 43, 36,0.35)" : MKT.ink10}`, borderRadius: 16, padding: "20px 22px", background: highlight ? "rgba(31, 43, 36,0.05)" : "rgba(255,255,255,0.55)" }}
    >
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h3>
      <div style={{ margin: "14px 0 6px", fontSize: 11.5, fontWeight: 800, letterSpacing: "0.1em", color: MKT.green }}>PROS</div>
      <ul style={UL}>
        {pros.map((p) => (
          <li key={p} style={LI}>
            <span style={{ color: MKT.green, fontWeight: 800, marginRight: 8 }}>+</span>
            {emphasize(p)}
          </li>
        ))}
      </ul>
      <div style={{ margin: "14px 0 6px", fontSize: 11.5, fontWeight: 800, letterSpacing: "0.1em", color: "#C0392B" }}>CONS</div>
      <ul style={UL}>
        {cons.map((p) => (
          <li key={p} style={LI}>
            <span style={{ color: "#C0392B", fontWeight: 800, marginRight: 8 }}>−</span>
            {emphasize(p)}
          </li>
        ))}
      </ul>
    </div>
  );
}

const H2: CSSProperties = { margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" };
const UL: CSSProperties = { margin: 0, padding: 0, listStyle: "none" };
const LI: CSSProperties = { fontSize: 14, lineHeight: 1.55, color: "rgba(34,29,23,0.75)", marginBottom: 7 };

const TH: CSSProperties = {
  textAlign: "left",
  padding: "14px 18px",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "0.02em",
  borderBottom: "1px solid rgba(34,29,23,0.10)",
};

const TD: CSSProperties = {
  padding: "13px 18px",
  verticalAlign: "top",
  lineHeight: 1.5,
  borderBottom: "1px solid rgba(34,29,23,0.07)",
};

/** Scoped responsive tweaks (inline styles can't express media queries). */
function SfVsPageStyles(): ReactElement {
  return (
    <style>{`
      @media (max-width: 720px) {
        .sf-sfvspage .sf-sfvs-h1 { font-size: 31px !important; }
        .sf-sfvspage .sf-sfvs-cards { grid-template-columns: 1fr !important; }
      }
    `}</style>
  );
}
