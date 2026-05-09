// v1.38.4 — switched from next/image to raw <img>. The Image
// component requires next.config.js images.remotePatterns to
// allow remote domains; without that allowlist, every Unsplash
// URL silently failed and we rendered the alt-text fallback
// (which is what the user saw on Hill Mountain Roofing). Same
// pattern we already use in project-gallery.tsx — Unsplash CDN
// already serves WebP at the edge, no Next.js optimization
// needed. referrerPolicy="no-referrer" because some Unsplash
// CDN responses behave better when no referrer is sent.
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { HeroSectionContent } from "./types";

export function HeroSection({
  kicker,
  headline,
  subheadline,
  ctaText,
  ctaLink,
  secondaryCta,
  heroImage,
  heroVideo,
}: HeroSectionContent) {
  return (
    <section className="relative overflow-hidden px-5 py-24">
      <div className="mx-auto grid w-full max-w-6xl gap-8 md:grid-cols-[1.15fr,0.85fr] md:items-center">
        <div>
          {kicker ? <p className="text-tiny text-primary">{kicker}</p> : null}
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground md:text-6xl">{headline}</h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">{subheadline}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={ctaLink} className="crm-button-primary h-11 px-6">
              {ctaText}
            </Link>
            {secondaryCta ? (
              <Link href={secondaryCta.link} className="crm-button-secondary h-11 px-6">
                {secondaryCta.text}
              </Link>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-3">
          {heroVideo ? (
            <video controls className="h-full w-full rounded-2xl object-cover" src={heroVideo} />
          ) : heroImage ? (
            <img
              src={heroImage}
              alt={headline}
              loading="eager"
              referrerPolicy="no-referrer"
              className="h-full w-full rounded-2xl object-cover"
            />
          ) : (
            // v1.36.0 — better empty state. The pre-v1.36 "Add hero
            // media" gray box read as broken/unfinished on every
            // freshly-generated workspace. Now: a brand-tinted gradient
            // with the headline's first word as a typographic anchor.
            // Looks intentional even before a real photo is uploaded.
            <div className="relative flex min-h-72 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-background overflow-hidden border border-primary/20">
              <div
                aria-hidden
                className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_30%_30%,theme(colors.primary/.12),transparent_50%),radial-gradient(circle_at_70%_70%,theme(colors.primary/.08),transparent_50%)]"
              />
              <div className="relative z-10 text-center px-6">
                <div className="text-[clamp(48px,8vw,96px)] font-bold tracking-tight text-primary/40 leading-none select-none">
                  {(headline || "Welcome").split(/\s+/)[0]}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
