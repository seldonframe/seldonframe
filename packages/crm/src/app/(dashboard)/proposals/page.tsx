// packages/crm/src/app/(dashboard)/proposals/page.tsx
// 2026-05-19 — Proposal Builder. Operator list of proposals — same visual
// language as /clients (hero header + status pills + grid). Spec:
// §"Operator review + send".

import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { proposals, users } from "@/db/schema";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ProposalsGrid } from "./proposals-grid";

export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/proposals");

  const [user] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) redirect("/login");

  const rows = await db
    .select()
    .from(proposals)
    .where(eq(proposals.agencyOrgId, user.orgId))
    .orderBy(desc(proposals.createdAt))
    .limit(200);

  return (
    <main className="flex-1 overflow-auto w-full space-y-6 p-3 sm:p-4 md:p-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Proposals</h1>
          <p className="text-muted-foreground">
            {rows.length === 0
              ? "Send your first proposal to start landing clients."
              : `${rows.length} proposal${rows.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Link href="/proposals/new" className={cn(buttonVariants())}>
          + New proposal
        </Link>
      </header>
      <ProposalsGrid proposals={rows} />
    </main>
  );
}
