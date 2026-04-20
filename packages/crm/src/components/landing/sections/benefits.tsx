import { CircleCheckBig, Rocket, ShieldCheck, Sparkles, Star } from "lucide-react";
import type { ComponentType } from "react";
import type { BenefitsSectionContent } from "./types";

const iconByName: Record<string, ComponentType<{ className?: string }>> = {
  Sparkles,
  Star,
  Rocket,
  ShieldCheck,
  CircleCheckBig,
};

export function BenefitsSection({ headline, benefits }: BenefitsSectionContent) {
  return (
    <section className="px-5 py-24">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <h2 className="text-center text-3xl font-semibold text-foreground md:text-4xl">{headline}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {benefits.map((benefit, index) => (
            <article key={`${benefit.title}-${index}`} className="rounded-xl border bg-card p-6 md:p-7">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50 text-primary">
                {benefit.icon && iconByName[benefit.icon] ? (() => {
                  const Icon = iconByName[benefit.icon];
                  return <Icon className="h-5 w-5" />;
                })() : <Sparkles className="h-5 w-5" />}
              </div>
              <h3 className="mt-4 text-lg font-medium text-foreground">{benefit.title}</h3>
              <p className="mt-2 text-base text-muted-foreground">{benefit.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
