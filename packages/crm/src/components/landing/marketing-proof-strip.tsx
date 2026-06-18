// packages/crm/src/components/landing/marketing-proof-strip.tsx
//
// Redesign 2026-06-18 — warm light theme. Four stats on a parchment plate.
// Updated stat list to dual-audience messaging.

const ITEMS = [
  { lt: "<", num: "60", unit: "s", label: "Workspace live" },
  { num: "9", label: "Live demo workspaces" },
  { num: "5", label: "Modules per workspace" },
  { num: "5×", label: "Under GoHighLevel" },
] as const;

export function MarketingProofStrip() {
  return (
    <section
      id="proof"
      aria-label="Product proof"
      className="border-y border-[rgba(34,29,23,.08)] bg-[#EFE9DD] px-5 py-8"
    >
      <div className="mx-auto grid max-w-[1120px] grid-cols-2 items-start gap-6 md:grid-cols-4 md:gap-10 md:px-3">
        {ITEMS.map((it) => (
          <div key={it.label} className="flex flex-col gap-1.5">
            <div className="font-sans text-[clamp(30px,3.2vw,40px)] font-[600] leading-none tracking-[-0.025em] tabular-nums text-[#221D17]">
              {"lt" in it && it.lt ? (
                <span className="text-[0.55em] font-[500] text-[#9A9183]">{it.lt}</span>
              ) : null}
              {it.num}
              {"unit" in it && it.unit ? (
                <span className="ml-0.5 text-[0.50em] font-[500] text-[#00897B]">{it.unit}</span>
              ) : null}
            </div>
            <div className="font-sans text-[11px] font-[500] uppercase tracking-[0.08em] text-[#9A9183]">
              {it.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
