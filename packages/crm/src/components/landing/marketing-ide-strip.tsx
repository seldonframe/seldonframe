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

const IDE_NAMES = ["Claude Code", "Cursor", "Windsurf", "VS Code", "Zed", "Codex CLI"] as const;

export function MarketingIdeStrip() {
  return (
    <section
      aria-label="Works with your IDE"
      className="border-y border-[rgba(34,29,23,.08)] bg-[#EFE9DD] px-5 py-7 md:py-8"
    >
      <div className="mx-auto flex max-w-[1120px] flex-col items-center gap-4 md:flex-row md:justify-between md:px-3">
        <p className="text-center text-[13.5px] font-[600] uppercase tracking-[0.08em] text-[#6E665A] md:text-left">
          Works with your IDE
        </p>

        <ul className="flex flex-wrap items-center justify-center gap-2 md:gap-2.5">
          {IDE_NAMES.map((name) => (
            <li
              key={name}
              className="inline-flex items-center rounded-full border border-[rgba(34,29,23,.10)] bg-[#FFFDFA] px-3 py-1.5 text-[12.5px] font-[500] text-[#221D17] shadow-[0_1px_2px_rgba(34,29,23,.05)]"
            >
              {name}
            </li>
          ))}
        </ul>

        <Link
          href="/build#install"
          className="text-[13px] font-[600] text-[#00897B] transition-colors hover:text-[#00695C]"
        >
          See the install snippet →
        </Link>
      </div>

      <div className="mx-auto mt-6 max-w-[420px]">
        <Terminal className="w-full max-w-none border-[rgba(34,29,23,.14)] bg-[#FFFDFA] text-[#221D17] shadow-[0_1px_3px_rgba(34,29,23,.08)]">
          <TypingAnimation className="text-[#221D17]">$ npx -y @seldonframe/mcp</TypingAnimation>
          <AnimatedSpan delay={600} className="text-[#00897B]">
            connected — workspace live on yourslug.app.seldonframe.com
          </AnimatedSpan>
        </Terminal>
      </div>
    </section>
  );
}
