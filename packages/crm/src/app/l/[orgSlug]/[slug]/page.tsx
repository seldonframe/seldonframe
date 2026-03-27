import { notFound } from "next/navigation";
import { LandingSectionRenderer } from "@/components/landing/landing-section-renderer";
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

  await trackLandingVisitAction({
    pageId: payload.page.id,
    visitorId: `${orgSlug}:${slug}`,
  });

  return <LandingSectionRenderer sections={(payload.page.sections as LandingSection[]) ?? []} orgSlug={orgSlug} pageSlug={slug} />;
}
