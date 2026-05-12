"use client";

// v1.41.0 — Cinematic Aura hero variant.
//
// Dark, full-bleed Pexels video background with liquid-glass UI chrome,
// Instrument Serif italic typography, and Framer Motion entrance
// choreography. The big visual upgrade over `cinematic-fullbleed`:
//
//   1. Looping MP4 with rAF crossfade (FadingVideo) instead of static image
//   2. Liquid-glass CTAs + badge instead of flat buttons
//   3. Word-by-word blur-in headline (BlurText) with optional shiny word
//   4. Pexels attribution required by their licence (bottom-right pill)
//
// Soft-fail strategy mirrors `cinematic-fullbleed`: when no video is
// available we still ship a beautiful page — the dark base + branded
// gradient renders without the video, and the rest of the chrome is
// unaffected. No empty-state ugliness.

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Star, Play } from "lucide-react";
import { motion } from "framer-motion";
import type { HeroSectionContent } from "./types";
import { FadingVideo } from "../cinematic/fading-video";
import { BlurText } from "../cinematic/blur-text";
import { AppleButton } from "../cinematic/apple-button";
import "../cinematic/styles.css";

function VideoAttribution({
  photographer_name,
  photographer_url,
  source_url,
}: NonNullable<HeroSectionContent["heroVideoAttribution"]>) {
  return (
    <div className="pointer-events-auto absolute bottom-3 right-4 z-20">
      <p className="text-[10px] leading-tight tracking-wide text-white/60">
        Video by{" "}
        <a
          href={photographer_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:text-white hover:underline"
        >
          {photographer_name}
        </a>{" "}
        on{" "}
        <a
          href={source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:text-white hover:underline"
        >
          Pexels
        </a>
      </p>
    </div>
  );
}

function DarkProofTile({
  rating,
  label,
}: NonNullable<HeroSectionContent["proofTile"]>) {
  return (
    <div className="cin-liquid-glass mb-2 inline-flex items-center gap-3 rounded-full px-4 py-2">
      <div className="flex items-center gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star
            key={i}
            className={
              "size-3.5 " +
              (i < Math.floor(rating)
                ? "fill-amber-300 text-amber-300"
                : "fill-white/10 text-white/10")
            }
          />
        ))}
      </div>
      <span className="text-sm font-semibold text-white">{rating.toFixed(1)}</span>
      <span className="text-sm text-white/70">{label}</span>
    </div>
  );
}

function DarkRiskBadges({ badges }: { badges: string[] }) {
  if (!badges?.length) return null;
  return (
    <div className="mt-5 flex flex-wrap justify-center gap-2">
      {badges.map((badge, idx) => (
        <span
          key={`${badge}-${idx}`}
          className="cin-liquid-glass inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium text-white/90"
        >
          <span aria-hidden className="size-1.5 rounded-full bg-white/80" />
          {badge}
        </span>
      ))}
    </div>
  );
}

export function HeroCinematicAura(props: HeroSectionContent) {
  const hasVideo = typeof props.heroVideo === "string" && props.heroVideo.trim().length > 0;

  return (
    <section className="cin-bg-base relative isolate min-h-[85vh] overflow-hidden">
      {/* Video background, full-bleed beneath everything */}
      <div className="absolute inset-0 -z-10">
        {hasVideo ? (
          <>
            <FadingVideo
              src={props.heroVideo!}
              poster={props.heroImage}
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* Subtle vignette for headline legibility. Aura ran no overlay
                but our headlines are longer + we ship arbitrary content,
                so a light bottom-up dim is the safer default. */}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/55"
            />
          </>
        ) : (
          // No-video fallback: deep navy radial + a giant ghost letter so
          // the section never feels broken. Mirrors cinematic-fullbleed's
          // graceful empty state.
          <>
            <div className="absolute inset-0 bg-[linear-gradient(180deg,#0c0c0c_0%,#0b2551_55%,#091020_100%)]" />
            <div
              aria-hidden
              className="absolute inset-0 bg-[radial-gradient(circle_at_25%_30%,rgba(164,244,253,0.10),transparent_55%),radial-gradient(circle_at_75%_70%,rgba(0,210,255,0.08),transparent_55%)]"
            />
            <div className="absolute inset-y-0 right-0 flex w-1/2 items-center justify-end overflow-hidden pr-8 md:pr-16">
              <div className="cin-font-display select-none whitespace-nowrap text-[clamp(120px,16vw,260px)] italic leading-none tracking-tighter text-white/10">
                {(props.headline || "Welcome").split(/\s+/)[0]}
              </div>
            </div>
          </>
        )}
      </div>

      {hasVideo && props.heroVideoAttribution ? (
        <VideoAttribution {...props.heroVideoAttribution} />
      ) : null}

      {/* Centered content stack */}
      <div className="relative mx-auto flex min-h-[85vh] w-full max-w-4xl flex-col items-center justify-center px-6 py-24 text-center md:py-32">
        {props.kicker ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="cin-liquid-glass mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5"
          >
            <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-black">
              New
            </span>
            <span className="pr-2 text-sm text-white/90">{props.kicker}</span>
          </motion.div>
        ) : null}

        {/* Headline — Instrument Serif, word-by-word blur-in.
            If a `shinyWord` is provided, that word renders with the
            gradient-shiny treatment for extra cinematic punch. */}
        <BlurText
          text={props.headline}
          shinyWord={props.shinyWord}
          className="cin-font-display text-white"
          style={{
            fontSize: "clamp(3rem, 7vw, 5.5rem)",
            lineHeight: 0.95,
            letterSpacing: "-0.02em",
            justifyContent: "center",
            maxWidth: "62rem",
          }}
        />

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-xl text-base leading-relaxed text-white/70 md:text-lg"
        >
          {props.subheadline}
        </motion.p>

        {props.proofTile ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-8"
          >
            <DarkProofTile {...props.proofTile} />
          </motion.div>
        ) : null}

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <AppleButton href={props.ctaLink} label={props.ctaText} />
          {props.secondaryCta ? (
            <Link
              href={props.secondaryCta.link}
              className="cin-liquid-glass inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-white hover:bg-white/5"
            >
              <Play className="h-4 w-4 fill-white" />
              {props.secondaryCta.text}
            </Link>
          ) : null}
        </motion.div>

        <DarkRiskBadges badges={props.riskReversalBadges ?? []} />
      </div>
    </section>
  );
}
