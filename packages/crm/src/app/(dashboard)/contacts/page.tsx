// /contacts (admin dashboard) — thin wrapper around shared ContactsListPageView.
//
// v1.24.0 — refactored to use the shared component so the operator
// portal mirror at /portal/<slug>/contacts renders the EXACT same
// view (just scoped to the operator's workspace via a different
// orgId resolution path).

import { redirect } from "next/navigation";
import { getOrgId } from "@/lib/auth/helpers";
import { ContactsListPageView } from "@/components/contacts/contacts-list-page-view";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    sort?: "recent" | "name_asc" | "name_desc" | "score_desc" | "score_asc";
    dateRange?: "all" | "month" | "week" | "today";
    import?: string;
  }>;
}) {
  const params = await searchParams;
  const orgId = await getOrgId();
  if (!orgId) {
    redirect("/login");
  }

  return (
    <ContactsListPageView
      orgId={orgId}
      searchParams={params}
      baseHref="/contacts"
      contactDetailHrefBase="/contacts"
      dealDetailHrefBase="/deals"
    />
  );
}
