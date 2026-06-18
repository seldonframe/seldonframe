// packages/crm/src/components/landing/marketing-smb-cta.tsx
//
// Revamp 2026-06-18 — SMB-first CTA band with a rotating industry word.
// Sits between the Modules section and Pricing. The blank in the headline
// ("…for your ___ business.") fade-swaps through a list of local-service
// verticals (~1.6s each) via framer-motion. prefers-reduced-motion → a
// single static word, no motion components mount.
//
// Transform/opacity only. Design tokens: card #FFFDFA, paper #F6F2EA,
// ink #221D17, muted #6E665A, accent green #00897B, border rgba(34,29,23,.10).

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

// The local-service verticals SeldonFrame builds for, cycled one at a time.
const INDUSTRIES = [
  "HVAC",
  "plumbing",
  "electrical",
  "roofing",
  "landscaping",
  "med spa",
  "chiropractic",
  "TRT clinic",
  "peptide clinic",
  "pet grooming",
  "garage-door",
  "dental",
  "salon",
  "general-contracting",
] as const;

function RotatingWord() {
  const reduce = useReducedMotion() ?? false;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % INDUSTRIES.length);
    }, 1600);
    return () => window.clearInterval(id);
  }, [reduce]);

  // Static word for reduced motion — no AnimatePresence / motion nodes mount.
  if (reduce) {
    return <span className="text-[#00897B]">{INDUSTRIES[0]}</span>;
  }

  const word = INDUSTRIES[index];

  // inline-grid stacks the incoming/outgoing word in one cell so the swap
  // doesn't reflow surrounding text. Width tracks the current word.
  return (
    <span className="relative inline-grid text-left align-baseline">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={word}
          initial={{ opacity: 0, y: "0.4em" }}
          animate={{ opacity: 1, y: "0em" }}
          exit={{ opacity: 0, y: "-0.4em" }}
          transition={{ duration: 0.42, ease: EASE }}
          className="col-start-1 row-start-1 whitespace-nowrap text-[#00897B]"
        >
          {word}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function MarketingSmbCta() {
  return (
    <section
      id="smb"
      aria-label="Start building for your business"
      className="border-t border-[rgba(34,29,23,.08)] bg-[#F6F2EA] px-5 py-16 md:px-8 md:py-20 lg:px-12"
    >
      <div className="mx-auto max-w-[880px] rounded-[24px] border border-[rgba(34,29,23,.08)] bg-[#FFFDFA] px-6 py-12 text-center shadow-[0_1px_2px_rgba(34,29,23,.05),0_20px_50px_rgba(34,29,23,.08)] md:px-12 md:py-14">
        <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#00897B]">
          <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
          For local businesses
          <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
        </div>

        <h2 className="mx-auto mt-4 max-w-[20ch] text-balance text-[clamp(26px,4.2vw,42px)] font-[500] leading-[1.1] tracking-[-0.025em] text-[#221D17]">
          Get your website + AI front office in 60 seconds — for your{" "}
          <RotatingWord /> business.
        </h2>

        <p className="mx-auto mt-4 max-w-[52ch] text-[clamp(15px,1.7vw,17px)] leading-[1.55] text-[#6E665A]">
          Paste your site, watch it build, go live. No contract, cancel anytime.
        </p>

        <div className="mt-8 flex justify-center">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2.5 rounded-full bg-[#1F2B24] px-7 py-4 text-[15px] font-[500] text-[#F6F2EA] shadow-[0_1px_2px_rgba(34,29,23,.10),0_6px_16px_rgba(34,29,23,.10),0_18px_40px_rgba(34,29,23,.06),inset_0_1.5px_0_rgba(255,255,255,.12)] transition-all hover:-translate-y-[1.5px] hover:shadow-[0_2px_4px_rgba(34,29,23,.12),0_12px_26px_rgba(34,29,23,.14),inset_0_1.5px_0_rgba(255,255,255,.14)] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00897B]"
          >
            <span className="size-[7px] rounded-full bg-[#00897B] shadow-[0_0_0_4px_rgba(0,137,123,.22)]" aria-hidden />
            Start building
          </Link>
        </div>
      </div>
    </section>
  );
}
