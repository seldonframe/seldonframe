// packages/crm/src/app/p/[token]/cancel/page.tsx
// 2026-05-19 — Proposal Builder. Post-Checkout cancel landing.
// No charge was made; the proposal remains active for 30 days.

import Link from "next/link";

export default async function ProposalCancelPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">No charge made.</h1>
        <p className="text-muted-foreground">
          You can come back anytime — your proposal stays live for 30 days.
        </p>
        <Link href={`/p/${token}`} className="text-primary hover:underline">
          ← Back to the proposal
        </Link>
      </div>
    </main>
  );
}
