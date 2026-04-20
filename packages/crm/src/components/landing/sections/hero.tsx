import Link from "next/link";
import Image from "next/image";
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
            <Image src={heroImage} alt={headline} width={960} height={720} className="h-full w-full rounded-2xl object-cover" />
          ) : (
            <div className="flex min-h-72 items-center justify-center rounded-2xl bg-muted/35 text-sm text-muted-foreground">
              Add hero media
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
