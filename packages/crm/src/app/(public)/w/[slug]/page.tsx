// packages/crm/src/app/(public)/w/[slug]/page.tsx
//
// Public workspace landing page at /w/[slug].
// Rendered by the R-framework components from a JSON payload generated
// at workspace creation time.
//
// No auth required. robots: noindex is NOT set — these pages should be
// indexed by search engines.
//
// Route: /w/[slug]  (e.g. /w/maloney-plumbing)
// Data: loaded from landing_pages WHERE orgId = org.id AND slug = 'r1'
//       via loadLandingPayload() helper.

import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Hero } from "@/components/landing-r1/sections/hero";
import { ServicesGrid } from "@/components/landing-r1/sections/services-grid";
import { Testimonials } from "@/components/landing-r1/sections/testimonials";
import { Faq } from "@/components/landing-r1/sections/faq";
import { Footer } from "@/components/landing-r1/sections/footer";
import { EmergencyStrip } from "@/components/landing-r1/chrome/emergency-strip";
import { StickyMobileBar } from "@/components/landing-r1/chrome/sticky-mobile-bar";
import { Navbar } from "@/components/landing-r1/chrome/navbar";
import { ChatbotEmbedScript } from "@/components/landing/chatbot-script";

import { loadLandingPayload } from "@/lib/landing/r1-save";
import { rewriteR1Hrefs } from "@/lib/landing/r1-rewrite-hrefs";
import { buildWorkspaceUrls } from "@/lib/billing/anonymous-workspace";
import { getPublicChatbotEmbed } from "@/lib/agents/public-embed";
import {
  LANDING_TEMPLATES,
  isLandingTemplateId,
} from "@/components/landing-templates/registry";
import { r1PayloadToTemplateData } from "@/lib/landing/r1-payload-to-template";
import {
  archetypeToSfTheme,
  buildTemplateCtas,
} from "@/lib/landing/template-adapters";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadLandingPayload(slug);

  if (!data) {
    return { title: "Page not found" };
  }

  const { seo, payload } = data;

  return {
    title: seo.title,
    description: seo.description,
    openGraph: {
      title: seo.title,
      description: seo.description,
      ...(seo.ogImage ? { images: [{ url: seo.ogImage }] } : {}),
      type: "website",
    },
    // These pages should be indexed.
    robots: {
      index: true,
      follow: true,
    },
    // Canonical URL points to this /w/[slug] path.
    alternates: {
      canonical: `/w/${slug}`,
    },
    // Structured data — basic local business schema via JSON-LD.
    // Phase R.3 will expand this with full LocalBusiness schema.
    other: {
      "application/ld+json": JSON.stringify({
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        name: payload.footer.businessName,
        telephone: payload.footer.phone,
        ...(payload.footer.address
          ? {
              address: {
                "@type": "PostalAddress",
                streetAddress: payload.footer.address.line1,
                addressLocality: payload.footer.address.city,
                addressRegion: payload.footer.address.state,
                postalCode: payload.footer.address.zip,
              },
            }
          : {}),
        ...(payload.hero.reviewRating != null && payload.hero.reviewCount != null
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: String(payload.hero.reviewRating),
                reviewCount: String(payload.hero.reviewCount),
              },
            }
          : {}),
      }),
    },
  };
}

export default async function WorkspaceLandingPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await loadLandingPayload(slug);

  if (!data) {
    notFound();
  }

  const { orgId, landingTemplate } = data;

  // bisect 4/4: chatbot embed — shared by both render paths.
  const chatbotEmbed = await getPublicChatbotEmbed(orgId);

  // Health-templates pilot: when the workspace has opted into a premium
  // full-page template (persisted at organizations.theme.landingTemplate),
  // render it as an alternative renderer of the same r1 content. The template
  // builds its own workspace-scoped CTAs (book/intake/tel:), so it does NOT
  // need the r1 href-rewrite. Workspaces without a registered template fall
  // through to the existing landing-r1 path below, unchanged.
  if (isLandingTemplateId(landingTemplate)) {
    const Tpl = LANDING_TEMPLATES[landingTemplate];
    const templateData = r1PayloadToTemplateData(data.payload);
    const ctas = buildTemplateCtas(slug, orgId, templateData.phone);
    const theme = archetypeToSfTheme(data.payload.hero.archetype ?? data.archetype);
    return (
      <>
        <Tpl data={templateData} ctas={ctas} theme={theme} />
        {chatbotEmbed && <ChatbotEmbedScript embedUrl={chatbotEmbed.embedUrl} />}
      </>
    );
  }

  // bisect 3/4: rewrite generic CTA hrefs to workspace-scoped URLs.
  const workspaceUrls = buildWorkspaceUrls(
    slug,
    process.env.WORKSPACE_BASE_DOMAIN ?? "app.seldonframe.com",
    orgId,
  );
  const payload = rewriteR1Hrefs(data.payload, {
    book: workspaceUrls.book,
    intake: workspaceUrls.intake,
    home: workspaceUrls.home,
  });

  return (
    <>
      {/* bisect 4/4: all three pieces wired. */}
      <Navbar
        archetype={payload.hero.archetype}
        businessName={payload.hero.businessName}
        phone={payload.footer.phone}
        serviceAreas={payload.footer.serviceAreas}
      />
      {payload.emergency && <EmergencyStrip {...payload.emergency} />}
      <Hero {...payload.hero} />
      <ServicesGrid {...payload.services} />
      <Testimonials {...payload.testimonials} />
      <Faq {...payload.faq} />
      <Footer {...payload.footer} />
      {payload.sticky && <StickyMobileBar {...payload.sticky} />}
      {chatbotEmbed && <ChatbotEmbedScript embedUrl={chatbotEmbed.embedUrl} />}
    </>
  );
}
