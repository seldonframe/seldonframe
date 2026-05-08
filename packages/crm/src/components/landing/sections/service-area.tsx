// v1.36.0 — service-area block.
//
// "Do you cover my city?" is the second-most-asked question on a
// local-service landing page (right after price). This block answers
// it visually with a chip cloud of cities/neighborhoods, anchored by
// the primary location. Tells visitors "we cover you" without
// requiring an embedded map.

import { MapPin } from "lucide-react";
import type { ServiceAreaSectionContent } from "./types";

export function ServiceAreaSection({
  headline,
  subheadline,
  primaryLocation,
  areas,
}: ServiceAreaSectionContent) {
  return (
    <section className="px-5 py-24">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
            <MapPin className="h-5 w-5" />
          </div>
          <h2 className="text-3xl font-semibold text-foreground md:text-4xl">{headline}</h2>
          {primaryLocation ? (
            <p className="mt-2 text-base font-medium text-primary">{primaryLocation}</p>
          ) : null}
          {subheadline ? (
            <p className="mt-3 text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">{subheadline}</p>
          ) : null}
        </header>

        <div className="flex flex-wrap justify-center gap-2.5">
          {areas.map((area, index) => (
            <span
              key={`${area}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground"
            >
              <MapPin className="h-3.5 w-3.5 text-primary" />
              {area}
            </span>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Don&apos;t see your area? Call us — we may still be able to help.
        </p>
      </div>
    </section>
  );
}
