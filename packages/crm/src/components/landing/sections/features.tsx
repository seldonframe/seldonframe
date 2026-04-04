import Image from "next/image";
import type { FeaturesSectionContent } from "./types";

export function FeaturesSection({ headline, features, image }: FeaturesSectionContent) {
  return (
    <section className="px-5 py-24">
      <div className="mx-auto grid w-full max-w-6xl gap-8 md:grid-cols-[1.1fr,0.9fr] md:items-center">
        <div>
          <h2 className="text-3xl font-semibold text-foreground md:text-4xl">{headline}</h2>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {features.map((feature, index) => (
              <span key={`${feature}-${index}`} className="rounded-full border border-border bg-[hsl(var(--muted)/0.45)] px-3.5 py-1.5 text-sm font-medium text-foreground">
                {feature}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-3 md:p-4">
          {image ? (
            <Image src={image} alt={headline} width={960} height={720} className="h-full w-full rounded-2xl object-cover" />
          ) : (
            <div className="flex min-h-64 items-center justify-center rounded-2xl bg-[hsl(var(--muted)/0.35)] text-sm text-[hsl(var(--muted-foreground))]">
              Feature image
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
