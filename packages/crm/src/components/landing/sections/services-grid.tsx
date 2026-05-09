// v1.36.0 — services-grid block.
//
// The single most-impactful section for a local-service-business
// landing page. Each card has price, optional duration, and a
// "Book" CTA that links to the booking page. Replaces the old
// pricing block for trades/service businesses where pricing is
// per-service not per-tier.
//
// v1.38.4 — per-service icon resolver. Pre-1.38.4 every card
// rendered the same hardcoded <Sparkles> icon, which made the
// services row look like wallpaper. Now we resolve the LLM-
// generated `service.icon` string (lucide name, e.g. "wrench",
// "cloud-rain-wind", "shield") to the actual lucide React
// component. Falls back to <Sparkles> for unknown names so a
// stale icon string never breaks the render.

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { resolveBlockIcon } from "./icon-resolver";
import type { ServicesGridSectionContent } from "./types";

// v1.39.0 — icon resolver extracted to ./icon-resolver.ts so benefits +
// services + future blocks share the same 60+ entry name → component
// map. See that file for the full alias table (storm → CloudRainWind,
// shingle → Home, drain → Droplets, etc.).

// v1.40.1 — append ?service=<slug> to the service card's CTA so the
// public booking form picks up which service the visitor clicked. The
// slug is derived from the service name (lowercased, hyphenated). If
// ctaLink already has query params, we append with &.
function toServiceSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function appendServiceParam(ctaLink: string, serviceName: string): string {
  const slug = toServiceSlug(serviceName);
  if (!slug) return ctaLink;
  const sep = ctaLink.includes("?") ? "&" : "?";
  return `${ctaLink}${sep}service=${slug}`;
}

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
          {services.map((service, index) => {
            const Icon = resolveBlockIcon(service.icon);
            return (
            <article
              key={`${service.name}-${index}`}
              className="group relative flex flex-col rounded-2xl border bg-card p-6 md:p-7 transition-all hover:border-primary/40 hover:-translate-y-[2px]"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                <Icon className="h-5 w-5" />
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
                  // v1.40.1 — append ?service=<slug> so the booking
                  // form knows which service the visitor clicked, can
                  // pre-fill the "Service requested" banner, and can
                  // store it on the booking row for the operator.
                  href={appendServiceParam(service.ctaLink, service.name)}
                  className="crm-button-primary mt-5 h-10 w-full justify-center text-sm font-semibold"
                >
                  {service.ctaText ?? "Book now"}
                </Link>
              ) : null}
            </article>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          All prices upfront — no surprises, no hidden fees.
        </p>
      </div>
    </section>
  );
}
