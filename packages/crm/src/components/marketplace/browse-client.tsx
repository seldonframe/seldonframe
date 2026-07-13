"use client";

// Browse storefront interactive island — the hero search, category tiles,
// Featured row, and the live-filterable agent grid. This is the ONLY "use
// client" surface in Task 3: it receives the full agent list from the server
// component (which fetched live listings via listMarketplaceAgentsFromDb, with
// the seed catalog as fallback) and filters in-memory, mirroring the Claude
// Design output's renderVals() filter + category logic.

import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { MarketplaceIcon } from "./marketplace-icons";
import { AgentCard } from "./agent-card";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  MKT,
  formatInstalls,
  type CategoryKey,
  type StorefrontAgent,
} from "./marketplace-data";

type BrowseClientProps = {
  agents: StorefrontAgent[];
  /** REAL count of live workspaces on SeldonFrame (1 workspace = 1 business),
   *  computed server-side. 0 → the hero omits the numeric claim entirely rather
   *  than fabricating one. */
  businessCount?: number;
  /** Initial category from ?niche / popular-link deep-links. */
  initialCategory?: CategoryKey | null;
  initialQuery?: string;
};

export function BrowseClient({ agents, businessCount = 0, initialCategory = null, initialQuery = "" }: BrowseClientProps): ReactElement {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<CategoryKey | null>(initialCategory);

  const featured = useMemo(() => agents.filter((a) => a.featured).slice(0, 3), [agents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter((a) => {
      if (category && a.category !== category) return false;
      if (q && `${a.name} ${a.tagline} ${a.category} ${a.builder}`.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }, [agents, query, category]);

  const categoryCounts = useMemo(() => {
    const counts = {} as Record<CategoryKey, number>;
    for (const key of CATEGORY_ORDER) counts[key] = 0;
    for (const a of agents) counts[a.category] = (counts[a.category] ?? 0) + 1;
    return counts;
  }, [agents]);

  const focusResults = () => {
    const el = document.getElementById("sf-results");
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
  };

  return (
    <main>
      {/* HERO — spotlight variant (the stronger of the two design explored). */}
      <section className="sf-hero-sec sf-sec" style={{ maxWidth: 1200, margin: "0 auto", padding: "74px 32px 26px" }}>
        <div className="sf-hero-grid" style={{ display: "grid", gridTemplateColumns: "1.12fr 0.88fr", gap: 60, alignItems: "center" }}>
          <div>
            <div style={kicker}>The agent marketplace</div>
            <h1 className="sf-hero-h1" style={{ margin: 0, fontSize: 62, lineHeight: 1.04, fontWeight: 600, letterSpacing: "-0.025em", maxWidth: 600 }}>
              Hire an agent.
              <br />
              It works 24/7,{" "}
              <span style={{ fontFamily: MKT.fontSerif, fontStyle: "italic", fontWeight: 400, color: MKT.green }}>
                for pennies.
              </span>
            </h1>
            <p style={{ margin: "24px 0 0", fontSize: 18.5, lineHeight: 1.55, color: "rgba(34,29,23,0.66)", maxWidth: 452 }}>
              Vetted AI agents that answer calls, book jobs, chase reviews, and win back customers — built by operators
              who run businesses like yours.
            </p>

            {/* hero search */}
            <div
              className="sf-hero-search"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "#fff",
                border: "1px solid rgba(34,29,23,0.13)",
                borderRadius: 14,
                padding: "6px 6px 6px 16px",
                margin: "28px 0 0",
                maxWidth: 452,
                boxShadow: "0 1px 2px rgba(34,29,23,0.04),0 10px 26px rgba(34,29,23,0.06)",
              }}
            >
              <span style={{ color: "rgba(34,29,23,0.5)", display: "flex" }}>
                <MarketplaceIcon name="search" size={20} />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What do you need done?"
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontFamily: "inherit",
                  fontSize: 16.5,
                  color: MKT.ink,
                  flex: 1,
                  padding: "10px 0",
                }}
              />
              <button
                type="button"
                className="sf-btn"
                onClick={focusResults}
                style={{
                  border: "none",
                  background: MKT.green,
                  color: "#fff",
                  fontFamily: "inherit",
                  fontWeight: 600,
                  fontSize: 15,
                  padding: "12px 20px",
                  borderRadius: 10,
                  cursor: "pointer",
                  boxShadow: "0 6px 16px rgba(5, 150, 105,0.26)",
                }}
              >
                Search
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, color: "rgba(34,29,23,0.46)" }}>Popular:</span>
              {POPULAR.map((chip) => (
                <button
                  key={chip.category}
                  type="button"
                  className="sf-link"
                  onClick={() => {
                    setCategory(chip.category);
                    setQuery("");
                  }}
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: MKT.ink,
                    background: "rgba(34,29,23,0.05)",
                    padding: "5px 12px",
                    borderRadius: 999,
                    cursor: "pointer",
                    border: "none",
                    fontFamily: "inherit",
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 34 }}>
              <div style={{ display: "flex" }}>
                {HERO_AVATARS.map((av) => (
                  <span
                    key={av.t}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      background: av.bg,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      border: "2.5px solid #F6F2EA",
                      marginLeft: -9,
                    }}
                  >
                    {av.t}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 14, color: "rgba(34,29,23,0.6)", lineHeight: 1.4 }}>
                {businessCount > 0 ? (
                  // REAL number — 1 workspace = 1 business. No fabricated rating.
                  <>
                    <strong style={{ color: MKT.ink, fontWeight: 700 }}>
                      {formatInstalls(businessCount)} {businessCount === 1 ? "business" : "businesses"}
                    </strong>{" "}
                    on SeldonFrame
                  </>
                ) : (
                  // Honest pre-launch line — no invented count or rating.
                  <>
                    <strong style={{ color: MKT.ink, fontWeight: 700 }}>Built by operators</strong>, for operators
                  </>
                )}
              </div>
            </div>
          </div>

          {/* live proof card */}
          <HeroProofCard agent={featured[0] ?? agents[0]} />
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="sf-sec" style={{ maxWidth: 1200, margin: "0 auto", padding: "44px 32px 8px" }}>
        <div className="sf-cat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 14 }}>
          {CATEGORY_ORDER.map((key) => {
            const active = category === key;
            const count = categoryCounts[key] ?? 0;
            return (
              <button
                key={key}
                type="button"
                className="sf-press"
                onClick={() => setCategory(active ? null : key)}
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  background: active ? "rgba(5, 150, 105,0.08)" : "#fff",
                  border: `1px solid ${active ? MKT.green : "rgba(34,29,23,0.10)"}`,
                  borderRadius: 16,
                  padding: "18px 16px 16px",
                  fontFamily: "inherit",
                  display: "flex",
                  flexDirection: "column",
                  gap: 11,
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 11,
                    background: active ? MKT.green : "rgba(5, 150, 105,0.10)",
                    color: active ? "#fff" : MKT.green,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MarketplaceIcon name={CATEGORY_META[key].icon} size={20} />
                </span>
                <span style={{ fontWeight: 650, fontSize: 14.5, color: MKT.ink, letterSpacing: "-0.01em" }}>
                  {CATEGORY_META[key].label}
                </span>
                <span style={{ fontSize: 12.5, color: "rgba(34,29,23,0.46)" }}>
                  {count} {count === 1 ? "agent" : "agents"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* FEATURED */}
      {featured.length > 0 ? (
        <section className="sf-sec" style={{ maxWidth: 1200, margin: "0 auto", padding: "42px 32px 8px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <h2 className="sf-sech2" style={sectionH2}>Featured this week</h2>
            <span style={{ fontSize: 13.5, color: "rgba(34,29,23,0.5)" }}>Hand-picked by the SeldonFrame team</span>
          </div>
          <div className="sf-feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
            {featured.map((agent) => (
              <AgentCard key={agent.slug} agent={agent} featured />
            ))}
          </div>
        </section>
      ) : null}

      {/* ALL AGENTS */}
      <section id="sf-results" className="sf-sec" style={{ maxWidth: 1200, margin: "0 auto", padding: "46px 32px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
          <h2 className="sf-sech2" style={sectionH2}>{category ? CATEGORY_META[category].label : "All agents"}</h2>
          <span style={{ fontSize: 14, color: "rgba(34,29,23,0.5)", fontFamily: MKT.fontMono }}>
            {filtered.length} {filtered.length === 1 ? "agent" : "agents"}
          </span>
          {category ? (
            <button
              type="button"
              className="sf-link"
              onClick={() => {
                setCategory(null);
                setQuery("");
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                border: "1px solid rgba(34,29,23,0.14)",
                background: "#fff",
                color: MKT.ink,
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 600,
                padding: "5px 11px",
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              {CATEGORY_META[category].label} <MarketplaceIcon name="x" size={13} stroke={2.4} />
            </button>
          ) : null}
        </div>

        {filtered.length > 0 ? (
          <div className="sf-all-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(296px,1fr))", gap: 18 }}>
            {filtered.map((agent) => (
              <AgentCard key={agent.slug} agent={agent} />
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "64px 0", color: "rgba(34,29,23,0.5)" }}>
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 16,
                background: "rgba(34,29,23,0.05)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(34,29,23,0.4)",
              }}
            >
              <MarketplaceIcon name="search" size={20} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: MKT.ink, marginTop: 16 }}>No agents match that yet</div>
            <div style={{ fontSize: 14.5, marginTop: 6 }}>
              Try a different search, or{" "}
              <button
                type="button"
                className="sf-link"
                onClick={() => {
                  setCategory(null);
                  setQuery("");
                }}
                style={{ color: MKT.green, fontWeight: 600, cursor: "pointer", border: "none", background: "none", fontFamily: "inherit", fontSize: 14.5 }}
              >
                browse everything
              </button>
              .
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

const POPULAR: { label: string; category: CategoryKey }[] = [
  { label: "Receptionist", category: "Receptionist" },
  { label: "Reviews", category: "Reviews" },
  { label: "Win-back", category: "Reactivation" },
];

const HERO_AVATARS = [
  { t: "PH", bg: "#059669" },
  { t: "RD", bg: "#B5651D" },
  { t: "VA", bg: "#3F6E54" },
  { t: "CP", bg: "#7A3B69" },
];

const kicker = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  color: "rgba(34,29,23,0.46)",
  marginBottom: 20,
} as const;

const sectionH2 = {
  margin: 0,
  fontSize: 25,
  fontWeight: 700,
  letterSpacing: "-0.02em",
  whiteSpace: "nowrap",
} as const;

/** The hero "live proof" card — a frozen sample conversation with a typing dot. */
function HeroProofCard({ agent }: { agent: StorefrontAgent }): ReactElement {
  const first = agent.sample.find((m) => m.role === "customer");
  const reply = agent.sample.find((m) => m.role === "agent");
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(34,29,23,0.10)",
        borderRadius: 22,
        padding: 22,
        boxShadow: "0 1px 2px rgba(34,29,23,0.05),0 30px 60px rgba(34,29,23,0.12)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 16, borderBottom: "1px solid rgba(34,29,23,0.08)" }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            background: "rgba(5, 150, 105,0.11)",
            color: MKT.green,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          <MarketplaceIcon name={agent.icon} size={22} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5, letterSpacing: "-0.01em" }}>{agent.name}</div>
          <div style={{ fontSize: 12.5, color: "rgba(34,29,23,0.5)" }}>built by {agent.builder}</div>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11.5,
            fontWeight: 700,
            color: MKT.green,
            background: "rgba(5, 150, 105,0.10)",
            padding: "5px 10px",
            borderRadius: 999,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 99, background: MKT.green, animation: "sfPulse 1.6s infinite" }} />
          Live
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "18px 0 4px" }}>
        {first ? (
          <div
            style={{
              alignSelf: "flex-end",
              maxWidth: "80%",
              background: "rgba(34,29,23,0.05)",
              color: MKT.ink,
              fontSize: 14.5,
              lineHeight: 1.45,
              padding: "11px 14px",
              borderRadius: "15px 15px 4px 15px",
            }}
          >
            {first.text}
          </div>
        ) : null}
        {reply ? (
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "82%",
              background: MKT.green,
              color: "#fff",
              fontSize: 14.5,
              lineHeight: 1.45,
              padding: "11px 14px",
              borderRadius: "15px 15px 15px 4px",
            }}
          >
            {reply.text}
          </div>
        ) : null}
        <div style={{ alignSelf: "flex-start", background: "rgba(5, 150, 105,0.10)", padding: "11px 16px", borderRadius: "15px 15px 15px 4px" }}>
          <span className="sf-typing">
            <span />
            <span />
            <span />
          </span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 14,
          paddingTop: 14,
          borderTop: "1px solid rgba(34,29,23,0.08)",
          fontSize: 12.5,
          color: "rgba(34,29,23,0.55)",
        }}
      >
        <span style={{ color: MKT.green, display: "flex" }}>
          <MarketplaceIcon name="checkCircle" size={16} />
        </span>
        <span>{agent.outcome}</span>
      </div>
    </div>
  );
}
