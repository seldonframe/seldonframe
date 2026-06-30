// /build — the developer landing for the SeldonFrame builder marketplace
// (spec 1ff09dcb, P3). The Monid-clean front door: the human-browsable twin of
// /SKILL.md and the entry that SKILL.md, /build/keys, and /build/wallet all link
// to. It's the IDE / MCP funnel — `set up SKILL.md` → mint a `wst_` key → ask
// your agent to build + list an agent, then RUN anything in the catalog
// (discover → inspect → run). Distinct from the buyer-facing /marketplace
// storefront (which is untouched): same brand, a builder surface.
//
// Server component. The only client islands are the copy buttons (CopyCommand),
// so the whole page streams as static HTML. Reuses the marketplace design system
// verbatim — MKT tokens (cream paper, ink, teal), MarketplaceStyles, the
// MarketplaceNav/Footer chrome, the real SeldonFrameMark, the MarketplaceIcon
// set, and DM Mono for code/numbers — per the spec's "same brand, distinct
// surface". All load-bearing copy + snippets come from lib/build/landing-content
// (pure + unit-tested) so this file is pure presentation.
//
// SEO/GEO: per-page Metadata + a schema.org WebPage with HowTo steps so the
// quickstart is citable, with the hero command in the headline funnel.

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { MarketplaceNav, MarketplaceFooter, SeldonFrameMark } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MarketplaceIcon, type MarketplaceIconName } from "@/components/marketplace/marketplace-icons";
import { MKT } from "@/components/marketplace/marketplace-data";
import { CopyCommand } from "@/components/build/copy-command";
import {
  BUILD_SETUP_COMMAND,
  BUILD_KEYS_PATH,
  BUILD_WALLET_PATH,
  BUILDER_KEEP_PCT,
  SELDONFRAME_FEE_PCT,
  FLOW_STEPS,
  RENTABLE_TYPES,
  IDE_CHAT,
  IDE_TOOL_CHAIN,
  buildLandingConnectSnippet,
  PRICING_POINTS,
} from "@/lib/build/landing-content";

export const metadata: Metadata = {
  title: "Build & sell an AI agent — from your IDE | SeldonFrame for Builders",
  description:
    "set up https://seldonframe.com/SKILL.md, connect the SeldonFrame MCP, and ask your agent to build, test, list, and price an AI agent — without a dashboard. Get paid per call. List free; keep 95%.",
  alternates: { canonical: "/build" },
  openGraph: {
    title: "Build & sell an AI agent — from your IDE",
    description:
      "One command — set up https://seldonframe.com/SKILL.md — and your IDE agent can build, eval, list, and price an agent over MCP. MCP-native. No dashboard. No subscription.",
    url: "/build",
    type: "website",
  },
};

const connectSnippet = buildLandingConnectSnippet();

// ── shared inline style atoms (kept local; the page is otherwise token-driven) ─

const SECTION_GAP = 84;
const eyebrow = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: MKT.green,
  background: MKT.green10,
  padding: "5px 12px",
  borderRadius: 999,
} as const;

const sectionKicker = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "rgba(34,29,23,0.42)",
  marginBottom: 12,
} as const;

const card = {
  background: "#fff",
  border: "1px solid rgba(34,29,23,0.10)",
  borderRadius: 18,
  boxShadow: "0 1px 2px rgba(34,29,23,0.04)",
} as const;

const iconTile = (size = 44) =>
  ({
    width: size,
    height: size,
    borderRadius: 12,
    background: MKT.green10,
    color: MKT.green,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "none",
  }) as const;

