// v1.24.0 — operator portal /deals mirror (uses shared admin view)
//
// Pre-1.24.0 this rendered a simpler bespoke pipeline-grouped list
// via direct DB queries. v1.24.0 wires it to the same DealsListPageView
// the admin /deals page uses — IDENTICAL UI (Kanban / Table /
// drag-drop), scoped to the operator session's orgId.
//
// Read-only mode for v1.24.0 — drag-drop calls NextAuth-backed
// updateDealStageAction which the operator-portal cookie can't
// satisfy. v1.24.1 will refactor for dual-auth.

import { DealsListPageView } from "@/components/deals/deals-list-page-view";
import { requireOperatorSessionForOrg } from "@/lib/operator-portal/auth";

export default async function OperatorPortalDealsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ stage?: string; value?: string; search?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const session = await requireOperatorSessionForOrg(orgSlug);

  return <DealsListPageView orgId={session.orgId} searchParams={sp} readonly />;
}
