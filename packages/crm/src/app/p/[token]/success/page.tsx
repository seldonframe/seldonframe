// packages/crm/src/app/p/[token]/success/page.tsx
// 2026-05-19 — Proposal Builder. Post-Checkout success landing. The
// webhook does the real activation work; this page just confirms.

import { notFound } from "next/navigation";
import { loadProposalByToken } from "@/lib/proposals/load-by-token";

export const dynamic = "force-dynamic";

export default async function ProposalSuccessPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const proposal = await loadProposalByToken(token);
  if (!proposal) notFound();

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">You&apos;re in.</h1>
        <p className="text-muted-foreground">
          Your workspace is going live now. Check your inbox for the admin link — it&apos;ll arrive
          within a minute.
        </p>
        <p className="text-sm text-muted-foreground">
          Receipt and subscription details: Stripe just emailed you.
        </p>
      </div>
    </main>
  );
}
