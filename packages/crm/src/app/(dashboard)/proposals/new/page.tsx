// packages/crm/src/app/(dashboard)/proposals/new/page.tsx
// 2026-05-19 — Proposal Builder. Form: paste prospect URL, pick tier,
// click Generate. Redirects to /proposals/onboarding if Stripe Connect
// is not yet active. Spec: §"Proposal creation".
// 2026-05-20 — Phase B: two-column layout with live preview pane.

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { stripeConnections, users } from "@/db/schema";
import { ProposalNewForm } from "./proposal-new-form";
import { DEFAULT_PROPOSAL_TEMPLATE } from "@/lib/proposals/generate-html";

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

  return (
    <main className="flex-1 overflow-auto w-full p-3 sm:p-4 md:p-6">
      <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
        <ProposalNewForm agencyContext={agencyContext} />
      </div>
    </main>
  );
}
