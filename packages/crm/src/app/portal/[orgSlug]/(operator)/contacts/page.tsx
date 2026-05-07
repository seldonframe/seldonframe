// v1.24.0 — operator portal /contacts mirror (now uses shared admin view)
//
// Pre-1.24.0 this rendered a simpler bespoke table via direct DB
// queries. v1.24.0 wires it to the same ContactsListPageView the
// admin /contacts page uses — IDENTICAL UI, just scoped to the
// operator session's orgId via the hrefBase props.
//
// Read-only mode for v1.24.0 — write actions (inline edit, status
// change, bulk select) authenticate via NextAuth getOrgId() which
// the operator portal session can't satisfy. v1.24.1 will refactor
// those server actions for dual-auth.

import { ContactsListPageView } from "@/components/contacts/contacts-list-page-view";
import { requireOperatorSessionForOrg } from "@/lib/operator-portal/auth";

export default async function OperatorPortalContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    search?: string;
    status?: string;
    sort?: "recent" | "name_asc" | "name_desc" | "score_desc" | "score_asc";
    dateRange?: "all" | "month" | "week" | "today";
    import?: string;
  }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const session = await requireOperatorSessionForOrg(orgSlug);

  const baseHref = `/portal/${orgSlug}/contacts`;

  return (
    <ContactsListPageView
      orgId={session.orgId}
      searchParams={sp}
      baseHref={baseHref}
      contactDetailHrefBase={baseHref}
      dealDetailHrefBase={`/portal/${orgSlug}/deals`}
      readonly
    />
  );
}
