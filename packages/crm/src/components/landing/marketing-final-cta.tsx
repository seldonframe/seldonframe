// packages/crm/src/components/landing/marketing-final-cta.tsx
//
// Redesign 2026-06-18 — warm light aesthetic.
// Final CTA: deep green (#1F2B24) slab, matching seldonstudio.com's
// .final section. Paper-colored CTA button, dual audience paths.

import Link from "next/link";

export function MarketingFinalCta() {
  return (
    <section
      id="get-started"
      aria-label="Get started"
      className="border-t border-[rgba(34,29,23,.08)] bg-[#1F2B24] px-5 py-24 text-center md:px-8 md:py-36 lg:px-12"
    >
      <div className="mx-auto max-w-[880px]">
        <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[rgba(111,194,143,.8)]">
          <span className="h-px w-4 bg-[rgba(111,194,143,.5)]" aria-hidden />
          Last thing
          <span className="h-px w-4 bg-[rgba(111,194,143,.5)]" aria-hidden />
        </div>

        <h2 className="mx-auto mt-4 max-w-[18ch] text-[clamp(30px,5.2vw,54px)] font-[500] leading-[1.05] tracking-[-0.03em] text-[#F6F2EA]">
          Your front office is{" "}
          <em className="font-[Newsreader,Georgia,serif] font-normal not-italic text-[rgba(246,242,234,.75)]">
            3 minutes away.
          </em>
        </h2>

        <p className="mx-auto mt-5 max-w-[50ch] text-[16.5px] leading-[1.55] text-[rgba(246,242,234,.74)]">
          Paste a URL or describe your business. We build the website, booking,
          AI receptionist, intake, and CRM — all wired together and live in under a minute.
          For your business, or your clients&rsquo;.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2.5 rounded-full bg-[#F6F2EA] px-7 py-4 text-[15px] font-[500] text-[#1F2B24] shadow-[0_1px_2px_rgba(0,0,0,.2),0_12px_30px_rgba(0,0,0,.25),inset_0_1.5px_0_rgba(255,255,255,.6)] transition-all hover:-translate-y-[1.5px] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00897B]"
          >
            <span className="size-[7px] rounded-full bg-[#00897B]" aria-hidden />
            Build it free →
          </Link>
          <Link
            href="/agencies"
            className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,.16)] bg-transparent px-6 py-4 text-[15px] font-[500] text-[rgba(246,242,234,.88)] transition-all hover:bg-[rgba(255,255,255,.08)] active:translate-y-px"
          >
            For agencies →
          </Link>
        </div>

        <p className="mt-6 font-sans text-[13px] text-[rgba(246,242,234,.45)]">
          Build it free · $29/mo · unlimited workspaces · cancel anytime · your data exports as JSON
        </p>
      </div>
    </section>
  );
}
