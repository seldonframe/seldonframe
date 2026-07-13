// Cut C Phase 7 — Footer refresh.
//
// Two-tier layout: (a) a prominent "Open source on GitHub" call-to-
// arms block at the top of the footer — last chance to capture
// developer-curious agency owners before they leave the page; (b) a
// real Product / Resources / Legal link grid replacing the prior
// stub's `href="#"` placeholders.
//
// License string is AGPL-3.0-or-later (verified against repo LICENSE
// file May 2026). The prior footer said "MIT" — drift, fixed here.
// Cut A + Cut B + Cut C all share this footer; the AGPL-3.0 badge
// also satisfies the open-source positioning the marketing page now
// leans on (open-source section above, FAQ §6 isolation answer, the
// pricing page's "BYOK on all tiers" rail).
//
// GitHub repo: seldonframe/crm (matches nav.tsx and the rest of Cut C).

import Link from "next/link";
import { GitFork, ExternalLink } from "lucide-react";
// lucide-react@1.7 doesn't export a Github icon — GitFork pairs with
// the "fork it" CTA copy.

type FooterLink = { label: string; href: string; external?: boolean };

const PRODUCT_LINKS: readonly FooterLink[] = [
  { label: "Pricing", href: "#pricing" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Open source", href: "#open-source" },
  { label: "FAQ", href: "#faq" },
];

const RESOURCE_LINKS: readonly FooterLink[] = [
  {
    label: "Claude Code MCP",
    href: "https://github.com/seldonframe/crm#claude-code-mcp",
    external: true,
  },
  {
    label: "GitHub Issues",
    href: "https://github.com/seldonframe/crm/issues",
    external: true,
  },
  {
    label: "Changelog",
    href: "https://github.com/seldonframe/crm/releases",
    external: true,
  },
];

const LEGAL_LINKS: readonly FooterLink[] = [
  { label: "Privacy", href: "https://app.seldonframe.com/policy", external: true },
  { label: "Terms", href: "https://app.seldonframe.com/terms", external: true },
];

function renderLinkList(links: readonly FooterLink[]) {
  return links.map((link) => (
    <Link
      key={link.label}
      href={link.href}
      target={link.external ? "_blank" : undefined}
      rel={link.external ? "noopener noreferrer" : undefined}
      className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
    >
      {link.label}
    </Link>
  ));
}

export function LandingFooter() {
  return (
    <footer
      aria-labelledby="footer-heading"
      className="border-t border-zinc-800/30 py-12"
    >
      <h2 id="footer-heading" className="sr-only">
        Footer
      </h2>
      <div className="mx-auto max-w-5xl px-6">
        {/* GitHub call-to-arms block. Last surface before the visitor
            leaves the page — the buyer who scrolled this far is either
            committed or just-looking; this gives the just-looking
            segment one more reason to bookmark us. */}
        <div className="mb-10 flex flex-col items-start justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold text-zinc-100">
              Open source on GitHub
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Star the repo, file an issue, or fork it. PRs welcome — see CONTRIBUTING.md.
            </p>
          </div>
          <Link
            href="https://github.com/seldonframe/crm"
            target="_blank"
            rel="noopener noreferrer"
            // a11y: zinc-950 on teal #059669 = 7.2:1 (white-on-teal
            // was 2.6:1 — fails WCAG AA). Matches the pricing CTA fix.
            className="inline-flex items-center gap-2 rounded-lg bg-[#059669] px-4 py-2 text-sm font-semibold text-zinc-950 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#059669]"
          >
            <GitFork size={16} aria-hidden="true" />
            View on GitHub
            <ExternalLink size={12} aria-hidden="true" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <span className="text-sm font-semibold text-zinc-100">SeldonFrame</span>
            <p className="mt-4 text-xs leading-relaxed text-zinc-500">
              © 2026 SeldonFrame.
              <br />
              Open source under{" "}
              <Link
                href="https://github.com/seldonframe/crm/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-300 hover:decoration-zinc-500"
              >
                AGPL-3.0-or-later
              </Link>
              .
            </p>
          </div>

          <nav aria-label="Product" className="flex flex-col gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Product
            </span>
            {renderLinkList(PRODUCT_LINKS)}
          </nav>

          <nav aria-label="Resources" className="flex flex-col gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Resources
            </span>
            {renderLinkList(RESOURCE_LINKS)}
          </nav>

          <nav aria-label="Legal" className="flex flex-col gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Legal
            </span>
            {renderLinkList(LEGAL_LINKS)}
          </nav>
        </div>
      </div>
    </footer>
  );
}
