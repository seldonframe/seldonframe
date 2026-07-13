"use client";

// The dual CTA for a programmatic agent page — the ONLY interactive island on
// the SEO/GEO page (everything else is server-rendered for crawlers + LLMs).
//
//   • PRIMARY  "Deploy it for my business →" — a plain <Link> to the magic
//     first-run build flow, carrying the canonical agent so the user lands with
//     THAT agent (e.g. /clients/new?agent=ai-phone-receptionist&intent=build).
//     A link, not a button, so it's crawlable and works without JS.
//   • SECONDARY "Rent via MCP" — reveals the public MCP endpoint + a copyable
//     client-config snippet (matching the marketplace listing's Rent panel). If
//     the job has a live marketplace listing we also deep-link to it.
//
// Matches the marketplace design tokens (MKT) + the listing-actions copy button.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceIcon } from "@/components/marketplace/marketplace-icons";
import { MKT } from "@/components/marketplace/marketplace-data";

export type AgentPageCtaProps = {
  /** Display name of the agent (for the deploy headline). */
  agentName: string;
  /** The build-flow href carrying the agent (built by the page server side). */
  deployHref: string;
  /** The public Rent-via-MCP endpoint for this agent. */
  mcpEndpoint: string;
  /** A copyable MCP client-config snippet pointing at the endpoint. */
  mcpSnippet: string;
  /** If a live marketplace listing exists, its slug (deep-links the Rent panel
   *  to the full listing where a real, scoped rental key can be minted). */
  marketplaceSlug?: string;
};

export function AgentPageCta({
  agentName,
  deployHref,
  mcpEndpoint,
  mcpSnippet,
  marketplaceSlug,
}: AgentPageCtaProps): ReactElement {
  const [mcpOpen, setMcpOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const copySnippet = useCallback(() => {
    try {
      void navigator.clipboard.writeText(mcpSnippet);
    } catch {
      /* clipboard unavailable — no-op */
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1800);
  }, [mcpSnippet]);

  return (
    <div
      style={{
        background: MKT.dark,
        color: MKT.paper,
        borderRadius: 22,
        padding: "34px 30px",
        boxShadow: "0 1px 2px rgba(34,29,23,0.05),0 24px 56px rgba(34,29,23,0.16)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* soft green glow, matching the install ceremony backdrop */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 50% 0%,rgba(5, 150, 105,0.22),transparent 60%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <h2
          style={{
            margin: 0,
            fontSize: 27,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.12,
            color: MKT.paper,
          }}
        >
          Get your {agentName} working today.{" "}
          <span style={{ fontFamily: MKT.fontSerif, fontStyle: "italic", fontWeight: 400, color: MKT.greenLight }}>
            Two ways in.
          </span>
        </h2>
        <p style={{ margin: "10px 0 24px", fontSize: 15.5, lineHeight: 1.55, color: "rgba(246,242,234,0.66)", maxWidth: 520 }}>
          Deploy it into your own hosted workspace — grounded in your services, hours, and pricing — or rent it over MCP
          and call it from any agent. No card required to start.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {/* PRIMARY — deploy carries the agent into the magic build flow */}
          <Link
            href={deployHref}
            className="sf-btn"
            style={{
              flex: "1 1 240px",
              border: "none",
              background: MKT.green,
              color: "#fff",
              fontWeight: 700,
              fontSize: 16,
              padding: "16px 22px",
              borderRadius: 14,
              cursor: "pointer",
              textDecoration: "none",
              boxShadow: "0 10px 28px rgba(5, 150, 105,0.34)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
            }}
          >
            <MarketplaceIcon name="package" size={19} />
            Deploy it for my business
            <MarketplaceIcon name="arrowRight" size={17} />
          </Link>

          {/* SECONDARY — toggle the Rent-via-MCP panel */}
          <button
            type="button"
            className="sf-btn"
            onClick={() => setMcpOpen((v) => !v)}
            aria-expanded={mcpOpen}
            style={{
              flex: "0 1 auto",
              border: "1px solid rgba(246,242,234,0.22)",
              background: "rgba(246,242,234,0.06)",
              color: MKT.paper,
              fontFamily: "inherit",
              fontWeight: 650,
              fontSize: 15,
              padding: "16px 22px",
              borderRadius: 14,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
            }}
          >
            <MarketplaceIcon name="terminal" size={17} />
            Rent via MCP
          </button>
        </div>

        {mcpOpen ? (
          <div
            className="sf-rise"
            style={{
              marginTop: 22,
              borderTop: "1px solid rgba(246,242,234,0.12)",
              paddingTop: 20,
            }}
          >
            <div style={mcpLabel}>MCP endpoint</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(0,0,0,0.28)",
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 16,
              }}
            >
              <code
                style={{
                  flex: 1,
                  color: "#9FE8DD",
                  fontFamily: MKT.fontMono,
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {mcpEndpoint}
              </code>
            </div>

            <div style={mcpLabel}>Add to your MCP client</div>
            <div style={{ position: "relative", background: "rgba(0,0,0,0.28)", borderRadius: 11, padding: 14, overflow: "auto" }}>
              <button
                type="button"
                className="sf-btn"
                onClick={copySnippet}
                style={{
                  position: "absolute",
                  top: 9,
                  right: 9,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  border: "1px solid rgba(246,242,234,0.18)",
                  background: "rgba(246,242,234,0.06)",
                  color: MKT.paper,
                  fontFamily: "inherit",
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <MarketplaceIcon name="copy" size={13} />
                {copied ? "Copied" : "Copy"}
              </button>
              <pre
                style={{
                  margin: 0,
                  color: "#E8E2D6",
                  fontFamily: MKT.fontMono,
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  whiteSpace: "pre",
                }}
              >
                {mcpSnippet}
              </pre>
            </div>

            <p style={{ margin: "14px 0 0", fontSize: 12.5, color: "rgba(246,242,234,0.6)", lineHeight: 1.5 }}>
              {marketplaceSlug ? (
                <>
                  Mint a real, scoped rental key on the{" "}
                  <Link href={`/marketplace/${marketplaceSlug}`} style={{ color: MKT.greenLight, fontWeight: 600 }}>
                    marketplace listing
                  </Link>
                  , paste it in place of <code style={{ fontFamily: MKT.fontMono }}>sk_live_…</code>, then call the agent&rsquo;s{" "}
                  <code style={{ fontFamily: MKT.fontMono }}>ask</code> tool from any MCP client.
                </>
              ) : (
                <>
                  Deploy the agent first, then generate a scoped rental key from your workspace and paste it in place of{" "}
                  <code style={{ fontFamily: MKT.fontMono }}>sk_live_…</code> to call the agent&rsquo;s{" "}
                  <code style={{ fontFamily: MKT.fontMono }}>ask</code> tool from any MCP client.
                </>
              )}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const mcpLabel = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(246,242,234,0.5)",
  marginBottom: 8,
} as const;
