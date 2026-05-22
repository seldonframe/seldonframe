// packages/crm/src/components/landing/marketing-proof-strip.tsx
//
// 2026-05-22 — Port of HTML §2 PROOF STRIP. Four side-by-side stats
// sitting on the alt-tinted plate between hero and the agency-math
// calculator. Numbers are truth-pass safe:
//   - <60s median build time (matches the hero's "60 seconds" claim)
//   - 6 build phases (matches /clients/new build animation)
//   - 4 modules per workspace (CRM, booking, intake, chatbot)
//   - 7 design frameworks (matches archetype lineup)

const ITEMS = [
  { lt: "<", num: "60", unit: "s", label: "Median build time" },
  { num: "6", label: "Build phases" },
  { num: "4", label: "Modules per workspace" },
  { num: "7", label: "Design frameworks" },
] as const;

export function MarketingProofStrip() {
  return (
    <section
      id="proof"
      aria-label="Product proof"
      className="border-y border-zinc-900 bg-[#0c0c0e] px-5 py-7"
    >
      <div className="mx-auto grid max-w-[1200px] grid-cols-2 items-start gap-5 md:grid-cols-4 md:gap-8 md:px-3">
        {ITEMS.map((it) => (
          <div key={it.label} className="flex flex-col gap-1.5">
            <div className="font-display text-[clamp(28px,3vw,38px)] font-semibold leading-none tracking-[-0.025em] tabular-nums text-zinc-50">
              {"lt" in it && it.lt ? (
                <span className="text-[0.55em] font-medium text-zinc-500">{it.lt}</span>
              ) : null}
              {it.num}
              {"unit" in it && it.unit ? (
                <span className="ml-0.5 text-[0.50em] font-medium text-[#2dd4bf]">{it.unit}</span>
              ) : null}
            </div>
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-500">
              {it.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
