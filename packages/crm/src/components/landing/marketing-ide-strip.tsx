// packages/crm/src/components/landing/marketing-ide-strip.tsx
//
// "Works with your IDE" strip — added alongside the "One server. Every IDE."
// install section on /build (packages/crm/src/app/build/page.tsx). Same
// compact parchment-band + chip-row pattern as MarketingProofStrip (slim,
// server component, no client hooks), placed right after the 3-minute
// BuildSteps demo since installing from an IDE is a "how it works" detail, not
// a proof or pricing point. Links to the fuller install section on /build.
//
// The six IDE names are kept as plain data (not re-imported from
// lib/build/landing-content) because that module is CRM-app-internal build
// content; duplicating six literal names here is simpler and lower-risk than
// creating a cross-cutting shared import for a one-line list that changes
// rarely. If the list ever drifts, the /build page + its IDE_INSTALLS array
// remain the source of truth for the actual install snippets.
//
// 2026-07-13 (Motion Slice 1, Task 8) — augmented with a `Terminal` demo
// (packages/crm/src/components/ui/magic/terminal.tsx) typing the real
// connect command, so "works with your IDE" is shown, not just claimed.
// The command string (`npx -y @seldonframe/mcp`) and the flavor line below
// it are copied verbatim from the existing motion-lab demo
// (app/(dev)/motion-lab/motion-lab-client.tsx's `TerminalDemo`) — same
// literal string, not re-derived, per the repo's truth-pass convention.
// This section never renders in "record" mode (it's buildStack-only, see
// unified-landing.tsx), so it intentionally keeps this file's existing
// hardcoded parchment hex values instead of the `--lp-*` tokens — those
// values ARE the build-mode palette. The Terminal's default shadcn
// `border-border`/`bg-background` classes are overridden via `className`
// with the same local hex values so the terminal chrome matches this card
// row regardless of the app shell's own light/dark class.

import Link from "next/link";
import { Terminal, TypingAnimation, AnimatedSpan } from "@/components/ui/magic/terminal";

// 2026-07-13 — the text-name pill row is replaced by real IDE logos, and the
// Terminal is promoted to the centerpiece: "works with your IDE" is shown by
// the connect command running, not asserted by a chip list.
const IDES = [
  { name: "Claude Code", logo: "/brand/ide/claude.svg" },
  { name: "Cursor", logo: "/brand/ide/cursor.svg" },
  { name: "Windsurf", logo: "/brand/ide/windsurf.svg" },
  { name: "VS Code", logo: "/brand/ide/vscode.svg" },
  { name: "Zed", logo: "/brand/ide/zed.svg" },
  { name: "Codex", logo: "/brand/ide/codex.svg" },
] as const;

export function MarketingIdeStrip() {
  return (
    <section
      aria-label="Works with your IDE"
      className="border-y border-[rgba(34,29,23,.08)] bg-[#EFE9DD] px-5 py-12 md:py-16"
    >
      <div className="mx-auto flex max-w-[1120px] flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-14">
        {/* Left: claim + real IDE logos */}
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <p className="text-[13.5px] font-[600] uppercase tracking-[0.08em] text-[#6E665A]">
            Works with your IDE
          </p>
          <p className="mt-2 max-w-[34ch] text-[clamp(19px,2.4vw,26px)] font-[500] leading-[1.15] tracking-[-0.02em] text-[#221D17]">
            One command. Build from the editor you already live in.
          </p>

          <ul className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6">
            {IDES.map((ide) => (
              <li
                key={ide.name}
                className="flex flex-col items-center gap-1.5"
                title={ide.name}
              >
                <span className="flex size-11 items-center justify-center rounded-[12px] border border-[rgba(34,29,23,.10)] bg-[#FFFDFA] shadow-[0_1px_2px_rgba(34,29,23,.06)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static vendored SVG */}
                  <img src={ide.logo} alt={ide.name} width={22} height={22} className="block" />
                </span>
                <span className="text-[11px] font-[500] text-[#6E665A]">{ide.name}</span>
              </li>
            ))}
          </ul>

          <Link
            href="/build#install"
            className="mt-6 text-[13px] font-[600] text-[#00897B] transition-colors hover:text-[#00695C]"
          >
            See the install snippet →
          </Link>
        </div>

        {/* Right: the terminal, running the real connect command */}
        <div className="w-full max-w-[440px] shrink-0">
          <Terminal className="w-full max-w-none border-[rgba(34,29,23,.14)] bg-[#FFFDFA] text-[#221D17] shadow-[0_2px_10px_rgba(34,29,23,.10)]">
            <TypingAnimation className="text-[#6E665A]">$ claude mcp add seldonframe</TypingAnimation>
            <TypingAnimation delay={1400} className="text-[#221D17]">&gt; Build me an AI receptionist for an HVAC company.</TypingAnimation>
            <AnimatedSpan delay={3200} className="text-[#00897B]">✓ workspace live on acme-hvac.app.seldonframe.com</AnimatedSpan>
            <AnimatedSpan delay={3800} className="text-[#00897B]">✓ agent answering on chat · SMS · voice</AnimatedSpan>
          </Terminal>
        </div>
      </div>
    </section>
  );
}
