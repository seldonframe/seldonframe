// packages/crm/src/components/landing/marketing-footer.tsx
//
// Redesign 2026-06-18 — warm light aesthetic.
// Six-column footer on md+ (brand + 5 link columns incl. the Compare/Free-tools
// SEO mesh, PostPlanify-style). Paper-soft background, warm ink typography.
// Dual CTA strip above the columns — SMB + agency paths.

import Link from "next/link";

import { BrandMark } from "./brand-mark";

type FooterLink = { label: string; href: string; soon?: boolean; external?: boolean };
type Column = { heading: string; links: readonly FooterLink[] };

const COLUMNS: readonly Column[] = [
  {
    heading: "Product",
    links: [
      { label: "How it works", href: "#build" },
      { label: "Features", href: "#modules" },
      { label: "Pricing", href: "#pricing" },
      { label: "Marketplace", href: "/marketplace" },
      { label: "Sell AI agents", href: "/sell" },
      { label: "For agencies", href: "/agencies" },
      { label: "Changelog", href: "https://github.com/seldonframe/crm/releases", external: true },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Guides", href: "/guides" },
      { label: "MCP / Claude Code", href: "https://github.com/seldonframe/crm#claude-code-mcp", external: true },
      { label: "API", href: "/docs" },
      { label: "Live demos", href: "#demos" },
      { label: "Status", href: "https://github.com/seldonframe/crm", external: true },
    ],
  },
  {
    heading: "Compare",
    links: [
      { label: "SeldonFrame vs GoHighLevel", href: "/compare/seldonframe-vs-gohighlevel" },
      { label: "SeldonFrame vs HubSpot", href: "/compare/seldonframe-vs-hubspot" },
      { label: "SeldonFrame vs Salesforce", href: "/compare/seldonframe-vs-salesforce" },
      { label: "SeldonFrame vs Zoho", href: "/compare/seldonframe-vs-zoho" },
      { label: "SeldonFrame vs ActiveCampaign", href: "/compare/seldonframe-vs-activecampaign" },
      { label: "SeldonFrame vs ClickFunnels", href: "/compare/seldonframe-vs-clickfunnels" },
      { label: "SeldonFrame vs Keap", href: "/compare/seldonframe-vs-keap" },
      { label: "SeldonFrame vs Klaviyo", href: "/compare/seldonframe-vs-klaviyo" },
      { label: "SeldonFrame vs Kartra", href: "/compare/seldonframe-vs-kartra" },
      { label: "SeldonFrame vs Vendasta", href: "/compare/seldonframe-vs-vendasta" },
      { label: "SeldonFrame vs Podium", href: "/compare/seldonframe-vs-podium" },
      { label: "SeldonFrame vs Linktree", href: "/compare/seldonframe-vs-linktree" },
      { label: "All comparisons →", href: "/alternatives" },
    ],
  },
  {
    heading: "Free tools",
    links: [
      { label: "CRM Pricing Index", href: "/charts/crm-pricing-index" },
      { label: "AI Website Generator", href: "/tools/ai-website-generator" },
      { label: "Free Booking Page", href: "/tools/free-booking-page" },
      { label: "Missed Call Calculator", href: "/tools/missed-call-calculator" },
      { label: "HubSpot Pricing Calculator", href: "/tools/hubspot-pricing-calculator" },
      { label: "GoHighLevel Cost Calculator", href: "/tools/gohighlevel-cost-calculator" },
      { label: "Voice AI Cost Calculator", href: "/tools/voice-ai-cost-calculator" },
      { label: "AI Receptionist Cost Calculator", href: "/tools/ai-receptionist-cost-calculator" },
      { label: "Google Review Link Generator", href: "/tools/google-review-link-generator" },
      { label: "Review Response Generator", href: "/tools/review-response-generator" },
      { label: "A2P 10DLC Checker", href: "/tools/a2p-10dlc-checker" },
      { label: "Best CRM for Small Business", href: "/best/crm-for-small-business" },
      { label: "Best-of guides →", href: "/best" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Contact", href: "mailto:hello@seldonframe.com" },
      { label: "Partnerships", href: "mailto:partner@seldonframe.com" },
      { label: "GitHub", href: "https://github.com/seldonframe/crm", external: true },
      { label: "Terms", href: "https://app.seldonframe.com/terms", external: true },
      { label: "Privacy", href: "https://app.seldonframe.com/policy", external: true },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer
      aria-labelledby="footer-heading"
      className="border-t border-[var(--lp-border-soft)] bg-[#EFE9DD] px-5 pb-12 pt-16 text-[var(--lp-muted)] md:px-8 md:pb-14 md:pt-20 lg:px-12 lg:pb-16 lg:pt-24"
    >
      <h2 id="footer-heading" className="sr-only">Footer</h2>

      <div className="mx-auto max-w-[1120px]">
        {/* Brand block */}
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_repeat(5,1fr)] md:gap-8">
          <div className="flex max-w-[340px] flex-col gap-5">
            <Link href="/" aria-label="SeldonFrame — home" className="inline-flex items-center">
              <BrandMark size={22} />
            </Link>
            <p className="m-0 text-[13.5px] leading-[1.55] text-[var(--lp-muted)]">
              Your complete front office — website, booking, AI receptionist, intake, and CRM —
              wired together so your business never misses a lead.
            </p>
            <div className="flex flex-col gap-2.5">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 self-start rounded-full bg-[var(--lp-cta-bg)] px-4 py-2.5 text-[13px] font-[500] text-[var(--lp-cta-ink)] shadow-[0_1px_2px_color-mix(in_oklab,var(--lp-ink)_10%,transparent),0_4px_12px_color-mix(in_oklab,var(--lp-ink)_8%,transparent),inset_0_1.5px_0_rgba(255,255,255,.10)] transition-all hover:-translate-y-px"
              >
                <span className="size-1.5 rounded-full bg-[var(--lp-accent)]" aria-hidden />
                Start building
              </Link>
              <Link
                href="/agencies"
                className="inline-flex items-center gap-1.5 self-start text-[13px] font-[500] text-[var(--lp-accent)] transition-colors hover:text-[#00695C]"
              >
                For agencies →
              </Link>
            </div>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <h3 className="m-0 mb-4 font-sans text-[11px] font-[600] uppercase tracking-[0.14em] text-[#9A9183]">
                {col.heading}
              </h3>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noopener noreferrer" : undefined}
                      className="text-[13.5px] text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-ink)]"
                    >
                      {link.label}
                      {link.soon ? (
                        <span className="ml-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#9A9183]">
                          SOON
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-3.5 border-t border-[var(--lp-border-soft)] pt-5 font-mono text-[11.5px] text-[#9A9183]">
          <span>© 2026 SeldonFrame, Inc. All rights reserved.</span>
          <span className="lp-record-only items-center text-[13.5px] text-[var(--lp-muted)]">
            Recordings stay private — they train your agent only.
          </span>
          <span className="inline-flex gap-4">
            <Link
              href="https://x.com/seldonframe"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#9A9183] transition-colors hover:text-[var(--lp-ink)]"
            >
              X
            </Link>
            <Link
              href="https://github.com/seldonframe/crm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#9A9183] transition-colors hover:text-[var(--lp-ink)]"
            >
              GitHub
            </Link>
            <Link
              href="https://linkedin.com/company/seldonframe"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#9A9183] transition-colors hover:text-[var(--lp-ink)]"
            >
              LinkedIn
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
