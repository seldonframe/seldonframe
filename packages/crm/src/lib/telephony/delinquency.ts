// packages/crm/src/lib/telephony/delinquency.ts
//
// `delinquentSince` marker — spec 2026-07-01-voice-deploy-metered-billing,
// Task 6/7. Marks an sf_managed deployment as delinquent (rent unpaid past
// due) WITHOUT a migration: it rides the deployment's existing `customization`
// jsonb under a reserved runtime-internal key, mirroring the exact idiom
// lib/deployments/store.ts already uses for the schedule cron's
// `SCHEDULE_LAST_FIRED_KEY` (see markDeploymentScheduleFired). The reserved
// key is ignored by resolveDeploymentPersona (which only reads the typed
// persona fields), so this never leaks into the agent's persona.
//
// Lifecycle: Task 7 (the rent cron) STAMPS this when a deployment's monthly
// rent goes unpaid past the grace window (and, per the spec, suspends the
// builder's subaccount). This task's top-up auto-reactivate hook
// (wallet-webhook-apply.ts) CLEARS it once the builder tops up and the
// subaccount reactivates.
//
// Lazy DB imports (real path only) — mirrors every other store helper in this
// codebase so unit tests never touch Neon.

import type { Deployment } from "@/db/schema/deployments";
import type { DeploymentCustomization } from "@/lib/agents/persona/deployment-customization";

/** The reserved key under `deployments.customization` where the delinquency
 *  marker (an ISO timestamp) lives. `_`-prefixed + exported as a named
 *  constant, same convention as SCHEDULE_LAST_FIRED_KEY. */
export const DELINQUENT_SINCE_KEY = "_delinquentSince";

// ─── Pure reader ──────────────────────────────────────────────────────────────

/**
 * Read the `delinquentSince` ISO string off a deployment's `customization`
 * jsonb, or null if unset / not a string. Pure — no DB. Tolerant of a missing/
 * null customization column.
 */
export function getDelinquentSince(
  deployment: Pick<Deployment, "customization"> | { customization: unknown },
): string | null {
  const raw = (deployment.customization as Record<string, unknown> | null)?.[DELINQUENT_SINCE_KEY];
  return typeof raw === "string" && raw.trim() ? raw : null;
}

// ─── Store-level set / clear (org-scoped, additive) ──────────────────────────

/**
 * Stamp a deployment's `delinquentSince` marker (Task 7's rent cron calls
 * this once rent goes unpaid past the grace window). Additive: reads the
 * current customization, merges the marker over it (preserving every persona
 * field — same pattern as markDeploymentScheduleFired), and writes it back.
 * Idempotent in effect (re-stamping just rewrites the timestamp). Lazy DB
 * import (real path only).
 */
export async function setDelinquentSince(deploymentId: string, at: Date): Promise<void> {
  if (!deploymentId) return;
  const { db } = await import("@/db");
  const { deployments } = await import("@/db/schema/deployments");
  const { eq } = await import("drizzle-orm");

  const [row] = await db
    .select({ customization: deployments.customization })
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .limit(1);

  const current = (row?.customization ?? {}) as Record<string, unknown>;
  const next = { ...current, [DELINQUENT_SINCE_KEY]: at.toISOString() };

  await db
    .update(deployments)
    .set({ customization: next as Partial<DeploymentCustomization>, updatedAt: new Date() })
    .where(eq(deployments.id, deploymentId));
}

/**
 * Clear a deployment's `delinquentSince` marker (this task's top-up
 * auto-reactivate hook calls this once the builder's subaccount reactivates).
 * Additive removal: reads the current customization, drops ONLY the reserved
 * key, and writes the rest back untouched. A no-op (skips the write) when the
 * marker isn't set, so a redundant clear never bumps updatedAt for nothing.
 * Lazy DB import (real path only).
 */
export async function clearDelinquentSince(deploymentId: string): Promise<void> {
  if (!deploymentId) return;
  const { db } = await import("@/db");
  const { deployments } = await import("@/db/schema/deployments");
  const { eq } = await import("drizzle-orm");

  const [row] = await db
    .select({ customization: deployments.customization })
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .limit(1);

  const current = (row?.customization ?? {}) as Record<string, unknown>;
  if (!(DELINQUENT_SINCE_KEY in current)) return; // nothing to clear

  const { [DELINQUENT_SINCE_KEY]: _drop, ...rest } = current;
  await db
    .update(deployments)
    .set({ customization: rest as Partial<DeploymentCustomization>, updatedAt: new Date() })
    .where(eq(deployments.id, deploymentId));
}

// ─── Org-scoped lookup (the top-up reactivate hook's read side) ─────────────

/**
 * List the deployment ids for `orgId` that are `sf_managed` AND currently
 * carry a `delinquentSince` marker — the exact set the top-up auto-reactivate
 * hook needs to know "does this org have anything to reactivate/clear?"
 * before calling reactivateBuilderSubaccount. Matches on
 * `numberOrigin = 'sf_managed'` (a plain column) narrowed to this org
 * (builderOrgId), then filters in JS on the jsonb marker (a handful of rows
 * per org at most — no need for a jsonb index). Returns [] when none. Lazy DB
 * import (real path only).
 */
export async function listDelinquentSfManagedDeploymentIds(orgId: string): Promise<string[]> {
  if (!orgId) return [];
  const { db } = await import("@/db");
  const { deployments } = await import("@/db/schema/deployments");
  const { and, eq } = await import("drizzle-orm");

  const rows = await db
    .select({ id: deployments.id, customization: deployments.customization })
    .from(deployments)
    .where(
      and(
        eq(deployments.builderOrgId, orgId),
        eq(deployments.numberOrigin, "sf_managed"),
      ),
    );

  return rows.filter((r) => getDelinquentSince({ customization: r.customization })).map((r) => r.id);
}
