// v1.22.0 — agency dashboard (lists managed workspaces + support-session button)
//
// Audience: SF agency operators (e.g. Acme AI's user) who own one
// or more partner_agencies and have white-labeled SeldonFrame to
// their HVAC / dental / etc. clients (organizations with
// parent_agency_id pointing to one of their agencies).
//
// What this page shows:
//   - The user's owned agencies (rows in partner_agencies where
//     owner_user_id = current session user id)
//   - For each agency, the workspaces under it (organizations
//     where parent_agency_id = agency.id)
//   - An "Open <workspace> portal" button per workspace that mints
//     an agency support session and opens the branded operator
//     portal in a new tab with the yellow audit banner active
//
// Plan gate: agency dashboard requires the caller to OWN at least
// one active agency. Otherwise we render an empty state pointing
// at register_partner_agency.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, partnerAgencies } from "@/db/schema";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AgencyWorkspaceRow } from "@/components/agency/agency-workspace-row";

export default async function AgencyDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const myAgencies = await db
    .select({
      id: partnerAgencies.id,
      name: partnerAgencies.name,
      slug: partnerAgencies.slug,
      status: partnerAgencies.status,
      logoUrl: partnerAgencies.logoUrl,
      verifiedSenderAt: partnerAgencies.verifiedSenderAt,
    })
    .from(partnerAgencies)
    .where(eq(partnerAgencies.ownerUserId, session.user.id));

  // Eager-load workspaces under each agency in a single round-trip.
  // For users with many agencies this could grow but for v1.22 the
  // expected cardinality is ≤ 5 agencies per user.
  const agencyIds = myAgencies.map((a) => a.id);
  const workspacesByAgency = new Map<
    string,
    Array<{
      id: string;
      name: string;
      slug: string;
      plan: string | null;
    }>
  >();
  if (agencyIds.length > 0) {
    const allWorkspaces = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        parentAgencyId: organizations.parentAgencyId,
        plan: organizations.plan,
      })
      .from(organizations);
    for (const ws of allWorkspaces) {
      if (ws.parentAgencyId && agencyIds.includes(ws.parentAgencyId)) {
        const list = workspacesByAgency.get(ws.parentAgencyId) ?? [];
        list.push({
          id: ws.id,
          name: ws.name,
          slug: ws.slug,
          plan: ws.plan,
        });
        workspacesByAgency.set(ws.parentAgencyId, list);
      }
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-light tracking-tight">Agency</h1>
        <p className="text-sm text-muted-foreground">
          Manage your white-label clients. Click &ldquo;Open portal&rdquo; to
          sign in to a client&apos;s branded operator dashboard for support
          (audit-logged).
        </p>
      </header>

      {myAgencies.length === 0 ? (
        <article className="crm-card text-center py-10">
          <p className="text-sm text-muted-foreground">
            You don&apos;t own any agencies yet. Use the{" "}
            <code className="font-mono text-xs">register_partner_agency</code>{" "}
            MCP tool to register one.
          </p>
        </article>
      ) : null}

      {myAgencies.map((agency) => {
        const workspaces = workspacesByAgency.get(agency.id) ?? [];
        return (
          <article key={agency.id} className="crm-card overflow-hidden p-0">
            <header className="flex items-center justify-between gap-3 px-5 py-4 border-b">
              <div className="flex items-center gap-3 min-w-0">
                {agency.logoUrl ? (
                  <img
                    src={agency.logoUrl}
                    alt={agency.name}
                    className="h-8 w-8 rounded-md object-cover shrink-0"
                  />
                ) : null}
                <div className="min-w-0">
                  <h2 className="text-base font-semibold truncate">
                    {agency.name}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Status: {agency.status} ·{" "}
                    {agency.verifiedSenderAt
                      ? "sender verified"
                      : "sender unverified"}
                  </p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {workspaces.length}{" "}
                {workspaces.length === 1 ? "client" : "clients"}
              </span>
            </header>

            {workspaces.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-muted-foreground">
                No workspaces attached yet. Use the{" "}
                <code className="font-mono text-xs">
                  attach_workspace_to_agency
                </code>{" "}
                MCP tool to attach a client.
              </div>
            ) : (
              <ul className="divide-y">
                {workspaces.map((ws) => (
                  <AgencyWorkspaceRow
                    key={ws.id}
                    workspaceId={ws.id}
                    workspaceName={ws.name}
                    workspaceSlug={ws.slug}
                    plan={ws.plan}
                  />
                ))}
              </ul>
            )}
          </article>
        );
      })}
    </section>
  );
}