export default function BuildLandingPage(): ReactElement {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Build & sell an AI agent on SeldonFrame from your IDE",
    description:
      "The developer front door to the SeldonFrame builder marketplace. Set up the SKILL.md, connect the MCP with a workspace key, then build, eval, publish, and price an agent — and run any tool, skill, or agent in the catalog.",
    url: "https://seldonframe.com/build",
    mainEntity: {
      "@type": "HowTo",
      name: "Build & sell an AI agent on SeldonFrame from your IDE",
      step: [
        { "@type": "HowToStep", position: 1, name: "Set up the skill", text: `Run: ${BUILD_SETUP_COMMAND}` },
        { "@type": "HowToStep", position: 2, name: "Mint a key", text: `Mint a workspace key at ${BUILD_KEYS_PATH} and add the SeldonFrame MCP connector.` },
        { "@type": "HowToStep", position: 3, name: "Ask your agent", text: "Ask your agent to build a 24/7 receptionist and list it for $0.10/call." },
      ],
    },
  };

  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans }}>
      <MarketplaceStyles />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{`
        .sf-build-link { color: ${MKT.green}; font-weight: 600; text-decoration: none; }
        .sf-build-link:hover { text-decoration: underline; }
        .sf-build-code { font-family: ${MKT.fontMono}; font-size: 0.92em; background: ${MKT.green10}; color: ${MKT.green}; padding: 2px 6px; border-radius: 6px; }
      `}</style>
      <MarketplaceNav active="sell" />

      <main className="sf-build-main" style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 32px 88px" }}>
        {/* ── 1 · HERO ──────────────────────────────────────────────────────── */}
        <Hero />

        {/* ── 2 · WHAT YOUR AGENT CAN DO ────────────────────────────────────── */}
        <WhatYourAgentCanDo />

        {/* ── 3 · THE 3-STEP FLOW ───────────────────────────────────────────── */}
        <ThreeStepFlow />

        {/* ── 4 · PRICING ───────────────────────────────────────────────────── */}
        <Pricing />

        {/* ── 5 · CONNECT ───────────────────────────────────────────────────── */}
        <Connect />

        {/* ── 6 · FOOTER CTAs ───────────────────────────────────────────────── */}
        <FooterCtas />
      </main>

      <MarketplaceFooter />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1 · HERO
// ───────────────────────────────────────────────────────────────────────────

function Hero(): ReactElement {
  return (
    <header className="sf-build-hero-grid" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 48, alignItems: "center", paddingTop: 16 }}>
      <div>
        <div style={{ ...eyebrow, marginBottom: 20 }}>
          <MarketplaceIcon name="zap" size={13} /> For builders · from your IDE
        </div>
        <h1 className="sf-build-h1" style={{ margin: 0, fontSize: 50, fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.02 }}>
          Build &amp; sell an AI agent —{" "}
          <span style={{ fontFamily: MKT.fontSerif, fontStyle: "italic", fontWeight: 500 }}>from your IDE.</span>{" "}
          Get paid per call.
        </h1>
        <p style={{ margin: "20px 0 0", fontSize: 19, lineHeight: 1.5, color: "rgba(34,29,23,0.66)", maxWidth: 540 }}>
          Describe the agent in one sentence. Your editor builds it, runs its evals, lists it on the marketplace, and
          sets a usage price — over MCP.
        </p>

        {/* The one command, front and center (Monid-style). Copyable island. */}
        <div style={{ marginTop: 26, maxWidth: 540 }}>
          <CopyCommand command={BUILD_SETUP_COMMAND} ariaLabel="Copy the set-up command" />
          <p style={{ margin: "12px 2px 0", fontSize: 14, fontWeight: 600, color: "rgba(34,29,23,0.5)" }}>
            MCP-native. No dashboard. No subscription.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
          <Link href={BUILD_KEYS_PATH} className="sf-btn" style={primaryBtn}>
            <MarketplaceIcon name="shield" size={17} /> Get a developer key
          </Link>
          <a href="/SKILL.md" className="sf-btn" style={ghostBtn}>
            Read the SKILL.md <MarketplaceIcon name="arrowRight" size={17} />
          </a>
        </div>
      </div>

      {/* The "moving in" card — a quiet brand beat, not a chart. */}
      <HeroAside />
    </header>
  );
}

