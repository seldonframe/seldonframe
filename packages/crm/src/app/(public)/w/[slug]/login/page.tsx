// packages/crm/src/app/(public)/w/[slug]/login/page.tsx
//
// Safety-net redirect: users (and operators) sometimes autocomplete
// /w/<slug>/login — but /w/[slug] is the public landing route and has
// no /login child, so it would 404.
//
// The real operator login lives at /portal/<slug>/login.
// This page transparently redirects there.

import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function WSlugLoginRedirect({ params }: PageProps) {
  const { slug } = await params;
  redirect(`/portal/${slug}/login`);
}
