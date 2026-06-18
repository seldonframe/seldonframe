// packages/crm/src/components/landing/marketing-footer.tsx
//
// Redesign 2026-06-18 — warm light aesthetic.
// Five-column footer on md+. Paper-soft background, warm ink typography.
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
      { label: "For agencies", href: "#agencies" },
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
    heading: "Company",
    links: [
      { label: "Contact", href: "mailto:hello@seldonframe.com" },
      { label: "Partnerships", href: "mailto:partner@seldonframe.com" },
      { label: "GitHub", href: "https://github.com/seldonframe/crm", external: true },
    ],
  },
  {
    heading: "Legal",
    links: [
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
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.6fr_repeat(4,1fr)] md:gap-10">
          <div className="flex max-w-[340px] flex-col gap-5">
            <Link
              href="/"
              aria-label="SeldonFrame — home"
              className="inline-flex items-center gap-2.5 text-[15px] font-[500] tracking-[-0.01em] text-[#221D17]"
            >
              <svg width="20" height="25" viewBox="0 0 70 88" fill="none" aria-hidden>
                <rect x="0" y="0" width="34" height="16" rx="3" fill="#4DB6AC" />
                <rect x="36" y="0" width="34" height="16" rx="3" fill="#00897B" />
                <rect x="0" y="18" width="34" height="16" rx="3" fill="#00796B" />
                <rect x="0" y="36" width="34" height="16" rx="3" fill="#00897B" />
                <rect x="36" y="36" width="34" height="16" rx="3" fill="#00796B" />
                <rect x="36" y="54" width="34" height="16" rx="3" fill="#00695C" />
                <rect x="0" y="72" width="34" height="16" rx="3" fill="#00796B" />
                <rect x="36" y="72" width="34" height="16" rx="3" fill="#004D40" />
              </svg>
              SeldonFrame
            </Link>
            <p className="m-0 text-[13.5px] leading-[1.55] text-[#6E665A]">
              A complete AI front office — website, booking, AI receptionist, intake form, and CRM —
              wired together and live in under a minute.
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
                href="#agencies"
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
