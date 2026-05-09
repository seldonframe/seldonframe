// v1.39.0 — replaced the 5-entry PascalCase iconByName map with the
// shared resolveBlockIcon resolver (60+ entries, normalized lookup).
//
// Pre-1.39.0: iconByName was {Sparkles, Star, Rocket, ShieldCheck,
// CircleCheckBig} keyed by exact PascalCase strings. The enhance-blocks
// LLM prompt asked Claude for kebab-case names (`shield-check`, `clock`,
// `wrench`, etc.) — none of which matched. So the lookup ALWAYS missed
// and every benefit card rendered <Sparkles>. Same root cause as the
// services-grid bug v1.38.5 fixed; benefits had its own (different)
// implementation that we hadn't touched.
//
// Now both blocks use ./icon-resolver.ts. Adding new icons or aliases
// for future verticals is a one-file change.

import { Stagger } from "@/components/motion";
import { resolveBlockIcon } from "./icon-resolver";
import type { BenefitsSectionContent } from "./types";

export function BenefitsSection({ headline, benefits }: BenefitsSectionContent) {
  return (
    <section className="px-5 py-24">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <h2 className="text-center text-3xl font-semibold text-foreground md:text-4xl">{headline}</h2>
        {/* v1.33.2 — Stagger fades each benefit card in sequentially as
            the grid scrolls into view. Subtle, premium feel. */}
        <Stagger className="grid gap-4 md:grid-cols-3" childDelay={0.08}>
          {benefits.map((benefit, index) => {
            const Icon = resolveBlockIcon(benefit.icon);
            return (
              <article key={`${benefit.title}-${index}`} className="rounded-xl border bg-card p-6 md:p-7">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-foreground">{benefit.title}</h3>
                <p className="mt-2 text-base text-muted-foreground">{benefit.description}</p>
              </article>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}