function HeroAside(): ReactElement {
  return (
    <div
      className="sf-rise"
      style={{
        ...card,
        borderRadius: 22,
        padding: 26,
        boxShadow: "0 1px 2px rgba(34,29,23,0.05),0 24px 50px rgba(34,29,23,0.10)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 18 }}>
        <span style={iconTile(40)}>
          <SeldonFrameMark size={22} color={MKT.green} accent={MKT.greenLight} />
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>Your agent, listed</div>
          <div style={{ fontSize: 12.5, color: "rgba(34,29,23,0.5)", fontFamily: MKT.fontMono }}>live on the marketplace</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {[
          { icon: "check" as const, label: "Generated from one sentence" },
          { icon: "check" as const, label: "Evals passing" },
          { icon: "check" as const, label: "Published & priced" },
        ].map((r) => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14.5, color: "rgba(34,29,23,0.72)" }}>
            <span style={{ color: MKT.green, display: "flex", flex: "none" }}>
              <MarketplaceIcon name={r.icon} size={17} />
            </span>
            {r.label}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(34,29,23,0.10)", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, color: "rgba(34,29,23,0.5)" }}>You keep</span>
        <span style={{ fontFamily: MKT.fontMono, fontWeight: 700, fontSize: 26, letterSpacing: "-0.02em", color: MKT.green }}>{BUILDER_KEEP_PCT}%</span>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2 · WHAT YOUR AGENT CAN DO  (discover → inspect → run + three rentable types)
// ───────────────────────────────────────────────────────────────────────────

function WhatYourAgentCanDo(): ReactElement {
  return (
    <section style={{ marginTop: SECTION_GAP }}>
      <div style={sectionKicker}>What your agent can do</div>
      <h2 style={{ margin: "0 0 8px", fontSize: 32, fontWeight: 700, letterSpacing: "-0.025em" }}>
        Run anything in the catalog —{" "}
        <span style={{ fontFamily: MKT.fontSerif, fontStyle: "italic", fontWeight: 500 }}>one flow, one balance.</span>
      </h2>
      <p style={{ margin: "0 0 30px", fontSize: 16.5, lineHeight: 1.5, color: "rgba(34,29,23,0.62)", maxWidth: 620 }}>
        The same workspace key that builds your agent lets it consume the marketplace. Every sellable thing is
        discovered, priced, and run the same way.
      </p>

      {/* discover → inspect → run */}
      <div className="sf-build-flow-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 18 }}>
        {FLOW_STEPS.map((s, i) => (
          <div key={s.key} style={{ ...card, padding: "24px 22px", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={iconTile()}>
                <MarketplaceIcon name={s.icon as MarketplaceIconName} size={21} />
              </span>
              <span style={{ fontFamily: MKT.fontMono, fontSize: 13, fontWeight: 500, color: "rgba(34,29,23,0.32)" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <div style={{ fontFamily: MKT.fontMono, fontWeight: 500, fontSize: 16, marginBottom: 7, color: MKT.ink }}>{s.title}</div>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: "rgba(34,29,23,0.64)" }}>{s.body}</p>
          </div>
        ))}
      </div>

      {/* the three rentable types */}
      <div className="sf-build-type-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {RENTABLE_TYPES.map((t) => (
          <div key={t.name} style={{ ...card, padding: "24px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={iconTile(42)}>
              <MarketplaceIcon name={t.icon as MarketplaceIconName} size={20} />
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em" }}>{t.name}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: MKT.green, marginTop: 2 }}>{t.count}</div>
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "rgba(34,29,23,0.62)" }}>{t.body}</p>
          </div>
        ))}
      </div>
      <p style={{ margin: "16px 2px 0", fontSize: 14, color: "rgba(34,29,23,0.5)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: MKT.green, display: "flex" }}>
          <MarketplaceIcon name="dollar" size={15} />
        </span>
        One prepaid balance pays for all three. Pay per call — errors are never charged.
      </p>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3 · THE 3-STEP FLOW  (set up → mint a key → ask your agent, with an IDE chat)
// ───────────────────────────────────────────────────────────────────────────

function ThreeStepFlow(): ReactElement {
  return (
    <section style={{ marginTop: SECTION_GAP }}>
      <div style={sectionKicker}>Three steps</div>
      <h2 style={{ margin: "0 0 30px", fontSize: 32, fontWeight: 700, letterSpacing: "-0.025em" }}>
        From one command to a listed, priced agent
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FlowRow
          n="01"
          icon="terminal"
          title="Set up the skill"
          body={
            <>
              In Claude Code, Cursor, or Codex, run{" "}
              <code className="sf-build-code">{BUILD_SETUP_COMMAND}</code>. Your agent reads it and learns the whole
              build → sell flow.
            </>
          }
        />
        <FlowRow
          n="02"
          icon="shield"
          title="Mint a key"
          body={
            <>
              Mint a workspace key at{" "}
              <Link href={BUILD_KEYS_PATH} className="sf-build-link">
                {BUILD_KEYS_PATH}
              </Link>
              , copy it once, and add the SeldonFrame MCP connector with it. First workspace is free.
            </>
          }
        />
        <FlowRow
          n="03"
          icon="sparkles"
          title="Ask your agent"
          body={
            <>
              Just describe it. Your IDE agent runs <code className="sf-build-code">create_agent</code> →{" "}
              <code className="sf-build-code">run_agent_evals</code> →{" "}
              <code className="sf-build-code">publish_agent</code> → <code className="sf-build-code">set_usage_price</code>.
            </>
          }
          extra={<IdeChat />}
        />
      </div>
    </section>
  );
}

function FlowRow({
  n,
  icon,
  title,
  body,
  extra,
}: {
  n: string;
  icon: MarketplaceIconName;
  title: string;
  body: ReactElement;
  extra?: ReactElement;
}): ReactElement {
  return (
    <div style={{ ...card, borderRadius: 20, padding: "24px 26px", display: "flex", gap: 20 }}>
      <span style={iconTile(46)}>
        <MarketplaceIcon name={icon} size={22} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontFamily: MKT.fontMono, fontSize: 13, fontWeight: 500, color: "rgba(34,29,23,0.32)" }}>{n}</span>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.015em" }}>{title}</span>
        </div>
        <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.55, color: "rgba(34,29,23,0.66)" }}>{body}</p>
        {extra}
      </div>
    </div>
  );
}

/** A realistic IDE chat transcript: the natural-language ask, the agent's reply,
 *  and the live "running…" tool trace. Static (no client state needed). */
function IdeChat(): ReactElement {
  return (
    <div style={{ marginTop: 18, background: MKT.dark, borderRadius: 16, padding: 18, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ display: "flex", gap: 5 }}>
          <Dot c="#FF5F57" />
          <Dot c="#FEBC2E" />
          <Dot c="#28C840" />
        </span>
        <span style={{ fontFamily: MKT.fontMono, fontSize: 11.5, color: "rgba(246,242,234,0.45)", marginLeft: 4 }}>
          your IDE · seldonframe MCP connected
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {IDE_CHAT.map((turn, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: MKT.fontMono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: turn.role === "you" ? "rgba(246,242,234,0.5)" : MKT.greenLight }}>
              {turn.role === "you" ? "you" : "agent"}
            </span>
            <span style={{ fontSize: 14, lineHeight: 1.5, color: turn.role === "you" ? "#F3EEE4" : "rgba(246,242,234,0.82)" }}>
              {turn.text}
            </span>
          </div>
        ))}
      </div>

      {/* the tool trace */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(246,242,234,0.10)", display: "flex", flexWrap: "wrap", gap: 8 }}>
        {IDE_TOOL_CHAIN.map((tool, i) => (
          <span
            key={tool}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: MKT.fontMono,
              fontSize: 12,
              color: "#9FE8DD",
              background: "rgba(0,137,123,0.16)",
              border: "1px solid rgba(0,137,123,0.30)",
              padding: "4px 9px",
              borderRadius: 8,
            }}
          >
            <MarketplaceIcon name={i === IDE_TOOL_CHAIN.length - 1 ? "dollar" : "check"} size={12} />
            {tool}
          </span>
        ))}
      </div>
    </div>
  );
}

