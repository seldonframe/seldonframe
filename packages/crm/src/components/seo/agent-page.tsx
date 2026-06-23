// The world-class GEO agent-page template — a citable, stat-backed ANSWER page
// that ends in the dual CTA. Server component (RSC): the ONLY client island is
// the dual CTA's Rent-via-MCP copy panel (AgentPageCta). Everything a crawler or
// an LLM needs — headings, the cited statistic with its source, the FAQ, the
// schema.org JSON-LD — is server-rendered HTML.
//
// GEO, not keyword SEO (per Princeton's GEO paper): the page leads with a
// semantic <h1>, renders the CITED pain stat prominently WITH a linked source,
// keeps prose answer-shaped, and emits BOTH schema.org SoftwareApplication and
// FAQPage JSON-LD (the FAQPage built straight from the registry FAQ). No keyword
// stuffing.
//
// Sections (in order): editorial hero (h1 + one-liner + cited stat) → what it
// does → how it works (3 steps) → surfaces pills → FAQ accordion (real
// <details>) → "more agents for [vertical]" flywheel cross-links → dual CTA.
//
// Design tokens are the live marketing palette (MKT) ported from the
// marketplace, so this matches the storefront pixel-for-pixel.

import type { ReactElement } from "react";
import Link from "next/link";
import {
  MarketplaceNav,
  MarketplaceFooter,
  SeldonFrameMark,
} from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MarketplaceIcon } from "@/components/marketplace/marketplace-icons";
import { MKT, SURFACE_META, mcpEndpointFor, mcpSnippetFor } from "@/components/marketplace/marketplace-data";
import { AgentPageCta } from "@/components/seo/agent-page-cta";
import {
  composePageCopy,
  deployHrefFor,
  relatedJobsForVertical,
  type AgentJob,
  type Vertical,
} from "@/lib/seo/agent-pages";

export type AgentPageProps = {
  job: AgentJob;
  /** Present on Tier-2 (job × vertical) pages; absent on Tier-1. */
  vertical?: Vertical;
};

/** The 3-step "how it works" — phrased generically so it reads right for any
 *  job, with the agent's surface woven into step 1. */
function howItWorksSteps(job: AgentJob): { title: string; body: string }[] {
  const primarySurface = job.surfaces[0];
  const surfaceLabel = SURFACE_META[primarySurface].label.toLowerCase();
  return [
    {
      title: "Deploy in about 60 seconds",
      body: `Describe your business once. We spin up a real hosted workspace and instantiate your ${job.name}, grounded in your services, hours, and pricing — ready over ${surfaceLabel}.`,
    },
    {
      title: "It handles the work",
      body: `Your ${job.name} ${job.verticalLede} — using your real calendar and data, and escalating only what genuinely needs you. It never invents a fact, a price, or a slot.`,
    },
    {
      title: "Everything stays connected",
      body: "Every conversation, booking, and contact is logged to your CRM in real time, so nothing falls through the cracks and follow-up is one click.",
    },
  ];
}

