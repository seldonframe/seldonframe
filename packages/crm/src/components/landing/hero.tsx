"use client";

import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { LandingHeroMockup } from "./landing-hero-mockup";

// Cut C onboarding-pivot — Hero rewrite.
//
// Previous hero (Cut C Phase 1) positioned against GoHighLevel with a
// defensive "Open-source GHL alternative" eyebrow and a "Spin up an
// agency-ready Business OS in 60 seconds. Open source. Your Anthropic
// key." H1 — anti-competitor framing that burned the lede on a free-
// tier hunter audience. The user explicitly rejected that positioning:
// SeldonFrame's paying ICP (agencies + freelancers serving SMBs) wants
// the PRODUCT MOMENT (natural language → AI-built Business OS in 60s),
// not freebie messaging.
//
// Copy refined by design:ux-copy (this pass). The H1 hits Hormozi's
// Value Equation in one line — dream outcome (Business OS), likelihood
// of success (AI), time delay (60s), effort (just describe). The
// risk-reversal line "Create a real functioning Business OS in 60
// seconds" is user-dictated verbatim — do not edit.
//
// Layout shift vs previous hero: stacks copy left / mockup right on
// md+, single column on mobile (mockup below CTAs so the conversion
// frame stays above the fold). The mockup replaces a placeholder GIF —
// see landing-hero-mockup.tsx.
//
// Motion: motion@12.38 ("motion/react"). 80ms stagger on copy
// (H1 → subhead → CTAs → reassurance). useReducedMotion() switches
// to instant render. Mockup card stagger lives inside the mockup
// component and continues from this hero's cadence.
export function LandingHero() {
  const reduced = useReducedMotion();
  const fadeUp = (delay: number) =>
    reduced
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
        {/* Copy column */}
        <div className="text-center lg:col-span-6 lg:text-left">
          <motion.p
            {...fadeUp(0)}
            className="mb-5 inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs font-medium text-zinc-400"
          >
            Built for agencies and freelancers serving SMBs
          </motion.p>

          <motion.h1
            {...fadeUp(0.08)}
            className="text-balance text-4xl font-bold tracking-tight text-zinc-100 md:text-5xl lg:text-6xl lg:leading-[1.04]"
          >
            Spin up your client&apos;s Business OS in 60 seconds.
            <br className="hidden lg:block" />{" "}
            <span className="text-[#14b8a6] lg:mt-1 lg:inline-block">
              Just describe it.
            </span>
          </motion.h1>

          <motion.p
            {...fadeUp(0.16)}
            className="mx-auto mt-5 max-w-xl text-pretty text-base text-zinc-400 md:text-lg lg:mx-0"
          >
            Paste a client&apos;s URL or describe their business in plain English.
            SeldonFrame builds{" "}
            <span className="text-zinc-300">
              the CRM, booking page, intake form, and AI receptionist
            </span>{" "}
            — white-label, wired up, ready to hand over.
          </motion.p>

          <motion.div
            {...fadeUp(0.24)}
            className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
          >
            <Link
              href="/signup"
              /* a11y: text-zinc-950 on #14b8a6 = 7.2:1 (AAA). Matches
                 the pricing/footer pattern set in Cut C Phase 8.
                 Hover shadow is a directional drop (not the neutral-
                 black shadow-lg) so the lift reads as actual elevation
                 per design-critique #8. */
              className="inline-flex items-center gap-2 rounded-xl bg-[#14b8a6] px-8 py-3.5 text-base font-semibold text-zinc-950 transition-all hover:scale-[1.02] hover:shadow-[0_8px_24px_-6px_rgba(20,184,166,0.4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14b8a6] motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
              Start free
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              href="#demo"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-7 py-3.5 text-base font-semibold text-zinc-200 transition-colors hover:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14b8a6]"
            >
              <Play size={16} className="fill-current" aria-hidden="true" />
              Watch the 60-second build
            </Link>
          </motion.div>

          <motion.p
            {...fadeUp(0.32)}
            className="mt-5 text-sm text-zinc-500"
          >
            Create a real functioning Business OS in 60 seconds
          </motion.p>
        </div>

        {/* Mockup column — lands AFTER copy + reassurance settle so the
            mockup reads as a reveal, not a competing element. Per
            design-critique #7. */}
        <motion.div
          {...fadeUp(0.36)}
          className="lg:col-span-6"
        >
          <LandingHeroMockup />
        </motion.div>
      </div>
    </section>
  );
}
