"use server";

// 2026-07-04 — Task 9 of the win-ladder + SeldonChat plan. Split out from
// share.ts so this "use server" file exports ONLY an async function
// (scripts/check-use-server.sh's rule) — share.ts's buildShareAssets is
// already async-only, but keeping the server action in its own module
// avoids ever having to think about it again as share.ts grows.

import { getOrgId } from "@/lib/auth/helpers";
import { markShareUsed } from "@/lib/activation/ladder-server";

/**
 * Fired by the share row on first copy/download of the site link or QR
 * code. Stamps `settings.activation.shareUsedAt` for the current org (via
 * Task 6's markShareUsed, which is itself once-only / idempotent) so the
 * win-ladder's go_live step can mark itself done from share activity alone.
 */
export async function markShareUsedAction(): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;
  await markShareUsed(orgId);
}
