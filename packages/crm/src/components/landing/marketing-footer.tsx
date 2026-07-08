// packages/crm/src/components/landing/marketing-footer.tsx
//
// Redesign 2026-06-18 — warm light aesthetic.
// Six-column footer on md+ (brand + 5 link columns incl. the Compare/Free-tools
// SEO mesh, PostPlanify-style). Paper-soft background, warm ink typography.
// Dual CTA strip above the columns — SMB + agency paths.

import Link from "next/link";

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
      { label: "For agencies", href: "/agencies" },
      { label: "Changelog", href: "https://github.com/seldonframe/crm/releases", external: true },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
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
      { label: "Missed Call Calculator", href: "/tools/missed-call-calculator" },
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
      className="border-t border-[rgba(34,29,23,.08)] bg-[#EFE9DD] px-5 pb-12 pt-16 text-[#6E665A] md:px-8 md:pb-14 md:pt-20 lg:px-12 lg:pb-16 lg:pt-24"
    >
      <h2 id="footer-heading" className="sr-only">Footer</h2>

      <div className="mx-auto max-w-[1120px]">
        {/* Brand block */}
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_repeat(5,1fr)] md:gap-8">
          <div className="flex max-w-[340px] flex-col gap-5">
            <Link
              href="/"
              aria-label="SeldonFrame — home"
              className="inline-flex items-center gap-2.5 text-[15px] font-[500] tracking-[-0.01em] text-[#221D17]"
            >
              <svg width="20" height="20" viewBox="0 0 100 100" fill="none" aria-hidden>
                <line x1="22" y1="22" x2="58" y2="22" stroke="#00897B" strokeWidth="6" strokeLinecap="round" />
                <line x1="78" y1="42" x2="78" y2="78" stroke="#00897B" strokeWidth="6" strokeLinecap="round" />
                <line x1="78" y1="78" x2="22" y2="78" stroke="#00897B" strokeWidth="6" strokeLinecap="round" />
                <line x1="22" y1="78" x2="22" y2="22" stroke="#00897B" strokeWidth="6" strokeLinecap="round" />
                <circle cx="22" cy="22" r="7" fill="#00897B" />
                <circle cx="78" cy="22" r="7" fill="none" stroke="#00897B" strokeWidth="6" />
                <circle cx="78" cy="78" r="7" fill="#00897B" />
                <circle cx="22" cy="78" r="7" fill="#00897B" />
              </svg>
              SeldonFrame
            </Link>
            <p className="m-0 text-[13.5px] leading-[1.55] text-[#6E665A]">
              Your complete front office — website, booking, AI receptionist, intake, and CRM —
              wired together so your business never misses a lead.
            </p>
            <div className="flex flex-col gap-2.5">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 self-start rounded-full bg-[#1F2B24] px-4 py-2.5 text-[13px] font-[500] text-[#F6F2EA] shadow-[0_1px_2px_rgba(34,29,23,.10),0_4px_12px_rgba(34,29,23,.08),inset_0_1.5px_0_rgba(255,255,255,.10)] transition-all hover:-translate-y-px"
              >
                <span className="size-1.5 rounded-full bg-[#00897B]" aria-hidden />
                Start building
              </Link>
              <Link
                href="/agencies"
                className="inline-flex items-center gap-1.5 self-start text-[13px] font-[500] text-[#00897B] transition-colors hover:text-[#00695C]"
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
                      className="text-[13.5px] text-[#6E665A] transition-colors hover:text-[#221D17]"
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

        <div className="mt-14 flex flex-wrap items-center justify-between gap-3.5 border-t border-[rgba(34,29,23,.10)] pt-5 font-mono text-[11.5px] text-[#9A9183]">
          <span>© 2026 SeldonFrame, Inc. All rights reserved.</span>
          <span className="inline-flex gap-4">
            <Link
              href="https://x.com/seldonframe"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#9A9183] transition-colors hover:text-[#221D17]"
            >
              X
            </Link>
            <Link
              href="https://github.com/seldonframe/crm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#9A9183] transition-colors hover:text-[#221D17]"
            >
              GitHub
            </Link>
            <Link
              href="https://linkedin.com/company/seldonframe"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#9A9183] transition-colors hover:text-[#221D17]"
            >
              LinkedIn
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
