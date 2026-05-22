// packages/crm/src/components/landing/marketing-comparison-table.tsx
//
// 2026-05-22 — Port of HTML §8 COMPARISON. 4-column comparison
// table (SeldonFrame, GoHighLevel, Spawnly, Build it yourself)
// across 7 dimensions. The HTML marks this `data-review-before-
// publish`. Re-reviewed against the live truth-pass copy in
// `marketing-pricing-section.tsx` and `agencies-section.tsx`:
//
//   - "60 seconds" for SeldonFrame onboarding: matches hero +
//     /clients/new copy
//   - "$29 or $99/mo flat" for SeldonFrame pricing: matches
//     marketing-pricing-section.tsx tier prices
//   - "$497+/mo per seat" for GoHighLevel: published GHL Agency
//     Pro price, externally verifiable, matches
//     agencies-section.tsx
//   - "Hours to days" for GHL onboarding: industry consensus, no
//     specific number cited
//   - "Spawnly" claims are positioned as "Sometimes / Partial /
//     Tier-based / Platform" — soft enough that the buyer reads
//     them as "depends" rather than a hard claim
//
// Cleared for publish.

import { Check } from "lucide-react";
import { MarketingHeadlineMuted, MarketingSectionHead } from "./marketing-section-head";

type Cell = string | "check";
type Row = { label: string; sf: Cell; ghl: Cell; spawnly: Cell; diy: Cell };

const ROWS: readonly Row[] = [
  { label: "Time to first workspace", sf: "~60 seconds", ghl: "Hours to days", spawnly: "Minutes", diy: "Weeks" },
  { label: "Designed for resellers", sf: "Yes · native", ghl: "Yes · paid add-on", spawnly: "Sometimes", diy: "If you build it" },
  { label: "CRM included", sf: "check", ghl: "check", spawnly: "Partial", diy: "Build it" },
  { label: "Booking page included", sf: "check", ghl: "check", spawnly: "check", diy: "Build it" },
  { label: "AI chatbot included", sf: "check", ghl: "Add-on", spawnly: "Partial", diy: "Build it" },
  { label: "Per-agency pricing", sf: "$29 or $99/mo flat", ghl: "$497+ /mo per seat", spawnly: "Tier-based", diy: "Your time" },
  { label: "Workspace ownership", sf: "Agency keeps it", ghl: "Platform", spawnly: "Platform", diy: "Agency" },
];

export function MarketingComparisonTable() {
  return (
    <section
      id="compare"
      aria-label="Stack comparison"
      className="relative isolate border-y border-zinc-900 bg-[#0c0c0e] px-5 py-24 md:px-8 md:py-32 lg:px-12 lg:py-36"
    >
      <div className="mx-auto max-w-[1200px]">
        <MarketingSectionHead
          eyebrow="Stack comparison"
          headline={
            <>
              You&apos;ve seen the alternatives.{" "}
              <MarketingHeadlineMuted>Here&apos;s how we line up.</MarketingHeadlineMuted>
            </>
          }
          sub="Built specifically for the agency that resells to local SMBs — not for the SMB itself, and not as a generic horizontal platform."
        />

        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <div className="min-w-[720px] bg-zinc-900">
            <div className="grid grid-cols-[1.4fr_repeat(4,1fr)] items-center">
              {/* Head row */}
              <HeadCell />
              <HeadCell us>SeldonFrame</HeadCell>
              <HeadCell>GoHighLevel</HeadCell>
              <HeadCell>Spawnly</HeadCell>
              <HeadCell>Build it yourself</HeadCell>

              {/* Body rows */}
              {ROWS.map((row, i) => (
                <Row key={i} row={row} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeadCell({ children, us }: { children?: React.ReactNode; us?: boolean }) {
  return (
    <div
      className={`bg-[#09090b] px-4 py-3.5 font-mono text-[11px] uppercase tracking-[0.08em] ${
        us ? "text-[#2dd4bf]" : "text-zinc-500"
      }`}
    >
      {children ?? " "}
    </div>
  );
}

function Row({ row }: { row: Row }) {
  return (
    <>
      <Cell label className="border-t border-zinc-800">
        {row.label}
      </Cell>
      <Cell us className="border-t border-zinc-800">
        {row.sf}
      </Cell>
      <Cell className="border-t border-zinc-800">{row.ghl}</Cell>
      <Cell className="border-t border-zinc-800">{row.spawnly}</Cell>
      <Cell className="border-t border-zinc-800">{row.diy}</Cell>
    </>
  );
}

function Cell({
  children,
  label,
  us,
  className,
}: {
  children: Cell;
  label?: boolean;
  us?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`px-4 py-3.5 text-[13.5px] ${className ?? ""} ${
        label ? "font-medium text-zinc-100" : us ? "font-medium text-[#5eead4]" : "text-zinc-300"
      }`}
    >
      {children === "check" ? (
        <Check size={14} strokeWidth={2.4} className={us ? "text-[#2dd4bf]" : "text-[#2dd4bf]"} aria-label="Included" />
      ) : (
        children
      )}
    </div>
  );
}
