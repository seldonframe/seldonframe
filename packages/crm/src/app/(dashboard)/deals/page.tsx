// /deals (admin dashboard) — thin wrapper around shared DealsListPageView.
//
// v1.24.0 — refactored so the operator portal mirror at
// /portal/<slug>/deals renders the same component (just scoped to
// the operator session's orgId).

import { redirect } from "next/navigation";
import { getOrgId } from "@/lib/auth/helpers";
import { DealsListPageView } from "@/components/deals/deals-list-page-view";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; value?: string; search?: string }>;
}) {
  const params = await searchParams;
  const orgId = await getOrgId();
  if (!orgId) {
    redirect("/login");
  }
  return <DealsListPageView orgId={orgId} searchParams={params} />;
}
