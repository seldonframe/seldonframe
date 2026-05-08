import Link from "next/link";
import { Stagger } from "@/components/motion";
import type { PricingSectionContent } from "./types";

export function PricingSection({ headline, tiers }: PricingSectionContent) {
  return (
    <section className="bg-muted/20 px-5 py-24">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <h2 className="text-center text-3xl font-semibold text-foreground md:text-4xl">{headline}</h2>
        {/* v1.33.2 — Pricing tiers stagger in left-to-right as they
            scroll into view. Slightly larger childDelay (0.1s) so the
            "popular" tier in the middle reads as deliberately
            highlighted. */}
        <Stagger className="grid gap-4 md:grid-cols-3" childDelay={0.1}>
          {tiers.map((tier, index) => (
            <article
              key={`${tier.name}-${index}`}
              className={`relative rounded-xl border bg-card p-6 md:p-7 ${tier.popular ? "border-primary/50" : ""}`}
            >
              {tier.popular ? <span className="absolute right-4 top-4 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">Popular</span> : null}
              <p className="text-sm font-medium text-foreground">{tier.name}</p>
              <p className="mt-3 text-3xl font-semibold text-foreground">{tier.price}</p>
              {tier.period ? <p className="text-xs text-muted-foreground">{tier.period}</p> : null}
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {tier.features.map((feature, featureIndex) => (
                  <li key={`${feature}-${featureIndex}`}>• {feature}</li>
                ))}
              </ul>
              <Link href={tier.ctaLink} className="crm-button-primary mt-6 h-10 w-full justify-center px-4 text-sm">
                {tier.ctaText}
              </Link>
            </article>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
