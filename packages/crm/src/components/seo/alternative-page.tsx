// The "alternative to X" comparison-page template — PostPlanify-style layout
// on the SeldonFrame marketplace design system, fully server-rendered:
// hero (with the logo-vs-logo card) → honest two-paragraph intro → comparison
// table → CTA → pros & cons → why they switch → who should use which →
// how to switch → FAQ (FAQPage JSON-LD) → cross-links → final CTA.
//
// Content comes from lib/seo/alternative-pages.ts + alternative-pages-extras.ts
// (update BOTH when competitor facts change). Each page has a Markdown twin at
// /alternative-to-<slug>.md (static dotted route folders — no proxy changes),
// pointed at by the visually-hidden MarkdownPointer for the paste-into-an-LLM flow.

import type { CSSProperties, ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter, SeldonFrameMark } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { MarkdownPointer } from "@/components/seo/markdown-pointer";
import { TldrBox } from "@/components/seo/tldr-box";
import { FrontOfficeFlow } from "@/components/seo/front-office-flow";
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
} from "@/lib/seo/alternative-pages";
import {
  getExtras,
  SF_PROS,
  SF_CONS,
  SWITCH_STEPS,
  START_HREF,
  DEMO_HREF,
} from "@/lib/seo/alternative-pages-extras";

/** Small muted "prices checked" trust line with an outbound link to the
 *  competitor's own pricing page — shared by all three comparison templates
 *  (alternative-page, seldonframe-vs-page, vs-page) so every rendered price
 *  is independently verifiable. Never-lies: this only links, never restates
 *  a number. */
