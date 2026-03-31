import { redirect } from "next/navigation";

export default async function PublicLandingPage({
  params,
}: {
  params: Promise<{ orgSlug: string; slug: string }>;
}) {
  const { orgSlug, slug } = await params;
  redirect(`/l/${orgSlug}/${slug}`);
}
