// v1.39.0 — hide the image column entirely when no image is set,
// instead of showing a "Feature image" placeholder text. The
// placeholder read as broken/template-y on every auto-generated
// workspace whose About section the LLM filled with body text but
// not an image asset (which is most of them — operators upload
// photos manually post-launch). Now: when image is present, render
// the two-column grid; when absent, render single-column with the
// headline + features pills centered, no empty box.
//
// Also swapped next/image → raw <img> for the image case (same
// pattern v1.38.4 applied to hero.tsx + project-gallery.tsx —
// avoids the next.config remotePatterns gotcha for any operator-
// uploaded URL we don't yet have in the allowlist).

/* eslint-disable @next/next/no-img-element */
import { Stagger } from "@/components/motion";
import type { FeaturesSectionContent } from "./types";

export function FeaturesSection({ headline, features, image }: FeaturesSectionContent) {
  const hasImage = typeof image === "string" && image.trim().length > 0;

  if (!hasImage) {
    return (
      <section className="px-5 py-24">
        <div className="mx-auto w-full max-w-3xl text-center">
          <h2 className="text-3xl font-semibold text-foreground md:text-4xl">{headline}</h2>
          <Stagger className="mt-8 flex flex-wrap justify-center gap-2.5" childDelay={0.04} distance={6}>
            {features.map((feature, index) => (
              <span key={`${feature}-${index}`} className="rounded-full border border-border bg-muted/45 px-3.5 py-1.5 text-sm font-medium text-foreground">
                {feature}
              </span>
            ))}
          </Stagger>
        </div>
      </section>
    );
  }

  return (
    <section className="px-5 py-24">
      <div className="mx-auto grid w-full max-w-6xl gap-8 md:grid-cols-[1.1fr,0.9fr] md:items-center">
        <div>
          <h2 className="text-3xl font-semibold text-foreground md:text-4xl">{headline}</h2>
          <Stagger className="mt-6 flex flex-wrap gap-2.5" childDelay={0.04} distance={6}>
            {features.map((feature, index) => (
              <span key={`${feature}-${index}`} className="rounded-full border border-border bg-muted/45 px-3.5 py-1.5 text-sm font-medium text-foreground">
                {feature}
              </span>
            ))}
          </Stagger>
        </div>
        <div className="rounded-xl border bg-card p-3 md:p-4">
          <img
            src={image}
            alt={headline}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full rounded-2xl object-cover"
          />
        </div>
      </div>
    </section>
  );
}