function Dot({ c }: { c: string }): ReactElement {
  return <span style={{ width: 11, height: 11, borderRadius: 999, background: c, display: "inline-block" }} />;
}

// ───────────────────────────────────────────────────────────────────────────
// 4 · PRICING
// ───────────────────────────────────────────────────────────────────────────

function Pricing(): ReactElement {
  return (
    <section style={{ marginTop: SECTION_GAP }}>
      <div style={sectionKicker}>Pricing</div>
      <h2 style={{ margin: "0 0 30px", fontSize: 32, fontWeight: 700, letterSpacing: "-0.025em" }}>
        List free. Earn per call. <span style={{ color: MKT.green }}>Keep {BUILDER_KEEP_PCT}%.</span>
      </h2>

      <div className="sf-build-price" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "stretch" }}>
        {/* the headline split */}
        <div
          style={{
            background: MKT.dark,
            color: MKT.paper,
            borderRadius: 22,
            padding: "32px 30px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(246,242,234,0.5)", marginBottom: 14 }}>
            Your cut of every paid run
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontFamily: MKT.fontMono, fontWeight: 700, fontSize: 72, letterSpacing: "-0.04em", color: MKT.greenLight, lineHeight: 1 }}>
              {BUILDER_KEEP_PCT}%
            </span>
            <span style={{ fontSize: 16, color: "rgba(246,242,234,0.6)" }}>to you</span>
          </div>
          <p style={{ margin: "16px 0 0", fontSize: 15, lineHeight: 1.55, color: "rgba(246,242,234,0.7)" }}>
            SeldonFrame takes a clean {SELDONFRAME_FEE_PCT}% on real usage — and nothing else. No listing fee, no seat
            fee, no subscription. We don&apos;t tax your work.
          </p>
        </div>

        {/* the honest facts */}
        <div style={{ ...card, borderRadius: 22, padding: "30px 28px", display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
          {PRICING_POINTS.map((p) => (
            <div key={p.text} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <span style={{ ...iconTile(34), marginTop: 1 }}>
                <MarketplaceIcon name={p.icon as MarketplaceIconName} size={16} />
              </span>
              <span style={{ fontSize: 15, lineHeight: 1.5, color: "rgba(34,29,23,0.74)" }}>{p.text}</span>
            </div>
          ))}
          <Link href={BUILD_WALLET_PATH} className="sf-build-link" style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 7, fontSize: 15 }}>
            <MarketplaceIcon name="dollar" size={16} /> Top up your prepaid wallet <MarketplaceIcon name="arrowRight" size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5 · CONNECT