export function PricingSourceLine({ name, url }: { name: string; url: string }): ReactElement {
  return (
    <p style={{ margin: "14px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "rgba(34,29,23,0.5)" }}>
      {`Prices checked ${LAST_UPDATED} on `}
      <a
        href={url}
        rel="nofollow noopener"
        target="_blank"
        style={{ color: "rgba(34,29,23,0.6)", textDecoration: "underline" }}
      >
        {`${name}'s pricing page`}
      </a>
      .
    </p>
  );
}

export function AlternativePage({ competitor }: { competitor: Competitor }): ReactElement {
  const c = competitor;
  const x = getExtras(c.slug);
  const faq = [...c.faq, ...SHARED_FAQ];
  const others = COMPETITORS.filter((o) => o.slug !== c.slug);
  const h1 = `Best ${c.name} Alternative for Agencies & Builders`;

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
    description: `SeldonFrame — ${c.name} alternative for agencies & builders: AI receptionist, website, CRM and booking in one flat $29/mo platform.`,
    offers: { "@type": "Offer", price: "29", priceCurrency: "USD" },
    provider: { "@type": "Organization", name: "SeldonFrame", url: "https://seldonframe.com" },
  };
  const articleJsonLd = articleLd({
    headline: h1,
    description: c.heroSub,
    canonicalPath: `/alternative-to-${c.slug}`,
    dateModified: monthYearToIso(LAST_UPDATED),
  });

  return (
    <div
      className="sf-mkt sf-altpage"
      style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}
    >
      <MarketplaceStyles />
      <AltPageStyles />
      <MarkdownPointer href={`/alternative-to-${c.slug}.md`} />
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>{c.name}</span>
        </nav>

        {/* ── HERO ── */}
        <header className="sf-alt-hero" style={{ display: "flex", gap: 36, alignItems: "center", paddingBottom: 34, borderBottom: `1px solid ${MKT.ink10}` }}>
          <div style={{ flex: "1 1 420px", minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: MKT.green, marginBottom: 12 }}>
              {`${c.name} alternative · ${c.category}`}
            </div>
            <h1 className="sf-alt-h1" style={{ margin: 0, fontSize: 42, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.06 }}>
              {h1}
            </h1>
            <p style={{ margin: "16px 0 0", fontSize: 18.5, lineHeight: 1.5, color: "rgba(34,29,23,0.7)", maxWidth: 620 }}>{c.heroSub}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24, alignItems: "center" }}>
              <CtaButtons />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(34,29,23,0.55)", background: MKT.ink05, borderRadius: 999, padding: "6px 12px" }}>
                {`Last updated: ${LAST_UPDATED}`}
              </span>
            </div>
            <AuthorByline checked={LAST_UPDATED} />
          </div>
          <VersusCard name={c.name} />
        </header>

        {/* ── WHAT YOU NEED TO KNOW ── */}
        <section style={{ padding: "38px 0 8px" }}>
          <h2 style={H2}>{`${c.name} vs SeldonFrame: what you need to know`}</h2>
          {c.intro.map((para, i) => (
            <p key={i} style={{ margin: "16px 0 0", fontSize: 16.5, lineHeight: 1.65, color: "rgba(34,29,23,0.78)", maxWidth: 760 }}>
              {emphasize(para)}
            </p>
          ))}
          <TldrBox
            items={[
              { icon: "💰", label: `${c.name} pricing`, text: c.them.pricingModel },
              { icon: "💰", label: "SeldonFrame pricing", text: "$29/mo flat, unlimited workspaces, first workspace free forever" },
              { icon: "👍", label: `Pick ${c.name} if`, text: x.chooseThem[0] },
              { icon: "🏆", label: "Pick SeldonFrame if", text: x.chooseSf[0] },
            ]}
          />
        </section>

        {/* ── COMPARISON TABLE ── */}
        <section style={{ padding: "38px 0 8px" }}>
          <h2 style={H2}>{`SeldonFrame vs ${c.name}: features & pricing`}</h2>
          <p style={{ margin: "10px 0 20px", fontSize: 15.5, color: "rgba(34,29,23,0.6)" }}>
            A row-by-row breakdown of pricing, the AI receptionist, and the business system behind it.
          </p>
          <div style={{ overflowX: "auto", border: `1px solid ${MKT.ink10}`, borderRadius: 16, background: "rgba(255,255,255,0.55)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640, fontSize: 14.5 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: "24%" }}>Features</th>
                  <th style={{ ...TH, width: "38%" }}>{c.name}</th>
                  <th style={{ ...TH, width: "38%", background: MKT.green10, color: MKT.green }}>
                    <span style={{ fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 2 }}>
                      ★ Recommended
                    </span>
                    SeldonFrame
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_LABELS.map((row) => (
                  <tr key={row.key}>
                    <td style={{ ...TD, fontWeight: 700 }}>{row.label}</td>
                    <td style={{ ...TD, color: "rgba(34,29,23,0.66)" }}>{emphasize(c.them[row.key])}</td>
                    <td style={{ ...TD, background: "rgba(31, 43, 36,0.05)", color: "rgba(34,29,23,0.85)", fontWeight: 500 }}>
                      {emphasize(SF_COLUMN[row.key])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CtaRow />
          <FrontOfficeFlow competitorName={c.name} competitorCategory={c.category} />
          <PricingSourceLine name={c.name} url={c.pricingSourceUrl} />
          <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.6, color: "rgba(34,29,23,0.55)" }}>
            {`Want to see ${c.name} against the rest of the market? `}
            <Link href="/charts/crm-pricing-index" className="sf-link" style={{ color: MKT.green, fontWeight: 600, textDecoration: "underline" }}>
              Explore the CRM Pricing Index →
            </Link>
          </p>
        </section>

        {/* ── PROS & CONS ── */}
        <section style={{ padding: "38px 0 8px" }}>
          <h2 style={H2}>{`${c.name} vs SeldonFrame: pros & cons`}</h2>
          <div className="sf-alt-cards" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <ProsConsCard title={c.name} pros={x.pros} cons={x.cons} />
            <ProsConsCard title="SeldonFrame" pros={SF_PROS} cons={SF_CONS} highlight />
          </div>
        </section>

        {/* ── WHY THEY SWITCH ── */}
        <section style={{ padding: "38px 0 8px" }}>
          <h2 style={H2}>{`Why agencies & builders switch from ${c.name}`}</h2>
          <div className="sf-alt-cards" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
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
        </section>

        {/* ── WHO SHOULD USE WHICH ── */}
        <section style={{ padding: "38px 0 8px" }}>
          <h2 style={H2}>{`Who should use ${c.name} vs SeldonFrame`}</h2>
          <div className="sf-alt-cards" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <WhoCard title={`${c.name} is the better choice if…`} items={x.chooseThem} />
            <WhoCard title="SeldonFrame is the better choice if…" items={x.chooseSf} highlight />
          </div>
          <p
            style={{ margin: "20px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.62)", background: MKT.ink05, borderRadius: 12, padding: "14px 18px", maxWidth: 760 }}
          >
            <strong style={{ color: "rgba(34,29,23,0.8)" }}>To be fair:</strong> {c.whenTheyWin}
          </p>
          <CtaRow />
        </section>

        {/* ── HOW TO SWITCH ── */}
        <section style={{ padding: "38px 0 8px" }}>
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
        <section style={{ padding: "38px 0 8px" }}>
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

        {/* ── MORE COMPARISONS (flywheel) ── */}
        <section style={{ padding: "30px 0 8px" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>More comparisons</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {others.map((o) => (
              <Link
                key={o.slug}
                href={`/alternative-to-${o.slug}`}
                className="sf-link"
                style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.7)", border: `1px solid ${MKT.ink10}`, borderRadius: 999, padding: "7px 14px", textDecoration: "none", background: "rgba(255,255,255,0.5)" }}
              >
                {`Alternative to ${o.name}`}
              </Link>
            ))}
          </div>
        </section>

        <BuildWidget ungatedBuildEnabled={isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: process.env.SF_WEB_UNGATED_BUILD })} />

        {/* ── FINAL CTA ── */}
        <section
          style={{ marginTop: 40, border: `1px solid ${MKT.ink10}`, borderRadius: 20, padding: "34px 32px", background: MKT.dark, color: MKT.paper, textAlign: "center" }}
        >
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>
            See your client&apos;s AI front office before you pay anything
          </h2>
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
      </main>

      <MarketplaceFooter />
    </div>
  );
}

