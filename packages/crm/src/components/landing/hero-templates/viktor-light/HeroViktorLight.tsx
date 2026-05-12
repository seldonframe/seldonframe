"use client";

// v1.43.0 — Viktor Oddy-style light editorial hero.
//
// White bg, narrow centered column, Instrument Serif italic emphasis on the
// `shinyWord` (no gradient — just serif treatment for color/style contrast).
// Modeled on the Viktor Oddy reference: tight typography, no video,
// staggered fade-rise entrance. The default for `technical-restrained`
// and `editorial-warm` archetypes where the workspace is a coach,
// agency, or freelance creative.

import { Star } from "lucide-react";
import type { HeroSectionContent } from "../../sections/types";
import { DarkPillCTA, LightSecondaryCTA } from "../shared/pill-cta";
import "../shared/styles.css";

function ProofTile({ rating, label }: NonNullable<HeroSectionContent["proofTile"]>) {
  return (
    <div className="tpl-fade-rise-d2 mb-3 inline-flex items-center gap-2.5 rounded-full border border-[#0a0a0a]/10 bg-[#0a0a0a]/[0.02] px-4 py-1.5">
      <div className="flex items-center gap-0.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star
            key={i}
            className={
              "size-3 " +
              (i < Math.floor(rating)
                ? "fill-amber-500 text-amber-500"
                : "fill-[#0a0a0a]/10 text-[#0a0a0a]/10")
            }
          />
        ))}
      </div>
      <span className="text-xs font-semibold text-[#0a0a0a]">{rating.toFixed(1)}</span>
      <span className="text-xs text-[#0a0a0a]/60">{label}</span>
    </div>
  );
}

function RiskBadges({ badges }: { badges: string[] }) {
  if (!badges?.length) return null;
  return (
    <div className="tpl-fade-rise-d6 mt-6 flex flex-wrap justify-center gap-2">
      {badges.map((badge, idx) => (
        <span
          key={`${badge}-${idx}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#0a0a0a]/10 bg-white px-3 py-1 text-[11px] font-medium text-[#0a0a0a]"
        >
          <span aria-hidden className="size-1.5 rounded-full bg-[#0a0a0a]/80" />
          {badge}
        </span>
      ))}
    </div>
  );
}

/**
 * Renders the headline with optional serif-italic emphasis on `shinyWord`.
 * Unlike cinematic-aura (gradient shiny), viktor-light uses plain italic
 * serif in a muted color for editorial contrast.
 */
function ViktorHeadline({
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
    <h1 className="tpl-fade-rise-d3 text-[2rem] font-medium leading-[1.1] tracking-tight text-[#0D212C] md:text-[2.75rem] lg:text-[3rem]">
      {words.map((word, i) => {
        const stripped = word.replace(/[.,!?;:]+$/, "").toLowerCase();
        const isItalic = !matched && shinyLower && stripped === shinyLower;
        if (isItalic) matched = true;
        return (
          <span key={`${word}-${i}`}>
            {isItalic ? (
              <em className="tpl-display-italic font-normal text-[#0D212C]/70">
                {word}
              </em>
            ) : (
              word
            )}
            {i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </h1>
  );
}

export function HeroViktorLight(props: HeroSectionContent) {
  return (
    <section className="relative w-full bg-white pb-16 pt-12 md:pt-16">
      <div className="mx-auto flex max-w-[480px] flex-col items-start px-6 text-left">
        {props.kicker ? (
          <p className="tpl-fade-rise-d1 mb-3 font-mono text-xs text-[#0a0a0a]/70 md:text-sm">
            {props.kicker}
          </p>
        ) : null}

        <ViktorHeadline text={props.headline} shinyWord={props.shinyWord} />

        <p className="tpl-fade-rise-d4 mt-5 text-sm leading-relaxed text-[#0a0a0a]/75 md:text-base">
          {props.subheadline}
        </p>

        {props.proofTile ? (
          <div className="mt-6">
            <ProofTile {...props.proofTile} />
          </div>
        ) : null}

        <div className="tpl-fade-rise-d5 mt-6 flex flex-col gap-3 sm:flex-row">
          <DarkPillCTA href={props.ctaLink} label={props.ctaText} />
          {props.secondaryCta ? (
            <LightSecondaryCTA
              href={props.secondaryCta.link}
              label={props.secondaryCta.text}
            />
          ) : null}
        </div>

        <RiskBadges badges={props.riskReversalBadges ?? []} />
      </div>
    </section>
  );
}
