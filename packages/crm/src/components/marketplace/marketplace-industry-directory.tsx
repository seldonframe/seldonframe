// "Find an agent for your industry" — a server-rendered section that links the
// /marketplace browse page into the /ai-agents programmatic directory (171 pages).
//
// Two link surfaces, both pulled from AGENT_JOBS (never a duplicated job list):
//   1. A grid of every agent JOB → /ai-agents/<job> (the directory's Tier-1 hubs).
//   2. A row of high-intent job×VERTICAL combos → /ai-agents/<job>/for/<vertical>
//      (e.g. "AI Receptionist for plumbers"), the highest-converting deep links.
// Plus a "Browse all by industry →" catch-all into /ai-agents.
//
// This is a pure server component (no "use client"): it doubles as SEO internal
// linking, so the anchors must be in the static HTML. Design tokens come straight
// from MKT (paper/ink/green, Hanken+Newsreader), matching the marketplace system.

import Link from "next/link";
import type { ReactElement } from "react";
import { MarketplaceIcon } from "./marketplace-icons";
import { MKT, SURFACE_META } from "./marketplace-data";
import { AGENT_JOBS, getVertical } from "@/lib/seo/agent-pages";

/**
 * High-intent job×vertical combos to feature as deep-link chips. Each references
 * a real AGENT_JOBS slug + a real verticals slug (resolved below, so a typo can't
 * ship a dead link). These are the "money" emergency/booking trades.
 */
const FEATURED_COMBOS: { job: string; vertical: string }[] = [
  { job: "ai-receptionist", vertical: "plumbers" },
  { job: "ai-receptionist", vertical: "hvac" },
  { job: "missed-call-text-back", vertical: "electricians" },
  { job: "ai-lead-qualifier", vertical: "law-firms" },
  { job: "booking-concierge", vertical: "dentists" },
  { job: "speed-to-lead", vertical: "real-estate" },
];

export function MarketplaceIndustryDirectory(): ReactElement {
  // Resolve combos against the registries up front; getVertical/find throw at
  // build time if a slug ever drifts, so a broken link can't reach production.
  const combos = FEATURED_COMBOS.map(({ job: jobSlug, vertical: verticalSlug }) => {
    const job = AGENT_JOBS.find((j) => j.slug === jobSlug);
    if (!job) throw new Error(`industry directory: no agent job "${jobSlug}"`);
    const vertical = getVertical(verticalSlug);
    return {
      href: `/ai-agents/${job.slug}/for/${vertical.slug}`,
      label: `${job.name} for ${vertical.plural}`,
    };
  });

  return (
    <section
      aria-labelledby="sf-industry-heading"
      className="sf-dir-sec"
      style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 32px 64px" }}
    >
      <div
        className="sf-dir-card"
        style={{
          background: "#fff",
          border: "1px solid rgba(34,29,23,0.10)",
          borderRadius: 24,
          padding: "40px 38px",
          boxShadow: "0 1px 2px rgba(34,29,23,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
            marginBottom: 26,
          }}
        >
          <div style={{ maxWidth: 620 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: MKT.green,
                marginBottom: 10,
              }}
            >
              Find an agent for your industry
            </div>
            <h2
              id="sf-industry-heading"
              style={{ margin: 0, fontSize: 27, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.12 }}
            >
              Browse agents by the{" "}
              <span style={{ fontFamily: MKT.fontSerif, fontStyle: "italic", fontWeight: 400, color: MKT.green }}>
                job
              </span>{" "}
              they do
            </h2>
            <p style={{ margin: "10px 0 0", fontSize: 15.5, lineHeight: 1.5, color: "rgba(34,29,23,0.66)" }}>
              Each one deploys into your own hosted workspace in about a minute, grounded in your services, hours, and
              pricing — or rents over MCP.
            </p>
          </div>
          <Link
            href="/ai-agents"
            className="sf-link"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 14.5,
              fontWeight: 650,
              color: MKT.green,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Browse all by industry
            <MarketplaceIcon name="arrowRight" size={15} />
          </Link>
        </div>

        {/* Job grid — every AGENT_JOBS entry → its Tier-1 directory hub. */}
        <div
          className="sf-dir-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(232px,1fr))",
            gap: 12,
          }}
        >
          {AGENT_JOBS.map((job) => (
            <Link
              key={job.slug}
              href={`/ai-agents/${job.slug}`}
              className="sf-cardhover"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                textDecoration: "none",
                color: MKT.ink,
                background: MKT.paper,
                border: "1px solid rgba(34,29,23,0.10)",
                borderRadius: 14,
                padding: "13px 15px",
              }}
            >
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  background: "rgba(5, 150, 105,0.10)",
                  color: MKT.green,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "none",
                }}
              >
                <MarketplaceIcon name={SURFACE_META[job.surfaces[0]].icon} size={19} />
              </span>
              <span style={{ fontSize: 14.5, fontWeight: 650, letterSpacing: "-0.01em", lineHeight: 1.25 }}>
                {job.name}
              </span>
            </Link>
          ))}
        </div>

        {/* High-intent job×vertical deep links — the highest-converting pages. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            flexWrap: "wrap",
            marginTop: 22,
            paddingTop: 22,
            borderTop: "1px solid rgba(34,29,23,0.08)",
          }}
        >
          <span style={{ fontSize: 13, color: "rgba(34,29,23,0.5)", fontWeight: 600 }}>Popular for trades:</span>
          {combos.map((combo) => (
            <Link
              key={combo.href}
              href={combo.href}
              className="sf-link"
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: MKT.ink,
                background: "rgba(34,29,23,0.05)",
                padding: "6px 13px",
                borderRadius: 999,
                textDecoration: "none",
              }}
            >
              {combo.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
