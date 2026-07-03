// packages/crm/src/lib/marketplace/taste/apply-taste-preferences.ts
//
// Pure merge+clamp for the seller taste-budget action (Task 10). Kept
// separate from the "use server" action so it unit-tests without the
// server-action boundary / DB / auth.

import type { ListingSellerPreferences } from "@/db/schema/marketplace";
import { resolveTasteBudget } from "./taste-policy";

/** Pure merge+clamp for the seller taste-budget action. Always returns a
 *  fully-populated object (both fields), clamped to platform ceilings. */
export function applyTastePreferencesUpdate(
  current: ListingSellerPreferences | null,
  patch: { tasteCallsPerVisitor?: number; tasteDailyCap?: number },
): ListingSellerPreferences {
  const merged = { ...(current ?? {}), ...patch };
  const budget = resolveTasteBudget(merged);
  return { tasteCallsPerVisitor: budget.visitorLimit, tasteDailyCap: budget.dailyCap };
}
