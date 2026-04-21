import { notFound } from "next/navigation";
import { PoweredByBadge } from "@seldonframe/core/virality";
import { PageRenderer } from "@/components/landing/page-renderer";
import { VisitBeacon } from "@/components/landing/visit-beacon";
import { PublicThemeProvider } from "@/components/theme/public-theme-provider";
import { shouldShowPoweredByBadgeForOrg } from "@/lib/billing/public";
import { getPublicLandingPage } from "@/lib/landing/actions";
import { getPublicOrgThemeById } from "@/lib/theme/actions";
import type { LandingSection } from "@/lib/landing/types";

// Enable ISR with a 1-hour default revalidation window. On explicit
// publish we also call revalidatePath from publishLandingPageAction
// to bust the cache immediately. Visit tracking moved to a client
// beacon (see VisitBeacon) so the cached page still emits one
// landing.visited event per real browser view.
export const revalidate = 3600;

export default async function PublicLandingPage({
  params,
}: {
  params: Promise<{ orgSlug: string; slug: string }>;
}) {
  const { orgSlug, slug } = await params;
  const payload = await getPublicLandingPage(orgSlug, slug);

  if (!payload) {
    notFound();
  }

  const showBadge = await shouldShowPoweredByBadgeForOrg(payload.orgId);
  const theme = await getPublicOrgThemeById(payload.orgId);

  if (payload.page.contentHtml && payload.page.contentCss) {
    return (
      <PublicThemeProvider theme={theme}>
        <main className="min-h-screen" style={{ backgroundColor: "var(--sf-bg)", color: "var(--sf-text)" }}>
          <style dangerouslySetInnerHTML={{ __html: payload.page.contentCss }} />
          <div dangerouslySetInnerHTML={{ __html: payload.page.contentHtml }} />
          {showBadge ? (
            <div className="flex justify-center py-4" style={{ borderTop: "1px solid var(--sf-border)", backgroundColor: "color-mix(in oklab, var(--sf-bg) 92%, var(--sf-accent) 8%)" }}>
              <PoweredByBadge />
            </div>
          ) : null}
          <VisitBeacon pageId={payload.page.id} />
        </main>
      </PublicThemeProvider>
    );
  }

  return (
    <PublicThemeProvider theme={theme}>
      <main className="min-h-screen" style={{ backgroundColor: "var(--sf-bg)", color: "var(--sf-text)" }}>
        <PageRenderer sections={(payload.page.sections as LandingSection[]) ?? []} />
        {showBadge ? (
          <div className="flex justify-center py-4" style={{ borderTop: "1px solid var(--sf-border)", backgroundColor: "color-mix(in oklab, var(--sf-bg) 92%, var(--sf-accent) 8%)" }}>
            <PoweredByBadge />
          </div>
        ) : null}
        <VisitBeacon pageId={payload.page.id} />
      </main>
    </PublicThemeProvider>
  );
}
