// Public "Build & sell agents on SeldonFrame" page — the builder surface the
// marketplace footer's BUILD column points at ("Builder docs" / "List an
// agent"). Leads with SeldonFrame's Builder Commitment (the strategic trust
// artifact: we build only the generic/commodity agents as a free-tier floor and
// will NOT build vertical-specialized agents that compete with builders), then a
// short "how it works" (build in Studio → list → keep 95%).
//
// Server component — no "use client": all static content, navigation is plain
// <Link>. Matches the marketplace design system exactly (paper #F6F2EA / ink
// #221D17 / green #00897B, Hanken Grotesk + Newsreader), reusing the shared
// chrome (MarketplaceNav/Footer/Styles) and icon system.
//
// SEO/GEO: per-page Metadata (title/description/canonical/OG) + schema.org
// WebPage JSON-LD with an Offer (95% builder share / 5% only-when-it-sells). No
// auth — fully public.

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { MarketplaceNav, MarketplaceFooter, SeldonFrameMark } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MarketplaceIcon, type MarketplaceIconName } from "@/components/marketplace/marketplace-icons";
import { MKT } from "@/components/marketplace/marketplace-data";

export const metadata: Metadata = {
  title: "Build & sell agents on SeldonFrame — keep 95%, we never clone you",
  description:
    "Build an AI agent in Studio, list it on the marketplace, and keep 95% of every sale or rental. SeldonFrame builds only the generic, commodity agents — we will not build vertical-specialized agents that compete with you. The niche is yours.",
  alternates: { canonical: "/marketplace/build" },
  openGraph: {
    title: "Build & sell agents on SeldonFrame — the niche is yours",
    description:
      "Keep 95%. Set your own price. We never clone you. SeldonFrame stays in the commodity head; the vertical long tail is your domain.",
    url: "/marketplace/build",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Build & sell agents on SeldonFrame — keep 95%",
    description:
      "We build the generic agents as a free-tier floor and will not compete with you on niche, vertical agents. You keep 95%; we never clone you.",
  },
};

// The four commitment promises (the bullet rail from the strategic artifact).
const PROMISES: { icon: MarketplaceIconName; title: string; body: ReactElement }[] = [
  {
    icon: "dollar",
    title: "You keep 95%",
    body: (
      <>
        We take 5% only when your agent sells or is rented — <strong>never a listing fee</strong>, never a tax on your
        own work.
      </>
    ),
  },
  {
    icon: "trending",
    title: "You set the price",
    body: <>Per-call, per-outcome, monthly, or one-time — whatever fits the value you deliver.</>,
  },
  {
    icon: "shield",
    title: "We never clone you",
    body: (
      <>
        We don&apos;t use your agent&apos;s data, prompts, or performance to build a competing first-party agent.
      </>
    ),
  },
  {
    icon: "sparkles",
    title: "Our incentive is your success",
    body: <>We make money when you do — that&apos;s the whole arrangement.</>,
  },
];

// "How it works" — build in Studio → list → keep 95%.
const STEPS: { n: string; icon: MarketplaceIconName; title: string; body: string }[] = [
  {
    n: "01",
    icon: "terminal",
    title: "Build it in Studio",
    body: "Compose the skill, tools, knowledge, and guardrails in Agent Studio. Eval-gate it, deploy it across voice, chat, SMS, and email — all from one place.",
  },
  {
    n: "02",
    icon: "package",
    title: "List it on the marketplace",
    body: "Publish to the storefront with one click. Every listing ships a per-agent OG image, semantic headings, and schema.org data — built to be found and cited.",
  },
  {
    n: "03",
    icon: "dollar",
    title: "Keep 95% of every sale",
    body: "Buyers install or rent via MCP. You set the price; we take 5% only when it earns. Payouts land automatically — no listing fee, no surprises.",
  },
];

