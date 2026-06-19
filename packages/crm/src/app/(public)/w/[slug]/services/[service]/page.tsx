// packages/crm/src/app/(public)/w/[slug]/services/[service]/page.tsx
//
// Public per-service detail page at /w/[slug]/services/[service].
// Server component. Loads the workspace's r1 payload, finds the ServicePage by
// slug, notFound()s on miss, and renders the shared shell + navbar + per-service
// template + footer + chatbot embed. Indexable (no noindex).

import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { SiteShell } from "@/components/landing-r1/shell/site-shell";
import { Navbar } from "@/components/landing-r1/chrome/navbar";
import { Footer } from "@/components/landing-r1/sections/footer";
import { ServicePageTemplate } from "@/components/landing-r1/sections/service-page";
import { ChatbotEmbedScript } from "@/components/landing/chatbot-script";

import { loadLandingPayload } from "@/lib/landing/r1-save";
import { getWorkspaceTemplateContext } from "@/lib/landing/public-workspace";
import { rewriteR1Hrefs } from "@/lib/landing/r1-rewrite-hrefs";
import { findServicePage, getServicePages } from "@/lib/landing/r1-site-tree";
import { buildWorkspaceUrls } from "@/lib/billing/anonymous-workspace";
import { getPublicChatbotEmbed } from "@/lib/agents/public-embed";

type PageProps = {
  params: Promise<{ slug: string; service: string }>;
};

// On-demand: services are generated per workspace; do not prebuild any.
export function generateStaticParams(): { slug: string; service: string }[] {
  return [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, service } = await params;
  const data = await loadLandingPayload(slug);
  const page = data ? findServicePage(data.payload, service) : null;
  if (!data || !page) {
    return { title: "Page not found" };
  }
  const businessName = data.payload.footer.businessName;
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
    alternates: { canonical: `/w/${slug}/services/${service}` },
  };
}

export default async function WorkspaceServicePage({ params }: PageProps) {
  const { slug, service } = await params;

  // Resolve the workspace — same pattern as the home page.
  const ctx = await getWorkspaceTemplateContext(slug);
  if (!ctx) {
    notFound();
  }

  // r1 payload required — no template fallback for per-service pages.
  const r1 = await loadLandingPayload(slug);
  if (!r1) {
    notFound();
  }

  const page = findServicePage(r1.payload, service);
  if (!page) {
    notFound();
  }

  // Rewrite generic CTA hrefs ("/book", "/intake") to workspace-scoped URLs —
  // identical call pattern to the home page.
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

  const chatbotEmbed = await getPublicChatbotEmbed(ctx.orgId);
  const homeHref = `/w/${slug}`;
  const navServices = getServicePages(payload).map((p) => ({ slug: p.slug, name: p.name }));

  return (
    <SiteShell archetype={payload.hero.archetype} mode={payload.theme?.mode ?? "light"}>
      <Navbar
        archetype={payload.hero.archetype}
        businessName={payload.hero.businessName}
        phone={payload.footer.phone}
        serviceAreas={payload.footer.serviceAreas}
        servicePages={navServices}
        homeHref={homeHref}
      />
      <ServicePageTemplate
        archetype={payload.hero.archetype}
        service={page}
        phone={payload.footer.phone}
        ctaHref={workspaceUrls.book}
      />
      <Footer {...payload.footer} />
      {chatbotEmbed && <ChatbotEmbedScript embedUrl={chatbotEmbed.embedUrl} />}
    </SiteShell>
  );
}
