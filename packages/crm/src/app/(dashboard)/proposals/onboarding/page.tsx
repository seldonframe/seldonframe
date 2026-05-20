// packages/crm/src/app/(dashboard)/proposals/onboarding/page.tsx
// 2026-05-19 — Proposal Builder. One-time agency setup. Renders the
// Stripe Connect status (not started / pending / ready) and a primary
// CTA that POSTs to /api/v1/proposals/connect/start. Spec: §"Stripe
// Connect Express onboarding".

import { redirect } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { stripeConnections, users } from "@/db/schema";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConnectStartButton } from "./connect-start-button";

export const dynamic = "force-dynamic";

export default async function ProposalsOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/proposals/onboarding");
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) redirect("/login");

  const [connection] = await db
    .select()
    .from(stripeConnections)
    .where(
      and(eq(stripeConnections.orgId, user.orgId), eq(stripeConnections.isActive, true)),
    )
    .limit(1);

  const params = await searchParams;
  const flashStatus = params.status;
  const connected = Boolean(connection);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Proposal Builder setup</h1>
        <p className="text-muted-foreground">
          Connect a Stripe account to send proposals. Prospects pay you directly — SeldonFrame
          takes 0%.
        </p>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card/40 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Stripe Connect</h2>
            <p className="text-sm text-muted-foreground">
              {connected
                ? "Connected and ready to accept payments."
                : "Connect your Stripe account to start sending proposals."}
            </p>
          </div>
          {connected ? (
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
              Ready
            </span>
          ) : flashStatus === "pending" ? (
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700">
              Pending
            </span>
          ) : (
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Not connected
            </span>
          )}
        </div>
        {!connected && <ConnectStartButton />}
      </section>

      {connected && (
        <section className="rounded-2xl border border-border/70 bg-card/40 p-6 space-y-3">
          <h2 className="text-xl font-semibold">You're ready to send proposals</h2>
          <p className="text-sm text-muted-foreground">
            Create your first proposal — we'll build a live workspace for the prospect, generate
            the proposal copy, and email it for them to accept.
          </p>
          <div className="flex gap-3">
            <Link href="/proposals/new" className={cn(buttonVariants({ variant: "default" }))}>
              Create proposal
            </Link>
            <Link href="/proposals/template" className={cn(buttonVariants({ variant: "outline" }))}>
              Edit template
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
