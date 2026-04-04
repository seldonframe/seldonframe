import { notFound } from "next/navigation";
import { PoweredByBadge } from "@seldonframe/core/virality";
import { PageRenderer } from "@/components/landing/page-renderer";
import { shouldShowPoweredByBadgeForOrg } from "@/lib/billing/public";
import { getPublicLandingPage, trackLandingVisitAction } from "@/lib/landing/actions";
import type { LandingSection } from "@/lib/landing/types";

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

  await trackLandingVisitAction({
    pageId: payload.page.id,
    visitorId: `${orgSlug}:${slug}`,
  });

  if (payload.page.contentHtml && payload.page.contentCss) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <style dangerouslySetInnerHTML={{ __html: payload.page.contentCss }} />
        <div dangerouslySetInnerHTML={{ __html: payload.page.contentHtml }} />
        {showBadge ? (
          <div className="flex justify-center border-t border-border bg-[hsl(var(--muted)/0.2)] py-4">
            <PoweredByBadge />
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PageRenderer sections={(payload.page.sections as LandingSection[]) ?? []} />
      {showBadge ? (
        <div className="flex justify-center border-t border-border bg-[hsl(var(--muted)/0.2)] py-4">
          <PoweredByBadge />
        </div>
      ) : null}
    </main>
  );
}
