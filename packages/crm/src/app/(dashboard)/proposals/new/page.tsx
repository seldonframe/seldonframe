// packages/crm/src/app/(dashboard)/proposals/new/page.tsx
// 2026-05-21 — Phase E: fetch managed workspaces + pass to form.
// Workspace picker replaces the URL input. No URL extraction, no workspace
// provisioning. Spec: §"Proposal creation (Phase E)".

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { stripeConnections, users } from "@/db/schema";
import { ProposalNewForm } from "./proposal-new-form";
import { DEFAULT_PROPOSAL_TEMPLATE } from "@/lib/proposals/generate-html";
import { listManagedOrganizationsForUser } from "@/lib/billing/orgs";

export const dynamic = "force-dynamic";

export default async function ProposalNewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/proposals/new");

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) redirect("/login");

  const [conn] = await db
    .select()
    .from(stripeConnections)
    .where(and(eq(stripeConnections.orgId, user.orgId), eq(stripeConnections.isActive, true)))
    .limit(1);

  if (!conn) redirect("/proposals/onboarding");

  const agencyContext = {
    name: user.agencyProfile.name ?? user.name,
    brandColor: user.agencyProfile.brand_color ?? "#0ea5e9",
    logoUrl: user.agencyProfile.logo_url ?? null,
    template: user.agencyProfile.proposalTemplate ?? DEFAULT_PROPOSAL_TEMPLATE,
  };

  const allWorkspaces = await listManagedOrganizationsForUser(session.user.id);
  // Surface only { id, name, slug } to the form — keep the payload small
  const workspaces = allWorkspaces.map((ws) => ({
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
  }));

  return (
    <main className="flex-1 overflow-auto w-full p-3 sm:p-4 md:p-6">
      <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
        <ProposalNewForm agencyContext={agencyContext} workspaces={workspaces} />
      </div>
    </main>
  );
}
