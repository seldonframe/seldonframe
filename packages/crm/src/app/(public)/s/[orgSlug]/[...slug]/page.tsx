import { notFound } from "next/navigation";
import { PoweredByBadge } from "@seldonframe/core/virality";
import { PageRenderer } from "@/components/landing/page-renderer";
import { PuckPageRenderer } from "@/components/puck/puck-page-renderer";
import { PublicThemeProvider } from "@/components/theme/public-theme-provider";
import { shouldShowPoweredByBadgeForOrg } from "@/lib/billing/public";
import { getPublicLandingPage, trackLandingVisitAction } from "@/lib/landing/actions";
import { getPublicOrgThemeById } from "@/lib/theme/actions";
import type { LandingSection } from "@/lib/landing/types";

export default async function PublicSPage({
  params,
}: {
  params: Promise<{ orgSlug: string; slug: string[] }>;
}) {
  const { orgSlug, slug } = await params;
  const pageSlug = slug.join("/");
  const payload = await getPublicLandingPage(orgSlug, pageSlug);

  if (!payload) {
    notFound();
  }

  const showBadge = await shouldShowPoweredByBadgeForOrg(payload.orgId);
  const theme = await getPublicOrgThemeById(payload.orgId);

  await trackLandingVisitAction({
    pageId: payload.page.id,
    visitorId: `${orgSlug}:${pageSlug}`,
  });

  return (
    <PublicThemeProvider theme={theme}>
      <main className="min-h-screen" style={{ backgroundColor: "var(--sf-bg)", color: "var(--sf-text)" }}>
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
      </main>
    </PublicThemeProvider>
  );
}
