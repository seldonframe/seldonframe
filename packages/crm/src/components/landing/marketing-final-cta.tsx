// packages/crm/src/components/landing/marketing-final-cta.tsx
//
// 2026-05-22 — Port of HTML §12 FINAL CTA. Large centered headline
// with teal accent on the last clause, teal CTA button, and a
// meta line below. Background is a radial teal glow from the
// bottom + grid texture, both purely decorative.

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function MarketingFinalCta() {
  return (
    <section
      id="get-started"
      aria-label="Get started"
      className="relative isolate overflow-hidden px-5 py-28 text-center md:px-8 md:py-40"
    >
      <h2 className="m-0 mx-auto max-w-[880px] text-balance font-display text-[clamp(38px,6.4vw,80px)] font-semibold leading-[1.0] tracking-[-0.034em] text-zinc-50">
        Your first client workspace is
        <br />
        <span className="text-[#5eead4]">60 seconds away.</span>
      </h2>

      <Link
        href="/signup"
        className="mt-9 inline-flex h-14 items-center gap-2.5 rounded-[12px] bg-[#14b8a6] px-7 text-base font-semibold text-[#08332f] shadow-[0_18px_50px_rgba(20,184,166,0.30),inset_0_1px_0_rgba(255,255,255,0.20)] transition-all hover:bg-[#2dd4bf] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14b8a6]"
      >
        Get started
        <ArrowRight size={18} strokeWidth={2.4} aria-hidden />
      </Link>
      <p className="mt-4 font-mono text-xs text-zinc-500">Cancel anytime · Workspaces export as JSON</p>

      {/* Decorative bg layers */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20"
        style={{
          background:
            "radial-gradient(60% 80% at 50% 100%, rgba(45,212,191,0.28), transparent 75%), #09090b",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(244,244,245,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(244,244,245,0.045) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          WebkitMaskImage: "radial-gradient(ellipse 60% 60% at 50% 50%, black 30%, transparent 80%)",
          maskImage: "radial-gradient(ellipse 60% 60% at 50% 50%, black 30%, transparent 80%)",
        }}
      />
    </section>
  );
}
