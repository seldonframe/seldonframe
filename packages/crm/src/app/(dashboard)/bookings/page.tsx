// /bookings (admin dashboard) — thin wrapper around shared BookingsListPageView.
//
// v1.24.0 — refactored so the operator portal mirror at
// /portal/<slug>/bookings renders the same component (just scoped
// to the operator's workspace).

import { redirect } from "next/navigation";
import { getOrgId } from "@/lib/auth/helpers";
import { BookingsListPageView } from "@/components/bookings/bookings-list-page-view";

export default async function BookingsPage() {
  const orgId = await getOrgId();
  if (!orgId) {
    redirect("/login");
  }
  return <BookingsListPageView orgId={orgId} />;
}
