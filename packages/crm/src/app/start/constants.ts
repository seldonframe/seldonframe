// packages/crm/src/app/start/constants.ts
// Shared constants for the /start live-sell checkout.
// Kept in a separate (non-"use server") file so they can be imported
// on both server and client without Next.js rejecting the export.

/** $397/mo in cents */
export const LIVE_SELL_MONTHLY_PRICE_CENTS = 39700;

/** Seldon Studio's canonical agency org id */
export const SELDON_STUDIO_ORG_ID = "e1b16f47-d90a-4f3f-adb5-484b639ff0ed";
