"use client";

// v1.43.0 — Stellar.ai-style white hero with cycling product tabs.
//
// White bg, no background video. Centered hero copy with one gradient-
// text headline line. Below: a 4-tab switcher that auto-cycles every 4s,
// each tab showing a different overlay card on a gradient backdrop.
//
// The 4 tabs mirror the universal small-business product flow that every
// SeldonFrame workspace ships (Intake → Schedule → Convert → Deliver),
// so the hero doubles as a product preview without needing
// business-specific data from the LLM.
//
// For: AI tools, workspace platforms, multi-feature SaaS — anywhere the
// brand wants to communicate "we do four things well" upfront.

import { useEffect, useState } from "react";
import { Star, Play } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { HeroSectionContent } from "../../sections/types";
import { DarkPillCTA } from "../shared/pill-cta";
import { TabContent, STELLAR_TABS, type StellarTabId } from "./TabContent";
import "../shared/styles.css";

function StellarHeadline({
  text,
  shinyWord,
}: {
  text: string;
  shinyWord?: string;
}) {
  // Split headline into two halves at a natural break — the second half
  // gets the gradient text treatment. If a shinyWord is provided AND
  // appears in the headline, split AT that word (the shiny word and
  // everything after it gradient-rendered). Otherwise, split at the
  // halfway point.
  const words = text.split(/\s+/).filter(Boolean);
  const shinyLower = shinyWord?.toLowerCase();
  let splitIdx = Math.ceil(words.length / 2);
  if (shinyLower) {
    const found = words.findIndex(
      (w) => w.replace(/[.,!?;:]+$/, "").toLowerCase() === shinyLower,
    );
    if (found >= 1) splitIdx = found;
  }
  const line1 = words.slice(0, splitIdx).join(" ");
  const line2 = words.slice(splitIdx).join(" ");

  return (
    <motion.h1
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1 }}
      className="text-center text-[2.5rem] font-normal leading-[1.05] tracking-tight text-[#0a0a0a] md:text-[3.5rem] lg:text-[4.5rem]"
    >
      <span className="block">{line1}</span>
      {line2 ? <span className="tpl-gradient-text block">{line2}</span> : null}
    </motion.h1>
  );
}

export function HeroStellarTabsWhite(props: HeroSectionContent) {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIdx((i) => (i + 1) % STELLAR_TABS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const activeTab: StellarTabId = STELLAR_TABS[activeIdx].id;

  return (
    <section className="relative w-full overflow-hidden bg-white pb-16 pt-12 md:pt-20">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 text-center">
        {props.proofTile ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-[#0a0a0a]"
          >
            <span className="flex size-6 items-center justify-center rounded border border-[#0a0a0a]/15">
              <Star className="size-3.5 fill-[#0a0a0a] text-[#0a0a0a]" />
            </span>
            <span>
              {props.proofTile.rating.toFixed(1)} rating from {props.proofTile.count.toLocaleString()}
              {props.proofTile.label ? ` ${props.proofTile.label}` : " users"}
            </span>
          </motion.div>
        ) : props.kicker ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#0a0a0a]/10 bg-white px-4 py-1.5 text-sm font-medium text-[#0a0a0a]"
          >
            <Star className="size-3.5 fill-[#0a0a0a] text-[#0a0a0a]" />
            {props.kicker}
          </motion.div>
        ) : null}

        <StellarHeadline text={props.headline} shinyWord={props.shinyWord} />

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-6 max-w-2xl text-base leading-relaxed text-[#0a0a0a]/60 md:text-lg"
        >
          {props.subheadline}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-8 flex items-center gap-3"
        >
          <DarkPillCTA href={props.ctaLink} label={props.ctaText} />
          {props.secondaryCta ? (
            <Link
              href={props.secondaryCta.link}
              aria-label={props.secondaryCta.text}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all hover:shadow-[0_2px_16px_rgba(0,0,0,0.12)]"
            >
              <Play className="h-4 w-4 fill-[#0a0a0a] text-[#0a0a0a]" />
            </Link>
          ) : null}
        </motion.div>

        {/* Tab switcher */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-10 inline-flex items-center gap-1 rounded-lg bg-[#0a0a0a]/[0.04] p-1"
        >
          {STELLAR_TABS.map((tab, i) => {
            const Icon = tab.Icon;
            const isActive = i === activeIdx;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveIdx(i)}
                className={
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all md:px-4 " +
                  (isActive
                    ? "bg-white text-[#0a0a0a] shadow-sm"
                    : "text-[#0a0a0a]/60 hover:text-[#0a0a0a]")
                }
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            );
          })}
        </motion.div>

        {/* Tab content area */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.6 }}
          className="relative mt-6 w-full max-w-3xl"
        >
          <div
            className="relative h-[400px] overflow-hidden rounded-3xl md:h-[440px]"
            style={{
              background:
                "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 35%, #a5b4fc 70%, #818cf8 100%)",
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0"
              >
                <TabContent activeId={activeTab} />
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
