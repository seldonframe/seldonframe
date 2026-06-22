// Public agent listing detail — SEO/GEO-optimized, with Install + Rent-via-MCP.
//
// Server component (only the sticky purchase sidebar + the sample-conversation
// replay are client islands). Matches the Claude Design output
// (screens/01-listing.png, 04-listing.png, mcp.png, ceremony.png): semantic
// <h1>=agent name + <h2> sections, a visible "built by · installed by · ⭐rating"
// credibility block near the top, what-it-does, surfaces + tools, a live sample
// conversation, reviews, "more from [builder]", and the "Built to be found &
// cited" SEO/GEO block with a per-listing OG-image preview.
//
// SEO/GEO baked in: per-listing generateMetadata (title/description/OG image)
// + schema.org SoftwareApplication JSON-LD via dangerouslySetInnerHTML.
//
// NO marketplace fee is shown anywhere on this buyer surface.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter, SeldonFrameMark } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MarketplaceIcon, StarRow } from "@/components/marketplace/marketplace-icons";
import { ListingActionsClient } from "@/components/marketplace/listing-actions-client";
import { SampleConversationClient } from "@/components/marketplace/sample-conversation-client";
import { listMarketplaceAgentsFromDb } from "@/lib/marketplace/agent-listings";
import { MARKETPLACE_SEED } from "@/components/marketplace/marketplace-seed";
import {
  CATEGORY_META,
  SURFACE_META,
  AVATAR_BG,
  MKT,
  formatInstalls,
  installsLabel,
  priceLabel,
  priceColor,
  rowToStorefrontAgent,
  mcpEndpointFor,
  mcpSnippetFor,
  type StorefrontAgent,
} from "@/components/marketplace/marketplace-data";

type ListingPageProps = {
  params: Promise<{ slug: string }>;
};

/** Resolve the full storefront catalog (live listings, seed fallback) so we can
 *  render a listing AND compute "more from the same builder". */
async function loadCatalog(): Promise<StorefrontAgent[]> {
  try {
    const rows = await listMarketplaceAgentsFromDb();
    if (rows.length > 0) return rows.map(rowToStorefrontAgent);
  } catch {
    // fall through to seed
  }
  return MARKETPLACE_SEED;
}

async function loadAgent(slug: string): Promise<{ agent: StorefrontAgent; others: StorefrontAgent[] } | null> {
  const catalog = await loadCatalog();
  const agent = catalog.find((a) => a.slug === slug) ?? MARKETPLACE_SEED.find((a) => a.slug === slug);
  if (!agent) return null;
  const others = catalog.filter((a) => a.builder === agent.builder && a.slug !== agent.slug).slice(0, 2);
  return { agent, others };
}

export async function generateMetadata({ params }: ListingPageProps): Promise<Metadata> {
  const { slug } = await params;
  const found = await loadAgent(slug);
  if (!found) {
    return { title: "Agent not found — SeldonFrame Marketplace" };
  }
  const { agent } = found;
  const title = `${agent.name} — ${agent.tagline} | SeldonFrame Marketplace`;
  const description = agent.blurb;
  return {
    title,
    description,
    alternates: { canonical: `/marketplace/${agent.slug}` },
    openGraph: {
      title: `${agent.name} · built by ${agent.builder}`,
      description,
      url: `/marketplace/${agent.slug}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${agent.name} — ${agent.tagline}`,
      description,
    },
  };
}

