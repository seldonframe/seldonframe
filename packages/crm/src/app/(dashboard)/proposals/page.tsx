// packages/crm/src/app/(dashboard)/proposals/page.tsx
// 2026-05-20 — Proposal Builder. Unified entry point. Stripe Connect setup
// is surfaced inline as an empty-state hero (no_connect) or amber banner
// (pending). Flash banners are shown for ?status=ready/pending/incomplete
// after the Stripe return redirect.

import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { proposals, stripeConnections, users } from "@/db/schema";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";
import { ProposalsGrid } from "./proposals-grid";
import { StripeConnectEmptyState } from "./stripe-connect-empty-state";
import { StripePendingBanner } from "./stripe-pending-banner";

export const dynamic = "force-dynamic";

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/proposals");

  const [user] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) redirect("/login");

  const [proposalsRows, connectionRows] = await Promise.all([
    db
      .select()
      .from(proposals)
      .where(eq(proposals.agencyOrgId, user.orgId))
      .orderBy(desc(proposals.createdAt))
      .limit(200),
    db
      .select()
      .from(stripeConnections)
      .where(eq(stripeConnections.orgId, user.orgId))
      .limit(1),
  ]);

  const connectionRow = connectionRows[0] ?? null;
  const stripeStatus: "not_connected" | "pending" | "ready" = !connectionRow
    ? "not_connected"
    : connectionRow.isActive
      ? "ready"
      : "pending";

  const { status: flashStatus } = await searchParams;

  return (
    <main className="flex-1 overflow-auto w-full space-y-6 p-3 sm:p-4 md:p-6">
      {/* Flash banner from Stripe return redirect */}
      {flashStatus === "ready" && (
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-sm font-medium text-emerald-700">
            Stripe Connect ready — you can now send proposals.
          </p>
        </section>
      )}
      {flashStatus === "pending" && <StripePendingBanner />}
      {flashStatus === "incomplete" && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-700">Stripe verification incomplete</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your account setup isn't finished yet. Click "Connect Stripe" below to continue where
              you left off — Stripe will resume your existing application.
            </p>
          </div>
        </section>
      )}

      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Proposals</h1>
          <p className="text-muted-foreground">
            {stripeStatus === "not_connected"
              ? "Connect Stripe to start sending proposals."
              : proposalsRows.length === 0
                ? "Send your first proposal to start landing clients."
                : `${proposalsRows.length} proposal${proposalsRows.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {stripeStatus !== "not_connected" && (
          <div className="flex items-center gap-2">
            <Link
              href="/start"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Sell live
            </Link>
            <Link href="/proposals/new" className={cn(buttonVariants())}>
              + New proposal
            </Link>
          </div>
        )}
      </header>

      {stripeStatus === "not_connected" ? (
        <StripeConnectEmptyState />
      ) : (
        <>
          {stripeStatus === "pending" && !flashStatus && <StripePendingBanner />}
          <ProposalsGrid proposals={proposalsRows} />
        </>
      )}
    </main>
  );
}
