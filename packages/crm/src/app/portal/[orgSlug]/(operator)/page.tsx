// v1.25.0 — operator portal root redirects to /dashboard
//
// Pre-1.25.0 this was a bespoke Twenty-CRM-light dashboard mirror.
// v1.25.0 pivots to "operator session unlocks the admin dashboard"
// — the SAME /dashboard, /contacts, /deals, /bookings the SF agency
// operator uses, just scoped to the operator's workspace via the
// sf_operator_session cookie. One source of truth at the route level.
//
// The (operator) layout above this page already verified the operator
// session; we just bounce to /dashboard which then renders the full
// admin shell using getOrgId() → operator orgId.

import { redirect } from "next/navigation";

export default async function OperatorPortalRootRedirect() {
  redirect("/dashboard");
}
