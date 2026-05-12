"use client";

// v1.43.0 — Nexora-style light B2B SaaS hero with embedded CRM mockup.
//
// White bg, no background video (light editorial reads better without).
// Custom-coded CRM+booking dashboard preview below the hero copy — same
// shape as the operator's actual workspace, doubling as a product preview.
//
// For: B2B SaaS founders, productivity tools, agencies positioning as
// "we'll run your back-office", anyone who benefits from showing the
// dashboard their customers will use.

import { Play } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import type { HeroSectionContent } from "../../sections/types";
import { DarkPillCTA } from "../shared/pill-cta";
import { CrmBookingMock } from "./CrmBookingMock";
import "../shared/styles.css";

function NexoraHeadline({
  text,
  shinyWord,
}: {
  text: string;
  shinyWord?: string;
}) {
  const words = text.split(/\s+/).filter(Boolean);
  const shinyLower = shinyWord?.toLowerCase();
  let matched = false;

  return (
    <motion.h1
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1 }}
      className="text-center text-5xl font-semibold leading-[0.95] tracking-tight text-[#0a0a0a] md:text-6xl lg:text-[5rem]"
      style={{ maxWidth: "44rem" }}
    >
      {words.map((word, i) => {
        const stripped = word.replace(/[.,!?;:]+$/, "").toLowerCase();
        const isItalic = !matched && shinyLower && stripped === shinyLower;
        if (isItalic) matched = true;
        return (
          <span key={`${word}-${i}`}>
            {isItalic ? (
              <em className="tpl-display-italic font-normal">{word}</em>
            ) : (
              word
            )}
            {i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </motion.h1>
  );
}

export function HeroNexoraLight(props: HeroSectionContent) {
  return (
    <section className="relative w-full overflow-hidden bg-white pb-0 pt-12 md:pt-16">
      {/* Subtle radial wash for depth without competing with the dashboard mockup */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_0%,rgba(99,102,241,0.06),transparent_60%)]"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-6 text-center">
        {props.kicker ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-4 py-1.5 text-sm text-[#0a0a0a]/70"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-indigo-500" />
            {props.kicker}
          </motion.div>
        ) : null}

        <NexoraHeadline text={props.headline} shinyWord={props.shinyWord} />

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-5 max-w-[600px] text-base leading-relaxed text-[#0a0a0a]/65 md:text-lg"
        >
          {props.subheadline}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-6 flex items-center gap-3"
        >
          <DarkPillCTA href={props.ctaLink} label={props.ctaText} />
          {props.secondaryCta ? (
            <Link
              href={props.secondaryCta.link}
              aria-label={props.secondaryCta.text}
              className="flex h-11 w-11 items-center justify-center rounded-full border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all hover:shadow-[0_2px_16px_rgba(0,0,0,0.12)] hover:bg-white/95"
            >
              <Play className="h-4 w-4 fill-[#0a0a0a] text-[#0a0a0a]" />
            </Link>
          ) : null}
        </motion.div>

        {/* Dashboard preview — the actual CRM + booking that ships with every
            workspace. Acts as the visual centerpiece. */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-10 w-full max-w-5xl"
        >
          <CrmBookingMock />
        </motion.div>
      </div>
    </section>
  );
}
