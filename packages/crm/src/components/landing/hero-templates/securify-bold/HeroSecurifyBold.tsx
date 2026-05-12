"use client";

// v1.43.0 — Securify-style giant staggered typography hero.
//
// Pure black bg, Pexels looping video at low contrast, headline broken
// into 3 staggered absolute-positioned lines at corners-and-center,
// stat blocks in corner positions, bottom gradient.
//
// For: data security, dev tools, AI infra, hard-tech SaaS — anywhere
// the brand wants confidence + scale + no warmth. The pure-black + huge
// type combination signals "we are serious" louder than any cinematic
// motion could.

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
    <div className="pointer-events-auto absolute right-4 top-3 z-30">
      <p className="text-[10px] leading-tight tracking-wide text-white/40">
        Video by{" "}
        <a
          href={photographer_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:text-white/70 hover:underline"
        >
          {photographer_name}
        </a>{" "}
        on{" "}
        <a
          href={source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:text-white/70 hover:underline"
        >
          Pexels
        </a>
      </p>
    </div>
  );
}

/**
 * Split the headline into 3 staggered chunks. Securify's reference uses
 * "protect / your / data" — 3 single words. Our copy may have 4-12 words.
 * We group into 3 roughly-even chunks and absolute-position each at a
 * corner-or-center stagger so the typography breathes regardless of
 * headline length.
 */
function StaggeredHeadline({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  const third = Math.max(1, Math.ceil(words.length / 3));
  const lines = [
    words.slice(0, third).join(" "),
    words.slice(third, third * 2).join(" "),
    words.slice(third * 2).join(" "),
  ].filter((l) => l.length > 0);

  // Position triplet: top-left → top-right → center-indented. Mirrors
  // Securify's reference exactly when the headline is 3 words; degrades
  // gracefully for longer copy by wrapping inside each absolutely-placed h1.
  const slots = [
    { top: "top-[14%]", side: "left-4 md:left-12 text-left" },
    { top: "top-[36%]", side: "right-4 md:right-12 text-right" },
    { top: "top-[58%]", side: "left-[14%] md:left-[26%] text-left" },
  ];

  return (
    <>
      {lines.map((line, i) => {
        const slot = slots[i] ?? slots[2];
        return (
          <motion.h1
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{
              duration: 0.9,
              delay: 0.3 + i * 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={`tpl-stagger-word absolute ${slot.top} ${slot.side} max-w-[60%] text-white`}
            style={{ fontSize: "clamp(2.5rem, 12vw, 11rem)" }}
          >
            {line}
          </motion.h1>
        );
      })}
    </>
  );
}

function CornerStat({
  label,
  value,
  position,
}: {
  label: string;
  value: string;
  position: "tr" | "bl" | "br";
}) {
  const positionClasses = {
    tr: "right-6 top-[14%] md:right-24 items-end text-right",
    bl: "left-6 bottom-20 md:left-20 md:bottom-24 items-start text-left",
    br: "right-6 bottom-16 md:right-20 md:bottom-20 items-end text-right",
  }[position];

  const dividerRotate = {
    tr: "rotate-[20deg]",
    bl: "-rotate-[20deg]",
    br: "-rotate-[20deg]",
  }[position];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.9 }}
      className={`absolute z-20 flex flex-col gap-1 ${positionClasses}`}
    >
      <div className={`flex items-center gap-3 ${position === "bl" ? "" : "justify-end"}`}>
        {position === "bl" ? (
          <span className="text-3xl font-medium tracking-tight text-white md:text-5xl">
            {value}
          </span>
        ) : null}
        <span className={`hidden h-px w-24 bg-white/40 md:block ${dividerRotate}`} />
        {position !== "bl" ? (
          <span className="text-3xl font-medium tracking-tight text-white md:text-5xl">
            {value}
          </span>
        ) : null}
      </div>
      <span className="text-xs text-white/65 md:text-sm">{label}</span>
    </motion.div>
  );
}

export function HeroSecurifyBold(props: HeroSectionContent) {
  const hasVideo = typeof props.heroVideo === "string" && props.heroVideo.trim().length > 0;

  // Pull up to 3 stat values from riskReversalBadges to occupy the corners.
  // Strings like "+65k startups", "200% ROI" already have the value-then-
  // label shape; we just split on first space and render.
  const badges = (props.riskReversalBadges ?? []).slice(0, 3);
  const cornerStats = badges
    .map((badge) => {
      const m = badge.match(/^(\S+)\s+(.+)$/);
      return m ? { value: m[1], label: m[2] } : { value: badge, label: "" };
    })
    .filter((s) => s.value.length > 0);

  // Map up to 3 stats to corners (top-right, bottom-left, bottom-right).
  const cornerPositions: Array<"tr" | "bl" | "br"> = ["tr", "bl", "br"];

  return (
    <section className="relative isolate h-screen w-full overflow-hidden bg-black">
      <div className="absolute inset-0 -z-10">
        {hasVideo ? (
          <>
            <FadingVideo
              src={props.heroVideo!}
              poster={props.heroImage}
              className="absolute inset-0 h-full w-full object-cover opacity-70"
            />
            {/* Bottom gradient for footing — Securify's reference has this
                exact fade-to-black behavior. */}
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-black via-black/60 to-transparent"
            />
            {/* Subtle vignette */}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/40"
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#000_0%,#0a0a0a_50%,#000_100%)]" />
        )}
      </div>

      {hasVideo && props.heroVideoAttribution ? (
        <VideoAttribution {...props.heroVideoAttribution} />
      ) : null}

      <StaggeredHeadline text={props.headline.toLowerCase()} />

      {/* Subhead — positioned near the second line of the staggered headline. */}
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.7 }}
        className="absolute left-6 top-[46%] z-10 max-w-[240px] text-[15px] leading-snug text-white/90 md:left-12"
      >
        {props.subheadline}
      </motion.p>

      {cornerStats.map((stat, i) => (
        <CornerStat
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          value={stat.value}
          label={stat.label}
          position={cornerPositions[i] ?? "br"}
        />
      ))}

      {/* Bottom CTA pair, centered below content */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 1.0 }}
        className="absolute inset-x-0 bottom-8 z-20 flex flex-wrap items-center justify-center gap-3 px-6"
      >
        <Link
          href={props.ctaLink}
          className="cin-liquid-glass rounded-full px-7 py-3 text-sm font-medium text-white transition-colors hover:bg-white/5"
        >
          {props.ctaText}
        </Link>
        {props.secondaryCta ? (
          <Link
            href={props.secondaryCta.link}
            className="rounded-full bg-white px-7 py-3 text-sm font-medium text-black transition-colors hover:bg-white/90"
          >
            {props.secondaryCta.text}
          </Link>
        ) : null}
      </motion.div>
    </section>
  );
}
