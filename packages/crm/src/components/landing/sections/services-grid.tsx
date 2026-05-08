// v1.36.0 — services-grid block.
//
// The single most-impactful section for a local-service-business
// landing page. Each card has price, optional duration, and a
// "Book" CTA that links to the booking page. Replaces the old
// pricing block for trades/service businesses where pricing is
// per-service not per-tier.

import Link from "next/link";
import { CheckCircle2, Sparkles } from "lucide-react";
import type { ServicesGridSectionContent } from "./types";

export function ServicesGridSection({
  headline,
  subheadline,
  services,
}: ServicesGridSectionContent) {
  return (
    <section className="bg-muted/15 px-5 py-24">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <header className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-semibold text-foreground md:text-4xl">{headline}</h2>
          {subheadline ? (
            <p className="mt-4 text-base text-muted-foreground md:text-lg leading-relaxed">{subheadline}</p>
          ) : null}
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service, index) => (
            <article
              key={`${service.name}-${index}`}
              className="group relative flex flex-col rounded-2xl border bg-card p-6 md:p-7 transition-all hover:border-primary/40 hover:-translate-y-[2px]"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                <Sparkles className="h-5 w-5" />
              </div>

              <h3 className="text-lg font-semibold text-foreground">{service.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">
                {service.description}
              </p>

              <div className="mt-5 pt-5 border-t border-border/60 flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] font-mono text-muted-foreground">Price</p>
                  <p className="text-xl font-bold text-foreground tracking-tight mt-0.5">{service.price}</p>
                </div>
                {service.duration ? (
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-[0.08em] font-mono text-muted-foreground">Duration</p>
                    <p className="text-sm text-foreground mt-0.5">{service.duration}</p>
                  </div>
                ) : null}
              </div>

              {service.ctaLink ? (
                <Link
                  href={service.ctaLink}
                  className="crm-button-primary mt-5 h-10 w-full justify-center text-sm font-semibold"
                >
                  {service.ctaText ?? "Book now"}
                </Link>
              ) : null}
            </article>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          All prices upfront — no surprises, no hidden fees.
        </p>
      </div>
    </section>
  );
}
