import Link from "next/link";
import type { PricingSectionContent } from "./types";

export function PricingSection({ headline, tiers }: PricingSectionContent) {
  return (
    <section className="bg-[hsl(var(--muted)/0.2)] px-5 py-24">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <h2 className="text-center text-3xl font-semibold text-foreground md:text-4xl">{headline}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {tiers.map((tier, index) => (
            <article
              key={`${tier.name}-${index}`}
              className={`relative glass-card rounded-2xl p-6 md:p-7 ${tier.popular ? "border-primary/50" : ""}`}
            >
              {tier.popular ? <span className="absolute right-4 top-4 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">Popular</span> : null}
              <p className="text-sm font-medium text-foreground">{tier.name}</p>
              <p className="mt-3 text-3xl font-semibold text-foreground">{tier.price}</p>
              {tier.period ? <p className="text-xs text-[hsl(var(--muted-foreground))]">{tier.period}</p> : null}
              <ul className="mt-4 space-y-2 text-sm text-[hsl(var(--muted-foreground))]">
                {tier.features.map((feature, featureIndex) => (
                  <li key={`${feature}-${featureIndex}`}>• {feature}</li>
                ))}
              </ul>
              <Link href={tier.ctaLink} className="crm-button-primary mt-6 h-10 w-full justify-center px-4 text-sm">
                {tier.ctaText}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
