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
import { MapSection } from "@/components/landing-r1/sections/map";
import { LeadFormSection } from "@/components/landing-r1/sections/lead-form";
import { Footer } from "@/components/landing-r1/sections/footer";
import { EmergencyStrip } from "@/components/landing-r1/chrome/emergency-strip";
import { StickyMobileBar } from "@/components/landing-r1/chrome/sticky-mobile-bar";
import { Navbar } from "@/components/landing-r1/chrome/navbar";
import { SiteShell } from "@/components/landing-r1/shell/site-shell";
import { ChatbotEmbedScript } from "@/components/landing/chatbot-script";

import { loadLandingPayload } from "@/lib/landing/r1-save";
import { resolveMapQuery } from "@/lib/landing/map-embed";
import { getWorkspaceTemplateContext } from "@/lib/landing/public-workspace";
import { rewriteR1Hrefs } from "@/lib/landing/r1-rewrite-hrefs";
import { getServicePages } from "@/lib/landing/r1-site-tree";
import { buildWorkspaceUrls } from "@/lib/billing/anonymous-workspace";
import { getPublicChatbotEmbed } from "@/lib/agents/public-embed";
import {
  LANDING_TEMPLATES,
  isLandingTemplateId,
} from "@/components/landing-templates/registry";
import { withTemplateDefaults } from "@/components/landing-templates/default-photos";
import {
  r1PayloadToTemplateData,
  submittedSoulToTemplateData,
} from "@/lib/landing/r1-payload-to-template";
import {
  archetypeToSfTheme,
  buildTemplateCtas,
} from "@/lib/landing/template-adapters";
import { ARCHETYPES, type AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
import { WEB_UNGATED_ORIGIN } from "@/lib/web-build/policy";

type PageProps = {
  params: Promise<{ slug: string }>;
};

// Task 8: unclaimed anonymous web-build workspaces (created via the /try
// paste-box flow, no owner attached yet) stay out of the search index until
// claimed via signup. Claimed workspaces and every non-web-build workspace
// keep the existing indexable behavior.
function shouldIndexWorkspace(ownerId: string | null, settings: Record<string, unknown>): boolean {
  return !(ownerId === null && settings["origin"] === WEB_UNGATED_ORIGIN);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadLandingPayload(slug);

  if (!data) {
    // No r1 payload — fall back to the raw soul so soul-only workspaces still
    // get a basic, indexable title/description instead of "Page not found".
    const ctx = await getWorkspaceTemplateContext(slug);
    const soul = ctx ? submittedSoulToTemplateData(ctx.soul) : null;
    if (!soul || soul.business_name === "Our Practice") {
      // No org, or a soul with no real business_name → nothing meaningful.
      return { title: "Page not found" };
    }
    const description = soul.soul_description ?? soul.tagline;
    // ctx is non-null here (soul came from it above).
    const indexable = shouldIndexWorkspace(ctx!.ownerId, ctx!.settings);
    return {
      title: soul.business_name,
      ...(description ? { description } : {}),
      openGraph: {
        title: soul.business_name,
        ...(description ? { description } : {}),
        type: "website",
      },
      robots: { index: indexable, follow: indexable },
      alternates: { canonical: `/w/${slug}` },
    };
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
    // Indexed by default — except unclaimed anonymous web-build workspaces
    // (created via /try with no owner yet), which stay out of the index
    // until claimed via signup (Task 8).
    robots: {
      index: shouldIndexWorkspace(data.ownerId, data.settings),
      follow: shouldIndexWorkspace(data.ownerId, data.settings),
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

  // Resolve the workspace by slug first. This succeeds for ANY existing
  // workspace (soul-only ones included), so a workspace with a soul but no r1
  // landing payload can still render a registered template below. notFound()
  // only when the slug doesn't map to a workspace at all.
  const ctx = await getWorkspaceTemplateContext(slug);
  if (!ctx) {
    notFound();
  }

  // r1 landing payload — preferred content source when present, may be null.
  const r1 = await loadLandingPayload(slug);

  // Template id: r1's persisted value wins, else the org theme's. Either may be
  // undefined / unregistered → falls through to the landing-r1 path.
  const landingTemplate = r1?.landingTemplate ?? ctx.theme?.landingTemplate;

  // Chatbot embed — shared by both render paths.
  const chatbotEmbed = await getPublicChatbotEmbed(ctx.orgId);

  // Health-templates pilot: when the workspace has opted into a premium
  // full-page template (persisted at organizations.theme.landingTemplate),
  // render it as an alternative renderer. Content comes from the r1 payload
  // when present, otherwise from the raw organizations.soul jsonb so soul-only
  // workspaces still render. The template builds its own workspace-scoped CTAs
  // (book/intake/tel:), so it does NOT need the r1 href-rewrite. Workspaces
  // without a registered template fall through to the landing-r1 path, which
  // requires an r1 payload.
  if (isLandingTemplateId(landingTemplate)) {
    const Tpl = LANDING_TEMPLATES[landingTemplate];
    // Fill any empty photo slots with the template's curated fixture imagery
    // (Claude Design's hand-picked photos) so the page looks like the designed
    // template even when extraction captured few/no photos. Real photos win.
    const templateData = withTemplateDefaults(
      r1 ? r1PayloadToTemplateData(r1.payload) : submittedSoulToTemplateData(ctx.soul),
      landingTemplate,
    );
    // Re-skin via the archetype palette ONLY when one is explicitly set (on
    // the r1 payload or the org theme). Otherwise pass undefined so the
    // template renders in its own signature default palette — the designed look.
    const explicitArchetype = r1?.archetype ?? ctx.theme?.aestheticArchetype;
    const sfTheme =
      explicitArchetype && explicitArchetype in ARCHETYPES
        ? archetypeToSfTheme(explicitArchetype as AestheticArchetypeId)
        : undefined;
    return (
      <>
        <Tpl
          data={templateData}
          ctas={buildTemplateCtas(slug, ctx.orgId, templateData.phone)}
          theme={sfTheme}
        />
        {chatbotEmbed && <ChatbotEmbedScript embedUrl={chatbotEmbed.embedUrl} />}
      </>
    );
  }

  // Non-template workspaces render the existing landing-r1 sections — which
  // require an r1 payload. A soul-only workspace with no registered template
  // has nothing to render here → notFound().
  if (!r1) {
    notFound();
  }

  // bisect 3/4: rewrite generic CTA hrefs to workspace-scoped URLs.
  const workspaceUrls = buildWorkspaceUrls(
    slug,
    process.env.WORKSPACE_BASE_DOMAIN ?? "app.seldonframe.com",
    ctx.orgId,
  );
  const payload = rewriteR1Hrefs(r1.payload, {
    book: workspaceUrls.book,
    intake: workspaceUrls.intake,
    home: workspaceUrls.home,
  });

  const homeHref = `/w/${slug}`;
  const navServices = getServicePages(payload).map((p) => ({ slug: p.slug, name: p.name }));
  // Only link cards out to detail pages when this workspace actually has them.
  const serviceBaseHref = navServices.length > 0 ? homeHref : undefined;

  return (
    <SiteShell
      archetype={payload.hero.archetype}
      mode={payload.theme?.mode ?? "light"}
      workspaceId={ctx.orgId}
    >
      {/* bisect 4/4: all three pieces wired. */}
      <Navbar
        archetype={payload.hero.archetype}
        businessName={payload.hero.businessName}
        phone={payload.footer.phone}
        serviceAreas={payload.footer.serviceAreas}
        servicePages={navServices}
        homeHref={homeHref}
        cta={payload.nav?.cta}
      />
      {payload.emergency && <EmergencyStrip {...payload.emergency} />}
      <Hero {...payload.hero} orgSlug={slug} leadForm={payload.leadForm} />
      <ServicesGrid {...payload.services} serviceBaseHref={serviceBaseHref} />
      <Testimonials {...payload.testimonials} />
      <Faq {...payload.faq} />
      <MapSection address={resolveMapQuery(payload.footer)} archetype={payload.hero.archetype} heading="Where we work" />
      {payload.leadForm?.enabled && (
        <LeadFormSection
          orgSlug={slug}
          businessName={payload.hero.businessName}
          archetype={payload.hero.archetype}
          leadForm={payload.leadForm}
        />
      )}
      <Footer {...payload.footer} />
      {payload.sticky && <StickyMobileBar {...payload.sticky} />}
      {chatbotEmbed && <ChatbotEmbedScript embedUrl={chatbotEmbed.embedUrl} />}
    </SiteShell>
  );
}
