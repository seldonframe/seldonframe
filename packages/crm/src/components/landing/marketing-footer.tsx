// packages/crm/src/components/landing/marketing-footer.tsx
//
// 2026-05-22 — Port of HTML §13 FOOTER. Five-column layout on md+:
// brand block + Product / Resources / Company / Legal nav columns.
// Bottom row carries the copyright + X / GitHub / LinkedIn social
// links.
//
// Links that don't yet have a real destination are kept as static
// anchors (e.g. /docs, /api, /changelog) — the handoff README §41
// flags these as "Things that need real wiring before launch" and
// the user's task spec confirms: "All footer links go to placeholder
// paths — wire to real routes." For now we ship the links as-is
// matching the HTML; future task will swap them to live routes
// when those routes exist.

import Link from "next/link";

type FooterLink = { label: string; href: string; soon?: boolean; external?: boolean };
type Column = { heading: string; links: readonly FooterLink[] };

const COLUMNS: readonly Column[] = [
  {
    heading: "Product",
    links: [
      { label: "Build", href: "#build" },
      { label: "Modules", href: "#modules" },
      { label: "Pricing", href: "#pricing" },
      { label: "Changelog", href: "https://github.com/seldonframe/crm/releases", external: true },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "MCP", href: "https://github.com/seldonframe/crm#claude-code-mcp", external: true },
      { label: "API", href: "/docs" },
      { label: "Prospecting playbook", href: "#", soon: true },
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
      className="border-t border-zinc-900 bg-[#08080a] px-5 pb-10 pt-20 text-zinc-400 md:px-8 md:pb-12 md:pt-24 lg:px-12 lg:pb-14 lg:pt-28"
    >
      <h2 id="footer-heading" className="sr-only">
        Footer
      </h2>
      <div className="mx-auto max-w-[1200px]">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.6fr_repeat(4,1fr)] md:gap-10">
          <div className="flex max-w-[360px] flex-col gap-[18px]">
            <Link
              href="/"
              aria-label="SeldonFrame — home"
              className="inline-flex items-center gap-2.5 text-base font-semibold tracking-tight text-zinc-100"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3" y="3" width="18" height="18" rx="3" stroke="#14b8a6" strokeWidth="1.6" />
                <path d="M8 12L11 15L16 9" stroke="#14b8a6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Seldon<span className="font-medium text-zinc-500">Frame</span>
            </Link>
            <p className="m-0 text-[13.5px] leading-[1.55] text-zinc-500">
              The OS your agency sells to local businesses. One paste, one workspace, sub-minute build.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <h3 className="m-0 mb-3.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                {col.heading}
              </h3>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noopener noreferrer" : undefined}
                      className="text-[13.5px] text-zinc-300 transition-colors hover:text-zinc-100"
                    >
                      {link.label}
                      {link.soon ? (
                        <span className="ml-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-zinc-600">
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

        <div className="mt-14 flex flex-wrap justify-between gap-3.5 border-t border-zinc-900 pt-[22px] font-mono text-[11.5px] text-zinc-600">
          <span>© 2026 SeldonFrame, Inc. All rights reserved.</span>
          <span className="inline-flex gap-3">
            <Link
              href="https://x.com/seldonframe"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 transition-colors hover:text-zinc-200"
            >
              X
            </Link>
            <Link
              href="https://github.com/seldonframe/crm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 transition-colors hover:text-zinc-200"
            >
              GitHub
            </Link>
            <Link
              href="https://linkedin.com/company/seldonframe"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 transition-colors hover:text-zinc-200"
            >
              LinkedIn
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
