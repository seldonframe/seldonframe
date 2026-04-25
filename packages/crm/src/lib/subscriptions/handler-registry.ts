// Handler registry — global map of handlerName → SubscriptionHandler.
//
// Shipped in SLICE 1 PR 2 Commit 3. Each block that declares a
// subscription registers its handler function here at module-load
// time (e.g., `crm.subscriptions.ts` does
// `registerSubscriptionHandler("logActivityOnBookingCreate", fn)`
// at import). The cron dispatcher reads from this registry to look
// up the handler by name when processing a delivery.
//
// Why a module-level map instead of an install-time plugin registry:
//   - BLOCK.md declares the handler NAME; the module exports the
//     handler FUNCTION. The name ↔ function binding is a coding
//     invariant, not a runtime-configurable plugin.
//   - Subscription deliveries are workspace-scoped (via orgId), but
//     handler FUNCTIONS are global — same function runs for every
//     workspace. No per-workspace handler variation in v1.
//   - Module import time means the registry is populated before the
//     first cron tick runs (Vercel's Node runtime imports route
//     modules at boot).
//
// C7 ships the first adopter (CRM's logActivityOnBookingCreate)
// which side-effect-registers itself via an import from the cron
// route. Future blocks follow the same pattern.

import type { SubscriptionHandler } from "./dispatcher";

const registry = new Map<string, SubscriptionHandler>();

export function registerSubscriptionHandler(
  name: string,
  handler: SubscriptionHandler,
): void {
  if (registry.has(name)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[subscription-handler-registry] handler "${name}" already registered — overwriting`,
    );
  }
  registry.set(name, handler);
}

/**
 * Returns the global handler map. The cron dispatcher reads this
 * once per tick. Tests pass their own Map — they don't mutate this
 * global registry.
 */
export function getSubscriptionHandlerRegistry(): Map<string, SubscriptionHandler> {
  return registry;
}

/**
 * TEST ONLY. Clears registrations so tests can reset state. Named
 * with an underscore prefix to discourage production callers.
 */
export function _clearSubscriptionHandlerRegistryForTests(): void {
  registry.clear();
}