export default async function ListingDetailPage({ params }: ListingPageProps) {
  const { slug } = await params;
  const found = await loadAgent(slug);
  if (!found) notFound();

  const { agent, others } = found;
  const categoryLabel = CATEGORY_META[agent.category].label;
  const mcpEndpoint = mcpEndpointFor(agent.slug);
  const snippet = mcpSnippetFor(agent.slug);

  // A real, rated listing (not a brand-new seed) — drives whether we emit
  // aggregateRating / the "⭐ rating" credibility line. Never fabricate a rating
  // for a just-launched agent.
  const hasRealRating = !agent.isSeed && agent.reviewCount > 0 && Number(agent.rating) > 0;

  // schema.org SoftwareApplication — name/description/offers/author. We only
  // include aggregateRating when the listing actually has reviews; emitting a
  // fake rating would be misleading (and invalid structured data).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: agent.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "SeldonFrame",
    description: agent.blurb,
    offers: {
      "@type": "Offer",
      price: (agent.priceCents / 100).toFixed(2),
      priceCurrency: "USD",
    },
    ...(hasRealRating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: agent.rating,
            reviewCount: agent.reviewCount,
          },
        }
      : {}),
    author: { "@type": "Organization", name: agent.builder },
  };

  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans }}>
      <MarketplaceStyles />
      {/* GEO: structured data so LLMs + search engines can cite the listing. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MarketplaceNav active="browse" />

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 32px 70px" }}>
        <Link
          href="/marketplace"
          className="sf-link"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: "rgba(34,29,23,0.55)", textDecoration: "none", marginBottom: 22 }}
        >
          <MarketplaceIcon name="backArrow" size={16} /> Marketplace
          <span style={{ color: "rgba(34,29,23,0.3)" }}>/</span>
          <span style={{ color: "rgba(34,29,23,0.55)" }}>{categoryLabel}</span>
        </Link>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 44, alignItems: "start" }}>
          {/* MAIN COLUMN */}
          <div>
            {/* header — semantic h1 + the SEO/GEO credibility line */}
            <header style={{ display: "flex", alignItems: "flex-start", gap: 20, paddingBottom: 26, borderBottom: "1px solid rgba(34,29,23,0.10)" }}>
              <span style={{ width: 74, height: 74, borderRadius: 19, background: "rgba(0,137,123,0.10)", color: MKT.green, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <MarketplaceIcon name={agent.icon} size={36} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: MKT.green }}>
                  {categoryLabel}
                </div>
                <h1 style={{ margin: "5px 0 0", fontSize: 38, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05 }}>{agent.name}</h1>
                <p style={{ margin: "8px 0 0", fontSize: 17.5, lineHeight: 1.45, color: "rgba(34,29,23,0.66)", maxWidth: 540 }}>{agent.tagline}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
                  {hasRealRating ? (
                    <>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                        <span style={{ color: MKT.green, display: "flex" }}>
                          <MarketplaceIcon name="star" size={15} filled />
                        </span>
                        <strong style={{ fontFamily: MKT.fontMono }}>{agent.rating}</strong>
                        <span style={{ color: "rgba(34,29,23,0.5)", fontFamily: MKT.fontMono }}>({formatInstalls(agent.reviewCount)})</span>
                      </span>
                      <span style={{ fontSize: 14, color: "rgba(34,29,23,0.6)", fontFamily: MKT.fontMono }}>
                        installed by {formatInstalls(agent.installs)}
                      </span>
                    </>
                  ) : (
                    // Honest "just launched" state — no fabricated rating / install count.
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12.5,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: MKT.green,
                        background: "rgba(0,137,123,0.10)",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontFamily: MKT.fontMono,
                      }}
                    >
                      <MarketplaceIcon name="sparkles" size={13} /> New · just launched
                    </span>
                  )}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "rgba(34,29,23,0.6)", whiteSpace: "nowrap" }}>
                    built by <strong style={{ color: MKT.ink, fontWeight: 650 }}>{agent.builder}</strong>
                    {agent.verified ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: MKT.green, fontWeight: 700, fontSize: 12.5 }}>
                        <MarketplaceIcon name="shield" size={13} />
                        Verified
                      </span>
                    ) : null}
                  </span>
                </div>
              </div>
            </header>

            {/* what it does */}
            <section style={sectionBorder}>
              <h2 style={sectionH2}>What it does</h2>
              <p style={{ margin: 0, fontSize: 16.5, lineHeight: 1.65, color: "rgba(34,29,23,0.78)", maxWidth: 600 }}>{agent.blurb}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20, maxWidth: 600 }}>
                {agent.highlights.map((h) => (
                  <div key={h} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14.5, lineHeight: 1.4, color: "rgba(34,29,23,0.74)" }}>
                    <span style={{ color: MKT.green, display: "flex", marginTop: 1, flex: "none" }}>
                      <MarketplaceIcon name="check" size={16} stroke={2.4} />
                    </span>
                    {h}
                  </div>
                ))}
              </div>
            </section>

            {/* surfaces & tools */}
            <section style={sectionBorder}>
              <h2 style={{ ...sectionH2, marginBottom: 16 }}>Surfaces &amp; tools it uses</h2>
              <div style={miniLabel}>Works over</div>
              <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 22 }}>
                {agent.surfaces.map((key) => (
                  <span
                    key={key}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      fontSize: 14,
                      fontWeight: 600,
                      color: MKT.ink,
                      background: "#fff",
                      border: "1px solid rgba(34,29,23,0.12)",
                      padding: "9px 15px",
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
              <div style={miniLabel}>Connects to</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 600 }}>
                {agent.tools.map((t) => (
                  <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 11, background: "#fff", border: "1px solid rgba(34,29,23,0.10)", borderRadius: 13, padding: "12px 14px", fontSize: 14.5, fontWeight: 600 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(34,29,23,0.05)", color: "rgba(34,29,23,0.7)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                      <MarketplaceIcon name={t.icon} size={17} />
                    </span>
                    {t.label}
                  </div>
                ))}
              </div>
            </section>

            {/* live sample conversation (client island) */}
            <SampleConversationClient agent={agent} />

            {/* reviews */}
            {agent.reviews.length > 0 ? (
              <section style={sectionBorder}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                  <h2 style={sectionH2}>Reviews</h2>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 15 }}>
                    <span style={{ color: MKT.green, display: "flex" }}>
                      <MarketplaceIcon name="star" size={15} filled />
                    </span>
                    <strong style={{ fontFamily: MKT.fontMono, fontSize: 17 }}>{agent.rating}</strong>
                    <span style={{ color: "rgba(34,29,23,0.5)", fontFamily: MKT.fontMono }}>· {formatInstalls(agent.reviewCount)} reviews</span>
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {agent.reviews.map((r) => {
                    const initials = r.author
                      .split(" ")
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase();
                    const avBg = AVATAR_BG[r.author.charCodeAt(0) % AVATAR_BG.length];
                    return (
                      <div key={r.author} style={{ background: "#fff", border: "1px solid rgba(34,29,23,0.10)", borderRadius: 16, padding: 20, boxShadow: "0 1px 2px rgba(34,29,23,0.04)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                          <span style={{ width: 40, height: 40, borderRadius: 999, background: avBg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flex: "none" }}>
                            {initials}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 650, fontSize: 15, display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
                              {r.author}
                              {r.verified ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700, color: MKT.green, background: "rgba(0,137,123,0.10)", padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>
                                  <MarketplaceIcon name="shield" size={13} />
                                  Verified install
                                </span>
                              ) : null}
                            </div>
                            <div style={{ fontSize: 13, color: "rgba(34,29,23,0.55)" }}>{r.role}</div>
                          </div>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 1, color: MKT.green }}>
                            <StarRow count={r.stars} />
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.55, color: "rgba(34,29,23,0.82)" }}>{r.text}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* more from builder */}
            {others.length > 0 ? (
              <section style={sectionBorder}>
                <h2 style={{ ...sectionH2, marginBottom: 4 }}>More from {agent.builder}</h2>
                <p style={{ margin: "0 0 18px", fontSize: 14.5, color: "rgba(34,29,23,0.55)" }}>Other agents from the same builder</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {others.map((o) => (
                    <Link
                      key={o.slug}
                      href={`/marketplace/${o.slug}`}
                      className="sf-cardhover"
                      style={{ textDecoration: "none", color: MKT.ink, background: "#fff", border: "1px solid rgba(34,29,23,0.10)", borderRadius: 15, padding: 16, display: "flex", alignItems: "center", gap: 13, boxShadow: "0 1px 2px rgba(34,29,23,0.04)" }}
                    >
                      <span style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(0,137,123,0.10)", color: MKT.green, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                        <MarketplaceIcon name={o.icon} size={21} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15.5 }}>{o.name}</div>
                        <div style={{ fontSize: 13, color: "rgba(34,29,23,0.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.tagline}</div>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 13, color: priceColor(o.priceCents), fontFamily: MKT.fontMono, flex: "none" }}>{priceLabel(o.priceCents)}</span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {/* SEO / GEO — built to be found & cited */}
            <section style={{ padding: "30px 0 0" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(34,29,23,0.42)", marginBottom: 14 }}>
                <span style={{ color: MKT.green, display: "flex" }}>
                  <MarketplaceIcon name="sparkles" size={16} />
                </span>
                Built to be found &amp; cited
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 22, alignItems: "center", background: "#fff", border: "1px solid rgba(34,29,23,0.10)", borderRadius: 18, padding: 20, boxShadow: "0 1px 2px rgba(34,29,23,0.04)" }}>
                {/* OG image preview */}
                <div style={{ borderRadius: 13, overflow: "hidden", border: "1px solid rgba(34,29,23,0.10)", background: MKT.dark, aspectRatio: "1200/630", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 18, color: MKT.paper }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "rgba(246,242,234,0.6)" }}>
                    <SeldonFrameMark size={15} color={MKT.paper} accent={MKT.green} />
                    SeldonFrame Marketplace
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{agent.name}</div>
                    <div style={{ fontSize: 11.5, color: "rgba(246,242,234,0.7)", marginTop: 4, lineHeight: 1.35 }}>{agent.tagline}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "rgba(246,242,234,0.75)", fontFamily: MKT.fontMono }}>
                    {hasRealRating ? (
                      <>
                        <span style={{ color: MKT.greenLight }}>★ {agent.rating}</span>· {installsLabel(agent)} · {priceLabel(agent.priceCents)}
                      </>
                    ) : (
                      <>
                        <span style={{ color: MKT.greenLight }}>New</span> · {priceLabel(agent.priceCents)}
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 650, fontSize: 15, marginBottom: 8 }}>Optimized for search engines &amp; LLMs</div>
                  <p style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.55, color: "rgba(34,29,23,0.62)" }}>
                    Every listing ships a per-agent OG image, semantic headings, and{" "}
                    <span style={{ fontFamily: MKT.fontMono, fontSize: 13 }}>schema.org</span> structured data — so it ranks
                    for humans and is citable by AI assistants.
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {["schema.org/SoftwareApplication", "og:image", "JSON-LD", "semantic <h1>–<h3>"].map((tag) => (
                      <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "rgba(34,29,23,0.7)", background: "rgba(34,29,23,0.05)", padding: "5px 11px", borderRadius: 999, fontFamily: MKT.fontMono }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* STICKY SIDEBAR — install + rent-via-MCP (client island) */}
          <aside style={{ position: "sticky", top: 90, alignSelf: "start" }}>
            <ListingActionsClient agent={agent} mcpEndpoint={mcpEndpoint} snippet={snippet} />
          </aside>
        </div>
      </main>

      <MarketplaceFooter />
    </div>
  );
}

const sectionBorder = {
  padding: "30px 0",
  borderBottom: "1px solid rgba(34,29,23,0.10)",
} as const;

const sectionH2 = {
  margin: "0 0 14px",
  fontSize: 21,
  fontWeight: 700,
  letterSpacing: "-0.015em",
} as const;

const miniLabel = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(34,29,23,0.42)",
  marginBottom: 10,
} as const;
