// v1.40.0 — hero now supports archetype-driven layout variants.
//
// Centered hero is BANNED per taste-skill (DESIGN_VARIANCE > 4 is the
// default for every archetype). The four allowed variants:
//
//   - left-aligned-asymmetric: copy in a 60% left column with intentional
//     whitespace, image floats right at 40%. Editorial / craft default.
//   - split-screen-50-50: classic 50/50, copy left, image right. Bold /
//     emergency / B2B default.
//   - cinematic-fullbleed: image as full-bleed background, copy overlays
//     on a dark gradient. Aspirational / luxe default.
//   - founder-portrait: copy left, square portrait right with eyebrow.
//     Solo-operator / coaching default.
//
// Pre-1.40.0 hero shipped a single centered+two-column layout for every
// vertical, which is exactly the AI-default the taste-skill bans.
//
// Also v1.40.0 — Hormozi-style proof tile (rating + count above CTA) +
// risk-reversal badges (license / BBB / insured under CTA). Both render
// only when soul has the underlying signals; absent soul → graceful
// hide, no empty placeholders.

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Star } from "lucide-react";
import type { HeroSectionContent } from "./types";

function ProofTile({ rating, label }: NonNullable<HeroSectionContent["proofTile"]>) {
  return (
    <div className="mb-5 inline-flex items-center gap-3 rounded-full border bg-card px-4 py-2">
      <div className="flex items-center gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star
            key={i}
            className={`size-3.5 ${i < Math.floor(rating) ? "fill-amber-400 text-amber-400" : "fill-muted text-muted"}`}
          />
        ))}
      </div>
      <span className="text-sm font-semibold text-foreground">{rating.toFixed(1)}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function RiskReversalBadges({ badges }: { badges: string[] }) {
  if (!badges || badges.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {badges.map((badge, idx) => (
        <span
          key={`${badge}-${idx}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-foreground"
        >
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          {badge}
        </span>
      ))}
    </div>
  );
}

function HeroImage({ src, alt, className = "" }: { src?: string; alt: string; className?: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        loading="eager"
        referrerPolicy="no-referrer"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  return (
    <div
      className={`relative flex min-h-72 items-center justify-center overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-background border border-primary/20 ${className}`}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_30%_30%,theme(colors.primary/.12),transparent_50%),radial-gradient(circle_at_70%_70%,theme(colors.primary/.08),transparent_50%)]"
      />
      <div className="relative z-10 px-6 text-center">
        <div className="select-none text-[clamp(48px,8vw,96px)] font-bold leading-none tracking-tight text-primary/40">
          {(alt || "Welcome").split(/\s+/)[0]}
        </div>
      </div>
    </div>
  );
}

export function HeroSection(props: HeroSectionContent) {
  const variant = props.variant ?? "left-aligned-asymmetric";

  // Cinematic full-bleed: image is the page background, copy overlays.
  if (variant === "cinematic-fullbleed") {
    return (
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <HeroImage src={props.heroImage} alt={props.headline} className="absolute inset-0" />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black/80"
          />
        </div>
        <div className="mx-auto flex min-h-[80vh] w-full max-w-[1400px] flex-col justify-end px-6 py-24 md:px-10 md:py-32">
          <div className="max-w-3xl">
            {props.kicker ? (
              <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-white/80">{props.kicker}</p>
            ) : null}
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tighter text-white md:text-6xl lg:text-7xl">
              {props.headline}
            </h1>
            <p className="mt-6 max-w-2xl text-base text-white/80 md:text-lg">{props.subheadline}</p>
            {props.proofTile ? (
              <div className="mt-6">
                <ProofTile {...props.proofTile} />
              </div>
            ) : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={props.ctaLink} className="crm-button-primary h-12 px-7 text-base font-semibold">
                {props.ctaText}
              </Link>
              {props.secondaryCta ? (
                <Link
                  href={props.secondaryCta.link}
                  className="inline-flex h-12 items-center rounded-full border border-white/30 bg-white/10 px-7 text-base font-semibold text-white backdrop-blur-md hover:bg-white/15"
                >
                  {props.secondaryCta.text}
                </Link>
              ) : null}
            </div>
            <RiskReversalBadges badges={props.riskReversalBadges ?? []} />
          </div>
        </div>
      </section>
    );
  }

  // Founder portrait: copy spans 60%, square portrait right.
  if (variant === "founder-portrait") {
    return (
      <section className="relative overflow-hidden px-6 py-24 md:px-10">
        <div className="mx-auto grid w-full max-w-[1400px] items-center gap-12 md:grid-cols-[1.4fr_0.8fr]">
          <div>
            {props.kicker ? (
              <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-primary">{props.kicker}</p>
            ) : null}
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tighter text-foreground md:text-6xl lg:text-7xl">
              {props.headline}
            </h1>
            <p className="mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">{props.subheadline}</p>
            {props.proofTile ? (
              <div className="mt-6">
                <ProofTile {...props.proofTile} />
              </div>
            ) : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={props.ctaLink} className="crm-button-primary h-12 px-7 text-base font-semibold">
                {props.ctaText}
              </Link>
              {props.secondaryCta ? (
                <Link href={props.secondaryCta.link} className="crm-button-secondary h-12 px-7 text-base font-semibold">
                  {props.secondaryCta.text}
                </Link>
              ) : null}
            </div>
            <RiskReversalBadges badges={props.riskReversalBadges ?? []} />
          </div>
          <div className="aspect-square overflow-hidden rounded-2xl border bg-card">
            <HeroImage src={props.heroImage} alt={props.headline} />
          </div>
        </div>
      </section>
    );
  }

  // Split-screen 50-50: classic, bold, urgency-friendly.
  if (variant === "split-screen-50-50") {
    return (
      <section className="relative overflow-hidden">
        <div className="mx-auto grid w-full max-w-[1400px] items-stretch gap-0 md:grid-cols-2">
          <div className="flex flex-col justify-center px-6 py-20 md:px-12 md:py-28">
            {props.kicker ? (
              <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-primary">{props.kicker}</p>
            ) : null}
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tighter text-foreground md:text-5xl lg:text-6xl">
              {props.headline}
            </h1>
            <p className="mt-6 max-w-xl text-base text-muted-foreground md:text-lg">{props.subheadline}</p>
            {props.proofTile ? (
              <div className="mt-6">
                <ProofTile {...props.proofTile} />
              </div>
            ) : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={props.ctaLink} className="crm-button-primary h-12 px-7 text-base font-semibold">
                {props.ctaText}
              </Link>
              {props.secondaryCta ? (
                <Link href={props.secondaryCta.link} className="crm-button-secondary h-12 px-7 text-base font-semibold">
                  {props.secondaryCta.text}
                </Link>
              ) : null}
            </div>
            <RiskReversalBadges badges={props.riskReversalBadges ?? []} />
          </div>
          <div className="relative min-h-[420px] md:min-h-[600px]">
            <HeroImage src={props.heroImage} alt={props.headline} className="absolute inset-0" />
          </div>
        </div>
      </section>
    );
  }

  // Default: left-aligned-asymmetric. The editorial workhorse.
  return (
    <section className="relative overflow-hidden px-6 py-24 md:px-10">
      <div className="mx-auto grid w-full max-w-[1400px] items-center gap-10 md:grid-cols-[1.5fr_1fr]">
        <div>
          {props.kicker ? (
            <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-primary">{props.kicker}</p>
          ) : null}
          <h1 className="text-4xl font-semibold leading-[1.02] tracking-tighter text-foreground md:text-6xl lg:text-7xl">
            {props.headline}
          </h1>
          <p className="mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">{props.subheadline}</p>
          {props.proofTile ? (
            <div className="mt-6">
              <ProofTile {...props.proofTile} />
            </div>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={props.ctaLink} className="crm-button-primary h-12 px-7 text-base font-semibold">
              {props.ctaText}
            </Link>
            {props.secondaryCta ? (
              <Link href={props.secondaryCta.link} className="crm-button-secondary h-12 px-7 text-base font-semibold">
                {props.secondaryCta.text}
              </Link>
            ) : null}
          </div>
          <RiskReversalBadges badges={props.riskReversalBadges ?? []} />
        </div>
        <div className="aspect-[4/5] overflow-hidden rounded-2xl border bg-card">
          {props.heroVideo ? (
            <video controls className="h-full w-full object-cover" src={props.heroVideo} />
          ) : (
            <HeroImage src={props.heroImage} alt={props.headline} />
          )}
        </div>
      </div>
    </section>
  );
}
