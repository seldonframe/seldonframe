// Bootstrap module — side-effect-imported by the cron route to
// populate the subscription handler registry before the first tick.
//
// Each block that declares a subscription registers its handler(s)
// here via an import statement. C3 ships the wiring (this file);
// C7 adds the first real adopter (CRM's logActivityOnBookingCreate).
//
// The registration strategy is deliberately boring: every block's
// subscriptions live in a single module (e.g.,
// `packages/crm/src/lib/blocks-subscriptions/crm.ts`) that
// side-effect-calls registerSubscriptionHandler at import. This
// file imports each of those so the cron route has a single entry
// point.
//
// Intentionally empty on C3. Populated in C7.

export {};
