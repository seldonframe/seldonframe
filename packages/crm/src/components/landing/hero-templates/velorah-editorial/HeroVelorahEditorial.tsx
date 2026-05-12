"use client";

// v1.43.0 — Velorah-style dark editorial hero.
//
// Deep-navy bg, looping Pexels MP4 background, Instrument Serif italic
// emphasis on the `shinyWord` (NOT gradient shiny — softer, editorial).
// Differs from cinematic-aura in three ways:
//   1. Background is a single muted gradient overlay over video (no
//      liquid-glass chrome on the CTA — bare elegant pills instead)
//   2. Headline is plain serif with one italicized word in muted color
//      (no animated gradient — Velorah is about restraint, not shine)
//   3. Layout uses a longer vertical breathing room: hero is 100vh,
//      content sits at ~55% from top with generous whitespace below
//
// For: luxe coaches, premium service businesses, creative studios that
// want cinematic motion without the SaaS-shiny treatment.

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { motion } from "framer-motion";
import type { HeroSectionContent } from "../../sections/types";
import { FadingVideo } from "../../cinematic/fading-video";
import "../../cinematic/styles.css";
import "../shared/styles.css";

function VideoAttribution({
  photographer_name,
  photographer_url,
  source_url,
}: NonNullable<HeroSectionContent["heroVideoAttribution"]>) {
  return (
    <div className="pointer-events-auto absolute bottom-3 right-4 z-20">
      <p className="text-[10px] leading-tight tracking-wide text-white/50">
        Video by{" "}
        <a
          href={photographer_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:text-white/80 hover:underline"
        >
          {photographer_name}
        </a>{" "}
        on{" "}
        <a
          href={source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:text-white/80 hover:underline"
        >
          Pexels
        </a>
      </p>
    </div>
  );
}

function VelorahHeadline({
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
    <h1
      className="tpl-display text-white"
      style={{
        fontSize: "clamp(2.75rem, 7vw, 5rem)",
        lineHeight: 0.98,
        letterSpacing: "-0.025em",
        fontWeight: 400,
        maxWidth: "60rem",
      }}
    >
      {words.map((word, i) => {
        const stripped = word.replace(/[.,!?;:]+$/, "").toLowerCase();
        const isItalic = !matched && shinyLower && stripped === shinyLower;
        if (isItalic) matched = true;
        return (
          <span key={`${word}-${i}`}>
            {isItalic ? (
              <em className="not-italic text-white/55" style={{ fontStyle: "italic" }}>
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

export function HeroVelorahEditorial(props: HeroSectionContent) {
  const hasVideo = typeof props.heroVideo === "string" && props.heroVideo.trim().length > 0;

  return (
    <section className="cin-bg-base relative isolate min-h-[100vh] overflow-hidden">
      <div className="absolute inset-0 -z-10">
        {hasVideo ? (
          <>
            <FadingVideo
              src={props.heroVideo!}
              poster={props.heroImage}
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* Deep-navy wash for editorial mood. Stronger than cinematic-aura's
                bottom-up vignette — Velorah is intentionally moodier. */}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-b from-[#091020]/40 via-[#091020]/55 to-[#091020]/75"
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(180deg,#0b1428_0%,#091020_45%,#06091a_100%)]" />
        )}
      </div>

      {hasVideo && props.heroVideoAttribution ? (
        <VideoAttribution {...props.heroVideoAttribution} />
      ) : null}

      <div className="relative mx-auto flex min-h-[100vh] w-full max-w-5xl flex-col items-center justify-center px-6 py-24 text-center">
        {props.kicker ? (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8 text-[11px] uppercase tracking-[0.3em] text-white/55"
          >
            {props.kicker}
          </motion.p>
        ) : null}

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <VelorahHeadline text={props.headline} shinyWord={props.shinyWord} />
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.6 }}
          className="mt-8 max-w-xl text-base leading-relaxed text-white/60 md:text-lg"
        >
          {props.subheadline}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.8 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            href={props.ctaLink}
            className="cin-liquid-glass rounded-full px-12 py-4 text-sm font-medium text-white transition-all hover:bg-white/5"
          >
            {props.ctaText}
          </Link>
          {props.secondaryCta ? (
            <Link
              href={props.secondaryCta.link}
              className="inline-flex items-center rounded-full px-6 py-4 text-sm font-medium text-white/70 transition-colors hover:text-white"
            >
              {props.secondaryCta.text}
            </Link>
          ) : null}
        </motion.div>
      </div>
    </section>
  );
}
