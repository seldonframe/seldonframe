// Shared workspace resolver — maps a dialed E.164 number to the organization
// that owns it via its stored Twilio fromNumber. Used by:
//   - The Twilio voice webhook (replacing the inline resolveOrgByTwilioNumber)
//   - The OpenAI Realtime voice webhook (Phase 2 — per-workspace routing)
//
// matchWorkspaceByPhoneNumber is PURE (no DB) so it's fully unit-testable.
// resolveWorkspaceByPhoneNumber wraps it with the DB select.

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { toE164 } from "@/lib/sms/providers";

/**
 * Pure helper. Given an already-normalized E.164 number and a set of org rows,
 * returns the id of the first org whose stored Twilio fromNumber normalizes to
 * that number, or null if none matches.
 */
export function matchWorkspaceByPhoneNumber(
  e164: string,
  rows: Array<{ id: string; integrations: unknown }>,
): string | null {
  for (const row of rows) {
    const integrations = (row.integrations ?? {}) as Record<string, unknown>;
    const twilio = (integrations.twilio ?? {}) as { fromNumber?: string };
    const stored = twilio.fromNumber?.trim() ?? "";
    if (stored && toE164(stored) === e164) {
      return row.id;
    }
  }
  return null;
}

/**
 * DB-backed resolver. Selects all org rows and delegates to
 * matchWorkspaceByPhoneNumber. Returns the org id or null.
 */
export async function resolveWorkspaceByPhoneNumber(e164: string): Promise<string | null> {
  const rows = await db
    .select({
      id: organizations.id,
      integrations: organizations.integrations,
    })
    .from(organizations);

  return matchWorkspaceByPhoneNumber(e164, rows);
}
