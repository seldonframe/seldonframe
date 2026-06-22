// packages/crm/src/components/landing/marketing-smb-cta.tsx
//
// Positioning v2 (2026-06-22) — the "Sell" rung of the homepage ladder.
// Repurposed from the old SMB-first CTA band (which rotated an industry word)
// to the single Sell idea: take payments, send proposals, sell packages right
// through SeldonFrame. GMV framing lives here (2% only on SF sales),
// pulled out of the hero so each rung holds one idea.
//
// Design tokens: card #FFFDFA, paper #F6F2EA, ink #221D17, muted #6E665A,
// accent green #00897B, border rgba(34,29,23,.10). Newsreader italic accent.

import Link from "next/link";

export function MarketingSmbCta() {
  return (
    <section
      id="smb"
      aria-label="Get paid through SeldonFrame"
      className="border-t border-[rgba(34,29,23,.08)] bg-[#F6F2EA] px-5 py-16 md:px-8 md:py-20 lg:px-12"
    >
      <div className="mx-auto max-w-[880px] rounded-[24px] border border-[rgba(34,29,23,.08)] bg-[#FFFDFA] px-6 py-12 text-center shadow-[0_1px_2px_rgba(34,29,23,.05),0_20px_50px_rgba(34,29,23,.08)] md:px-12 md:py-14">
        <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#00897B]">
          <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
          Get paid
          <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
        </div>

        <h2 className="mx-auto mt-4 max-w-[20ch] text-balance text-[clamp(26px,4.2vw,42px)] font-[500] leading-[1.1] tracking-[-0.025em] text-[#221D17]">
          Get paid,{" "}
          <em className="font-[Newsreader,Georgia,serif] font-normal not-italic text-[#6E665A]">
            right through it.
          </em>
        </h2>

        <p className="mx-auto mt-4 max-w-[54ch] text-[clamp(15px,1.7vw,17px)] leading-[1.55] text-[#6E665A]">
          Take payments, send proposals, and sell packages from the same place you run
          everything — no extra tools. We only charge{" "}
          <strong className="font-[500] text-[#221D17]">2% on what you sell through SeldonFrame</strong>.
          Sell anywhere else? We take nothing.
        </p>

        <div className="mt-8 flex justify-center">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2.5 rounded-full bg-[#1F2B24] px-7 py-4 text-[15px] font-[500] text-[#F6F2EA] shadow-[0_1px_2px_rgba(34,29,23,.10),0_6px_16px_rgba(34,29,23,.10),0_18px_40px_rgba(34,29,23,.06),inset_0_1.5px_0_rgba(255,255,255,.12)] transition-all hover:-translate-y-[1.5px] hover:shadow-[0_2px_4px_rgba(34,29,23,.12),0_12px_26px_rgba(34,29,23,.14),inset_0_1.5px_0_rgba(255,255,255,.14)] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00897B]"
          >
            <span className="size-[7px] rounded-full bg-[#00897B] shadow-[0_0_0_4px_rgba(0,137,123,.22)]" aria-hidden />
            Start your 14-day free trial →
          </Link>
        </div>
      </div>
    </section>
  );
}
