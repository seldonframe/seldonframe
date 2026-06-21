// landing-r1/preview.tsx
//
// Minimal composition: all 5 sections from a single fixture. Used by the
// public preview route at /landing-preview/[archetype] so we can verify the
// visual output before wiring auto-landing generation into the workspace
// creation pipeline (Phase R.2).
//
// This is NOT an app page — it's a composition component. The route imports
// this directly.

import { Hero } from "./sections/hero";
import { ServicesGrid } from "./sections/services-grid";
import { Testimonials } from "./sections/testimonials";
import { Faq } from "./sections/faq";
import { Footer } from "./sections/footer";
import { SiteShell } from "./shell/site-shell";
import { stocktonFixture } from "./fixtures/bold-urgency-stockton";

export default function LandingPreview() {
  const f = stocktonFixture;
  return (
    <SiteShell archetype={f.hero.archetype} mode="light">
      <Hero {...f.hero} />
      <ServicesGrid {...f.services} />
      <Testimonials {...f.testimonials} />
      <Faq {...f.faq} />
      <Footer {...f.footer} />
      {/*
        Sticky mobile bar + desktop sticky CTA are application chrome, not
        section components — they live in the landing layout (or the public
        site shell) so they persist across all sections.
        See README → "Sticky CTAs" for the wiring.
      */}
    </SiteShell>
  );
}
