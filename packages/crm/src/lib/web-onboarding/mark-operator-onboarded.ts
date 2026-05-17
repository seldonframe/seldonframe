// packages/crm/src/lib/web-onboarding/mark-operator-onboarded.ts
//
// 2026-05-17 — fixes the proxy.ts:261 redirect loop that bounced agency
// operators back to /clients/new after every successful workspace creation.
//
// Background:
//   proxy.ts:261 redirects any authed non-public path to /clients/new when
//   isSoulCompleted is false. lib/auth/config.ts:289-294 derives that flag
//   from the soulCompletedAt timestamp on the OPERATOR'S OWN organization.
//   For solo operators that timestamp gets stamped during their own org's
//   onboarding flow. For AGENCY operators — who sign up and then create
//   client workspaces as separate orgs — their own org's soulCompletedAt
//   stays NULL forever, so the redirect gate fires forever even though they
//   have working workspaces. The result was that after /clients/new wrapped
//   up, the browser navigated to /dashboard and got 307'd straight back to
//   /clients/new with no error — looked exactly like the build had silently
//   failed.
//
// Fix:
//   Run this helper at the end of a successful workspace creation. It sets
//   soulCompletedAt on the operator's own org IFF it isn't already set, so
//   the next JWT refresh (config.ts:281+ re-reads the org row on every
//   request) flips token.soulCompleted to true and proxy.ts lets the
//   navigation through.
//
// Why this lives in lib/web-onboarding (not lib/soul):
//   The "first client workspace created" event is what redefines "onboarded"
//   for agency operators. lib/soul/actions.ts already stamps soulCompletedAt
//   for the solo path. Keeping the two paths separate avoids accidental
//   coupling — neither knows about the other, both write the same column.

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";

/**
 * Stamp soulCompletedAt = NOW() on the operator's own org if it's currently
 * NULL. Idempotent: subsequent calls are no-ops (the WHERE clause filters
 * out already-stamped rows). Safe to call after every workspace creation.
 *
 * Pure DB call, no auth gating — the caller is responsible for verifying
 * the request belongs to this operator.
 */
export async function markOperatorOnboarded(operatorOrgId: string): Promise<void> {
  if (!operatorOrgId) return;

  await db
    .update(organizations)
    .set({
      soulCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(organizations.id, operatorOrgId),
        // Don't overwrite an existing onboarding timestamp — preserves the
        // original onboarding moment for any analytics that care about it.
        isNull(organizations.soulCompletedAt),
      ),
    );
}
