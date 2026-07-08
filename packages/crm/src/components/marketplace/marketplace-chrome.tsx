// Marketplace chrome — the shared nav + footer for the public storefront,
// matching the Claude Design output. Server components (no "use client"):
// the nav search is a plain GET <form> so browse works without JS, and the
// live search/filter island layers on top of it on the browse page.
//
// The brand mark is the REAL SeldonFrame logo — the "frame" mark shipped in
// components/landing/marketing-nav.tsx (the four-corner square with the
// connecting strokes), recolored per surface. NOT a placeholder.

import Link from "next/link";
import type { ReactElement } from "react";
import { MarketplaceIcon } from "./marketplace-icons";
import { MKT } from "./marketplace-data";
import { AGENT_JOBS } from "@/lib/seo/agent-pages";
import { COMPETITORS } from "@/lib/seo/alternative-pages";

/** Footer "Compare" links — every /alternative-to-<slug> page (from the
 *  registry, so a renamed competitor can't leave a dead link), plus the hub
 *  and the free tools. The PostPlanify-style internal-link block: these render
 *  on EVERY page using this footer, which is what makes the comparison pages
 *  crawlable from the whole surface. */
function compareFooterItems(): { label: string; href: string }[] {
  return [
    { label: "All comparisons", href: "/alternatives" },
    ...COMPETITORS.map((c) => ({
      label: `SeldonFrame vs ${c.name}`,
      href: `/compare/seldonframe-vs-${c.slug}`,
    })),
    { label: "Best-of guides", href: "/best" },
    { label: "Free tools", href: "/tools" },
  ];
}

/**
 * Footer "Browse" links into the /ai-agents directory. Each label maps to a REAL
 * AGENT_JOBS slug (resolved from the registry so it can't drift to a dead slug),
 * plus a catch-all into the directory root. This is the human path from the
 * marketplace chrome into the 171-page /ai-agents/* SEO tree.
 */
function browseFooterItems(): { label: string; href: string }[] {
  const linkFor = (label: string, slug: string): { label: string; href: string } => {
    // Resolve against the registry; throws at build if a slug ever goes stale.
    const job = AGENT_JOBS.find((j) => j.slug === slug);
    if (!job) throw new Error(`marketplace footer: no agent job for slug "${slug}"`);
    return { label, href: `/ai-agents/${job.slug}` };
  };
  return [
    linkFor("Receptionists", "ai-receptionist"),
    linkFor("Reviews & reputation", "google-review-agent"),
    linkFor("Reactivation", "win-back-agent"),
    linkFor("Quoting", "quote-estimate-agent"),
    { label: "All agents by industry →", href: "/ai-agents" },
  ];
}

/**
 * The real SeldonFrame frame mark (from marketing-nav.tsx), parameterized by
 * color so it can render dark-on-paper in the nav and paper-on-dark in the
 * footer / OG preview.
 */
export function SeldonFrameMark({
  size = 24,
  color = MKT.ink,
  accent = MKT.green,
}: {
  size?: number;
  color?: string;
  accent?: string;
}): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      <line x1="22" y1="22" x2="58" y2="22" stroke={accent} strokeWidth="6" strokeLinecap="round" />
      <line x1="78" y1="42" x2="78" y2="78" stroke={accent} strokeWidth="6" strokeLinecap="round" />
      <line x1="78" y1="78" x2="22" y2="78" stroke={color} strokeWidth="6" strokeLinecap="round" />
      <line x1="22" y1="78" x2="22" y2="22" stroke={color} strokeWidth="6" strokeLinecap="round" />
      <circle cx="22" cy="22" r="7" fill={color} />
      <circle cx="78" cy="22" r="7" fill="none" stroke={accent} strokeWidth="6" />
      <circle cx="78" cy="78" r="7" fill={accent} />
      <circle cx="22" cy="78" r="7" fill={color} />
    </svg>
  );
}

type NavTab = "browse" | "studio" | "sell";

