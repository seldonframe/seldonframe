// app/(public)/landing-preview/[archetype]/page.tsx
//
// Phase R.2 preview surface. Loads the fixture for the requested
// archetype and renders all 5 sections plus the 2 page-chrome surfaces
// as the auto-generated landing would render in production.
// Public route — no auth required.
//
// Available archetypes (Phase R.2):
//   - bold-urgency              Stockton Heating & Cooling (HVAC)
//   - editorial-warm            Hudson Valley Restoration (heritage roofer)
//   - clinical-trust            Foothill Family Dental
//   - cinematic-aspirational    Solace Aesthetics (medspa)
//   - technical-restrained      Northwind Engineering (B2B consultancy)
//   - soft-residential          Verdant Lawn Care (residential lawn care)
//   - brutalist                 Field/Studio (design studio)
import { notFound } from "next/navigation";
import { EmergencyStrip, type EmergencyStripProps } from "@/components/landing-r1/chrome/emergency-strip";
import { StickyMobileBar, type StickyMobileBarProps } from "@/components/landing-r1/chrome/sticky-mobile-bar";
import { Hero } from "@/components/landing-r1/sections/hero";
import { ServicesGrid } from "@/components/landing-r1/sections/services-grid";
import { Testimonials } from "@/components/landing-r1/sections/testimonials";
import { Faq } from "@/components/landing-r1/sections/faq";
import { Footer } from "@/components/landing-r1/sections/footer";
import { stocktonFixture } from "@/components/landing-r1/fixtures/bold-urgency-stockton";
import { hudsonValleyFixture } from "@/components/landing-r1/fixtures/editorial-warm-hudson-valley";
import { foothillDentalFixture } from "@/components/landing-r1/fixtures/clinical-trust-foothill-dental";
import { solaceFixture } from "@/components/landing-r1/fixtures/cinematic-aspirational-solace";
import { northwindFixture } from "@/components/landing-r1/fixtures/technical-restrained-northwind";
import { verdantFixture } from "@/components/landing-r1/fixtures/soft-residential-verdant";
import { fieldStudioFixture } from "@/components/landing-r1/fixtures/brutalist-field-studio";

const FIXTURES = {
  "bold-urgency": stocktonFixture,
  "editorial-warm": hudsonValleyFixture,
  "clinical-trust": foothillDentalFixture,
  "cinematic-aspirational": solaceFixture,
  "technical-restrained": northwindFixture,
  "soft-residential": verdantFixture,
  "brutalist": fieldStudioFixture,
} as const;

type Archetype = keyof typeof FIXTURES;

/** Chrome props are optional — not all archetypes include them. */
type FixtureWithChrome = (typeof FIXTURES)[Archetype] & {
  emergency?: EmergencyStripProps;
  sticky?: StickyMobileBarProps;
};

export default async function LandingPreviewPage({
  params,
}: {
  params: Promise<{ archetype: string }>;
}) {
  const { archetype } = await params;
  const fixture = FIXTURES[archetype as Archetype] as FixtureWithChrome | undefined;
  if (!fixture) notFound();
  return (
    <>
      {fixture.emergency && <EmergencyStrip {...fixture.emergency} />}
      <Hero {...fixture.hero} />
      <ServicesGrid {...fixture.services} />
      <Testimonials {...fixture.testimonials} />
      <Faq {...fixture.faq} />
      <Footer {...fixture.footer} />
      {fixture.sticky && <StickyMobileBar {...fixture.sticky} />}
    </>
  );
}

export const metadata = {
  title: "SeldonFrame Landing Preview",
  robots: "noindex",
};
