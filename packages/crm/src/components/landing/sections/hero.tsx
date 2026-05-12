"use client";

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
import { useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import type { HeroSectionContent, UnsplashAttribution } from "./types";
import { HeroCinematicAura } from "./hero-cinematic-aura";

// v1.40.5 — Unsplash photographer credit. Required by Unsplash API
// guidelines for production-tier approval. Both photographer name and
// "Unsplash" link include the spec'd UTM params (utm_source +
// utm_medium=referral) so Unsplash can attribute referral traffic to
// SeldonFrame in their analytics.
//
// The `tone` prop chooses light text-on-dark (cinematic-fullbleed
// where the credit overlays the photo) vs dark text-on-light
// (side-image variants where the credit sits on the page background).
function UnsplashCredit({
  attribution,
  tone = "light",
}: {
  attribution: UnsplashAttribution;
  tone?: "light" | "dark";
}) {
  const utm = "?utm_source=seldonframe&utm_medium=referral";
  const photographerHref = `${attribution.photographer_url}${attribution.photographer_url.includes("?") ? "&" : "?"}utm_source=seldonframe&utm_medium=referral`;
  const unsplashHref = `https://unsplash.com/${utm}`;
  const baseClass =
    tone === "light"
      ? "text-white/70 hover:text-white"
      : "text-muted-foreground hover:text-foreground";
  return (
    <p className={`text-[10px] leading-tight tracking-wide ${baseClass}`}>
      Photo by{" "}
      <a
        href={photographerHref}
        target="_blank"
        rel="noopener noreferrer"
        className="underline-offset-2 hover:underline"
      >
        {attribution.photographer_name}
      </a>{" "}
      on{" "}
      <a
        href={unsplashHref}
        target="_blank"
        rel="noopener noreferrer"
        className="underline-offset-2 hover:underline"
      >
        Unsplash
      </a>
    </p>
  );
}

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

function HeroImage({
  src,
  alt,
  className = "",
  onError,
}: {
  src?: string;
  alt: string;
  className?: string;
  onError?: () => void;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        loading="eager"
        referrerPolicy="no-referrer"
        onError={onError}
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

  // v1.41.0 — cinematic-aura (Aura-style: looping Pexels video + liquid
  // glass + Instrument Serif). Dispatch first since it owns its own
  // rendering tree (FadingVideo, BlurText, AppleButton) and doesn't
  // need the imageFailed state below.
  if (variant === "cinematic-aura") {
    return <HeroCinematicAura {...props} />;
  }

  // v1.40.2 — onError-triggered fallback. Pre-1.40.2 the image's
  // src-empty case had a graceful fallback, but a 404 / unreachable
  // URL still rendered as a broken <img> with alt-text visible
  // (which the Lumen test surfaced — alt text in the upper left of
  // the gradient overlay). Now any side-image variant flips
  // `imageFailed=true` on the <img>'s onError event and re-renders
  // with the same branded gradient empty-state.
  const [imageFailed, setImageFailed] = useState(false);

  // Cinematic full-bleed: image is the page background, copy overlays.
  if (variant === "cinematic-fullbleed") {
    const hasImage =
      !imageFailed &&
      typeof props.heroImage === "string" &&
      props.heroImage.trim().length > 0;
    return (
      <section className="relative isolate overflow-hidden">
        {hasImage && props.heroImageAttribution ? (
          <div className="pointer-events-auto absolute bottom-3 right-4 z-20">
            <UnsplashCredit attribution={props.heroImageAttribution} tone="light" />
          </div>
        ) : null}
        <div className="absolute inset-0 -z-10">
          {hasImage ? (
            <>
              <img
                src={props.heroImage!}
                alt=""
                aria-hidden="true"
                loading="eager"
                referrerPolicy="no-referrer"
                onError={() => setImageFailed(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/65"
              />
            </>
          ) : (
            // Branded gradient empty state. Uses the workspace's primary
            // color so the hero feels intentional even when no Unsplash
            // result was available. The headline's first word renders as
            // an enormous typographic anchor in primary/40 — looks like
            // a designed editorial hero, not a broken image.
            <>
              <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-primary/10 to-background" />
              <div
                aria-hidden
                className="absolute inset-0 bg-[radial-gradient(circle_at_25%_30%,theme(colors.primary/.18),transparent_55%),radial-gradient(circle_at_75%_70%,theme(colors.primary/.12),transparent_55%)]"
              />
              <div className="absolute inset-y-0 right-0 flex w-1/2 items-center justify-end overflow-hidden pr-8 md:pr-16">
                <div className="select-none whitespace-nowrap text-[clamp(120px,16vw,260px)] font-bold leading-none tracking-tighter text-primary/15">
                  {(props.headline || "Welcome").split(/\s+/)[0]}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="mx-auto flex min-h-[80vh] w-full max-w-[1400px] flex-col justify-end px-6 py-24 md:px-10 md:py-32">
          <div className="max-w-3xl">
            {props.kicker ? (
              <p
                className="mb-3 text-[11px] uppercase tracking-[0.18em]"
                style={{ color: hasImage ? "rgba(255,255,255,0.85)" : "var(--sf-primary)" }}
              >
                {props.kicker}
              </p>
            ) : null}
            <h1
              className="text-4xl font-semibold leading-[1.05] tracking-tighter md:text-5xl lg:text-6xl"
              style={{ color: hasImage ? "#ffffff" : "var(--sf-text)" }}
            >
              {props.headline}
            </h1>
            <p
              className="mt-6 max-w-2xl text-base md:text-lg"
              style={{ color: hasImage ? "rgba(255,255,255,0.85)" : "var(--sf-muted)" }}
            >
              {props.subheadline}
            </p>
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
                hasImage ? (
                  <Link
                    href={props.secondaryCta.link}
                    className="inline-flex h-12 items-center rounded-full border border-white/30 bg-white/10 px-7 text-base font-semibold text-white backdrop-blur-md hover:bg-white/15"
                  >
                    {props.secondaryCta.text}
                  </Link>
                ) : (
                  <Link href={props.secondaryCta.link} className="crm-button-secondary h-12 px-7 text-base font-semibold">
                    {props.secondaryCta.text}
                  </Link>
                )
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
          <div className="space-y-2">
            <div className="aspect-square overflow-hidden rounded-2xl border bg-card">
              <HeroImage
                src={imageFailed ? undefined : props.heroImage}
                alt={props.headline}
                onError={() => setImageFailed(true)}
              />
            </div>
            {!imageFailed && props.heroImageAttribution && props.heroImage ? (
              <UnsplashCredit attribution={props.heroImageAttribution} tone="dark" />
            ) : null}
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
            <HeroImage
              src={imageFailed ? undefined : props.heroImage}
              alt={props.headline}
              onError={() => setImageFailed(true)}
              className="absolute inset-0"
            />
            {!imageFailed && props.heroImageAttribution && props.heroImage ? (
              <div className="absolute bottom-2 right-3 z-10">
                <UnsplashCredit attribution={props.heroImageAttribution} tone="light" />
              </div>
            ) : null}
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
        <div className="space-y-2">
          <div className="aspect-[4/5] overflow-hidden rounded-2xl border bg-card">
            {props.heroVideo ? (
              <video controls className="h-full w-full object-cover" src={props.heroVideo} />
            ) : (
              <HeroImage
                src={imageFailed ? undefined : props.heroImage}
                alt={props.headline}
                onError={() => setImageFailed(true)}
              />
            )}
          </div>
          {!imageFailed && props.heroImageAttribution && props.heroImage && !props.heroVideo ? (
            <UnsplashCredit attribution={props.heroImageAttribution} tone="dark" />
          ) : null}
        </div>
      </div>
    </section>
  );
}