// ───────────────────────────────────────────────────────────────────────────

function Connect(): ReactElement {
  return (
    <section style={{ marginTop: SECTION_GAP }}>
      <div style={sectionKicker}>Connect</div>
      <h2 style={{ margin: "0 0 8px", fontSize: 32, fontWeight: 700, letterSpacing: "-0.025em" }}>
        Add the MCP in one line
      </h2>
      <p style={{ margin: "0 0 22px", fontSize: 16.5, lineHeight: 1.5, color: "rgba(34,29,23,0.62)", maxWidth: 620 }}>
        Wire the SeldonFrame MCP into Claude Code over Streamable HTTP. Swap{" "}
        <code className="sf-build-code">wst_your_key</code> for the key you mint at{" "}
        <Link href={BUILD_KEYS_PATH} className="sf-build-link">
          {BUILD_KEYS_PATH}
        </Link>
        .
      </p>

      <div style={{ maxWidth: 720 }}>
        <CopyCommand command={connectSnippet} multiline ariaLabel="Copy the claude mcp add command" />
      </div>

      <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 10 }}>
        {[
          { icon: "terminal" as const, label: "MCP — Claude Code, Cursor, Codex" },
          { icon: "zap" as const, label: "CLI — the same key, anywhere" },
          { icon: "file" as const, label: "HTTP API — /api/v1/build/{discover,inspect,run}" },
        ].map((a) => (
          <span
            key={a.label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13.5,
              fontWeight: 600,
              color: "rgba(34,29,23,0.66)",
              background: "#fff",
              border: "1px solid rgba(34,29,23,0.12)",
              padding: "8px 13px",
              borderRadius: 999,
              boxShadow: "0 1px 2px rgba(34,29,23,0.04)",
            }}
          >
            <span style={{ color: MKT.green, display: "flex" }}>
              <MarketplaceIcon name={a.icon} size={15} />
            </span>
            {a.label}
          </span>
        ))}
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6 · FOOTER CTAs
// ───────────────────────────────────────────────────────────────────────────

function FooterCtas(): ReactElement {
  return (
    <section
      className="sf-build-cta"
      style={{
        marginTop: SECTION_GAP,
        background: "rgba(0,137,123,0.07)",
        border: "1px solid rgba(0,137,123,0.18)",
        borderRadius: 26,
        padding: "44px 44px",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: "-0.025em", textAlign: "center" }}>
        Ship your first agent{" "}
        <span style={{ fontFamily: MKT.fontSerif, fontStyle: "italic", fontWeight: 500 }}>tonight.</span>
      </h2>
      <p style={{ margin: "12px auto 26px", fontSize: 16.5, lineHeight: 1.5, color: "rgba(34,29,23,0.64)", maxWidth: 520, textAlign: "center" }}>
        Mint a key, connect the MCP, and ask your agent to build something worth selling.
      </p>
      <div className="sf-build-foot-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, maxWidth: 760, margin: "0 auto" }}>
        <Link href={BUILD_KEYS_PATH} className="sf-btn" style={{ ...primaryBtn, justifyContent: "center" }}>
          <MarketplaceIcon name="shield" size={17} /> Get a developer key
        </Link>
        <Link href="/marketplace" className="sf-btn" style={{ ...ghostBtn, justifyContent: "center" }}>
          <MarketplaceIcon name="search" size={17} /> Browse the marketplace
        </Link>
        <a href="/SKILL.md" className="sf-btn" style={{ ...ghostBtn, justifyContent: "center" }}>
          Read the SKILL.md <MarketplaceIcon name="arrowRight" size={17} />
        </a>
      </div>
    </section>
  );
}

// ── button atoms ─────────────────────────────────────────────────────────────

const primaryBtn = {
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
} as const;

const ghostBtn = {
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
} as const;
