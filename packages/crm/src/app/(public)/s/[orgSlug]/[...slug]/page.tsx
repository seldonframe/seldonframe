import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PoweredByBadge } from "@seldonframe/core/virality";
import { PageRenderer } from "@/components/landing/page-renderer";
import { ChatbotEmbedScript } from "@/components/landing/chatbot-script";
import { PuckPageRenderer } from "@/components/puck/puck-page-renderer";
import { PublicThemeProvider } from "@/components/theme/public-theme-provider";
import { shouldShowPoweredByBadgeForOrg } from "@/lib/billing/public";
import { getPublicLandingPage, trackLandingVisitAction } from "@/lib/landing/actions";
import { getPublicOrgThemeById } from "@/lib/theme/actions";
import { getPublicChatbotEmbed } from "@/lib/agents/public-embed";
import { trackEvent } from "@/lib/analytics/track";
import type { LandingSection } from "@/lib/landing/types";

// Phase R: R-framework components + payload loader.
// When the workspace has an R-framework payload AND the home page is
// requested, we return early with the R components — no old-landing
// PageRenderer, no theme override, no chatbot embed (R has its own
// sticky CTA). The fall-through keeps the OLD system intact for
// workspaces that have no _r1 row (all existing production workspaces).
import { loadLandingPayload } from "@/lib/landing/r1-save";
import { rewriteR1Hrefs } from "@/lib/landing/r1-rewrite-hrefs";
import { joinFooterAddress } from "@/lib/landing/map-embed";
import { buildWorkspaceUrls } from "@/lib/billing/anonymous-workspace";
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
import { ServicePageTemplate } from "@/components/landing-r1/sections/service-page";
import { findServicePage, getServicePages } from "@/lib/landing/r1-site-tree";

type PageProps = {
  params: Promise<{ orgSlug: string; slug: string[] }>;
};

