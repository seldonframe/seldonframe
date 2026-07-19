// Agent card — the editorial card used in the browse grid + the Featured row,
// matching the Claude Design output. Pure presentational; renders as a Next
// <Link> to the listing detail so it works as a server component (no client JS
// needed for navigation). Hover lift is driven by the shared .sf-cardhover CSS
// in marketplace-styles.tsx.

import Link from "next/link";
import type { ReactElement } from "react";
import { MarketplaceIcon } from "./marketplace-icons";
import {
  SURFACE_META,
  installsLabel,
  priceLabel,
  priceColor,
  priceBg,
  MKT,
  type StorefrontAgent,
} from "./marketplace-data";

export function AgentCard({ agent, featured = false }: { agent: StorefrontAgent; featured?: boolean }): ReactElement {
  // A non-one-time pricing model carries a pre-formatted label ("$29/mo",
  // "$2 per call"); fall back to the one-time price derivation otherwise.
  const priceText = agent.priceLabelOverride ?? priceLabel(agent.priceCents);
  return (
    <Link
      href={`/marketplace/${agent.slug}`}
      className="sf-cardhover"
      style={{
        textDecoration: "none",
        color: MKT.ink,
        background: "#fff",
        border: "1px solid rgba(34,29,23,0.10)",
        borderRadius: 18,
        padding: featured ? 22 : 20,
        boxShadow: "0 1px 2px rgba(34,29,23,0.04),0 12px 26px rgba(34,29,23,0.055)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {featured ? (
        <span
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: MKT.green,
            background: "rgba(31, 43, 36,0.10)",
            padding: "5px 9px",
            borderRadius: 999,
          }}
        >
          <MarketplaceIcon name="star" size={12} filled />
          Featured
        </span>
      ) : null}

      <div
        style={
          featured
            ? undefined
            : { display: "flex", alignItems: "flex-start", justifyContent: "space-between" }
        }
      >
        <span
          style={{
            width: featured ? 50 : 46,
            height: featured ? 50 : 46,
            borderRadius: featured ? 14 : 13,
            background: "rgba(31, 43, 36,0.10)",
            color: MKT.green,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MarketplaceIcon name={agent.icon} size={23} />
        </span>
        {!featured ? (
          <span
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: priceColor(agent.priceCents),
              background: priceBg(agent.priceCents),
              padding: "5px 11px",
              borderRadius: 999,
              fontFamily: MKT.fontMono,
            }}
          >
            {priceText}
          </span>
        ) : null}
      </div>

      <div style={{ fontWeight: 700, fontSize: featured ? 18.5 : 17.5, letterSpacing: "-0.015em", marginTop: featured ? 16 : 15 }}>
        {agent.name}
      </div>
      <div
        style={{
          fontSize: featured ? 14.5 : 14,
          lineHeight: 1.45,
          color: "rgba(34,29,23,0.62)",
          marginTop: 5,
          minHeight: featured ? 42 : 40,
        }}
      >
        {agent.tagline}
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: featured ? 14 : 13 }}>
        {agent.surfaces.map((key) => (
          <span
            key={key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              fontWeight: 600,
              color: "rgba(34,29,23,0.62)",
              background: "rgba(34,29,23,0.05)",
              padding: "4px 9px",
              borderRadius: 999,
            }}
          >
            <MarketplaceIcon name={SURFACE_META[key].icon} size={13} />
            {SURFACE_META[key].label}
          </span>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: featured ? 18 : 16,
          paddingTop: featured ? 15 : 14,
          borderTop: "1px solid rgba(34,29,23,0.08)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "rgba(34,29,23,0.6)" }}>
          {agent.isSeed || agent.installs <= 0 ? (
            // Honest "just launched" state — no fabricated rating or install count.
            <span
              style={{
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: MKT.green,
                background: "rgba(31, 43, 36,0.10)",
                padding: "3px 8px",
                borderRadius: 999,
                fontFamily: MKT.fontMono,
              }}
            >
              New
            </span>
          ) : (
            <>
              <span style={{ color: MKT.green, display: "flex" }}>
                <MarketplaceIcon name="star" size={featured ? 12 : 13} filled />
              </span>
              <span style={{ fontWeight: 700, color: MKT.ink, fontFamily: MKT.fontMono }}>{agent.rating}</span>
              <span style={{ fontFamily: MKT.fontMono }}>· {installsLabel(agent)}</span>
            </>
          )}
        </span>
        {featured ? (
          <span style={{ fontWeight: 700, fontSize: 14.5, color: priceColor(agent.priceCents), fontFamily: MKT.fontMono }}>
            {priceText}
          </span>
        ) : (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: "rgba(34,29,23,0.5)",
              whiteSpace: "nowrap",
              flex: "none",
            }}
          >
            {agent.builder}
            {agent.verified ? (
              <span style={{ color: MKT.green, display: "flex" }}>
                <MarketplaceIcon name="shield" size={13} />
              </span>
            ) : null}
          </span>
        )}
      </div>

      {featured ? (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 10, fontSize: 12.5, color: "rgba(34,29,23,0.5)" }}>
          built by {agent.builder}
          {agent.verified ? (
            <span style={{ color: MKT.green, display: "flex" }} title="Verified builder">
              <MarketplaceIcon name="shield" size={13} />
            </span>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}
