// packages/crm/src/app/(dashboard)/proposals/new/page.tsx
// 2026-05-19 — Proposal Builder. Form: paste prospect URL, pick tier,
// click Generate. Redirects to /proposals/onboarding if Stripe Connect
// is not yet active. Spec: §"Proposal creation".

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { stripeConnections, users } from "@/db/schema";
import { ProposalNewForm } from "./proposal-new-form";

export const dynamic = "force-dynamic";

export default async function ProposalNewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/proposals/new");

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) redirect("/login");

  const [conn] = await db
    .select()
    .from(stripeConnections)
    .where(and(eq(stripeConnections.orgId, user.orgId), eq(stripeConnections.isActive, true)))
    .limit(1);

  if (!conn) redirect("/proposals/onboarding");

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <ProposalNewForm />
    </main>
  );
}
