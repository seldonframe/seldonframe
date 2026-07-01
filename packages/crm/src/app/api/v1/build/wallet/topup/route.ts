// POST /api/v1/build/wallet/topup — start a Stripe Checkout that funds the
// caller's prepaid wallet. Bearer-authed (wst_) so the CLI + agents can call it.
// Reuses the SHIPPED createWalletTopupCheckout (the only money-IN call; self-gates
// on SF_MARKETPLACE_BILLING + a Stripe key → inert otherwise). The per-run path
// never touches Stripe.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { createWalletTopupCheckout } from "@/lib/build/wallet-topup";
import { buildWalletTopupCheckoutDeps } from "@/lib/build/wallet-topup-deps";

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;
  if (!orgId) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { amountUsd?: unknown };
  const amountUsd = Number(body?.amountUsd);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return NextResponse.json({ ok: false, reason: "invalid_amount" }, { status: 400 });
  }
  const amountCents = Math.floor(amountUsd * 100);

  const result = await createWalletTopupCheckout(
    { orgId, amountCents },
    buildWalletTopupCheckoutDeps(),
  );

  if (result.ok && result.url) {
    return NextResponse.json({ ok: true, checkoutUrl: result.url });
  }
  // Flag off / no Stripe key / helper skip → inert, honest reason (no charge path).
  return NextResponse.json({ ok: false, reason: result.ok ? "no_checkout_url" : result.reason });
}
