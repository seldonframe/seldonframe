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

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";

/**
 * Three-in-one onboarding stamp. After an agency operator successfully
 * creates their first client workspace via /clients/new, run this to:
 *
 *   1. organizations.soulCompletedAt := NOW() on the operator's OWN org
 *      (only if currently NULL). Stops proxy.ts:261 from redirecting every
 *      authed page back to /clients/new.
 *
 *   2. organizations.settings.welcomeShown := true on the operator's OWN
 *      org. Stops proxy.ts:265 from redirecting them to /welcome — they
 *      just watched the SSE LIVE BUILD checklist tick green, they don't
 *      need a second "you have a soul!" explainer screen. Skips a step.
 *
 *   3. users.planId := 'free' (only if currently NULL). Stops the
 *      plan-gate at proxy.ts:74 from redirecting them to /pricing on every
 *      /dashboard load. The Free tier is the safe default — they can
 *      upgrade later from /settings/billing. Without this, every new agency
 *      operator would hit a paywall the instant they tried to enter the
 *      dashboard they just built.
 *
 * All three writes are idempotent (the WHERE clauses filter out already-
 * set rows), so it's safe to call this after every workspace creation.
 * Pure DB call, no auth gating — the caller is responsible for verifying
 * the request belongs to this operator.
 *
 * IMPORTANT: this updates the operator's USER row, not their org row, for
 * planId. The schema stores planId on users.plan_id (not organizations).
 * So we resolve userId by joining org -> owner. We accept an explicit
 * operatorUserId arg to keep this a pure DB helper.
 */
export async function markOperatorOnboarded(
  operatorOrgId: string,
  operatorUserId?: string,
): Promise<void> {
  if (!operatorOrgId) return;

  await db
    .update(organizations)
    .set({
      soulCompletedAt: new Date(),
      // Merge welcomeShown=true into the existing settings JSON object so
      // we don't clobber any other keys the org has accumulated. Drizzle's
      // sql tag handles the JSON merge safely with COALESCE for new orgs
      // where settings is still NULL.
      settings: sql`COALESCE(${organizations.settings}, '{}'::jsonb) || '{"welcomeShown": true}'::jsonb`,
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

  if (operatorUserId) {
    await db
      .update(users)
      .set({ planId: "free", updatedAt: new Date() })
      .where(and(eq(users.id, operatorUserId), isNull(users.planId)));
  }
}