/** True when the request targets the workspace home page. */
function isHomePage(pageSlug: string): boolean {
  return pageSlug === "home" || pageSlug === "" || pageSlug === "/";
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orgSlug, slug } = await params;
  const pageSlug = slug.join("/");

  // Phase R: per-service SEO metadata for /services/<service> paths.
  if (slug.length === 2 && slug[0] === "services") {
    const r1Data = await loadLandingPayload(orgSlug);
    const page = r1Data ? findServicePage(r1Data.payload, slug[1]) : null;
    if (r1Data && page) {
      const businessName = r1Data.payload.footer.businessName;
      const title = `${page.name} — ${businessName}`;
      return {
        title,
        description: page.summary,
        openGraph: {
          title,
          description: page.summary,
          ...(page.heroPhoto ? { images: [{ url: page.heroPhoto.src }] } : {}),
          type: "website",
        },
        robots: { index: true, follow: true },
        // Canonical uses relative path style, matching the home-page metadata
        // above which uses `/w/${orgSlug}` (not an absolute subdomain URL).
        alternates: { canonical: `/w/${orgSlug}/services/${slug[1]}` },
      };
    }
    // No payload or unknown service → fall through to home/default handling.
  }

  // Phase R: serve R-framework SEO metadata for home pages with a payload.
  if (isHomePage(pageSlug)) {
    const r1Data = await loadLandingPayload(orgSlug);
    if (r1Data) {
      const { seo, payload } = r1Data;
      return {
        title: seo.title,
        description: seo.description,
        openGraph: {
          title: seo.title,
          description: seo.description,
          ...(seo.ogImage ? { images: [{ url: seo.ogImage }] } : {}),
          type: "website",
        },
        robots: { index: true, follow: true },
        // Canonical points to /w/[slug] — that is the authoritative URL
        // for the R-framework page; /s/[slug]/home is the proxy rewrite.
        alternates: { canonical: `/w/${orgSlug}` },
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
  }

  // Fallback: no extra metadata for old-landing sub-pages.
  return {};
}

export default async function PublicSPage({ params }: PageProps) {
  const { orgSlug, slug } = await params;
  const pageSlug = slug.join("/");

  // Multi-page: subdomain /services/<service> → /s/<orgSlug>/services/<service>.
  // Render the shared shell + per-service template when the workspace has an r1
  // payload that contains the requested service.
  if (slug.length === 2 && slug[0] === "services") {
    const serviceSlugParam = slug[1];
    const r1Data = await loadLandingPayload(orgSlug);
    if (r1Data) {
      const servicePage = findServicePage(r1Data.payload, serviceSlugParam);
      if (!servicePage) {
        notFound();
      }
      const workspaceUrls = buildWorkspaceUrls(
        orgSlug,
        process.env.WORKSPACE_BASE_DOMAIN ?? "app.seldonframe.com",
        r1Data.orgId,
      );
      const payload = rewriteR1Hrefs(r1Data.payload, {
        book: workspaceUrls.book,
        intake: workspaceUrls.intake,
        home: workspaceUrls.home,
      });
      const r1ChatbotEmbed = await getPublicChatbotEmbed(r1Data.orgId);
      const navServices = getServicePages(payload).map((p) => ({ slug: p.slug, name: p.name }));
      // On the subdomain the workspace IS the root, so links stay relative to "/".
      return (
        <SiteShell archetype={payload.hero.archetype} mode={payload.theme?.mode ?? "light"}>
          <Navbar
            archetype={payload.hero.archetype}
            businessName={payload.hero.businessName}
            phone={payload.footer.phone}
            serviceAreas={payload.footer.serviceAreas}
            servicePages={navServices}
            homeHref="/"
          />
          <ServicePageTemplate
            archetype={payload.hero.archetype}
            service={servicePage}
            phone={payload.footer.phone}
            ctaHref={workspaceUrls.book}
            orgSlug={orgSlug}
            businessName={payload.hero.businessName}
            leadForm={payload.leadForm}
            address={joinFooterAddress(payload.footer.address)}
          />
          <Footer {...payload.footer} />
          {r1ChatbotEmbed && <ChatbotEmbedScript embedUrl={r1ChatbotEmbed.embedUrl} />}
        </SiteShell>
      );
    }
    // If there's no r1 payload at all, fall through to the existing logic below
    // (do not notFound here — let the existing handling decide).
  }

  // Phase R: when the home page is requested AND the workspace has an R
  // framework payload, render the R framework components and return early.
  // Sub-pages (/s/{orgSlug}/about, /s/{orgSlug}/services, etc.) have no R
  // variant and fall through to the old PageRenderer below.
  if (isHomePage(pageSlug)) {
    const r1Data = await loadLandingPayload(orgSlug);
    if (r1Data) {
      // bisect 3/4: rewrite generic CTA hrefs to workspace-scoped URLs.
      const workspaceUrls = buildWorkspaceUrls(
        orgSlug,
        process.env.WORKSPACE_BASE_DOMAIN ?? "app.seldonframe.com",
        r1Data.orgId,
      );
      const payload = rewriteR1Hrefs(r1Data.payload, {
        book: workspaceUrls.book,
        intake: workspaceUrls.intake,
        home: workspaceUrls.home,
      });
      // Subdomain R-branch chatbot embed (mirrors /w/[slug] route).
      const r1ChatbotEmbed = await getPublicChatbotEmbed(r1Data.orgId);
      const navServices = getServicePages(payload).map((p) => ({ slug: p.slug, name: p.name }));
      // ⚠️ Sentinel MUST be "/" not "" — serviceCardHref("", …) returns the
      // legacy #service-… anchor (empty string is falsy); "/" returns
      // /services/<slug> (root-relative), which is correct on the subdomain.
      const serviceBaseHref = navServices.length > 0 ? "/" : undefined;
      return (
        <SiteShell archetype={payload.hero.archetype} mode={payload.theme?.mode ?? "light"}>
          <Navbar
            archetype={payload.hero.archetype}
            businessName={payload.hero.businessName}
            phone={payload.footer.phone}
            serviceAreas={payload.footer.serviceAreas}
            servicePages={navServices}
            homeHref="/"
          />
          {payload.emergency && <EmergencyStrip {...payload.emergency} />}
          <Hero {...payload.hero} orgSlug={orgSlug} leadForm={payload.leadForm} />
          <ServicesGrid {...payload.services} serviceBaseHref={serviceBaseHref} />
          <Testimonials {...payload.testimonials} />
          <Faq {...payload.faq} />
          <MapSection address={joinFooterAddress(payload.footer.address)} archetype={payload.hero.archetype} heading="Where we work" />
          {payload.leadForm?.enabled && (
            <LeadFormSection
              orgSlug={orgSlug}
              businessName={payload.hero.businessName}
              archetype={payload.hero.archetype}
              leadForm={payload.leadForm}
            />
          )}
          <Footer {...payload.footer} />
          {payload.sticky && <StickyMobileBar {...payload.sticky} />}
          {r1ChatbotEmbed && <ChatbotEmbedScript embedUrl={r1ChatbotEmbed.embedUrl} />}
        </SiteShell>
      );
    }
  }

  // Fall through: existing old-landing rendering.
  // Preserves analytics tracking, chatbot embed, powered-by badge,
  // theme provider, and forced-light mode for all non-R workspaces.
  const payload = await getPublicLandingPage(orgSlug, pageSlug);

  if (!payload) {
    notFound();
  }

  const showBadge = await shouldShowPoweredByBadgeForOrg(payload.orgId);
  const theme = await getPublicOrgThemeById(payload.orgId);
  // v1.40.7 — workspace-level chatbot embed. Operator runs
  // embed_chatbot_on_workspace_landing via Claude Code; we read the
  // resulting URL here and inject the embed.js script tag below.
  const chatbotEmbed = await getPublicChatbotEmbed(payload.orgId);

  // v1.38.5 — workspace home subdomain ("/" → /s/[orgSlug]/[...slug])
  // forced to light mode. v1.38.4 applied the same fix to /l/ and /book/
  // routes but missed /s/ which is the actual home rewrite per
  // proxy.ts. Without this override + className="light" wrapper, the
  // landing renders against the workspace's stored theme — which is
  // dark for any workspace created before v1.38.5's DEFAULT_ORG_THEME
  // flip. Now both old + new workspaces render light by default; the
  // operator can re-enable dark via theme settings if they want.
  const publicTheme = { ...theme, mode: "light" as const };

  await trackLandingVisitAction({
    pageId: payload.page.id,
    visitorId: `${orgSlug}:${pageSlug}`,
  });

  // May 1, 2026 — Measurement Layer 2. Fire-and-forget. Captures the
  // landing-view event with renderer-config dimensions so we can ask
  // "do cinematic-mode SaaS pages convert intake forms at higher
  // rates than light-mode local-service pages?"
  trackEvent(
    "landing_page_viewed",
    {
      org_slug: orgSlug,
      page_slug: pageSlug || "home",
      page_id: payload.page.id,
      // The page settings carry the renderer config we want to learn
      // from. Either field may be missing on legacy rows; fall back
      // to "unknown" so the dimension is at least bucketable.
      personality:
        ((payload.page.settings as Record<string, unknown> | null)?.personality as string) ??
        "unknown",
      mode:
        ((payload.page.settings as Record<string, unknown> | null)?.mode as string) ??
        "unknown",
    },
    { orgId: payload.orgId }
  );

  return (
    <PublicThemeProvider theme={publicTheme}>
      <main className="light min-h-screen" style={{ backgroundColor: "var(--sf-bg)", color: "var(--sf-text)" }}>
        {payload.page.puckData ? (
          <PuckPageRenderer data={payload.page.puckData as Record<string, unknown>} orgId={payload.orgId} />
        ) : payload.page.contentHtml && payload.page.contentCss ? (
          <>
            <style dangerouslySetInnerHTML={{ __html: payload.page.contentCss }} />
            <div dangerouslySetInnerHTML={{ __html: payload.page.contentHtml }} />
          </>
        ) : (
          <PageRenderer sections={(payload.page.sections as LandingSection[]) ?? []} />
        )}

        {showBadge ? (
          <div
            className="flex justify-center py-4"
            style={{
              borderTop: "1px solid var(--sf-border)",
              backgroundColor: "color-mix(in oklab, var(--sf-bg) 92%, var(--sf-accent) 8%)",
            }}
          >
            <PoweredByBadge />
          </div>
        ) : null}
        {chatbotEmbed ? (
          <ChatbotEmbedScript embedUrl={chatbotEmbed.embedUrl} />
        ) : null}
      </main>
    </PublicThemeProvider>
  );
}