export function AgentPage({ job, vertical }: AgentPageProps): ReactElement {
  const copy = composePageCopy(job, vertical);
  const deployHref = deployHrefFor(job, vertical);
  const mcpEndpoint = mcpEndpointFor(job.marketplaceSlug ?? job.slug);
  const mcpSnippet = mcpSnippetFor(job.marketplaceSlug ?? job.slug);
  const steps = howItWorksSteps(job);
  const related = relatedJobsForVertical(job.slug, 5);
  const verticalLabel = vertical ? vertical.plural : "your business";

  // ── schema.org: SoftwareApplication (the agent) + FAQPage (the registry FAQ).
  // Two graphs, emitted as JSON-LD so search engines + LLMs can cite the page.
  const softwareLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: vertical ? `${job.name} for ${vertical.plural}` : job.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "SeldonFrame",
    description: copy.metaDescription,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    provider: { "@type": "Organization", name: "SeldonFrame", url: "https://seldonframe.com" },
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: copy.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <div
      className="sf-mkt sf-agentpage"
      style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}
    >
      <MarketplaceStyles />
      <AgentPageStyles />
      {/* GEO: structured data — SoftwareApplication + FAQPage. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <MarketplaceNav active="browse" />

      <main className="sf-ap-main" style={{ maxWidth: 920, margin: "0 auto", padding: "26px 32px 70px", width: "100%" }}>
        {/* breadcrumb — Tier-2 links back to the Tier-1 job page (a real hub edge) */}
        <nav
          aria-label="Breadcrumb"
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.5)", marginBottom: 22 }}
        >
          <Link href="/ai-agents" className="sf-link" style={{ color: "rgba(34,29,23,0.55)", textDecoration: "none" }}>
            Agents
          </Link>
          <span style={{ color: "rgba(34,29,23,0.3)" }}>/</span>
          {vertical ? (
            <>
              <Link href={`/ai-agents/${job.slug}`} className="sf-link" style={{ color: "rgba(34,29,23,0.55)", textDecoration: "none" }}>
                {job.name}
              </Link>
              <span style={{ color: "rgba(34,29,23,0.3)" }}>/</span>
              <span style={{ color: "rgba(34,29,23,0.7)" }}>{vertical.plural}</span>
            </>
          ) : (
            <span style={{ color: "rgba(34,29,23,0.7)" }}>{job.name}</span>
          )}
        </nav>

        {/* ── HERO: semantic h1 + one-liner + the cited stat, rendered prominently ── */}
        <header style={{ paddingBottom: 30, borderBottom: "1px solid rgba(34,29,23,0.10)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: MKT.green, marginBottom: 12 }}>
            {vertical ? `AI agent for ${vertical.plural}` : "Deploy a working agent in 60 seconds"}
          </div>
          <h1 className="sf-ap-h1" style={{ margin: 0, fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, maxWidth: 760 }}>
            {copy.h1}
          </h1>
          <p style={{ margin: "16px 0 0", fontSize: 19, lineHeight: 1.5, color: "rgba(34,29,23,0.7)", maxWidth: 640 }}>
            {job.oneLiner}
          </p>

          {/* THE CITED STAT — the GEO centerpiece. Rendered as a pull-quote with
              its source linked, so humans see the proof and LLMs can cite it. */}
          <figure
            style={{
              margin: "26px 0 0",
              background: "#fff",
              border: "1px solid rgba(34,29,23,0.10)",
              borderLeft: `4px solid ${MKT.green}`,
              borderRadius: 16,
              padding: "20px 22px",
              maxWidth: 640,
              boxShadow: "0 1px 2px rgba(34,29,23,0.04)",
            }}
          >
            <blockquote className="sf-ap-stat" style={{ margin: 0, fontFamily: MKT.fontSerif, fontSize: 21, lineHeight: 1.4, fontWeight: 500, color: MKT.ink }}>
              “{job.painStat.text}”
            </blockquote>
            <figcaption style={{ marginTop: 12, fontSize: 13, color: "rgba(34,29,23,0.6)" }}>
              Source:{" "}
              <a
                href={job.painStat.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                style={{ color: MKT.green, fontWeight: 600, textDecoration: "none" }}
              >
                {job.painStat.source}
              </a>
            </figcaption>
          </figure>

          {/* primary CTA echoed at the top so the hero is actionable */}
          <div style={{ marginTop: 26 }}>
            <Link
              href={deployHref}
              className="sf-btn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                border: "none",
                background: MKT.green,
                color: "#fff",
                fontWeight: 700,
                fontSize: 16,
                padding: "14px 24px",
                borderRadius: 13,
                textDecoration: "none",
                boxShadow: "0 8px 20px rgba(0,137,123,0.28)",
              }}
            >
              <MarketplaceIcon name="package" size={19} />
              Deploy it for {verticalLabel === "your business" ? "my business" : `my ${vertical?.name}`}
              <MarketplaceIcon name="arrowRight" size={17} />
            </Link>
          </div>
        </header>

        {/* ── INTRO (answer-shaped prose — weaves the stat + vertical) ── */}
        <section style={SECTION}>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.65, color: "rgba(34,29,23,0.82)", maxWidth: 680 }}>
            {copy.intro}
          </p>
        </section>

        {/* ── WHAT IT DOES ── */}
        <section style={SECTION}>
          <h2 style={H2}>What {aOrAnLower(job.name)} {job.name} does</h2>
          <ul style={{ margin: "0", padding: 0, listStyle: "none", display: "grid", gap: 12, maxWidth: 680 }}>
            {job.whatItDoes.map((line) => (
              <li key={line} style={{ display: "flex", alignItems: "flex-start", gap: 11, fontSize: 16, lineHeight: 1.5, color: "rgba(34,29,23,0.8)" }}>
                <span style={{ color: MKT.green, display: "flex", marginTop: 2, flex: "none" }}>
                  <MarketplaceIcon name="check" size={18} stroke={2.4} />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </section>

        {/* ── HOW IT WORKS (3 steps) ── */}
        <section style={SECTION}>
          <h2 style={H2}>How it works</h2>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 16, maxWidth: 720 }}>
            {steps.map((step, i) => (
              <li key={step.title} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    flex: "none",
                    background: "rgba(0,137,123,0.10)",
                    color: MKT.green,
                    fontWeight: 700,
                    fontFamily: MKT.fontMono,
                    fontSize: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <div style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: "-0.01em" }}>{step.title}</div>
                  <p style={{ margin: "4px 0 0", fontSize: 15, lineHeight: 1.55, color: "rgba(34,29,23,0.72)" }}>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── SURFACES (pills) ── */}
        <section style={SECTION}>
          <h2 style={{ ...H2, marginBottom: 14 }}>Where it works</h2>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            {job.surfaces.map((key) => (
              <span
                key={key}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 14.5,
                  fontWeight: 600,
                  color: MKT.ink,
                  background: "#fff",
                  border: "1px solid rgba(34,29,23,0.12)",
                  padding: "9px 16px",
                  borderRadius: 999,
                  boxShadow: "0 1px 2px rgba(34,29,23,0.04)",
                }}
              >
                <span style={{ color: MKT.green, display: "flex" }}>
                  <MarketplaceIcon name={SURFACE_META[key].icon} size={16} />
                </span>
                {SURFACE_META[key].label}
              </span>
            ))}
          </div>
        </section>

        {/* ── FAQ (real <details> accordion — also in FAQPage JSON-LD) ── */}
        <section style={SECTION}>
          <h2 style={H2}>Frequently asked questions</h2>
          <div style={{ display: "grid", gap: 10, maxWidth: 720 }}>
            {copy.faq.map((item) => (
              <details
                key={item.q}
                style={{
                  background: "#fff",
                  border: "1px solid rgba(34,29,23,0.10)",
                  borderRadius: 13,
                  padding: "14px 18px",
                  boxShadow: "0 1px 2px rgba(34,29,23,0.04)",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 16,
                    fontWeight: 650,
                    color: MKT.ink,
                    listStyle: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  {item.q}
                  <span style={{ color: MKT.green, flex: "none", display: "flex" }}>
                    <MarketplaceIcon name="arrowRight" size={16} />
                  </span>
                </summary>
                <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.6, color: "rgba(34,29,23,0.76)" }}>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── FLYWHEEL: "more agents for [vertical]" cross-links ── */}
        {related.length > 0 ? (
          <section style={SECTION}>
            <h2 style={{ ...H2, marginBottom: 4 }}>More agents for {verticalLabel}</h2>
            <p style={{ margin: "0 0 18px", fontSize: 14.5, color: "rgba(34,29,23,0.55)" }}>
              Every one deploys a working agent into your own workspace in about a minute.
            </p>
            <div className="sf-ap-related">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={vertical ? `/ai-agents/${r.slug}/for/${vertical.slug}` : `/ai-agents/${r.slug}`}
                  className="sf-cardhover"
                  style={{
                    textDecoration: "none",
                    color: MKT.ink,
                    background: "#fff",
                    border: "1px solid rgba(34,29,23,0.10)",
                    borderRadius: 14,
                    padding: 16,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    minWidth: 0,
                    boxShadow: "0 1px 2px rgba(34,29,23,0.04)",
                  }}
                >
                  <span style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(0,137,123,0.10)", color: MKT.green, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                    <MarketplaceIcon name={surfaceIconFor(r)} size={20} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15.5 }}>
                      {vertical ? `${r.name} for ${vertical.plural}` : r.name}
                    </div>
                    <div style={{ fontSize: 13, color: "rgba(34,29,23,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.oneLiner}
                    </div>
                  </div>
                  <span style={{ color: MKT.green, flex: "none", display: "flex" }}>
                    <MarketplaceIcon name="arrowRight" size={16} />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── DUAL CTA (the close) ── */}
        <section style={{ padding: "34px 0 0" }}>
          <AgentPageCta
            agentName={job.name}
            deployHref={deployHref}
            mcpEndpoint={mcpEndpoint}
            mcpSnippet={mcpSnippet}
            marketplaceSlug={job.marketplaceSlug}
          />
        </section>

        {/* ── tiny GEO footer note: links the page to its marketplace listing ── */}
        {job.marketplaceSlug ? (
          <p style={{ margin: "26px 0 0", fontSize: 13.5, color: "rgba(34,29,23,0.5)", display: "flex", alignItems: "center", gap: 8 }}>
            <SeldonFrameMark size={15} />
            See this agent on the{" "}
            <Link href={`/marketplace/${job.marketplaceSlug}`} style={{ color: MKT.green, fontWeight: 600, textDecoration: "none" }}>
              SeldonFrame Marketplace
            </Link>
            .
          </p>
        ) : null}
      </main>

      <MarketplaceFooter />
    </div>
  );
}

// ─── responsive containment (the overflow fix) ───────────────────────────────
//
// The page is inline-styled RSC (no Tailwind on these nodes), so the responsive
// behavior lives in one injected <style> block keyed off stable class names. It
// does three jobs, all server-rendered (zero client JS):
//   1. CONTAIN: the page root is `overflow-x:hidden` and `.sf-ap-main` is
//      `max-width:100%` so nothing can paint past the viewport's right edge.
//   2. The "More agents" grid (`.sf-ap-related`) uses `minmax(0,1fr)` tracks —
//      the actual root cause of the old overflow: plain `1fr 1fr` tracks have a
//      min-size of `auto`, so the cards' `white-space:nowrap` taglines forced
//      each column wider than half the container and pushed the grid off-screen.
//      `minmax(0,…)` lets the track shrink below content size; the tagline then
//      truncates with its existing ellipsis instead of overflowing. It collapses
//      to ONE column under 640px.
//   3. A ≤640px mobile query tightens page padding and scales the big hero
//      numbers down so the 44px h1 and the cited-stat pull-quote stay readable
//      and on-canvas down to 320px.
const AGENT_PAGE_CSS = `
  .sf-agentpage,.sf-agentpage *{min-width:0}
  .sf-ap-main{max-width:920px}
  .sf-ap-related{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .sf-ap-howit{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
  .sf-ap-works{display:flex;flex-wrap:wrap;gap:10px}
  .sf-ap-step-arrow{display:none}
  @media (max-width:640px){
    .sf-ap-main{padding:20px 18px 56px !important}
    .sf-ap-h1{font-size:32px !important;line-height:1.08 !important}
    .sf-ap-stat{font-size:18px !important}
    .sf-ap-related{grid-template-columns:1fr}
    .sf-ap-howit{grid-template-columns:1fr}
  }
`;

function AgentPageStyles(): ReactElement {
  return <style dangerouslySetInnerHTML={{ __html: AGENT_PAGE_CSS }} />;
}

// ─── shared style atoms (match the listing page's section rhythm) ─────────────

const SECTION = {
  padding: "30px 0",
  borderBottom: "1px solid rgba(34,29,23,0.10)",
} as const;

const H2 = {
  margin: "0 0 16px",
  fontSize: 23,
  fontWeight: 700,
  letterSpacing: "-0.02em",
} as const;

/** "a"/"an" lowercase for mid-sentence headline use ("What an AI Receptionist
 *  does" / "What a Win-Back Agent does"). */
function aOrAnLower(name: string): string {
  return /^[aeiou]/i.test(name.trim()) ? "an" : "a";
}

/** Pick a representative surface icon for a related-agent card. */
function surfaceIconFor(job: AgentJob) {
  return SURFACE_META[job.surfaces[0]].icon;
}
