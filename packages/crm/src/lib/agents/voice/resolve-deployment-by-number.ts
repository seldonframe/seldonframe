// ICP-3 — deployment resolver: maps a dialed E.164 number to the ACTIVE
// deployment that owns it. This is the NEW, strictly-additive sibling of
// resolve-workspace-by-number.ts: the voice webhook tries this FIRST, and only
// falls through to the (unchanged) workspace resolver when no active deployment
// matches the dialed number.
//
// matchDeploymentByPhoneNumber is PURE (no DB) so it's fully unit-testable.
// resolveDeploymentByNumber wraps it with the DB select. Mirrors the workspace
// resolver's shape exactly (pure matcher + DB-backed resolver + injectable deps)
// so the two read identically.
//
// The deployments table has a partial UNIQUE index on phone_number (where NOT
// NULL), so at most one row carries a given number; combined with the
// status='active' filter here, at most one ACTIVE deployment matches.

import { eq } from "drizzle-orm";

import { toE164 } from "@/lib/sms/providers";
import type {
  DeploymentClientContext,
  BookingMode,
} from "@/db/schema/deployments";

/** The slice of a deployments row this resolver needs. */
export type DeploymentNumberRow = {
  id: string;
  builderOrgId: string;
  agentTemplateId: string;
  /** The SMB client this deployment serves — the deployed agent speaks AS this
   *  business (composeVoicePersona identity), so the voice path needs it. */
  clientName: string;
  /** The client's captured business context (narrow soul + FAQ). Drives the
   *  persona facts so the agent speaks the CLIENT's services/FAQ. Nullable —
   *  absent → name-only fallback. */
  clientContext: DeploymentClientContext | null;
  /** How this deployment books (native | external_link | api_mcp | cal_com).
   *  Threaded into ctx.booking so the deployed agent's tools branch correctly. */
  bookingMode: BookingMode;
  /** The client's own booking URL — only meaningful for external_link. */
  externalBookingUrl: string | null;
  phoneNumber: string | null;
  status: string;
};

/**
 * Pure helper. Given an already-normalized E.164 number and a set of deployment
 * rows, returns the first ACTIVE deployment whose stored phone number normalizes
 * to that number, or null if none matches. Non-active rows are ignored even when
 * their number matches (a draft/paused deployment must never answer a call).
 */
export function matchDeploymentByPhoneNumber<T extends DeploymentNumberRow>(
  e164: string,
  rows: T[],
): T | null {
  for (const row of rows) {
    if (row.status !== "active") continue;
    const stored = row.phoneNumber?.trim() ?? "";
    if (stored && toE164(stored) === e164) {
      return row;
    }
  }
  return null;
}

/** Injectable DB seam — DI over drizzle-chain mocking (repo convention) so the
 *  match/no-match/normalization paths are unit-tested without a real Postgres. */
export type ResolveDeploymentDeps = {
  /** Load all ACTIVE deployment rows (the pure matcher does the number match). */
  loadActiveDeployments: () => Promise<DeploymentNumberRow[]>;
};

function buildDefaultDeps(): ResolveDeploymentDeps {
  return {
    loadActiveDeployments: async () => {
      // Lazy imports so unit tests that inject deps never touch Neon.
      const { db } = await import("@/db");
      const { deployments } = await import("@/db/schema/deployments");
      const rows = await db
        .select({
          id: deployments.id,
          builderOrgId: deployments.builderOrgId,
          agentTemplateId: deployments.agentTemplateId,
          clientName: deployments.clientName,
          clientContext: deployments.clientContext,
          bookingMode: deployments.bookingMode,
          externalBookingUrl: deployments.externalBookingUrl,
          phoneNumber: deployments.phoneNumber,
          status: deployments.status,
        })
        .from(deployments)
        .where(eq(deployments.status, "active"));
      return rows;
    },
  };
}

/**
 * DB-backed resolver. Normalizes the dialed number to E.164, selects the active
 * deployment rows, and delegates to matchDeploymentByPhoneNumber. Returns the
 * matched deployment row or null.
 *
 * Returns null WITHOUT touching the DB when the dialed number is null/blank —
 * the webhook can't have matched a deployment in that case, and we want the
 * existing workspace fall-through to run untouched.
 */
export async function resolveDeploymentByNumber(
  dialedNumber: string | null,
  deps: ResolveDeploymentDeps = buildDefaultDeps(),
): Promise<DeploymentNumberRow | null> {
  const trimmed = dialedNumber?.trim() ?? "";
  if (!trimmed) return null;

  const e164 = toE164(trimmed);
  if (!e164) return null;

  const rows = await deps.loadActiveDeployments();
  return matchDeploymentByPhoneNumber(e164, rows);
}
