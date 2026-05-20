// packages/crm/src/app/(dashboard)/proposals/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { proposals, users } from "@/db/schema";
import { ProposalEditor } from "./proposal-editor";

export const dynamic = "force-dynamic";

export default async function ProposalEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) redirect("/login");

  const { id } = await params;

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.agencyOrgId, user.orgId)))
    .limit(1);

  if (!proposal) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <ProposalEditor proposal={proposal} />
    </main>
  );
}
