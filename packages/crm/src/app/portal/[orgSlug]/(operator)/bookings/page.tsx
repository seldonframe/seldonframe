// v1.24.0 — operator portal /bookings mirror (uses shared admin view)
//
// Pre-1.24.0 this rendered a simpler bespoke upcoming/past list.
// v1.24.0 wires it to the same BookingsListPageView the admin
// /bookings page uses.

import { BookingsListPageView } from "@/components/bookings/bookings-list-page-view";
import { requireOperatorSessionForOrg } from "@/lib/operator-portal/auth";

export default async function OperatorPortalBookingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requireOperatorSessionForOrg(orgSlug);
  return <BookingsListPageView orgId={session.orgId} readonly />;
}