/** The PostPlanify-style "them vs us" hero card: wordmarks in hand-drawn ellipses. */
function VersusCard({ name }: { name: string }): ReactElement {
  return (
    <div
      className="sf-alt-versus"
      aria-hidden="true"
      style={{ flex: "0 0 300px", border: `1.5px solid ${MKT.ink}`, borderRadius: 18, background: "rgba(255,255,255,0.65)", padding: "26px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}
    >
      <span style={{ position: "relative", display: "inline-block", padding: "10px 18px" }}>
        <Ellipse color="#D64541" />
        <span style={{ position: "relative", fontWeight: 800, fontSize: 19, letterSpacing: "-0.01em", color: "rgba(34,29,23,0.85)" }}>{name}</span>
      </span>
      <svg width="60" height="26" viewBox="0 0 60 26" fill="none" aria-hidden="true">
        <path d="M6 4 C 22 14, 38 14, 54 6 M8 20 C 24 12, 40 12, 52 20" stroke="rgba(34,29,23,0.45)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span style={{ position: "relative", display: "inline-block", padding: "12px 20px" }}>
        <Ellipse color={MKT.ink} />
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 20, letterSpacing: "-0.01em" }}>
          <SeldonFrameMark size={22} />
          SeldonFrame
        </span>
      </span>
    </div>
  );
}

/** A hand-drawn-looking ellipse behind a wordmark. */
function Ellipse({ color }: { color: string }): ReactElement {
  return (
    <svg style={{ position: "absolute", inset: -4, width: "calc(100% + 8px)", height: "calc(100% + 8px)" }} viewBox="0 0 200 70" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M100 6 C 160 4, 194 18, 195 34 C 196 52, 156 66, 98 65 C 42 64, 6 52, 5 35 C 4 19, 40 7, 100 6 Z"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The mid-page dual CTA row (used after the table and the who-should section). */
function CtaRow(): ReactElement {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 28 }}>
      <CtaButtons />
    </div>
  );
}

function CtaButtons(): ReactElement {
  return (
    <>
      <a href={START_HREF} style={{ background: MKT.ink, color: MKT.paper, padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
        Start for free
      </a>
      <a href={DEMO_HREF} style={{ border: `1.5px solid ${MKT.ink10}`, color: MKT.ink, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none", background: "rgba(255,255,255,0.5)" }}>
        Book a demo call
      </a>
    </>
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
          <li key={p} style={{ ...LI }}>
            <span style={{ color: MKT.green, fontWeight: 800, marginRight: 8 }}>+</span>
            {emphasize(p)}
          </li>
        ))}
      </ul>
      <div style={{ margin: "14px 0 6px", fontSize: 11.5, fontWeight: 800, letterSpacing: "0.1em", color: "#C0392B" }}>CONS</div>
      <ul style={UL}>
        {cons.map((p) => (
          <li key={p} style={{ ...LI }}>
            <span style={{ color: "#C0392B", fontWeight: 800, marginRight: 8 }}>−</span>
            {emphasize(p)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WhoCard({ title, items, highlight }: { title: string; items: string[]; highlight?: boolean }): ReactElement {
  return (
    <div
      style={{ border: `1px solid ${highlight ? "rgba(31, 43, 36,0.35)" : MKT.ink10}`, borderRadius: 16, padding: "20px 22px", background: highlight ? "rgba(31, 43, 36,0.05)" : "rgba(255,255,255,0.55)" }}
    >
      <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 800 }}>{title}</h3>
      <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {items.map((item, i) => (
          <li key={item} style={{ display: "flex", gap: 10, marginBottom: 10, fontSize: 14.5, lineHeight: 1.55, color: "rgba(34,29,23,0.75)" }}>
            <span style={{ fontWeight: 800, color: highlight ? MKT.green : "rgba(34,29,23,0.5)" }}>{`#${i + 1}`}</span>
            {item}
          </li>
        ))}
      </ol>
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
function AltPageStyles(): ReactElement {
  return (
    <style>{`
      @media (max-width: 860px) {
        .sf-altpage .sf-alt-hero { flex-direction: column; align-items: flex-start !important; }
        .sf-altpage .sf-alt-versus { align-self: center; }
      }
      @media (max-width: 720px) {
        .sf-altpage .sf-alt-h1 { font-size: 31px !important; }
        .sf-altpage .sf-alt-cards { grid-template-columns: 1fr !important; }
      }
    `}</style>
  );
}