export default function MarketplaceBuildPage(): ReactElement {
  // schema.org WebPage + the builder Offer (95% share, fee only on a sale). GEO:
  // lets search engines + LLMs cite the commitment and the economics directly.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Build & sell agents on SeldonFrame",
    description:
      "Build an AI agent in Studio, list it on the SeldonFrame marketplace, and keep 95% of every sale or rental. SeldonFrame builds only generic, commodity agents and will not build vertical-specialized agents that compete with builders.",
    url: "https://app.seldonframe.com/marketplace/build",
    mainEntity: {
      "@type": "Offer",
      name: "SeldonFrame builder revenue share",
      description:
        "Builders keep 95% of every agent sale or rental. SeldonFrame charges a 5% fee only when an agent sells or is rented — no listing fee.",
      seller: { "@type": "Organization", name: "SeldonFrame" },
      priceSpecification: {
        "@type": "PriceSpecification",
        description: "5% marketplace fee, charged only on a completed sale or rental. Builder keeps 95%.",
      },
    },
  };

  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans }}>
      <MarketplaceStyles />
      {/* GEO: structured data so search engines + LLMs can cite the commitment. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MarketplaceNav active="sell" />

      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 32px 72px" }}>
        {/* breadcrumb back to browse */}
        <Link
          href="/marketplace"
          className="sf-link"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 14,
            fontWeight: 600,
            color: "rgba(34,29,23,0.55)",
            textDecoration: "none",
            marginBottom: 26,
          }}
        >
          <MarketplaceIcon name="backArrow" size={16} /> Marketplace
        </Link>

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <header style={{ maxWidth: 720, marginBottom: 8 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: MKT.green,
              background: "rgba(0,137,123,0.10)",
              padding: "5px 12px",
              borderRadius: 999,
              marginBottom: 18,
            }}
          >
            <MarketplaceIcon name="zap" size={13} /> For builders
          </div>
          <h1 style={{ margin: 0, fontSize: 46, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.04 }}>
            Build & sell agents on{" "}
            <span style={{ fontFamily: MKT.fontSerif, fontStyle: "italic", fontWeight: 500 }}>SeldonFrame</span>.
          </h1>
          <p style={{ margin: "18px 0 0", fontSize: 19, lineHeight: 1.5, color: "rgba(34,29,23,0.66)" }}>
            Build an agent in Studio, list it on the marketplace, and keep 95% of every sale. We build the generic
            agents as a free-tier floor — the niche is yours.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 26, flexWrap: "wrap" }}>
            <Link
              href="/studio/agents"
              className="sf-btn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                background: MKT.green,
                color: "#fff",
                fontWeight: 700,
                fontSize: 15.5,
                padding: "13px 22px",
                borderRadius: 12,
                textDecoration: "none",
                boxShadow: "0 1px 2px rgba(34,29,23,0.08)",
              }}
            >
              <MarketplaceIcon name="terminal" size={17} /> Start building in Studio
            </Link>
            <Link
              href="/marketplace"
              className="sf-btn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                background: "#fff",
                color: MKT.ink,
                fontWeight: 700,
                fontSize: 15.5,
                padding: "13px 22px",
                borderRadius: 12,
                textDecoration: "none",
                border: "1px solid rgba(34,29,23,0.14)",
              }}
            >
              Browse the marketplace <MarketplaceIcon name="arrowRight" size={17} />
            </Link>
          </div>
        </header>

        {/* ── THE COMMITMENT ───────────────────────────────────────────────── */}
        <section
          style={{
            marginTop: 52,
            background: MKT.dark,
            color: MKT.paper,
            borderRadius: 24,
            padding: "40px 40px 34px",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: MKT.greenLight,
              marginBottom: 16,
            }}
          >
            <SeldonFrameMark size={17} color={MKT.paper} accent={MKT.greenLight} />
            Our commitment to builders
          </div>
          <p style={{ margin: 0, fontSize: 21, lineHeight: 1.5, fontWeight: 500, maxWidth: 760 }}>
            SeldonFrame builds the generic, commodity agents — the AI receptionist, the review-requester, the booking
            concierge — and offers them as a{" "}
            <span style={{ fontFamily: MKT.fontSerif, fontStyle: "italic" }}>free-tier floor</span> so every business
            starts with a working default.
          </p>
          <p style={{ margin: "20px 0 0", fontSize: 21, lineHeight: 1.5, fontWeight: 500, maxWidth: 760 }}>
            <strong style={{ color: "#fff" }}>
              We will not build vertical-specialized agents that compete with you.
            </strong>{" "}
            <span style={{ color: "rgba(246,242,234,0.78)" }}>
              The blue ocean is yours: niche agents, deep edge-cases, vertical playbooks, integrated workflows, and the
              service around them. We stay in the commodity head; the long tail is your domain.
            </span>
          </p>

          {/* the four promises */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 14,
              marginTop: 30,
            }}
          >
            {PROMISES.map((p) => (
              <div
                key={p.title}
                style={{
                  background: "rgba(246,242,234,0.05)",
                  border: "1px solid rgba(246,242,234,0.12)",
                  borderRadius: 16,
                  padding: "18px 20px",
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 11,
                    background: "rgba(61,191,176,0.16)",
                    color: MKT.greenLight,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "none",
                  }}
                >
                  <MarketplaceIcon name={p.icon} size={19} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 4 }}>{p.title}</div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "rgba(246,242,234,0.72)" }}>{p.body}</p>
                </div>
              </div>
            ))}
          </div>

          <p
            style={{
              margin: "28px 0 0",
              fontSize: 16,
              lineHeight: 1.55,
              color: "rgba(246,242,234,0.82)",
              maxWidth: 700,
            }}
          >
            The generics get businesses in the door. The niches — the agents only{" "}
            <span style={{ fontFamily: MKT.fontSerif, fontStyle: "italic", color: "#fff" }}>you</span> know how to build
            — are where the money is.
          </p>
        </section>

        {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
        <section style={{ marginTop: 56 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(34,29,23,0.42)",
              marginBottom: 10,
            }}
          >
            How it works
          </div>
          <h2 style={{ margin: "0 0 28px", fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" }}>
            From an idea to earning, in three steps
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {STEPS.map((s) => (
              <div
                key={s.n}
                style={{
                  background: "#fff",
                  border: "1px solid rgba(34,29,23,0.10)",
                  borderRadius: 18,
                  padding: "24px 22px",
                  boxShadow: "0 1px 2px rgba(34,29,23,0.04)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: "rgba(0,137,123,0.10)",
                      color: MKT.green,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MarketplaceIcon name={s.icon} size={21} />
                  </span>
                  <span style={{ fontFamily: MKT.fontMono, fontSize: 13, fontWeight: 500, color: "rgba(34,29,23,0.35)" }}>
                    {s.n}
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 7, letterSpacing: "-0.01em" }}>{s.title}</div>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: "rgba(34,29,23,0.66)" }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CLOSING CTA ──────────────────────────────────────────────────── */}
        <section
          style={{
            marginTop: 52,
            background: "rgba(0,137,123,0.07)",
            border: "1px solid rgba(0,137,123,0.18)",
            borderRadius: 22,
            padding: "36px 40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ maxWidth: 520 }}>
            <h2 style={{ margin: 0, fontSize: 25, fontWeight: 700, letterSpacing: "-0.02em" }}>
              The niche is yours. Go build it.
            </h2>
            <p style={{ margin: "10px 0 0", fontSize: 16, lineHeight: 1.5, color: "rgba(34,29,23,0.66)" }}>
              Spin up your first agent in Studio. List it when it&apos;s ready. Keep 95% of everything it earns.
            </p>
          </div>
          <Link
            href="/studio/agents"
            className="sf-btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 9,
              background: MKT.green,
              color: "#fff",
              fontWeight: 700,
              fontSize: 15.5,
              padding: "14px 24px",
              borderRadius: 12,
              textDecoration: "none",
              boxShadow: "0 1px 2px rgba(34,29,23,0.08)",
              flex: "none",
            }}
          >
            <MarketplaceIcon name="terminal" size={17} /> Open Agent Studio
          </Link>
        </section>
      </main>

      <MarketplaceFooter />
    </div>
  );
}
