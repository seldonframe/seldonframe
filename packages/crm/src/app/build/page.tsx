// /build — the IDE builder quickstart (spec 1ff09dcb, P0 Task 5).
//
// The human-browsable twin of /SKILL.md and the entry the SKILL.md + the
// /build/keys page link to. It's the *IDE / MCP* funnel — `set up SKILL.md` →
// get a key → ask your agent to build + list an agent — distinct from the
// Studio (dashboard) builder path at /marketplace/build, which this page links
// to. Server component, no "use client": all static content. Reuses the
// marketplace design system (nav/footer/styles/icons) so /build and /marketplace
// share one brand, per the spec's "same brand, distinct surface".
//
// SEO/GEO: per-page Metadata + schema.org WebPage with HowTo steps so the
// quickstart is citable, and the SKILL line sits in the hero (the headline funnel).

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MarketplaceIcon, type MarketplaceIconName } from "@/components/marketplace/marketplace-icons";
import { MKT } from "@/components/marketplace/marketplace-data";

export const metadata: Metadata = {
  title: "Build & sell an AI agent from your IDE — SeldonFrame for Builders",
  description:
    "set up https://seldonframe.com/SKILL.md, connect the SeldonFrame MCP, and ask your agent to build, test, list, and price an AI agent — without opening a dashboard. Listing is free; you keep 95%.",
  alternates: { canonical: "/build" },
  openGraph: {
    title: "Build & sell an AI agent from your IDE — SeldonFrame for Builders",
    description:
      "One command — set up https://seldonframe.com/SKILL.md — and your IDE agent can build, eval, list, and price an agent over MCP.",
    url: "/build",
    type: "website",
  },
};

// The 3-step IDE quickstart from the spec.
const STEPS: { n: string; icon: MarketplaceIconName; title: string; body: ReactElement }[] = [
  {
    n: "01",
    icon: "terminal",
    title: "Set up the skill",
    body: (
      <>
        In Claude Code, Cursor, or Codex, run{" "}
        <code className="sf-code">set up https://seldonframe.com/SKILL.md</code>. Your agent reads it and learns the
        whole build→sell flow.
      </>
    ),
  },
  {
    n: "02",
    icon: "shield",
    title: "Get a key",
    body: (
      <>
        Mint a workspace key at <Link href="/build/keys" className="sf-link-inline">/build/keys</Link>, copy it once, and
        add the SeldonFrame MCP connector with it. First workspace is free.
      </>
    ),
  },
  {
    n: "03",
    icon: "sparkles",
    title: "Ask your agent",
    body: (
      <>
        Say: <em>&ldquo;build me a 24/7 receptionist and list it for $0.10/call.&rdquo;</em> It runs{" "}
        <code className="sf-code">create_agent</code> → <code className="sf-code">run_agent_evals</code> →{" "}
        <code className="sf-code">publish_agent</code> → <code className="sf-code">set_usage_price</code>.
      </>
    ),
  },
];

export default function BuildQuickstartPage(): ReactElement {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "Build & sell an AI agent on SeldonFrame from your IDE",
    description:
      "Set up the SeldonFrame SKILL.md, connect the MCP with a workspace key, then ask your IDE agent to build, eval, publish, and price an agent.",
    step: [
      { "@type": "HowToStep", position: 1, name: "Set up the skill", text: "Run: set up https://seldonframe.com/SKILL.md" },
      { "@type": "HowToStep", position: 2, name: "Get a key", text: "Mint a workspace key at /build/keys and add the SeldonFrame MCP connector." },
      { "@type": "HowToStep", position: 3, name: "Ask your agent", text: "Ask your agent to build a 24/7 receptionist and list it for $0.10/call." },
    ],
  };

  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans }}>
      <MarketplaceStyles />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{`
        .sf-code { font-family: ${MKT.fontMono}; font-size: 0.92em; background: rgba(0,137,123,0.10); color: ${MKT.green}; padding: 2px 6px; border-radius: 6px; }
        .sf-link-inline { color: ${MKT.green}; font-weight: 600; text-decoration: none; }
        .sf-link-inline:hover { text-decoration: underline; }
      `}</style>
      <MarketplaceNav active="sell" />

      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 32px 72px" }}>
        {/* ── HERO — the SKILL line sits here (the headline funnel) ─────────── */}
        <header style={{ maxWidth: 760, marginBottom: 8 }}>
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
            <MarketplaceIcon name="zap" size={13} /> For builders · from your IDE
          </div>
          <h1 style={{ margin: 0, fontSize: 46, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.04 }}>
            Build & sell an AI agent{" "}
            <span style={{ fontFamily: MKT.fontSerif, fontStyle: "italic", fontWeight: 500 }}>without leaving your editor</span>.
          </h1>
          <p style={{ margin: "18px 0 0", fontSize: 19, lineHeight: 1.5, color: "rgba(34,29,23,0.66)" }}>
            Describe the agent in one sentence. Your IDE agent builds it, runs its evals, lists it on the marketplace,
            and sets a usage price — over MCP. Listing is free; you keep 95%.
          </p>

          {/* The one-command funnel, front and center. */}
          <div
            style={{
              marginTop: 24,
              background: MKT.dark,
              color: MKT.paper,
              borderRadius: 14,
              padding: "16px 18px",
              fontFamily: MKT.fontMono,
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: MKT.greenLight, fontWeight: 700 }}>$</span>
            <span style={{ color: "#fff" }}>set up https://seldonframe.com/SKILL.md</span>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
            <Link
              href="/build/keys"
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
              <MarketplaceIcon name="shield" size={17} /> Get a developer key
            </Link>
            <a
              href="/SKILL.md"
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
              Read the SKILL.md <MarketplaceIcon name="arrowRight" size={17} />
            </a>
          </div>
        </header>

        {/* ── THE 3 STEPS ──────────────────────────────────────────────────── */}
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
            Three steps
          </div>
          <h2 style={{ margin: "0 0 28px", fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" }}>
            From one command to a listed, priced agent
          </h2>
          <div className="sf-build-steps" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
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

        {/* ── PREFER A DASHBOARD? → the Studio builder path ────────────────── */}
        <section
          style={{
            marginTop: 52,
            background: "rgba(0,137,123,0.07)",
            border: "1px solid rgba(0,137,123,0.18)",
            borderRadius: 22,
            padding: "30px 36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Prefer a dashboard?
            </h2>
            <p style={{ margin: "10px 0 0", fontSize: 15.5, lineHeight: 1.5, color: "rgba(34,29,23,0.66)" }}>
              You can build and list the same agent visually in Agent Studio — and read our builder commitment (we keep
              5% only on a sale, and never clone you).
            </p>
          </div>
          <Link
            href="/marketplace/build"
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
              flex: "none",
            }}
          >
            The Studio builder path <MarketplaceIcon name="arrowRight" size={17} />
          </Link>
        </section>
      </main>

      <MarketplaceFooter />
    </div>
  );
}