/** Sticky top nav. `active` highlights the current section. */
export function MarketplaceNav({
  active = "browse",
  defaultQuery = "",
}: {
  active?: NavTab;
  defaultQuery?: string;
}): ReactElement {
  const navColor = (tab: NavTab) => (active === tab ? MKT.green : "rgba(34,29,23,0.62)");
  const navBg = (tab: NavTab) => (active === tab ? "rgba(0,137,123,0.10)" : "transparent");

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        background: "rgba(246,242,234,0.84)",
        borderBottom: "1px solid rgba(34,29,23,0.10)",
      }}
    >
      <div
        className="sf-mkt-nav"
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 32px",
          height: 66,
          display: "flex",
          alignItems: "center",
          gap: 30,
        }}
      >
        <Link
          href="/marketplace"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: MKT.ink,
            flex: "none",
          }}
        >
          <SeldonFrameMark size={23} />
          <span style={{ fontWeight: 700, fontSize: 16.5, letterSpacing: "-0.01em" }}>SeldonFrame</span>
          <span className="sf-mkt-navword" style={{ fontWeight: 500, fontSize: 16.5, color: "rgba(34,29,23,0.42)", letterSpacing: "-0.01em" }}>
            Marketplace
          </span>
        </Link>

        <nav className="sf-mkt-navlinks" style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
          <Link
            href="/marketplace"
            style={{ ...navPill, color: navColor("browse"), background: navBg("browse") }}
          >
            Browse
          </Link>
          <Link
            href="/ai-agents"
            style={{ ...navPill, color: "rgba(34,29,23,0.62)", background: "transparent" }}
          >
            By industry
          </Link>
          <Link
            href="/studio/agents"
            style={{ ...navPill, color: navColor("studio"), background: navBg("studio") }}
          >
            Studio
          </Link>
          <Link
            href="/studio/agents"
            style={{ ...navPill, color: navColor("sell"), background: navBg("sell") }}
          >
            Sell
          </Link>
        </nav>

        <div className="sf-mkt-navspacer" style={{ flex: 1 }} />

        {/* Plain GET search — works without JS; the browse island enhances it.
            Hidden on phones (the hero/nav search would overflow); the browse hero
            carries its own search field on mobile. */}
        <form
          action="/marketplace"
          method="get"
          className="sf-mkt-navsearch"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            background: "#fff",
            border: "1px solid rgba(34,29,23,0.12)",
            borderRadius: 999,
            padding: "8px 15px",
            width: 248,
            boxShadow: "0 1px 2px rgba(34,29,23,0.04)",
            flex: "none",
          }}
        >
          <span style={{ color: "rgba(34,29,23,0.55)", display: "flex" }}>
            <MarketplaceIcon name="search" size={16} />
          </span>
          <input
            name="q"
            defaultValue={defaultQuery}
            placeholder="Search agents"
            style={{
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: "inherit",
              fontSize: 14,
              color: MKT.ink,
              width: "100%",
            }}
          />
        </form>

        <Link
          href="/studio/agents"
          title="Your workspace"
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            background: MKT.dark,
            color: MKT.paper,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 14,
            flex: "none",
            textDecoration: "none",
          }}
        >
          SF
        </Link>
      </div>
    </header>
  );
}

const navPill = {
  padding: "7px 13px",
  borderRadius: 9,
  fontSize: 14.5,
  fontWeight: 600,
  textDecoration: "none",
} as const;

/** The dark footer. The buyer-facing "2% flat fee" line from the design is
 *  intentionally REMOVED — no marketplace fee is ever shown to buyers. */
export function MarketplaceFooter(): ReactElement {
  return (
    <footer style={{ background: MKT.dark, color: MKT.paper, marginTop: 30 }}>
      <div
        className="sf-foot-grid"
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "54px 32px 40px",
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1.1fr",
          gap: 32,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <SeldonFrameMark size={22} color={MKT.paper} accent={MKT.green} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>SeldonFrame Marketplace</span>
          </div>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: "rgba(246,242,234,0.6)", maxWidth: 280 }}>
            The marketplace for agents that{" "}
            <span style={{ fontFamily: MKT.fontSerif, fontStyle: "italic" }}>actually work</span> — answering, booking,
            and following up 24/7.
          </p>
        </div>
        <FooterCol title="Browse" items={browseFooterItems()} />
        <FooterCol
          title="Build"
          items={[
            { label: "List an agent", href: "/marketplace/build" },
            "MCP for builders",
            "Earnings & payouts",
            { label: "Builder docs", href: "/marketplace/build" },
          ]}
        />
        <FooterCol title="Company" items={["About", "Trust & safety", "Status", "Contact"]} />
        <FooterCol title="Compare" items={compareFooterItems()} />
      </div>
      <div style={{ borderTop: "1px solid rgba(246,242,234,0.12)" }}>
        <div
          className="sf-foot-bottom"
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "18px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, color: "rgba(246,242,234,0.5)" }}>
            © 2026 SeldonFrame. The engine stays invisible; your agents do the talking.
          </span>
          <span style={{ fontSize: 13, color: "rgba(246,242,234,0.6)", fontWeight: 600 }}>
            No lock-in · Cancel anytime
          </span>
        </div>
      </div>
    </footer>
  );
}

/** A footer link is either inert label text or a real navigable `{ label, href }`. */
type FooterItem = string | { label: string; href: string };

function FooterCol({ title, items }: { title: string; items: FooterItem[] }): ReactElement {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "rgba(246,242,234,0.4)",
          marginBottom: 14,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14, color: "rgba(246,242,234,0.7)" }}>
        {items.map((item) =>
          typeof item === "string" ? (
            <span key={item}>{item}</span>
          ) : (
            <Link
              key={item.label}
              href={item.href}
              className="sf-link"
              style={{ color: "rgba(246,242,234,0.7)", textDecoration: "none", width: "fit-content" }}
            >
              {item.label}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
