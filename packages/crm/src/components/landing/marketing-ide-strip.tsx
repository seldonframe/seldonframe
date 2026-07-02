// packages/crm/src/components/landing/marketing-ide-strip.tsx
//
// "Works with your IDE" strip — added alongside the "One server. Every IDE."
// install section on /build (packages/crm/src/app/build/page.tsx). Same
// compact parchment-band + chip-row pattern as MarketingProofStrip (slim,
// server component, no client hooks), placed right after the 60-second
// BuildSteps demo since installing from an IDE is a "how it works" detail, not
// a proof or pricing point. Links to the fuller install section on /build.
//
// The six IDE names are kept as plain data (not re-imported from
// lib/build/landing-content) because that module is CRM-app-internal build
// content; duplicating six literal names here is simpler and lower-risk than
// creating a cross-cutting shared import for a one-line list that changes
// rarely. If the list ever drifts, the /build page + its IDE_INSTALLS array
// remain the source of truth for the actual install snippets.

import Link from "next/link";

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
    </section>
  );
}
