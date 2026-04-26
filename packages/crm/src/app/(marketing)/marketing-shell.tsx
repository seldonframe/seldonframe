// Shared chrome for marketing-group pages.
// Workstream 2 — minimal nav (logo + back-to-home + GitHub) and a
// consistent footer that matches the landing-page footer link set
// (so footer link tests resolve consistently no matter which page
// the visitor lands on).

import type { ReactNode } from "react";

const LogoSVG = () => (
  <svg viewBox="0 0 100 100" fill="none" className="w-[26px] h-[26px]">
    <line x1="22" y1="22" x2="58" y2="22" stroke="#1FAE85" strokeWidth="3" strokeLinecap="round" />
    <line x1="78" y1="42" x2="78" y2="78" stroke="#1FAE85" strokeWidth="3" strokeLinecap="round" />
    <line x1="78" y1="78" x2="22" y2="78" stroke="#1FAE85" strokeWidth="3" strokeLinecap="round" />
    <line x1="22" y1="78" x2="22" y2="22" stroke="#1FAE85" strokeWidth="3" strokeLinecap="round" />
    <circle cx="22" cy="22" r="6" fill="#1FAE85" />
    <circle cx="78" cy="22" r="6" fill="none" stroke="#1FAE85" strokeWidth="3" />
    <circle cx="78" cy="78" r="6" fill="#1FAE85" />
    <circle cx="22" cy="78" r="6" fill="#1FAE85" />
  </svg>
);

const FOOTER_LINKS: Array<{ label: string; href: string; external?: boolean }> = [
  { label: "GitHub", href: "https://github.com/seldonframe/seldonframe", external: true },
  { label: "Docs", href: "/docs" },
  { label: "Discord", href: "https://discord.gg/sbVUu976NW", external: true },
  { label: "𝕏", href: "https://x.com/seldonframe", external: true },
  { label: "Blog", href: "/blog" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <>
      <nav className="sticky top-0 z-[100] flex items-center justify-between px-4 py-3 md:px-12 md:py-[14px] bg-[#09090b]/90 backdrop-blur-[20px] border-b border-white/5">
        <a href="/" className="flex items-center gap-[10px] text-[#fafafa] hover:opacity-90 transition-opacity">
          <LogoSVG />
          <span className="text-[17px] font-semibold tracking-[-0.02em]">SeldonFrame</span>
        </a>
        <div className="flex items-center gap-4 md:gap-7">
          <a href="/" className="text-[14px] text-[#a1a1aa] hover:text-[#fafafa] transition-colors">Home</a>
          <a href="/docs" className="text-[14px] text-[#a1a1aa] hover:text-[#fafafa] transition-colors">Docs</a>
          <a
            href="https://github.com/seldonframe/seldonframe"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[14px] text-[#a1a1aa] hover:text-[#fafafa] transition-colors"
          >
            GitHub
          </a>
        </div>
      </nav>

      <main>{children}</main>

      <footer className="py-9 px-12 text-center border-t border-white/5">
        <div className="flex justify-center gap-6 mb-4 flex-wrap">
          {FOOTER_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener noreferrer" : undefined}
              className="text-[13px] text-[#71717a] hover:text-[#fafafa] transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>
        <div className="text-[11px] text-[#3f3f46]">
          © 2026 SeldonFrame. Open source under MIT License.
        </div>
      </footer>
    </>
  );
}
