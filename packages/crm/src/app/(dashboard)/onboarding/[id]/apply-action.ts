// packages/crm/src/app/(dashboard)/onboarding/[id]/apply-action.ts
//
// 2026-06-04 — Onboarding T14. Server action: agency clicks "Apply all"
// on the change-plan review screen. Validates org ownership + status,
// runs the executor, flips both rows to "applied", and best-effort
// notifies the client their workspace is ready.

"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { changePlans, onboardingLinks } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { applyChangePlan, type ApplyChangePlanResult } from "@/lib/onboarding/execute-change-plan";
import type { ChangePlan as ChangePlanPayload } from "@/lib/onboarding/change-plan";

// ── result type ────────────────────────────────────────────────────────────────

export type ApplyChangePlanActionResult =
  | { ok: true; surfaces: ApplyChangePlanResult }
  | { ok: false; error: string };

// ── action ─────────────────────────────────────────────────────────────────────

/**
 * Apply a pending change plan to the workspace.
 *
 * Guards:
 *   1. getOrgId() — must have an active workspace session.
 *   2. Row must exist + belong to this org.
 *   3. status must be "pending_review" — idempotency: already-applied
 *      plans return an error so the UI can show "Already applied".
 *
 * On success:
 *   - Runs applyChangePlan (6 surfaces, each isolated — never aborts on
 *     one failure).
 *   - Flips change_plans.status → "applied", change_plans.applied_at → now.
 *   - Flips the org's onboarding_links row → "applied" (best-effort; the
 *     link row is found by orgId so we don't require the caller to pass
 *     the link id).
 *   - Best-effort client notification (wrapped — cannot throw).
 *   - Revalidates the review page so the UI reflects the new status.
 */
export async function applyChangePlanAction(
  planId: string,
): Promise<ApplyChangePlanActionResult> {
  // ── 1. auth ──────────────────────────────────────────────────────────────────
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  // ── 2. load + guard ──────────────────────────────────────────────────────────
  const [row] = await db
    .select()
    .from(changePlans)
    .where(and(eq(changePlans.id, planId), eq(changePlans.orgId, orgId)))
    .limit(1);

  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "pending_review") {
    return { ok: false, error: `already_${row.status}` };
  }

  // ── 3. execute ───────────────────────────────────────────────────────────────
  const surfaces = await applyChangePlan(orgId, row.plan as ChangePlanPayload);

  // ── 4. flip change_plans → applied ───────────────────────────────────────────
  await db
    .update(changePlans)
    .set({ status: "applied", appliedAt: new Date() })
    .where(eq(changePlans.id, planId));

  // ── 5. flip onboarding_links → applied (best-effort) ─────────────────────────
  try {
    await db
      .update(onboardingLinks)
      .set({ status: "applied" })
      .where(and(eq(onboardingLinks.orgId, orgId), eq(onboardingLinks.status, "submitted")));
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "apply_change_plan_link_flip_failed",
        planId,
        orgId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  // ── 6. best-effort client notification ────────────────────────────────────────
  // We don't have a direct "workspace is ready" email for the client-onboarding
  // flow yet; log the intent so it's traceable and can be wired when the email
  // template is available.
  try {
    console.log(
      JSON.stringify({
        event: "apply_change_plan_success",
        planId,
        orgId,
        surfaces: Object.fromEntries(
          Object.entries(surfaces).map(([k, v]) => [k, v.ok ? "ok" : v.error]),
        ),
      }),
    );
  } catch {
    // never throws
  }

  // ── 7. revalidate ─────────────────────────────────────────────────────────────
  revalidatePath(`/onboarding/${planId}`);

  return { ok: true, surfaces };
}
