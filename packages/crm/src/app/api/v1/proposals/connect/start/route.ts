// packages/crm/src/app/api/v1/proposals/connect/start/route.ts
// 2026-05-20 — Proposal Builder. Idempotent Stripe Connect Express
// onboarding start. Returns a Stripe AccountLink URL for the operator.
//
// REUSE LOGIC (prevents duplicate Stripe accounts per org):
// 1. Look up the agency's existing stripe_connections row.
// 2. If found — retrieve the account from Stripe to confirm it still
//    exists and is not terminal-rejected.
//    a. If alive + not rejected → reuse: build a fresh AccountLink
//       for the EXISTING account and return it.
//    b. If Stripe returns 404 (account deleted in dashboard) OR the
//       account has a terminal requirements.disabled_reason → fall
//       through to create-new.
//    c. Any other Stripe error → surface a structured 400.
// 3. If no row (or fell through from step 2) → stripe.accounts.create
//    → persist → build AccountLink.
//
// ?reset=1 query param: forces create-new even when a row exists
// (operator explicitly wants a fresh account, e.g., they rejected
// the prior one and want to start over).
//
// Returns { url, accountId, reused: boolean }.

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { stripeConnections, users } from "@/db/schema";
import {
  buildAccountLinkParams,
  buildConnectAccountParams,
  getStripeClient,
} from "@/lib/proposals/stripe-connect";

export const runtime = "nodejs";

// Terminal rejection reasons from Stripe — these accounts can never be
// reactivated; we must create a fresh one.
const TERMINAL_DISABLED_REASONS = new Set([
  "rejected.fraud",
  "rejected.terms_of_service",
  "rejected.listed",
  "rejected.other",
]);

function isTerminallyRejected(account: Stripe.Account): boolean {
  const reason = account.requirements?.disabled_reason;
  return Boolean(reason && TERMINAL_DISABLED_REASONS.has(reason));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 500 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";

  // Check ?reset=1 — operator explicitly wants a fresh account.
  const { searchParams } = new URL(request.url);
  const forceReset = searchParams.get("reset") === "1";

  // ─── Step 1: look up existing stripe_connections row ────────────────────
  const existingRows = await db
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.orgId, user.orgId))
    .limit(1);

  let accountId: string | null = null;
  let reused = false;

  if (existingRows.length > 0 && !forceReset) {
    const row = existingRows[0];

    // ─── Step 2: try to reuse the existing Stripe account ─────────────────
    let existing: Stripe.Account | null = null;
    try {
      existing = await stripe.accounts.retrieve(row.stripeAccountId);
    } catch (err) {
      const stripeErr = err as Stripe.errors.StripeError;
      if (stripeErr.statusCode === 404 || stripeErr.code === "account_invalid") {
        // Account was deleted in Stripe Dashboard — fall through to create.
        console.info(
          "[proposals/connect/start] existing account not found in Stripe, will create new",
          { stripeAccountId: row.stripeAccountId, orgId: user.orgId },
        );
      } else {
        // Unexpected error — surface it.
        console.error("[proposals/connect/start] stripe.accounts.retrieve failed", {
          type: stripeErr.type,
          code: stripeErr.code,
          message: stripeErr.message,
          requestId: stripeErr.requestId,
        });
        return NextResponse.json(
          {
            error: "stripe_account_retrieve_failed",
            message: stripeErr.message ?? "Stripe rejected the account retrieval",
            type: stripeErr.type ?? "unknown",
          },
          { status: 400 },
        );
      }
    }

    if (existing && !isTerminallyRejected(existing)) {
      // Account exists and is not permanently rejected → reuse it.
      accountId = existing.id;
      reused = true;
    }
    // else: fall through to create-new below.
  }

  // ─── Step 3: create a new account if needed ──────────────────────────────
  if (!accountId) {
    let newAccount: Stripe.Account;
    try {
      newAccount = await stripe.accounts.create(
        buildConnectAccountParams({
          agencyName: user.agencyProfile.name ?? user.name,
          agencyEmail: user.email,
        }),
      );
    } catch (err) {
      const stripeErr = err as Stripe.errors.StripeError;
      console.error("[proposals/connect/start] stripe.accounts.create failed", {
        type: stripeErr.type,
        code: stripeErr.code,
        message: stripeErr.message,
        requestId: stripeErr.requestId,
      });
      return NextResponse.json(
        {
          error: "stripe_account_creation_failed",
          message: stripeErr.message ?? "Stripe rejected the request",
          type: stripeErr.type ?? "unknown",
          help: stripeErr.message?.includes("platform-profile")
            ? "Complete your Stripe Connect platform profile at https://dashboard.stripe.com/settings/connect/platform-profile before creating accounts."
            : undefined,
        },
        { status: 400 },
      );
    }

    accountId = newAccount.id;

    // Persist: SELECT-then-UPDATE-or-INSERT (org_id has no UNIQUE constraint).
    if (existingRows.length > 0) {
      await db
        .update(stripeConnections)
        .set({ stripeAccountId: accountId, isActive: false, updatedAt: new Date() })
        .where(eq(stripeConnections.id, existingRows[0].id));
    } else {
      await db.insert(stripeConnections).values({
        orgId: user.orgId,
        stripeAccountId: accountId,
        isActive: false,
      });
    }
  }

  // ─── Step 4: build an AccountLink for whichever account we're using ──────
  let link: Stripe.AccountLink;
  try {
    link = await stripe.accountLinks.create(
      buildAccountLinkParams({ stripeAccountId: accountId, baseUrl }),
    );
  } catch (err) {
    const stripeErr = err as Stripe.errors.StripeError;
    console.error("[proposals/connect/start] stripe.accountLinks.create failed", {
      type: stripeErr.type,
      code: stripeErr.code,
      message: stripeErr.message,
    });
    return NextResponse.json(
      {
        error: "stripe_account_link_failed",
        message: stripeErr.message ?? "Stripe rejected the onboarding link request",
        type: stripeErr.type ?? "unknown",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ url: link.url, accountId, reused });
}
