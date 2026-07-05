// packages/crm/src/components/landing/marketing-proof-strip.tsx
//
// Revamp 2026-06-18 — FEAR-ALLEVIATION strip (replaces the old stats grid).
// Same parchment #EFE9DD band + placement. Defuses the top SMB objections:
// the single most important being "I'm not technical" → you edit by chatting.
// Server component — no client hooks needed.

const CHIPS = [
  "Build it free",
  "Live in 60 seconds",
  "$29/mo flat",
  "No code",
  "Cancel anytime",
] as const;

export function MarketingProofStrip() {
  return (
    <section
      id="proof"
      aria-label="What to expect"
      className="border-y border-[rgba(34,29,23,.08)] bg-[#EFE9DD] px-5 py-8 md:py-9"
    >
      <div className="mx-auto flex max-w-[1120px] flex-col items-center gap-5 md:px-3">
        {/* The reassurance line — the "you're not technical" objection, defused. */}
        <p className="max-w-[64ch] text-pretty text-center text-[clamp(14.5px,1.7vw,16.5px)] leading-[1.5] text-[#221D17]">
          <strong className="font-[600]">Not technical? You don&rsquo;t need to be</strong>
          {" — "}
          <span className="text-[#6E665A]">
            change your hours, add a service, or tune your AI receptionist just by typing it,
            like you&rsquo;d text ChatGPT.
          </span>
        </p>

        {/* Reassurance chips */}
        <ul className="flex flex-wrap items-center justify-center gap-2 md:gap-2.5">
          {CHIPS.map((chip) => (
            <li
              key={chip}
              className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(34,29,23,.10)] bg-[#FFFDFA] px-3 py-1.5 text-[12.5px] font-[500] text-[#221D17] shadow-[0_1px_2px_rgba(34,29,23,.05)]"
            >
              <span
                className="flex size-[15px] shrink-0 items-center justify-center rounded-full bg-[rgba(0,137,123,.12)] text-[9px] font-[700] leading-none text-[#00897B]"
                aria-hidden
              >
                ✓
              </span>
              {chip}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
