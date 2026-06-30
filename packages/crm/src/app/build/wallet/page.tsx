// /build/wallet — the builder's prepaid wallet (spec 1ff09dcb, P2).
//
// A Stripe top-up funds a balance; every successful build run draws it down by a
// LEDGER decrement (no Stripe call per run). This page server-renders the current
// balance + a recent-transaction list and mounts the "Add funds" island
// (topUpWalletAction → Stripe Checkout). Logged-out visitors get a sign-in CTA
// (they may arrive from the success/cancel redirect). Money-safe: in dev (no
// Stripe key / flag off) the balance is just 0 and the top-up buttons surface a
// reason instead of charging.

import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Wallet, ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { walletTransactions } from "@/db/schema/wallet";
import { auth } from "@/auth";
import { getOrgId } from "@/lib/auth/helpers";
import { getWalletBalanceMicros } from "@/lib/build/wallet-store";
import { formatMicrosUsd } from "@/lib/build/wallet-format";
import { WalletTopupClient } from "@/components/build/wallet-topup-client";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const dynamic = "force-dynamic";

// Shared builder-surface SEO: canonical + OpenGraph (no `.md` twin — this is an
// authed wallet panel, not a discoverable content page).
export const metadata = buildPageMetadata({
  path: "/build/wallet",
  title: "Build wallet — SeldonFrame for Builders",
  description:
    "Top up a prepaid balance; every build run draws it down. Listing is free — you only pay on real usage.",
});

const KIND_LABEL: Record<string, string> = {
  topup: "Top-up",
  debit: "Run",
  earning: "Earning",
};

export default async function BuildWalletPage() {
  const session = await auth();
  const orgId = session?.user?.id ? await getOrgId() : null;

  const header = (
    <div className="space-y-2">
      <Link
        href="/build"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to the builder quickstart
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Build wallet</h1>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Top up a prepaid balance and every build run draws it down automatically.
        Listing is free — you only pay on real usage, and errored runs are never
        charged.
      </p>
    </div>
  );

  if (!orgId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
        {header}
        <div className="rounded-xl border bg-card p-8 text-center space-y-3">
          <Wallet className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">Sign in to manage your wallet</p>
          <p className="text-sm text-muted-foreground">
            Your first workspace is free. Sign in (or create one) and your wallet
            scopes to it automatically.
          </p>
          <Link
            href="/login?callbackUrl=/build/wallet"
            className="crm-button-primary inline-flex h-10 items-center px-5"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  // Test-mode wallet is the dev/default; a live wallet only exists once a live
  // top-up funds it. Read the test balance (the only one reachable in dev).
  const balanceMicros = await getWalletBalanceMicros(orgId, "test");
  const recent = await db
    .select({
      id: walletTransactions.id,
      kind: walletTransactions.kind,
      amountMicros: walletTransactions.amountMicros,
      runId: walletTransactions.runId,
      createdAt: walletTransactions.createdAt,
    })
    .from(walletTransactions)
    .where(eq(walletTransactions.orgId, orgId))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(20);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      {header}

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Current balance</p>
          <p className="text-3xl font-semibold tracking-tight text-foreground">
            {formatMicrosUsd(balanceMicros)}
          </p>
        </div>
        <WalletTopupClient />
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-3">
        <p className="text-sm font-medium text-foreground">Recent activity</p>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No transactions yet. Add funds to start running paid agents and tools.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((t) => {
              const isCredit = t.kind === "topup" || t.kind === "earning";
              return (
                <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-foreground">
                    {KIND_LABEL[t.kind] ?? t.kind}
                    {t.runId ? (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{t.runId}</span>
                    ) : null}
                  </span>
                  <span className={isCredit ? "text-emerald-500" : "text-muted-foreground"}>
                    {isCredit ? "+" : "−"}
                    {formatMicrosUsd(t.amountMicros)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
