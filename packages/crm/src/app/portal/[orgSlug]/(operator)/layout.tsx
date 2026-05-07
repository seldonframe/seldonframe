// v1.25.0 — operator portal layout collapsed to a session-gate
// pass-through.
//
// Pre-1.25.0 this rendered a bespoke Twenty-CRM-light shell with
// sidebar + agency-branded header. v1.25.0 pivots: operator session
// unlocks the SAME admin dashboard the SF agency operator uses, so
// this layout's only job is to verify the operator session and let
// child pages (which redirect to /dashboard /contacts /deals
// /bookings) handle the routing.
//
// If the user lacks an operator session, requireOperatorSessionForOrg
// redirects to /portal/<slug>/login where they enter email and get a
// magic link. That magic link's verifier sets the cookie and lands
// them at /dashboard (the admin shell).

import { requireOperatorSessionForOrg } from "@/lib/operator-portal/auth";

export default async function OperatorPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await requireOperatorSessionForOrg(orgSlug);
  return <>{children}</>;
}
