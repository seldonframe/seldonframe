// app/(public)/landing-preview/[archetype]/page.tsx
//
// Phase R.1 preview surface. Loads the fixture for the requested
// archetype and renders all 5 sections as the auto-generated landing
// would render in production. Public route — no auth required.
//
// Available archetypes (Phase R.1):
//   - bold-urgency      (full implementation)
//
// Phase R.1.2 will add the other 6 archetypes.
import { notFound } from "next/navigation";
import { Hero } from "@/components/landing-r1/sections/hero";
import { ServicesGrid } from "@/components/landing-r1/sections/services-grid";
import { Testimonials } from "@/components/landing-r1/sections/testimonials";
import { Faq } from "@/components/landing-r1/sections/faq";
import { Footer } from "@/components/landing-r1/sections/footer";
import { stocktonFixture } from "@/components/landing-r1/fixtures/bold-urgency-stockton";

const FIXTURES = {
  "bold-urgency": stocktonFixture,
} as const;

type Archetype = keyof typeof FIXTURES;

export default async function LandingPreviewPage({
  params,
}: {
  params: Promise<{ archetype: string }>;
}) {
  const { archetype } = await params;
  const fixture = FIXTURES[archetype as Archetype];
  if (!fixture) notFound();
  return (
    <>
      <Hero {...fixture.hero} />
      <ServicesGrid {...fixture.services} />
      <Testimonials {...fixture.testimonials} />
      <Faq {...fixture.faq} />
      <Footer {...fixture.footer} />
    </>
  );
}

export const metadata = {
  title: "SeldonFrame Landing Preview",
  robots: "noindex",
};
